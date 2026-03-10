#!/usr/bin/env python3
"""
初始化管理员配置 - 设置 DashScope API Key

用法:
    python3.8 init_dashscope_config.py
"""

import os
import sys

# 先加载 .env 文件中的环境变量
from config import load_config
load_config()

from backend.db.pg_store import update_config

# 你的 DashScope API Key
DASHSCOPE_API_KEY = "sk-f3a33d4760514c9fbe73783e8d245e8f"


def main():
    print("🔧 开始初始化 DashScope API Key 配置...")
    print(f"API Key: {DASHSCOPE_API_KEY[:20]}...")

    try:
        # 使用 None 让它从环境变量读取数据库配置
        update_config(None, "dashscope_api_key", DASHSCOPE_API_KEY)
        print("✅ DashScope API Key 已成功写入数据库！")
        print()
        print("📝 后续步骤:")
        print("1. 访问网站管理员设置页面")
        print("2. 进入 'AI 配置' 标签页")
        print("3. 可以在 '阿里云 DashScope API Key' 字段查看和修改 API Key")
        print()
        print("🎯 现在可以使用思维导图自动生成功能了！")

    except Exception as e:
        print(f"❌ 初始化失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
