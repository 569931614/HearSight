"""
PostgreSQL 向量数据库存储模块

使用 PostgreSQL 存储视频摘要和段落内容，支持全文搜索和语义检索
"""
import os
import json
import hashlib
import psycopg2
from typing import List, Dict, Any, Optional
from datetime import datetime


class PostgreSQLVectorStore:
    """PostgreSQL 向量存储管理器"""

    def __init__(self, db_config: Dict[str, Any]):
        """
        初始化 PostgreSQL 向量存储

        Args:
            db_config: 数据库配置 {host, port, user, password, database}
        """
        self.db_config = db_config
        self.conn = None
        self.collection = "video_embeddings"  # 兼容接口

    def initialize(self) -> bool:
        """
        初始化数据库连接

        Returns:
            bool: 初始化是否成功
        """
        try:
            self.conn = psycopg2.connect(
                host=self.db_config['host'],
                port=self.db_config['port'],
                user=self.db_config['user'],
                password=self.db_config['password'],
                database=self.db_config['database']
            )
            print(f"[vector] PostgreSQL 向量存储初始化成功")
            return True
        except Exception as e:
            print(f"[vector] 初始化 PostgreSQL 失败: {e}")
            return False

    def _generate_video_id(self, video_path: str) -> str:
        """
        生成视频唯一ID

        Args:
            video_path: 视频路径

        Returns:
            str: 视频ID (MD5哈希)
        """
        return hashlib.md5(video_path.encode('utf-8')).hexdigest()

    def _get_connection(self):
        """获取数据库连接"""
        if not self.conn or self.conn.closed:
            self.initialize()
        return self.conn

    def store_summary(
        self,
        video_path: str,
        summary: Dict[str, Any],
        paragraphs: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        存储视频摘要到 PostgreSQL

        Args:
            video_path: 视频文件路径
            summary: 整体摘要 {topic, summary, ...}
            paragraphs: 段落列表 [{text, summary, start_time, end_time}, ...]
            metadata: 额外的元数据

        Returns:
            bool: 是否存储成功
        """
        try:
            conn = self._get_connection()
            cur = conn.cursor()

            video_id = self._generate_video_id(video_path)

            # 删除旧数据
            cur.execute("DELETE FROM video_embeddings WHERE video_id = %s", (video_id,))

            # 1. 存储整体摘要
            overall_doc = f"主题: {summary.get('topic', '')}\n总结: {summary.get('summary', '')}"
            overall_meta = {
                "video_id": video_id,
                "video_path": video_path,
                "type": "overall_summary",
                "topic": summary.get('topic', ''),
                "paragraph_count": summary.get('paragraph_count', len(paragraphs)),
                "total_duration": float(summary.get('total_duration', 0.0))
            }
            if metadata:
                overall_meta.update(metadata)

            cur.execute("""
                INSERT INTO video_embeddings
                (video_id, video_path, doc_type, doc_index, document, embedding, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                video_id,
                video_path,
                'overall_summary',
                None,
                overall_doc,
                None,  # embedding 暂时为空，可以后续添加
                json.dumps(overall_meta)
            ))

            # 2. 存储每个段落
            for i, para in enumerate(paragraphs):
                para_text = para.get('text', '')
                para_summary = para.get('summary', '')

                if para_summary:
                    para_doc = f"段落摘要: {para_summary}\n完整内容: {para_text}"
                else:
                    para_doc = para_text

                para_meta = {
                    "video_id": video_id,
                    "video_path": video_path,
                    "type": "paragraph",
                    "index": i,
                    "start_time": float(para.get('start_time', 0.0)),
                    "end_time": float(para.get('end_time', 0.0)),
                    "has_summary": bool(para_summary)
                }

                if para_summary:
                    para_meta["paragraph_summary"] = para_summary

                if metadata:
                    para_meta.update(metadata)

                cur.execute("""
                    INSERT INTO video_embeddings
                    (video_id, video_path, doc_type, doc_index, document, embedding, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    video_id,
                    video_path,
                    'paragraph',
                    i,
                    para_doc,
                    None,
                    json.dumps(para_meta)
                ))

            conn.commit()
            print(f"[vector] 成功存储视频摘要到 PostgreSQL: {os.path.basename(video_path)}")
            print(f"         段落数量: {len(paragraphs)}")

            cur.close()
            return True

        except Exception as e:
            print(f"[vector] 存储摘要失败: {e}")
            import traceback
            traceback.print_exc()
            if conn:
                conn.rollback()
            return False

    def search(
        self,
        query: str,
        n_results: int = 5,
        video_id: Optional[str] = None,
        filter_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        全文搜索（支持中文模糊匹配）

        Args:
            query: 查询文本
            n_results: 返回结果数量
            video_id: 限制在特定视频中搜索
            filter_type: 过滤类型 ("overall_summary" 或 "paragraph")

        Returns:
            List[Dict]: 搜索结果列表
        """
        try:
            conn = self._get_connection()
            cur = conn.cursor()

            # 构建查询条件
            conditions = []
            params = []

            if video_id:
                conditions.append("video_id = %s")
                params.append(video_id)
            if filter_type:
                conditions.append("doc_type = %s")
                params.append(filter_type)

            where_clause = ""
            if conditions:
                where_clause = " AND " + " AND ".join(conditions)

            # 尝试全文搜索
            try:
                search_sql = f"""
                    SELECT
                        id, video_id, video_path, doc_type, doc_index,
                        document, metadata,
                        ts_rank(search_vector, plainto_tsquery('simple', %s)) as rank
                    FROM video_embeddings
                    WHERE search_vector @@ plainto_tsquery('simple', %s) {where_clause}
                    ORDER BY rank DESC
                    LIMIT %s
                """
                search_params = [query, query] + params + [n_results]
                cur.execute(search_sql, search_params)
                rows = cur.fetchall()

                # 如果全文搜索没有结果，使用模糊匹配（对中文友好）
                if not rows:
                    print(f"[vector] 全文搜索无结果，使用模糊匹配: {query}")
                    like_pattern = f"%{query}%"
                    like_sql = f"""
                        SELECT
                            id, video_id, video_path, doc_type, doc_index,
                            document, metadata,
                            1.0 as rank
                        FROM video_embeddings
                        WHERE document ILIKE %s {where_clause}
                        ORDER BY
                            CASE WHEN doc_type = 'overall_summary' THEN 0 ELSE 1 END,
                            doc_index
                        LIMIT %s
                    """
                    like_params = [like_pattern] + params + [n_results]
                    cur.execute(like_sql, like_params)
                    rows = cur.fetchall()
            except Exception as search_error:
                # 如果全文搜索失败，直接使用模糊匹配
                print(f"[vector] 全文搜索失败，使用模糊匹配: {search_error}")
                like_pattern = f"%{query}%"
                like_sql = f"""
                    SELECT
                        id, video_id, video_path, doc_type, doc_index,
                        document, metadata,
                        1.0 as rank
                    FROM video_embeddings
                    WHERE document ILIKE %s {where_clause}
                    ORDER BY
                        CASE WHEN doc_type = 'overall_summary' THEN 0 ELSE 1 END,
                        doc_index
                    LIMIT %s
                """
                like_params = [like_pattern] + params + [n_results]
                cur.execute(like_sql, like_params)
                rows = cur.fetchall()

            # 标准化 rank 值并格式化结果
            results = []
            if rows:
                # 获取所有 rank 值
                ranks = [row[7] for row in rows]
                max_rank = max(ranks) if ranks else 1.0
                min_rank = min(ranks) if ranks else 0.0
                rank_range = max_rank - min_rank

                # 标准化 rank 并计算 distance
                for row in rows:
                    meta = row[6] if isinstance(row[6], dict) else (json.loads(row[6]) if row[6] else {})

                    # 标准化 rank 到 0-1 范围
                    if rank_range > 0:
                        normalized_rank = (row[7] - min_rank) / rank_range
                    else:
                        # 所有结果的 rank 相同，设为最高相似度
                        normalized_rank = 1.0

                    # distance = 1 - normalized_rank (rank越高，distance越小，相似度越高)
                    distance = 1.0 - normalized_rank

                    results.append({
                        "id": f"{row[1]}_{row[3]}_{row[4] if row[4] is not None else 'overall'}",
                        "document": row[5],
                        "metadata": meta,
                        "distance": distance
                    })

            cur.close()
            return results

        except Exception as e:
            print(f"[vector] 搜索失败: {e}")
            import traceback
            traceback.print_exc()
            return []

    def delete_video(self, video_path: str) -> bool:
        """
        删除视频的所有摘要数据

        Args:
            video_path: 视频路径

        Returns:
            bool: 是否删除成功
        """
        try:
            conn = self._get_connection()
            cur = conn.cursor()

            video_id = self._generate_video_id(video_path)

            cur.execute("DELETE FROM video_embeddings WHERE video_id = %s", (video_id,))
            count = cur.rowcount
            conn.commit()
            cur.close()

            if count > 0:
                print(f"[vector] 已删除视频摘要: {os.path.basename(video_path)} ({count} 条记录)")
                return True
            else:
                print(f"[vector] 未找到视频摘要: {os.path.basename(video_path)}")
                return False

        except Exception as e:
            print(f"[vector] 删除失败: {e}")
            if conn:
                conn.rollback()
            return False

    def get_video_summary(self, video_path: str) -> Optional[Dict[str, Any]]:
        """
        获取视频的完整摘要数据

        Args:
            video_path: 视频路径

        Returns:
            Optional[Dict]: 摘要数据，如果不存在返回None
        """
        try:
            conn = self._get_connection()
            cur = conn.cursor()

            video_id = self._generate_video_id(video_path)

            # 获取整体摘要
            cur.execute("""
                SELECT document, metadata
                FROM video_embeddings
                WHERE video_id = %s AND doc_type = 'overall_summary'
            """, (video_id,))
            overall_row = cur.fetchone()

            if not overall_row:
                cur.close()
                return None

            # 获取所有段落
            cur.execute("""
                SELECT document, metadata
                FROM video_embeddings
                WHERE video_id = %s AND doc_type = 'paragraph'
                ORDER BY doc_index
            """, (video_id,))
            paragraph_rows = cur.fetchall()

            result = {
                "video_path": video_path,
                "overall": {
                    "document": overall_row[0],
                    "metadata": overall_row[1] if isinstance(overall_row[1], dict) else (json.loads(overall_row[1]) if overall_row[1] else {})
                },
                "paragraphs": []
            }

            for row in paragraph_rows:
                result['paragraphs'].append({
                    "document": row[0],
                    "metadata": row[1] if isinstance(row[1], dict) else (json.loads(row[1]) if row[1] else {})
                })

            cur.close()
            return result

        except Exception as e:
            print(f"[vector] 获取摘要失败: {e}")
            return None

    def list_all_videos(self) -> List[Dict[str, Any]]:
        """
        列出所有已存储摘要的视频

        Returns:
            List[Dict]: 视频列表
        """
        try:
            conn = self._get_connection()
            cur = conn.cursor()

            cur.execute("""
                SELECT video_id, video_path, metadata, created_at
                FROM video_embeddings
                WHERE doc_type = 'overall_summary'
                ORDER BY created_at DESC
            """)
            rows = cur.fetchall()

            videos = []
            for row in rows:
                meta = row[2] if isinstance(row[2], dict) else (json.loads(row[2]) if row[2] else {})
                videos.append({
                    "video_id": row[0],
                    "video_path": row[1],
                    "topic": meta.get("topic"),
                    "paragraph_count": meta.get("paragraph_count"),
                    "total_duration": meta.get("total_duration")
                })

            cur.close()
            return videos

        except Exception as e:
            print(f"[vector] 列出视频失败: {e}")
            return []

    def get_video_paragraphs_by_video_id(self, video_id: str) -> Optional[Dict[str, Any]]:
        """
        通过 video_id 获取视频的段落信息

        Args:
            video_id: 视频ID（MD5哈希值）

        Returns:
            Dict: 包含视频信息和段落列表，如果未找到返回 None
        """
        try:
            conn = self._get_connection()
            cur = conn.cursor()

            # 获取整体摘要
            cur.execute("""
                SELECT video_path, metadata
                FROM video_embeddings
                WHERE video_id = %s AND doc_type = 'overall_summary'
            """, (video_id,))
            overall_row = cur.fetchone()

            if not overall_row:
                cur.close()
                return None

            video_path = overall_row[0]
            overall_meta = overall_row[1] if isinstance(overall_row[1], dict) else (json.loads(overall_row[1]) if overall_row[1] else {})

            # 获取所有段落
            cur.execute("""
                SELECT document, metadata
                FROM video_embeddings
                WHERE video_id = %s AND doc_type = 'paragraph'
                ORDER BY doc_index
            """, (video_id,))
            paragraph_rows = cur.fetchall()

            # 转换为前端需要的格式
            segments = []
            for row in paragraph_rows:
                meta = row[1] if isinstance(row[1], dict) else (json.loads(row[1]) if row[1] else {})
                segments.append({
                    "text": row[0],
                    "start_time": meta.get("start_time", 0.0),
                    "end_time": meta.get("end_time", 0.0),
                    "index": meta.get("index", 0)
                })

            # 推导静态 URL
            from backend.knowledge.knowledge_service import _infer_static_url
            static_url = _infer_static_url(video_path)

            result = {
                "video_id": video_id,
                "media_path": video_path,
                "static_url": static_url,
                "segments": segments,
                "summary": {
                    "topic": overall_meta.get("topic", ""),
                    "summary": overall_meta.get("summary", ""),
                    "paragraph_count": len(segments),
                    "total_duration": overall_meta.get("total_duration", 0.0)
                }
            }

            cur.close()
            print(f"[vector] 成功通过 video_id 获取视频段落: {video_id}, 段落数={len(segments)}")
            return result

        except Exception as e:
            print(f"[vector] 通过 video_id 获取视频段落失败: {e}")
            import traceback
            traceback.print_exc()
            return None

    def __del__(self):
        """析构函数，关闭数据库连接"""
        if self.conn and not self.conn.closed:
            self.conn.close()
