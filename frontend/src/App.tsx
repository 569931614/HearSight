import { useEffect, useRef, useState } from 'react'
import './index.css'
import { Layout, Typography, Button, Space, Tag, Modal, App as AntdApp } from 'antd'
import { CloseOutlined, LeftOutlined, MessageOutlined, SettingOutlined, LogoutOutlined } from '@ant-design/icons'
import { extractFilename, seekVideoTo } from './utils'
import { fetchTranscriptDetail, fetchAllSummaries, fetchQdrantVideos, getPublicConfig, fetchTranscriptIdByPath, fetchVideoByVideoId, fetchVideoMindMap, getCurrentUser } from './services/api'
import type { Segment, SummaryMeta, TranscriptDetailResponse } from './types'
import LeftPanel from './components/LeftPanel'
import VideoPlayer from './components/VideoPlayer'
import RightPanel from './components/RightPanel'
import ChatPanel from './components/ChatPanel'
import AdminSettings from './components/AdminSettings'
import VideoGalleryPage from './components/VideoGalleryPage'
import AdminPanel from './components/AdminPanel'
import LoginPage from './components/LoginPage'

const { Header, Footer } = Layout
const { Title } = Typography

interface ChatSession {
  id: string
  title: string
  lastUpdated: number
}

// LocalStorage keys
const STORAGE_KEY_SESSIONS = 'hearsight_chat_sessions'
const STORAGE_KEY_CURRENT_SESSION = 'hearsight_current_session'

function App() {
  const { message } = AntdApp.useApp()
  const [segments, setSegments] = useState<Array<Segment>>([])
  const [loading, setLoading] = useState(false)
  const [summaries, setSummaries] = useState<Array<SummaryMeta>>([])
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [activeSegIndex, setActiveSegIndex] = useState<number | null>(null)
  const [activeTranscriptId, setActiveTranscriptId] = useState<number | null>(null)
  const [autoScroll, setAutoScroll] = useState<boolean>(true) // 默认开启自动滚动
  const [videoSummary, setVideoSummary] = useState<string | null>(null) // 视频全文总结
  const [mindMapMarkdown, setMindMapMarkdown] = useState<string | null>(null) // 思维导图数据
  const [mindMapLoading, setMindMapLoading] = useState(false) // 思维导图加载状态
  const [mindMapError, setMindMapError] = useState<string | null>(null) // 思维导图错误信息
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null) // 当前视频ID

  // 分页状态
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(20)
  const [totalVideos, setTotalVideos] = useState<number>(0)

  // 全屏布局状态
  const [leftPanelVisible, setLeftPanelVisible] = useState(true) // 默认显示侧边栏
  const [rightPanelVisible, setRightPanelVisible] = useState(false)
  const [chatPanelVisible, setChatPanelVisible] = useState(true) // 默认显示AI对话
  const [videoModalVisible, setVideoModalVisible] = useState(false) // 视频播放器弹窗

  // 页面切换状态
  const [currentView, setCurrentView] = useState<'gallery' | 'chat' | 'admin'>('gallery') // 默认显示视频展示页

  // 会话管理状态
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined)

  // 管理员设置
  const [adminSettingsVisible, setAdminSettingsVisible] = useState(false)
  const [siteTitle, setSiteTitle] = useState('HearSight - AI 视频智能分析')

  // 认证状态
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const segScrollRef = useRef<HTMLDivElement | null>(null)
  const histScrollRef = useRef<HTMLDivElement | null>(null)
  const prevActiveRef = useRef<number | null>(null)

  // 获取摘要列表
  const loadSummaries = async (page: number = currentPage) => {
    try {
      // 使用新的 Qdrant API 获取最新视频列表（带分页）
      const data = await fetchQdrantVideos(page, pageSize)
      setSummaries(Array.isArray(data.videos) ? data.videos : [])
      if (data.pagination) {
        setTotalVideos(data.pagination.total)
        setCurrentPage(data.pagination.page)
      }
    } catch (err: any) {
      console.warn('获取热门视频列表失败:', err?.message || err)
      // 如果 Qdrant 失败，尝试回退到 PostgreSQL summaries
      try {
        const fallbackData = await fetchAllSummaries()
        setSummaries(Array.isArray(fallbackData.items) ? fallbackData.items : [])
      } catch (fallbackErr: any) {
        console.warn('获取摘要列表失败:', fallbackErr?.message || fallbackErr)
      }
    }
  }

  // 处理分页变化
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    loadSummaries(page)
  }

  // 从 localStorage 加载会话列表
  useEffect(() => {
    try {
      const storedSessions = localStorage.getItem(STORAGE_KEY_SESSIONS)
      if (storedSessions) {
        const sessions = JSON.parse(storedSessions) as ChatSession[]
        setChatSessions(sessions.sort((a, b) => b.lastUpdated - a.lastUpdated))
      }

      const storedCurrentId = localStorage.getItem(STORAGE_KEY_CURRENT_SESSION)
      if (storedCurrentId) {
        setCurrentSessionId(storedCurrentId)
      }
    } catch (error) {
      console.error('Failed to load chat sessions:', error)
    }
  }, [])

  // 保存会话列表到 localStorage
  const saveSessions = (sessions: ChatSession[]) => {
    try {
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions))
    } catch (error) {
      console.error('Failed to save chat sessions:', error)
    }
  }

  // 新建会话
  const handleNewSession = () => {
    setCurrentSessionId(undefined)
    setChatPanelVisible(true) // 确保对话面板打开
    localStorage.removeItem(STORAGE_KEY_CURRENT_SESSION)
    message.success('新建对话，开始提问吧')
  }

  // 选择会话
  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId)
    setChatPanelVisible(true) // 确保对话面板打开
    localStorage.setItem(STORAGE_KEY_CURRENT_SESSION, sessionId)
    message.success('已切换到该对话')
  }

  // 删除会话
  const handleDeleteSession = (sessionId: string) => {
    const updatedSessions = chatSessions.filter(s => s.id !== sessionId)
    setChatSessions(updatedSessions)
    saveSessions(updatedSessions)

    // 如果删除的是当前会话，清空当前会话
    if (sessionId === currentSessionId) {
      setCurrentSessionId(undefined)
      localStorage.removeItem(STORAGE_KEY_CURRENT_SESSION)
    }
  }

  // 会话变更回调（由 ChatPanel 调用）
  const handleSessionChange = (sessionId: string, title: string) => {
    setCurrentSessionId(sessionId)
    localStorage.setItem(STORAGE_KEY_CURRENT_SESSION, sessionId)

    // 更新或添加会话到列表
    const existingIndex = chatSessions.findIndex(s => s.id === sessionId)
    let updatedSessions: ChatSession[]

    if (existingIndex >= 0) {
      // 更新现有会话
      updatedSessions = [...chatSessions]
      updatedSessions[existingIndex] = {
        ...updatedSessions[existingIndex],
        lastUpdated: Date.now()
      }
    } else {
      // 添加新会话
      updatedSessions = [
        {
          id: sessionId,
          title,
          lastUpdated: Date.now()
        },
        ...chatSessions
      ]
    }

    // 按最后更新时间排序
    updatedSessions.sort((a, b) => b.lastUpdated - a.lastUpdated)
    setChatSessions(updatedSessions)
    saveSessions(updatedSessions)
  }

  // 加载转写记录详情 (支持 transcript_id 或 video_id)
  const loadTranscriptDetail = async (id: number | string): Promise<TranscriptDetailResponse | undefined> => {
    try {
      setLoading(true)

      let data: TranscriptDetailResponse

      // 判断是 transcript_id (number) 还是 video_id (string)
      if (typeof id === 'string') {
        // video_id - 从 Qdrant 加载
        data = await fetchVideoByVideoId(id)
      } else {
        // transcript_id - 从 PostgreSQL 加载
        data = await fetchTranscriptDetail(id)
      }

      // 保存视频总结（如果有）
      if (typeof id === 'string' && (data as any).video_summary) {
        setVideoSummary((data as any).video_summary)
        setCurrentVideoId(id) // 保存当前视频ID

        // 获取思维导图数据
        loadMindMapData(id)
      } else {
        setVideoSummary(null)
        setCurrentVideoId(null)
        setMindMapMarkdown(null)
        setMindMapError(null)
      }

      const basename = extractFilename(data.media_path)
      const resolvedStatic = data.static_url || (basename ? `/static/${basename}` : null)
      if (resolvedStatic) {
        setVideoSrc(resolvedStatic)
      }
      const segmentsArray = Array.isArray(data.segments) ? data.segments : []
      setSegments(segmentsArray)

      // 对于 Qdrant 视频，我们没有 transcript_id，使用 video_id 的哈希值作为标识
      const transcriptId = typeof id === 'string' ? -1 : id
      setActiveTranscriptId(transcriptId)

      // 打开视频播放器弹窗
      setVideoModalVisible(true)
      setRightPanelVisible(true)
      return data
    } catch (err: any) {
      console.error('获取转写记录详情失败:', err?.message || err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // 加载思维导图数据
  const loadMindMapData = async (videoId: string) => {
    try {
      setMindMapLoading(true)
      setMindMapError(null)

      const mindMapData = await fetchVideoMindMap(videoId)
      setMindMapMarkdown(mindMapData.mind_map_markdown)
    } catch (err: any) {
      console.error('获取思维导图失败:', err?.message || err)
      // 如果是404错误，不显示错误信息，只是不显示思维导图
      if (err?.message?.includes('404') || err?.message?.includes('暂无思维导图')) {
        setMindMapMarkdown(null)
        setMindMapError(null)
      } else {
        setMindMapError(err?.message || '加载思维导图失败')
      }
    } finally {
      setMindMapLoading(false)
    }
  }

  // 视频跳转
  const handleSeekTo = (timeMs: number) => {
    seekVideoTo(videoRef.current, timeMs)
  }

  // 当 activeTranscriptId 改变时，让历史列表滚动到该项
  useEffect(() => {
    if (activeTranscriptId == null) return
    const el = histScrollRef.current?.querySelector(`[data-transcript-id="${activeTranscriptId}"]`) as HTMLElement | null
    if (el) {
      try { 
        el.scrollIntoView({ behavior: 'smooth', block: 'center' }) 
      } catch { 
        el.scrollIntoView() 
      }
    }
  }, [activeTranscriptId])

  // 根据视频播放进度自动高亮对应分句并让其滚动到可见区域
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onTimeUpdate = () => {
      const ms = (v.currentTime || 0) * 1000
      let newIndex: number | null = null
      for (const s of segments) {
        const st = Number(s.start_time) || 0
        const et = Number(s.end_time) || 0
        if (ms >= st && ms < et) {
          newIndex = s.index
          break
        }
      }

      if (prevActiveRef.current !== newIndex) {
        prevActiveRef.current = newIndex
        setActiveSegIndex(newIndex)
        // 仅在开启自动滚动时让分句滚动到可见区域
        if (autoScroll && newIndex != null && segScrollRef.current) {
          // segScrollRef.current 现在直接指向 .segments-scroll 容器
          const scrollContainer = segScrollRef.current
          if (scrollContainer) {
            const el = scrollContainer.querySelector(`[data-seg-index="${newIndex}"]`) as HTMLElement | null
            if (el) {
              try { 
                el.scrollIntoView({ behavior: 'smooth', block: 'center' }) 
              } catch {}
            }
          } else {
            console.warn('自动滚动：未找到 .segments-scroll 容器')
          }
        }
      }
    }

    v.addEventListener('timeupdate', onTimeUpdate)
    return () => v.removeEventListener('timeupdate', onTimeUpdate)
  }, [segments, autoScroll])

  // 初始加载数据（仅一次）
  useEffect(() => {
    void loadSummaries()
  }, [])

  // 加载网站标题
  useEffect(() => {
    const loadSiteTitle = async () => {
      try {
        const result = await getPublicConfig('site_title')
        setSiteTitle(result.config_value)
        document.title = result.config_value
      } catch (error) {
        console.warn('Failed to load site title, using default')
      }
    }
    void loadSiteTitle()
  }, [])

  // 检查登录状态
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token')
      const userInfoStr = localStorage.getItem('user_info')

      if (token && userInfoStr) {
        try {
          const userInfo = JSON.parse(userInfoStr)
          // 验证 token 是否有效
          const userData = await getCurrentUser(token)
          setCurrentUser(userData)
          setIsAuthenticated(true)
        } catch (error) {
          // Token 无效，清除登录信息
          localStorage.removeItem('auth_token')
          localStorage.removeItem('user_info')
          setIsAuthenticated(false)
          setCurrentUser(null)
        }
      }
      setAuthLoading(false)
    }
    void checkAuth()
  }, [])

  // 处理登录成功
  const handleLoginSuccess = (token: string, userInfo: any) => {
    setCurrentUser(userInfo)
    setIsAuthenticated(true)
  }

  // 处理退出登录
  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_info')
    setIsAuthenticated(false)
    setCurrentUser(null)
    setCurrentView('gallery')
    message.success('已退出登录')
  }

  // 权限检查：进入管理后台时检查权限
  const handleEnterAdmin = () => {
    if (!isAuthenticated) {
      message.warning('请先登录')
      return
    }
    if (!currentUser?.is_admin) {
      message.error('需要管理员权限')
      return
    }
    setCurrentView('admin')
  }

  // 如果正在加载认证状态，显示加载中
  if (authLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px',
        color: '#999'
      }}>
        加载中...
      </div>
    )
  }

  // 如果未登录且尝试访问管理后台，显示登录页面
  if (!isAuthenticated && currentView === 'admin') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <Layout className="fullscreen-layout">
      {/* 顶部工具栏 */}
      <Header className="fullscreen-header">
        <div className="header-left">
          <Title level={3} style={{ margin: 0, color: 'white' }}>{siteTitle}</Title>
        </div>
        <div className="header-right">
          <Space>
            {currentView === 'chat' && (
              <Button
                type="primary"
                icon={<LeftOutlined />}
                onClick={() => setCurrentView('gallery')}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: 'white'
                }}
              >
                返回主页
              </Button>
            )}
            {currentView === 'admin' && (
              <Button
                type="primary"
                icon={<LeftOutlined />}
                onClick={() => setCurrentView('gallery')}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: 'white'
                }}
              >
                返回主页
              </Button>
            )}
            {currentView !== 'admin' && (
              <>
                <Button
                  type="text"
                  icon={<SettingOutlined />}
                  onClick={handleEnterAdmin}
                  style={{ color: 'white' }}
                >
                  管理后台
                </Button>
                <Button
                  type="text"
                  icon={<SettingOutlined />}
                  onClick={() => setAdminSettingsVisible(true)}
                  style={{ color: 'white' }}
                >
                  系统设置
                </Button>
              </>
            )}
            {isAuthenticated && (
              <Button
                type="text"
                icon={<LogoutOutlined />}
                onClick={handleLogout}
                style={{ color: 'white' }}
                title={`当前用户：${currentUser?.username}`}
              >
                退出登录
              </Button>
            )}
          </Space>
        </div>
      </Header>
      
      {/* 主内容区域 */}
      <div className="fullscreen-content">
        {currentView === 'admin' ? (
          /* 管理后台页面 */
          <AdminPanel onClose={() => setCurrentView('gallery')} />
        ) : currentView === 'gallery' ? (
          /* 视频展示页面 */
          <VideoGalleryPage
            onVideoClick={(videoId) => {
              loadTranscriptDetail(videoId)
            }}
            onSwitchToChat={() => setCurrentView('chat')}
          />
        ) : (
          /* 对话分析页面（原来的布局） */
          <>
            {/* 左侧面板 */}
            {leftPanelVisible && (
              <div className="fullscreen-left-panel">
                <div className="panel-header">
                  <span>对话与视频</span>
                  <Button
                    type="text"
                    icon={<CloseOutlined />}
                    onClick={() => setLeftPanelVisible(false)}
                    size="small"
                  />
                </div>
                <div className="panel-content">
                  <LeftPanel
                    summaries={summaries}
                    onLoadTranscript={loadTranscriptDetail}
                    onSummariesUpdate={loadSummaries}
                    chatSessions={chatSessions}
                    onSelectSession={handleSelectSession}
                    onNewSession={handleNewSession}
                    onDeleteSession={handleDeleteSession}
                    currentSessionId={currentSessionId}
                    currentPage={currentPage}
                    pageSize={pageSize}
                    totalVideos={totalVideos}
                    onPageChange={handlePageChange}
                  />
                </div>
              </div>
            )}

            {/* 主内容区域 - AI 对话或欢迎页面 */}
            <div className={`fullscreen-main ${leftPanelVisible ? 'with-left' : ''}`}>
              {chatPanelVisible ? (
                <ChatPanel
                  currentSessionId={currentSessionId}
                  onSessionChange={handleSessionChange}
                  onVideoSeek={async ({ videoPath, staticUrl, transcriptId, videoId, startTime }) => {
                    const startSeconds = Number(startTime ?? 0)
                    try {
                      let effectiveStatic = staticUrl || null
                      let effectiveTranscriptId = transcriptId
                      let loadedByVideoId = false

                      // 如果没有 transcript_id，尝试通过 video_path 查找
                      if (!effectiveTranscriptId && videoPath) {
                        try {
                          effectiveTranscriptId = await fetchTranscriptIdByPath(videoPath)
                        } catch (error: any) {
                          console.warn('Failed to fetch transcript_id by path:', error)
                          // 继续执行，尝试使用 videoId
                        }
                      }

                      // 如果仍然没有 transcript_id，但有 videoId，尝试通过 videoId 加载
                      if (!effectiveTranscriptId && videoId) {
                        try {
                          const data = await fetchVideoByVideoId(videoId)
                          // 直接设置 segments 和相关状态
                          setSegments(data.segments || [])
                          setActiveTranscriptId(undefined) // 没有 transcript_id
                          setVideoSummary((data as any).video_summary || null)
                          effectiveStatic = data.static_url || effectiveStatic
                          loadedByVideoId = true
                        } catch (error: any) {
                          console.warn('Failed to fetch video by videoId:', error)
                          // 继续执行，只播放视频
                        }
                      }

                      if (effectiveTranscriptId) {
                        // 有 transcript_id，加载完整的转写记录（包含所有分句和摘要）
                        if (effectiveTranscriptId !== activeTranscriptId) {
                          const data = await loadTranscriptDetail(effectiveTranscriptId)
                          effectiveStatic = data?.static_url || effectiveStatic
                        } else {
                          // 已经加载了该视频，只需要更新视频源（如果需要）
                          if (staticUrl && staticUrl !== videoSrc) {
                            setVideoSrc(staticUrl)
                          }
                          // 确保右侧面板是打开的
                          setVideoModalVisible(true)
                          setRightPanelVisible(true)
                        }

                        // 打开视频弹窗和右侧面板，跳转到指定时间
                        setVideoModalVisible(true)
                        setRightPanelVisible(true)
                        setTimeout(() => {
                          handleSeekTo(startSeconds * 1000)
                        }, 500)
                      } else if (loadedByVideoId) {
                        // 通过 videoId 加载成功，打开视频面板
                        setVideoModalVisible(true)
                        setRightPanelVisible(true)
                        if (effectiveStatic && effectiveStatic !== videoSrc) {
                          setVideoSrc(effectiveStatic)
                        }
                        setTimeout(() => {
                          handleSeekTo(startSeconds * 1000)
                        }, 500)
                      } else {
                        // 没有 transcript_id 也没有通过 videoId 加载，只播放视频（不显示分句和摘要）
                        if (!effectiveStatic && videoPath) {
                          const basename = extractFilename(videoPath)
                          if (basename) {
                            effectiveStatic = `/static/${basename}`
                          }
                        }
                        if (effectiveStatic && effectiveStatic !== videoSrc) {
                          setVideoSrc(effectiveStatic)
                        }

                        // 打开视频弹窗（不显示右侧面板，因为没有分句数据）
                        setVideoModalVisible(true)
                        setRightPanelVisible(false)  // 关闭右侧面板
                        message.info('该视频暂无字幕数据')
                        setTimeout(() => {
                          handleSeekTo(startSeconds * 1000)
                        }, 500)
                      }
                    } catch (error: any) {
                      console.error('onVideoSeek error:', error)
                      message.error(error?.message || 'Unable to open the referenced video')
                    }
                  }}
                />
              ) : (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                  flexDirection: 'column',
                  gap: '20px',
                  color: '#999'
                }}>
                  <h2>欢迎使用 HearSight</h2>
                  <p>从左侧选择视频或点击"AI 对话"开始</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      
      {/* 底部状态栏 */}
      <Footer className="fullscreen-footer">
        <div className="footer-content">
          {videoSrc && <Tag color="green">视频已加载</Tag>}
          {loading && <Tag color="blue">处理中...</Tag>}
          {segments.length > 0 && <Tag>{segments.length} 个分句</Tag>}
        </div>
      </Footer>

      {/* 视频播放器弹窗 */}
      <Modal
        title="视频播放"
        open={videoModalVisible}
        onCancel={() => setVideoModalVisible(false)}
        width="90%"
        style={{ top: 20 }}
        footer={null}
        destroyOnHidden={false}
      >
        <div style={{ display: 'flex', gap: '16px', height: '80vh' }}>
          {/* 左侧视频播放器 */}
          <div style={{ flex: 2 }}>
            <VideoPlayer
              ref={videoRef}
              videoSrc={videoSrc}
              loading={loading}
            />
          </div>

          {/* 右侧面板 */}
          {rightPanelVisible && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flex: 1, overflow: 'auto' }}>
                <RightPanel
                  ref={segScrollRef}
                  segments={segments}
                  activeSegIndex={activeSegIndex}
                  autoScroll={autoScroll}
                  videoSummary={videoSummary}
                  videoId={currentVideoId || ''}
                  mindMapMarkdown={mindMapMarkdown}
                  mindMapLoading={mindMapLoading}
                  mindMapError={mindMapError}
                  onSeekTo={handleSeekTo}
                  onActiveSegmentChange={setActiveSegIndex}
                  onAutoScrollChange={setAutoScroll}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* 管理员设置 */}
      <AdminSettings
        visible={adminSettingsVisible}
        onClose={() => setAdminSettingsVisible(false)}
      />
    </Layout>
  )
}

export default App
