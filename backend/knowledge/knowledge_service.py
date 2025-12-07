"""
知识库服务

处理数据同步、向量库管理等
"""
import logging
import os
from typing import List, Dict, Any, Optional
from pathlib import Path

from backend.knowledge.vector_store import get_vector_store
from backend.knowledge.chat_client import chat_with_rag
from backend.db.pg_store import (
    get_transcript_by_id,
    get_summaries_by_transcript_id,
    list_transcripts_meta,
)

logger = logging.getLogger(__name__)


def _infer_static_url(media_path: Optional[str]) -> Optional[str]:
    """根据媒体路径推导静态访问 URL"""
    if not media_path:
        return None

    static_base = os.environ.get("HEARSIGHT_STATIC_BASE_URL", "/static").rstrip("/")
    media_path_obj = Path(media_path).resolve()

    shared_dir_env = os.environ.get("HEARSIGHT_SHARED_MEDIA_DIR")
    if shared_dir_env:
        try:
            shared_dir = Path(shared_dir_env).resolve()
            rel = media_path_obj.relative_to(shared_dir)
            return f"{static_base}/{rel.as_posix()}"
        except ValueError:
            pass

    return f"{static_base}/{media_path_obj.name}"


def sync_transcript_to_vector_db(
    db_url: str,
    transcript_id: int,
    persist_directory: Optional[str] = None
) -> bool:
    """
    将转写记录和摘要同步到向量库

    Args:
        db_url: 数据库连接URL
        transcript_id: 转写记录ID
        persist_directory: 向量库持久化目录

    Returns:
        bool: 是否同步成功
    """
    try:
        # 获取转写记录
        transcript = get_transcript_by_id(db_url, transcript_id)
        if not transcript:
            logger.warning(f"转写记录不存在: {transcript_id}")
            return False

        media_path = transcript.get("media_path")
        segments = transcript.get("segments", [])

        if not media_path or not segments:
            logger.warning(f"转写记录数据不完整: {transcript_id}")
            return False

        # 获取摘要
        summaries = get_summaries_by_transcript_id(db_url, transcript_id)
        if not summaries:
            logger.warning(f"未找到摘要数据: {transcript_id}")
            # 即使没有摘要，也可以存储原始片段
            summaries = []

        # 准备向量存储实例并补充元信息
        vector_store = get_vector_store(persist_directory)
        static_url = _infer_static_url(media_path)

        # 构建摘要数据结构，提取主题与段落
        topic = "视频内容"
        overall_summary = ""
        paragraphs = []

        if summaries:
            # 假设摘要结构：[{text, summary, start_time, end_time}, ...]
            for summary_item in summaries:
                para_text = summary_item.get("text", "")
                para_summary = summary_item.get("summary", "")
                start_time = float(summary_item.get("start_time", 0) or 0)
                end_time = float(summary_item.get("end_time", 0) or 0)

                paragraphs.append({
                    "text": para_text,
                    "summary": para_summary,
                    "start_time": start_time,
                    "end_time": end_time
                })

            # 尝试从第一个摘要中提取主题
            if summaries and summaries[0].get("summary"):
                topic = summaries[0].get("summary", "视频内容")[:50]  # 截取前50字作为主题

            # 生成整体摘要
            overall_summary = f"本视频包含{len(summaries)} 个片段"
        else:
            # 如果没有摘要，使用原始片段
            for seg in segments:
                para_text = seg.get("text", "")
                start_time = float(seg.get("start_time", 0) or 0)
                end_time = float(seg.get("end_time", 0) or 0)

                paragraphs.append({
                    "text": para_text,
                    "summary": "",
                    "start_time": start_time,
                    "end_time": end_time
                })

            overall_summary = f"本视频包含{len(segments)} 个语音片段"

        # 计算总时长
        total_duration = 0
        if paragraphs:
            total_duration = max([p.get("end_time", 0) for p in paragraphs])

        summary = {
            "topic": topic,
            "summary": overall_summary,
            "paragraph_count": len(paragraphs),
            "total_duration": total_duration
        }

        metadata = {
            "transcript_id": int(transcript_id),
            "static_url": static_url,
            "media_basename": Path(media_path).name if media_path else None,
            "source_media_path": media_path
        }

        # 存储到向量库
        success = vector_store.store_summary(
            video_path=media_path,
            summary=summary,
            paragraphs=paragraphs,
            metadata=metadata
        )

        if success:
            logger.info(f"成功同步转写记录到向量库: transcript_id={transcript_id}")
        else:
            logger.error(f"同步转写记录到向量库失败: transcript_id={transcript_id}")

        return success

    except Exception as e:
        logger.error(f"同步失败: transcript_id={transcript_id}, error={e}")
        import traceback
        traceback.print_exc()
        return False


def sync_all_transcripts_to_vector_db(
    db_url: str,
    persist_directory: Optional[str] = None
) -> Dict[str, Any]:
    """
    将所有转写记录同步到向量库

    Args:
        db_url: 数据库连接URL
        persist_directory: 向量库持久化目录

    Returns:
        Dict: 同步结果统计
    """
    try:
        # 获取所有转写记录
        transcripts = list_transcripts_meta(db_url, limit=1000, offset=0)

        success_count = 0
        failed_count = 0
        failed_ids = []

        for transcript in transcripts:
            transcript_id = transcript.get("id")
            if transcript_id:
                if sync_transcript_to_vector_db(db_url, transcript_id, persist_directory):
                    success_count += 1
                else:
                    failed_count += 1
                    failed_ids.append(transcript_id)

        logger.info(f"批量同步完成: 成功 {success_count}, 失败 {failed_count}")

        return {
            "total": len(transcripts),
            "success": success_count,
            "failed": failed_count,
            "failed_ids": failed_ids
        }

    except Exception as e:
        logger.error(f"批量同步失败: {e}")
        return {
            "total": 0,
            "success": 0,
            "failed": 0,
            "error": str(e)
        }


def search_knowledge_base(
    query: str,
    n_results: int = 5,
    persist_directory: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    在知识库中搜索

    Args:
        query: 查询文本
        n_results: 返回结果数量
        persist_directory: 向量库持久化目录

    Returns:
        List[Dict]: 搜索结果
    """
    try:
        vector_store = get_vector_store(persist_directory)
        results = vector_store.search(query, n_results=n_results)

        normalized = []
        for item in results:
            metadata = dict(item.get("metadata") or {})
            video_path = metadata.get("video_path")
            if video_path and not metadata.get("static_url"):
                static_url = _infer_static_url(video_path)
                if static_url:
                    metadata["static_url"] = static_url
            if "transcript_id" in metadata:
                try:
                    metadata["transcript_id"] = int(metadata["transcript_id"])
                except (TypeError, ValueError):
                    pass
            if "start_time" in metadata:
                try:
                    metadata["start_time"] = float(metadata["start_time"] or 0)
                except (TypeError, ValueError):
                    metadata["start_time"] = 0.0
            if "end_time" in metadata:
                try:
                    metadata["end_time"] = float(metadata["end_time"] or 0)
                except (TypeError, ValueError):
                    metadata["end_time"] = 0.0
            if video_path and not metadata.get("media_basename"):
                metadata["media_basename"] = Path(video_path).name

            item["metadata"] = metadata
            normalized.append(item)

        logger.info(f"搜索完成: query='{query}', 结果数={len(normalized)}")
        return normalized

    except Exception as e:
        logger.error(f"搜索失败: {e}")
        return []


def chat_with_knowledge_base(
    query: str,
    api_key: str,
    base_url: str,
    model: str,
    n_results: int = 5,
    persist_directory: Optional[str] = None,
    session_id: Optional[str] = None,
    db_url: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    基于知识库的对话

    Args:
        query: 用户查询
        api_key: LLM API密钥
        base_url: LLM API基础URL
        model: LLM模型名称
        n_results: 检索结果数量
        persist_directory: 向量库持久化目录
        session_id: 会话ID（可选，用于维持对话历史）
        db_url: 数据库连接URL（可选，用于保存对话历史）
        **kwargs: 其他参数

    Returns:
        Dict: 对话结果
    """
    try:
        from backend.db.pg_store import get_chat_history, save_chat_message, get_config

        # 从数据库获取 system_prompt
        system_prompt = get_config(db_url, "system_prompt")
        if not system_prompt:
            # 如果数据库中没有配置，使用默认值
            system_prompt = "你是一个专业的视频内容助手，能够根据视频转写内容回答用户的问题。请基于提供的上下文准确、详细地回答问题。"
            logger.warning("数据库中没有找到 system_prompt 配置，使用默认值")

        # 1. 获取历史对话（如果提供了 session_id）
        history = []
        if session_id:
            history_records = get_chat_history(db_url, session_id, limit=20)
            # 转换为 chat_with_rag 需要的格式
            for record in history_records:
                history.append({
                    "role": record["role"],
                    "content": record["content"]
                })

        # 2. 检索相关内容
        logger.info(f"开始对话: query='{query}', session_id='{session_id}', history_count={len(history)}")
        context_documents = search_knowledge_base(query, n_results, persist_directory)

        if not context_documents:
            logger.warning("未找到相关内容")
            answer = "抱歉，我没有找到相关的视频内容来回答您的问题。"
            result = {
                "answer": answer,
                "references": [],
                "query": query
            }
        else:
            # 3. 使用 RAG 生成回答
            result = chat_with_rag(
                query=query,
                context_documents=context_documents,
                api_key=api_key,
                base_url=base_url,
                model=model,
                system_prompt=system_prompt,
                history=history,
                **kwargs
            )

        # 4. 保存对话历史（如果提供了 session_id）
        # 注意：db_url 可以是 None，pg_store 会自动从环境变量读取连接参数
        logger.info(f"检查是否保存对话历史: session_id={session_id}, db_url={db_url is not None}")
        if session_id:
            logger.info(f"准备保存对话历史: session_id='{session_id}'")
            try:
                # 保存用户消息
                logger.info(f"   保存用户消息: {query[:50]}...")
                save_chat_message(db_url, session_id, "user", query, {"n_results": n_results})

                # 保存助手回复（包含完整的 references 信息）
                answer = result.get("answer", "")
                references = result.get("references", [])
                logger.info(f"   保存助手回复: {answer[:50]}..., references数量: {len(references)}")
                save_chat_message(db_url, session_id, "assistant", answer, {
                    "references_count": len(references),
                    "references": references  # 保存完整的引用信息
                })
                logger.info(f"对话历史已保存: session_id='{session_id}'")
            except Exception as e:
                logger.error(f"保存对话历史失败: {e}")
                import traceback
                traceback.print_exc()
        else:
            logger.warning(f"未提供 session_id，跳过保存对话历史")

        logger.info(f"对话完成: 答案长度={len(result.get('answer', ''))}, 引用数={len(result.get('references', []))}")
        return result

    except Exception as e:
        logger.error(f"对话失败: {e}")
        import traceback
        traceback.print_exc()
        return {
            "answer": f"对话过程中发生错误: {str(e)}",
            "references": [],
            "query": query,
            "error": str(e)
        }


def list_all_videos_in_knowledge_base(
    persist_directory: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    列出知识库中的所有视频

    Args:
        persist_directory: 向量库持久化目录

    Returns:
        List[Dict]: 视频列表
    """
    try:
        vector_store = get_vector_store(persist_directory)
        videos = vector_store.list_all_videos()

        logger.info(f"列出知识库视频: 共 {len(videos)} 个")
        return videos

    except Exception as e:
        logger.error(f"列出视频失败: {e}")
        return []


def get_video_paragraphs_by_video_id(
    video_id: str,
    persist_directory: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    通过 video_id 从向量数据库读取视频的段落信息

    Args:
        video_id: 视频ID（MD5哈希值）
        persist_directory: 向量库持久化目录

    Returns:
        Dict: 包含视频信息和段落列表，如果未找到返回 None
    """
    try:
        # 获取向量存储实例
        vector_store = get_vector_store(persist_directory)

        # 调用向量存储的方法获取视频段落
        result = vector_store.get_video_paragraphs_by_video_id(video_id)

        if result:
            logger.info(f"成功读取视频段落: video_id={video_id}, 段落数={len(result.get('segments', []))}")
        else:
            logger.warning(f"未找到视频: video_id={video_id}")

        return result

    except AttributeError:
        # 向量存储不支持此方法
        logger.error(f"当前向量存储后端不支持通过 video_id 查询")
        return None
    except Exception as e:
        logger.error(f"读取视频段落失败: video_id={video_id}, error={e}")
        import traceback
        traceback.print_exc()
        return None
