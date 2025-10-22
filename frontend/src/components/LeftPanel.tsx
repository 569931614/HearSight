import React from 'react'
import {
  Card,
  Empty,
  Tabs,
  List,
  Tag,
} from 'antd'
import type { SummaryMeta } from '../types'

interface LeftPanelProps {
  summaries: SummaryMeta[]
  onLoadTranscript: (id: number) => void
  onSummariesUpdate: () => void
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  summaries,
  onLoadTranscript,
  onSummariesUpdate,
}) => {

  return (
    <div className="fullscreen-left-panel-content">
      <Card 
        size="small" 
        className="left-grow-card" 
        bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <Tabs defaultActiveKey="chatHistory" size="small" centered>
          <Tabs.TabPane tab="对话历史" key="chatHistory" forceRender>
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <p>暂无对话历史</p>
                    <p style={{ fontSize: 12, color: '#999' }}>在 AI 对话中提问后，对话记录会显示在这里</p>
                  </div>
                }
              />
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane tab="热门视频" key="summaries" forceRender>
            <div style={{ padding: 8 }}>
              {summaries.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无热门视频" />
              ) : (
                <div className="hist-scroll">
                  <List
                    split={false}
                    size="small"
                    dataSource={summaries}
                    renderItem={(item: SummaryMeta, index: number) => {
                      return (
                        <List.Item className="hist-item">
                          <div className="hist-main" style={{ width: '100%' }}>
                            <div className="hist-row">
                              <div
                                className="hist-title"
                                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                onClick={() => onLoadTranscript(item.transcript_id)}
                                title={`点击查看视频 #${item.transcript_id}`}
                              >
                                <Tag color={index < 3 ? 'red' : 'blue'}>#{index + 1}</Tag>
                                <span>视频 #{item.transcript_id}</span>
                              </div>
                              <div className="hist-action-area">
                                <Tag color="orange">{item.summary_count} 条摘要</Tag>
                              </div>
                            </div>
                            <div className="hist-meta">
                              {item.created_at}
                            </div>
                          </div>
                        </List.Item>
                      )
                    }}
                  />
                </div>
              )}
            </div>
          </Tabs.TabPane>
        </Tabs>
      </Card>
    </div>
  )
}

export default LeftPanel