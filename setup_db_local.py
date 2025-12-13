#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
本地 PostgreSQL 数据库设置脚本
"""
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import sys
import getpass

print("=" * 70)
print("HearSight 本地数据库设置")
print("=" * 70)
print()

# 数据库配置
DB_HOST = "localhost"
DB_PORT = "5433"
DB_NAME = "hearsight"

print(f"目标服务器: {DB_HOST}:{DB_PORT}")
print(f"将创建数据库: {DB_NAME}")
print()

# 获取 postgres 用户密码
postgres_password = getpass.getpass("请输入 postgres 用户的密码: ")

if not postgres_password:
    print("❌ 密码不能为空")
    sys.exit(1)

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

    # 检查数据库是否存在
    print(f"检查数据库 {DB_NAME} 是否存在...")
    cursor.execute(
        "SELECT 1 FROM pg_database WHERE datname = %s",
        (DB_NAME,)
    )
    db_exists = cursor.fetchone()

    if not db_exists:
        print(f"创建数据库 {DB_NAME}...")
        cursor.execute(f"CREATE DATABASE {DB_NAME}")
        print(f"✅ 数据库 {DB_NAME} 创建成功")
    else:
        print(f"✅ 数据库 {DB_NAME} 已存在")

    cursor.close()
    conn.close()

    print()
    print("=" * 70)
    print("🎉 数据库设置成功！")
    print("=" * 70)
    print()
    print("数据库配置信息:")
    print(f"  主机: {DB_HOST}")
    print(f"  端口: {DB_PORT}")
    print(f"  数据库: {DB_NAME}")
    print(f"  用户: postgres")
    print()
    print("注意：项目启动时会自动创建所需的表结构")
    print()
    sys.exit(0)

except psycopg2.OperationalError as e:
    print(f"\n❌ 连接失败: {e}")
    print("\n可能的原因:")
    print("1. postgres 用户密码错误")
    print("2. PostgreSQL 服务未在端口 5433 启动")
    print("3. PostgreSQL 不允许从 localhost 连接")
    print()
    print("请检查:")
    print(f"  1. PostgreSQL 是否在端口 5433 运行: sudo netstat -tulpn | grep 5433")
    print(f"  2. 检查 pg_hba.conf 允许本地连接")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ 发生错误: {e}")
    sys.exit(1)
