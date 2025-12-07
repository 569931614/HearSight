import React, { useState, useEffect } from 'react'
import {
  Card,
  Empty,
  Tabs,
  List,
  Tag,
  Button,
  Popconfirm,
  Collapse,
  Badge,
  Pagination,
  Tooltip,
  App,
  Spin
} from 'antd'
import { DeleteOutlined, PlusOutlined, FolderOutlined, ReloadOutlined } from '@ant-design/icons'
import type { SummaryMeta } from '../types'
import { deleteChatHistory, fetchQdrantFolders, fetchQdrantVideos } from '../services/api'

// Removed deprecated Panel extraction from Collapse

interface ChatSession {
  id: string
  title: string
  lastUpdated: number
}

interface LeftPanelProps {
  summaries: SummaryMeta[]
  onLoadTranscript: (id: number | string) => void  // 支持 transcript_id (number) 或 video_id (string)
  onSummariesUpdate: () => void
  chatSessions: ChatSession[]
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  onDeleteSession: (sessionId: string) => void
  currentSessionId?: string
  // 分页相关
  currentPage?: number
  pageSize?: number
  totalVideos?: number
  onPageChange?: (page: number) => void
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  summaries,
  onLoadTranscript,
  onSummariesUpdate,
  chatSessions,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  currentSessionId,
  currentPage = 1,
  pageSize = 20,
  totalVideos = 0,
  onPageChange
}) => {
  const { message } = App.useApp()
  const [refreshing, setRefreshing] = useState(false)

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteChatHistory(sessionId)
      onDeleteSession(sessionId)
      message.success('对话已删除')
    } catch (error: any) {
      message.error(error.message || '删除失败')
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await onSummariesUpdate()
      message.success('视频列表已刷新')
    } catch (error: any) {
      message.error('刷新失败')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="fullscreen-left-panel-content">
      <Card
        size="small"
        className="left-grow-card"
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 } }}
        extra={
          <Tooltip title="刷新视频列表">
            <Button
              type="text"
              icon={<ReloadOutlined spin={refreshing} />}
              onClick={handleRefresh}
              loading={refreshing}
              size="small"
            />
          </Tooltip>
        }
      >
        <Tabs
          defaultActiveKey="folders"
          size="small"
          centered
          items={[
            {
              key: 'chatHistory',
              label: '对话历史',
              forceRender: true,
              children: (
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
              )
            },
            {
              key: 'folders',
              label: '视频分类',
              forceRender: true,
              children: (
                <div style={{ padding: 8 }}>
                  <VideoFolders onLoadTranscript={onLoadTranscript} />
                </div>
              )
            },
            {
              key: 'summaries',
              label: '所有视频',
              forceRender: true,
              children: (
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', height: '100%' }}>
                  {summaries.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无视频" />
                  ) : (
                    <>
                      <div className="hist-scroll" style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
                        <List
                          split={false}
                          size="small"
                          dataSource={summaries}
                          renderItem={(item: any, index: number) => {
                            // 处理两种数据格式：
                            // 1. PostgreSQL summaries: { transcript_id, summary_count, created_at }
                            // 2. Qdrant videos: { video_id, video_title, topic, total_segments }
                            const isQdrantVideo = 'video_id' in item
                            const displayId = isQdrantVideo ? item.video_id : item.transcript_id
                            const displayTitle = isQdrantVideo
                              ? (item.video_title || item.topic || `视频 ${item.video_id.substring(0, 8)}`)
                              : `视频 #${item.transcript_id}`
                            const displayMeta = isQdrantVideo
                              ? `${item.total_segments || 0} 个片段`
                              : `${item.summary_count} 条摘要`

                            // 计算全局索引（考虑分页）
                            const globalIndex = (currentPage - 1) * pageSize + index

                            return (
                              <List.Item className="hist-item">
                                <div className="hist-main" style={{ width: '100%' }}>
                                  <div className="hist-row">
                                    <div
                                      className="hist-title"
                                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                      onClick={() => {
                                        if (isQdrantVideo) {
                                          // 对于 Qdrant 视频，通过 video_id 加载
                                          onLoadTranscript(item.video_id)
                                        } else {
                                          // 对于 PostgreSQL summaries，通过 transcript_id 加载
                                          onLoadTranscript(item.transcript_id)
                                        }
                                      }}
                                      title={`点击查看: ${displayTitle}`}
                                    >
                                      <Tag color={globalIndex < 3 ? 'red' : 'blue'}>#{globalIndex + 1}</Tag>
                                      <span style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {displayTitle}
                                      </span>
                                    </div>
                                    <div className="hist-action-area">
                                      <Tag color="orange">{displayMeta}</Tag>
                                    </div>
                                  </div>
                                  {item.created_at && (
                                    <div className="hist-meta">
                                      {item.created_at}
                                    </div>
                                  )}
                                </div>
                              </List.Item>
                            )
                          }}
                        />
                      </div>
                      {/* 分页控件 */}
                      {totalVideos > pageSize && onPageChange && (
                        <div style={{ textAlign: 'center', paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
                          <Pagination
                            current={currentPage}
                            pageSize={pageSize}
                            total={totalVideos}
                            onChange={onPageChange}
                            showSizeChanger={false}
                            showQuickJumper
                            size="small"
                            showTotal={(total) => `共 ${total} 个视频`}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}

// VideoFolders component: Groups videos by topic/category with lazy loading
interface VideoFoldersProps {
  onLoadTranscript: (id: number | string) => void
}

const VideoFolders: React.FC<VideoFoldersProps> = ({ onLoadTranscript }) => {
  const { message } = App.useApp()
  const [folders, setFolders] = useState<any[]>([])
  const [loadingFolders, setLoadingFolders] = useState(true)
  const [loadingVideos, setLoadingVideos] = useState<Record<string, boolean>>({})
  const [folderVideos, setFolderVideos] = useState<Record<string, any[]>>({})
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])

  // Load folder list on mount
  useEffect(() => {
    loadFolders()
  }, [])

  const loadFolders = async () => {
    setLoadingFolders(true)
    try {
      const result = await fetchQdrantFolders()
      setFolders(result.folders || [])
    } catch (error: any) {
      message.error(error.message || '加载文件夹失败')
    } finally {
      setLoadingFolders(false)
    }
  }

  // Load videos when folder is expanded
  const handlePanelChange = async (keys: string | string[]) => {
    const keysArray = Array.isArray(keys) ? keys : [keys]
    setExpandedKeys(keysArray)

    // Load videos for newly expanded folders
    for (const key of keysArray) {
      if (!folderVideos[key] && !loadingVideos[key]) {
        await loadFolderVideos(key)
      }
    }
  }

  const loadFolderVideos = async (folderId: string) => {
    setLoadingVideos(prev => ({ ...prev, [folderId]: true }))
    try {
      const result = await fetchQdrantVideos(1, 100, folderId)
      setFolderVideos(prev => ({ ...prev, [folderId]: result.videos }))
    } catch (error: any) {
      message.error(error.message || '加载视频失败')
    } finally {
      setLoadingVideos(prev => ({ ...prev, [folderId]: false }))
    }
  }

  if (loadingFolders) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <Spin tip="加载文件夹..." />
      </div>
    )
  }

  if (folders.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文件夹" />
  }

  return (
    <div className="hist-scroll">
      <Collapse
        bordered={false}
        activeKey={expandedKeys}
        onChange={handlePanelChange}
        expandIconPosition="end"
        items={folders.map(folder => {
          const folderId = folder.folder_id || folder.id
          const folderName = folder.folder_name || folder.name || '未命名'
          const videoCount = folder.video_count || 0
          const videos = folderVideos[folderId] || []
          const isLoading = loadingVideos[folderId]

          return {
            key: folderId,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FolderOutlined />
                <span>{folderName}</span>
                <Badge count={videoCount} style={{ backgroundColor: '#52c41a' }} />
              </div>
            ),
            children: isLoading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin size="small" tip="加载视频..." />
              </div>
            ) : videos.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="文件夹为空" style={{ margin: '20px 0' }} />
            ) : (
              <List
                split={false}
                size="small"
                dataSource={videos}
                renderItem={(item: any) => {
                  const isQdrantVideo = 'video_id' in item
                  const displayTitle = isQdrantVideo
                    ? (item.video_title || `视频 ${item.video_id.substring(0, 8)}`)
                    : `视频 #${item.transcript_id}`
                  const displayMeta = isQdrantVideo
                    ? `${item.total_segments || 0} 个片段`
                    : `${item.summary_count} 条摘要`

                  return (
                    <List.Item
                      className="hist-item"
                      style={{ paddingLeft: 16 }}
                    >
                      <div className="hist-main" style={{ width: '100%' }}>
                        <div
                          className="hist-title"
                          style={{ cursor: 'pointer', marginBottom: 4 }}
                          onClick={() => {
                            if (isQdrantVideo) {
                              onLoadTranscript(item.video_id)
                            } else {
                              onLoadTranscript(item.transcript_id)
                            }
                          }}
                          title={`点击查看: ${displayTitle}`}
                        >
                          {displayTitle}
                        </div>
                        <div style={{ fontSize: 11, color: '#999' }}>
                          {displayMeta}
                          {item.created_at && ` · ${item.created_at}`}
                        </div>
                      </div>
                    </List.Item>
                  )
                }}
              />
            )
          }
        })}
      />
    </div>
  )
}

export default LeftPanel