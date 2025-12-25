import type {
  JobResponse,
  TranscriptsResponse,
  JobsResponse,
  TranscriptDetailResponse,
  SummarizeResponse,
  Segment,
  SummaryMeta,
  MindMapResponse
} from '../types'

/**
 * 创建任务
 */
export const createJob = async (url: string): Promise<JobResponse> => {
  const response = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  })
  
  if (!response.ok) {
    throw new Error(`创建任务失败：${response.status}`)
  }
  
  return response.json()
}

/**
 * 获取已处理的转写记录列表
 */
export const fetchTranscripts = async (limit = 50, offset = 0): Promise<TranscriptsResponse> => {
  const response = await fetch(`/api/transcripts?limit=${limit}&offset=${offset}`)
  
  if (!response.ok) {
    throw new Error(`获取列表失败：${response.status}`)
  }
  
  return response.json()
}

/**
 * 获取任务队列
 */
export const fetchJobs = async (): Promise<JobsResponse> => {
  const [pendingResponse, runningResponse] = await Promise.all([
    fetch('/api/jobs?status=pending&limit=50&offset=0'),
    fetch('/api/jobs?status=running&limit=50&offset=0'),
  ])
  
  if (!pendingResponse.ok) {
    throw new Error(`获取待处理任务失败：${pendingResponse.status}`)
  }
  if (!runningResponse.ok) {
    throw new Error(`获取进行中任务失败：${runningResponse.status}`)
  }
  
  const [pendingJobs, runningJobs] = await Promise.all([
    pendingResponse.json(),
    runningResponse.json()
  ])
  
  const items = [
    ...(Array.isArray(pendingJobs.items) ? pendingJobs.items : []),
    ...(Array.isArray(runningJobs.items) ? runningJobs.items : []),
  ]
  
  // 去重并按 id 升序/创建时间升序方便观察排队
  const map = new Map()
  for (const item of items) {
    map.set(Number(item.id), item)
  }
  const sortedItems = Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id))
  
  return { items: sortedItems }
}

/**
 * 获取转写记录详情
 */
export const fetchTranscriptDetail = async (id: number): Promise<TranscriptDetailResponse> => {
  const response = await fetch(`/api/transcripts/${id}`)

  if (!response.ok) {
    throw new Error(`获取详情失败：${response.status}`)
  }

  return response.json()
}

/**
 * 根据 media_path 获取 transcript_id
 */
export const fetchTranscriptIdByPath = async (mediaPath: string): Promise<number> => {
  const response = await fetch(`/api/lookup/transcript?media_path=${encodeURIComponent(mediaPath)}`)

  if (!response.ok) {
    throw new Error(`未找到对应的转写记录：${response.status}`)
  }

  const data = await response.json()
  return data.transcript_id
}

/**
 * 生成总结
 */
export const generateSummary = async (segments: Segment[]): Promise<SummarizeResponse> => {
  const response = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segments })
  })
  
  if (!response.ok) {
    throw new Error(`summarize failed: ${response.status}`)
  }
  
  return response.json()
}

/**
 * 删除转写记录（同时删除视频文件和数据库记录）
 */
export const deleteTranscriptComplete = async (transcriptId: number): Promise<{ success: boolean; message: string }> => {
  console.log('调用 deleteTranscriptComplete API:', transcriptId)

  const url = `/api/transcripts/${transcriptId}`
  console.log('请求 URL:', url)
  console.log('请求方法: DELETE')

  const requestOptions = {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  }
  console.log('请求配置:', requestOptions)

  const response = await fetch(url, requestOptions)

  console.log('响应状态:', response.status, response.statusText)
  console.log('响应headers:', [...response.headers.entries()])

  if (!response.ok) {
    const errorText = await response.text()
    console.error('删除请求失败:', { status: response.status, statusText: response.statusText, body: errorText })
    throw new Error(`删除失败：${response.status} - ${response.statusText}`)
  }

  const result = await response.json()
  console.log('删除响应结果:', result)
  return result
}

/**
 * 获取指定转写记录的摘要
 */
export const fetchSummariesByTranscript = async (transcriptId: number): Promise<{ summaries: any[] }> => {
  const response = await fetch(`/api/summaries/transcript/${transcriptId}`)

  if (!response.ok) {
    if (response.status === 404) {
      // 摘要不存在，返回空数组
      return { summaries: [] }
    }
    throw new Error(`获取摘要失败：${response.status}`)
  }

  return response.json()
}

/**
 * 列出所有摘要记录
 */
export const fetchAllSummaries = async (limit = 50, offset = 0): Promise<{ items: any[] }> => {
  const response = await fetch(`/api/summaries?limit=${limit}&offset=${offset}`)

  if (!response.ok) {
    throw new Error(`获取摘要列表失败：${response.status}`)
  }

  return response.json()
}

/**
 * 基于知识库的对话 - 使用 Qdrant RAG
 */
export const chatWithKnowledge = async (
  query: string,
  n_results = 5,
  session_id?: string
): Promise<{
  answer: string
  references: any[]
  query: string
  session_id?: string
}> => {
  console.log('[API] Calling Qdrant RAG chat:', { query, n_results, session_id })

  const response = await fetch('/api/qdrant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      n_results,
      session_id,
      score_threshold: 0.4  // 降低阈值以匹配更多结果
    })
  })

  console.log('[API] Response status:', response.status)

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Error response:', errorText)
    throw new Error(`对话失败：${response.status} - ${errorText}`)
  }

  const result = await response.json()
  console.log('[API] Success result:', result)

  // 返回结果,session_id 已由后端返回
  return result
}

/**
 * 获取对话历史
 */
export const getChatHistory = async (session_id: string, limit = 50): Promise<{
  session_id: string
  history: Array<{
    id: number
    role: string
    content: string
    metadata: any
    created_at: string
  }>
}> => {
  const response = await fetch(`/api/knowledge/chat/history/${session_id}?limit=${limit}`)

  if (!response.ok) {
    throw new Error(`获取对话历史失败：${response.status}`)
  }

  return response.json()
}

/**
 * 删除对话历史
 */
export const deleteChatHistory = async (session_id: string): Promise<{
  success: boolean
  session_id: string
  message: string
}> => {
  const response = await fetch(`/api/knowledge/chat/history/${session_id}`, {
    method: 'DELETE'
  })

  if (!response.ok) {
    throw new Error(`删除对话历史失败：${response.status}`)
  }

  return response.json()
}

/**
 * 在知识库中搜索
 */
export const searchKnowledge = async (query: string, n_results = 10): Promise<{
  results: any[]
}> => {
  const response = await fetch('/api/knowledge/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, n_results })
  })

  if (!response.ok) {
    throw new Error(`搜索失败：${response.status}`)
  }

  return response.json()
}

/**
 * 同步数据到向量库
 */
export const syncToKnowledge = async (transcript_id?: number): Promise<any> => {
  const response = await fetch('/api/knowledge/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript_id: transcript_id || null })
  })

  if (!response.ok) {
    throw new Error(`同步失败：${response.status}`)
  }

  return response.json()
}

/**
 * 列出知识库中的所有视频
 */
export const fetchKnowledgeVideos = async (): Promise<{ videos: any[] }> => {
  const response = await fetch('/api/knowledge/videos')

  if (!response.ok) {
    throw new Error(`获取视频列表失败：${response.status}`)
  }

  return response.json()
}

/**
 * 获取 Qdrant 文件夹列表
 */
export const fetchQdrantFolders = async (): Promise<{
  folders: any[]
  total: number
}> => {
  const response = await fetch('/api/qdrant/folders')

  if (!response.ok) {
    throw new Error(`获取文件夹列表失败：${response.status}`)
  }

  return response.json()
}

/**
 * 从 Qdrant 获取最新的视频列表 (pyvideotrans 导出的数据)
 */
export const fetchQdrantVideos = async (
  page: number = 1,
  pageSize: number = 20,
  folderId?: string
): Promise<{
  videos: any[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
  cached?: boolean
}> => {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString()
  })

  if (folderId) {
    params.append('folder_id', folderId)
  }

  const response = await fetch(`/api/qdrant/videos?${params}`)

  if (!response.ok) {
    throw new Error(`获取 Qdrant 视频列表失败：${response.status}`)
  }

  return response.json()
}

/**
 * 用户登录
 */
export const userLogin = async (username: string, password: string): Promise<{
  access_token: string
  token_type: string
  user_id: number
  username: string
  is_admin: boolean
}> => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '登录失败' }))
    throw new Error(error.detail || '登录失败')
  }

  return response.json()
}

/**
 * 验证 Token
 */
export const verifyToken = async (token: string): Promise<{
  valid: boolean
  user_id: string
  username: string
}> => {
  const response = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })

  if (!response.ok) {
    throw new Error('Token 无效')
  }

  return response.json()
}

/**
 * 获取当前用户信息
 */
export const getCurrentUser = async (token: string): Promise<{
  id: number
  username: string
  email: string | null
  is_admin: boolean
  is_active: boolean
  created_at: string
}> => {
  const response = await fetch('/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })

  if (!response.ok) {
    throw new Error('获取用户信息失败')
  }

  return response.json()
}

/**
 * 管理员登录
 */
export const adminLogin = async (password: string): Promise<{
  success: boolean
  token: string
}> => {
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '登录失败' }))
    throw new Error(error.detail || '登录失败')
  }

  return response.json()
}

/**
 * 获取所有配置（需要管理员权限）
 */
export const getAdminConfigs = async (token: string): Promise<{
  configs: Record<string, string>
}> => {
  const response = await fetch('/api/admin/configs', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })

  if (!response.ok) {
    throw new Error('获取配置失败')
  }

  return response.json()
}

/**
 * 更新配置（需要管理员权限）
 */
export const updateAdminConfig = async (
  token: string,
  config_key: string,
  config_value: string
): Promise<{
  success: boolean
  message: string
}> => {
  const response = await fetch('/api/admin/configs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ config_key, config_value })
  })

  if (!response.ok) {
    throw new Error('更新配置失败')
  }

  return response.json()
}

/**
 * 获取单个公开配置（如网站标题）
 */
export const getPublicConfig = async (config_key: string): Promise<{
  config_key: string
  config_value: string
}> => {
  const response = await fetch(`/api/admin/config/${config_key}`)

  if (!response.ok) {
    throw new Error('获取配置失败')
  }

  return response.json()
}

/**
 * 通过 video_id 获取视频段落信息（从 Qdrant 向量数据库直接读取）
 */
export const fetchVideoByVideoId = async (videoId: string): Promise<TranscriptDetailResponse> => {
  const response = await fetch(`/api/qdrant/videos/${videoId}/paragraphs`)

  if (!response.ok) {
    throw new Error(`获取视频段落失败：${response.status}`)
  }

  return response.json()
}

/**
 * 获取视频思维导图数据
 */
export const fetchVideoMindMap = async (videoId: string): Promise<MindMapResponse> => {
  const response = await fetch(`/api/qdrant/videos/${videoId}/mindmap`)

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('该视频暂无思维导图数据')
    }
    throw new Error(`获取思维导图失败：${response.status}`)
  }

  return response.json()
}