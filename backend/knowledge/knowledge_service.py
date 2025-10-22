"""
知识库服务

处理数据同步、向量库管理等
"""
import logging
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

        # 获取向量库实例
        vector_store = get_vector_store(persist_directory)

        # 构建摘要数据结构
        # 从摘要中提取整体主题（如果有）
        topic = "视频内容"
        overall_summary = ""
        paragraphs = []

        if summaries:
            # 假设摘要结构：[{text, summary, start_time, end_time}, ...]
            for summary_item in summaries:
                para_text = summary_item.get("text", "")
                para_summary = summary_item.get("summary", "")
                start_time = summary_item.get("start_time", 0)
                end_time = summary_item.get("end_time", 0)

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
            overall_summary = f"本视频包含 {len(summaries)} 个片段"
        else:
            # 如果没有摘要，使用原始片段
            for seg in segments:
                para_text = seg.get("text", "")
                start_time = seg.get("start_time", 0)
                end_time = seg.get("end_time", 0)

                paragraphs.append({
                    "text": para_text,
                    "summary": "",
                    "start_time": start_time,
                    "end_time": end_time
                })

            overall_summary = f"本视频包含 {len(segments)} 个语音片段"

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

        # 存储到向量库
        success = vector_store.store_summary(
            video_path=media_path,
            summary=summary,
            paragraphs=paragraphs,
            metadata={"transcript_id": transcript_id}
        )

        if success:
            logger.info(f"✅ 成功同步转写记录到向量库: transcript_id={transcript_id}")
        else:
            logger.error(f"❌ 同步转写记录到向量库失败: transcript_id={transcript_id}")

        return success

    except Exception as e:
        logger.error(f"❌ 同步失败: transcript_id={transcript_id}, error={e}")
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

        logger.info(f"✅ 批量同步完成: 成功 {success_count}, 失败 {failed_count}")

        return {
            "total": len(transcripts),
            "success": success_count,
            "failed": failed_count,
            "failed_ids": failed_ids
        }

    except Exception as e:
        logger.error(f"❌ 批量同步失败: {e}")
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

        logger.info(f"🔍 搜索完成: query='{query}', 结果数={len(results)}")
        return results

    except Exception as e:
        logger.error(f"❌ 搜索失败: {e}")
        return []


def chat_with_knowledge_base(
    query: str,
    api_key: str,
    base_url: str,
    model: str,
    n_results: int = 5,
    persist_directory: Optional[str] = None,
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
        **kwargs: 其他参数

    Returns:
        Dict: 对话结果
    """
    try:
        # 1. 检索相关内容
        logger.info(f"💬 开始对话: query='{query}'")
        context_documents = search_knowledge_base(query, n_results, persist_directory)

        if not context_documents:
            logger.warning("⚠️ 未找到相关内容")
            return {
                "answer": "抱歉，我没有找到相关的视频内容来回答您的问题。",
                "references": [],
                "query": query
            }

        # 2. 使用 RAG 生成回答
        result = chat_with_rag(
            query=query,
            context_documents=context_documents,
            api_key=api_key,
            base_url=base_url,
            model=model,
            **kwargs
        )

        logger.info(f"✅ 对话完成: 答案长度={len(result.get('answer', ''))}, 引用数={len(result.get('references', []))}")
        return result

    except Exception as e:
        logger.error(f"❌ 对话失败: {e}")
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

        logger.info(f"📋 列出知识库视频: 共 {len(videos)} 个")
        return videos

    except Exception as e:
        logger.error(f"❌ 列出视频失败: {e}")
        return []
