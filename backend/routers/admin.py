# -*- coding: utf-8 -*-
"""
管理员配置相关的API路由
"""
from fastapi import APIRouter, HTTPException, status, Depends, Header
from pydantic import BaseModel
from typing import Optional
import os
from backend.db.pg_store import get_config, get_all_configs, update_config

router = APIRouter(prefix="/api/admin", tags=["管理员"])

db_url = os.environ.get("POSTGRES_DSN") or os.environ.get("DATABASE_URL") or None


# ===== 请求/响应模型 =====

class AdminLoginRequest(BaseModel):
    password: str


class AdminLoginResponse(BaseModel):
    success: bool
    token: str


class ConfigUpdateRequest(BaseModel):
    config_key: str
    config_value: str


class ConfigResponse(BaseModel):
    success: bool
    message: str


class AllConfigsResponse(BaseModel):
    configs: dict


# ===== 辅助函数 =====

def verify_admin_token(authorization: Optional[str] = Header(None)) -> bool:
    """验证管理员 token"""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证令牌"
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证令牌格式"
        )

    token = authorization[7:]  # 去掉 "Bearer " 前缀
    stored_token = get_config(db_url, "admin_token")

    if token != stored_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="认证令牌无效"
        )

    return True


# ===== API 路由 =====

@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(request: AdminLoginRequest):
    """管理员登录"""
    try:
        # 获取存储的管理员密码
        stored_password = get_config(db_url, "admin_password")

        if not stored_password:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="管理员密码未配置"
            )

        # 验证密码
        if request.password != stored_password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="密码错误"
            )

        # 生成简单的 token（实际生产环境应使用 JWT）
        import hashlib
        import time
        token = hashlib.sha256(f"admin_{time.time()}_{request.password}".encode()).hexdigest()

        # 保存 token 到配置
        update_config(db_url, "admin_token", token)

        return AdminLoginResponse(
            success=True,
            token=token
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"登录失败: {str(e)}"
        )


@router.get("/configs", response_model=AllConfigsResponse)
async def get_configs(authorized: bool = Depends(verify_admin_token)):
    """获取所有配置（需要管理员权限）"""
    try:
        configs = get_all_configs(db_url)
        # 不返回敏感信息
        safe_configs = {k: v for k, v in configs.items() if k not in ["admin_password", "admin_token"]}
        safe_configs["admin_password"] = "******"  # 隐藏密码

        return AllConfigsResponse(configs=safe_configs)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取配置失败: {str(e)}"
        )


@router.post("/configs", response_model=ConfigResponse)
async def update_configs(request: ConfigUpdateRequest, authorized: bool = Depends(verify_admin_token)):
    """更新配置（需要管理员权限）"""
    try:
        # 不允许通过此接口修改 admin_token
        if request.config_key == "admin_token":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不允许修改管理员令牌"
            )

        success = update_config(db_url, request.config_key, request.config_value)

        if success:
            return ConfigResponse(
                success=True,
                message=f"配置 {request.config_key} 已更新"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="更新配置失败"
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新配置失败: {str(e)}"
        )


@router.get("/config/{config_key}")
async def get_single_config(config_key: str):
    """获取单个配置（公开接口，用于获取网站标题等公开信息）"""
    try:
        # 只允许获取公开配置
        public_keys = ["site_title", "system_prompt"]

        if config_key not in public_keys:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="该配置不公开"
            )

        value = get_config(db_url, config_key)

        if value is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="配置不存在"
            )

        return {"config_key": config_key, "config_value": value}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取配置失败: {str(e)}"
        )
