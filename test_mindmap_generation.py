#!/usr/bin/env python3
"""
测试思维导图自动生成功能

用法:
    python3 test_mindmap_generation.py [video_id]

如果不提供 video_id，将自动获取第一个视频进行测试
"""

import requests
import sys
import json

BASE_URL = "http://localhost:9999"


def get_first_video():
    """获取第一个视频的 ID"""
    response = requests.get(f"{BASE_URL}/api/qdrant/videos?page=1&page_size=1")
    response.raise_for_status()
    data = response.json()

    videos = data.get("videos", [])
    if not videos:
        print("❌ 没有找到任何视频")
        return None

    video = videos[0]
    return {
        "video_id": video["video_id"],
        "video_title": video["video_title"]
    }


def test_mindmap_generation(video_id):
    """测试思维导图生成"""
    print(f"\n{'='*60}")
    print(f"测试视频 ID: {video_id}")
    print(f"{'='*60}\n")

    # 发送请求（auto_generate=True 是默认值）
    print("📡 正在请求思维导图...")
    response = requests.get(f"{BASE_URL}/api/qdrant/videos/{video_id}/mindmap")

    if response.status_code != 200:
        print(f"❌ 请求失败: {response.status_code}")
        print(f"错误信息: {response.text}")
        return False

    data = response.json()

    # 显示结果
    print("✅ 思维导图获取成功!\n")
    print(f"视频 ID: {data['video_id']}")
    print(f"生成时间: {data['generated_at']}")
    print(f"版本: {data['version']}")
    print(f"自动生成: {data.get('auto_generated', False)}")
    print(f"\n思维导图内容 ({len(data['mind_map_markdown'])} 字符):")
    print("-" * 60)
    print(data['mind_map_markdown'])
    print("-" * 60)

    return True


def main():
    # 获取 video_id
    if len(sys.argv) > 1:
        video_id = sys.argv[1]
        video_title = "未知"
    else:
        print("🔍 正在获取第一个视频...")
        video_info = get_first_video()
        if not video_info:
            sys.exit(1)
        video_id = video_info["video_id"]
        video_title = video_info["video_title"]

    print(f"📹 视频标题: {video_title}")

    # 测试生成
    success = test_mindmap_generation(video_id)

    if success:
        print("\n✅ 测试成功！")
        print("\n💡 提示:")
        print("   - 如果 auto_generated=True，说明思维导图是刚刚自动生成的")
        print("   - 如果 auto_generated=False，说明使用的是已存在的思维导图")
        print("   - 可以在前端查看可视化的思维导图效果")
    else:
        print("\n❌ 测试失败")
        sys.exit(1)


if __name__ == "__main__":
    main()
