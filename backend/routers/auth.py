# -*- coding: utf-8 -*-
"""
用户认证相关的API路由
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import hashlib
import jwt
import datetime
from backend.db.pg_store import _ensure_conn_params
import psycopg2
from psycopg2.extras import RealDictCursor

router = APIRouter(prefix="/api/auth", tags=["认证"])
security = HTTPBearer()

# JWT 配置
SECRET_KEY = "hearsight-secret-key-change-in-production"  # 生产环境应使用环境变量
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 24 * 60  # 24 小时


# ===== 请求模型 =====

class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    username: str
    is_admin: bool


class UserInfo(BaseModel):
    id: int
    username: str
    email: Optional[str]
    is_admin: bool
    is_active: bool
    created_at: str


# ===== 辅助函数 =====

def hash_password(password: str) -> str:
    """哈希密码"""
    return hashlib.sha256(password.encode()).hexdigest()


def create_access_token(user_id: int, username: str, is_admin: bool) -> str:
    """创建 JWT token"""
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "username": username,
        "is_admin": is_admin,
        "exp": expire
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    """验证 JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 已过期"
        )
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 Token"
        )


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """从 token 获取当前用户信息"""
    token = credentials.credentials
    return verify_token(token)


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """要求管理员权限"""
    if not user.get("is_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    return user


# ===== API 路由 =====

@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """用户登录"""
    conn_params = _ensure_conn_params()
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])
    else:
        conn = psycopg2.connect(**conn_params)

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 查找用户
                cur.execute("""
                    SELECT id, username, password_hash, is_admin, is_active
                    FROM users
                    WHERE username = %s
                """, (request.username,))

                user = cur.fetchone()

                if not user:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="用户名或密码错误"
                    )

                if not user['is_active']:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="账号已被禁用"
                    )

                # 验证密码
                password_hash = hash_password(request.password)
                if password_hash != user['password_hash']:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="用户名或密码错误"
                    )

                # 更新最后登录时间
                cur.execute("""
                    UPDATE users SET last_login = NOW() WHERE id = %s
                """, (user['id'],))

                # 创建 token
                access_token = create_access_token(
                    user_id=user['id'],
                    username=user['username'],
                    is_admin=user['is_admin']
                )

                return TokenResponse(
                    access_token=access_token,
                    token_type="bearer",
                    user_id=user['id'],
                    username=user['username'],
                    is_admin=user['is_admin']
                )

    finally:
        conn.close()


@router.post("/register", response_model=TokenResponse)
async def register(request: RegisterRequest):
    """用户注册"""

    # 检查是否允许注册
    conn_params = _ensure_conn_params()
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])
    else:
        conn = psycopg2.connect(**conn_params)

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 检查系统设置是否允许注册
                cur.execute("""
                    SELECT value FROM system_settings WHERE key = 'allow_registration'
                """)
                setting = cur.fetchone()
                if setting and setting['value'].lower() != 'true':
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="系统当前不允许注册新用户"
                    )

                # 检查用户名是否已存在
                cur.execute("""
                    SELECT id FROM users WHERE username = %s
                """, (request.username,))

                if cur.fetchone():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="用户名已存在"
                    )

                # 检查邮箱是否已存在
                if request.email:
                    cur.execute("""
                        SELECT id FROM users WHERE email = %s
                    """, (request.email,))
                    if cur.fetchone():
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="邮箱已被使用"
                        )

                # 创建用户
                password_hash = hash_password(request.password)
                cur.execute("""
                    INSERT INTO users (username, password_hash, email, is_admin, is_active)
                    VALUES (%s, %s, %s, FALSE, TRUE)
                    RETURNING id, username, is_admin
                """, (request.username, password_hash, request.email))

                user = cur.fetchone()

                # 创建 token
                access_token = create_access_token(
                    user_id=user['id'],
                    username=user['username'],
                    is_admin=user['is_admin']
                )

                return TokenResponse(
                    access_token=access_token,
                    token_type="bearer",
                    user_id=user['id'],
                    username=user['username'],
                    is_admin=user['is_admin']
                )

    finally:
        conn.close()


@router.get("/me", response_model=UserInfo)
async def get_current_user_info(user: dict = Depends(get_current_user)):
    """获取当前用户信息"""
    conn_params = _ensure_conn_params()
    if "dsn" in conn_params:
        conn = psycopg2.connect(conn_params["dsn"])
    else:
        conn = psycopg2.connect(**conn_params)

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, username, email, is_admin, is_active, created_at
                    FROM users
                    WHERE id = %s
                """, (int(user['sub']),))

                user_data = cur.fetchone()

                if not user_data:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="用户不存在"
                    )

                return UserInfo(
                    id=user_data['id'],
                    username=user_data['username'],
                    email=user_data['email'],
                    is_admin=user_data['is_admin'],
                    is_active=user_data['is_active'],
                    created_at=str(user_data['created_at'])
                )

    finally:
        conn.close()


@router.post("/verify")
async def verify_token_endpoint(user: dict = Depends(get_current_user)):
    """验证 token 是否有效"""
    return {"valid": True, "user_id": user['sub'], "username": user['username']}
