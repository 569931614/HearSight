# HearSight 向量搜索优化方案全集

## 当前架构分析

**问题**：虽然使用火山引擎生成 embedding，但搜索逻辑是：
- 遍历所有 JSON 文件
- 逐个计算余弦相似度
- 时间复杂度：O(n)，n = 文档总数

---

## 方案对比表

| 方案 | 性能提升 | 成本 | 复杂度 | 推荐度 |
|------|---------|------|--------|--------|
| 1. PostgreSQL pgvector | 10-100x | 免费 | ⭐ | ⭐⭐⭐⭐⭐ |
| 2. Milvus (开源) | 50-200x | 免费 | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| 3. Qdrant (开源) | 50-200x | 免费 | ⭐⭐ | ⭐⭐⭐⭐ |
| 4. Redis Stack | 20-100x | 免费 | ⭐⭐ | ⭐⭐⭐⭐ |
| 5. 火山引擎 VikingDB | 100-500x | 💰付费 | ⭐ | ⭐⭐⭐ |
| 6. Pinecone (云端) | 100-500x | 💰付费 | ⭐ | ⭐⭐⭐ |
| 7. Weaviate (混合) | 50-200x | 免费/付费 | ⭐⭐⭐ | ⭐⭐⭐ |
| 8. FAISS (本地) | 10-50x | 免费 | ⭐⭐ | ⭐⭐⭐⭐ |
| 9. 内存缓存优化 | 2-5x | 免费 | ⭐ | ⭐⭐ |
| 10. 异步+批量 | 1.5-3x | 免费 | ⭐ | ⭐⭐ |

---

## 详细方案分析

### 🥇 方案1: PostgreSQL pgvector (最推荐)

**优势**：
- ✅ 已有 PostgreSQL，零额外部署
- ✅ HNSW/IVFFlat 索引，亚线性搜索
- ✅ 事务支持，数据一致性强
- ✅ 统一存储，减少数据同步
- ✅ 成熟稳定，社区活跃

**性能**：
- 1万向量：< 10ms
- 10万向量：< 50ms
- 100万向量：< 200ms

**实施步骤**：
```sql
-- 1. 安装扩展
CREATE EXTENSION vector;

-- 2. 创建表
CREATE TABLE embeddings (
    id BIGSERIAL PRIMARY KEY,
    video_id TEXT,
    embedding vector(1536),
    metadata JSONB
);

-- 3. 创建索引
CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops);

-- 4. 搜索
SELECT * FROM embeddings
ORDER BY embedding <=> '[...]'::vector
LIMIT 5;
```

**代码改动量**：⭐ 小（2-3小时）

---

### 🥈 方案2: Milvus (专业向量数据库)

**优势**：
- ✅ 专为向量搜索设计
- ✅ 支持多种索引算法（IVF、HNSW、DiskANN）
- ✅ 分布式扩展能力强
- ✅ GPU 加速支持
- ✅ 丰富的过滤条件

**性能**：
- 百万级向量：< 10ms
- 千万级向量：< 50ms
- 支持 TB 级数据

**部署方式**：
```yaml
# docker-compose.yml
services:
  milvus:
    image: milvusdb/milvus:latest
    ports:
      - "19530:19530"
    volumes:
      - milvus_data:/var/lib/milvus
```

**Python 代码**：
```python
from pymilvus import connections, Collection

connections.connect("default", host="localhost", port="19530")

# 创建集合
collection = Collection("video_embeddings")

# 搜索
results = collection.search(
    data=[query_embedding],
    anns_field="embedding",
    param={"metric_type": "COSINE", "params": {"ef": 64}},
    limit=5
)
```

**代码改动量**：⭐⭐ 中（4-6小时）

---

### 🥉 方案3: Qdrant (Rust 实现，性能强)

**优势**：
- ✅ Rust 编写，内存安全且快
- ✅ 简单易用，API 友好
- ✅ 内置过滤和标量索引
- ✅ 支持实时更新
- ✅ 轻量级，资源占用少

**部署**：
```bash
docker run -p 6333:6333 qdrant/qdrant
```

**Python 代码**：
```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

client = QdrantClient(host="localhost", port=6333)

# 创建集合
client.create_collection(
    collection_name="video_embeddings",
    vectors_config=VectorParams(size=1536, distance=Distance.COSINE)
)

# 搜索
results = client.search(
    collection_name="video_embeddings",
    query_vector=query_embedding,
    limit=5
)
```

**代码改动量**：⭐⭐ 中（3-5小时）

---

### 方案4: Redis Stack (内存向量搜索)

**优势**：
- ✅ 极快（内存级别）
- ✅ 可能已有 Redis
- ✅ 支持向量索引（HNSW）
- ✅ 简单集成

**限制**：
- ⚠️ 内存占用大
- ⚠️ 数据量受内存限制

**部署**：
```bash
docker run -p 6379:6379 redis/redis-stack-server:latest
```

**Python 代码**：
```python
import redis
from redis.commands.search.field import VectorField
from redis.commands.search.indexDefinition import IndexDefinition

r = redis.Redis(host='localhost', port=6379)

# 创建索引
r.ft("idx:embeddings").create_index([
    VectorField("embedding", "HNSW", {
        "TYPE": "FLOAT32",
        "DIM": 1536,
        "DISTANCE_METRIC": "COSINE"
    })
])

# 搜索
results = r.ft("idx:embeddings").search(
    Query("*=>[KNN 5 @embedding $vec AS score]")
        .sort_by("score")
        .return_fields("video_id", "score")
        .dialect(2),
    query_params={"vec": query_embedding}
)
```

**代码改动量**：⭐⭐ 中（3-4小时）

---

### 方案5: 火山引擎 VikingDB (云端托管)

**优势**：
- ✅ 已有火山引擎账号
- ✅ 云端托管，无需维护
- ✅ 专业优化，性能极致
- ✅ 与火山引擎 embedding 无缝集成

**成本**：按调用量付费

**Python 代码**：
```python
from volcengine.viking_db import VikingDBClient

client = VikingDBClient(
    api_key="your-key",
    region="cn-beijing"
)

# 创建集合
collection = client.create_collection(
    name="video_embeddings",
    dimension=1536
)

# 搜索
results = collection.search(
    vector=query_embedding,
    top_k=5
)
```

**代码改动量**：⭐ 小（2-3小时）

---

### 方案6: FAISS (本地高性能)

**优势**：
- ✅ Meta 开源，久经考验
- ✅ 无需额外服务
- ✅ 多种索引算法
- ✅ GPU 加速支持

**限制**：
- ⚠️ 需要在内存中加载索引
- ⚠️ 需要手动持久化

**Python 代码**：
```python
import faiss
import numpy as np
import pickle

# 构建索引
dimension = 1536
embeddings = np.array(all_embeddings).astype('float32')

# 使用 HNSW 索引
index = faiss.IndexHNSWFlat(dimension, 32)
index.add(embeddings)

# 持久化
faiss.write_index(index, "embeddings.index")

# 搜索
D, I = index.search(query_embedding, k=5)
```

**代码改动量**：⭐⭐ 中（4-5小时）

---

### 方案7: 内存缓存优化 (快速临时方案)

**适用场景**：数据量小（< 10万向量），不想改架构

**实施**：
```python
import pickle
from functools import lru_cache

class CachedVectorStore:
    def __init__(self):
        self._cache = None
        self._cache_time = None

    @lru_cache(maxsize=1)
    def _load_all_vectors(self):
        """加载所有向量到内存"""
        vectors = []
        metadata = []

        for json_file in self._list_files():
            data = json.load(open(json_file))
            for doc in data['documents']:
                vectors.append(doc['embedding'])
                metadata.append(doc['metadata'])

        return np.array(vectors), metadata

    def search(self, query_embedding, n_results=5):
        vectors, metadata = self._load_all_vectors()

        # NumPy 批量计算余弦相似度
        similarities = np.dot(vectors, query_embedding) / (
            np.linalg.norm(vectors, axis=1) * np.linalg.norm(query_embedding)
        )

        top_indices = np.argsort(similarities)[-n_results:][::-1]

        return [
            {"metadata": metadata[i], "similarity": similarities[i]}
            for i in top_indices
        ]
```

**性能提升**：2-5倍
**代码改动量**：⭐ 小（1-2小时）

---

### 方案8: 异步并发优化

**适用场景**：文件读取是瓶颈

```python
import asyncio
import aiofiles
from concurrent.futures import ProcessPoolExecutor

async def load_json_async(filepath):
    async with aiofiles.open(filepath, 'r') as f:
        content = await f.read()
        return json.loads(content)

async def search_async(query_embedding, n_results=5):
    tasks = [
        load_json_async(f)
        for f in self._list_files()
    ]

    all_data = await asyncio.gather(*tasks)

    # 使用进程池并行计算相似度
    with ProcessPoolExecutor() as executor:
        similarities = list(executor.map(
            self._compute_similarity,
            all_data,
            [query_embedding] * len(all_data)
        ))

    # 合并结果并排序
    ...
```

**性能提升**：1.5-3倍
**代码改动量**：⭐⭐ 中（3-4小时）

---

## 推荐决策树

```
数据量 < 1万？
├─ 是 → 方案7: 内存缓存（快速实施）
└─ 否 → 继续

已有 PostgreSQL？
├─ 是 → 方案1: pgvector ⭐⭐⭐⭐⭐
└─ 否 → 继续

预算充足？
├─ 是 → 方案5: 火山引擎 VikingDB
└─ 否 → 继续

愿意部署新服务？
├─ 是
│   ├─ 需要极致性能 → 方案2: Milvus
│   └─ 追求简单易用 → 方案3: Qdrant
└─ 否 → 方案8: FAISS（无需额外服务）
```

---

## 混合方案（终极优化）

### 阶段1: 立即见效（1-2小时）
- 实施方案7: 内存缓存
- 性能提升：2-5倍

### 阶段2: 中期优化（1周内）
- 实施方案1: PostgreSQL pgvector
- 性能提升：10-100倍

### 阶段3: 长期规划（根据增长）
- 数据量达到百万级时，迁移到 Milvus/Qdrant
- 性能提升：50-200倍

---

## 成本对比（月度估算）

| 方案 | 服务器成本 | 开发成本 | 维护成本 | 总成本 |
|------|-----------|---------|---------|--------|
| pgvector | ¥0 | ¥500 | ¥0 | ¥500 |
| Milvus | ¥200 | ¥800 | ¥100 | ¥1100 |
| Qdrant | ¥100 | ¥600 | ¥50 | ¥750 |
| Redis | ¥300 | ¥500 | ¥50 | ¥850 |
| VikingDB | ¥500+ | ¥400 | ¥0 | ¥900+ |
| FAISS | ¥0 | ¥800 | ¥200 | ¥1000 |
| 缓存优化 | ¥0 | ¥200 | ¥0 | ¥200 |

---

## 需要帮助？

告诉我你的选择，我可以：
1. 生成完整实施代码
2. 编写数据迁移脚本
3. 提供性能测试脚本
4. 配置 Docker Compose
