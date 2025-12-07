"""
Qdrant RAG Chat Router

Provides RAG-enhanced chat using Qdrant vector database.
This is separate from the existing knowledge base (pgvector) system.
"""

import logging
import os
from typing import Dict, Any, Optional
from pathlib import Path
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.vector_utils import VideoQdrantClient
from backend.vector_utils.embedder import EmbeddingService
from backend.rag_utils import format_rag_context, format_rag_system_prompt
from config import get_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/qdrant", tags=["qdrant-rag"])

# Simple in-memory cache for video list
_video_list_cache = {
    "data": None,
    "timestamp": None,
    "ttl": 60  # Cache for 60 seconds
}


class QdrantChatRequest(BaseModel):
    """Qdrant RAG chat request"""
    query: str
    session_id: Optional[str] = None
    n_results: int = 5
    score_threshold: float = 0.7
    language_filter: Optional[str] = None  # e.g., "zh-cn"
    folder_id: Optional[str] = None  # 文件夹过滤


class QdrantSearchRequest(BaseModel):
    """Qdrant search request"""
    query: str
    n_results: int = 10
    score_threshold: float = 0.7
    language_filter: Optional[str] = None
    folder_id: Optional[str] = None  # 文件夹过滤


def get_qdrant_client(request: Request) -> VideoQdrantClient:
    """Get or create Qdrant client from app state"""
    if not hasattr(request.app.state, 'qdrant_client'):
        cfg = get_config()
        qdrant_url = os.environ.get('QDRANT_URL', 'http://localhost:6333')
        qdrant_api_key = os.environ.get('QDRANT_API_KEY') or None

        request.app.state.qdrant_client = VideoQdrantClient(
            url=qdrant_url,
            api_key=qdrant_api_key
        )

    return request.app.state.qdrant_client


def get_embedding_service(request: Request):
    """Get or create embedding service from app state"""
    if not hasattr(request.app.state, 'embedding_service'):
        # Use SiliconFlow API with BAAI/bge-large-zh-v1.5 model (same as pyvideotrans)
        api_url = os.environ.get('QDRANT_EMBEDDING_API_URL', 'https://api.siliconflow.cn/v1')
        api_key = os.environ.get('QDRANT_EMBEDDING_API_KEY')
        embedding_model = os.environ.get('QDRANT_EMBEDDING_MODEL', 'BAAI/bge-large-zh-v1.5')

        if not api_url or not api_key:
            raise HTTPException(
                status_code=500,
                detail="Embedding API not configured (need QDRANT_EMBEDDING_API_URL and QDRANT_EMBEDDING_API_KEY)"
            )

        logger.info(f"Initializing embedding service: {api_url}, model: {embedding_model}")

        request.app.state.embedding_service = EmbeddingService(
            api_url=api_url,
            api_key=api_key,
            model=embedding_model
        )

    return request.app.state.embedding_service


@router.post("/chat")
async def qdrant_chat(payload: QdrantChatRequest, request: Request) -> Dict[str, Any]:
    """
    RAG-enhanced chat using Qdrant vector database

    This endpoint queries pyvideotrans-processed videos from Qdrant
    and uses them as context for question answering.

    Args:
        query: User question
        session_id: Optional session ID (for conversation history)
        n_results: Number of chunks to retrieve (default: 5)
        score_threshold: Minimum similarity score (default: 0.7)
        language_filter: Optional language filter (e.g., "zh-cn")

    Returns:
        answer: AI response
        references: List of source video chunks
        query: Original question
        session_id: Session ID for this conversation
    """
    print(f"=== QDRANT_CHAT CALLED === Query: {payload.query}")
    try:
        logger.info(f"=== Qdrant RAG Chat Request === Query: {payload.query}")

        # Generate session ID if not provided
        import uuid
        session_id = payload.session_id or str(uuid.uuid4())

        # Check if RAG is enabled
        rag_enabled = os.environ.get('RAG_ENABLED', 'true').lower() == 'true'
        if not rag_enabled:
            raise HTTPException(
                status_code=503,
                detail="Qdrant RAG is disabled. Set RAG_ENABLED=true to enable."
            )

        # Get services
        logger.info("Getting Qdrant client...")
        qdrant_client = get_qdrant_client(request)
        logger.info("Getting embedding service...")
        embedding_service = get_embedding_service(request)
        logger.info(f"Embedding service initialized: {type(embedding_service)}")

        # Check Qdrant connection
        if not qdrant_client.check_connection():
            raise HTTPException(
                status_code=503,
                detail="Cannot connect to Qdrant. Please ensure Qdrant is running."
            )

        # Generate query embedding
        logger.info(f"Generating embedding for query: {payload.query}")
        query_embedding = embedding_service.embed(payload.query)

        # Build filter conditions
        filter_conditions = {}
        if payload.language_filter:
            filter_conditions['language'] = payload.language_filter

        # Search Qdrant
        logger.info(f"Searching Qdrant with threshold={payload.score_threshold}, limit={payload.n_results}")
        results = qdrant_client.search_similar(
            query_vector=query_embedding,
            limit=payload.n_results,
            score_threshold=payload.score_threshold,
            filter_conditions=filter_conditions if filter_conditions else None
        )

        if not results:
            logger.warning("No relevant results found in Qdrant")
            answer = "抱歉，我在知识库中没有找到相关内容来回答您的问题。"
            references = []

            # Save chat history even when no results found
            try:
                from backend.db.pg_store import save_chat_message
                db_url = request.app.state.db_url

                # Save user message
                save_chat_message(
                    db_url=db_url,
                    session_id=session_id,
                    role="user",
                    content=payload.query,
                    metadata=None
                )

                # Save assistant response
                save_chat_message(
                    db_url=db_url,
                    session_id=session_id,
                    role="assistant",
                    content=answer,
                    metadata={"references": []}
                )

                logger.info(f"Chat history saved for session (no results): {session_id}")
            except Exception as e:
                logger.error(f"Failed to save chat history: {e}", exc_info=True)

            return {
                "answer": answer,
                "references": references,
                "query": payload.query,
                "session_id": session_id
            }

        # Format RAG context
        rag_include_summaries = os.environ.get('RAG_INCLUDE_SUMMARIES', 'true').lower() == 'true'
        rag_context = format_rag_context(results, include_summaries=rag_include_summaries)

        # Get LLM config
        cfg = get_config()
        api_key = cfg.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
        base_url = cfg.OPENAI_BASE_URL or os.environ.get("OPENAI_BASE_URL")
        model = cfg.OPENAI_CHAT_MODEL or os.environ.get("OPENAI_CHAT_MODEL")

        if not all([api_key, base_url, model]):
            raise HTTPException(
                status_code=500,
                detail="LLM API not configured"
            )

        # Build LLM prompt
        base_system_prompt = "你是一个专业的视频内容问答助手。请基于提供的视频内容回答用户的问题，并在回答中引用相关来源。"
        system_prompt = format_rag_system_prompt(base_system_prompt, rag_context)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": payload.query}
        ]

        # Call LLM
        import requests
        response = requests.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 2000
            },
            timeout=60
        )
        response.raise_for_status()

        result_data = response.json()
        answer = result_data['choices'][0]['message']['content']

        # Format references with metadata structure for frontend compatibility
        references = [
            {
                "chunk_text": r.chunk_text,
                "score": r.score,
                "metadata": {
                    "video_title": r.video_title,
                    "video_path": r.video_path,  # 添加 video_path
                    "video_id": r.video_id,      # 添加 video_id
                    "start_time": r.start_time,
                    "end_time": r.end_time,
                    "summary": r.paragraph_summary,
                    "language": r.language,
                    "source_type": r.source_type
                }
            }
            for r in results
        ]

        # 调试日志：检查返回的引用数据
        for i, ref in enumerate(references[:3]):  # 只打印前3个
            logger.info(f"Reference {i}: score={ref['score']}, chunk_text_len={len(ref['chunk_text'])}, video_title={ref['metadata']['video_title']}")

        logger.info(f"Successfully generated answer with {len(references)} references")

        # Save chat history to PostgreSQL
        try:
            from backend.db.pg_store import save_chat_message
            db_url = request.app.state.db_url

            # Save user message
            save_chat_message(
                db_url=db_url,
                session_id=session_id,
                role="user",
                content=payload.query,
                metadata=None
            )

            # Save assistant response
            save_chat_message(
                db_url=db_url,
                session_id=session_id,
                role="assistant",
                content=answer,
                metadata={"references": references}
            )

            logger.info(f"Chat history saved for session: {session_id}")
        except Exception as e:
            logger.error(f"Failed to save chat history: {e}", exc_info=True)
            # Don't fail the request if history saving fails

        return {
            "answer": answer,
            "references": references,
            "query": payload.query,
            "session_id": session_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Qdrant chat failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@router.post("/search")
async def qdrant_search(payload: QdrantSearchRequest, request: Request) -> Dict[str, Any]:
    """
    Search Qdrant vector database

    Args:
        query: Search query
        n_results: Number of results (default: 10)
        score_threshold: Minimum similarity score (default: 0.7)
        language_filter: Optional language filter

    Returns:
        results: List of matching video chunks
    """
    try:
        # Get services
        qdrant_client = get_qdrant_client(request)
        embedding_service = get_embedding_service(request)

        # Check connection
        if not qdrant_client.check_connection():
            raise HTTPException(
                status_code=503,
                detail="Cannot connect to Qdrant"
            )

        # Generate query embedding
        query_embedding = embedding_service.embed(payload.query)

        # Build filter
        filter_conditions = {}
        if payload.language_filter:
            filter_conditions['language'] = payload.language_filter

        # Search
        results = qdrant_client.search_similar(
            query_vector=query_embedding,
            limit=payload.n_results,
            score_threshold=payload.score_threshold,
            filter_conditions=filter_conditions if filter_conditions else None
        )

        # Format results
        formatted_results = [
            {
                "chunk_id": r.chunk_id,
                "video_title": r.video_title,
                "chunk_text": r.chunk_text,
                "summary": r.paragraph_summary,
                "start_time": r.start_time,
                "end_time": r.end_time,
                "score": r.score,
                "language": r.language,
                "source_type": r.source_type
            }
            for r in results
        ]

        return {"results": formatted_results}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Qdrant search failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/health")
async def qdrant_health(request: Request) -> Dict[str, Any]:
    """
    Check Qdrant connection health

    Returns:
        status: "healthy" or "unhealthy"
        details: Connection details
    """
    try:
        qdrant_client = get_qdrant_client(request)
        is_healthy = qdrant_client.check_connection()

        return {
            "status": "healthy" if is_healthy else "unhealthy",
            "qdrant_url": os.environ.get('QDRANT_URL', 'http://localhost:6333'),
            "rag_enabled": os.environ.get('RAG_ENABLED', 'true').lower() == 'true'
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }


@router.get("/folders")
async def qdrant_list_folders(request: Request) -> Dict[str, Any]:
    """
    List all folders from Qdrant

    Returns:
        folders: List of folder metadata with video counts
    """
    try:
        qdrant_client = get_qdrant_client(request)

        if not qdrant_client.check_connection():
            raise HTTPException(
                status_code=503,
                detail="Qdrant connection unavailable"
            )

        folders = qdrant_client.list_folders()
        logger.info(f"[qdrant] Retrieved {len(folders)} folders")

        return {
            "folders": folders,
            "total": len(folders)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list folders: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list folders: {str(e)}"
        )


@router.get("/videos")
async def qdrant_list_videos(
    request: Request,
    force_refresh: bool = False,
    page: int = 1,
    page_size: int = 20,
    folder_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    List all videos from Qdrant video_metadata collection with pagination

    This endpoint retrieves videos directly from pyvideotrans-exported Qdrant data,
    providing the most up-to-date list of translated videos.

    Args:
        force_refresh: If True, bypass cache and fetch fresh data
        page: Page number (1-indexed)
        page_size: Number of items per page (default: 20, max: 100)
        folder_id: Optional folder ID to filter videos

    Returns:
        videos: List of video metadata from Qdrant
        pagination: Pagination info (page, page_size, total, total_pages)
        cached: Whether the data was served from cache
    """
    try:
        # Validate pagination parameters
        if page < 1:
            page = 1
        if page_size < 1:
            page_size = 20
        if page_size > 100:
            page_size = 100

        # Check cache first (unless force_refresh is True)
        now = datetime.now()
        cache_key = f"all_videos_{folder_id}" if folder_id else "all_videos"

        if not force_refresh and _video_list_cache.get(cache_key) is not None:
            cache_entry = _video_list_cache[cache_key]
            if cache_entry.get("timestamp"):
                cache_age = (now - cache_entry["timestamp"]).total_seconds()
                if cache_age < _video_list_cache.get("ttl", 60):
                    all_videos = cache_entry["data"]
                    logger.info(f"[qdrant] Serving cached video list (age: {cache_age:.1f}s)")

                    # Apply pagination
                    total = len(all_videos)
                    total_pages = (total + page_size - 1) // page_size
                    start_idx = (page - 1) * page_size
                    end_idx = start_idx + page_size
                    paginated_videos = all_videos[start_idx:end_idx]

                    return {
                        "videos": paginated_videos,
                        "pagination": {
                            "page": page,
                            "page_size": page_size,
                            "total": total,
                            "total_pages": total_pages
                        },
                        "cached": True,
                        "cache_age": cache_age
                    }

        # Cache miss or expired - fetch fresh data
        qdrant_client = get_qdrant_client(request)

        if not qdrant_client.check_connection():
            raise HTTPException(
                status_code=503,
                detail="Qdrant connection unavailable"
            )

        # Fetch all videos
        all_videos = qdrant_client.list_all_videos()

        # Filter by folder if specified
        if folder_id:
            all_videos = [v for v in all_videos if v.get("folder_id") == folder_id]

        # Update cache
        if cache_key not in _video_list_cache:
            _video_list_cache[cache_key] = {}
        _video_list_cache[cache_key]["data"] = all_videos
        _video_list_cache[cache_key]["timestamp"] = now

        logger.info(f"[qdrant] Retrieved {len(all_videos)} videos from Qdrant (cache refreshed)")

        # Apply pagination
        total = len(all_videos)
        total_pages = (total + page_size - 1) // page_size
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_videos = all_videos[start_idx:end_idx]

        return {
            "videos": paginated_videos,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": total_pages
            },
            "cached": False
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list videos from Qdrant: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list videos: {str(e)}"
        )


@router.get("/videos/{video_id}/paragraphs")
async def qdrant_get_video_paragraphs(video_id: str, request: Request) -> Dict[str, Any]:
    """
    Get video paragraphs by video_id from Qdrant

    This endpoint retrieves video segments and summary from pyvideotrans-exported Qdrant data.

    Args:
        video_id: Video ID (MD5 hash)

    Returns:
        media_path: Video file path
        static_url: Static URL for video playback
        segments: List of video segments with timestamps
        summary: Video-level summary
    """
    try:
        qdrant_client = get_qdrant_client(request)

        if not qdrant_client.check_connection():
            raise HTTPException(
                status_code=503,
                detail="Qdrant connection unavailable"
            )

        result = qdrant_client.get_video_paragraphs_by_video_id(video_id)

        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Video not found: {video_id}"
            )

        logger.info(f"[qdrant] Retrieved video paragraphs: video_id={video_id}, segments={len(result.get('segments', []))}")

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get video paragraphs from Qdrant: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get video paragraphs: {str(e)}"
        )


# ==================== 文件夹管理 API ====================

@router.get("/folders")
async def list_folders(request: Request) -> Dict[str, Any]:
    """
    列出所有文件夹

    Returns:
        folders: List of folders with video counts
    """
    try:
        qdrant_client = get_qdrant_client(request)

        if not qdrant_client.check_connection():
            raise HTTPException(
                status_code=503,
                detail="Qdrant connection unavailable"
            )

        folders = qdrant_client.list_folders()
        logger.info(f"[qdrant] Retrieved {len(folders)} folders")

        return {
            "folders": folders,
            "count": len(folders)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list folders: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list folders: {str(e)}"
        )


class CreateFolderRequest(BaseModel):
    """创建文件夹请求"""
    name: str


@router.post("/folders")
async def create_folder(req: CreateFolderRequest, request: Request) -> Dict[str, Any]:
    """
    创建新文件夹

    Args:
        name: 文件夹名称

    Returns:
        folder_id: 创建的文件夹ID
        name: 文件夹名称
    """
    try:
        qdrant_client = get_qdrant_client(request)

        if not qdrant_client.check_connection():
            raise HTTPException(
                status_code=503,
                detail="Qdrant connection unavailable"
            )

        folder_id = qdrant_client.create_folder(req.name)

        if not folder_id:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to create folder (name may already exist): {req.name}"
            )

        logger.info(f"[qdrant] Created folder: {req.name} (ID: {folder_id})")

        return {
            "folder_id": folder_id,
            "name": req.name
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create folder: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create folder: {str(e)}"
        )


class RenameFolderRequest(BaseModel):
    """重命名文件夹请求"""
    new_name: str


@router.put("/folders/{folder_id}")
async def rename_folder(
    folder_id: str,
    req: RenameFolderRequest,
    request: Request
) -> Dict[str, Any]:
    """
    重命名文件夹

    Args:
        folder_id: 文件夹ID
        new_name: 新名称

    Returns:
        success: 是否成功
    """
    try:
        qdrant_client = get_qdrant_client(request)

        if not qdrant_client.check_connection():
            raise HTTPException(
                status_code=503,
                detail="Qdrant connection unavailable"
            )

        success = qdrant_client.rename_folder(folder_id, req.new_name)

        if not success:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to rename folder (new name may already exist)"
            )

        logger.info(f"[qdrant] Renamed folder: {folder_id} -> {req.new_name}")

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to rename folder: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to rename folder: {str(e)}"
        )


@router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, request: Request) -> Dict[str, Any]:
    """
    删除文件夹（视频移动到"未分类"）

    Args:
        folder_id: 文件夹ID

    Returns:
        success: 是否成功
    """
    try:
        qdrant_client = get_qdrant_client(request)

        if not qdrant_client.check_connection():
            raise HTTPException(
                status_code=503,
                detail="Qdrant connection unavailable"
            )

        # 始终移动视频到"未分类"而不是删除
        success = qdrant_client.delete_folder(folder_id, delete_videos=False)

        if not success:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to delete folder (may be default folder)"
            )

        logger.info(f"[qdrant] Deleted folder: {folder_id}")

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete folder: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete folder: {str(e)}"
        )


class MoveVideoRequest(BaseModel):
    """移动视频请求"""
    video_path: str
    folder_id: str


@router.post("/folders/move-video")
async def move_video_to_folder(
    req: MoveVideoRequest,
    request: Request
) -> Dict[str, Any]:
    """
    移动视频到文件夹

    Args:
        video_path: 视频路径
        folder_id: 目标文件夹ID

    Returns:
        success: 是否成功
    """
    try:
        qdrant_client = get_qdrant_client(request)

        if not qdrant_client.check_connection():
            raise HTTPException(
                status_code=503,
                detail="Qdrant connection unavailable"
            )

        success = qdrant_client.assign_video_to_folder(req.video_path, req.folder_id)

        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Failed to move video (video or folder not found)"
            )

        logger.info(f"[qdrant] Moved video to folder: {req.video_path} -> {req.folder_id}")

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to move video: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to move video: {str(e)}"
        )
