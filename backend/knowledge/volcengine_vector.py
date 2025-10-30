"""
火山引擎向量化服务客户端

使用火山引擎VikingDB或向量化API进行文档存储和检索
参考文档: https://www.volcengine.com/docs/82379/1521766
"""
import os
import requests
import json
import hashlib
from typing import List, Dict, Any, Optional
from datetime import datetime


class VolcengineVectorClient:
    """火山引擎向量化服务客户端"""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://ark.cn-beijing.volces.com/api/v3",
        collection_name: str = "video_summaries",
        embedding_model: str = "ep-20241217191853-w54rf"
    ):
        """
        初始化火山引擎向量化客户端

        Args:
            api_key: API密钥
            base_url: API基础URL
            collection_name: 集合名称
            embedding_model: Embedding模型endpoint ID
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.collection_name = collection_name
        self.embedding_model = embedding_model

        # API endpoints
        self.embedding_url = f"{self.base_url}/embeddings"

        self.session = requests.Session()
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

            print(f"[volcengine] 请求URL: {self.embedding_url}")
            print(f"[volcengine] 请求模型: {self.embedding_model}")
            print(f"[volcengine] API Key前缀: {self.api_key[:20] if self.api_key else 'None'}...")

            response = self.session.post(
                self.embedding_url,
                json=payload,
                timeout=30
            )

            # 如果响应不是200，打印详细错误
            if response.status_code != 200:
                print(f"[volcengine] HTTP {response.status_code} 错误响应:")
                try:
                    error_detail = response.json()
                    print(f"[volcengine] 错误详情: {error_detail}")
                except:
                    print(f"[volcengine] 响应内容: {response.text[:500]}")

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
        # 火山引擎Embedding API支持批量请求
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
                # 按照输入顺序返回
                sorted_data = sorted(result['data'], key=lambda x: x['index'])
                embeddings = [item['embedding'] for item in sorted_data]

            return embeddings

        except Exception as e:
            print(f"[volcengine] 批量获取embedding失败: {e}")
            # 降级为单个请求
            return [self._get_embedding(text) for text in texts]

    def store_summary(
        self,
        video_path: str,
        summary: Dict[str, Any],
        paragraphs: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None,
        local_storage_path: str = None
    ) -> bool:
        """
        存储视频摘要到向量库

        由于火山引擎向量化服务需要先创建Collection等复杂设置，
        这里采用本地存储+向量化的混合方案：
        1. 向量化文本用于检索
        2. 完整数据存储在本地JSON文件

        Args:
            video_path: 视频文件路径
            summary: 整体摘要
            paragraphs: 段落列表
            metadata: 额外元数据
            local_storage_path: 本地存储路径

        Returns:
            bool: 是否存储成功
        """
        try:
            video_id = self._generate_video_id(video_path)

            # 准备要向量化的文本
            texts_to_embed = []
            doc_metas = []

            # 1. 整体摘要
            overall_text = f"主题: {summary.get('topic', '')}\n总结: {summary.get('summary', '')}"
            texts_to_embed.append(overall_text)

            overall_meta = {
                "video_id": video_id,
                "video_path": video_path,
                "type": "overall_summary",
                "topic": summary.get('topic', ''),
                "paragraph_count": len(paragraphs),
                "total_duration": float(summary.get('total_duration', 0.0)),
                "created_at": datetime.now().isoformat()
            }
            if metadata:
                overall_meta.update(metadata)

            doc_metas.append(overall_meta)

            # 2. 段落摘要
            for i, para in enumerate(paragraphs):
                para_text = para.get('text', '')
                para_summary = para.get('summary', '')

                if para_summary:
                    para_doc = f"段落摘要: {para_summary}\n完整内容: {para_text}"
                else:
                    para_doc = para_text

                texts_to_embed.append(para_doc)

                para_meta = {
                    "video_id": video_id,
                    "video_path": video_path,
                    "type": "paragraph",
                    "index": i,
                    "start_time": float(para.get('start_time', 0.0)),
                    "end_time": float(para.get('end_time', 0.0)),
                    "has_summary": bool(para_summary),
                    "paragraph_summary": para_summary if para_summary else ""
                }
                # 合并传入的 metadata（包含 transcript_id 等信息）
                if metadata:
                    para_meta.update(metadata)
                doc_metas.append(para_meta)

            # 批量获取embeddings
            print(f"正在向量化 {len(texts_to_embed)} 个文档...")
            embeddings = self._batch_get_embeddings(texts_to_embed)

            if not embeddings or len(embeddings) != len(texts_to_embed):
                print("[volcengine] 向量化失败")
                return False

            # 检查是否有None值
            if any(e is None for e in embeddings):
                print("[volcengine] 部分文档向量化失败")
                return False

            # 存储到本地文件
            if local_storage_path is None:
                # 使用环境变量或默认路径
                base_path = os.environ.get('HEARSIGHT_VECTOR_DB_DIR', 'app_datas/vector_db')
                local_storage_path = os.path.join(base_path, 'volcengine')

            os.makedirs(local_storage_path, exist_ok=True)

            # 构建存储数据
            storage_data = {
                "video_id": video_id,
                "video_path": video_path,
                "summary": summary,
                "paragraphs": paragraphs,
                "metadata": metadata,
                "documents": []
            }

            for i, (text, embedding, meta) in enumerate(zip(texts_to_embed, embeddings, doc_metas)):
                storage_data["documents"].append({
                    "id": f"{video_id}_{meta['type']}_{i}",
                    "text": text,
                    "embedding": embedding,
                    "metadata": meta
                })

            # 写入文件
            storage_file = os.path.join(local_storage_path, f"{video_id}.json")
            with open(storage_file, 'w', encoding='utf-8') as f:
                json.dump(storage_data, f, ensure_ascii=False, indent=2)

            print(f"[volcengine] 成功存储视频摘要: {os.path.basename(video_path)}")
            print(f"   - 整体摘要: 1 条")
            print(f"   - 段落摘要: {len(paragraphs)} 条")
            print(f"   - 存储路径: {storage_file}")

            return True

        except Exception as e:
            print(f"[volcengine] 存储摘要失败: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """计算余弦相似度"""
        import math

        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        magnitude1 = math.sqrt(sum(a * a for a in vec1))
        magnitude2 = math.sqrt(sum(b * b for b in vec2))

        if magnitude1 == 0 or magnitude2 == 0:
            return 0.0

        return dot_product / (magnitude1 * magnitude2)

    def search(
        self,
        query: str,
        n_results: int = 5,
        video_id: Optional[str] = None,
        filter_type: Optional[str] = None,
        local_storage_path: str = None
    ) -> List[Dict[str, Any]]:
        """
        语义搜索

        Args:
            query: 查询文本
            n_results: 返回结果数量
            video_id: 限制在特定视频中搜索
            filter_type: 过滤类型
            local_storage_path: 本地存储路径

        Returns:
            List[Dict]: 搜索结果列表
        """
        try:
            # 获取查询向量
            query_embedding = self._get_embedding(query)
            if query_embedding is None:
                print("[volcengine] 查询文本向量化失败")
                return []

            # 读取所有存储的文档
            if local_storage_path is None:
                # 使用环境变量或默认路径
                base_path = os.environ.get('HEARSIGHT_VECTOR_DB_DIR', 'app_datas/vector_db')
                local_storage_path = os.path.join(base_path, 'volcengine')

            print(f"[volcengine] 搜索向量库路径: {local_storage_path}")
            print(f"[volcengine] 路径是否存在: {os.path.exists(local_storage_path)}")

            if not os.path.exists(local_storage_path):
                print(f"[volcengine] 向量库路径不存在")
                return []

            # 列出所有JSON文件
            json_files = [f for f in os.listdir(local_storage_path) if f.endswith('.json')]
            print(f"[volcengine] 找到 {len(json_files)} 个向量文件: {json_files}")

            all_results = []

            # 遍历所有JSON文件
            for filename in os.listdir(local_storage_path):
                if not filename.endswith('.json'):
                    continue

                filepath = os.path.join(local_storage_path, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # 如果指定了video_id，跳过不匹配的
                if video_id and data['video_id'] != video_id:
                    continue

                # 计算相似度
                for doc in data['documents']:
                    meta = doc['metadata']

                    # 类型过滤
                    if filter_type and meta.get('type') != filter_type:
                        continue

                    similarity = self._cosine_similarity(query_embedding, doc['embedding'])

                    all_results.append({
                        "document": doc['text'],
                        "metadata": meta,
                        "id": doc['id'],
                        "distance": 1 - similarity,  # 转换为距离（越小越相似）
                        "similarity": similarity
                    })

            # 按相似度排序并返回前n个
            all_results.sort(key=lambda x: x['distance'])
            return all_results[:n_results]

        except Exception as e:
            print(f"[volcengine] 搜索失败: {e}")
            import traceback
            traceback.print_exc()
            return []

    def delete_video(self, video_path: str, local_storage_path: str = None) -> bool:
        """
        删除视频的所有摘要数据

        Args:
            video_path: 视频路径
            local_storage_path: 本地存储路径

        Returns:
            bool: 是否删除成功
        """
        try:
            video_id = self._generate_video_id(video_path)

            if local_storage_path is None:
                # 使用环境变量或默认路径
                base_path = os.environ.get('HEARSIGHT_VECTOR_DB_DIR', 'app_datas/vector_db')
                local_storage_path = os.path.join(base_path, 'volcengine')

            storage_file = os.path.join(local_storage_path, f"{video_id}.json")

            if os.path.exists(storage_file):
                os.remove(storage_file)
                print(f"[volcengine] 已删除视频摘要: {os.path.basename(video_path)}")
                return True
            else:
                print(f"[volcengine] 未找到视频摘要: {os.path.basename(video_path)}")
                return False

        except Exception as e:
            print(f"[volcengine] 删除失败: {e}")
            return False

    def get_video_summary(
        self,
        video_path: str,
        local_storage_path: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        获取视频的完整摘要数据（兼容ChromaDB格式）

        Args:
            video_path: 视频路径
            local_storage_path: 本地存储路径

        Returns:
            Optional[Dict]: 摘要数据（ChromaDB兼容格式）
        """
        try:
            video_id = self._generate_video_id(video_path)

            if local_storage_path is None:
                # 使用环境变量或默认路径
                base_path = os.environ.get('HEARSIGHT_VECTOR_DB_DIR', 'app_datas/vector_db')
                local_storage_path = os.path.join(base_path, 'volcengine')

            storage_file = os.path.join(local_storage_path, f"{video_id}.json")

            if not os.path.exists(storage_file):
                return None

            with open(storage_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 转换为 ChromaDB 兼容格式
            summary = data['summary']
            paragraphs = data['paragraphs']

            # 构建整体摘要文档
            overall_doc = f"主题: {summary.get('topic', '')}\n总结: {summary.get('summary', '')}"

            # 查找 overall_summary 类型的文档元数据
            overall_meta = None
            for doc in data.get('documents', []):
                if doc['metadata']['type'] == 'overall_summary':
                    overall_meta = doc['metadata']
                    break

            if not overall_meta:
                # 如果没有找到，创建默认元数据
                overall_meta = {
                    'video_id': video_id,
                    'video_path': video_path,
                    'type': 'overall_summary',
                    'topic': summary.get('topic', ''),
                    'paragraph_count': len(paragraphs),
                    'total_duration': float(summary.get('total_duration', 0.0))
                }

            # 构建段落列表
            paragraphs_list = []
            for i, para in enumerate(paragraphs):
                para_summary = para.get('summary', '')
                para_text = para.get('text', '')

                if para_summary:
                    para_doc = f"段落摘要: {para_summary}\n完整内容: {para_text}"
                else:
                    para_doc = para_text

                para_meta = {
                    'video_id': video_id,
                    'video_path': video_path,
                    'type': 'paragraph',
                    'index': i,
                    'start_time': float(para.get('start_time', 0.0)),
                    'end_time': float(para.get('end_time', 0.0)),
                    'has_summary': bool(para_summary),
                    'paragraph_summary': para_summary
                }

                paragraphs_list.append({
                    'document': para_doc,
                    'metadata': para_meta
                })

            return {
                "video_path": video_path,
                "overall": {
                    "document": overall_doc,
                    "metadata": overall_meta
                },
                "paragraphs": paragraphs_list
            }

        except Exception as e:
            print(f"[volcengine] 获取摘要失败: {e}")
            import traceback
            traceback.print_exc()
            return None

    def list_all_videos(self, local_storage_path: str = None) -> List[Dict[str, Any]]:
        """
        列出所有已存储摘要的视频

        Args:
            local_storage_path: 本地存储路径

        Returns:
            List[Dict]: 视频列表
        """
        try:
            if local_storage_path is None:
                # 使用环境变量或默认路径
                base_path = os.environ.get('HEARSIGHT_VECTOR_DB_DIR', 'app_datas/vector_db')
                local_storage_path = os.path.join(base_path, 'volcengine')

            if not os.path.exists(local_storage_path):
                return []

            videos = []
            for filename in os.listdir(local_storage_path):
                if not filename.endswith('.json'):
                    continue

                filepath = os.path.join(local_storage_path, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # 查找overall_summary类型的文档
                overall_doc = next(
                    (doc for doc in data['documents'] if doc['metadata']['type'] == 'overall_summary'),
                    None
                )

                if overall_doc:
                    meta = overall_doc['metadata']
                    videos.append({
                        "video_id": data['video_id'],
                        "video_path": data['video_path'],
                        "topic": meta.get('topic'),
                        "paragraph_count": meta.get('paragraph_count'),
                        "total_duration": meta.get('total_duration')
                    })

            return videos

        except Exception as e:
            print(f"[volcengine] 列出视频失败: {e}")
            return []

    def test_connection(self) -> bool:
        """
        测试API连接

        Returns:
            bool: 连接是否正常
        """
        try:
            test_text = "测试连接"
            embedding = self._get_embedding(test_text)

            if embedding and len(embedding) > 0:
                print(f"[volcengine] 火山引擎向量化服务连接成功 (embedding维度: {len(embedding)})")
                return True
            else:
                print("[volcengine] 获取embedding失败")
                return False

        except Exception as e:
            print(f"[volcengine] 连接测试失败: {e}")
            return False

    def get_video_paragraphs_by_video_id(
        self,
        video_id: str,
        local_storage_path: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        通过 video_id 从本地JSON获取视频的段落信息

        Args:
            video_id: 视频ID（MD5哈希值）
            local_storage_path: 本地存储路径

        Returns:
            Dict: 包含视频信息和段落列表，如果未找到返回 None
        """
        try:
            if local_storage_path is None:
                base_path = os.environ.get('HEARSIGHT_VECTOR_DB_DIR', 'app_datas/vector_db')
                local_storage_path = os.path.join(base_path, 'volcengine')

            storage_file = os.path.join(local_storage_path, f"{video_id}.json")

            if not os.path.exists(storage_file):
                print(f"[volcengine] 文件不存在: {storage_file}")
                return None

            with open(storage_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 获取基本信息
            video_path = data['video_path']
            summary_data = data['summary']
            paragraphs_data = data['paragraphs']
            metadata = data.get('metadata', {})

            # 推导静态 URL
            from backend.knowledge.knowledge_service import _infer_static_url
            static_url = _infer_static_url(video_path)

            # 构建段落列表（前端需要的格式）
            segments = []
            for para in paragraphs_data:
                segments.append({
                    "text": para.get('text', ''),
                    "start_time": float(para.get('start_time', 0)),
                    "end_time": float(para.get('end_time', 0))
                })

            result = {
                "video_id": video_id,
                "media_path": video_path,
                "static_url": static_url or metadata.get('static_url'),
                "segments": segments,
                "summary": {
                    "topic": summary_data.get('topic', ''),
                    "summary": summary_data.get('summary', ''),
                    "paragraph_count": len(segments),
                    "total_duration": float(summary_data.get('total_duration', 0))
                }
            }

            print(f"[volcengine] 成功读取视频段落: video_id={video_id}, 段落数={len(segments)}")
            return result

        except Exception as e:
            print(f"[volcengine] 读取视频段落失败: video_id={video_id}, error={e}")
            import traceback
            traceback.print_exc()
            return None
