"""
HearSight Qdrant Client (Read-Only)

This module provides read-only access to Qdrant vector database for RAG-based QA.
HearSight does NOT write to Qdrant - all video processing is done by pyvideotrans.

Note: Folder management methods delegate to pyvideotrans's QdrantVectorStoreAdapter.
"""

import logging
import sys
from pathlib import Path
from typing import List, Optional, Dict, Any
from dataclasses import dataclass

from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

# 导入 pyvideotrans 的 Qdrant 适配器（用于文件夹管理）
pyvideotrans_path = Path(__file__).parent.parent.parent.parent / "pyvideotrans"
if str(pyvideotrans_path) not in sys.path:
    sys.path.insert(0, str(pyvideotrans_path))

try:
    from videotrans.hearsight.qdrant_vector_adapter import QdrantVectorStoreAdapter
    FOLDER_SUPPORT = True
except ImportError:
    FOLDER_SUPPORT = False
    QdrantVectorStoreAdapter = None

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Search result from Qdrant"""
    chunk_id: str
    score: float
    chunk_text: str
    paragraph_summary: Optional[str]
    video_title: str
    video_path: Optional[str]
    video_id: Optional[str]  # 添加 video_id 字段
    language: str
    start_time: float
    end_time: float
    source_type: str


class VideoQdrantClient:
    """
    Qdrant client for HearSight (READ-ONLY)

    IMPORTANT: This client ONLY performs read operations.
    All write operations (chunking, summarizing, embedding, uploading)
    are handled by pyvideotrans.
    """

    def __init__(
        self,
        url: str = "http://localhost:6333",
        api_key: Optional[str] = None,
        collection_prefix: str = "video"
    ):
        """
        Initialize Qdrant client

        Args:
            url: Qdrant server URL
            api_key: Optional API key
            collection_prefix: Collection name prefix
        """
        self.client = QdrantClient(url=url, api_key=api_key)
        self.collection_chunks = f"{collection_prefix}_chunks"
        self.collection_metadata = f"{collection_prefix}_metadata"

        # 初始化 pyvideotrans 适配器（用于文件夹管理）
        self._adapter = None
        if FOLDER_SUPPORT:
            try:
                self._adapter = QdrantVectorStoreAdapter(url=url, api_key=api_key)
                logger.info("Folder management support enabled via pyvideotrans adapter")
            except Exception as e:
                logger.warning(f"Failed to initialize folder support: {e}")
                self._adapter = None

    def search_similar(
        self,
        query_vector: List[float],
        limit: int = 5,
        score_threshold: float = 0.7,
        filter_conditions: Optional[dict] = None
    ) -> List[SearchResult]:
        """
        Search for similar video chunks (READ-ONLY)

        Args:
            query_vector: Query embedding vector
            limit: Maximum number of results
            score_threshold: Minimum similarity score
            filter_conditions: Optional filters (language, source_type, video_id)

        Returns:
            List of SearchResult objects
        """
        try:
            # Build filter if provided
            query_filter = None
            if filter_conditions:
                conditions = []

                if "language" in filter_conditions:
                    conditions.append(
                        FieldCondition(
                            key="language",
                            match=MatchValue(value=filter_conditions["language"])
                        )
                    )

                if "source_type" in filter_conditions:
                    conditions.append(
                        FieldCondition(
                            key="source_type",
                            match=MatchValue(value=filter_conditions["source_type"])
                        )
                    )

                if "video_id" in filter_conditions:
                    conditions.append(
                        FieldCondition(
                            key="video_id",
                            match=MatchValue(value=filter_conditions["video_id"])
                        )
                    )

                if conditions:
                    query_filter = Filter(must=conditions)

            # Search Qdrant
            results = self.client.search(
                collection_name=self.collection_chunks,
                query_vector=query_vector,
                limit=limit,
                score_threshold=score_threshold,
                query_filter=query_filter
            )

            # Parse results
            search_results = []
            for hit in results:
                search_results.append(SearchResult(
                    chunk_id=str(hit.id),
                    score=hit.score,
                    chunk_text=hit.payload.get("chunk_text", ""),
                    paragraph_summary=hit.payload.get("paragraph_summary"),
                    video_title=hit.payload.get("video_title", ""),
                    video_path=hit.payload.get("video_path"),
                    video_id=hit.payload.get("video_id"),  # 添加 video_id 提取
                    language=hit.payload.get("language", ""),
                    start_time=hit.payload.get("start_time", 0.0),
                    end_time=hit.payload.get("end_time", 0.0),
                    source_type=hit.payload.get("source_type", "")
                ))

            logger.info(f"Found {len(search_results)} similar chunks")
            return search_results

        except Exception as e:
            logger.error(f"Qdrant search failed: {e}", exc_info=True)
            return []

    def get_video_summary(self, video_id: str) -> Optional[str]:
        """
        Retrieve video-level summary (READ-ONLY)

        Args:
            video_id: Video ID

        Returns:
            Video summary or None
        """
        try:
            result = self.client.retrieve(
                collection_name=self.collection_metadata,
                ids=[video_id]
            )

            if result and len(result) > 0:
                return result[0].payload.get("video_summary")

            return None

        except Exception as e:
            logger.error(f"Failed to retrieve video summary: {e}", exc_info=True)
            return None

    def check_connection(self) -> bool:
        """
        Check if Qdrant connection is healthy

        Returns:
            True if connection is healthy
        """
        try:
            collections = self.client.get_collections()
            logger.info(f"Qdrant connection healthy, found {len(collections.collections)} collections")
            return True

        except Exception as e:
            logger.warning(f"Qdrant connection failed: {e}")
            return False

    def get_video_paragraphs_by_video_id(self, video_id: str) -> Optional[Dict[str, Any]]:
        """
        通过 video_id 获取视频的完整段落信息（用于视频播放）

        从 pyvideotrans 导出的 Qdrant chunks 重建 segments

        Args:
            video_id: 视频ID（MD5哈希值）

        Returns:
            Dict: 包含 media_path, static_url, segments, video_summary
        """
        try:
            from qdrant_client.models import Filter, FieldCondition, MatchValue

            # 1. 首先从 metadata collection 获取全文总结
            metadata_results, _ = self.client.scroll(
                collection_name=self.collection_metadata,
                scroll_filter=Filter(
                    must=[FieldCondition(key="video_id", match=MatchValue(value=video_id))]
                ),
                limit=1,
                with_payload=True,
                with_vectors=False
            )

            # 提取全文总结和视频信息
            video_summary_from_metadata = ""
            video_path = None
            video_title = None

            if metadata_results:
                metadata_payload = metadata_results[0].payload
                video_summary_from_metadata = metadata_payload.get("video_summary", "")
                video_path = metadata_payload.get("video_path")
                video_title = metadata_payload.get("video_title")
                logger.info(f"从 metadata 获取到全文总结长度: {len(video_summary_from_metadata)} 字符")

            # 2. 查询该视频的所有 chunks
            results, _ = self.client.scroll(
                collection_name=self.collection_chunks,
                scroll_filter=Filter(
                    must=[FieldCondition(key="video_id", match=MatchValue(value=video_id))]
                ),
                limit=1000,
                with_payload=True,
                with_vectors=False
            )

            if not results:
                logger.warning(f"未找到 video_id={video_id} 的数据")
                return None

            # 如果 metadata 中没有视频信息，从 chunks 中获取
            if not video_path or not video_title:
                first_payload = results[0].payload
                video_path = video_path or first_payload.get("video_path")
                video_title = video_title or first_payload.get("video_title")

            # 从 chunks 重建 segments（按 start_time 排序）
            # 注意：前端期望时间单位为毫秒（ms），但 Qdrant 存储的是秒（s）
            segments = []
            for idx, point in enumerate(results):
                payload = point.payload
                start_sec = payload.get("start_time", 0.0)
                end_sec = payload.get("end_time", 0.0)

                segments.append({
                    "index": idx,
                    "spk_id": None,  # pyvideotrans 不提供说话人信息
                    "sentence": payload.get("chunk_text", ""),
                    "start_time": start_sec * 1000,  # 秒 → 毫秒
                    "end_time": end_sec * 1000       # 秒 → 毫秒
                })

            # 按 start_time 排序
            segments.sort(key=lambda x: x["start_time"])

            # 重新编号
            for idx, seg in enumerate(segments):
                seg["index"] = idx

            # 构建段落摘要列表（从 paragraph_summary 合并，用于段落总结标签页）
            summaries = []
            for point in results:
                payload = point.payload
                if payload.get("paragraph_summary"):
                    summaries.append({
                        "start_time": payload.get("start_time", 0.0) * 1000,  # 秒 → 毫秒
                        "end_time": payload.get("end_time", 0.0) * 1000,      # 秒 → 毫秒
                        "text": payload.get("chunk_text", ""),
                        "summary": payload.get("paragraph_summary", "")
                    })

            # 使用从 metadata 获取的真正全文总结，如果没有则回退到拼接段落摘要
            if video_summary_from_metadata:
                video_summary_text = video_summary_from_metadata
                logger.info(f"✅ 使用 metadata 中的全文总结，长度: {len(video_summary_text)} 字符")
            elif summaries:
                # 回退方案：拼接段落摘要
                video_summary_text = "\n\n".join([
                    f"**时间段 {i+1}** ({s['start_time']/1000:.1f}s - {s['end_time']/1000:.1f}s)\n{s['summary']}"
                    for i, s in enumerate(summaries)
                ])
                logger.warning(f"⚠️ metadata 无全文总结，使用拼接段落摘要")
            else:
                video_summary_text = f"该视频共 {len(segments)} 个片段，暂无详细摘要"
                logger.warning(f"⚠️ 无全文总结和段落摘要")

            logger.info(f"成功从 Qdrant 重建视频段落: video_id={video_id}, segments={len(segments)}, summaries={len(summaries)}")
            logger.info(f"video_summary 前200字符: {video_summary_text[:200]}...")

            # ✅ 按需生成签名 URL（仅在播放时）
            # 这样可以确保每次播放都有有效的签名 URL，避免过期问题
            static_url = None
            if video_path:
                # 规范化 URL（添加协议前缀）
                if not video_path.startswith(('http://', 'https://')):
                    from backend.utils.oss_client import is_oss_url
                    if is_oss_url(video_path):
                        video_path_normalized = f"https://{video_path}"
                    else:
                        video_path_normalized = video_path
                else:
                    video_path_normalized = video_path

                # 生成签名 URL
                from backend.utils.oss_client import convert_to_signed_url
                static_url = convert_to_signed_url(video_path_normalized, expires=3600)  # 1小时有效期
                logger.info(f"✅ 按需生成签名 URL (有效期 1 小时)")
                logger.info(f"   原始路径: {video_path[:80]}...")
                logger.info(f"   签名 URL: {static_url[:100]}...")

            result = {
                "media_path": video_path,
                "static_url": static_url,
                "segments": segments,
                "video_summary": video_summary_text,  # 真正的全文总结（优先从 metadata 获取）
                "summary": {
                    "topic": video_title or "",
                    "summary": f"共 {len(segments)} 个片段",
                    "paragraph_count": len(summaries),
                    "total_duration": segments[-1]["end_time"] if segments else 0.0
                }
            }

            logger.info(f"返回结果包含字段: {list(result.keys())}")
            return result

        except Exception as e:
            logger.error(f"获取视频段落失败: video_id={video_id}, error={e}")
            import traceback
            traceback.print_exc()
            return None

    def list_all_videos(self) -> List[Dict[str, Any]]:
        """
        List all videos from the metadata collection (READ-ONLY)

        Returns:
            List of video metadata dictionaries
        """
        try:
            # Query all points from video_metadata collection
            results, _ = self.client.scroll(
                collection_name=self.collection_metadata,
                limit=1000,
                with_payload=True,
                with_vectors=False
            )

            # 直接从 metadata 构建结果，不再查询 chunks collection
            # 这样可以避免网络超时和性能问题
            videos = []
            for point in results:
                payload = point.payload
                video_id = payload.get("video_id") or str(point.id)

                # 直接使用 metadata 中的 total_segments
                # 如果为 0 或不存在，显示为 "未知"
                total_segments = payload.get("total_segments", 0)

                # 获取视频路径（不生成签名 URL）
                # 签名 URL 会在播放视频时通过 get_video_paragraphs_by_video_id() 按需生成
                video_path = payload.get("video_path")

                videos.append({
                    "video_id": video_id,
                    "video_path": video_path,
                    "video_title": payload.get("video_title"),
                    "topic": payload.get("video_title"),  # alias for compatibility
                    "video_summary": payload.get("video_summary"),
                    "total_segments": total_segments,
                    "total_duration": payload.get("total_duration", 0.0),
                    "language": payload.get("language", ""),
                    "source_type": payload.get("source_type", ""),
                    "folder": payload.get("folder", "未分类"),
                    "folder_id": payload.get("folder_id")
                })

            logger.info(f"Listed {len(videos)} videos from Qdrant (metadata only)")
            return videos

        except Exception as e:
            logger.error(f"Failed to list videos: {e}", exc_info=True)
            return []

    def create_chunks(self, *args, **kwargs):
        """NOT IMPLEMENTED - HearSight does not write to Qdrant"""
        raise NotImplementedError(
            "HearSight is READ-ONLY. All video processing and Qdrant writes "
            "are handled by pyvideotrans."
        )

    def upsert_chunks(self, *args, **kwargs):
        """NOT IMPLEMENTED - HearSight does not write to Qdrant"""
        raise NotImplementedError(
            "HearSight is READ-ONLY. All video processing and Qdrant writes "
            "are handled by pyvideotrans."
        )

    def delete_chunks(self, *args, **kwargs):
        """NOT IMPLEMENTED - HearSight does not write to Qdrant"""
        raise NotImplementedError(
            "HearSight is READ-ONLY. All video processing and Qdrant writes "
            "are handled by pyvideotrans."
        )

    # ==================== 文件夹管理方法（代理到 pyvideotrans）====================

    def list_folders(self) -> List[Dict[str, Any]]:
        """列出所有文件夹"""
        if not self._adapter:
            logger.warning("Folder support not available")
            return []
        try:
            return self._adapter.list_folders()
        except Exception as e:
            logger.error(f"Failed to list folders: {e}")
            return []

    def create_folder(self, folder_name: str) -> Optional[str]:
        """创建新文件夹"""
        if not self._adapter:
            raise NotImplementedError("Folder support not available")
        return self._adapter.create_folder(folder_name)

    def rename_folder(self, folder_id: str, new_name: str) -> bool:
        """重命名文件夹"""
        if not self._adapter:
            raise NotImplementedError("Folder support not available")
        return self._adapter.rename_folder(folder_id, new_name)

    def delete_folder(self, folder_id: str, delete_videos: bool = False) -> bool:
        """删除文件夹"""
        if not self._adapter:
            raise NotImplementedError("Folder support not available")
        return self._adapter.delete_folder(folder_id, delete_videos)

    def assign_video_to_folder(self, video_path: str, folder_id: str) -> bool:
        """将视频分配到文件夹"""
        if not self._adapter:
            raise NotImplementedError("Folder support not available")
        return self._adapter.assign_video_to_folder(video_path, folder_id)

    def search_in_folder(
        self,
        query_vector: List[float],
        folder_id: str,
        limit: int = 5,
        score_threshold: float = 0.7
    ) -> List[SearchResult]:
        """在指定文件夹中搜索"""
        if not self._adapter:
            raise NotImplementedError("Folder support not available")

        try:
            # 使用 adapter 的 search_in_folder（需要先构造查询文本）
            # 但这里我们有 query_vector，所以直接使用 filter
            # 先获取文件夹中的所有视频路径
            from qdrant_client.models import Filter, FieldCondition, MatchValue

            # 从 metadata 获取该文件夹的所有视频
            scroll_result = self.client.scroll(
                collection_name=self.collection_metadata,
                scroll_filter=Filter(
                    must=[FieldCondition(key="folder_id", match=MatchValue(value=folder_id))]
                ),
                limit=1000,
                with_payload=True,
                with_vectors=False
            )

            if not scroll_result or not scroll_result[0]:
                return []

            # 获取所有视频路径
            video_paths = [point.payload.get('video_path', '') for point in scroll_result[0] if point.payload.get('video_path')]

            if not video_paths:
                return []

            # 在 chunks 中搜索，限制为这些视频
            query_filter = Filter(
                should=[
                    FieldCondition(key="video_path", match=MatchValue(value=vp))
                    for vp in video_paths
                ]
            )

            search_results = self.client.search(
                collection_name=self.collection_chunks,
                query_vector=query_vector,
                query_filter=query_filter,
                limit=limit,
                score_threshold=score_threshold
            )

            # 转换为 SearchResult 对象
            results = []
            for point in search_results:
                payload = point.payload
                results.append(SearchResult(
                    chunk_id=str(point.id),
                    score=point.score,
                    chunk_text=payload.get("chunk_text", ""),
                    paragraph_summary=payload.get("paragraph_summary"),
                    video_title=payload.get("video_title", "Unknown"),
                    video_path=payload.get("video_path"),
                    video_id=payload.get("video_id"),
                    language=payload.get("language", "unknown"),
                    start_time=payload.get("start_time", 0.0),
                    end_time=payload.get("end_time", 0.0),
                    source_type=payload.get("source_type", "pyvideotrans")
                ))

            return results

        except Exception as e:
            logger.error(f"Failed to search in folder: {e}")
            return []
