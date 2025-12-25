import React, { useState } from 'react'
import { Card, Tag, Typography } from 'antd'
import { ClockCircleOutlined, FileTextOutlined, FolderOutlined, PlayCircleOutlined } from '@ant-design/icons'

const { Text } = Typography

interface VideoCardProps {
  video: {
    video_id: string
    video_title?: string
    topic?: string
    total_segments?: number
    total_duration?: number
    folder?: string
    created_at?: string
    video_path?: string
    thumbnail_url?: string
    video_summary?: string
  }
  onClick: () => void
}

const VideoCard: React.FC<VideoCardProps> = ({ video, onClick }) => {
  const [imageError, setImageError] = useState(false)
  const displayTitle = video.video_title || video.topic || `视频 ${video.video_id.substring(0, 8)}`
  const segmentCount = video.total_segments || 0
  const duration = video.total_duration || 0

  // 截断摘要文本（最多80个字符）
  const displaySummary = video.video_summary
    ? (video.video_summary.length > 80
        ? video.video_summary.substring(0, 80) + '...'
        : video.video_summary)
    : null

  // 格式化时长 (秒 -> HH:MM:SS)
  const formatDuration = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '未知'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  // 获取缩略图URL
  // 注意：视频列表不生成签名 URL，因为签名会过期（1小时有效期）
  // 只有当 backend 返回 thumbnail_url 时才显示缩略图，否则显示占位图标
  const thumbnailUrl = video.thumbnail_url || null

  return (
    <Card
      hoverable
      className="video-card"
      onClick={onClick}
      style={{
        borderRadius: '8px',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
      styles={{
        body: {
          padding: 0,
          flex: 1,
          display: 'flex',
          flexDirection: 'column'
        }
      }}
    >
      {/* 视频缩略图区域 */}
      <div style={{
        position: 'relative',
        width: '100%',
        paddingTop: '56.25%', // 16:9 宽高比
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        overflow: 'hidden'
      }}>
        {thumbnailUrl && !imageError ? (
          <img
            src={thumbnailUrl}
            alt={displayTitle}
            onError={() => setImageError(true)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        ) : (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          }}>
            <PlayCircleOutlined style={{ fontSize: '48px', color: 'rgba(255, 255, 255, 0.8)' }} />
          </div>
        )}

        {/* 时长标签 */}
        {duration > 0 && (
          <div style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            background: 'rgba(0, 0, 0, 0.75)',
            color: 'white',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600
          }}>
            {formatDuration(duration)}
          </div>
        )}
      </div>

      {/* 视频信息区域 */}
      <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 视频标题 */}
        <div style={{
          marginBottom: '8px'
        }}>
          <Text
            strong
            title={displayTitle}
            style={{
              fontSize: '14px',
              lineHeight: '20px',
              color: '#262626',
              wordBreak: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {displayTitle}
          </Text>
        </div>

        {/* 视频摘要 */}
        {displaySummary && (
          <div style={{
            marginBottom: '8px',
            flex: 1
          }}>
            <Text
              type="secondary"
              title={video.video_summary}
              style={{
                fontSize: '12px',
                lineHeight: '18px',
                color: '#8c8c8c',
                wordBreak: 'break-word',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {displaySummary}
            </Text>
          </div>
        )}

        {/* 底部元数据 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          marginTop: 'auto'
        }}>
          {/* 文件夹标签 */}
          {video.folder && (
            <Tag
              icon={<FolderOutlined />}
              color="blue"
              style={{ margin: 0, fontSize: '11px' }}
            >
              {video.folder}
            </Tag>
          )}

          {/* 片段数 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FileTextOutlined style={{ color: '#8c8c8c', fontSize: '12px' }} />
            <Text type="secondary" style={{ fontSize: '11px' }}>
              {segmentCount}
            </Text>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default VideoCard
