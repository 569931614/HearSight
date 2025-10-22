#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""测试最终数据库连接"""
import psycopg2
import sys

# 数据库配置
DB_HOST = "117.72.164.82"
DB_PORT = "5433"
DB_USER = "admin"
DB_PASSWORD = "Pg@Admin#2025!Secure"
DB_NAME = "hearsight"

print("=" * 70)
print("Testing PostgreSQL Connection")
print("=" * 70)
print(f"Host: {DB_HOST}:{DB_PORT}")
print(f"User: {DB_USER}")
print(f"Database: {DB_NAME}")
print("=" * 70)
print()

try:
    print("Connecting to PostgreSQL...")
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )

    print("SUCCESS: Connected to database!")
    print()

    cursor = conn.cursor()

    # 测试查询
    cursor.execute("SELECT version()")
    version = cursor.fetchone()[0]
    print(f"PostgreSQL Version: {version[:80]}")
    print()

    # 检查表
    cursor.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
    """)
    tables = cursor.fetchall()

    if tables:
        print(f"Existing tables ({len(tables)}):")
        for table in tables:
            print(f"  - {table[0]}")
    else:
        print("No tables yet (will be created on first startup)")

    cursor.close()
    conn.close()

    print()
    print("=" * 70)
    print("Database connection test PASSED!")
    print("Ready to start HearSight")
    print("=" * 70)

    sys.exit(0)

except Exception as e:
    print(f"ERROR: {e}")
    print()
    sys.exit(1)
