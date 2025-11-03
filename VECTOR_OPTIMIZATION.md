# HearSight 向量搜索性能优化方案

## 当前问题

虽然配置使用火山引擎向量化（生成 embedding），但搜索逻辑是：
1. 读取本地所有 JSON 文件
2. 逐个计算余弦相似度
3. 排序返回结果

**性能瓶颈**：文件 I/O + 暴力计算，O(n) 复杂度，随数据增长线性变慢。

---

## 优化方案对比

### 方案1: 使用 PostgreSQL pgvector 扩展 ⭐️ 推荐
**优点**：
- 已有 PostgreSQL，只需启用扩展
- 向量索引（IVFFlat/HNSW），亚线性搜索 O(log n)
- 统一存储，无需额外服务
- 成本低，易维护

**实施步骤**：
```sql
-- 1. 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 创建向量表
CREATE TABLE video_embeddings (
    id SERIAL PRIMARY KEY,
    video_id TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    doc_text TEXT,
    embedding vector(1536),  -- 维度根据模型调整
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 创建向量索引（HNSW 最快）
CREATE INDEX ON video_embeddings USING hnsw (embedding vector_cosine_ops);

-- 4. 创建其他索引
CREATE INDEX idx_video_id ON video_embeddings(video_id);
CREATE INDEX idx_doc_type ON video_embeddings(doc_type);
```

**代码修改**：
- 存储时：写入 PostgreSQL 向量表
- 搜索时：`SELECT * FROM video_embeddings ORDER BY embedding <=> $1 LIMIT 5`
- 性能提升：**10-100倍**（取决于数据量）

---

### 方案2: 火山引擎 VikingDB（向量数据库）
**优点**：
- 云端托管，无需维护
- 专业向量搜索引擎
- 已有火山引擎 API Key

**缺点**：
- 额外成本
- 需要额外调用 API
- 网络延迟

**实施**：参考火山引擎 VikingDB 文档创建 Collection

---

### 方案3: 本地优化（临时方案）
如果暂时不想改动太多，可以：

1. **添加缓存**：
```python
from functools import lru_cache

@lru_cache(maxsize=1000)
def _cached_load_vectors():
    # 缓存所有向量在内存中
    pass
```

2. **使用 FAISS 本地索引**：
```python
import faiss
import numpy as np

# 构建索引
embeddings_matrix = np.array(all_embeddings).astype('float32')
index = faiss.IndexFlatIP(dimension)  # 内积搜索
index.add(embeddings_matrix)

# 搜索
D, I = index.search(query_embedding, k=5)
```

**性能提升**：5-20倍（依赖数据量）

---

## 推荐实施路径

### 阶段1: PostgreSQL pgvector（立即实施）
- 成本: 0元（已有 PostgreSQL）
- 工作量: 1-2小时
- 性能提升: 10-100倍

### 阶段2: 监控和调优
- 根据实际数据量调整索引类型
- 考虑是否需要云端向量库

---

## 快速验证性能

当前性能测试：
```python
import time

start = time.time()
results = vector_client.search("测试查询", n_results=5)
print(f"搜索耗时: {time.time() - start:.2f}秒")
```

**预期**：
- 当前: 1-10秒（取决于文件数量）
- 优化后: 0.01-0.1秒

---

## 需要帮助？

如果选择方案1（pgvector），我可以帮你：
1. 生成数据库迁移 SQL
2. 修改 Python 代码
3. 编写数据迁移脚本
