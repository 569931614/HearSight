# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import psycopg2
from psycopg2.extras import RealDictCursor


def _ensure_conn_params(db_url: Optional[str] = None) -> Dict[str, Any]:
    """从 db_url 或环境变量解析连接参数。

    db_url 可接受像 psycopg2.connect 的 dsn 或完整 URL，也可以为空（使用默认本地 postgres）。
    返回可传入 psycopg2.connect 的 dict。
    """
    if db_url:
        return {"dsn": db_url}
    # 默认连接到本地 postgres，数据库名/用户/密码按常见环境变量设置
    import os

    params: Dict[str, Any] = {}
    host = os.environ.get("POSTGRES_HOST")
    port = os.environ.get("POSTGRES_PORT")
    user = os.environ.get("POSTGRES_USER")
    password = os.environ.get("POSTGRES_PASSWORD")
    dbname = os.environ.get("POSTGRES_DB")
    if host:
        params["host"] = host
    if port:
        params["port"] = port
    if user:
        params["user"] = user
    if password:
        params["password"] = password
    if dbname:
        params["dbname"] = dbname
    return params


def init_db(db_url: Optional[str] = None) -> None:
    """初始化 Postgres 中需要的表和索引。"""
    conn_params = _ensure_conn_params(db_url)
    max_retries = 30  # 最多重试30次
    retry_delay = 2   # 每次重试间隔2秒

    conn = None
    for attempt in range(max_retries):
        try:
            # 当使用 dsn 键时，psycopg2.connect 接受 dsn 关键字参数
            if "dsn" in conn_params:
                conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
            else:
                conn = psycopg2.connect(**conn_params)
            break  # 连接成功，跳出重试循环
        except psycopg2.OperationalError as e:
            if "the database system is starting up" in str(e) or "Connection refused" in str(e):
                if attempt < max_retries - 1:
                    print(f"数据库尚未就绪，等待 {retry_delay} 秒后重试... (第 {attempt + 1}/{max_retries} 次)")
                    time.sleep(retry_delay)
                    continue
                else:
                    print(f"数据库连接失败，已重试 {max_retries} 次")
                    raise
            else:
                # 其他类型的连接错误，直接抛出
                raise

    if conn is None:
        raise RuntimeError("无法建立数据库连接")

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS transcripts (
                        id SERIAL PRIMARY KEY,
                        media_path TEXT NOT NULL,
                        segments_json TEXT NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT (now())
                    );
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS jobs (
                        id SERIAL PRIMARY KEY,
                        url TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'pending',
                        created_at TIMESTAMP NOT NULL DEFAULT (now()),
                        started_at TIMESTAMP,
                        finished_at TIMESTAMP,
                        result_json TEXT,
                        error TEXT
                    );
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS summaries (
                        id SERIAL PRIMARY KEY,
                        transcript_id INTEGER NOT NULL,
                        summaries_json TEXT NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT (now()),
                        FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
                    );
                    """
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_jobs_status_created
                    ON jobs(status, created_at DESC);
                    """
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_transcripts_media_path
                    ON transcripts(media_path);
                    """
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_summaries_transcript_id
                    ON summaries(transcript_id);
                    """
                )
                # 对话历史表
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS chat_history (
                        id SERIAL PRIMARY KEY,
                        session_id TEXT NOT NULL,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        metadata JSONB,
                        created_at TIMESTAMP NOT NULL DEFAULT (now())
                    );
                    """
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_chat_history_session_id
                    ON chat_history(session_id, created_at DESC);
                    """
                )
                # 系统配置表
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS system_config (
                        id SERIAL PRIMARY KEY,
                        config_key TEXT NOT NULL UNIQUE,
                        config_value TEXT NOT NULL,
                        updated_at TIMESTAMP NOT NULL DEFAULT (now())
                    );
                    """
                )
                # 插入默认配置
                cur.execute(
                    """
                    INSERT INTO system_config (config_key, config_value)
                    VALUES
                        ('system_prompt', '你是一个专业的视频内容助手，能够根据视频转写内容回答用户的问题。请基于提供的上下文准确、详细地回答问题。'),
                        ('site_title', 'HearSight - AI 视频智能分析'),
                        ('admin_password', 'admin123')
                    ON CONFLICT (config_key) DO NOTHING;
                    """
                )
    finally:
        conn.close()


def save_transcript(db_url: Optional[str], media_path: str, segments: List[Dict[str, Any]]) -> int:
    conn_params = _ensure_conn_params(db_url)
    data = json.dumps(segments, ensure_ascii=False)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO transcripts (media_path, segments_json) VALUES (%s, %s) RETURNING id",
                    (media_path, data),
                )
                row = cur.fetchone()
                if not row:
                    raise RuntimeError("Failed to insert transcript")
                rid = row[0]
                return int(rid)
    finally:
        conn.close()


def get_latest_transcript(db_url: Optional[str], media_path: str) -> Optional[List[Dict[str, Any]]]:
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT segments_json FROM transcripts
                    WHERE media_path = %s
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (media_path,),
                )
                row = cur.fetchone()
                if not row:
                    return None
                try:
                    return json.loads(row[0])
                except Exception:
                    return None
    finally:
        conn.close()


def list_transcripts_meta(db_url: Optional[str], limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    """列出转写记录的元信息（不包含大字段），按id倒序。
    返回: [{id, media_path, created_at, segment_count}]
    """
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, media_path, segments_json, created_at
                    FROM transcripts
                    ORDER BY id DESC
                    LIMIT %s OFFSET %s
                    """,
                    (int(limit), int(offset)),
                )
                rows = cur.fetchall()
                items: List[Dict[str, Any]] = []
                for r in rows:
                    rid = r["id"]
                    media_path = r["media_path"]
                    seg_json = r["segments_json"]
                    created_at = r["created_at"]
                    try:
                        segs = json.loads(seg_json)
                        seg_count = len(segs) if isinstance(segs, list) else 0
                    except Exception:
                        seg_count = 0
                    items.append({
                        "id": int(rid),
                        "media_path": str(media_path),
                        "created_at": str(created_at),
                        "segment_count": int(seg_count),
                    })
                return items
    finally:
        conn.close()


def count_transcripts(db_url: Optional[str]) -> int:
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM transcripts")
                row = cur.fetchone()
                return int(row[0]) if row and row[0] is not None else 0
    finally:
        conn.close()


def get_transcript_by_id(db_url: Optional[str], transcript_id: int) -> Optional[Dict[str, Any]]:
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, media_path, segments_json, created_at
                    FROM transcripts
                    WHERE id = %s
                    LIMIT 1
                    """,
                    (int(transcript_id),),
                )
                row = cur.fetchone()
                if not row:
                    return None
                try:
                    segs = json.loads(row["segments_json"])
                except Exception:
                    segs = []

                # 规范化 segments 格式以匹配前端期望
                # 前端期望: {index, spk_id, sentence, start_time (ms), end_time (ms)}
                normalized_segs = []
                for idx, seg in enumerate(segs):
                    # 如果是旧格式（有 text 字段），转换为新格式
                    if isinstance(seg, dict):
                        # 时间戳可能以秒或毫秒存储，统一转换为毫秒
                        start_time = float(seg.get("start_time", 0))
                        end_time = float(seg.get("end_time", 0))

                        # 如果时间戳看起来是秒（通常 < 10000），转换为毫秒
                        if start_time > 0 and start_time < 100000:
                            start_time = start_time * 1000
                        if end_time > 0 and end_time < 100000:
                            end_time = end_time * 1000

                        normalized_seg = {
                            "index": seg.get("index", idx),
                            "spk_id": seg.get("spk_id"),
                            "sentence": seg.get("sentence") or seg.get("text", ""),
                            "start_time": start_time,
                            "end_time": end_time
                        }
                        normalized_segs.append(normalized_seg)

                return {
                    "id": int(row["id"]),
                    "media_path": str(row["media_path"]),
                    "created_at": str(row["created_at"]),
                    "segments": normalized_segs,
                }
    finally:
        conn.close()


def get_transcript_id_by_path(db_url: Optional[str], media_path: str) -> Optional[int]:
    """根据 media_path 查找对应的 transcript_id"""
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id FROM transcripts
                    WHERE media_path = %s
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (media_path,),
                )
                row = cur.fetchone()
                return int(row[0]) if row else None
    finally:
        conn.close()


# ------ jobs minimal queue ------

def create_job(db_url: Optional[str], url: str) -> int:
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO jobs (url, status) VALUES (%s, %s) RETURNING id",
                    (url, 'pending'),
                )
                row = cur.fetchone()
                if not row:
                    raise RuntimeError("Failed to insert job")
                rid = row[0]
                return int(rid)
    finally:
        conn.close()


def get_job(db_url: Optional[str], job_id: int) -> Optional[Dict[str, Any]]:
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT id, url, status, created_at, started_at, finished_at, result_json, error FROM jobs WHERE id = %s",
                    (int(job_id),),
                )
                row = cur.fetchone()
                if not row:
                    return None
                try:
                    result = json.loads(row["result_json"]) if row["result_json"] else None
                except Exception:
                    result = None
                return {
                    "id": int(row["id"]),
                    "url": str(row["url"]),
                    "status": str(row["status"]),
                    "created_at": str(row["created_at"]) if row["created_at"] else None,
                    "started_at": str(row["started_at"]) if row["started_at"] else None,
                    "finished_at": str(row["finished_at"]) if row["finished_at"] else None,
                    "result": result,
                    "error": str(row["error"]) if row["error"] else None,
                }
    finally:
        conn.close()


def list_jobs(db_url: Optional[str], status: Optional[str] = None, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if status:
                    cur.execute(
                        "SELECT id, url, status, created_at, started_at, finished_at, result_json, error FROM jobs WHERE status = %s ORDER BY id DESC LIMIT %s OFFSET %s",
                        (status, int(limit), int(offset)),
                    )
                else:
                    cur.execute(
                        "SELECT id, url, status, created_at, started_at, finished_at, result_json, error FROM jobs ORDER BY id DESC LIMIT %s OFFSET %s",
                        (int(limit), int(offset)),
                    )
                rows = cur.fetchall()
                items: List[Dict[str, Any]] = []
                for r in rows:
                    try:
                        result = json.loads(r["result_json"]) if r["result_json"] else None
                    except Exception:
                        result = None
                    items.append({
                        "id": int(r["id"]),
                        "url": str(r["url"]),
                        "status": str(r["status"]),
                        "created_at": str(r["created_at"]) if r["created_at"] else None,
                        "started_at": str(r["started_at"]) if r["started_at"] else None,
                        "finished_at": str(r["finished_at"]) if r["finished_at"] else None,
                        "result": result,
                        "error": str(r["error"]) if r["error"] else None,
                    })
                return items
    finally:
        conn.close()


def claim_next_pending_job(db_url: Optional[str]) -> Optional[Dict[str, Any]]:
    """原子领取一条 pending 任务并置为 running，返回任务信息。"""
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        # 使用事务与 SELECT ... FOR UPDATE SKIP LOCKED 来安全并发领取
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, url FROM jobs
                    WHERE status = 'pending'
                    ORDER BY id ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                    """
                )
                row = cur.fetchone()
                if row:
                    rid = int(row["id"])
                    url = row["url"]
                    cur.execute(
                        "UPDATE jobs SET status = 'running', started_at = now() WHERE id = %s",
                        (rid,),
                    )
                    return {"id": rid, "url": str(url)}

                # 没有 pending，则尝试领取未完成的 running（finished_at 为空）以实现重启恢复
                cur.execute(
                    """
                    SELECT id, url FROM jobs
                    WHERE status = 'running' AND finished_at IS NULL
                    ORDER BY started_at ASC
                    LIMIT 1
                    """
                )
                row2 = cur.fetchone()
                if not row2:
                    return None
                rid2 = int(row2["id"])
                url2 = row2["url"]
                return {"id": rid2, "url": str(url2)}
    finally:
        conn.close()


def finish_job_success(db_url: Optional[str], job_id: int, result: Dict[str, Any]) -> None:
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE jobs SET status = 'success', finished_at = now(), result_json = %s WHERE id = %s",
                    (json.dumps(result, ensure_ascii=False), int(job_id)),
                )
    finally:
        conn.close()


def finish_job_failed(db_url: Optional[str], job_id: int, error: str) -> None:
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE jobs SET status = 'failed', finished_at = now(), error = %s WHERE id = %s",
                    (error, int(job_id)),
                )
    finally:
        conn.close()


def delete_transcript(db_url: Optional[str], transcript_id: int) -> bool:
    """删除指定的转写记录。
    返回: True 如果删除成功，False 如果记录不存在
    """
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM transcripts WHERE id = %s",
                    (int(transcript_id),),
                )
                return cur.rowcount > 0
    finally:
        conn.close()


def update_job_result(db_url: Optional[str], job_id: int, patch: Dict[str, Any], status: Optional[str] = None) -> None:
    """合并写入 jobs.result_json，可选同时更新 status。
    - 若现有 result_json 不存在或非 JSON，则以 patch 作为新值。
    - status 若提供，则一并更新。
    """
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT result_json FROM jobs WHERE id = %s",
                    (int(job_id),),
                )
                row = cur.fetchone()
                current: Dict[str, Any]
                if row:
                    result_json = row.get("result_json")
                    if result_json and result_json.strip():
                        try:
                            current = json.loads(result_json)
                            if not isinstance(current, dict):
                                current = {}
                        except Exception:
                            current = {}
                    else:
                        current = {}
                else:
                    current = {}

                current.update(patch or {})
                if status:
                    cur.execute(
                        "UPDATE jobs SET result_json = %s, status = %s WHERE id = %s",
                        (json.dumps(current, ensure_ascii=False), status, int(job_id)),
                    )
                else:
                    cur.execute(
                        "UPDATE jobs SET result_json = %s WHERE id = %s",
                        (json.dumps(current, ensure_ascii=False), int(job_id)),
                    )
    finally:
        conn.close()


def save_summaries(db_url: Optional[str], transcript_id: int, summaries: List[Dict[str, Any]]) -> int:
    """保存摘要到 summaries 表。
    返回: 新创建的摘要记录 id
    """
    import logging
    logger = logging.getLogger("pg_store")

    conn_params = _ensure_conn_params(db_url)
    data = json.dumps(summaries, ensure_ascii=False)
    logger.info(f"准备保存摘要: transcript_id={transcript_id}, 摘要数量={len(summaries)}")

    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO summaries (transcript_id, summaries_json) VALUES (%s, %s) RETURNING id",
                    (int(transcript_id), data),
                )
                row = cur.fetchone()
                if not row:
                    raise RuntimeError("Failed to insert summaries")
                rid = row[0]
                logger.info(f"摘要保存成功: summary_id={rid}")
                return int(rid)
    finally:
        conn.close()


def get_summaries_by_transcript_id(db_url: Optional[str], transcript_id: int) -> Optional[List[Dict[str, Any]]]:
    """根据 transcript_id 获取最新的摘要记录。"""
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, summaries_json, created_at
                    FROM summaries
                    WHERE transcript_id = %s
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (int(transcript_id),),
                )
                row = cur.fetchone()
                if not row:
                    return None
                try:
                    summaries = json.loads(row["summaries_json"])
                    return summaries if isinstance(summaries, list) else []
                except Exception:
                    return None
    finally:
        conn.close()


def list_summaries_meta(db_url: Optional[str], limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    """列出所有摘要记录的元信息。
    返回: [{id, transcript_id, created_at, summary_count}]
    """
    conn_params = _ensure_conn_params(db_url)
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, transcript_id, summaries_json, created_at
                    FROM summaries
                    ORDER BY id DESC
                    LIMIT %s OFFSET %s
                    """,
                    (int(limit), int(offset)),
                )
                rows = cur.fetchall()
                items: List[Dict[str, Any]] = []
                for r in rows:
                    rid = r["id"]
                    transcript_id = r["transcript_id"]
                    summaries_json = r["summaries_json"]
                    created_at = r["created_at"]
                    try:
                        summaries = json.loads(summaries_json)
                        summary_count = len(summaries) if isinstance(summaries, list) else 0
                    except Exception:
                        summary_count = 0
                    items.append({
                        "id": int(rid),
                        "transcript_id": int(transcript_id),
                        "created_at": str(created_at),
                        "summary_count": int(summary_count),
                    })
                return items
    finally:
        conn.close()


def save_chat_message(
    db_url: Optional[str],
    session_id: str,
    role: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None
) -> int:
    """保存对话消息到历史记录。

    Args:
        db_url: 数据库连接
        session_id: 会话ID
        role: 角色（user/assistant）
        content: 消息内容
        metadata: 额外元数据（可选）

    Returns:
        int: 新创建的消息记录ID
    """
    conn_params = _ensure_conn_params(db_url)
    metadata_json = json.dumps(metadata or {}, ensure_ascii=False)

    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO chat_history (session_id, role, content, metadata)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                    """,
                    (session_id, role, content, metadata_json),
                )
                row = cur.fetchone()
                if not row:
                    raise RuntimeError("Failed to insert chat message")
                return int(row[0])
    finally:
        conn.close()


def get_chat_history(
    db_url: Optional[str],
    session_id: str,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """获取指定会话的对话历史。

    Args:
        db_url: 数据库连接
        session_id: 会话ID
        limit: 返回最近的消息数量

    Returns:
        List[Dict]: 对话历史列表 [{id, role, content, metadata, created_at}]
    """
    conn_params = _ensure_conn_params(db_url)

    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, session_id, role, content, metadata, created_at
                    FROM chat_history
                    WHERE session_id = %s
                    ORDER BY created_at ASC
                    LIMIT %s
                    """,
                    (session_id, int(limit)),
                )
                rows = cur.fetchall()
                items: List[Dict[str, Any]] = []
                for r in rows:
                    # JSONB 字段会被 psycopg2 自动解析为 Python dict，不需要 json.loads
                    metadata = r["metadata"] if r["metadata"] else {}

                    items.append({
                        "id": int(r["id"]),
                        "session_id": str(r["session_id"]),
                        "role": str(r["role"]),
                        "content": str(r["content"]),
                        "metadata": metadata,
                        "created_at": str(r["created_at"]),
                    })
                return items
    finally:
        conn.close()


def delete_chat_session(db_url: Optional[str], session_id: str) -> bool:
    """删除指定会话的所有对话记录。

    Args:
        db_url: 数据库连接
        session_id: 会话ID

    Returns:
        bool: 是否删除成功
    """
    conn_params = _ensure_conn_params(db_url)

    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM chat_history WHERE session_id = %s",
                    (session_id,),
                )
                return cur.rowcount > 0
    finally:
        conn.close()


def get_config(db_url: Optional[str], config_key: str) -> Optional[str]:
    """获取系统配置。

    Args:
        db_url: 数据库连接
        config_key: 配置键

    Returns:
        Optional[str]: 配置值，如果不存在返回 None
    """
    conn_params = _ensure_conn_params(db_url)

    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT config_value FROM system_config WHERE config_key = %s",
                    (config_key,),
                )
                row = cur.fetchone()
                return str(row["config_value"]) if row else None
    finally:
        conn.close()


def get_all_configs(db_url: Optional[str]) -> Dict[str, str]:
    """获取所有系统配置。

    Args:
        db_url: 数据库连接

    Returns:
        Dict[str, str]: 配置字典
    """
    conn_params = _ensure_conn_params(db_url)

    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT config_key, config_value FROM system_config")
                rows = cur.fetchall()
                return {str(row["config_key"]): str(row["config_value"]) for row in rows}
    finally:
        conn.close()


def update_config(db_url: Optional[str], config_key: str, config_value: str) -> bool:
    """更新系统配置。

    Args:
        db_url: 数据库连接
        config_key: 配置键
        config_value: 配置值

    Returns:
        bool: 是否更新成功
    """
    conn_params = _ensure_conn_params(db_url)

    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])  # type: ignore[arg-type]
    else:
        conn = psycopg2.connect(**conn_params)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO system_config (config_key, config_value, updated_at)
                    VALUES (%s, %s, now())
                    ON CONFLICT (config_key)
                    DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = now()
                    """,
                    (config_key, config_value),
                )
                return True
    finally:
        conn.close()
