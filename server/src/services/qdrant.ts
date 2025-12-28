import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../utils/config.js';
import type { QdrantSearchResult, QdrantVideo } from '../types/index.js';

/**
 * Qdrant Client for HearSight (READ-ONLY)
 * All write operations are handled by pyvideotrans
 */
export class VideoQdrantClient {
  private client: QdrantClient;
  private collectionChunks: string;
  private collectionMetadata: string;

  constructor(
    url: string = config.qdrantUrl,
    apiKey?: string,
    collectionPrefix: string = 'video'
  ) {
    this.client = new QdrantClient({
      url,
      apiKey: apiKey || config.qdrantApiKey,
    });
    this.collectionChunks = `${collectionPrefix}_chunks`;
    this.collectionMetadata = `${collectionPrefix}_metadata`;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const collections = await this.client.getCollections();
      console.log(`✅ Qdrant connected, found ${collections.collections.length} collections`);
      return true;
    } catch (error) {
      console.warn('⚠️ Qdrant connection failed:', error);
      return false;
    }
  }

  async searchSimilar(
    queryVector: number[],
    limit: number = 5,
    scoreThreshold: number = 0.7,
    filterConditions?: { language?: string; source_type?: string; video_id?: string }
  ): Promise<QdrantSearchResult[]> {
    try {
      // Build filter
      const mustConditions: Array<{
        key: string;
        match: { value: string };
      }> = [];

      if (filterConditions?.language) {
        mustConditions.push({
          key: 'language',
          match: { value: filterConditions.language },
        });
      }
      if (filterConditions?.source_type) {
        mustConditions.push({
          key: 'source_type',
          match: { value: filterConditions.source_type },
        });
      }
      if (filterConditions?.video_id) {
        mustConditions.push({
          key: 'video_id',
          match: { value: filterConditions.video_id },
        });
      }

      const results = await this.client.search(this.collectionChunks, {
        vector: queryVector,
        limit,
        score_threshold: scoreThreshold,
        filter: mustConditions.length > 0 ? { must: mustConditions } : undefined,
      });

      return results.map(hit => ({
        chunk_id: String(hit.id),
        score: hit.score,
        chunk_text: (hit.payload?.chunk_text as string) || '',
        paragraph_summary: (hit.payload?.paragraph_summary as string) || null,
        video_title: (hit.payload?.video_title as string) || '',
        video_path: (hit.payload?.video_path as string) || null,
        video_id: (hit.payload?.video_id as string) || null,
        language: (hit.payload?.language as string) || '',
        start_time: (hit.payload?.start_time as number) || 0,
        end_time: (hit.payload?.end_time as number) || 0,
        source_type: (hit.payload?.source_type as string) || '',
      }));
    } catch (error) {
      console.error('Qdrant search failed:', error);
      return [];
    }
  }

  async listAllVideos(): Promise<QdrantVideo[]> {
    try {
      const results = await this.client.scroll(this.collectionMetadata, {
        limit: 1000,
        with_payload: true,
        with_vector: false,
      });

      // 过滤掉 folder_registry 类型的记录
      const videoPoints = results.points.filter(point => {
        const payload = point.payload || {};
        return payload.type !== 'folder_registry';
      });

      return videoPoints.map(point => {
        const payload = point.payload || {};
        return {
          video_id: (payload.video_id as string) || String(point.id),
          video_path: (payload.video_path as string) || null,
          video_title: (payload.video_title as string) || null,
          topic: (payload.video_title as string) || null,
          video_summary: (payload.video_summary as string) || null,
          total_segments: (payload.total_segments as number) || 0,
          total_duration: (payload.total_duration as number) || 0,
          language: (payload.language as string) || '',
          source_type: (payload.source_type as string) || '',
          folder: (payload.folder as string) || '未分类',
          folder_id: (payload.folder_id as string) || null,
          thumbnail_url: (payload.thumbnail_url as string) || null,
        };
      });
    } catch (error) {
      console.error('Failed to list videos:', error);
      return [];
    }
  }

  /**
   * 获取视频的分句数和时长统计（从 chunks collection）
   */
  async getVideoStats(videoId: string): Promise<{ segment_count: number; total_duration: number }> {
    try {
      const results = await this.client.scroll(this.collectionChunks, {
        filter: {
          must: [{ key: 'video_id', match: { value: videoId } }],
        },
        limit: 1000,
        with_payload: true,
        with_vector: false,
      });

      const segments = results.points;
      let maxEndTime = 0;

      for (const point of segments) {
        const endTime = (point.payload?.end_time as number) || 0;
        if (endTime > maxEndTime) {
          maxEndTime = endTime;
        }
      }

      return {
        segment_count: segments.length,
        total_duration: maxEndTime * 1000, // 转换为毫秒
      };
    } catch (error) {
      console.error('Failed to get video stats:', error);
      return { segment_count: 0, total_duration: 0 };
    }
  }

  /**
   * 批量获取多个视频的统计信息
   */
  async getVideosWithStats(): Promise<QdrantVideo[]> {
    try {
      const videos = await this.listAllVideos();

      // 并行获取每个视频的统计信息
      const videosWithStats = await Promise.all(
        videos.map(async (video) => {
          const stats = await this.getVideoStats(video.video_id);
          return {
            ...video,
            total_segments: stats.segment_count,
            total_duration: stats.total_duration,
          };
        })
      );

      return videosWithStats;
    } catch (error) {
      console.error('Failed to get videos with stats:', error);
      return [];
    }
  }

  async getVideoParagraphsByVideoId(videoId: string): Promise<{
    media_path: string | null;
    static_url: string | null;
    segments: Array<{
      index: number;
      spk_id: null;
      sentence: string;
      start_time: number;
      end_time: number;
    }>;
    video_summary: string;
    summary: {
      topic: string;
      summary: string;
      paragraph_count: number;
      total_duration: number;
    };
  } | null> {
    try {
      // Get metadata
      const metadataResults = await this.client.scroll(this.collectionMetadata, {
        filter: {
          must: [{ key: 'video_id', match: { value: videoId } }],
        },
        limit: 1,
        with_payload: true,
        with_vector: false,
      });

      let videoSummary = '';
      let videoPath: string | null = null;
      let videoTitle: string | null = null;

      if (metadataResults.points.length > 0) {
        const payload = metadataResults.points[0].payload || {};
        videoSummary = (payload.video_summary as string) || '';
        videoPath = (payload.video_path as string) || null;
        videoTitle = (payload.video_title as string) || null;
      }

      // Get chunks
      const chunksResults = await this.client.scroll(this.collectionChunks, {
        filter: {
          must: [{ key: 'video_id', match: { value: videoId } }],
        },
        limit: 1000,
        with_payload: true,
        with_vector: false,
      });

      if (chunksResults.points.length === 0) {
        return null;
      }

      // Build segments (convert seconds to milliseconds)
      const segments = chunksResults.points.map((point, idx) => {
        const payload = point.payload || {};
        const startSec = (payload.start_time as number) || 0;
        const endSec = (payload.end_time as number) || 0;

        return {
          index: idx,
          spk_id: null,
          sentence: (payload.chunk_text as string) || '',
          start_time: startSec * 1000,
          end_time: endSec * 1000,
        };
      });

      // Sort by start_time
      segments.sort((a, b) => a.start_time - b.start_time);
      segments.forEach((seg, idx) => { seg.index = idx; });

      // Build paragraph summaries
      const summaries = chunksResults.points
        .filter(p => p.payload?.paragraph_summary)
        .map(p => ({
          start_time: ((p.payload?.start_time as number) || 0) * 1000,
          end_time: ((p.payload?.end_time as number) || 0) * 1000,
          text: (p.payload?.chunk_text as string) || '',
          summary: (p.payload?.paragraph_summary as string) || '',
        }));

      // Build video summary text
      let videoSummaryText = videoSummary;
      if (!videoSummaryText && summaries.length > 0) {
        videoSummaryText = summaries
          .map((s, i) => `**时间段 ${i + 1}** (${(s.start_time / 1000).toFixed(1)}s - ${(s.end_time / 1000).toFixed(1)}s)\n${s.summary}`)
          .join('\n\n');
      }
      if (!videoSummaryText) {
        videoSummaryText = `该视频共 ${segments.length} 个片段，暂无详细摘要`;
      }

      return {
        media_path: videoPath,
        static_url: videoPath, // Will be processed by OSS service if needed
        segments,
        video_summary: videoSummaryText,
        summary: {
          topic: videoTitle || '',
          summary: `共 ${segments.length} 个片段`,
          paragraph_count: summaries.length,
          total_duration: segments.length > 0 ? segments[segments.length - 1].end_time : 0,
        },
      };
    } catch (error) {
      console.error('Failed to get video paragraphs:', error);
      return null;
    }
  }

  async getVideoSummary(videoId: string): Promise<string | null> {
    try {
      const results = await this.client.retrieve(this.collectionMetadata, {
        ids: [videoId],
      });

      if (results.length > 0) {
        return (results[0].payload?.video_summary as string) || null;
      }
      return null;
    } catch (error) {
      console.error('Failed to get video summary:', error);
      return null;
    }
  }

  async listFolders(): Promise<Array<{
    folder_id: string;
    name: string;
    video_count: number;
    parent_id: string | null;
  }>> {
    try {
      const FOLDER_REGISTRY_ID = '00000000-0000-0000-0000-000000000001';
      const results = await this.client.retrieve(this.collectionMetadata, {
        ids: [FOLDER_REGISTRY_ID],
        with_payload: true,
        with_vector: false,
      });

      if (results.length === 0) {
        return [];
      }

      const payload = results[0].payload || {};
      if (payload.type !== 'folder_registry') {
        return [];
      }

      const registryData = JSON.parse((payload.registry_data as string) || '{}');
      const folders = registryData.folders || [];

      // 动态计算每个文件夹的视频数量
      const videos = await this.listAllVideos();
      const counts: Record<string, number> = {};
      for (const video of videos) {
        const fid = video.folder_id || 'uncategorized';
        counts[fid] = (counts[fid] || 0) + 1;
      }

      // 更新每个文件夹的视频数量，确保 parent_id 字段存在
      for (const folder of folders) {
        folder.video_count = counts[folder.folder_id] || 0;
        if (folder.parent_id === undefined) {
          folder.parent_id = null;
        }
      }

      return folders;
    } catch (error) {
      console.error('Failed to list folders:', error);
      return [];
    }
  }

  // ==================== 文件夹管理方法 ====================

  async createFolder(name: string, parentId: string | null = null): Promise<string | null> {
    try {
      const FOLDER_REGISTRY_ID = '00000000-0000-0000-0000-000000000001';

      // Get existing folders
      const folders = await this.listFolders();

      // Check if name already exists under the same parent
      if (folders.some(f => f.name === name && f.parent_id === parentId)) {
        console.error('Folder name already exists under the same parent:', name);
        return null;
      }

      // If parentId is provided, check if parent exists
      if (parentId && !folders.some(f => f.folder_id === parentId)) {
        console.error('Parent folder not found:', parentId);
        return null;
      }

      // Generate new folder ID
      const folderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Add new folder
      folders.push({
        folder_id: folderId,
        name,
        video_count: 0,
        parent_id: parentId,
      });

      // Update folder registry
      await this.client.upsert(this.collectionMetadata, {
        wait: true,
        points: [{
          id: FOLDER_REGISTRY_ID,
          vector: new Array(1024).fill(0), // placeholder vector
          payload: {
            type: 'folder_registry',
            registry_data: JSON.stringify({ folders }),
          },
        }],
      });

      return folderId;
    } catch (error) {
      console.error('Failed to create folder:', error);
      return null;
    }
  }

  async updateFolderParent(folderId: string, newParentId: string | null): Promise<boolean> {
    try {
      const FOLDER_REGISTRY_ID = '00000000-0000-0000-0000-000000000001';

      // Get existing folders
      const folders = await this.listFolders();

      // Find folder to update
      const folderIndex = folders.findIndex(f => f.folder_id === folderId);
      if (folderIndex === -1) {
        console.error('Folder not found:', folderId);
        return false;
      }

      // Check for circular reference
      if (newParentId) {
        let currentId: string | null = newParentId;
        while (currentId) {
          if (currentId === folderId) {
            console.error('Circular reference detected');
            return false;
          }
          const parent = folders.find(f => f.folder_id === currentId);
          currentId = parent?.parent_id || null;
        }
      }

      // Update parent_id
      folders[folderIndex].parent_id = newParentId;

      // Update folder registry
      await this.client.upsert(this.collectionMetadata, {
        wait: true,
        points: [{
          id: FOLDER_REGISTRY_ID,
          vector: new Array(1024).fill(0),
          payload: {
            type: 'folder_registry',
            registry_data: JSON.stringify({ folders }),
          },
        }],
      });

      return true;
    } catch (error) {
      console.error('Failed to update folder parent:', error);
      return false;
    }
  }

  async renameFolder(folderId: string, newName: string): Promise<boolean> {
    try {
      const FOLDER_REGISTRY_ID = '00000000-0000-0000-0000-000000000001';

      // Get existing folders
      const folders = await this.listFolders();

      // Find folder to rename
      const folderIndex = folders.findIndex(f => f.folder_id === folderId);
      if (folderIndex === -1) {
        console.error('Folder not found:', folderId);
        return false;
      }

      // Check if new name already exists
      if (folders.some(f => f.name === newName && f.folder_id !== folderId)) {
        console.error('Folder name already exists:', newName);
        return false;
      }

      // Update folder name
      folders[folderIndex].name = newName;

      // Update folder registry
      await this.client.upsert(this.collectionMetadata, {
        wait: true,
        points: [{
          id: FOLDER_REGISTRY_ID,
          vector: new Array(1024).fill(0),
          payload: {
            type: 'folder_registry',
            registry_data: JSON.stringify({ folders }),
          },
        }],
      });

      return true;
    } catch (error) {
      console.error('Failed to rename folder:', error);
      return false;
    }
  }

  async deleteFolder(folderId: string): Promise<boolean> {
    try {
      const FOLDER_REGISTRY_ID = '00000000-0000-0000-0000-000000000001';

      // Get existing folders
      const folders = await this.listFolders();

      // Find folder to delete
      const folderIndex = folders.findIndex(f => f.folder_id === folderId);
      if (folderIndex === -1) {
        console.error('Folder not found:', folderId);
        return false;
      }

      // Remove folder
      folders.splice(folderIndex, 1);

      // Move videos in this folder to "未分类"
      // Update video metadata to remove folder_id
      const videos = await this.listAllVideos();
      for (const video of videos) {
        if (video.folder_id === folderId) {
          await this.assignVideoToFolder(video.video_id, null);
        }
      }

      // Update folder registry
      await this.client.upsert(this.collectionMetadata, {
        wait: true,
        points: [{
          id: FOLDER_REGISTRY_ID,
          vector: new Array(1024).fill(0),
          payload: {
            type: 'folder_registry',
            registry_data: JSON.stringify({ folders }),
          },
        }],
      });

      return true;
    } catch (error) {
      console.error('Failed to delete folder:', error);
      return false;
    }
  }

  async assignVideoToFolder(videoId: string, folderId: string | null): Promise<boolean> {
    try {
      // Find the video in metadata collection
      const results = await this.client.scroll(this.collectionMetadata, {
        filter: {
          must: [{ key: 'video_id', match: { value: videoId } }],
        },
        limit: 1,
        with_payload: true,
        with_vector: true,
      });

      if (results.points.length === 0) {
        console.error('Video not found:', videoId);
        return false;
      }

      const point = results.points[0];
      const payload = point.payload || {};

      // Update folder assignment
      const newPayload = {
        ...payload,
        folder_id: folderId,
        folder: folderId ? (await this.getFolderName(folderId)) : '未分类',
      };

      // Update the point
      await this.client.upsert(this.collectionMetadata, {
        wait: true,
        points: [{
          id: point.id,
          vector: point.vector as number[],
          payload: newPayload,
        }],
      });

      // Update folder video counts
      await this.updateFolderCounts();

      return true;
    } catch (error) {
      console.error('Failed to assign video to folder:', error);
      return false;
    }
  }

  async getFolderName(folderId: string): Promise<string> {
    const folders = await this.listFolders();
    const folder = folders.find(f => f.folder_id === folderId);
    return folder?.name || '未分类';
  }

  async updateFolderCounts(): Promise<void> {
    try {
      const FOLDER_REGISTRY_ID = '00000000-0000-0000-0000-000000000001';
      const folders = await this.listFolders();
      const videos = await this.listAllVideos();

      // Count videos per folder
      const counts: Record<string, number> = {};
      for (const video of videos) {
        const fid = video.folder_id || 'uncategorized';
        counts[fid] = (counts[fid] || 0) + 1;
      }

      // Update folder counts
      for (const folder of folders) {
        folder.video_count = counts[folder.folder_id] || 0;
      }

      // Update folder registry
      await this.client.upsert(this.collectionMetadata, {
        wait: true,
        points: [{
          id: FOLDER_REGISTRY_ID,
          vector: new Array(1024).fill(0),
          payload: {
            type: 'folder_registry',
            registry_data: JSON.stringify({ folders }),
          },
        }],
      });
    } catch (error) {
      console.error('Failed to update folder counts:', error);
    }
  }

  /**
   * 删除视频及其所有相关数据（从 Qdrant）
   * @param videoId 视频 ID
   * @returns 删除的 chunks 数量
   */
  async deleteVideo(videoId: string): Promise<{ deleted_chunks: number; deleted_metadata: boolean }> {
    try {
      // 1. 查找并删除 metadata collection 中的记录
      const metadataResults = await this.client.scroll(this.collectionMetadata, {
        filter: {
          must: [{ key: 'video_id', match: { value: videoId } }],
        },
        limit: 10,
        with_payload: false,
        with_vector: false,
      });

      let deletedMetadata = false;
      if (metadataResults.points.length > 0) {
        const metadataIds = metadataResults.points.map(p => p.id);
        await this.client.delete(this.collectionMetadata, {
          wait: true,
          points: metadataIds,
        });
        deletedMetadata = true;
        console.log(`Deleted ${metadataIds.length} metadata points for video ${videoId}`);
      }

      // 2. 查找并删除 chunks collection 中的所有相关记录
      const chunksResults = await this.client.scroll(this.collectionChunks, {
        filter: {
          must: [{ key: 'video_id', match: { value: videoId } }],
        },
        limit: 10000,
        with_payload: false,
        with_vector: false,
      });

      let deletedChunks = 0;
      if (chunksResults.points.length > 0) {
        const chunkIds = chunksResults.points.map(p => p.id);
        await this.client.delete(this.collectionChunks, {
          wait: true,
          points: chunkIds,
        });
        deletedChunks = chunkIds.length;
        console.log(`Deleted ${deletedChunks} chunk points for video ${videoId}`);
      }

      // 3. 更新文件夹计数
      await this.updateFolderCounts();

      return { deleted_chunks: deletedChunks, deleted_metadata: deletedMetadata };
    } catch (error) {
      console.error('Failed to delete video from Qdrant:', error);
      throw error;
    }
  }
}

// Singleton instance
let qdrantClient: VideoQdrantClient | null = null;

export function getQdrantClient(): VideoQdrantClient {
  if (!qdrantClient) {
    qdrantClient = new VideoQdrantClient();
  }
  return qdrantClient;
}
