# -*- coding: utf-8 -*-
"""
管理后台的API路由
包含用户管理和视频管理功能
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from backend.routers.auth import require_admin, get_current_user, hash_password
from backend.db.pg_store import _ensure_conn_params
import psycopg2
from psycopg2.extras import RealDictCursor

router = APIRouter(prefix="/api/admin-panel", tags=["管理后台"])


# ===== 请求/响应模型 =====

class UserListResponse(BaseModel):
    users: List[dict]
    total: int
    page: int
    page_size: int


class UserCreateRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    is_admin: bool = False


class UserUpdateRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class VideoListResponse(BaseModel):
    videos: List[dict]
    total: int
    page: int
    page_size: int


class SystemStatsResponse(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    total_videos: int
    total_jobs: int
    pending_jobs: int
    failed_jobs: int


# ===== 用户管理接口 =====

@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    is_admin: Optional[bool] = None,
    is_active: Optional[bool] = None,
    admin_user: dict = Depends(require_admin)
):
    """获取用户列表（需要管理员权限）"""
    conn_params = _ensure_conn_params()
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])
    else:
        conn = psycopg2.connect(**conn_params)

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 构建查询条件
                where_clauses = []
                params = []

                if search:
                    where_clauses.append("(username ILIKE %s OR email ILIKE %s)")
                    search_pattern = f"%{search}%"
                    params.extend([search_pattern, search_pattern])

                if is_admin is not None:
                    where_clauses.append("is_admin = %s")
                    params.append(is_admin)

                if is_active is not None:
                    where_clauses.append("is_active = %s")
                    params.append(is_active)

                where_clause = " AND ".join(where_clauses) if where_clauses else "TRUE"

                # 查询总数
                cur.execute(
                    f"SELECT COUNT(*) FROM users WHERE {where_clause}",
                    params
                )
                total = cur.fetchone()["count"]

                # 查询用户列表
                offset = (page - 1) * page_size
                cur.execute(
                    f"""
                    SELECT id, username, email, is_admin, is_active, created_at, last_login
                    FROM users
                    WHERE {where_clause}
                    ORDER BY id DESC
                    LIMIT %s OFFSET %s
                    """,
                    params + [page_size, offset]
                )
                users = cur.fetchall()

                return UserListResponse(
                    users=[dict(user) for user in users],
                    total=total,
                    page=page,
                    page_size=page_size
                )

    finally:
        conn.close()


@router.post("/users")
async def create_user(
    request: UserCreateRequest,
    admin_user: dict = Depends(require_admin)
):
    """创建新用户（需要管理员权限）"""
    conn_params = _ensure_conn_params()
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])
    else:
        conn = psycopg2.connect(**conn_params)

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 检查用户名是否已存在
                cur.execute("SELECT id FROM users WHERE username = %s", (request.username,))
                if cur.fetchone():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="用户名已存在"
                    )

                # 检查邮箱是否已存在
                if request.email:
                    cur.execute("SELECT id FROM users WHERE email = %s", (request.email,))
                    if cur.fetchone():
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="邮箱已被使用"
                        )

                # 创建用户
                password_hash = hash_password(request.password)
                cur.execute(
                    """
                    INSERT INTO users (username, password_hash, email, is_admin, is_active)
                    VALUES (%s, %s, %s, %s, TRUE)
                    RETURNING id, username, email, is_admin, is_active, created_at
                    """,
                    (request.username, password_hash, request.email, request.is_admin)
                )
                user = cur.fetchone()

                return {"success": True, "user": dict(user)}

    finally:
        conn.close()


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    admin_user: dict = Depends(require_admin)
):
    """获取用户详情（需要管理员权限）"""
    conn_params = _ensure_conn_params()
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])
    else:
        conn = psycopg2.connect(**conn_params)

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, username, email, is_admin, is_active, created_at, last_login
                    FROM users
                    WHERE id = %s
                    """,
                    (user_id,)
                )
                user = cur.fetchone()

                if not user:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="用户不存在"
                    )

                return dict(user)

    finally:
        conn.close()


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    request: UserUpdateRequest,
    admin_user: dict = Depends(require_admin)
):
    """更新用户信息（需要管理员权限）"""
    conn_params = _ensure_conn_params()
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])
    else:
        conn = psycopg2.connect(**conn_params)

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 检查用户是否存在
                cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
                if not cur.fetchone():
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="用户不存在"
                    )

                # 构建更新语句
                update_fields = []
                params = []

                if request.username is not None:
                    # 检查用户名是否已被其他用户使用
                    cur.execute(
                        "SELECT id FROM users WHERE username = %s AND id != %s",
                        (request.username, user_id)
                    )
                    if cur.fetchone():
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="用户名已存在"
                        )
                    update_fields.append("username = %s")
                    params.append(request.username)

                if request.email is not None:
                    # 检查邮箱是否已被其他用户使用
                    cur.execute(
                        "SELECT id FROM users WHERE email = %s AND id != %s",
                        (request.email, user_id)
                    )
                    if cur.fetchone():
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="邮箱已被使用"
                        )
                    update_fields.append("email = %s")
                    params.append(request.email)

                if request.is_admin is not None:
                    update_fields.append("is_admin = %s")
                    params.append(request.is_admin)

                if request.is_active is not None:
                    update_fields.append("is_active = %s")
                    params.append(request.is_active)

                if request.password is not None:
                    password_hash = hash_password(request.password)
                    update_fields.append("password_hash = %s")
                    params.append(password_hash)

                if not update_fields:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="没有需要更新的字段"
                    )

                # 执行更新
                params.append(user_id)
                cur.execute(
                    f"""
                    UPDATE users
                    SET {", ".join(update_fields)}
                    WHERE id = %s
                    RETURNING id, username, email, is_admin, is_active, created_at, last_login
                    """,
                    params
                )
                user = cur.fetchone()

                return {"success": True, "user": dict(user)}

    finally:
        conn.close()


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin_user: dict = Depends(require_admin)
):
    """删除用户（需要管理员权限）"""
    conn_params = _ensure_conn_params()
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])
    else:
        conn = psycopg2.connect(**conn_params)

    try:
        with conn:
            with conn.cursor() as cur:
                # 防止删除自己
                if user_id == int(admin_user['sub']):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="不能删除自己"
                    )

                # 删除用户
                cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
                if cur.rowcount == 0:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="用户不存在"
                    )

                return {"success": True, "message": "用户已删除"}

    finally:
        conn.close()


# ===== 视频管理接口 =====

@router.get("/videos", response_model=VideoListResponse)
async def list_videos(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    admin_user: dict = Depends(require_admin)
):
    """获取视频列表（需要管理员权限）"""
    conn_params = _ensure_conn_params()
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])
    else:
        conn = psycopg2.connect(**conn_params)

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 构建查询条件
                where_clause = "TRUE"
                params = []

                if search:
                    where_clause = "media_path ILIKE %s"
                    params.append(f"%{search}%")

                # 查询总数
                cur.execute(
                    f"SELECT COUNT(*) FROM transcripts WHERE {where_clause}",
                    params
                )
                total = cur.fetchone()["count"]

                # 查询视频列表（联合 summaries 表获取摘要信息）
                offset = (page - 1) * page_size
                cur.execute(
                    f"""
                    SELECT
                        t.id,
                        t.media_path,
                        t.created_at,
                        json_array_length(t.segments_json::json) as segment_count,
                        EXISTS(SELECT 1 FROM summaries s WHERE s.transcript_id = t.id) as has_summary
                    FROM transcripts t
                    WHERE {where_clause}
                    ORDER BY t.id DESC
                    LIMIT %s OFFSET %s
                    """,
                    params + [page_size, offset]
                )
                videos = cur.fetchall()

                return VideoListResponse(
                    videos=[dict(video) for video in videos],
                    total=total,
                    page=page,
                    page_size=page_size
                )

    finally:
        conn.close()


@router.get("/videos/{video_id}")
async def get_video(
    video_id: int,
    admin_user: dict = Depends(require_admin)
):
    """获取视频详情（需要管理员权限）"""
    conn_params = _ensure_conn_params()
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])
    else:
        conn = psycopg2.connect(**conn_params)

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT
                        t.id,
                        t.media_path,
                        t.created_at,
                        t.segments_json,
                        (SELECT summaries_json FROM summaries WHERE transcript_id = t.id ORDER BY id DESC LIMIT 1) as summaries_json
                    FROM transcripts t
                    WHERE t.id = %s
                    """,
                    (video_id,)
                )
                video = cur.fetchone()

                if not video:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="视频不存在"
                    )

                return dict(video)

    finally:
        conn.close()


@router.delete("/videos/{video_id}")
async def delete_video(
    video_id: int,
    admin_user: dict = Depends(require_admin)
):
    """删除视频（需要管理员权限）"""
    from backend.db.pg_store import delete_transcript

    try:
        success = delete_transcript(None, video_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="视频不存在"
            )

        return {"success": True, "message": "视频已删除"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"删除视频失败: {str(e)}"
        )


# ===== 系统统计接口 =====

@router.get("/stats", response_model=SystemStatsResponse)
async def get_system_stats(admin_user: dict = Depends(require_admin)):
    """获取系统统计数据（需要管理员权限）"""
    conn_params = _ensure_conn_params()
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])
    else:
        conn = psycopg2.connect(**conn_params)

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 用户统计
                cur.execute("SELECT COUNT(*) as total FROM users")
                total_users = cur.fetchone()["total"]

                cur.execute("SELECT COUNT(*) as total FROM users WHERE is_active = TRUE")
                active_users = cur.fetchone()["total"]

                cur.execute("SELECT COUNT(*) as total FROM users WHERE is_admin = TRUE")
                admin_users = cur.fetchone()["total"]

                # 视频统计
                cur.execute("SELECT COUNT(*) as total FROM transcripts")
                total_videos = cur.fetchone()["total"]

                # 任务统计
                cur.execute("SELECT COUNT(*) as total FROM jobs")
                total_jobs = cur.fetchone()["total"]

                cur.execute("SELECT COUNT(*) as total FROM jobs WHERE status = 'pending'")
                pending_jobs = cur.fetchone()["total"]

                cur.execute("SELECT COUNT(*) as total FROM jobs WHERE status = 'failed'")
                failed_jobs = cur.fetchone()["total"]

                return SystemStatsResponse(
                    total_users=total_users,
                    active_users=active_users,
                    admin_users=admin_users,
                    total_videos=total_videos,
                    total_jobs=total_jobs,
                    pending_jobs=pending_jobs,
                    failed_jobs=failed_jobs
                )

    finally:
        conn.close()
