# Migrate Backend from Python to Node.js

## Why
1. **技术栈统一** - 前端使用 React + TypeScript，后端改用 Node.js 可实现全栈 JavaScript/TypeScript
2. **移除重型依赖** - ASR (FunASR/PyTorch)、视频下载 (yt-dlp) 等功能已由 pyvideotrans 处理，HearSight 只需读取数据
3. **简化部署** - 不再需要 Python 环境和 CUDA 支持
4. **降低复杂度** - 移除后台任务队列，HearSight 变为纯粹的数据读取和 RAG 问答服务

## What Changes

### 移除的功能（由 pyvideotrans 处理）
- ❌ ASR 语音识别 (`backend/audio2text/`)
- ❌ Bilibili 视频下载 (`backend/utils/vedio_utils/`)
- ❌ 后台任务队列 (`_job_worker` in `main.py`)
- ❌ Token 计算 (`backend/utils/token_utils/`) - 改用 LLM API 直接处理

### 保留并迁移的功能
- ✅ PostgreSQL CRUD 操作
- ✅ Qdrant 向量搜索 (RAG)
- ✅ LLM 对话 (OpenAI 兼容 API)
- ✅ OSS 存储 (阿里云)
- ✅ JWT 认证
- ✅ 静态文件服务
- ✅ 管理后台 API

### 技术栈选择
| 层 | Python | Node.js |
|---|--------|---------|
| 框架 | FastAPI | Fastify |
| ORM | psycopg2 | Prisma |
| 向量库 | qdrant-client | @qdrant/js-client-rest |
| LLM | openai | openai |
| OSS | oss2 | ali-oss |
| 认证 | PyJWT | jsonwebtoken |

## Impact
- Affected specs: 所有后端 API
- Affected code:
  - 删除: `backend/` (Python)
  - 新增: `server/` (Node.js)
  - 更新: `docker-compose.yml`, `requirements.txt` → `package.json`

## Acceptance Criteria
1. 所有现有 API 端点在 Node.js 中实现并保持兼容
2. 前端无需修改即可正常工作
3. Docker 部署正常
4. 性能不低于 Python 版本
