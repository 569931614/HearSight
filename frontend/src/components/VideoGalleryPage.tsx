import React, { useState, useEffect } from 'react'
import {
  Empty,
  Spin,
  Badge,
  Button,
  Pagination,
  Input,
  App,
  Radio,
  Space,
  Tag,
  Drawer,
  Popover
} from 'antd'
import {
  FolderOutlined,
  MessageOutlined,
  SearchOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  DownOutlined,
  RightOutlined,
  HistoryOutlined,
  ClockCircleOutlined,
  FireOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons'
import VideoCard from './VideoCard'
import { fetchQdrantFolders, fetchQdrantVideos, getUserVideoHistory } from '../services/api'
import { sortVideosNaturally } from '../utils/sorting'

const { Search } = Input

interface VideoGalleryPageProps {
  onVideoClick: (videoId: string) => void
  onSwitchToChat: () => void
  historyPanelVisible?: boolean
  onHistoryPanelClose?: () => void
}

const VideoGalleryPage: React.FC<VideoGalleryPageProps> = ({
  onVideoClick,
  onSwitchToChat,
  historyPanelVisible = false,
  onHistoryPanelClose
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
  const [searchInputValue, setSearchInputValue] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // 浏览历史
  const [historyVideos, setHistoryVideos] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  // 热门词条
  const HOT_TAGS_MAIN = ['解剖', '病理', '妇产', '医学考研', '医学真题']
  const HOT_TAGS_MORE = ['内科', '外科', '儿科', '神经', '影像', '心血管', '肿瘤', '骨科', '急救', '护理']

  // 侧边栏折叠
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // 检查登录状态
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    setIsLoggedIn(!!token)
  }, [])

  // 加载文件夹列表
  useEffect(() => {
    loadFolders()
  }, [])

  // 历史面板打开时加载数据
  useEffect(() => {
    if (historyPanelVisible && isLoggedIn) {
      loadHistory()
    }
  }, [historyPanelVisible, isLoggedIn])

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

  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const result = await getUserVideoHistory(50)
      // 获取每个视频的详细信息
      const videoIds = result.videos.map(v => v.video_id)
      // 从所有视频中查找匹配的
      const allVideosResult = await fetchQdrantVideos(1, 1000)
      const videoMap = new Map(allVideosResult.videos.map(v => [v.video_id, v]))

      const historyWithDetails = result.videos.map(h => ({
        ...h,
        ...videoMap.get(h.video_id),
        last_viewed: h.last_viewed
      })).filter(v => v.video_title || v.topic) // 过滤掉找不到详情的

      setHistoryVideos(historyWithDetails)
    } catch (error: any) {
      // 未登录时不显示错误
      if (error.message !== '未登录') {
        console.warn('加载浏览历史失败:', error.message)
      }
      setHistoryVideos([])
    } finally {
      setLoadingHistory(false)
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
    setSearchInputValue(value)
  }

  const handleHotTagClick = (tag: string) => {
    const newVal = searchQuery === tag ? '' : tag
    setSearchQuery(newVal)
    setSearchInputValue(newVal)
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
      <div className={`video-gallery-sidebar ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {!sidebarCollapsed && (
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
        )}

        {/* 底部收起/展开按钮 */}
        <div
          className="sidebar-collapse-btn"
          onClick={() => setSidebarCollapsed(v => !v)}
        >
          {sidebarCollapsed
            ? <MenuUnfoldOutlined style={{ marginRight: 6 }} />
            : <MenuFoldOutlined style={{ marginRight: 6 }} />
          }
          {!sidebarCollapsed && <span>收起菜单</span>}
        </div>
      </div>

      {/* 历史记录抽屉 */}
      <Drawer
        title={
          <span>
            <HistoryOutlined style={{ marginRight: 8, color: '#764ba2' }} />
            浏览历史
          </span>
        }
        placement="left"
        width={320}
        open={historyPanelVisible}
        onClose={onHistoryPanelClose}
        styles={{ body: { padding: 0 } }}
      >
        {!isLoggedIn ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
            <HistoryOutlined style={{ fontSize: '40px', marginBottom: '16px', display: 'block', color: '#d9d9d9' }} />
            <p style={{ margin: 0 }}>登录后可查看浏览历史</p>
          </div>
        ) : loadingHistory ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <Spin />
          </div>
        ) : historyVideos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
            <ClockCircleOutlined style={{ fontSize: '40px', marginBottom: '16px', display: 'block', color: '#d9d9d9' }} />
            <p style={{ margin: 0 }}>暂无浏览记录</p>
          </div>
        ) : (
          <div className="history-list">
            {historyVideos.map(video => (
              <div
                key={video.video_id}
                className="history-item"
                onClick={() => { onVideoClick(video.video_id); onHistoryPanelClose?.() }}
              >
                <div className="history-title">
                  {video.video_title || video.topic || '未命名视频'}
                </div>
                <div className="history-time">
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  {video.last_viewed ? new Date(video.last_viewed).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : ''}
                  {video.view_count > 1 && ` · 观看${video.view_count}次`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      {/* 右侧主内容区域 */}
      <div className="video-gallery-main">
        {/* 顶部区域：搜索栏 + 热门词条 + 视频网格 一体化容器 */}
        <div className="gallery-unified-area">
          {/* 工具栏行 */}
          <div className="gallery-toolbar">
            <div className="toolbar-left">
              <Search
                placeholder="搜索视频标题..."
                allowClear
                value={searchInputValue}
                onChange={(e) => {
                  setSearchInputValue(e.target.value)
                  if (!e.target.value) setSearchQuery('')
                }}
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

          {/* 热门词条行 */}
          <div className="hot-tags-bar">
            <FireOutlined className="hot-tags-icon" />
            <span className="hot-tags-label">热门词条：</span>
            {HOT_TAGS_MAIN.map(tag => (
              <Tag
                key={tag}
                className={`hot-tag ${searchQuery === tag ? 'hot-tag-active' : ''}`}
                onClick={() => handleHotTagClick(tag)}
              >
                {tag}
              </Tag>
            ))}
            <Popover
              trigger="click"
              placement="bottomLeft"
              content={
                <div className="hot-tags-more-popover">
                  {HOT_TAGS_MORE.map(tag => (
                    <Tag
                      key={tag}
                      className={`hot-tag ${searchQuery === tag ? 'hot-tag-active' : ''}`}
                      onClick={() => handleHotTagClick(tag)}
                      style={{ marginBottom: 6 }}
                    >
                      {tag}
                    </Tag>
                  ))}
                </div>
              }
              title={<span style={{ fontSize: 13, color: '#595959' }}>更多词条</span>}
            >
              <a className="hot-tags-more">更多 ▾</a>
            </Popover>
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
        </div>{/* /gallery-unified-area */}
      </div>
    </div>
  )
}

export default VideoGalleryPage
