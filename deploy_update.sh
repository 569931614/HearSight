#!/bin/bash
# HearSight 服务器部署更新脚本

set -e

echo "=== HearSight 部署更新 ==="

# 1. 拉取最新代码
echo "1. 拉取最新代码..."
git pull origin main

# 2. 停止现有容器
echo "2. 停止现有容器..."
docker compose down

# 3. 重新构建镜像（包含最新代码）
echo "3. 重新构建镜像..."
docker compose build --no-cache

# 4. 启动服务
echo "4. 启动服务..."
docker compose up -d

# 5. 查看日志
echo "5. 查看服务状态..."
docker compose ps

echo ""
echo "=== 部署完成 ==="
echo "查看实时日志: docker compose logs -f"
echo "查看后端日志: docker compose logs -f backend"
echo "查看前端日志: docker compose logs -f frontend"
