# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Query
import logging

from backend.audio2text.asr_sentence_segments import process as asr_process
from backend.db.pg_store import (
    save_transcript,
    list_transcripts_meta,
    count_transcripts,
    get_transcript_by_id,
    get_transcript_id_by_path,
    delete_transcript,
    create_job,
    get_job,
    list_jobs,
    get_summaries_by_transcript_id,
    list_summaries_meta,
    save_summaries,
)
from backend.utils.vedio_utils.download_video.download_bilibili import download_bilibili
from backend.utils.oss_client import get_oss_client, upload_video_to_oss, is_oss_url, delete_oss_file_by_url
from backend.text_process.summarize import summarize_segments
from config import get_config
import os

router = APIRouter(prefix="/api", tags=["media"])


def _build_static_url(static_dir: Path, media_path: Optional[str]) -> Optional[str]:
    if not media_path:
        return None

    # 如果是 HTTP/HTTPS URL，直接返回原 URL
    if media_path.startswith(('http://', 'https://')):
        return media_path

    # 检查是否为 OSS URL（可能缺少协议前缀）
    if is_oss_url(media_path):
        # 如果已经有协议前缀，直接返回
        if media_path.startswith(('http://', 'https://')):
            return media_path
        # 否则添加 https:// 前缀
        return f"https://{media_path}"

    # 本地文件：转换为 /static/ 路径
    try:
        media = Path(media_path).resolve()
        base = static_dir.resolve()
        rel = media.relative_to(base)
        return f"/static/{rel.as_posix()}"
    except Exception:
        return f"/static/{Path(media_path).name}"


@router.post("/download")
def api_download(payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
    url = payload.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    static_dir: Path = request.app.state.static_dir
    out_dir = payload.get("out_dir") or str(static_dir)
    sessdata = payload.get("sessdata")
    playlist = bool(payload.get("playlist", False))
    quality = payload.get("quality", "best")
    workers = int(payload.get("workers", 16))
    upload_to_oss = payload.get("upload_to_oss", True)  # 默认上传到 OSS

    files = download_bilibili(
        url=url,
        out_dir=out_dir,
        sessdata=str(sessdata) if sessdata else "",
        playlist=playlist,
        quality=quality,
        workers=workers,
        use_nopart=True,
        simple_filename=True,
    )

    items: List[Dict[str, Any]] = []
    oss_client = get_oss_client()

    for fp in files:
        p = Path(fp)
        local_path = str(p.resolve())
        basename = p.name
        static_url = f"/static/{basename}"
        oss_url = None

        # 尝试上传到 OSS
        if upload_to_oss and oss_client.is_enabled():
            oss_result = upload_video_to_oss(local_path)
            if oss_result["success"]:
                oss_url = oss_result["url"]
                static_url = oss_url  # 使用 OSS URL 作为静态 URL
                logging.info(f"Video uploaded to OSS: {oss_url}")
            else:
                logging.warning(f"Failed to upload to OSS: {oss_result['error']}")

        items.append({
            "path": local_path,
            "basename": basename,
            "static_url": static_url,
            "oss_url": oss_url,
            "local_path": local_path,
        })

    return {"items": items}


@router.post("/asr/segments")
def api_asr_segments(payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
    audio_path = payload.get("audio_path")
    if not audio_path:
        raise HTTPException(status_code=400, detail="audio_path is required")

    p = Path(audio_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"audio not found: {audio_path}")

    segs = asr_process(str(p))
    # 保存到数据库（使用 postgres dsn 或由 pg_store 从环境读取）
    db_url = request.app.state.db_url
    transcript_id = save_transcript(db_url, str(p.resolve()), segs)
    return {"segments": segs, "transcript_id": transcript_id}


@router.post("/summarize")
def api_summarize(payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
    """基于句级片段一次性生成总结。

        请求 body 字段：
            - segments: List[Segment] （必需）
            - api_key/base_url/model: 可选（若未提供则从 config 或环境变量读取）
            - 注意：不要通过 payload 传入 max_tokens，后端使用 CHAT_MAX_WINDOWS 配置控制上限

    返回：{"summaries": List[SummaryItem]}
    """
    segments = payload.get("segments")
    if not segments or not isinstance(segments, list):
        raise HTTPException(status_code=400, detail="segments (list) is required")

    # 优先使用请求体中的配置；其次使用配置文件（config）或环境变量
    cfg = get_config()
    api_key = payload.get("api_key") or cfg.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
    base_url = payload.get("base_url") or cfg.OPENAI_BASE_URL or os.environ.get("OPENAI_BASE_URL")
    model = payload.get("model") or cfg.OPENAI_CHAT_MODEL or os.environ.get("OPENAI_CHAT_MODEL")

    if not api_key or not base_url or not model:
        raise HTTPException(status_code=400, detail="chat api_key, base_url and model are required (either in payload or config/env)")

    # 从配置或环境读取 CHAT_MAX_WINDOWS（优先级：config -> 环境变量 -> 默认 1000000）
    chat_max = None
    if hasattr(cfg, 'CHAT_MAX_WINDOWS') and cfg.CHAT_MAX_WINDOWS:
        try:
            chat_max = int(cfg.CHAT_MAX_WINDOWS)
        except Exception:
            chat_max = None
    if chat_max is None:
        try:
            chat_max = int(os.environ.get('CHAT_MAX_WINDOWS') or os.environ.get('CHAT_MAX_WINDOWS'.upper()) or '1000000')
        except Exception:
            chat_max = 1000000


    try:
        summaries = summarize_segments(
            segments=segments,
            api_key=api_key,
            base_url=base_url,
            model=model,
            chat_max_windows=chat_max,
        )
    except ValueError as e:
        # 例如 token 超限等可预期的错误，返回 400
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # 其他未知错误返回 500
        raise HTTPException(status_code=500, detail=f"summarization failed: {e}")

    # 返回直接的 list[SummaryItem] 以简化前端处理
    return {"summaries": summaries}


@router.get("/transcripts")
def api_list_transcripts(request: Request, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
    """列出已转写的媒体列表（按id倒序）。
    Query:
      - limit: 返回数量（默认50）
      - offset: 偏移量（默认0）
    返回: { total, items: [{id, media_path, created_at, segment_count}] }
    """
    db_url = request.app.state.db_url
    static_dir = Path(request.app.state.static_dir).resolve()
    total = count_transcripts(db_url)
    items = list_transcripts_meta(db_url, limit=limit, offset=offset)

    enriched = []
    for item in items:
        media_path = item.get("media_path")
        static_url = _build_static_url(static_dir, media_path) if media_path else None
        enriched.append({**item, "static_url": static_url})

    return {"total": total, "items": enriched}


@router.get("/lookup/transcript")
def api_get_transcript_id_by_path(request: Request, media_path: str = Query(..., description="视频文件的完整路径")) -> Dict[str, Any]:
    """根据 media_path 查找对应的 transcript_id"""
    db_url = request.app.state.db_url
    logging.info(f"[lookup] 查询路径: {media_path}")
    transcript_id = get_transcript_id_by_path(db_url, media_path)
    if transcript_id is None:
        logging.warning(f"[lookup] 未找到匹配的转写记录: {media_path}")
        raise HTTPException(status_code=422, detail=f"未找到对应的转写记录")
    logging.info(f"[lookup] 找到转写记录: transcript_id={transcript_id}")
    return {"transcript_id": transcript_id, "media_path": media_path}


@router.get("/transcripts/{transcript_id}")
def api_get_transcript(transcript_id: int, request: Request) -> Dict[str, Any]:
    """获取指定转写记录的详情（包含 segments）。"""
    db_url = request.app.state.db_url
    static_dir = Path(request.app.state.static_dir).resolve()
    data = get_transcript_by_id(db_url, transcript_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"transcript not found: {transcript_id}")

    data["static_url"] = _build_static_url(static_dir, data.get("media_path"))
    return data


@router.post("/jobs")
def api_create_job(payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
    url = payload.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    db_url = request.app.state.db_url
    job_id = create_job(db_url, str(url))
    return {"job_id": job_id}


@router.get("/jobs/{job_id}")
def api_get_job(job_id: int, request: Request) -> Dict[str, Any]:
    db_url = request.app.state.db_url
    data = get_job(db_url, int(job_id))
    if not data:
        raise HTTPException(status_code=404, detail=f"job not found: {job_id}")
    return data


@router.get("/jobs")
def api_list_jobs(request: Request, status: Optional[str] = None, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
    """列出任务队列，支持按状态筛选（pending/running/success/failed）。
    返回: { items: [{id, url, status, created_at, started_at, finished_at, result, error}] }
    """
    db_url = request.app.state.db_url
    items = list_jobs(db_url, status=status, limit=limit, offset=offset)
    return {"items": items}


@router.delete("/transcripts/{transcript_id}")
def api_delete_transcript_complete(transcript_id: int, request: Request) -> Dict[str, Any]:
    """删除指定的转写记录及其对应的视频文件。
    该操作会同时删除视频文件、向量数据和数据库记录，不可恢复。
    """
    logging.info(f"开始删除操作 - transcript_id: {transcript_id}")
    
    db_url = request.app.state.db_url
    static_dir: Path = request.app.state.static_dir
    
    logging.info(f"数据库连接: {db_url}")
    logging.info(f"静态目录: {static_dir}")
    
    # 检查转写记录是否存在
    transcript = get_transcript_by_id(db_url, transcript_id)
    if not transcript:
        logging.error(f"转写记录不存在: {transcript_id}")
        raise HTTPException(status_code=404, detail=f"transcript not found: {transcript_id}")
    
    logging.info(f"找到转写记录: {transcript}")
    
    deleted_files = []
    errors = []
    
    try:
        # 第一步：删除视频文件（本地或 OSS）
        media_path = transcript.get("media_path")
        if media_path:
            # 检查是否为 OSS URL
            if is_oss_url(media_path):
                try:
                    logging.info(f"检测到 OSS URL，开始删除 OSS 文件: {media_path}")
                    if delete_oss_file_by_url(media_path):
                        deleted_files.append(f"OSS: {media_path}")
                        logging.info(f"已删除 OSS 文件: {media_path}")
                    else:
                        logging.warning(f"OSS 文件删除失败或不存在: {media_path}")
                except Exception as e:
                    error_msg = f"删除 OSS 文件失败: {str(e)}"
                    errors.append(error_msg)
                    logging.error(error_msg)
            else:
                # 本地文件删除逻辑
                try:
                    file_path = Path(media_path)

                    # 安全检查：确保文件在静态目录内，防止路径遍历攻击
                    try:
                        file_path.resolve().relative_to(static_dir.resolve())
                    except ValueError:
                        # 如果文件不在静态目录内，尝试通过文件名在静态目录中查找
                        basename = file_path.name
                        file_path = static_dir / basename

                    # 检查文件是否存在并删除
                    if file_path.exists() and file_path.is_file():
                        file_path.unlink()  # 删除文件
                        deleted_files.append(str(file_path))
                        logging.info(f"已删除本地视频文件: {file_path}")
                    else:
                        logging.warning(f"本地视频文件不存在: {file_path}")

                except Exception as e:
                    error_msg = f"删除本地视频文件失败: {str(e)}"
                    errors.append(error_msg)
                    logging.error(error_msg)
        
        # 第二步：删除向量数据库记录
        if media_path:
            try:
                from backend.knowledge.vector_store import get_vector_store
                logging.info(f"开始删除向量数据: {media_path}")

                vector_db_dir = getattr(request.app.state, "vector_db_dir", Path(request.app.state.static_dir).parent / "vector_db")
                vector_store = get_vector_store(str(vector_db_dir))

                # 删除 Qdrant 中的向量数据
                if hasattr(vector_store, 'delete_video'):
                    delete_success = vector_store.delete_video(media_path)
                    if delete_success:
                        logging.info(f"已删除向量数据: {media_path}")
                    else:
                        logging.warning(f"向量数据删除失败或不存在: {media_path}")
                else:
                    logging.warning(f"当前向量存储不支持删除操作")

            except Exception as e:
                error_msg = f"删除向量数据失败: {str(e)}"
                errors.append(error_msg)
                logging.error(error_msg)

        # 第三步：删除转写记录
        logging.info(f"开始删除数据库记录: {transcript_id}")
        success = delete_transcript(db_url, transcript_id)
        logging.info(f"数据库删除结果: {success}")

        if not success:
            logging.error(f"数据库删除失败: {transcript_id}")
            raise HTTPException(status_code=404, detail="转写记录不存在或已被删除")

        logging.info(f"已删除转写记录: {transcript_id}")

        # 返回结果
        message_parts = []
        if deleted_files:
            message_parts.append(f"已删除 {len(deleted_files)} 个视频文件")
        message_parts.append("转写记录删除成功")
        
        if errors:
            message_parts.append(f"但有 {len(errors)} 个错误")
        
        return {
            "success": True,
            "message": "，".join(message_parts),
            "transcript_id": transcript_id,
            "deleted_files": deleted_files,
            "errors": errors if errors else None
        }
        
    except HTTPException:
        # 重新抛出 HTTP 异常
        raise
    except Exception as e:
        logging.error(f"删除操作失败: {e}")
        raise HTTPException(status_code=500, detail=f"删除操作失败: {str(e)}")


@router.get("/summaries")
def api_list_summaries(request: Request, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
    """列出所有摘要记录。
    Query:
      - limit: 返回数量（默认50）
      - offset: 偏移量（默认0）
    返回: { items: [{id, transcript_id, created_at, summary_count}] }
    """
    db_url = request.app.state.db_url
    items = list_summaries_meta(db_url, limit=limit, offset=offset)
    return {"items": items}


@router.get("/summaries/transcript/{transcript_id}")
def api_get_summaries_by_transcript(transcript_id: int, request: Request) -> Dict[str, Any]:
    """获取指定转写记录的摘要。"""
    db_url = request.app.state.db_url
    summaries = get_summaries_by_transcript_id(db_url, transcript_id)
    if summaries is None:
        raise HTTPException(status_code=404, detail=f"summaries not found for transcript: {transcript_id}")
    return {"summaries": summaries}


@router.post("/import/pyvideotrans")
def api_import_from_pyvideotrans(payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
    """
    从 pyvideotrans 导入翻译后的视频数据

    请求体:
        - media_path: 视频文件路径
        - segments: 字幕片段列表 [{"start_time": float, "end_time": float, "text": str}]
        - paragraphs: 段落摘要列表 [{"start_time": float, "end_time": float, "text": str, "summary": str}]
        - summary: 整体摘要 {"topic": str, "summary": str, "paragraph_count": int, "total_duration": float}
        - metadata: 额外元数据（可选）

    返回:
        - transcript_id: 创建的转写记录 ID
        - success: 是否成功
        - message: 消息
    """
    try:
        db_url = request.app.state.db_url

        # 验证必需字段
        media_path = payload.get("media_path")
        segments = payload.get("segments")
        paragraphs = payload.get("paragraphs")
        summary = payload.get("summary")

        if not media_path:
            raise HTTPException(status_code=400, detail="media_path is required")
        if not segments or not isinstance(segments, list):
            raise HTTPException(status_code=400, detail="segments (list) is required")
        if not paragraphs or not isinstance(paragraphs, list):
            raise HTTPException(status_code=400, detail="paragraphs (list) is required")
        if not summary or not isinstance(summary, dict):
            raise HTTPException(status_code=400, detail="summary (dict) is required")

        # 1. 创建转写记录
        transcript_id = save_transcript(
            db_url=db_url,
            media_path=media_path,
            segments=segments
        )

        if not transcript_id:
            raise HTTPException(status_code=500, detail="Failed to create transcript")

        logging.info(f"[pyvideotrans import] Created transcript: {transcript_id}")

        # 2. 创建摘要记录
        summaries = []
        for para in paragraphs:
            summaries.append({
                "text": para.get("text", ""),
                "summary": para.get("summary", ""),
                "start_time": para.get("start_time", 0.0),
                "end_time": para.get("end_time", 0.0)
            })

        if summaries:
            save_summaries(db_url, transcript_id, summaries)
            logging.info(f"[pyvideotrans import] Created {len(summaries)} summaries")

        # 3. ⚠️ 注意: 不再同步到本地向量库
        # pyvideotrans 已将数据直接写入 Qdrant
        # HearSight 只需从 PostgreSQL 和 Qdrant 读取即可
        logging.info(f"[pyvideotrans import] ✅ Data stored in PostgreSQL")
        logging.info(f"[pyvideotrans import] ℹ️ Vector data should be in Qdrant (written by pyvideotrans)")

        return {
            "success": True,
            "transcript_id": transcript_id,
            "message": f"Successfully imported from pyvideotrans, transcript_id={transcript_id}"
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"[pyvideotrans import] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

