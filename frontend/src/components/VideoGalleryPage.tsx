import React, { useState, useEffect } from 'react'
import {
  Empty,
  Spin,
  Collapse,
  Badge,
  Button,
  Pagination,
  Input,
  App,
  Radio,
  Space
} from 'antd'
import {
  FolderOutlined,
  MessageOutlined,
  SearchOutlined,
  AppstoreOutlined,
  UnorderedListOutlined
} from '@ant-design/icons'
import VideoCard from './VideoCard'
import { fetchQdrantFolders, fetchQdrantVideos } from '../services/api'

const { Search } = Input

interface VideoGalleryPageProps {
  onVideoClick: (videoId: string) => void
  onSwitchToChat: () => void
}

const VideoGalleryPage: React.FC<VideoGalleryPageProps> = ({
  onVideoClick,
  onSwitchToChat
}) => {
  const { message } = App.useApp()

  // 文件夹数据
  const [folders, setFolders] = useState<any[]>([])
  const [loadingFolders, setLoadingFolders] = useState(true)
  const [expandedFolderKeys, setExpandedFolderKeys] = useState<string[]>([])

  // 视频数据
  const [videos, setVideos] = useState<any[]>([])
  const [loadingVideos, setLoadingVideos] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(24)
  const [totalVideos, setTotalVideos] = useState(0)

  // 筛选状态
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // 加载文件夹列表
  useEffect(() => {
    loadFolders()
  }, [])

  // 加载视频列表（初始加载或筛选变化时）
  useEffect(() => {
    loadVideos()
  }, [currentPage, selectedFolderId])

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

  const loadVideos = async () => {
    setLoadingVideos(true)
    try {
      const result = await fetchQdrantVideos(currentPage, pageSize, selectedFolderId)
      setVideos(result.videos || [])
      setTotalVideos(result.pagination?.total || 0)
    } catch (error: any) {
      message.error(error.message || '加载视频失败')
    } finally {
      setLoadingVideos(false)
    }
  }

  const handleFolderClick = (folderId: string | undefined) => {
    setSelectedFolderId(folderId)
    setCurrentPage(1)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    // TODO: 实现搜索功能
    message.info('搜索功能开发中...')
  }

  // 过滤视频（根据搜索关键词）
  const filteredVideos = videos.filter(video => {
    if (!searchQuery) return true
    const title = video.video_title || video.topic || ''
    return title.toLowerCase().includes(searchQuery.toLowerCase())
  })

  return (
    <div className="video-gallery-page">
      {/* 左侧文件夹面板 */}
      <div className="video-gallery-sidebar">
        <div className="sidebar-header">
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>视频分类</h3>
        </div>
        <div className="sidebar-content">
          {loadingFolders ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spin tip="加载中..." />
            </div>
          ) : (
            <div className="folder-list">
              {/* 全部视频选项 */}
              <div
                className={`folder-item ${!selectedFolderId ? 'folder-item-active' : ''}`}
                onClick={() => handleFolderClick(undefined)}
              >
                <FolderOutlined />
                <span className="folder-name">全部视频</span>
                <Badge
                  count={totalVideos}
                  style={{ backgroundColor: '#52c41a' }}
                  overflowCount={999}
                />
              </div>

              {/* 文件夹列表 */}
              {folders.map(folder => {
                const folderId = folder.folder_id || folder.id
                const folderName = folder.folder_name || folder.name || '未命名'
                const videoCount = folder.video_count || 0
                const isActive = selectedFolderId === folderId

                return (
                  <div
                    key={folderId}
                    className={`folder-item ${isActive ? 'folder-item-active' : ''}`}
                    onClick={() => handleFolderClick(folderId)}
                  >
                    <FolderOutlined />
                    <span className="folder-name">{folderName}</span>
                    <Badge
                      count={videoCount}
                      style={{ backgroundColor: isActive ? '#1890ff' : '#52c41a' }}
                      overflowCount={999}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 右侧主内容区域 */}
      <div className="video-gallery-main">
        {/* 顶部工具栏 */}
        <div className="gallery-toolbar">
          <div className="toolbar-left">
            <Search
              placeholder="搜索视频标题..."
              allowClear
              enterButton={<SearchOutlined />}
              onSearch={handleSearch}
              style={{ width: 300 }}
            />
          </div>
          <div className="toolbar-right">
            <Space>
              <Radio.Group
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
                buttonStyle="solid"
                size="middle"
              >
                <Radio.Button value="grid">
                  <AppstoreOutlined /> 网格
                </Radio.Button>
                <Radio.Button value="list">
                  <UnorderedListOutlined /> 列表
                </Radio.Button>
              </Radio.Group>
              <Button
                type="primary"
                icon={<MessageOutlined />}
                onClick={onSwitchToChat}
                size="large"
                style={{
                  height: '40px',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
                }}
              >
                AI 问答
              </Button>
            </Space>
          </div>
        </div>

        {/* 视频内容区域 */}
        <div className="gallery-content">
          {loadingVideos ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '400px'
            }}>
              <Spin size="large" tip="加载视频中..." />
            </div>
          ) : filteredVideos.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无视频"
              style={{ marginTop: '100px' }}
            />
          ) : (
            <>
              {/* 视频网格 */}
              <div className={viewMode === 'grid' ? 'video-grid' : 'video-list'}>
                {filteredVideos.map(video => (
                  <VideoCard
                    key={video.video_id}
                    video={video}
                    onClick={() => onVideoClick(video.video_id)}
                  />
                ))}
              </div>

              {/* 分页 */}
              {totalVideos > pageSize && (
                <div className="gallery-pagination">
                  <Pagination
                    current={currentPage}
                    pageSize={pageSize}
                    total={totalVideos}
                    onChange={handlePageChange}
                    showSizeChanger={false}
                    showQuickJumper
                    showTotal={(total) => `共 ${total} 个视频`}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default VideoGalleryPage
