#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""使用 DSN 连接字符串测试"""
import psycopg2
import sys

# 完整的 DSN 连接字符串
DSN = "postgresql://admin:Pg%40Admin%232025%21Secure@117.72.164.82:5433/hearsight"

print("=" * 70)
print("Testing PostgreSQL Connection with DSN")
print("=" * 70)
print(f"DSN: {DSN}")
print("=" * 70)
print()

try:
    print("Connecting using DSN...")
    conn = psycopg2.connect(DSN)

    print("SUCCESS: Connected!")
    print()

    cursor = conn.cursor()
    cursor.execute("SELECT version()")
    version = cursor.fetchone()[0]
    print(f"PostgreSQL: {version[:80]}")

    cursor.close()
    conn.close()

    print()
    print("=" * 70)
    print("Connection PASSED! Starting HearSight...")
    print("=" * 70)

    sys.exit(0)

except Exception as e:
    print(f"ERROR: {e}")
    print()
    print("Please verify:")
    print("1. Database 'hearsight' exists")
    print("2. User 'admin' has correct password")
    print("3. User has access to database 'hearsight'")
    print()
    sys.exit(1)
