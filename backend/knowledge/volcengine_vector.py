"""
火山引擎向量化服务客户端

⚠️ 重要变更: 此模块仅提供 embedding 向量化服务，不再支持本地文件存储
数据存储请使用 PostgreSQL + Qdrant 架构

使用火山引擎 Embedding API 进行文本向量化
参考文档: https://www.volcengine.com/docs/82379/1521766
"""
import os
import requests
import hashlib
from typing import List, Dict, Any, Optional


class VolcengineVectorClient:
    """
    火山引擎向量化服务客户端

    ⚠️ 注意: 此类仅用于调用 Embedding API，不存储任何数据
    数据存储应使用 Qdrant + PostgreSQL
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://ark.cn-beijing.volces.com/api/v3",
        collection_name: str = "video_summaries",  # 保留以兼容旧代码
        embedding_model: str = "ep-20241217191853-w54rf"
    ):
        """
        初始化火山引擎向量化客户端

        Args:
            api_key: API密钥
            base_url: API基础URL
            collection_name: 集合名称 (已弃用，仅为兼容)
            embedding_model: Embedding模型endpoint ID
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.collection_name = collection_name
        self.embedding_model = embedding_model

        # API endpoints
        self.embedding_url = f"{self.base_url}/embeddings"

        self.session = requests.Session()
        if self.api_key:
            self.session.headers.update({
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            })

    def _generate_video_id(self, video_path: str) -> str:
        """生成视频唯一ID"""
        return hashlib.md5(video_path.encode('utf-8')).hexdigest()

    def _get_embedding(self, text: str) -> Optional[List[float]]:
        """
        获取文本的向量表示

        Args:
            text: 输入文本

        Returns:
            List[float]: 向量数组，失败返回None
        """
        try:
            payload = {
                "model": self.embedding_model,
                "input": text,
                "encoding_format": "float"
            }

            response = self.session.post(
                self.embedding_url,
                json=payload,
                timeout=30
            )

            if response.status_code != 200:
                print(f"[volcengine] HTTP {response.status_code} 错误")
                try:
                    error_detail = response.json()
                    print(f"[volcengine] 错误详情: {error_detail}")
                except:
                    print(f"[volcengine] 响应: {response.text[:500]}")

            response.raise_for_status()

            result = response.json()
            if 'data' in result and len(result['data']) > 0:
                return result['data'][0]['embedding']
            else:
                print(f"[volcengine] 响应格式错误: {result}")

            return None

        except Exception as e:
            print(f"[volcengine] 获取embedding失败: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _batch_get_embeddings(self, texts: List[str]) -> List[Optional[List[float]]]:
        """
        批量获取文本向量

        Args:
            texts: 文本列表

        Returns:
            List[Optional[List[float]]]: 向量列表
        """
        embeddings = []
        try:
            payload = {
                "model": self.embedding_model,
                "input": texts,
                "encoding_format": "float"
            }

            response = self.session.post(
                self.embedding_url,
                json=payload,
                timeout=60
            )
            response.raise_for_status()

            result = response.json()
            if 'data' in result:
                sorted_data = sorted(result['data'], key=lambda x: x['index'])
                embeddings = [item['embedding'] for item in sorted_data]

            return embeddings

        except Exception as e:
            print(f"[volcengine] 批量获取embedding失败: {e}")
            # 降级为单个请求
            for text in texts:
                emb = self._get_embedding(text)
                embeddings.append(emb)
            return embeddings

    # ==================== 已弃用的方法 ====================
    # 以下方法保留以兼容旧代码，但已不再支持本地文件存储

    def store_summary(
        self,
        video_path: str,
        summary: Dict[str, Any],
        paragraphs: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None,
        local_storage_path: str = None
    ) -> bool:
        """
        ⚠️ 已弃用: volcengine 后端不再支持本地文件存储
        请使用 HEARSIGHT_VECTOR_BACKEND=qdrant 并配合 PostgreSQL
        """
        print("[volcengine] ⚠️ store_summary() 已弃用")
        print("[volcengine] 请使用 HEARSIGHT_VECTOR_BACKEND=qdrant")
        print("[volcengine] 数据应存储在 PostgreSQL + Qdrant 中")
        return False

    def search(
        self,
        query: str,
        n_results: int = 5,
        video_id: Optional[str] = None,
        filter_type: Optional[str] = None,
        local_storage_path: str = None
    ) -> List[Dict[str, Any]]:
        """
        ⚠️ 已弃用: volcengine 后端不再支持本地文件搜索
        请使用 HEARSIGHT_VECTOR_BACKEND=qdrant
        """
        print("[volcengine] ⚠️ search() 已弃用，请使用 Qdrant 向量后端")
        return []

    def delete_video(self, video_path: str, local_storage_path: str = None) -> bool:
        """
        ⚠️ 已弃用: volcengine 后端不再支持本地文件操作
        请使用 HEARSIGHT_VECTOR_BACKEND=qdrant
        """
        print("[volcengine] ⚠️ delete_video() 已弃用，请使用 Qdrant 向量后端")
        return False

    def get_video_summary(
        self,
        video_path: str,
        local_storage_path: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        ⚠️ 已弃用: volcengine 后端不再支持本地文件读取
        请使用 HEARSIGHT_VECTOR_BACKEND=qdrant
        """
        print("[volcengine] ⚠️ get_video_summary() 已弃用，请使用 Qdrant 向量后端")
        return None

    def list_all_videos(self, local_storage_path: str = None) -> List[Dict[str, Any]]:
        """
        ⚠️ 已弃用: volcengine 后端不再支持本地文件读取
        请使用 HEARSIGHT_VECTOR_BACKEND=qdrant
        """
        print("[volcengine] ⚠️ list_all_videos() 已弃用，请使用 Qdrant 向量后端")
        return []

    def get_overall_summary(self, video_path: str, local_storage_path: str = None) -> Optional[Dict[str, Any]]:
        """
        ⚠️ 已弃用: volcengine 后端不再支持本地文件读取
        请使用 HEARSIGHT_VECTOR_BACKEND=qdrant
        """
        print("[volcengine] ⚠️ get_overall_summary() 已弃用，请使用 Qdrant 向量后端")
        return None
