# -*- coding: utf-8 -*-
"""
OSS 客户端工具
负责将视频文件上传到阿里云 OSS 并获取公网访问 URL
"""
import os
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Callable

logger = logging.getLogger(__name__)


class OSSClient:
    """阿里云 OSS 客户端"""

    def __init__(self):
        """初始化 OSS 客户端"""
        self.enabled = os.getenv("OSS_ENABLED", "false").lower() == "true"
        self.provider = os.getenv("OSS_PROVIDER", "aliyun")
        self.access_key_id = os.getenv("OSS_ACCESS_KEY_ID", "")
        self.access_key_secret = os.getenv("OSS_ACCESS_KEY_SECRET", "")
        self.region = os.getenv("OSS_REGION", "oss-cn-shanghai")
        self.bucket_name = os.getenv("OSS_BUCKET", "")
        self.endpoint = os.getenv("OSS_ENDPOINT", "https://oss-cn-shanghai.aliyuncs.com")
        self.path_prefix = os.getenv("OSS_PATH_PREFIX", "videos/")
        self.public_access = os.getenv("OSS_PUBLIC_ACCESS", "true").lower() == "true"

        self.bucket = None
        if self.enabled:
            self._init_client()

    def _init_client(self):
        """初始化阿里云 OSS 客户端"""
        if self.provider != "aliyun":
            logger.warning(f"Unsupported OSS provider: {self.provider}, only 'aliyun' is supported")
            self.enabled = False
            return

        if not all([self.access_key_id, self.access_key_secret, self.bucket_name]):
            logger.warning("OSS configuration incomplete, disabling OSS upload")
            self.enabled = False
            return

        try:
            import oss2

            auth = oss2.Auth(self.access_key_id, self.access_key_secret)
            self.bucket = oss2.Bucket(auth, self.endpoint, self.bucket_name)
            logger.info(f"OSS client initialized: bucket={self.bucket_name}, region={self.region}")
        except ImportError:
            logger.error("oss2 library not installed. Run: pip install oss2")
            self.enabled = False
        except Exception as e:
            logger.error(f"Failed to initialize OSS client: {e}")
            self.enabled = False

    def is_enabled(self) -> bool:
        """检查 OSS 是否启用"""
        return self.enabled and self.bucket is not None

    def upload_file(
        self,
        local_path: str,
        remote_key: Optional[str] = None,
        callback: Optional[Callable[[int, int], None]] = None
    ) -> Dict:
        """
        上传文件到 OSS

        Args:
            local_path: 本地文件路径
            remote_key: OSS 对象键 (可选，默认自动生成)
            callback: 进度回调函数 (consumed_bytes, total_bytes)

        Returns:
            {
                "success": bool,
                "url": str,           # 公网访问 URL
                "oss_key": str,       # OSS 对象键
                "size": int,          # 文件大小
                "error": str          # 错误信息 (如果失败)
            }
        """
        result = {
            "success": False,
            "url": "",
            "oss_key": "",
            "size": 0,
            "error": ""
        }

        if not self.is_enabled():
            result["error"] = "OSS is not enabled or not properly configured"
            return result

        try:
            # 验证文件存在
            if not os.path.exists(local_path):
                result["error"] = f"File not found: {local_path}"
                return result

            # 获取文件大小
            file_size = os.path.getsize(local_path)
            result["size"] = file_size

            # 生成 OSS 对象键
            if not remote_key:
                remote_key = self._generate_object_key(local_path)
            result["oss_key"] = remote_key

            logger.info(f"Uploading {local_path} to OSS as {remote_key}")

            # 上传文件
            if callback:
                def progress_callback(consumed, total):
                    callback(consumed, total)
                self.bucket.put_object_from_file(
                    remote_key,
                    local_path,
                    progress_callback=progress_callback
                )
            else:
                self.bucket.put_object_from_file(remote_key, local_path)

            # 生成公网 URL
            url = self.get_public_url(remote_key)
            result["success"] = True
            result["url"] = url
            logger.info(f"Upload successful: {url}")

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"Upload failed: {e}")

        return result

    def _generate_object_key(self, local_path: str) -> str:
        """
        生成 OSS 对象键

        格式: {path_prefix}/{date}/{uuid}_{filename}
        例如: videos/2025-12-07/abc123_output.mp4

        Args:
            local_path: 本地文件路径

        Returns:
            OSS 对象键
        """
        filename = os.path.basename(local_path)
        unique_id = str(uuid.uuid4())[:8]
        date_str = datetime.now().strftime("%Y-%m-%d")

        prefix = self.path_prefix
        if prefix and not prefix.endswith('/'):
            prefix += '/'

        return f"{prefix}{date_str}/{unique_id}_{filename}"

    def get_public_url(self, object_key: str) -> str:
        """
        获取公网访问 URL

        Args:
            object_key: 对象键

        Returns:
            公网 URL
        """
        # OSS 公网访问格式: https://{bucket}.{endpoint}/{object_key}
        endpoint = self.endpoint
        if endpoint.startswith('https://'):
            endpoint = endpoint[8:]
        elif endpoint.startswith('http://'):
            endpoint = endpoint[7:]

        return f"https://{self.bucket_name}.{endpoint}/{object_key}"

    def delete_file(self, object_key: str) -> bool:
        """
        删除 OSS 文件

        Args:
            object_key: 对象键

        Returns:
            是否成功
        """
        if not self.is_enabled():
            return False

        try:
            self.bucket.delete_object(object_key)
            logger.info(f"Deleted OSS object: {object_key}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete OSS object: {e}")
            return False

    def file_exists(self, object_key: str) -> bool:
        """
        检查文件是否存在

        Args:
            object_key: 对象键

        Returns:
            是否存在
        """
        if not self.is_enabled():
            return False

        try:
            return self.bucket.object_exists(object_key)
        except Exception as e:
            logger.error(f"Failed to check file existence: {e}")
            return False


# 全局单例
_oss_client: Optional[OSSClient] = None


def get_oss_client() -> OSSClient:
    """获取 OSS 客户端单例"""
    global _oss_client
    if _oss_client is None:
        _oss_client = OSSClient()
    return _oss_client


def upload_video_to_oss(local_path: str, remote_key: Optional[str] = None) -> Dict:
    """
    便捷函数：上传视频到 OSS

    Args:
        local_path: 本地视频路径
        remote_key: 可选的 OSS 对象键

    Returns:
        上传结果字典
    """
    client = get_oss_client()
    return client.upload_file(local_path, remote_key)


def is_oss_url(url: str) -> bool:
    """
    检查 URL 是否为 OSS URL

    Args:
        url: URL 字符串

    Returns:
        是否为 OSS URL
    """
    if not url:
        return False
    oss_patterns = [
        ".aliyuncs.com/",
        ".oss-cn-",
        "oss://",
    ]
    return any(pattern in url for pattern in oss_patterns)


def extract_oss_key_from_url(oss_url: str) -> Optional[str]:
    """
    从 OSS URL 中提取对象键

    Args:
        oss_url: OSS URL，格式如 https://bucket.oss-cn-shanghai.aliyuncs.com/videos/2025-12-07/abc123_video.mp4

    Returns:
        对象键，如 videos/2025-12-07/abc123_video.mp4
    """
    if not oss_url or not is_oss_url(oss_url):
        return None

    try:
        from urllib.parse import urlparse
        parsed = urlparse(oss_url)
        # 路径以 / 开头，去掉开头的 /
        object_key = parsed.path.lstrip('/')
        return object_key if object_key else None
    except Exception as e:
        logger.error(f"Failed to extract OSS key from URL: {e}")
        return None


def delete_oss_file_by_url(oss_url: str) -> bool:
    """
    通过 OSS URL 删除文件

    Args:
        oss_url: OSS URL

    Returns:
        是否删除成功
    """
    object_key = extract_oss_key_from_url(oss_url)
    if not object_key:
        logger.warning(f"Cannot extract object key from URL: {oss_url}")
        return False

    client = get_oss_client()
    if not client.is_enabled():
        logger.warning("OSS client not enabled, cannot delete file")
        return False

    return client.delete_file(object_key)
