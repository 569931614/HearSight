# HearSight 知识库集成说明

## 概述

HearSight 现已集成 pyvideotrans 的向量知识库，支持基于视频内容的智能对话和分析功能。

## 功能特点

1. **自动同步到向量库**：视频处理完成后，自动将转写和摘要数据同步到 ChromaDB 向量库
2. **语义搜索**：支持在所有视频内容中进行语义搜索
3. **RAG 对话**：基于检索增强生成（RAG）的智能对话，可以询问视频相关问题
4. **视频定位**：从对话结果中点击引用可以跳转到视频对应时间点
5. **多视频知识库**：支持管理多个视频的摘要数据

## 架构说明

### 后端架构

```
HearSight/backend/
├── knowledge/              # 知识库模块
│   ├── __init__.py
│   ├── vector_store.py     # 向量存储（ChromaDB）
│   ├── chat_client.py      # OpenAI 兼容的对话客户端
│   └── knowledge_service.py # 知识库服务（同步、搜索、对话）
└── routers/
    └── knowledge.py        # 知识库 API 路由
```

### 数据流

```
视频处理 → PostgreSQL → 自动同步 → ChromaDB 向量库
                                        ↓
                                  语义搜索
                                        ↓
                                  RAG 对话
                                        ↓
                                  展示引用 → 视频跳转
```

## API 接口

### 1. 对话接口

**POST** `/api/knowledge/chat`

请求体：
```json
{
  "query": "这个视频讲了什么？",
  "n_results": 5
}
```

响应：
```json
{
  "answer": "AI 的回答内容",
  "references": [
    {
      "document": "片段内容",
      "metadata": {
        "video_path": "/path/to/video.mp4",
        "type": "paragraph",
        "start_time": 10.5,
        "end_time": 25.3
      },
      "distance": 0.15
    }
  ],
  "query": "这个视频讲了什么？"
}
```

### 2. 搜索接口

**POST** `/api/knowledge/search`

请求体：
```json
{
  "query": "关键词",
  "n_results": 10
}
```

响应：
```json
{
  "results": [...]
}
```

### 3. 同步接口

**POST** `/api/knowledge/sync`

请求体：
```json
{
  "transcript_id": 123  // 可选，如果不提供则同步所有
}
```

响应：
```json
{
  "success": true,
  "message": "同步成功"
}
```

或

```json
{
  "total": 10,
  "success": 8,
  "failed": 2,
  "failed_ids": [5, 7]
}
```

### 4. 列出视频

**GET** `/api/knowledge/videos`

响应：
```json
{
  "videos": [
    {
      "video_id": "abc123",
      "video_path": "/path/to/video.mp4",
      "topic": "视频主题",
      "paragraph_count": 10,
      "total_duration": 120.5
    }
  ]
}
```

## 前端使用

### 1. AI 对话面板

点击顶部的 "AI 对话" 按钮打开对话面板。

特点：
- 支持自然语言提问
- 显示相关视频片段引用
- 点击引用可跳转到对应时间
- 显示相似度和时间范围

### 2. 视频跳转

在对话结果中，每个引用都显示：
- 视频名称
- 时间范围（如 1:23 - 2:45）
- 相似度百分比
- 片段内容预览

点击引用即可跳转到视频对应位置。

## 配置要求

### 必需的环境变量

在 `.env` 文件中配置：

```bash
# OpenAI 兼容 API（用于对话）
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-3.5-turbo

# PostgreSQL（已有配置）
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=hearsight
POSTGRES_PASSWORD=password
POSTGRES_DB=hearsight
```

### Python 依赖

需要安装 ChromaDB：

```bash
cd HearSight
pip install chromadb
```

## 数据同步

### 自动同步

视频处理完成后会自动同步到向量库。

### 手动同步

#### 同步单个视频

```bash
curl -X POST http://localhost:9999/api/knowledge/sync \
  -H "Content-Type: application/json" \
  -d '{"transcript_id": 123}'
```

#### 同步所有视频

```bash
curl -X POST http://localhost:9999/api/knowledge/sync \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 使用流程

### 完整流程

1. **导入视频**
   - 输入 Bilibili 链接
   - 系统自动下载、转写、生成摘要
   - 自动同步到向量库

2. **查看历史**
   - 在左侧面板查看已处理的视频
   - 点击视频可查看详情

3. **AI 对话**
   - 点击 "AI 对话" 按钮
   - 输入问题（如："这个视频的主要观点是什么？"）
   - AI 会基于视频内容回答
   - 点击引用可跳转到视频对应位置

4. **分句总结**
   - 点击 "分句总结" 查看详细的时间轴和摘要
   - 点击任意片段可跳转播放

## 向量库管理

### 存储位置

向量库默认存储在：
```
HearSight/
└── vector_db/           # ChromaDB 数据目录
    └── chroma.sqlite3   # 数据库文件
```

### 清理向量库

如需重建向量库，删除 `vector_db` 目录后重新同步：

```bash
cd HearSight
rm -rf vector_db
curl -X POST http://localhost:9999/api/knowledge/sync -H "Content-Type: application/json" -d '{}'
```

## 故障排查

### 1. 对话失败

**错误**：`未配置 LLM API`

**解决**：检查 `.env` 文件中的 OpenAI API 配置

### 2. ChromaDB 初始化失败

**错误**：`ChromaDB 未安装`

**解决**：
```bash
pip install chromadb
```

### 3. 搜索无结果

**原因**：数据未同步到向量库

**解决**：手动同步数据
```bash
curl -X POST http://localhost:9999/api/knowledge/sync -H "Content-Type: application/json" -d '{}'
```

### 4. 向量库权限问题

**错误**：`Permission denied: vector_db/`

**解决**：确保目录有写权限
```bash
chmod -R 755 HearSight/vector_db
```

## 高级用法

### 1. 自定义检索数量

在对话时可以调整检索的片段数量：

```typescript
chatWithKnowledge(query, 10)  // 检索 10 个相关片段
```

### 2. 单独使用搜索功能

```typescript
const results = await searchKnowledge(query, 20)
// 处理搜索结果
```

### 3. 集成到其他模块

```python
from backend.knowledge.knowledge_service import chat_with_knowledge_base

result = chat_with_knowledge_base(
    query="用户问题",
    api_key="your_key",
    base_url="https://api.openai.com/v1",
    model="gpt-3.5-turbo",
    n_results=5
)

print(result['answer'])
for ref in result['references']:
    print(ref['metadata'])
```

## 性能优化建议

1. **批量同步**：使用批量同步 API 一次性同步多个视频
2. **检索数量**：根据需求调整 `n_results`，太多会影响 LLM 响应速度
3. **向量库备份**：定期备份 `vector_db` 目录
4. **缓存策略**：相同问题的结果可以缓存

## 未来扩展

计划中的功能：

1. **多模态检索**：支持图像和视频帧的检索
2. **对话历史**：保存和管理对话记录
3. **知识图谱**：构建视频之间的关联关系
4. **个性化推荐**：基于用户兴趣推荐相关视频片段
5. **导出功能**：导出对话记录和引用

## 技术栈

- **向量数据库**：ChromaDB
- **Embedding**：使用 ChromaDB 默认的 sentence-transformers
- **LLM**：支持 OpenAI 兼容 API（ChatGPT、DeepSeek、Claude 等）
- **数据库**：PostgreSQL
- **前端**：React 19 + TypeScript + Ant Design
- **后端**：FastAPI + Python

## 许可证

遵循 HearSight 项目的开源许可证。
