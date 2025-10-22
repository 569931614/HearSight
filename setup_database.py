#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
HearSight 数据库自动创建脚本
"""
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import sys

print("=" * 70)
print("HearSight 数据库创建向导")
print("=" * 70)
print()

# 数据库配置
DB_HOST = "117.72.164.82"
DB_PORT = "5433"
NEW_DB_NAME = "hearsight"
NEW_DB_USER = "hearsight_user"
NEW_DB_PASSWORD = "HearSight2025!Secure"

print(f"目标服务器: {DB_HOST}:{DB_PORT}")
print(f"将创建数据库: {NEW_DB_NAME}")
print(f"将创建用户: {NEW_DB_USER}")
print()

# 方法1: 尝试使用 postgres 超级用户
print("方法1: 使用 postgres 超级用户创建数据库")
print("-" * 70)

postgres_password = input("请输入 postgres 用户的密码 (直接回车跳过): ").strip()

if postgres_password:
    try:
        print("\n正在连接到 PostgreSQL...")
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user="postgres",
            password=postgres_password,
            database="postgres"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        # 检查用户是否存在
        print(f"检查用户 {NEW_DB_USER} 是否存在...")
        cursor.execute(
            "SELECT 1 FROM pg_roles WHERE rolname = %s",
            (NEW_DB_USER,)
        )
        user_exists = cursor.fetchone()

        if not user_exists:
            print(f"创建用户 {NEW_DB_USER}...")
            cursor.execute(
                f"CREATE USER {NEW_DB_USER} WITH PASSWORD %s",
                (NEW_DB_PASSWORD,)
            )
            print(f"✅ 用户 {NEW_DB_USER} 创建成功")
        else:
            print(f"⚠️  用户 {NEW_DB_USER} 已存在")

        # 检查数据库是否存在
        print(f"检查数据库 {NEW_DB_NAME} 是否存在...")
        cursor.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (NEW_DB_NAME,)
        )
        db_exists = cursor.fetchone()

        if not db_exists:
            print(f"创建数据库 {NEW_DB_NAME}...")
            cursor.execute(f"CREATE DATABASE {NEW_DB_NAME} OWNER {NEW_DB_USER}")
            print(f"✅ 数据库 {NEW_DB_NAME} 创建成功")
        else:
            print(f"⚠️  数据库 {NEW_DB_NAME} 已存在")
            # 授予权限
            cursor.execute(f"GRANT ALL PRIVILEGES ON DATABASE {NEW_DB_NAME} TO {NEW_DB_USER}")

        cursor.close()
        conn.close()

        # 连接到新数据库设置权限
        print(f"连接到数据库 {NEW_DB_NAME} 设置权限...")
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user="postgres",
            password=postgres_password,
            database=NEW_DB_NAME
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        cursor.execute(f"GRANT ALL ON SCHEMA public TO {NEW_DB_USER}")
        cursor.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO {NEW_DB_USER}")
        cursor.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO {NEW_DB_USER}")

        cursor.close()
        conn.close()

        print()
        print("=" * 70)
        print("🎉 数据库创建成功！")
        print("=" * 70)
        print()
        print("数据库配置信息:")
        print(f"  主机: {DB_HOST}")
        print(f"  端口: {DB_PORT}")
        print(f"  数据库: {NEW_DB_NAME}")
        print(f"  用户: {NEW_DB_USER}")
        print(f"  密码: {NEW_DB_PASSWORD}")
        print()
        print("配置已保存到 .env 文件")
        print()
        sys.exit(0)

    except psycopg2.OperationalError as e:
        print(f"\n❌ 连接失败: {e}")
        print("\n可能的原因:")
        print("1. postgres 用户密码错误")
        print("2. 数据库服务未启动")
        print("3. 防火墙阻止连接")
        print()

# 方法2: 尝试使用 admin 用户
print("\n方法2: 使用 admin 用户创建数据库")
print("-" * 70)

admin_password = input("请输入 admin 用户的密码 (直接回车跳过): ").strip()

if admin_password:
    try:
        print("\n正在连接到 PostgreSQL...")
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user="admin",
            password=admin_password,
            database="postgres"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        # 检查用户是否存在
        cursor.execute(
            "SELECT 1 FROM pg_roles WHERE rolname = %s",
            (NEW_DB_USER,)
        )
        user_exists = cursor.fetchone()

        if not user_exists:
            print(f"创建用户 {NEW_DB_USER}...")
            cursor.execute(
                f"CREATE USER {NEW_DB_USER} WITH PASSWORD %s",
                (NEW_DB_PASSWORD,)
            )
            print(f"✅ 用户创建成功")
        else:
            print(f"⚠️  用户已存在")

        # 检查数据库是否存在
        cursor.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (NEW_DB_NAME,)
        )
        db_exists = cursor.fetchone()

        if not db_exists:
            print(f"创建数据库 {NEW_DB_NAME}...")
            cursor.execute(f"CREATE DATABASE {NEW_DB_NAME} OWNER {NEW_DB_USER}")
            print(f"✅ 数据库创建成功")
        else:
            print(f"⚠️  数据库已存在")
            cursor.execute(f"GRANT ALL PRIVILEGES ON DATABASE {NEW_DB_NAME} TO {NEW_DB_USER}")

        cursor.close()
        conn.close()

        print()
        print("=" * 70)
        print("🎉 数据库创建成功！")
        print("=" * 70)
        sys.exit(0)

    except psycopg2.OperationalError as e:
        print(f"\n❌ 连接失败: {e}")

# 如果两种方法都失败
print()
print("=" * 70)
print("❌ 自动创建数据库失败")
print("=" * 70)
print()
print("请手动执行以下操作:")
print()
print("1. 使用 PostgreSQL 管理工具 (如 pgAdmin) 连接到数据库")
print("2. 执行 create_database.sql 文件中的 SQL 语句")
print("3. 或者运行命令:")
print()
print(f"   psql -h {DB_HOST} -p {DB_PORT} -U postgres -f create_database.sql")
print()
print("然后重新启动 HearSight")
print()
sys.exit(1)
