#!/usr/bin/env python3
"""
数据迁移脚本：从旧的向量存储迁移到 Qdrant

使用方法：
  python scripts/migrate_to_qdrant.py
"""
import os
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.knowledge.qdrant_vector import QdrantVectorStore
from backend.db.pg_store import list_transcripts_meta, get_transcript_by_id, get_summaries_by_transcript_id


def migrate_from_json():
    """从旧的 JSON 文件迁移数据到 Qdrant"""
    print("=== 从 JSON 文件迁移到 Qdrant ===\n")

    # 1. 初始化 Qdrant
    qdrant_host = os.environ.get('QDRANT_HOST', 'localhost')
    qdrant_port = int(os.environ.get('QDRANT_PORT', 6333))
    collection_name = os.environ.get('QDRANT_COLLECTION_NAME', 'video_summaries')

    # 向量化配置
    api_key = os.environ.get('VOLCENGINE_API_KEY', '')
    base_url = os.environ.get('VOLCENGINE_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3')
    embedding_model = os.environ.get('VOLCENGINE_EMBEDDING_MODEL', '')

    print(f"连接 Qdrant: {qdrant_host}:{qdrant_port}")
    qdrant_client = QdrantVectorStore(
        host=qdrant_host,
        port=qdrant_port,
        collection_name=collection_name,
        embedding_api_key=api_key,
        embedding_base_url=base_url,
        embedding_model=embedding_model
    )

    # 测试连接
    if not qdrant_client.test_connection():
        print("❌ Qdrant 连接失败，请检查配置")
        return False

    # 2. 读取旧的 JSON 文件
    vector_db_dir = os.environ.get('HEARSIGHT_VECTOR_DB_DIR', 'app_datas/vector_db')
    volcengine_dir = os.path.join(vector_db_dir, 'volcengine')

    if not os.path.exists(volcengine_dir):
        print(f"⚠️ 未找到旧的向量数据目录: {volcengine_dir}")
        print("没有数据需要迁移")
        return True

    import json
    json_files = [f for f in os.listdir(volcengine_dir) if f.endswith('.json')]
    print(f"找到 {len(json_files)} 个 JSON 文件\n")

    success_count = 0
    failed_count = 0

    for filename in json_files:
        filepath = os.path.join(volcengine_dir, filename)
        print(f"迁移: {filename}...", end=' ')

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)

            video_path = data['video_path']
            summary = data['summary']
            paragraphs = data['paragraphs']
            metadata = data.get('metadata', {})

            # 存储到 Qdrant
            result = qdrant_client.store_summary(
                video_path=video_path,
                summary=summary,
                paragraphs=paragraphs,
                metadata=metadata
            )

            if result:
                print("✅")
                success_count += 1
            else:
                print("❌")
                failed_count += 1

        except Exception as e:
            print(f"❌ {e}")
            failed_count += 1

    print(f"\n迁移完成: 成功 {success_count}, 失败 {failed_count}")
    return failed_count == 0


def migrate_from_postgresql():
    """从 PostgreSQL 重新生成并存储到 Qdrant"""
    print("=== 从 PostgreSQL 重新生成向量数据到 Qdrant ===\n")

    # 1. 初始化 Qdrant
    qdrant_host = os.environ.get('QDRANT_HOST', 'localhost')
    qdrant_port = int(os.environ.get('QDRANT_PORT', 6333))
    collection_name = os.environ.get('QDRANT_COLLECTION_NAME', 'video_summaries')

    # 向量化配置
    api_key = os.environ.get('VOLCENGINE_API_KEY', '')
    base_url = os.environ.get('VOLCENGINE_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3')
    embedding_model = os.environ.get('VOLCENGINE_EMBEDDING_MODEL', '')

    print(f"连接 Qdrant: {qdrant_host}:{qdrant_port}")
    qdrant_client = QdrantVectorStore(
        host=qdrant_host,
        port=qdrant_port,
        collection_name=collection_name,
        embedding_api_key=api_key,
        embedding_base_url=base_url,
        embedding_model=embedding_model
    )

    # 测试连接
    if not qdrant_client.test_connection():
        print("❌ Qdrant 连接失败，请检查配置")
        return False

    # 2. 从 PostgreSQL 读取所有转写记录
    db_url = None  # 使用环境变量配置
    transcripts = list_transcripts_meta(db_url, limit=10000, offset=0)

    if not transcripts:
        print("⚠️ 未找到转写记录")
        return True

    print(f"找到 {len(transcripts)} 条转写记录\n")

    success_count = 0
    failed_count = 0

    for transcript_meta in transcripts:
        transcript_id = transcript_meta['id']
        print(f"处理转写记录 #{transcript_id}...", end=' ')

        try:
            # 获取完整的转写记录
            transcript = get_transcript_by_id(db_url, transcript_id)
            if not transcript:
                print("❌ 未找到")
                failed_count += 1
                continue

            media_path = transcript.get('media_path')
            segments = transcript.get('segments', [])

            # 获取摘要
            summaries = get_summaries_by_transcript_id(db_url, transcript_id)
            if not summaries:
                print("⚠️  无摘要，跳过")
                continue

            # 构建摘要数据
            topic = "视频内容"
            overall_summary = ""
            paragraphs = []

            for summary_item in summaries:
                para_text = summary_item.get("text", "")
                para_summary = summary_item.get("summary", "")
                start_time = float(summary_item.get("start_time", 0) or 0)
                end_time = float(summary_item.get("end_time", 0) or 0)

                paragraphs.append({
                    "text": para_text,
                    "summary": para_summary,
                    "start_time": start_time,
                    "end_time": end_time
                })

                if para_summary and not overall_summary:
                    overall_summary = para_summary[:200]

            summary_dict = {
                "topic": topic,
                "summary": overall_summary,
                "paragraph_count": len(paragraphs),
                "total_duration": float(segments[-1].get('end_time', 0) if segments else 0)
            }

            # 存储到 Qdrant
            result = qdrant_client.store_summary(
                video_path=media_path,
                summary=summary_dict,
                paragraphs=paragraphs,
                metadata={"transcript_id": transcript_id}
            )

            if result:
                print("✅")
                success_count += 1
            else:
                print("❌")
                failed_count += 1

        except Exception as e:
            print(f"❌ {e}")
            failed_count += 1

    print(f"\n迁移完成: 成功 {success_count}, 失败 {failed_count}")
    return failed_count == 0


def main():
    print("HearSight 向量数据迁移工具\n")
    print("选择迁移源:")
    print("  1. 从旧的 JSON 文件迁移（火山引擎本地存储）")
    print("  2. 从 PostgreSQL 重新生成")
    print("  3. 两者都执行")

    choice = input("\n请选择 (1/2/3): ").strip()

    if choice == '1':
        migrate_from_json()
    elif choice == '2':
        migrate_from_postgresql()
    elif choice == '3':
        migrate_from_json()
        print("\n" + "="*50 + "\n")
        migrate_from_postgresql()
    else:
        print("无效选择")
        return

    print("\n迁移完成！")
    print("\n提示：")
    print("  1. 确认数据已迁移成功后，可以删除旧的 JSON 文件")
    print("  2. 更新 .env 配置: HEARSIGHT_VECTOR_BACKEND=qdrant")
    print("  3. 重启服务生效")


if __name__ == '__main__':
    main()
