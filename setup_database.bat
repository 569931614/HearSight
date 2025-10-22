@echo off
chcp 65001 >nul
echo ========================================
echo HearSight 数据库创建脚本
echo ========================================
echo.
echo 正在连接到 PostgreSQL 服务器...
echo 主机: 117.72.164.82
echo 端口: 5433
echo.
echo 请输入 PostgreSQL 超级用户 (postgres) 的密码:
echo.

psql -h 117.72.164.82 -p 5433 -U postgres -f create_database.sql

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo ✓ 数据库创建成功！
    echo ========================================
    echo.
    echo 数据库名: hearsight
    echo 用户名: hearsight_user
    echo 密码: HearSight2025!Secure
    echo.
    pause
) else (
    echo.
    echo ========================================
    echo ✗ 数据库创建失败
    echo ========================================
    echo.
    echo 请检查:
    echo 1. PostgreSQL 服务是否运行
    echo 2. postgres 用户密码是否正确
    echo 3. 是否允许远程连接
    echo.
    pause
    exit /b 1
)
