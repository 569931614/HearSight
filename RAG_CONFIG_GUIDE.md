# RAG 对话功能配置指南

## 问题现象

访问 `/api/qdrant/chat` 接口时返回错误：
```json
{
  "detail": "Qdrant RAG is disabled. Set RAG_ENABLED=true to enable."
}
```
或
```json
{
  "detail": "Embedding API not configured (need QDRANT_EMBEDDING_API_URL and QDRANT_EMBEDDING_API_KEY)"
}
```

## 解决方案

### 1. 启用 RAG 功能（已完成 ✅）

在 `.env` 文件中添加：
```bash
RAG_ENABLED=true
```

### 2. 配置 API Key（⚠️ 必须配置）

RAG 对话功能需要两个 API Key：

#### 2.1 配置 Embedding API Key（用于向量化查询）

在 `.env` 文件中配置：
```bash
# 方式1：使用 SiliconFlow（推荐，免费额度）
QDRANT_EMBEDDING_API_URL=https://api.siliconflow.cn/v1
QDRANT_EMBEDDING_API_KEY=your_siliconflow_api_key_here

# 方式2：使用其他兼容 OpenAI 格式的服务
QDRANT_EMBEDDING_API_URL=https://your-embedding-service.com/v1
QDRANT_EMBEDDING_API_KEY=your_api_key_here
```

**如何获取 SiliconFlow API Key：**
1. 访问：https://cloud.siliconflow.cn/
2. 注册并登录
3. 进入"API 管理"页面
4. 创建新的 API Key
5. 复制 API Key 并填入 `.env` 文件

#### 2.2 配置 Chat API Key（用于生成回答）

在 `.env` 文件中配置：
```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
OPENAI_CHAT_MODEL=deepseek-ai/DeepSeek-V3
```

**注意：** 如果使用同一个服务商（如 SiliconFlow），`QDRANT_EMBEDDING_API_KEY` 和 `OPENAI_API_KEY` 可以使用同一个 API Key。

### 3. 重启后端服务

配置完成后，重启后端服务以加载新的环境变量：

```bash
cd /www/wwwroot/HearSight

# 方式1：使用启动脚本（推荐，自动加载 .env）
kill $(pgrep -f "uvicorn main:app")
nohup bash start_backend.sh > /tmp/hearsight.log 2>&1 &

# 方式2：手动设置环境变量
kill $(pgrep -f "uvicorn main:app")
export $(grep -v '^#' .env | grep -v '^$' | xargs)
nohup /usr/bin/python3.8 -m uvicorn main:app --host 0.0.0.0 --port 9999 > /tmp/hearsight.log 2>&1 &
```

### 4. 验证配置

#### 4.1 检查 RAG 状态
```bash
curl -s "http://localhost:9999/api/qdrant/health" | python3 -m json.tool
```

预期输出：
```json
{
    "status": "healthy",
    "qdrant_url": "http://localhost:3307",
    "rag_enabled": true
}
```

#### 4.2 测试对话接口
```bash
curl -X POST "http://localhost:9999/api/qdrant/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "请介绍一下视频内容",
    "top_k": 5,
    "include_summaries": true
  }'
```

成功返回示例：
```json
{
    "query": "请介绍一下视频内容",
    "answer": "根据视频内容，主要讨论了...",
    "references": [...],
    "retrieved_count": 5
}
```

## 配置清单

- [x] RAG_ENABLED=true（已配置）
- [x] QDRANT_EMBEDDING_API_URL（已配置）
- [ ] **QDRANT_EMBEDDING_API_KEY（需要填写）**
- [ ] **OPENAI_API_KEY（需要填写）**
- [x] OPENAI_BASE_URL（已配置）
- [x] OPENAI_CHAT_MODEL（已配置）
- [x] 重启后端服务（使用 start_backend.sh）

## 当前状态

✅ RAG 功能已启用
✅ Embedding API URL 已配置
⚠️ **需要配置 API Key 才能使用对话功能**

## 后续步骤

1. 获取 SiliconFlow API Key（或其他服务商）
2. 在 `.env` 文件中填写：
   - `QDRANT_EMBEDDING_API_KEY`
   - `OPENAI_API_KEY`
3. 重启后端服务：`bash /www/wwwroot/HearSight/start_backend.sh`
4. 测试对话接口

## 常见问题

### Q1: 为什么需要两个 API Key？
A:
- `QDRANT_EMBEDDING_API_KEY`：用于将用户查询转换为向量（embedding），以便在向量数据库中检索相关内容
- `OPENAI_API_KEY`：用于调用大语言模型生成对话回答

如果使用同一个服务商，可以使用同一个 API Key。

### Q2: 可以使用其他 Embedding 模型吗？
A: 可以，但必须与 pyvideotrans 使用的模型一致（当前为 `BAAI/bge-large-zh-v1.5`），否则向量相似度计算会不准确。

### Q3: 如何查看详细错误日志？
A: 查看后端日志：
```bash
tail -f /tmp/hearsight.log
```

---

**修复时间**: 2025-12-25
**文档版本**: 1.0
**状态**: ⚠️ 等待 API Key 配置
