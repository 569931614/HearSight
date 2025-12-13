#!/bin/bash
# HearSight 本地数据库设置脚本

echo "======================================================================"
echo "HearSight 本地数据库设置"
echo "======================================================================"
echo ""
echo "目标服务器: localhost:5433"
echo "将创建数据库: hearsight"
echo ""
echo "请输入 postgres 用户的密码，然后按回车键"
echo ""

# 读取密码
read -sp "postgres 密码: " PGPASSWORD
echo ""
export PGPASSWORD

# 检查数据库是否存在
echo ""
echo "正在检查数据库..."
DB_EXISTS=$(psql -h localhost -p 5433 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='hearsight'")

if [ "$DB_EXISTS" = "1" ]; then
    echo "✅ 数据库 hearsight 已存在"
else
    echo "正在创建数据库 hearsight..."
    psql -h localhost -p 5433 -U postgres -d postgres -c "CREATE DATABASE hearsight;"

    if [ $? -eq 0 ]; then
        echo "✅ 数据库 hearsight 创建成功"
    else
        echo "❌ 数据库创建失败"
        exit 1
    fi
fi

echo ""
echo "======================================================================"
echo "🎉 数据库设置完成！"
echo "======================================================================"
echo ""
echo "数据库配置信息:"
echo "  主机: localhost"
echo "  端口: 5433"
echo "  数据库: hearsight"
echo "  用户: postgres"
echo ""
echo "注意：项目启动时会自动创建所需的表结构"
echo ""
