import { useEffect, useRef, useState } from 'react'
import './index.css'
import { Layout, Typography, Button, Space, Tag, Modal } from 'antd'
import { CloseOutlined, LeftOutlined, MessageOutlined } from '@ant-design/icons'
import { extractFilename, seekVideoTo } from './utils'
import { fetchTranscriptDetail, fetchSummariesByTranscript, fetchAllSummaries } from './services/api'
import type { Segment, SummaryMeta } from './types'
import LeftPanel from './components/LeftPanel'
import VideoPlayer from './components/VideoPlayer'
import RightPanel from './components/RightPanel'
import ChatPanel from './components/ChatPanel'

const { Header, Footer } = Layout
const { Title } = Typography

function App() {
  const [segments, setSegments] = useState<Array<Segment>>([])
  const [loading, setLoading] = useState(false)
  const [summaries, setSummaries] = useState<Array<SummaryMeta>>([])
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [activeSegIndex, setActiveSegIndex] = useState<number | null>(null)
  const [activeTranscriptId, setActiveTranscriptId] = useState<number | null>(null)
  const [autoScroll, setAutoScroll] = useState<boolean>(true) // 默认开启自动滚动
  const [savedSummaries, setSavedSummaries] = useState<Array<any>>([]) // 保存的摘要

  // 全屏布局状态
  const [leftPanelVisible, setLeftPanelVisible] = useState(true) // 默认显示侧边栏
  const [rightPanelVisible, setRightPanelVisible] = useState(false)
  const [chatPanelVisible, setChatPanelVisible] = useState(true) // 默认显示AI对话
  const [videoModalVisible, setVideoModalVisible] = useState(false) // 视频播放器弹窗
  
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const segScrollRef = useRef<HTMLDivElement | null>(null)
  const histScrollRef = useRef<HTMLDivElement | null>(null)
  const prevActiveRef = useRef<number | null>(null)

  // 获取摘要列表
  const loadSummaries = async () => {
    try {
      const data = await fetchAllSummaries()
      setSummaries(Array.isArray(data.items) ? data.items : [])
    } catch (err: any) {
      console.warn('获取摘要列表失败:', err?.message || err)
    }
  }

  // 加载转写记录详情
  const loadTranscriptDetail = async (id: number) => {
    try {
      setLoading(true)
      const data = await fetchTranscriptDetail(id)
      const basename = extractFilename(data.media_path)
      if (basename) {
        setVideoSrc(`/static/${basename}`)
      }
      setSegments(Array.isArray(data.segments) ? data.segments : [])
      setActiveTranscriptId(id)

      // 从专门的摘要 API 获取摘要数据
      try {
        const summaryData = await fetchSummariesByTranscript(id)
        setSavedSummaries(summaryData.summaries || [])
      } catch (err: any) {
        console.warn('获取摘要失败:', err?.message || err)
        setSavedSummaries([])
      }

      // 打开视频播放器弹窗
      setVideoModalVisible(true)
      setRightPanelVisible(true)
    } catch (err: any) {
      console.error('获取转写记录详情失败:', err?.message || err)
    } finally {
      setLoading(false)
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

  // 定期获取数据
  useEffect(() => {
    void loadSummaries()
    const timer = setInterval(() => { void loadSummaries() }, 10000)
    return () => clearInterval(timer)
  }, [])

  return (
    <Layout className="fullscreen-layout">
      {/* 顶部工具栏 */}
      <Header className="fullscreen-header">
        <div className="header-left">
          <Title level={3} style={{ margin: 0, color: 'white' }}>HearSight - AI 视频智能分析</Title>
        </div>

        <div className="header-right">
          <Space>
            <Button
              type={leftPanelVisible ? 'primary' : 'default'}
              icon={<LeftOutlined />}
              onClick={() => setLeftPanelVisible(!leftPanelVisible)}
            >
              侧边栏
            </Button>
            <Button
              type={chatPanelVisible ? 'primary' : 'default'}
              icon={<MessageOutlined />}
              onClick={() => setChatPanelVisible(!chatPanelVisible)}
            >
              AI 对话
            </Button>
          </Space>
        </div>
      </Header>
      
      {/* 主内容区域 */}
      <div className="fullscreen-content">
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
              />
            </div>
          </div>
        )}
        
        {/* 主内容区域 - AI 对话或欢迎页面 */}
        <div className={`fullscreen-main ${leftPanelVisible ? 'with-left' : ''}`}>
          {chatPanelVisible ? (
            <ChatPanel
              onVideoSeek={(videoPath, startTime) => {
                // 打开视频弹窗并跳转到指定时间
                // TODO: 根据 videoPath 加载对应视频
                setVideoModalVisible(true)
                setRightPanelVisible(true)
                // 延迟执行跳转，确保视频加载完成
                setTimeout(() => {
                  handleSeekTo(startTime * 1000)
                }, 500)
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
      </div>
      
      {/* 底部状态栏 */}
      <Footer className="fullscreen-footer">
        <div className="footer-content">
          <span>HearSight</span>
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
        destroyOnClose={false}
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

          {/* 右侧分句与总结 */}
          {rightPanelVisible && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{
                padding: '8px 12px',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: 500 }}>分句与总结</span>
                <Button
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={() => setRightPanelVisible(false)}
                  size="small"
                />
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                <RightPanel
                  ref={segScrollRef}
                  segments={segments}
                  activeSegIndex={activeSegIndex}
                  autoScroll={autoScroll}
                  savedSummaries={savedSummaries}
                  onSeekTo={handleSeekTo}
                  onActiveSegmentChange={setActiveSegIndex}
                  onAutoScrollChange={setAutoScroll}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </Layout>
  )
}

export default App
