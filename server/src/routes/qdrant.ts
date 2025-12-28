import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getQdrantClient } from '../services/qdrant.js';
import { getEmbeddingService } from '../services/embedding.js';
import { getLlmService } from '../services/llm.js';
import { getOssService } from '../services/oss.js';
import { prisma } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { optionalAuth } from '../utils/auth.js';

// 默认思维导图生成提示词
function getDefaultMindmapPrompt(): string {
  return `请根据以下视频内容，生成一个清晰、结构化的思维导图（Markdown 格式）：

要求：
1. 提取视频的主要主题作为根节点（一级标题，使用 #）
2. 识别2-5个核心分支作为二级标题（使用 ##）
3. 每个分支下列出2-4个关键要点作为三级标题（使用 ###）
4. 必要时可以添加四级标题（使用 ####）来展示更详细的内容
5. 使用中文输出
6. 保持层次清晰，逻辑连贯
7. 每个节点内容简洁明了，控制在10-20字以内

格式示例：
# 视频主题
## 核心分支1
### 要点1.1
### 要点1.2
## 核心分支2
### 要点2.1
### 要点2.2

请基于视频内容生成思维导图：`;
}

// Request schemas
const chatRequestSchema = z.object({
  query: z.string().min(1),
  session_id: z.string().optional(),
  n_results: z.number().default(5),
  score_threshold: z.number().default(0.7),
  language_filter: z.string().optional(),
  folder_id: z.string().optional(),
});

const searchRequestSchema = z.object({
  query: z.string().min(1),
  n_results: z.number().default(10),
  score_threshold: z.number().default(0.7),
  language_filter: z.string().optional(),
  folder_id: z.string().optional(),
});

export async function qdrantRoutes(fastify: FastifyInstance) {
  const qdrantClient = getQdrantClient();
  const embeddingService = getEmbeddingService();
  const llmService = getLlmService();
  const ossService = getOssService();

  // Health check
  fastify.get('/api/qdrant/health', async () => {
    const isHealthy = await qdrantClient.checkConnection();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      qdrant_url: process.env.QDRANT_URL || 'http://localhost:6333',
      rag_enabled: process.env.RAG_ENABLED !== 'false',
    };
  });

  // RAG Chat
  fastify.post('/api/qdrant/chat', {
    preHandler: optionalAuth,  // 可选认证，不强制登录
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = chatRequestSchema.parse(request.body);
    const sessionId = body.session_id || uuidv4();

    // 获取可选的用户 ID
    const userId = request.user ? parseInt(request.user.sub, 10) : null;

    // Check RAG enabled
    if (process.env.RAG_ENABLED === 'false') {
      return reply.status(503).send({ detail: 'Qdrant RAG is disabled' });
    }

    // Check Qdrant connection
    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({ detail: 'Cannot connect to Qdrant' });
    }

    // Generate query embedding
    const queryEmbedding = await embeddingService.embed(body.query);

    // Search Qdrant
    const results = await qdrantClient.searchSimilar(
      queryEmbedding,
      body.n_results,
      body.score_threshold,
      {
        language: body.language_filter,
      }
    );

    let answer: string;
    let references: Array<{
      chunk_text: string;
      score: number;
      metadata: {
        video_title: string;
        video_path: string | null;
        video_id: string | null;
        start_time: number;
        end_time: number;
        summary: string | null;
        language: string;
        source_type: string;
      };
    }> = [];

    if (results.length === 0) {
      answer = '抱歉，我在知识库中没有找到相关内容来回答您的问题。';
    } else {
      // Format RAG context and generate answer
      const ragContext = llmService.formatRagContext(results);
      answer = await llmService.chat(body.query, ragContext);

      // Format references
      references = results.map(r => ({
        chunk_text: r.chunk_text,
        score: r.score,
        metadata: {
          video_title: r.video_title,
          video_path: r.video_path,
          video_id: r.video_id,
          start_time: r.start_time,
          end_time: r.end_time,
          summary: r.paragraph_summary,
          language: r.language,
          source_type: r.source_type,
        },
      }));
    }

    // Save chat history (关联用户 ID，如果已登录)
    try {
      await prisma.chatHistory.create({
        data: {
          sessionId,
          userId,  // 可选用户关联
          role: 'user',
          content: body.query,
          metadata: null,
        },
      });

      await prisma.chatHistory.create({
        data: {
          sessionId,
          userId,  // 可选用户关联
          role: 'assistant',
          content: answer,
          metadata: { references } as any,
        },
      });
    } catch (error) {
      console.error('Failed to save chat history:', error);
    }

    return {
      answer,
      references,
      query: body.query,
      session_id: sessionId,
    };
  });

  // Search
  fastify.post('/api/qdrant/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = searchRequestSchema.parse(request.body);

    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({ detail: 'Cannot connect to Qdrant' });
    }

    const queryEmbedding = await embeddingService.embed(body.query);

    const results = await qdrantClient.searchSimilar(
      queryEmbedding,
      body.n_results,
      body.score_threshold,
      { language: body.language_filter }
    );

    return {
      results: results.map(r => ({
        chunk_id: r.chunk_id,
        video_title: r.video_title,
        chunk_text: r.chunk_text,
        summary: r.paragraph_summary,
        start_time: r.start_time,
        end_time: r.end_time,
        score: r.score,
        language: r.language,
        source_type: r.source_type,
      })),
    };
  });

  // List videos
  fastify.get('/api/qdrant/videos', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      force_refresh?: string;
      page?: string;
      page_size?: string;
      folder_id?: string;
    };

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size || '20', 10)));
    const folderId = query.folder_id;

    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({ detail: 'Qdrant connection unavailable' });
    }

    let videos = await qdrantClient.listAllVideos();

    // Filter by folder if specified
    if (folderId) {
      videos = videos.filter(v => v.folder_id === folderId);
    }

    // Generate signed URLs for thumbnails
    for (const video of videos) {
      if (video.thumbnail_url && ossService.isOssUrl(video.thumbnail_url)) {
        video.thumbnail_url = ossService.convertToSignedUrl(video.thumbnail_url, 86400);
      }
    }

    // Pagination
    const total = videos.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIdx = (page - 1) * pageSize;
    const paginatedVideos = videos.slice(startIdx, startIdx + pageSize);

    return {
      videos: paginatedVideos,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
      },
      cached: false,
    };
  });

  // Get video paragraphs by video_id
  fastify.get('/api/qdrant/videos/:video_id/paragraphs', async (request: FastifyRequest, reply: FastifyReply) => {
    const { video_id } = request.params as { video_id: string };

    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({ detail: 'Qdrant connection unavailable' });
    }

    const result = await qdrantClient.getVideoParagraphsByVideoId(video_id);

    if (!result) {
      return reply.status(404).send({ detail: `Video not found: ${video_id}` });
    }

    // Generate signed URL for video playback
    if (result.media_path && ossService.isOssUrl(result.media_path)) {
      result.static_url = ossService.convertToSignedUrl(result.media_path, 3600);
    }

    return result;
  });

  // List folders
  fastify.get('/api/qdrant/folders', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({ detail: 'Qdrant connection unavailable' });
    }

    const folders = await qdrantClient.listFolders();

    return {
      folders,
      count: folders.length,
      total: folders.length,
    };
  });

  // ==================== Mindmap API (存储在 PostgreSQL) ====================

  /**
   * GET /api/qdrant/videos/:video_id/mindmap - 获取视频思维导图
   */
  fastify.get('/api/qdrant/videos/:video_id/mindmap', async (request: FastifyRequest, reply: FastifyReply) => {
    const { video_id } = request.params as { video_id: string };
    const query = request.query as { auto_generate?: string };
    const autoGenerate = query.auto_generate !== 'false';

    // 从 PostgreSQL 查询
    const mindmap = await prisma.videoMindmap.findUnique({
      where: { videoId: video_id },
    });

    if (mindmap) {
      return {
        video_id,
        mind_map_markdown: mindmap.mindmapMarkdown,
        generated_at: mindmap.createdAt.toISOString(),
        updated_at: mindmap.updatedAt.toISOString(),
        version: mindmap.version,
        auto_generated: false,
      };
    }

    // No mindmap found
    if (!autoGenerate) {
      return reply.status(404).send({
        detail: 'Mind map not found for this video',
        code: 'MINDMAP_NOT_FOUND',
      });
    }

    // Auto-generate mindmap using LLM
    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({ detail: 'Qdrant connection unavailable' });
    }

    try {
      const videoData = await qdrantClient.getVideoParagraphsByVideoId(video_id);
      if (!videoData) {
        return reply.status(404).send({ detail: `Video not found: ${video_id}` });
      }

      // Build content for mindmap generation
      const segments = videoData.segments || [];
      let videoContent = '视频内容:\n';

      for (let i = 0; i < Math.min(segments.length, 50); i++) {
        const seg = segments[i];
        if (seg.sentence) {
          videoContent += `${i + 1}. ${seg.sentence}\n`;
        }
      }

      if (videoContent.length > 4000) {
        videoContent = videoContent.substring(0, 4000) + '\n...(内容过长，已截断)';
      }

      // 获取提示词配置
      let mindmapPrompt: string;
      try {
        const promptConfig = await prisma.systemConfig.findUnique({
          where: { configKey: 'mindmap_prompt' },
        });
        mindmapPrompt = promptConfig?.configValue || getDefaultMindmapPrompt();
      } catch {
        mindmapPrompt = getDefaultMindmapPrompt();
      }

      const mindmapMarkdown = await llmService.simpleChat([
        { role: 'system', content: '你是一个专业的思维导图生成助手，擅长从视频内容中提取关键信息并组织成清晰的思维导图结构。' },
        { role: 'user', content: `${mindmapPrompt}\n\n${videoContent}` },
      ]);

      // 保存到 PostgreSQL
      const newMindmap = await prisma.videoMindmap.create({
        data: {
          videoId: video_id,
          videoTitle: null,
          mindmapMarkdown,
          version: '1.0',
        },
      });

      return {
        video_id,
        mind_map_markdown: mindmapMarkdown,
        generated_at: newMindmap.createdAt.toISOString(),
        version: '1.0',
        auto_generated: true,
      };
    } catch (error: any) {
      console.error('Failed to generate mindmap:', error);
      return reply.status(500).send({
        detail: `Failed to generate mind map: ${error.message}`,
        code: 'MINDMAP_GENERATION_FAILED',
      });
    }
  });

  /**
   * PUT /api/qdrant/videos/:video_id/mindmap - 更新视频思维导图
   */
  fastify.put('/api/qdrant/videos/:video_id/mindmap', async (request: FastifyRequest, reply: FastifyReply) => {
    const { video_id } = request.params as { video_id: string };
    const body = request.body as { mind_map_markdown?: string; version?: string; video_title?: string };

    if (!body.mind_map_markdown || body.mind_map_markdown.trim().length === 0) {
      return reply.status(400).send({
        detail: '思维导图内容不能为空',
        code: 'EMPTY_MINDMAP',
      });
    }

    // 限制大小 (10MB)
    if (body.mind_map_markdown.length > 10 * 1024 * 1024) {
      return reply.status(400).send({
        detail: '思维导图内容超过最大限制 (10MB)',
        code: 'MINDMAP_TOO_LARGE',
      });
    }

    // upsert 到 PostgreSQL
    const mindmap = await prisma.videoMindmap.upsert({
      where: { videoId: video_id },
      update: {
        mindmapMarkdown: body.mind_map_markdown,
        version: body.version || '1.0',
        videoTitle: body.video_title,
      },
      create: {
        videoId: video_id,
        mindmapMarkdown: body.mind_map_markdown,
        version: body.version || '1.0',
        videoTitle: body.video_title,
      },
    });

    return {
      success: true,
      message: '思维导图已更新',
      updated_at: mindmap.updatedAt.toISOString(),
    };
  });

  /**
   * DELETE /api/qdrant/videos/:video_id/mindmap - 删除视频思维导图
   */
  fastify.delete('/api/qdrant/videos/:video_id/mindmap', async (request: FastifyRequest, reply: FastifyReply) => {
    const { video_id } = request.params as { video_id: string };

    const result = await prisma.videoMindmap.delete({
      where: { videoId: video_id },
    }).catch(() => null);

    if (!result) {
      return reply.status(404).send({
        detail: '思维导图不存在',
        code: 'MINDMAP_NOT_FOUND',
      });
    }

    return {
      success: true,
      message: '思维导图已删除',
    };
  });

  /**
   * POST /api/qdrant/videos/:video_id/mindmap/generate - 为视频生成思维导图
   */
  fastify.post('/api/qdrant/videos/:video_id/mindmap/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { video_id } = request.params as { video_id: string };
    const body = request.body as { save?: boolean; overwrite?: boolean };
    const shouldSave = body.save !== false; // 默认保存
    const overwrite = body.overwrite === true; // 默认不覆盖

    // 检查是否已存在
    if (!overwrite) {
      const existing = await prisma.videoMindmap.findUnique({
        where: { videoId: video_id },
      });
      if (existing) {
        return {
          video_id,
          mind_map_markdown: existing.mindmapMarkdown,
          generated_at: existing.createdAt.toISOString(),
          version: existing.version,
          saved: false,
          message: '思维导图已存在，使用 overwrite=true 强制重新生成',
        };
      }
    }

    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({ detail: 'Qdrant connection unavailable' });
    }

    try {
      // 获取视频内容
      const videoData = await qdrantClient.getVideoParagraphsByVideoId(video_id);
      if (!videoData) {
        return reply.status(404).send({ detail: `Video not found: ${video_id}` });
      }

      // 构建视频内容
      const segments = videoData.segments || [];
      let videoContent = '视频内容:\n';

      for (let i = 0; i < Math.min(segments.length, 50); i++) {
        const seg = segments[i];
        if (seg.sentence) {
          videoContent += `${i + 1}. ${seg.sentence}\n`;
        }
      }

      if (videoContent.length > 4000) {
        videoContent = videoContent.substring(0, 4000) + '\n...(内容过长，已截断)';
      }

      // 获取思维导图提示词
      let mindmapPrompt: string;
      try {
        const promptConfig = await prisma.systemConfig.findUnique({
          where: { configKey: 'mindmap_prompt' },
        });
        mindmapPrompt = promptConfig?.configValue || getDefaultMindmapPrompt();
      } catch {
        mindmapPrompt = getDefaultMindmapPrompt();
      }

      // 调用 LLM 生成思维导图
      const mindmapMarkdown = await llmService.simpleChat([
        { role: 'system', content: '你是一个专业的思维导图生成助手，擅长从视频内容中提取关键信息并组织成清晰的思维导图结构。' },
        { role: 'user', content: `${mindmapPrompt}\n\n${videoContent}` },
      ]);

      // 保存到 PostgreSQL
      if (shouldSave) {
        await prisma.videoMindmap.upsert({
          where: { videoId: video_id },
          update: {
            mindmapMarkdown,
            version: '1.0',
          },
          create: {
            videoId: video_id,
            mindmapMarkdown,
            version: '1.0',
          },
        });
      }

      return {
        video_id,
        mind_map_markdown: mindmapMarkdown,
        generated_at: new Date().toISOString(),
        version: '1.0',
        saved: shouldSave,
      };
    } catch (error: any) {
      console.error('Failed to generate mindmap:', error);
      return reply.status(500).send({
        detail: `生成思维导图失败: ${error.message}`,
        code: 'MINDMAP_GENERATION_FAILED',
      });
    }
  });

  // ==================== Folder Management API ====================

  const createFolderSchema = z.object({
    name: z.string().min(1, '文件夹名称不能为空').max(100, '文件夹名称最多100字符'),
    parent_id: z.string().nullable().optional(),
  });

  const renameFolderSchema = z.object({
    new_name: z.string().min(1, '新名称不能为空').max(100, '名称最多100字符'),
  });

  const updateFolderParentSchema = z.object({
    parent_id: z.string().nullable(),
  });

  const moveVideoSchema = z.object({
    video_path: z.string().optional(),
    video_id: z.string().optional(),
    folder_id: z.string(),
  });

  /**
   * POST /api/qdrant/folders - 创建文件夹
   */
  fastify.post('/api/qdrant/folders', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createFolderSchema.parse(request.body);

    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({ detail: 'Qdrant connection unavailable' });
    }

    const folderId = await qdrantClient.createFolder(body.name, body.parent_id || null);

    if (!folderId) {
      return reply.status(400).send({
        detail: '创建文件夹失败（名称可能已存在或父文件夹不存在）',
        code: 'FOLDER_CREATE_FAILED',
      });
    }

    return {
      folder_id: folderId,
      name: body.name,
      parent_id: body.parent_id || null,
    };
  });

  /**
   * PUT /api/qdrant/folders/:folder_id/parent - 移动文件夹（修改父级）
   */
  fastify.put('/api/qdrant/folders/:folder_id/parent', async (request: FastifyRequest, reply: FastifyReply) => {
    const { folder_id } = request.params as { folder_id: string };
    const body = updateFolderParentSchema.parse(request.body);

    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({ detail: 'Qdrant connection unavailable' });
    }

    const success = await qdrantClient.updateFolderParent(folder_id, body.parent_id);

    if (!success) {
      return reply.status(400).send({
        detail: '移动文件夹失败（可能存在循环引用或文件夹不存在）',
        code: 'FOLDER_MOVE_FAILED',
      });
    }

    return { success: true };
  });

  /**
   * PUT /api/qdrant/folders/:folder_id - 重命名文件夹
   */
  fastify.put('/api/qdrant/folders/:folder_id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { folder_id } = request.params as { folder_id: string };
    const body = renameFolderSchema.parse(request.body);

    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({ detail: 'Qdrant connection unavailable' });
    }

    const success = await qdrantClient.renameFolder(folder_id, body.new_name);

    if (!success) {
      return reply.status(400).send({
        detail: '重命名失败（新名称可能已存在）',
        code: 'FOLDER_RENAME_FAILED',
      });
    }

    return { success: true };
  });

  /**
   * DELETE /api/qdrant/folders/:folder_id - 删除文件夹
   */
  fastify.delete('/api/qdrant/folders/:folder_id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { folder_id } = request.params as { folder_id: string };

    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({ detail: 'Qdrant connection unavailable' });
    }

    const success = await qdrantClient.deleteFolder(folder_id);

    if (!success) {
      return reply.status(400).send({
        detail: '删除文件夹失败',
        code: 'FOLDER_DELETE_FAILED',
      });
    }

    return { success: true };
  });

  /**
   * POST /api/qdrant/folders/move-video - 移动视频到文件夹
   */
  fastify.post('/api/qdrant/folders/move-video', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = moveVideoSchema.parse(request.body);

    if (!body.video_id && !body.video_path) {
      return reply.status(400).send({
        detail: '必须提供 video_id 或 video_path',
        code: 'MISSING_VIDEO_ID',
      });
    }

    if (!await qdrantClient.checkConnection()) {
      return reply.status(503).send({ detail: 'Qdrant connection unavailable' });
    }

    // 使用 video_id，如果没有则需要查找
    const videoId = body.video_id || body.video_path;

    if (!videoId) {
      return reply.status(400).send({
        detail: '无法确定视频 ID',
        code: 'INVALID_VIDEO_ID',
      });
    }

    const success = await qdrantClient.assignVideoToFolder(videoId, body.folder_id);

    if (!success) {
      return reply.status(404).send({
        detail: '移动视频失败（视频或文件夹不存在）',
        code: 'MOVE_VIDEO_FAILED',
      });
    }

    return { success: true };
  });

  // ==================== 视频点击统计 API ====================

  /**
   * POST /api/qdrant/videos/:video_id/view - 记录视频点击
   */
  fastify.post('/api/qdrant/videos/:video_id/view', {
    preHandler: optionalAuth,  // 可选认证，不强制登录
  }, async (request: FastifyRequest) => {
    const { video_id } = request.params as { video_id: string };
    const userIp = request.ip || null;
    const userAgent = request.headers['user-agent']?.substring(0, 500) || null;

    // 获取可选的用户 ID
    const userId = request.user ? parseInt(request.user.sub, 10) : null;

    // 记录点击详情（关联用户 ID，如果已登录）
    await prisma.videoView.create({
      data: {
        videoId: video_id,
        userId,  // 可选用户关联
        userIp,
        userAgent,
      },
    });

    // 更新汇总表
    await prisma.videoViewCount.upsert({
      where: { videoId: video_id },
      update: {
        viewCount: { increment: 1 },
        lastViewed: new Date(),
      },
      create: {
        videoId: video_id,
        viewCount: 1,
        lastViewed: new Date(),
      },
    });

    return { success: true };
  });

  /**
   * GET /api/qdrant/videos/:video_id/views - 获取视频点击次数
   */
  fastify.get('/api/qdrant/videos/:video_id/views', async (request: FastifyRequest) => {
    const { video_id } = request.params as { video_id: string };

    const viewCount = await prisma.videoViewCount.findUnique({
      where: { videoId: video_id },
    });

    return {
      video_id,
      view_count: viewCount?.viewCount || 0,
      last_viewed: viewCount?.lastViewed?.toISOString() || null,
    };
  });

  /**
   * GET /api/qdrant/videos/views/ranking - 获取视频点击排行
   */
  fastify.get('/api/qdrant/videos/views/ranking', async (request: FastifyRequest) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '10', 10)));

    const ranking = await prisma.videoViewCount.findMany({
      orderBy: { viewCount: 'desc' },
      take: limit,
    });

    return {
      ranking: ranking.map((r, idx) => ({
        rank: idx + 1,
        video_id: r.videoId,
        view_count: r.viewCount,
        last_viewed: r.lastViewed.toISOString(),
      })),
    };
  });
}
