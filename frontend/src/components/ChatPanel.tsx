import { useState, useRef, useEffect } from 'react'
import { Input, Button, List, Card, Tag, Spin, message, Empty } from 'antd'
import { SendOutlined, MessageOutlined, FileTextOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { chatWithKnowledge } from '../services/api'
import './ChatPanel.css'

interface Message {
  id: number
  type: 'user' | 'assistant'
  content: string
  references?: any[]
  timestamp: Date
}

interface ChatPanelProps {
  onVideoSeek?: (videoPath: string, startTime: number) => void
}

export default function ChatPanel({ onVideoSeek }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

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
      // 调用对话 API
      const result = await chatWithKnowledge(query, 5)

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
    if (!onVideoSeek) return

    const metadata = ref.metadata || {}
    const videoPath = metadata.video_path
    const startTime = metadata.start_time || 0

    if (videoPath && onVideoSeek) {
      onVideoSeek(videoPath, startTime)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
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
          messages.map(msg => (
            <div key={msg.id} className={`chat-message ${msg.type}`}>
              <div className="message-content">
                <div className="message-text">{msg.content}</div>

                {msg.references && msg.references.length > 0 && (
                  <div className="message-references">
                    <div className="references-title">
                      <FileTextOutlined /> 相关内容 ({msg.references.length})
                    </div>
                    <List
                      size="small"
                      dataSource={msg.references}
                      renderItem={(ref: any, index: number) => {
                        const meta = ref.metadata || {}
                        const videoName = meta.video_path?.split('/').pop()?.split('\\').pop() || '未知视频'
                        const distance = ref.distance || 0
                        const similarity = ((1 - distance) * 100).toFixed(1)

                        return (
                          <List.Item
                            key={index}
                            className="reference-item"
                            onClick={() => handleReferenceClick(ref)}
                          >
                            <div className="reference-header">
                              <Tag color="blue">相似度: {similarity}%</Tag>
                              {meta.type === 'paragraph' && (
                                <Tag color="green">
                                  <ClockCircleOutlined /> {formatTime(meta.start_time)} - {formatTime(meta.end_time)}
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
              <div className="message-time">
                {msg.timestamp.toLocaleTimeString()}
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
