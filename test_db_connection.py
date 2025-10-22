#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""测试 PostgreSQL 数据库连接"""

import os
from dotenv import load_dotenv
import psycopg2

# 加载环境变量
load_dotenv()

host = os.getenv('POSTGRES_HOST', '117.72.164.82')
port = os.getenv('POSTGRES_PORT', '5433')
user = os.getenv('POSTGRES_USER', 'admin')
password = os.getenv('POSTGRES_PASSWORD', 'Pg@Admin#2025!Secure')
database = os.getenv('POSTGRES_DB', 'hearsight')

print("=" * 60)
print("PostgreSQL 连接测试")
print("=" * 60)
print(f"主机: {host}")
print(f"端口: {port}")
print(f"用户: {user}")
print(f"密码: {'*' * len(password)}")
print(f"数据库: {database}")
print("=" * 60)

# 尝试连接到 postgres 默认数据库（不指定数据库）
print("\n[测试 1] 尝试连接到默认数据库 'postgres'...")
try:
    conn = psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database='postgres'  # 先连接默认数据库
    )
    print("✅ 成功连接到 postgres 数据库！")

    # 检查 hearsight 数据库是否存在
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (database,))
    exists = cursor.fetchone()

    if exists:
        print(f"✅ 数据库 '{database}' 已存在")
    else:
        print(f"⚠️  数据库 '{database}' 不存在，需要创建")
        # 尝试创建数据库
        try:
            conn.set_isolation_level(0)  # 自动提交模式
            cursor.execute(f"CREATE DATABASE {database}")
            print(f"✅ 成功创建数据库 '{database}'")
        except Exception as e:
            print(f"❌ 创建数据库失败: {e}")

    cursor.close()
    conn.close()

except psycopg2.OperationalError as e:
    print(f"❌ 连接失败: {e}")
    print("\n可能的原因:")
    print("1. 用户名或密码错误")
    print("2. 数据库服务未启动")
    print("3. 防火墙阻止连接")
    print("4. pg_hba.conf 未允许密码认证")
    exit(1)

# 尝试连接到 hearsight 数据库
print(f"\n[测试 2] 尝试连接到 '{database}' 数据库...")
try:
    conn = psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database
    )
    print(f"✅ 成功连接到 '{database}' 数据库！")

    # 测试查询
    cursor = conn.cursor()
    cursor.execute("SELECT version()")
    version = cursor.fetchone()[0]
    print(f"✅ PostgreSQL 版本: {version[:50]}...")

    cursor.close()
    conn.close()

    print("\n" + "=" * 60)
    print("🎉 数据库连接测试成功！可以启动 HearSight")
    print("=" * 60)

except psycopg2.OperationalError as e:
    print(f"❌ 连接失败: {e}")
    exit(1)
