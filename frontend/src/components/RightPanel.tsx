import React, { forwardRef, type ForwardedRef } from 'react'
import {
  Card,
  Tabs,
  Button,
  Space,
  Empty,
  List,
} from 'antd'
import {
  UpOutlined,
  DownOutlined,
  SyncOutlined,
  PlayCircleOutlined
} from '@ant-design/icons'
import type { Segment } from '../types'
import { formatTime } from '../utils'
import MarkdownRenderer from './MarkdownRenderer'

interface RightPanelProps {
  segments: Segment[]
  activeSegIndex: number | null
  autoScroll: boolean
  videoSummary?: string | null
  onSeekTo: (timeMs: number) => void
  onActiveSegmentChange: (index: number) => void
  onAutoScrollChange: (enabled: boolean) => void
}

const RightPanel = forwardRef<HTMLDivElement, RightPanelProps>(
  ({
    segments,
    activeSegIndex,
    autoScroll,
    videoSummary = null,
    onSeekTo,
    onActiveSegmentChange,
    onAutoScrollChange
  }, ref: ForwardedRef<HTMLDivElement>) => {

    const handleSegmentClick = (segment: Segment) => {
      onActiveSegmentChange(segment.index)
      onSeekTo(segment.start_time)
    }

    const scrollUp = () => {
      if (!ref || typeof ref === 'function') return
      // ref 现在直接指向 segments-scroll 容器
      const scrollContainer = ref.current
      if (scrollContainer) {
        scrollContainer.scrollBy({ top: -160, left: 0, behavior: 'smooth' })
      }
    }

    const scrollDown = () => {
      if (!ref || typeof ref === 'function') return
      // ref 现在直接指向 segments-scroll 容器
      const scrollContainer = ref.current
      if (scrollContainer) {
        scrollContainer.scrollBy({ top: 160, left: 0, behavior: 'smooth' })
      }
    }

    const centerActiveSegment = () => {
      if (!ref || typeof ref === 'function' || activeSegIndex == null) return
      // ref 现在直接指向 segments-scroll 容器
      const scrollContainer = ref.current
      if (scrollContainer) {
        const el = scrollContainer.querySelector(`[data-seg-index="${activeSegIndex}"]`) as HTMLElement | null
        if (el) {
          try { 
            el.scrollIntoView({ behavior: 'smooth', block: 'center' }) 
          } catch {
            // fallback for older browsers
          }
        }
      }
    }

    return (
      <div className="fullscreen-right-panel-content">
        <Card 
          size="small" 
          className="right-grow-card" 
          bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <Tabs
            size="small"
            defaultActiveKey="segments"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            tabBarStyle={{ position: 'relative', zIndex: 60 }}
            onChange={(_key) => {
              // ensure tab content gets a chance to layout; useful when TabPane was lazily rendered
              setTimeout(() => {
                try {
                  if (ref && typeof ref !== 'function' && ref.current) {
                    // ref 现在直接指向 segments-scroll 容器
                    const segmentsScroll = ref.current
                    if (segmentsScroll) {
                      segmentsScroll.scrollTop = segmentsScroll.scrollTop
                    }
                  }
                } catch {}
              }, 30)
            }}
          >
              <Tabs.TabPane tab="分句（点击跳转）" key="segments" forceRender>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Button size="small" icon={<UpOutlined />} onClick={scrollUp} />
                    <Button size="small" icon={<DownOutlined />} onClick={scrollDown} />
                    <Button size="small" icon={<SyncOutlined />} onClick={centerActiveSegment}>
                      定位
                    </Button>
                    <div style={{ flex: 1 }} />
                    <Space>
                      <span style={{ color: '#8c8c8c', fontSize: 12 }}>自动滚动</span>
                      <Button 
                        size="small" 
                        type={autoScroll ? 'primary' : 'default'} 
                        onClick={() => onAutoScrollChange(!autoScroll)}
                      >
                        {autoScroll ? '开' : '关'}
                      </Button>
                    </Space>
                  </div>
                  <div className="segments-scroll" ref={ref}>
                    {segments.length === 0 ? (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分句" />
                    ) : (
                      <List
                        split={false}
                        dataSource={segments}
                        renderItem={(segment: Segment) => {
                          const isActive = activeSegIndex === segment.index
                          return (
                            <List.Item 
                              className="segment-item" 
                              style={{ paddingLeft: 0, paddingRight: 0 }} 
                              data-seg-index={segment.index}
                            >
                              <div
                                role="button"
                                tabIndex={0}
                                className={`segment-btn is-div ${isActive ? 'active' : ''}`}
                                onClick={() => handleSegmentClick(segment)}
                                title={`跳转到 ${formatTime(segment.start_time, 'ms')} (${Number(segment.start_time) || 0} ms)`}
                              >
                                <span className="segment-icon">
                                  <PlayCircleOutlined />
                                </span>
                                <div className="seg-card">
                                  <div className="seg-head">
                                    <span className="seg-time">
                                      {formatTime(segment.start_time, 'ms')}
                                      <span className="segment-time-sep">~</span>
                                      {formatTime(segment.end_time, 'ms')}
                                    </span>
                                    {segment.spk_id && (
                                      <span className="seg-spk">SPK {segment.spk_id}</span>
                                    )}
                                  </div>
                                  <div className="seg-body">{segment.sentence || '(空)'}</div>
                                </div>
                              </div>
                            </List.Item>
                          )
                        }}
                      />
                    )}
                  </div>
                </div>
              </Tabs.TabPane>
              <Tabs.TabPane tab="总结" key="summaries" forceRender>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflow: 'auto' }}>
                  <div style={{ padding: 12, background: '#fafafa', borderRadius: 4 }}>
                    {(() => {
                      // 优先使用 videoSummary（来自 Qdrant 视频的全文总结）
                      if (videoSummary && videoSummary.trim()) {
                        return (
                          <div>
                            <h3 style={{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}>视频全文总结</h3>
                            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                              <MarkdownRenderer>{videoSummary}</MarkdownRenderer>
                            </div>
                          </div>
                        )
                      }

                      // 如果没有全文总结，显示提示信息
                      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无全文总结数据" />
                    })()}
                  </div>
                </div>
              </Tabs.TabPane>
          </Tabs>
        </Card>
      </div>
    )
  }
)

RightPanel.displayName = 'RightPanel'

export default RightPanel