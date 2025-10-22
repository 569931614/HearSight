# -*- coding: utf-8 -*-
"""
知识库相关API路由
"""
from __future__ import annotations

from typing import Any, Dict, List
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import logging
import os

from backend.knowledge.knowledge_service import (
    sync_transcript_to_vector_db,
    sync_all_transcripts_to_vector_db,
    search_knowledge_base,
    chat_with_knowledge_base,
    list_all_videos_in_knowledge_base,
)
from config import get_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


# 请求模型
class ChatRequest(BaseModel):
    """对话请求"""
    query: str
    n_results: int = 5


class SearchRequest(BaseModel):
    """搜索请求"""
    query: str
    n_results: int = 10


class SyncRequest(BaseModel):
    """同步请求"""
    transcript_id: int | None = None  # 如果为空，同步所有


@router.post("/chat")
def api_chat(payload: ChatRequest, request: Request) -> Dict[str, Any]:
    """
    基于知识库的对话

    请求体:
        - query: 用户查询
        - n_results: 检索结果数量（默认5）

    返回:
        - answer: AI回答
        - references: 引用的视频片段列表
        - query: 原始查询
    """
    try:
        # 获取配置
        cfg = get_config()
        api_key = cfg.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
        base_url = cfg.OPENAI_BASE_URL or os.environ.get("OPENAI_BASE_URL")
        model = cfg.OPENAI_CHAT_MODEL or os.environ.get("OPENAI_CHAT_MODEL")

        if not api_key or not base_url or not model:
            raise HTTPException(
                status_code=400,
                detail="未配置 LLM API（需要 OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_CHAT_MODEL）"
            )

        # 获取向量库目录
        vector_db_dir = os.path.join(os.path.dirname(request.app.state.static_dir), "vector_db")

        # 执行对话
        result = chat_with_knowledge_base(
            query=payload.query,
            api_key=api_key,
            base_url=base_url,
            model=model,
            n_results=payload.n_results,
            persist_directory=vector_db_dir
        )

        return result

    except Exception as e:
        logger.error(f"对话失败: {e}")
        raise HTTPException(status_code=500, detail=f"对话失败: {str(e)}")


@router.post("/search")
def api_search(payload: SearchRequest, request: Request) -> Dict[str, Any]:
    """
    在知识库中搜索

    请求体:
        - query: 查询文本
        - n_results: 返回结果数量（默认10）

    返回:
        - results: 搜索结果列表
    """
    try:
        # 获取向量库目录
        vector_db_dir = os.path.join(os.path.dirname(request.app.state.static_dir), "vector_db")

        # 执行搜索
        results = search_knowledge_base(
            query=payload.query,
            n_results=payload.n_results,
            persist_directory=vector_db_dir
        )

        return {"results": results}

    except Exception as e:
        logger.error(f"搜索失败: {e}")
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")


@router.post("/sync")
def api_sync(payload: SyncRequest, request: Request) -> Dict[str, Any]:
    """
    同步数据到向量库

    请求体:
        - transcript_id: 转写记录ID（可选，如果不提供则同步所有）

    返回:
        - 同步结果统计
    """
    try:
        db_url = request.app.state.db_url
        vector_db_dir = os.path.join(os.path.dirname(request.app.state.static_dir), "vector_db")

        if payload.transcript_id:
            # 同步单个记录
            success = sync_transcript_to_vector_db(
                db_url=db_url,
                transcript_id=payload.transcript_id,
                persist_directory=vector_db_dir
            )

            return {
                "success": success,
                "transcript_id": payload.transcript_id,
                "message": "同步成功" if success else "同步失败"
            }
        else:
            # 同步所有记录
            result = sync_all_transcripts_to_vector_db(
                db_url=db_url,
                persist_directory=vector_db_dir
            )

            return result

    except Exception as e:
        logger.error(f"同步失败: {e}")
        raise HTTPException(status_code=500, detail=f"同步失败: {str(e)}")


@router.get("/videos")
def api_list_videos(request: Request) -> Dict[str, Any]:
    """
    列出知识库中的所有视频

    返回:
        - videos: 视频列表
    """
    try:
        vector_db_dir = os.path.join(os.path.dirname(request.app.state.static_dir), "vector_db")

        videos = list_all_videos_in_knowledge_base(persist_directory=vector_db_dir)

        return {"videos": videos}

    except Exception as e:
        logger.error(f"列出视频失败: {e}")
        raise HTTPException(status_code=500, detail=f"列出视频失败: {str(e)}")
