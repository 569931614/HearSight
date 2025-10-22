import type {
  JobResponse,
  TranscriptsResponse,
  JobsResponse,
  TranscriptDetailResponse,
  SummarizeResponse,
  Segment,
  SummaryMeta
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
 * 基于知识库的对话
 */
export const chatWithKnowledge = async (query: string, n_results = 5): Promise<{
  answer: string
  references: any[]
  query: string
}> => {
  const response = await fetch('/api/knowledge/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, n_results })
  })

  if (!response.ok) {
    throw new Error(`对话失败：${response.status}`)
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