import { useState, useRef, useEffect } from 'react'
import { Input, Button, List, Tag, Spin, Empty, Tooltip, App } from 'antd'
import { SendOutlined, MessageOutlined, FileTextOutlined, ClockCircleOutlined, CopyOutlined, RedoOutlined } from '@ant-design/icons'
import { chatWithKnowledge, getChatHistory } from '../services/api'
import MarkdownRenderer from './MarkdownRenderer'
import './ChatPanel.css'

interface Message {
  id: number
  type: 'user' | 'assistant'
  content: string
  references?: any[]
  timestamp: Date
}

interface VideoReference {
  videoPath?: string
  staticUrl?: string
  transcriptId?: number
  startTime: number
  endTime?: number
}

interface ChatPanelProps {
  onVideoSeek?: (reference: VideoReference) => void
  currentSessionId?: string
  onSessionChange?: (sessionId: string, title: string) => void
  onLoadHistory?: (messages: Message[]) => void
}

export default function ChatPanel({
  onVideoSeek,
  currentSessionId,
  onSessionChange,
  onLoadHistory
}: ChatPanelProps) {
  const { message } = App.useApp()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>(currentSessionId)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 当 currentSessionId 改变时，加载该会话的历史消息或清空消息
  useEffect(() => {
    console.log('ChatPanel useEffect triggered:', { currentSessionId, sessionId, messagesCount: messages.length })

    // 有 currentSessionId 且与当前 sessionId 不同，或者 sessionId 相同但消息为空（页面刷新场景）
    if (currentSessionId) {
      if (currentSessionId !== sessionId) {
        console.log('Loading session history for new session:', currentSessionId)
        setSessionId(currentSessionId)
        loadSessionHistory(currentSessionId)
      } else if (messages.length === 0) {
        // 页面刷新后，sessionId 已经设置但消息为空，需要重新加载
        console.log('Reloading session history after refresh:', currentSessionId)
        loadSessionHistory(currentSessionId)
      }
    } else if (!currentSessionId && sessionId !== undefined) {
      // 新建对话时，清空消息和会话ID
      console.log('Clearing session')
      setSessionId(undefined)
      setMessages([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId])

  // 加载会话历史
  const loadSessionHistory = async (sid: string) => {
    console.log('loadSessionHistory called with sid:', sid)
    try {
      setLoading(true)
      console.log('Calling getChatHistory API...')
      const data = await getChatHistory(sid, 50)
      console.log('getChatHistory response:', data)

      const loadedMessages: Message[] = data.history.map((item, index) => ({
        id: Date.now() + index,
        type: item.role as 'user' | 'assistant',
        content: item.content,
        references: item.role === 'assistant' ? (item.metadata?.references || []) : undefined,
        timestamp: new Date(item.created_at)
      }))

      console.log('Loaded messages:', loadedMessages)
      setMessages(loadedMessages)

      if (onLoadHistory) {
        onLoadHistory(loadedMessages)
      }
    } catch (error: any) {
      console.error('Error loading chat history:', error)
      message.error(error.message || '加载历史消息失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    const query = input.trim()
    if (!query || loading) return

    // 添加用户消息
    const userMessage: Message = {
      id: Date.now(),
      type: 'user',
      content: query,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      // 调用对话 API（传递 session_id）
      const result = await chatWithKnowledge(query, 5, sessionId)

      // 更新 session_id（首次对话会返回新的 session_id）
      if (result.session_id && result.session_id !== sessionId) {
        setSessionId(result.session_id)
        // 通知父组件会话已创建/更新
        if (onSessionChange) {
          // 使用用户的第一个问题作为会话标题
          const title = query.length > 20 ? query.substring(0, 20) + '...' : query
          onSessionChange(result.session_id, title)
        }
      }

      // 添加 AI 回复
      const assistantMessage: Message = {
        id: Date.now() + 1,
        type: 'assistant',
        content: result.answer,
        references: result.references || [],
        timestamp: new Date()
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (error: any) {
      message.error(error.message || '对话失败')
      // 添加错误消息
      const errorMessage: Message = {
        id: Date.now() + 1,
        type: 'assistant',
        content: `抱歉，对话失败: ${error.message}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleReferenceClick = (ref: any) => {
    console.log('Reference clicked:', ref)
    console.log('Reference metadata:', ref.metadata)
    if (!onVideoSeek) return

    const metadata = ref.metadata || {}
    const videoPath = metadata.video_path as string | undefined
    const staticUrl = metadata.static_url as string | undefined
    const videoId = metadata.video_id as string | undefined

    // 优先使用 transcript_id，如果没有则使用 video_id（虽然video_id是哈希值）
    let transcriptId: number | undefined
    if (metadata.transcript_id !== undefined && metadata.transcript_id !== null) {
      const parsed = Number(metadata.transcript_id)
      // 检查是否是有效的数字（不是NaN）
      if (!isNaN(parsed) && isFinite(parsed)) {
        transcriptId = parsed
        console.log('Using transcript_id from metadata:', transcriptId)
      } else {
        console.log('Invalid transcript_id in metadata (not a number):', metadata.transcript_id)
      }
    } else {
      console.log('No transcript_id in metadata, will try to fetch by path or video_id')
    }

    const startTime = Number(metadata.start_time ?? 0)
    const endTime = metadata.end_time !== undefined && metadata.end_time !== null
      ? Number(metadata.end_time)
      : undefined

    console.log('Calling onVideoSeek with:', { videoPath, staticUrl, transcriptId, videoId, startTime, endTime })

    onVideoSeek({
      videoPath,
      staticUrl,
      transcriptId,
      videoId,
      startTime,
      endTime
    })
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleCopy = async (content: string) => {
    try {
      // 尝试使用现代 Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content)
        message.success('已复制到剪贴板')
        return
      }

      // 降级方案：使用传统的 execCommand
      const textarea = document.createElement('textarea')
      textarea.value = content
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()

      const successful = document.execCommand('copy')
      document.body.removeChild(textarea)

      if (successful) {
        message.success('已复制到剪贴板')
      } else {
        message.error('复制失败，请手动复制')
      }
    } catch (error) {
      console.error('Copy failed:', error)
      message.error('复制失败，请手动复制')
    }
  }

  const handleRetry = async (msgIndex: number) => {
    if (loading) return

    // 找到这个assistant消息之前的最近一条user消息
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].type === 'user') {
        const userQuestion = messages[i].content
        setInput(userQuestion)
        // 使用用户的原问题重新发送
        setTimeout(() => {
          handleSend()
        }, 100)
        break
      }
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <MessageOutlined style={{ fontSize: 20, color: '#1890ff' }} />
        <span style={{ marginLeft: 8, fontSize: 16, fontWeight: 'bold' }}>AI 对话</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <Empty
            description="开始对话，探索视频内容"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          messages.map((msg, index) => (
            <div key={msg.id} className={`chat-message ${msg.type}`}>
              <div className="message-content">
                <MarkdownRenderer className="message-text">{msg.content}</MarkdownRenderer>

                {msg.references && msg.references.length > 0 && (
                  <div className="message-references">
                    <div className="references-title">
                      <FileTextOutlined /> 相关内容 ({msg.references.length})
                    </div>
                    <List
                      size="small"
                      dataSource={msg.references}
                      renderItem={(ref: any, refIndex: number) => {
                        const meta = ref.metadata || {}
                        const videoName = meta.video_path?.split('/').pop()?.split('\\').pop() || '未知视频'
                        const distance = Number(ref.distance ?? 0)
                        const similarity = ((1 - distance) * 100).toFixed(1)
                        const startSeconds = Number(meta.start_time ?? 0)
                        const endSeconds = Number(meta.end_time ?? 0)

                        return (
                          <List.Item
                            key={refIndex}
                            className="reference-item"
                            onClick={() => handleReferenceClick(ref)}
                          >
                            <div className="reference-header">
                              <Tag color="blue">相似度: {similarity}%</Tag>
                              {meta.type === 'paragraph' && (
                                <Tag color="green">
                                  <ClockCircleOutlined /> {formatTime(startSeconds)} - {formatTime(endSeconds)}
                                </Tag>
                              )}
                            </div>
                            <div className="reference-video">{videoName}</div>
                            <div className="reference-text">{ref.document?.substring(0, 100)}...</div>
                          </List.Item>
                        )
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="message-footer">
                <div className="message-time">
                  {msg.timestamp.toLocaleTimeString()}
                </div>
                <div className="message-actions">
                  <Tooltip title="复制">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(msg.content)}
                    />
                  </Tooltip>
                  {msg.type === 'assistant' && (
                    <Tooltip title="重新生成">
                      <Button
                        type="text"
                        size="small"
                        icon={<RedoOutlined />}
                        onClick={() => handleRetry(index)}
                        disabled={loading}
                      />
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="chat-message assistant">
            <div className="message-content">
              <Spin /> <span style={{ marginLeft: 8 }}>正在思考...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onPressEnter={handleSend}
          placeholder="询问视频相关的问题..."
          disabled={loading}
          suffix={
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={loading}
              disabled={!input.trim()}
            >
              发送
            </Button>
          }
        />
      </div>
    </div>
  )
}
