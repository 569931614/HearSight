import React, { useState, useEffect } from 'react'
import {
  Card,
  Empty,
  Tabs,
  List,
  Tag,
  Button,
  Popconfirm,
  App
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { SummaryMeta } from '../types'
import { deleteChatHistory } from '../services/api'

interface ChatSession {
  id: string
  title: string
  lastUpdated: number
}

interface LeftPanelProps {
  summaries: SummaryMeta[]
  onLoadTranscript: (id: number) => void
  onSummariesUpdate: () => void
  chatSessions: ChatSession[]
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  onDeleteSession: (sessionId: string) => void
  currentSessionId?: string
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  summaries,
  onLoadTranscript,
  onSummariesUpdate,
  chatSessions,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  currentSessionId
}) => {
  const { message } = App.useApp()

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteChatHistory(sessionId)
      onDeleteSession(sessionId)
      message.success('对话已删除')
    } catch (error: any) {
      message.error(error.message || '删除失败')
    }
  }

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
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={onNewSession}
                style={{
                  marginBottom: 12,
                  height: 40,
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
                }}
                block
              >
                新建对话
              </Button>

              {chatSessions.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <div>
                      <p>暂无对话历史</p>
                      <p style={{ fontSize: 12, color: '#999' }}>点击"新建对话"开始提问</p>
                    </div>
                  }
                />
              ) : (
                <div className="hist-scroll" style={{ flex: 1, overflowY: 'auto' }}>
                  <List
                    split={false}
                    size="small"
                    dataSource={chatSessions}
                    renderItem={(session: ChatSession) => {
                      const isActive = session.id === currentSessionId
                      return (
                        <List.Item
                          className={`hist-item ${isActive ? 'hist-item-selected' : ''}`}
                        >
                          <div
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '12px'
                            }}
                          >
                            <div
                              style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                              onClick={() => onSelectSession(session.id)}
                            >
                              <div className="hist-title" title={session.title}>
                                {session.title}
                              </div>
                              <div className="hist-meta" style={{ fontSize: 11, color: '#999' }}>
                                {new Date(session.lastUpdated).toLocaleString()}
                              </div>
                            </div>
                            <Popconfirm
                              title="确定删除此对话吗？"
                              onConfirm={(e) => {
                                e?.stopPropagation()
                                handleDeleteSession(session.id)
                              }}
                              okText="删除"
                              cancelText="取消"
                            >
                              <Button
                                type="text"
                                danger
                                size="middle"
                                icon={<DeleteOutlined style={{ fontSize: 16 }} />}
                                className="hist-delete-btn"
                                onClick={(e) => e.stopPropagation()}
                                style={{ flexShrink: 0, width: 32, height: 32 }}
                              />
                            </Popconfirm>
                          </div>
                        </List.Item>
                      )
                    }}
                  />
                </div>
              )}
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