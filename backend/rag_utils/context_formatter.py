"""
RAG Context Formatter

Formats retrieved Qdrant chunks into structured context for LLM.
"""

import logging
from typing import List
from backend.vector_utils import SearchResult

logger = logging.getLogger(__name__)


def format_timestamp(seconds: float) -> str:
    """
    Format seconds to HH:MM:SS

    Args:
        seconds: Time in seconds

    Returns:
        Formatted time string
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)

    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def format_rag_context(
    results: List[SearchResult],
    include_summaries: bool = True
) -> str:
    """
    Format search results into RAG context for LLM

    Args:
        results: List of search results from Qdrant
        include_summaries: Whether to include paragraph summaries

    Returns:
        Formatted context string in Chinese
    """
    if not results:
        return ""

    context_parts = ["以下是相关的视频内容：\n"]

    for i, result in enumerate(results, 1):
        # Format time range
        time_start = format_timestamp(result.start_time)
        time_end = format_timestamp(result.end_time)
        time_range = f"{time_start} - {time_end}"

        # Build context entry
        entry_parts = [
            f"\n【来源 {i}】",
            f"视频: {result.video_title} ({result.language})",
            f"时间: {time_range}",
            f"相似度: {result.score:.2f}"
        ]

        # Add summary if available and requested
        if include_summaries and result.paragraph_summary:
            entry_parts.append(f"摘要: {result.paragraph_summary}")

        # Add chunk text
        entry_parts.append(f"内容: {result.chunk_text}")

        context_parts.append("\n".join(entry_parts))

    context_parts.append("\n请基于以上视频内容回答用户的问题。如果答案来自特定视频片段，请引用相应的来源编号（如【来源 1】）。")

    return "\n".join(context_parts)


def format_rag_system_prompt(
    base_prompt: str,
    rag_context: str
) -> str:
    """
    Combine base system prompt with RAG context

    Args:
        base_prompt: Base system prompt
        rag_context: Formatted RAG context

    Returns:
        Combined system prompt
    """
    if not rag_context:
        return base_prompt

    return f"{base_prompt}\n\n{rag_context}"
