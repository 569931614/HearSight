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
  UnorderedListOutlined,
  DownOutlined,
  RightOutlined
} from '@ant-design/icons'
import VideoCard from './VideoCard'
import { fetchQdrantFolders, fetchQdrantVideos } from '../services/api'
import { sortVideosNaturally } from '../utils/sorting'

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
  }, [currentPage, selectedFolderId, searchQuery])

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
      // 如果有搜索关键词，加载所有视频以支持全局搜索
      const effectivePageSize = searchQuery ? 1000 : pageSize
      const effectivePage = searchQuery ? 1 : currentPage

      const result = await fetchQdrantVideos(effectivePage, effectivePageSize, selectedFolderId)
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
    // 搜索功能已实现：通过 filteredVideos 自动过滤
  }

  // 切换文件夹展开/折叠状态
  const toggleFolderExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation() // 阻止触发父元素的 onClick
    setExpandedFolderKeys(prev => {
      if (prev.includes(folderId)) {
        return prev.filter(id => id !== folderId)
      } else {
        return [...prev, folderId]
      }
    })
  }

  // 过滤视频（根据搜索关键词）
  const filteredVideos = sortVideosNaturally(
    videos.filter(video => {
      if (!searchQuery) return true
      const title = video.video_title || video.topic || ''
      return title.toLowerCase().includes(searchQuery.toLowerCase())
    }),
    'video_title' as any
  )

  // 构建文件夹树形结构
  const buildFolderTree = (folders: any[]): any[] => {
    const folderMap = new Map<string, any>()
    const rootFolders: any[] = []

    // 第一遍：创建所有节点的映射
    folders.forEach(folder => {
      const folderId = folder.folder_id || folder.id
      folderMap.set(folderId, {
        ...folder,
        children: []
      })
    })

    // 第二遍：构建树形结构
    folders.forEach(folder => {
      const folderId = folder.folder_id || folder.id
      const parentId = folder.parent_id || folder.parent_folder_id
      const node = folderMap.get(folderId)

      if (parentId && folderMap.has(parentId)) {
        // 有父节点，添加到父节点的 children
        folderMap.get(parentId).children.push(node)
      } else {
        // 没有父节点，作为根节点
        rootFolders.push(node)
      }
    })

    return rootFolders
  }

  // 递归渲染文件夹树
  const renderFolderItem = (folder: any, level: number = 0) => {
    const folderId = folder.folder_id || folder.id
    const folderName = folder.folder_name || folder.name || '未命名'
    const videoCount = folder.video_count || 0
    const isActive = selectedFolderId === folderId
    const hasChildren = folder.children && folder.children.length > 0
    const isExpanded = expandedFolderKeys.includes(folderId)

    return (
      <React.Fragment key={folderId}>
        <div
          className={`folder-item ${isActive ? 'folder-item-active' : ''}`}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => handleFolderClick(folderId)}
        >
          {/* 展开/折叠图标（仅当有子文件夹时显示） */}
          {hasChildren ? (
            <span
              onClick={(e) => toggleFolderExpand(folderId, e)}
              style={{
                cursor: 'pointer',
                marginRight: '4px',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              {isExpanded ? <DownOutlined style={{ fontSize: '12px' }} /> : <RightOutlined style={{ fontSize: '12px' }} />}
            </span>
          ) : (
            <span style={{ width: '16px', display: 'inline-block' }} />
          )}

          <FolderOutlined />
          <span className="folder-name">{folderName}</span>
          <Badge
            count={videoCount}
            style={{ backgroundColor: isActive ? '#1890ff' : '#52c41a' }}
            overflowCount={999}
          />
        </div>

        {/* 只有展开状态时才显示子文件夹 */}
        {hasChildren && isExpanded && folder.children.map((child: any) => renderFolderItem(child, level + 1))}
      </React.Fragment>
    )
  }

  const folderTree = buildFolderTree(folders)

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
              <Spin />
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

              {/* 文件夹树形列表 */}
              {folderTree.map(folder => renderFolderItem(folder, 0))}
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
            <Spin size="large" tip="加载视频中...">
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '400px'
              }} />
            </Spin>
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
              {!searchQuery && totalVideos > pageSize && (
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
              {/* 搜索时显示结果统计 */}
              {searchQuery && filteredVideos.length > 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#666' }}>
                  找到 {filteredVideos.length} 个匹配的视频
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
