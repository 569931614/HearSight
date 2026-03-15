# Tasks: Migrate Backend to Node.js

## Phase 1: 项目初始化
- [x] 创建 `server/` 目录结构
- [x] 初始化 Node.js 项目 (package.json)
- [x] 配置 TypeScript
- [x] 安装核心依赖 (fastify, prisma, etc.)

## Phase 2: 数据库层
- [x] 创建 Prisma schema (迁移 PostgreSQL 表结构)
- [x] 实现数据库连接和初始化
- [x] 迁移 `pg_store.py` 的 CRUD 函数

## Phase 3: 向量搜索层
- [x] 实现 Qdrant 客户端 (只读)
- [x] 实现 Embedding 服务 (调用 SiliconFlow API)
- [x] 实现 RAG 上下文格式化

## Phase 4: API 路由迁移
- [x] `/api/qdrant/*` - RAG 问答
- [x] `/api/knowledge/*` - 知识库检索
- [x] `/api/transcripts/*` - 转写记录
- [x] `/api/admin/*` - 系统配置
- [x] `/api/admin-panel/*` - 用户/视频管理
- [x] `/api/auth/*` - JWT 认证

## Phase 5: 辅助服务
- [x] OSS 客户端 (签名 URL 生成)
- [x] 静态文件服务
- [x] CORS 配置

## Phase 6: 部署配置
- [x] 更新 Dockerfile
- [x] 更新 docker-compose.yml (新建 docker-compose.nodejs.yml)
- [x] 环境变量迁移 (.env.example)

## Phase 7: 测试和验证
- [ ] API 端点测试
- [ ] 前端集成测试
- [ ] 性能对比

## 迁移完成的文件

### 新增文件
- `server/package.json` - Node.js 项目配置
- `server/tsconfig.json` - TypeScript 配置
- `server/prisma/schema.prisma` - 数据库 schema
- `server/src/index.ts` - 主入口文件
- `server/src/types/index.ts` - 类型定义
- `server/src/utils/config.ts` - 配置管理
- `server/src/db/index.ts` - 数据库服务
- `server/src/services/embedding.ts` - Embedding 服务
- `server/src/services/qdrant.ts` - Qdrant 客户端
- `server/src/services/oss.ts` - OSS 服务
- `server/src/services/llm.ts` - LLM 服务
- `server/src/routes/qdrant.ts` - Qdrant RAG 路由
- `server/src/routes/transcripts.ts` - 转写记录路由
- `server/src/routes/auth.ts` - 认证路由
- `server/src/routes/admin.ts` - 管理后台路由
- `server/Dockerfile` - Docker 构建文件
- `server/.env.example` - 环境变量模板
- `docker-compose.nodejs.yml` - Docker Compose 配置
