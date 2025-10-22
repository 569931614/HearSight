#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
HearSight 数据库自动创建脚本
使用 admin 用户创建新数据库
"""
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import sys

print("=" * 70)
print("HearSight 数据库自动创建")
print("=" * 70)
print()

# 管理员配置
ADMIN_HOST = "117.72.164.82"
ADMIN_PORT = "5433"
ADMIN_USER = "admin"
ADMIN_PASSWORD = "Pg@Admin#2025!Secure"

# 新数据库配置
NEW_DB_NAME = "hearsight"
NEW_DB_USER = "hearsight_user"
NEW_DB_PASSWORD = "HearSight2025!Secure"

print(f"连接信息:")
print(f"  主机: {ADMIN_HOST}:{ADMIN_PORT}")
print(f"  管理员: {ADMIN_USER}")
print()
print(f"将创建:")
print(f"  数据库: {NEW_DB_NAME}")
print(f"  用户: {NEW_DB_USER}")
print()

try:
    # 先尝试连接到 postgres 数据库
    print("正在连接到 PostgreSQL...")
    conn = psycopg2.connect(
        host=ADMIN_HOST,
        port=ADMIN_PORT,
        user=ADMIN_USER,
        password=ADMIN_PASSWORD,
        database="postgres"
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()

    print("✅ 连接成功！")
    print()

    # 检查用户是否存在
    print(f"检查用户 '{NEW_DB_USER}' 是否存在...")
    cursor.execute(
        "SELECT 1 FROM pg_roles WHERE rolname = %s",
        (NEW_DB_USER,)
    )
    user_exists = cursor.fetchone()

    if not user_exists:
        print(f"创建用户 '{NEW_DB_USER}'...")
        cursor.execute(
            f"CREATE USER {NEW_DB_USER} WITH PASSWORD %s",
            (NEW_DB_PASSWORD,)
        )
        print(f"✅ 用户创建成功")
    else:
        print(f"⚠️  用户 '{NEW_DB_USER}' 已存在，将使用现有用户")
        # 更新密码
        cursor.execute(
            f"ALTER USER {NEW_DB_USER} WITH PASSWORD %s",
            (NEW_DB_PASSWORD,)
        )
        print(f"✅ 密码已更新")

    print()

    # 检查数据库是否存在
    print(f"检查数据库 '{NEW_DB_NAME}' 是否存在...")
    cursor.execute(
        "SELECT 1 FROM pg_database WHERE datname = %s",
        (NEW_DB_NAME,)
    )
    db_exists = cursor.fetchone()

    if not db_exists:
        print(f"创建数据库 '{NEW_DB_NAME}'...")
        cursor.execute(f"CREATE DATABASE {NEW_DB_NAME} OWNER {NEW_DB_USER}")
        print(f"✅ 数据库创建成功")
    else:
        print(f"⚠️  数据库 '{NEW_DB_NAME}' 已存在")
        # 授予权限
        print(f"授予 {NEW_DB_USER} 对数据库 {NEW_DB_NAME} 的权限...")
        cursor.execute(f"GRANT ALL PRIVILEGES ON DATABASE {NEW_DB_NAME} TO {NEW_DB_USER}")
        print(f"✅ 权限已授予")

    cursor.close()
    conn.close()

    print()

    # 连接到新数据库设置详细权限
    print(f"连接到数据库 '{NEW_DB_NAME}' 设置 schema 权限...")
    conn = psycopg2.connect(
        host=ADMIN_HOST,
        port=ADMIN_PORT,
        user=ADMIN_USER,
        password=ADMIN_PASSWORD,
        database=NEW_DB_NAME
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()

    cursor.execute(f"GRANT ALL ON SCHEMA public TO {NEW_DB_USER}")
    cursor.execute(f"GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO {NEW_DB_USER}")
    cursor.execute(f"GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO {NEW_DB_USER}")
    cursor.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO {NEW_DB_USER}")
    cursor.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO {NEW_DB_USER}")

    print(f"✅ Schema 权限设置完成")

    cursor.close()
    conn.close()

    print()
    print("=" * 70)
    print("🎉 数据库创建成功！")
    print("=" * 70)
    print()
    print("数据库配置信息:")
    print(f"  主机: {ADMIN_HOST}")
    print(f"  端口: {ADMIN_PORT}")
    print(f"  数据库: {NEW_DB_NAME}")
    print(f"  用户: {NEW_DB_USER}")
    print(f"  密码: {NEW_DB_PASSWORD}")
    print()
    print("✅ 配置已保存到 .env 文件")
    print()

    # 测试新用户连接
    print("测试新用户连接...")
    test_conn = psycopg2.connect(
        host=ADMIN_HOST,
        port=ADMIN_PORT,
        user=NEW_DB_USER,
        password=NEW_DB_PASSWORD,
        database=NEW_DB_NAME
    )
    test_cursor = test_conn.cursor()
    test_cursor.execute("SELECT version()")
    version = test_cursor.fetchone()[0]
    print(f"✅ 连接测试成功！PostgreSQL 版本: {version[:60]}...")
    test_cursor.close()
    test_conn.close()

    print()
    print("=" * 70)
    print("准备启动 HearSight...")
    print("=" * 70)

    sys.exit(0)

except psycopg2.OperationalError as e:
    print()
    print("=" * 70)
    print("❌ 数据库操作失败")
    print("=" * 70)
    print()
    print(f"错误信息: {e}")
    print()
    print("可能的原因:")
    print("1. admin 用户密码不正确")
    print("2. admin 用户没有创建数据库的权限")
    print("3. 数据库服务未启动")
    print("4. 网络连接问题")
    print()
    sys.exit(1)

except Exception as e:
    print()
    print("=" * 70)
    print("❌ 发生未知错误")
    print("=" * 70)
    print()
    print(f"错误信息: {e}")
    print()
    import traceback
    traceback.print_exc()
    print()
    sys.exit(1)
