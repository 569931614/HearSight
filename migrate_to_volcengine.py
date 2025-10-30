"""
从 PostgreSQL 迁移数据到火山引擎向量库
"""
import os
import sys
import psycopg2
import json
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

from backend.knowledge.volcengine_vector import VolcengineVectorClient
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

def migrate():
    """迁移数据"""

    # 连接PostgreSQL
    print("连接 PostgreSQL...")
    conn = psycopg2.connect(
        host=os.getenv('POSTGRES_HOST', '117.72.164.82'),
        port=int(os.getenv('POSTGRES_PORT', 5433)),
        user=os.getenv('POSTGRES_USER', 'admin'),
        password=os.getenv('POSTGRES_PASSWORD', 'Admin@123'),
        database=os.getenv('POSTGRES_DB', 'hearsight')
    )
    cur = conn.cursor()

    # 初始化火山引擎客户端
    print("初始化火山引擎客户端...")
    volcengine = VolcengineVectorClient(
        api_key=os.getenv('VOLCENGINE_API_KEY'),
        base_url=os.getenv('VOLCENGINE_BASE_URL'),
        collection_name=os.getenv('VOLCENGINE_COLLECTION_NAME'),
        embedding_model=os.getenv('VOLCENGINE_EMBEDDING_MODEL')
    )

    # 测试连接
    if not volcengine.test_connection():
        print("[FAIL] 火山引擎连接失败")
        return

    # 获取所有视频
    print("\n查询所有视频...")
    cur.execute("""
        SELECT video_id, video_path, metadata
        FROM video_embeddings
        WHERE doc_type = 'overall_summary'
        ORDER BY created_at DESC
    """)
    videos = cur.fetchall()

    print(f"找到 {len(videos)} 个视频\n")

    # 迁移每个视频
    for video_id, video_path, overall_meta_json in videos:
        print(f"处理视频: {Path(video_path).name}")
        print(f"  Video ID: {video_id}")

        # 解析元数据
        overall_meta = overall_meta_json if isinstance(overall_meta_json, dict) else json.loads(overall_meta_json)

        # 获取整体摘要文档
        cur.execute("""
            SELECT document
            FROM video_embeddings
            WHERE video_id = %s AND doc_type = 'overall_summary'
        """, (video_id,))
        overall_doc_row = cur.fetchone()
        if not overall_doc_row:
            print(f"  [WARN] 未找到整体摘要")
            continue

        # 从文档中提取主题和总结
        overall_doc = overall_doc_row[0]
        lines = overall_doc.split('\n')
        topic = ""
        summary = ""
        for line in lines:
            if line.startswith("主题:"):
                topic = line.replace("主题:", "").strip()
            elif line.startswith("总结:"):
                summary = line.replace("总结:", "").strip()

        # 获取所有段落
        cur.execute("""
            SELECT document, metadata, doc_index
            FROM video_embeddings
            WHERE video_id = %s AND doc_type = 'paragraph'
            ORDER BY doc_index
        """, (video_id,))
        paragraph_rows = cur.fetchall()

        print(f"  段落数: {len(paragraph_rows)}")

        # 构建段落列表
        paragraphs = []
        for doc, meta_json, index in paragraph_rows:
            meta = meta_json if isinstance(meta_json, dict) else json.loads(meta_json)

            # 从文档中提取段落摘要和完整内容
            para_summary = ""
            para_text = doc
            if doc.startswith("段落摘要:"):
                parts = doc.split("\n完整内容:")
                if len(parts) == 2:
                    para_summary = parts[0].replace("段落摘要:", "").strip()
                    para_text = parts[1].strip()

            paragraphs.append({
                "text": para_text,
                "summary": para_summary,
                "start_time": float(meta.get("start_time", 0)),
                "end_time": float(meta.get("end_time", 0))
            })

        # 计算总时长
        total_duration = max([p["end_time"] for p in paragraphs]) if paragraphs else 0

        # 构建摘要数据
        summary_data = {
            "topic": topic or overall_meta.get("topic", ""),
            "summary": summary or f"本视频包含 {len(paragraphs)} 个片段",
            "paragraph_count": len(paragraphs),
            "total_duration": total_duration
        }

        # 构建元数据
        metadata = {
            "video_id": video_id,
            "static_url": overall_meta.get("static_url"),
            "media_basename": Path(video_path).name,
            "source_media_path": video_path,
            "transcript_id": overall_meta.get("transcript_id")
        }

        # 存储到火山引擎
        print(f"  正在向量化并存储...")
        success = volcengine.store_summary(
            video_path=video_path,
            summary=summary_data,
            paragraphs=paragraphs,
            metadata=metadata
        )

        if success:
            print(f"  [OK] 迁移成功\n")
        else:
            print(f"  [FAIL] 迁移失败\n")

    cur.close()
    conn.close()

    print("迁移完成！")

if __name__ == "__main__":
    migrate()
