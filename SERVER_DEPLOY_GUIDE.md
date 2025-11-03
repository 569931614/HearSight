# 服务器部署问题诊断和解决方案

## 问题分析

### 问题1: 代码没有更新
**原因**: Docker 构建时缓存了旧代码层
**解决方案**: 必须使用 `--no-cache` 强制重新构建

### 问题2: 使用了本地数据库
**原因**: 服务器上的 `.env` 文件配置不同于你本地的配置
**解决方案**: 确保服务器上的环境变量正确配置

### 问题3: 看到旧数据
**原因**: 服务器连接的是不同的数据库实例
**解决方案**: 检查服务器的数据库配置

---

## 在服务器上执行诊断

### 步骤1: 检查当前配置
```bash
cd /path/to/HearSight

# 查看当前环境变量配置
cat .env

# 查看 Docker 容器的环境变量
docker compose exec backend env | grep POSTGRES
```

### 步骤2: 检查数据库连接
```bash
# 查看后端日志，确认连接的数据库地址
docker compose logs backend | grep -i postgres
docker compose logs backend | grep -i connected
```

### 步骤3: 完全重新部署
```bash
# 停止并删除所有容器
docker compose down

# 删除旧镜像（可选，确保完全清理）
docker compose rm -f
docker rmi hearsight-backend hearsight-frontend 2>/dev/null || true

# 拉取最新代码
git pull origin main

# 确保 .env 文件配置正确
# 关键配置项：
nano .env
# 确认以下配置：
# POSTGRES_HOST=117.72.164.82
# POSTGRES_PORT=5433
# POSTGRES_USER=admin
# POSTGRES_PASSWORD=Admin@123
# POSTGRES_DB=hearsight

# 重新构建（不使用缓存）
docker compose build --no-cache

# 启动服务
docker compose up -d

# 查看启动日志
docker compose logs -f
```

---

## 快速诊断脚本

在服务器上创建并运行此脚本：

```bash
#!/bin/bash
echo "=== HearSight 诊断 ==="
echo ""

echo "1. Git 状态:"
git status
echo ""

echo "2. 当前分支和最新提交:"
git log -1 --oneline
echo ""

echo "3. Docker 容器状态:"
docker compose ps
echo ""

echo "4. 后端环境变量配置:"
docker compose exec backend env | grep -E "POSTGRES|HEARSIGHT"
echo ""

echo "5. 最近的后端日志:"
docker compose logs --tail=20 backend
echo ""

echo "=== 诊断完成 ==="
```

---

## 关键检查点

✅ **必须确认**:
1. 服务器 `.env` 文件存在且配置正确
2. 使用 `docker compose build --no-cache` 重新构建
3. 数据库配置指向远程服务器 `117.72.164.82:5433`
4. Docker 容器能访问远程数据库（防火墙/安全组规则）

⚠️ **常见错误**:
- 忘记执行 `git pull`
- 使用了错误的 `.env` 文件
- Docker 缓存了旧代码层
- 服务器无法访问远程数据库（网络问题）
