import React, { forwardRef, useState, useEffect } from 'react'
import { Card, Tag, Empty, Select } from 'antd'

interface VideoPlayerProps {
  videoSrc: string | null
  loading: boolean
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const STORAGE_KEY_PLAYBACK_SPEED = 'hearsight_playback_speed'

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({ videoSrc, loading }, ref) => {
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1)

  // Load saved playback speed from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PLAYBACK_SPEED)
      if (saved) {
        const speed = parseFloat(saved)
        if (PLAYBACK_SPEEDS.includes(speed)) {
          setPlaybackSpeed(speed)
        }
      }
    } catch (error) {
      console.warn('Failed to load playback speed:', error)
    }
  }, [])

  // Apply playback speed to video element
  useEffect(() => {
    if (ref && typeof ref !== 'function' && ref.current) {
      ref.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed, ref, videoSrc])

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed)
    try {
      localStorage.setItem(STORAGE_KEY_PLAYBACK_SPEED, speed.toString())
    } catch (error) {
      console.warn('Failed to save playback speed:', error)
    }
    if (ref && typeof ref !== 'function' && ref.current) {
      ref.current.playbackRate = speed
    }
  }

  return (
    <Card
      title="视频播放器"
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {videoSrc && (
            <>
              <span style={{ fontSize: 14, color: '#666' }}>播放速度:</span>
              <Select
                size="small"
                value={playbackSpeed}
                onChange={handleSpeedChange}
                style={{ width: 80 }}
                options={PLAYBACK_SPEEDS.map(speed => ({
                  value: speed,
                  label: `${speed}x`
                }))}
              />
            </>
          )}
          {videoSrc && <Tag color="green">可播放</Tag>}
        </div>
      }
      className="fullscreen-video-card"
    >
      {videoSrc ? (
        <div className="video-container">
          <video
            ref={ref}
            src={videoSrc}
            controls
            autoPlay
            className="fullscreen-video"
            preload="metadata"
          />
        </div>
      ) : (
        <div className="video-placeholder">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无视频" />
        </div>
      )}
      {loading && (
        <div className="loading-overlay">
          处理中，请稍候…（首次识别会较慢）
        </div>
      )}
    </Card>
  )
})

VideoPlayer.displayName = 'VideoPlayer'

export default VideoPlayer
