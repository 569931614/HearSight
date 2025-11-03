"""
Qdrant 向量存储适配器
提供高性能的向量搜索能力
"""
import os
import hashlib
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue, Range
)


class QdrantVectorStore:
    """Qdrant 向量数据库客户端"""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6333,
        collection_name: str = "video_summaries",
        embedding_api_key: str = None,
        embedding_base_url: str = None,
        embedding_model: str = None,
        vector_size: int = 1536
    ):
        """
        初始化 Qdrant 客户端

        Args:
            host: Qdrant 服务地址
            port: Qdrant 服务端口
            collection_name: 集合名称
            embedding_api_key: 向量化 API Key（火山引擎）
            embedding_base_url: 向量化 API URL
            embedding_model: 向量化模型
            vector_size: 向量维度
        """
        self.client = QdrantClient(host=host, port=port)
        self.collection_name = collection_name
        self.vector_size = vector_size

        # 向量化配置
        self.embedding_api_key = embedding_api_key
        self.embedding_base_url = embedding_base_url
        self.embedding_model = embedding_model

        # 初始化 HTTP session
        self.session = requests.Session()
        if self.embedding_api_key:
            self.session.headers.update({
                'Authorization': f'Bearer {self.embedding_api_key}',
                'Content-Type': 'application/json'
            })

        # 确保集合存在
        self._ensure_collection()

    def _ensure_collection(self):
        """确保集合存在，不存在则创建"""
        try:
            collections = self.client.get_collections().collections
            exists = any(c.name == self.collection_name for c in collections)

            if not exists:
                print(f"[qdrant] 创建集合: {self.collection_name}")
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=self.vector_size,
                        distance=Distance.COSINE
                    )
                )
                print(f"[qdrant] 集合创建成功")
        except Exception as e:
            print(f"[qdrant] 检查/创建集合失败: {e}")
            raise

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
        if not self.embedding_api_key or not self.embedding_base_url:
            print("[qdrant] 未配置向量化服务")
            return None

        try:
            url = f"{self.embedding_base_url.rstrip('/')}/embeddings"
            payload = {
                "model": self.embedding_model,
                "input": text,
                "encoding_format": "float"
            }

            response = self.session.post(url, json=payload, timeout=30)
            response.raise_for_status()

            result = response.json()
            if 'data' in result and len(result['data']) > 0:
                return result['data'][0]['embedding']

            print(f"[qdrant] 向量化响应格式错误: {result}")
            return None

        except Exception as e:
            print(f"[qdrant] 获取embedding失败: {e}")
            return None

    def _batch_get_embeddings(self, texts: List[str]) -> List[Optional[List[float]]]:
        """批量获取文本向量"""
        if not self.embedding_api_key or not self.embedding_base_url:
            print("[qdrant] 未配置向量化服务")
            return [None] * len(texts)

        try:
            url = f"{self.embedding_base_url.rstrip('/')}/embeddings"
            payload = {
                "model": self.embedding_model,
                "input": texts,
                "encoding_format": "float"
            }

            response = self.session.post(url, json=payload, timeout=60)
            response.raise_for_status()

            result = response.json()
            if 'data' in result:
                sorted_data = sorted(result['data'], key=lambda x: x['index'])
                return [item['embedding'] for item in sorted_data]

            return [None] * len(texts)

        except Exception as e:
            print(f"[qdrant] 批量获取embedding失败: {e}")
            # 降级为单个请求
            return [self._get_embedding(text) for text in texts]

    def store_summary(
        self,
        video_path: str,
        summary: Dict[str, Any],
        paragraphs: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        存储视频摘要到 Qdrant

        Args:
            video_path: 视频文件路径
            summary: 整体摘要
            paragraphs: 段落列表
            metadata: 额外元数据

        Returns:
            bool: 是否存储成功
        """
        try:
            video_id = self._generate_video_id(video_path)

            # 准备要向量化的文本
            texts_to_embed = []
            points = []

            # 1. 整体摘要
            overall_text = f"主题: {summary.get('topic', '')}\n总结: {summary.get('summary', '')}"
            texts_to_embed.append(overall_text)

            overall_payload = {
                "video_id": video_id,
                "video_path": video_path,
                "type": "overall_summary",
                "topic": summary.get('topic', ''),
                "paragraph_count": len(paragraphs),
                "total_duration": float(summary.get('total_duration', 0.0)),
                "created_at": datetime.now().isoformat()
            }
            if metadata:
                overall_payload.update(metadata)

            # 2. 段落摘要
            paragraph_payloads = []
            for i, para in enumerate(paragraphs):
                para_text = para.get('text', '')
                para_summary = para.get('summary', '')

                if para_summary:
                    para_doc = f"段落摘要: {para_summary}\n完整内容: {para_text}"
                else:
                    para_doc = para_text

                texts_to_embed.append(para_doc)

                para_payload = {
                    "video_id": video_id,
                    "video_path": video_path,
                    "type": "paragraph",
                    "index": i,
                    "start_time": float(para.get('start_time', 0.0)),
                    "end_time": float(para.get('end_time', 0.0)),
                    "has_summary": bool(para_summary),
                    "paragraph_summary": para_summary if para_summary else "",
                    "text": para_text
                }
                if metadata:
                    para_payload.update(metadata)

                paragraph_payloads.append(para_payload)

            # 批量获取 embeddings
            print(f"[qdrant] 正在向量化 {len(texts_to_embed)} 个文档...")
            embeddings = self._batch_get_embeddings(texts_to_embed)

            if not embeddings or len(embeddings) != len(texts_to_embed):
                print("[qdrant] 向量化失败")
                return False

            if any(e is None for e in embeddings):
                print("[qdrant] 部分文档向量化失败")
                return False

            # 构建 Points
            # 整体摘要
            points.append(PointStruct(
                id=f"{video_id}_overall",
                vector=embeddings[0],
                payload=overall_payload
            ))

            # 段落
            for i, (embedding, payload) in enumerate(zip(embeddings[1:], paragraph_payloads)):
                points.append(PointStruct(
                    id=f"{video_id}_para_{i}",
                    vector=embedding,
                    payload=payload
                ))

            # 批量插入 Qdrant
            self.client.upsert(
                collection_name=self.collection_name,
                points=points
            )

            print(f"[qdrant] 成功存储视频摘要: {os.path.basename(video_path)}")
            print(f"   - 整体摘要: 1 条")
            print(f"   - 段落摘要: {len(paragraphs)} 条")

            return True

        except Exception as e:
            print(f"[qdrant] 存储摘要失败: {e}")
            import traceback
            traceback.print_exc()
            return False

    def search(
        self,
        query: str,
        n_results: int = 5,
        video_id: Optional[str] = None,
        filter_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        语义搜索

        Args:
            query: 查询文本
            n_results: 返回结果数量
            video_id: 限制在特定视频中搜索
            filter_type: 过滤类型 (overall_summary/paragraph)

        Returns:
            List[Dict]: 搜索结果列表
        """
        try:
            # 获取查询向量
            query_embedding = self._get_embedding(query)
            if query_embedding is None:
                print("[qdrant] 查询文本向量化失败")
                return []

            # 构建过滤条件
            filter_conditions = []
            if video_id:
                filter_conditions.append(
                    FieldCondition(key="video_id", match=MatchValue(value=video_id))
                )
            if filter_type:
                filter_conditions.append(
                    FieldCondition(key="type", match=MatchValue(value=filter_type))
                )

            search_filter = Filter(must=filter_conditions) if filter_conditions else None

            # 搜索
            results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding,
                query_filter=search_filter,
                limit=n_results
            )

            # 格式化结果
            formatted_results = []
            for result in results:
                formatted_results.append({
                    "id": result.id,
                    "score": result.score,
                    "metadata": result.payload,
                    "document": result.payload.get('text', '')
                })

            return formatted_results

        except Exception as e:
            print(f"[qdrant] 搜索失败: {e}")
            import traceback
            traceback.print_exc()
            return []

    def delete_video(self, video_path: str) -> bool:
        """删除视频的所有数据"""
        try:
            video_id = self._generate_video_id(video_path)

            # 删除所有相关的点
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=Filter(
                    must=[FieldCondition(key="video_id", match=MatchValue(value=video_id))]
                )
            )

            print(f"[qdrant] 已删除视频摘要: {os.path.basename(video_path)}")
            return True

        except Exception as e:
            print(f"[qdrant] 删除失败: {e}")
            return False

    def get_video_summary(self, video_path: str) -> Optional[Dict[str, Any]]:
        """获取视频的完整摘要数据"""
        try:
            video_id = self._generate_video_id(video_path)

            # 查询所有相关点
            results = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=Filter(
                    must=[FieldCondition(key="video_id", match=MatchValue(value=video_id))]
                ),
                limit=1000
            )[0]

            if not results:
                return None

            # 分离整体摘要和段落
            overall = None
            paragraphs = []

            for point in results:
                if point.payload['type'] == 'overall_summary':
                    overall = {
                        "document": f"主题: {point.payload.get('topic', '')}\n总结: ...",
                        "metadata": point.payload
                    }
                elif point.payload['type'] == 'paragraph':
                    paragraphs.append({
                        "document": point.payload.get('text', ''),
                        "metadata": point.payload
                    })

            # 按 index 排序段落
            paragraphs.sort(key=lambda x: x['metadata'].get('index', 0))

            return {
                "video_path": video_path,
                "overall": overall,
                "paragraphs": paragraphs
            }

        except Exception as e:
            print(f"[qdrant] 获取摘要失败: {e}")
            return None

    def get_video_paragraphs_by_video_id(
        self,
        video_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        通过 video_id 获取视频的段落信息

        Args:
            video_id: 视频ID（MD5哈希值）

        Returns:
            Dict: 包含视频信息和段落列表
        """
        try:
            # 查询该视频的所有点
            results = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=Filter(
                    must=[FieldCondition(key="video_id", match=MatchValue(value=video_id))]
                ),
                limit=1000
            )[0]

            if not results:
                print(f"[qdrant] 未找到 video_id={video_id} 的数据")
                return None

            # 提取信息
            video_path = None
            summary_data = {}
            segments = []

            for point in results:
                payload = point.payload

                if video_path is None:
                    video_path = payload.get('video_path')

                if payload['type'] == 'overall_summary':
                    summary_data = {
                        "topic": payload.get('topic', ''),
                        "summary": payload.get('summary', ''),
                        "paragraph_count": payload.get('paragraph_count', 0),
                        "total_duration": float(payload.get('total_duration', 0))
                    }
                elif payload['type'] == 'paragraph':
                    start_time = float(payload.get('start_time', 0))
                    end_time = float(payload.get('end_time', 0))

                    # 转换为毫秒
                    if start_time > 0 and start_time < 100000:
                        start_time = start_time * 1000
                    if end_time > 0 and end_time < 100000:
                        end_time = end_time * 1000

                    segments.append({
                        "index": payload.get('index', 0),
                        "spk_id": payload.get('spk_id'),
                        "sentence": payload.get('text', ''),
                        "start_time": start_time,
                        "end_time": end_time
                    })

            # 排序段落
            segments.sort(key=lambda x: x['index'])

            # 推导静态 URL
            from backend.knowledge.knowledge_service import _infer_static_url
            static_url = _infer_static_url(video_path) if video_path else None

            result = {
                "video_id": video_id,
                "media_path": video_path,
                "static_url": static_url,
                "segments": segments,
                "summary": summary_data
            }

            print(f"[qdrant] 成功读取视频段落: video_id={video_id}, 段落数={len(segments)}")
            return result

        except Exception as e:
            print(f"[qdrant] 读取视频段落失败: video_id={video_id}, error={e}")
            import traceback
            traceback.print_exc()
            return None

    def list_all_videos(self) -> List[Dict[str, Any]]:
        """列出所有已存储摘要的视频"""
        try:
            # 只查询 overall_summary 类型
            results = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=Filter(
                    must=[FieldCondition(key="type", match=MatchValue(value="overall_summary"))]
                ),
                limit=1000
            )[0]

            videos = []
            for point in results:
                payload = point.payload
                videos.append({
                    "video_id": payload.get('video_id'),
                    "video_path": payload.get('video_path'),
                    "topic": payload.get('topic'),
                    "paragraph_count": payload.get('paragraph_count'),
                    "total_duration": payload.get('total_duration')
                })

            return videos

        except Exception as e:
            print(f"[qdrant] 列出视频失败: {e}")
            return []

    def test_connection(self) -> bool:
        """测试连接"""
        try:
            # 测试 Qdrant 连接
            collections = self.client.get_collections()
            print(f"[qdrant] Qdrant 连接成功，集合数: {len(collections.collections)}")

            # 测试向量化服务
            if self.embedding_api_key:
                test_embedding = self._get_embedding("测试连接")
                if test_embedding and len(test_embedding) > 0:
                    print(f"[qdrant] 向量化服务连接成功 (维度: {len(test_embedding)})")
                    return True
                else:
                    print("[qdrant] 向量化服务连接失败")
                    return False
            else:
                print("[qdrant] 未配置向量化服务")
                return True

        except Exception as e:
            print(f"[qdrant] 连接测试失败: {e}")
            return False
