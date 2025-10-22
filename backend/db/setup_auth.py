"""
设置用户认证系统的数据库表
"""
import os
import sys
import psycopg2
from psycopg2 import sql
from typing import Optional
import hashlib
from pathlib import Path

# 加载 .env 文件
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent.parent / ".env"
    load_dotenv(env_path)
except ImportError:
    print("警告: python-dotenv 未安装，将使用环境变量")


def hash_password(password: str) -> str:
    """使用 SHA256 哈希密码"""
    return hashlib.sha256(password.encode()).hexdigest()


def _get_db_params():
    """从环境变量获取数据库连接参数"""
    return {
        "host": os.environ.get("POSTGRES_HOST", "127.0.0.1"),
        "port": int(os.environ.get("POSTGRES_PORT", 5432)),
        "user": os.environ.get("POSTGRES_USER", "postgres"),
        "password": os.environ.get("POSTGRES_PASSWORD", ""),
        "dbname": os.environ.get("POSTGRES_DB", "hearsight")
    }


def setup_auth_tables(db_url: Optional[str] = None):
    """创建用户认证相关的表"""

    if db_url:
        conn = psycopg2.connect(db_url)
    else:
        params = _get_db_params()
        conn = psycopg2.connect(**params)

    try:
        with conn:
            with conn.cursor() as cur:
                # 创建用户表
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(50) UNIQUE NOT NULL,
                        password_hash VARCHAR(64) NOT NULL,
                        email VARCHAR(100) UNIQUE,
                        is_admin BOOLEAN DEFAULT FALSE,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP DEFAULT NOW(),
                        last_login TIMESTAMP
                    );
                """)

                # 创建系统设置表
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS system_settings (
                        id SERIAL PRIMARY KEY,
                        key VARCHAR(100) UNIQUE NOT NULL,
                        value TEXT,
                        description TEXT,
                        updated_at TIMESTAMP DEFAULT NOW(),
                        updated_by INTEGER REFERENCES users(id)
                    );
                """)

                # 创建索引
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
                """)

                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_settings_key ON system_settings(key);
                """)

                print("[OK] 用户认证表创建成功")

    finally:
        conn.close()


def create_admin_user(username: str = "admin", password: str = "admin123", db_url: Optional[str] = None):
    """创建默认管理员账号"""

    if db_url:
        conn = psycopg2.connect(db_url)
    else:
        params = _get_db_params()
        conn = psycopg2.connect(**params)

    try:
        with conn:
            with conn.cursor() as cur:
                # 检查管理员是否已存在
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                if cur.fetchone():
                    print(f"[WARN]  管理员账号 '{username}' 已存在")
                    return

                # 创建管理员
                password_hash = hash_password(password)
                cur.execute("""
                    INSERT INTO users (username, password_hash, is_admin, is_active)
                    VALUES (%s, %s, TRUE, TRUE)
                    RETURNING id
                """, (username, password_hash))

                admin_id = cur.fetchone()[0]
                print(f"[OK] 管理员账号创建成功")
                print(f"   用户名: {username}")
                print(f"   密码: {password}")
                print(f"   ID: {admin_id}")

    finally:
        conn.close()


def init_default_settings(db_url: Optional[str] = None):
    """初始化默认系统设置"""

    if db_url:
        conn = psycopg2.connect(db_url)
    else:
        params = _get_db_params()
        conn = psycopg2.connect(**params)

    default_settings = [
        ('openai_api_key', '', 'OpenAI API Key'),
        ('openai_base_url', 'https://api.siliconflow.cn/v1', 'OpenAI Base URL'),
        ('openai_model', 'deepseek-ai/DeepSeek-V3', 'OpenAI Model'),
        ('system_prompt', '你是一个专业的视频分析助手，帮助用户理解和分析视频内容。', '系统预设提示词'),
        ('allow_registration', 'true', '是否允许用户注册'),
    ]

    try:
        with conn:
            with conn.cursor() as cur:
                for key, value, description in default_settings:
                    cur.execute("""
                        INSERT INTO system_settings (key, value, description)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (key) DO NOTHING
                    """, (key, value, description))

                print("[OK] 默认系统设置初始化成功")

    finally:
        conn.close()


if __name__ == "__main__":
    print("=" * 60)
    print("初始化 HearSight 用户认证系统")
    print("=" * 60)

    try:
        # 创建表
        setup_auth_tables()

        # 创建管理员
        create_admin_user()

        # 初始化设置
        init_default_settings()

        print()
        print("=" * 60)
        print("[OK] 用户认证系统初始化完成")
        print("=" * 60)

    except Exception as e:
        print(f"[ERROR] 初始化失败: {e}")
        import traceback
        traceback.print_exc()
