"""
向量数据库存储模块

⚠️ 重要: ChromaDB 已完全移除
默认使用 Qdrant 向量数据库（与 pyvideotrans 共享）

支持的后端:
- qdrant: Qdrant 向量数据库 (默认，推荐)
- postgresql: PostgreSQL pgvector 扩展
- volcengine: 火山引擎 (仅 embedding API，不存储数据)
"""
import os
import logging

logger = logging.getLogger(__name__)

# 全局向量存储实例
_vector_store = None


def get_vector_store(persist_directory: str = None):
    """
    获取全局向量存储实例

    ⚠️ 默认使用 Qdrant 向量后端（推荐）

    通过环境变量 HEARSIGHT_VECTOR_BACKEND 可以选择:
    - qdrant: Qdrant 向量数据库 (默认，与 pyvideotrans 共享)
    - postgresql: PostgreSQL pgvector 扩展
    - volcengine: 火山引擎 (仅 embedding 服务，不存储数据)

    Args:
        persist_directory: 持久化目录路径 (已弃用，仅为兼容旧代码)

    Returns:
        QdrantVectorStore 或 PostgreSQLVectorStore: 向量存储实例

    Raises:
        ValueError: 如果选择了不支持的后端
    """
    global _vector_store

    # 默认使用 Qdrant 后端（优先级：环境变量 > 默认值）
    backend = os.environ.get("HEARSIGHT_VECTOR_BACKEND", "qdrant").lower()

    # Qdrant 后端（使用新的 VideoQdrantClient）
    if backend == "qdrant":
        from backend.vector_utils import VideoQdrantClient

        # 从环境变量获取配置
        qdrant_url = os.environ.get('QDRANT_URL', 'http://localhost:6333')
        qdrant_api_key = os.environ.get('QDRANT_API_KEY') or None

        if not isinstance(_vector_store, VideoQdrantClient):
            logger.info('[vector] Using Qdrant vector backend (VideoQdrantClient)')
            _vector_store = VideoQdrantClient(
                url=qdrant_url,
                api_key=qdrant_api_key
            )
        return _vector_store

    # PostgreSQL pgvector 后端
    if backend == "postgresql":
        from backend.knowledge.postgresql_vector_store import PostgreSQLVectorStore

        # 从环境变量获取数据库配置
        db_config = {
            'host': os.environ.get('POSTGRES_HOST', 'localhost'),
            'port': int(os.environ.get('POSTGRES_PORT', 5432)),
            'user': os.environ.get('POSTGRES_USER', 'postgres'),
            'password': os.environ.get('POSTGRES_PASSWORD', ''),
            'database': os.environ.get('POSTGRES_DB', 'hearsight')
        }

        if not isinstance(_vector_store, PostgreSQLVectorStore):
            logger.info('[vector] Using PostgreSQL vector backend')
            _vector_store = PostgreSQLVectorStore(db_config)
            _vector_store.initialize()
        return _vector_store

    # Volcengine (仅 embedding，不存储)
    if backend == "volcengine":
        from backend.knowledge.volcengine_vector import VolcengineVectorClient

        logger.warning('[vector] ⚠️ Volcengine 后端仅提供 embedding 服务，不存储数据')
        logger.warning('[vector] 建议使用 HEARSIGHT_VECTOR_BACKEND=qdrant')

        # 从环境变量获取火山引擎配置
        api_key = os.environ.get('VOLCENGINE_API_KEY', '')
        base_url = os.environ.get('VOLCENGINE_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3')
        collection_name = os.environ.get('VOLCENGINE_COLLECTION_NAME', 'video_summaries')
        embedding_model = os.environ.get('VOLCENGINE_EMBEDDING_MODEL', 'ep-20241217191853-w54rf')

        if not isinstance(_vector_store, VolcengineVectorClient):
            _vector_store = VolcengineVectorClient(
                api_key=api_key,
                base_url=base_url,
                collection_name=collection_name,
                embedding_model=embedding_model
            )
        return _vector_store

    # 不支持的后端
    if backend == "chromadb":
        error_msg = (
            f"❌ ChromaDB 后端已移除，请使用 Qdrant\n"
            f"设置环境变量: HEARSIGHT_VECTOR_BACKEND=qdrant"
        )
        logger.error(error_msg)
        raise ValueError(error_msg)

    # 未知后端
    error_msg = (
        f"❌ 不支持的向量后端: {backend}\n"
        f"支持的后端: qdrant (推荐), postgresql, volcengine\n"
        f"ChromaDB 已移除，请使用 Qdrant"
    )
    logger.error(error_msg)
    raise ValueError(error_msg)


def reset_vector_store():
    """重置全局向量存储实例"""
    global _vector_store
    _vector_store = None
