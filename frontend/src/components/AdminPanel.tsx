import { useState, useEffect } from 'react'
import { Tabs, Card, Table, Button, Space, Modal, Form, Input, Switch, message, Statistic, Row, Col, Popconfirm, Tag, Tooltip, Drawer, Select } from 'antd'
import { UserOutlined, VideoCameraOutlined, DashboardOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SettingOutlined, EyeOutlined, ReloadOutlined, FileTextOutlined, FolderOutlined, UploadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import MindMapViewer from './MindMapViewer'

const { TabPane } = Tabs
const { TextArea } = Input

// API 服务
const API_BASE = import.meta.env.VITE_API_BASE || ''

// 获取 token
const getToken = () => localStorage.getItem('auth_token')

// 通用请求函数
const apiRequest = async (url: string, options: RequestInit = {}) => {
  const token = getToken()
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: '请求失败' }))
    throw new Error(error.detail || '请求失败')
  }
  return res.json()
}

// 获取系统统计
const fetchSystemStats = () => apiRequest('/api/admin-panel/stats')

// 用户管理 API
const fetchUsers = (page: number, pageSize: number, search?: string) => {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (search) params.append('search', search)
  return apiRequest(`/api/admin-panel/users?${params}`)
}

const createUser = (data: any) => apiRequest('/api/admin-panel/users', { method: 'POST', body: JSON.stringify(data) })
const updateUser = (userId: number, data: any) => apiRequest(`/api/admin-panel/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) })
const deleteUser = (userId: number) => apiRequest(`/api/admin-panel/users/${userId}`, { method: 'DELETE' })
const importUsers = (usernames: string[], defaultPassword: string = '123456') =>
  apiRequest('/api/admin-panel/users/import', { method: 'POST', body: JSON.stringify({ usernames, default_password: defaultPassword }) })

// 视频管理 API
const fetchVideos = (page: number, pageSize: number, search?: string) => {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (search) params.append('search', search)
  return apiRequest(`/api/admin-panel/videos?${params}`)
}

// 视频删除和移动 API
const deleteQdrantVideo = (videoId: string) => apiRequest(`/api/admin-panel/qdrant-videos/${videoId}`, { method: 'DELETE' })
const moveVideoToFolder = (videoId: string, folderId: string | null) =>
  apiRequest(`/api/admin-panel/qdrant-videos/${videoId}/folder`, { method: 'PUT', body: JSON.stringify({ folder_id: folderId }) })

// 文件夹 API
const fetchFolders = () => apiRequest('/api/qdrant/folders')
const createFolder = (name: string, parentId: string | null = null) => apiRequest('/api/qdrant/folders', { method: 'POST', body: JSON.stringify({ name, parent_id: parentId }) })
const renameFolder = (folderId: string, newName: string) => apiRequest(`/api/qdrant/folders/${folderId}`, { method: 'PUT', body: JSON.stringify({ new_name: newName }) })
const deleteFolder = (folderId: string) => apiRequest(`/api/qdrant/folders/${folderId}`, { method: 'DELETE' })
const moveFolderToParent = (folderId: string, parentId: string | null) => apiRequest(`/api/qdrant/folders/${folderId}/parent`, { method: 'PUT', body: JSON.stringify({ parent_id: parentId }) })

// 视频思维导图 API
const fetchVideoMindmap = (videoId: string) => apiRequest(`/api/qdrant/videos/${videoId}/mindmap?auto_generate=false`)
const generateVideoMindmap = (videoId: string, overwrite: boolean = false) =>
  apiRequest(`/api/qdrant/videos/${videoId}/mindmap/generate`, { method: 'POST', body: JSON.stringify({ save: true, overwrite }) })
const updateVideoMindmap = (videoId: string, markdown: string) =>
  apiRequest(`/api/qdrant/videos/${videoId}/mindmap`, { method: 'PUT', body: JSON.stringify({ mind_map_markdown: markdown }) })
const deleteVideoMindmap = (videoId: string) => apiRequest(`/api/qdrant/videos/${videoId}/mindmap`, { method: 'DELETE' })

// 系统配置 API
const fetchConfigs = () => apiRequest('/api/admin-panel/configs')
const updateConfig = (key: string, value: string) => apiRequest('/api/admin-panel/configs', { method: 'POST', body: JSON.stringify({ config_key: key, config_value: value }) })

// 系统设置 API
const fetchSettings = () => apiRequest('/api/admin-panel/settings')
const updateSetting = (key: string, value: string) => apiRequest('/api/admin-panel/settings', { method: 'POST', body: JSON.stringify({ key, value }) })

interface AdminPanelProps {
  onClose: () => void
}

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState('stats')
  const [stats, setStats] = useState<any>(null)

  // 用户管理
  const [users, setUsers] = useState<any[]>([])
  const [userTotal, setUserTotal] = useState(0)
  const [userPage, setUserPage] = useState(1)
  const [userPageSize] = useState(10)
  const [userSearch, setUserSearch] = useState('')
  const [userLoading, setUserLoading] = useState(false)
  const [userModalVisible, setUserModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [userForm] = Form.useForm()
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [importForm] = Form.useForm()
  const [importLoading, setImportLoading] = useState(false)

  // 视频管理
  const [videos, setVideos] = useState<any[]>([])
  const [videoTotal, setVideoTotal] = useState(0)
  const [videoPage, setVideoPage] = useState(1)
  const [videoPageSize] = useState(10)
  const [videoSearch, setVideoSearch] = useState('')
  const [videoLoading, setVideoLoading] = useState(false)

  // 文件夹列表
  const [folders, setFolders] = useState<Array<{ folder_id: string; name: string; video_count: number; parent_id: string | null }>>([])
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null)

  // 移动文件夹弹窗
  const [moveModalVisible, setMoveModalVisible] = useState(false)
  const [movingVideo, setMovingVideo] = useState<any>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  // 文件夹管理
  const [folderLoading, setFolderLoading] = useState(false)
  const [folderModalVisible, setFolderModalVisible] = useState(false)
  const [editingFolder, setEditingFolder] = useState<any>(null)
  const [folderForm] = Form.useForm()

  // 视频编辑
  const [videoDetailVisible, setVideoDetailVisible] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState<any>(null)
  const [mindmapContent, setMindmapContent] = useState<string>('')
  const [mindmapLoading, setMindmapLoading] = useState(false)
  const [mindmapEditing, setMindmapEditing] = useState(false)

  // 系统配置
  const [configs, setConfigs] = useState<Record<string, string>>({})
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [configLoading, setConfigLoading] = useState(false)
  const [configForm] = Form.useForm()

  // 加载系统统计
  const loadStats = async () => {
    try {
      const data = await fetchSystemStats()
      setStats(data)
    } catch (error: any) {
      message.error(error.message)
    }
  }

  // 加载用户列表
  const loadUsers = async () => {
    setUserLoading(true)
    try {
      const data = await fetchUsers(userPage, userPageSize, userSearch || undefined)
      setUsers(data.users)
      setUserTotal(data.total)
    } catch (error: any) {
      message.error(error.message)
    } finally {
      setUserLoading(false)
    }
  }

  // 加载视频列表
  const loadVideos = async () => {
    setVideoLoading(true)
    try {
      const [videoData, folderData] = await Promise.all([
        fetchVideos(videoPage, videoPageSize, videoSearch || undefined),
        fetchFolders()
      ])
      setVideos(videoData.videos)
      setVideoTotal(videoData.total)
      setFolders(folderData.folders || [])
    } catch (error: any) {
      message.error(error.message)
    } finally {
      setVideoLoading(false)
    }
  }

  // 删除视频
  const handleDeleteVideo = async (videoId: string) => {
    try {
      await deleteQdrantVideo(videoId)
      message.success('视频已删除')
      loadVideos()
      loadStats()
    } catch (error: any) {
      message.error(error.message)
    }
  }

  // 打开移动文件夹弹窗
  const openMoveModal = (video: any) => {
    setMovingVideo(video)
    setSelectedFolderId(video.folder_id || null)
    setMoveModalVisible(true)
  }

  // 确认移动
  const handleMoveVideo = async () => {
    if (!movingVideo) return
    try {
      await moveVideoToFolder(movingVideo.video_id, selectedFolderId)
      message.success('视频已移动')
      setMoveModalVisible(false)
      setMovingVideo(null)
      loadVideos()
    } catch (error: any) {
      message.error(error.message)
    }
  }

  // 加载文件夹列表
  const loadFolders = async () => {
    setFolderLoading(true)
    try {
      const data = await fetchFolders()
      setFolders(data.folders || [])
    } catch (error: any) {
      message.error(error.message)
    } finally {
      setFolderLoading(false)
    }
  }

  // 创建或重命名文件夹
  const handleFolderSubmit = async () => {
    try {
      const values = await folderForm.validateFields()
      if (editingFolder) {
        await renameFolder(editingFolder.folder_id, values.name)
        message.success('文件夹已重命名')
      } else {
        await createFolder(values.name, selectedParentId)
        message.success('文件夹已创建')
      }
      setFolderModalVisible(false)
      folderForm.resetFields()
      setEditingFolder(null)
      setSelectedParentId(null)
      loadFolders()
    } catch (error: any) {
      if (error.errorFields) return
      message.error(error.message)
    }
  }

  // 移动文件夹到新父级
  const handleMoveFolderToParent = async (folderId: string, newParentId: string | null) => {
    try {
      await moveFolderToParent(folderId, newParentId)
      message.success('文件夹已移动')
      loadFolders()
    } catch (error: any) {
      message.error(error.message)
    }
  }

  // 构建树形数据
  const buildTreeData = (items: typeof folders, parentId: string | null = null): any[] => {
    return items
      .filter(item => item.parent_id === parentId)
      .map(item => ({
        ...item,
        key: item.folder_id,
        children: buildTreeData(items, item.folder_id),
      }))
      .map(item => {
        if (item.children.length === 0) {
          delete item.children
        }
        return item
      })
  }

  // 获取文件夹路径
  const getFolderPath = (folderId: string): string => {
    const paths: string[] = []
    let currentId: string | null = folderId
    while (currentId) {
      const folder = folders.find(f => f.folder_id === currentId)
      if (folder) {
        paths.unshift(folder.name)
        currentId = folder.parent_id
      } else {
        break
      }
    }
    return paths.join(' / ')
  }

  // 删除文件夹
  const handleDeleteFolder = async (folderId: string) => {
    try {
      await deleteFolder(folderId)
      message.success('文件夹已删除')
      loadFolders()
    } catch (error: any) {
      message.error(error.message)
    }
  }

  // 加载系统配置
  const loadConfigs = async () => {
    setConfigLoading(true)
    try {
      const [configData, settingData] = await Promise.all([
        fetchConfigs(),
        fetchSettings()
      ])
      setConfigs(configData.configs || {})
      setSettings(settingData.settings || {})

      // 设置表单初始值
      configForm.setFieldsValue({
        site_title: configData.configs?.site_title || 'HearSight - AI 视频智能分析',
        mindmap_prompt: configData.configs?.mindmap_prompt || '',
        ...settingData.settings,
      })
    } catch (error: any) {
      message.error(error.message)
    } finally {
      setConfigLoading(false)
    }
  }

  // 初始化加载
  useEffect(() => {
    if (activeTab === 'stats') {
      loadStats()
    } else if (activeTab === 'users') {
      loadUsers()
    } else if (activeTab === 'videos') {
      loadVideos()
    } else if (activeTab === 'folders') {
      loadFolders()
    } else if (activeTab === 'config') {
      loadConfigs()
    }
  }, [activeTab, userPage, videoPage, userSearch, videoSearch])

  // 加载视频思维导图
  const loadVideoMindmap = async (videoId: string) => {
    setMindmapLoading(true)
    try {
      const data = await fetchVideoMindmap(videoId)
      setMindmapContent(data.mind_map_markdown || '')
    } catch (error: any) {
      // 404 表示没有思维导图
      if (error.message.includes('404') || error.message.includes('not found')) {
        setMindmapContent('')
      } else {
        message.error(error.message)
      }
    } finally {
      setMindmapLoading(false)
    }
  }

  // 生成思维导图
  const handleGenerateMindmap = async (overwrite: boolean = false) => {
    if (!selectedVideo) return
    setMindmapLoading(true)
    try {
      const data = await generateVideoMindmap(selectedVideo.video_id, overwrite)
      setMindmapContent(data.mind_map_markdown || '')
      message.success('思维导图生成成功')
    } catch (error: any) {
      message.error(error.message)
    } finally {
      setMindmapLoading(false)
    }
  }

  // 保存思维导图
  const handleSaveMindmap = async () => {
    if (!selectedVideo) return
    try {
      await updateVideoMindmap(selectedVideo.video_id, mindmapContent)
      message.success('思维导图已保存')
      setMindmapEditing(false)
    } catch (error: any) {
      message.error(error.message)
    }
  }

  // 删除思维导图
  const handleDeleteMindmap = async () => {
    if (!selectedVideo) return
    try {
      await deleteVideoMindmap(selectedVideo.video_id)
      setMindmapContent('')
      message.success('思维导图已删除')
    } catch (error: any) {
      message.error(error.message)
    }
  }

  // 用户表格列
  const userColumns: ColumnsType<any> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '角色', dataIndex: 'is_admin', key: 'is_admin',
      render: (isAdmin: boolean) => <Tag color={isAdmin ? 'red' : 'blue'}>{isAdmin ? '管理员' : '普通用户'}</Tag>,
    },
    {
      title: '状态', dataIndex: 'is_active', key: 'is_active',
      render: (isActive: boolean) => <Tag color={isActive ? 'green' : 'default'}>{isActive ? '启用' : '禁用'}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (time: string) => new Date(time).toLocaleString() },
    { title: '最后登录', dataIndex: 'last_login', key: 'last_login', render: (time: string) => time ? new Date(time).toLocaleString() : '-' },
    {
      title: '操作', key: 'action', width: 180,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => {
            setEditingUser(record)
            userForm.setFieldsValue({ username: record.username, email: record.email, is_admin: record.is_admin, is_active: record.is_active })
            setUserModalVisible(true)
          }}>编辑</Button>
          <Popconfirm title="确认删除该用户？" onConfirm={async () => {
            try { await deleteUser(record.id); message.success('删除成功'); loadUsers() } catch (error: any) { message.error(error.message) }
          }}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 文件夹表格列（树形）
  const folderColumns: ColumnsType<any> = [
    { title: '文件夹名称', dataIndex: 'name', key: 'name', width: 250 },
    { title: '视频数量', dataIndex: 'video_count', key: 'video_count', width: 100 },
    {
      title: '操作', key: 'action', width: 280,
      render: (_: any, record: any) => (
        <Space size="small">
          <Tooltip title="添加子文件夹">
            <Button size="small" icon={<PlusOutlined />} onClick={() => {
              setEditingFolder(null)
              setSelectedParentId(record.folder_id)
              folderForm.resetFields()
              setFolderModalVisible(true)
            }} />
          </Tooltip>
          <Button size="small" icon={<EditOutlined />} onClick={() => {
            setEditingFolder(record)
            setSelectedParentId(null)
            folderForm.setFieldsValue({ name: record.name })
            setFolderModalVisible(true)
          }}>重命名</Button>
          {record.parent_id && (
            <Tooltip title="移到根目录">
              <Button size="small" onClick={() => handleMoveFolderToParent(record.folder_id, null)}>
                移到根目录
              </Button>
            </Tooltip>
          )}
          <Popconfirm
            title="确定删除此文件夹？"
            description="子文件夹和视频将被移动到「未分类」"
            onConfirm={() => handleDeleteFolder(record.folder_id)}
            okText="确定删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 视频表格列
  const videoColumns: ColumnsType<any> = [
    { title: '序号', dataIndex: 'id', key: 'id', width: 60 },
    { title: '视频标题', dataIndex: 'video_title', key: 'video_title', ellipsis: true, width: 200 },
    { title: '文件夹', dataIndex: 'folder', key: 'folder', width: 100, render: (folder: string) => <Tag color="blue">{folder || '未分类'}</Tag> },
    { title: '分句数', dataIndex: 'total_segments', key: 'total_segments', width: 70 },
    {
      title: '时长', dataIndex: 'total_duration', key: 'total_duration', width: 80,
      render: (duration: number) => {
        if (!duration) return '-'
        const seconds = Math.floor(duration / 1000)
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
      },
    },
    { title: '语言', dataIndex: 'language', key: 'language', width: 60 },
    {
      title: '点击', dataIndex: 'view_count', key: 'view_count', width: 60,
      sorter: (a: any, b: any) => (a.view_count || 0) - (b.view_count || 0),
      render: (count: number) => <span style={{ fontWeight: count > 0 ? 'bold' : 'normal', color: count > 10 ? '#1890ff' : undefined }}>{count || 0}</span>,
    },
    {
      title: '操作', key: 'action', width: 220, fixed: 'right',
      render: (_: any, record: any) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button size="small" icon={<EyeOutlined />} onClick={() => {
              setSelectedVideo(record)
              setVideoDetailVisible(true)
              setMindmapEditing(false)
              loadVideoMindmap(record.video_id)
            }} />
          </Tooltip>
          <Tooltip title="移动文件夹">
            <Button size="small" icon={<FolderOutlined />} onClick={() => openMoveModal(record)} />
          </Tooltip>
          <Tooltip title="生成思维导图">
            <Button size="small" icon={<FileTextOutlined />} onClick={async () => {
              try {
                await generateVideoMindmap(record.video_id, true)
                message.success('思维导图生成成功')
              } catch (error: any) {
                message.error(error.message)
              }
            }} />
          </Tooltip>
          <Popconfirm
            title="确定删除此视频？"
            description="此操作将删除视频的所有数据（包括字幕、思维导图等），不可恢复"
            onConfirm={() => handleDeleteVideo(record.video_id)}
            okText="确定删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="删除视频">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 处理用户表单提交
  const handleUserSubmit = async () => {
    try {
      const values = await userForm.validateFields()
      if (editingUser) {
        await updateUser(editingUser.id, values)
        message.success('更新成功')
      } else {
        await createUser(values)
        message.success('创建成功')
      }
      setUserModalVisible(false)
      userForm.resetFields()
      setEditingUser(null)
      loadUsers()
      loadStats()
    } catch (error: any) {
      if (error.errorFields) return
      message.error(error.message)
    }
  }

  // 处理用户导入
  const handleImportUsers = async () => {
    try {
      const values = await importForm.validateFields()
      const usernamesText = values.usernames as string
      // 按换行符分割，过滤空行和空白
      const usernames = usernamesText
        .split('\n')
        .map((name: string) => name.trim())
        .filter((name: string) => name.length >= 3)

      if (usernames.length === 0) {
        message.error('请输入至少一个有效的用户名（至少3个字符）')
        return
      }

      setImportLoading(true)
      const result = await importUsers(usernames, values.defaultPassword || '123456')
      message.success(result.message)
      setImportModalVisible(false)
      importForm.resetFields()
      loadUsers()
      loadStats()
    } catch (error: any) {
      if (error.errorFields) return
      message.error(error.message)
    } finally {
      setImportLoading(false)
    }
  }

  // 保存系统配置
  const handleSaveConfig = async () => {
    try {
      const values = await configForm.validateFields()

      // 保存配置
      for (const [key, value] of Object.entries(values)) {
        if (key === 'site_title' || key === 'mindmap_prompt') {
          await updateConfig(key, value as string)
        } else {
          await updateSetting(key, value as string)
        }
      }

      message.success('配置已保存')

      // 更新网站标题
      if (values.site_title) {
        document.title = values.site_title
      }
    } catch (error: any) {
      if (error.errorFields) return
      message.error(error.message)
    }
  }

  return (
    <div style={{ padding: '24px', width: '100%', height: '100%', overflow: 'auto', background: '#f5f5f5' }}>
      <Card style={{ width: '100%' }} title={<span style={{ fontSize: '20px', fontWeight: 'bold' }}>管理后台</span>} extra={<Button onClick={onClose}>返回</Button>}>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          {/* 系统统计 */}
          <TabPane tab={<span><DashboardOutlined /> 系统概览</span>} key="stats">
            {stats && (
              <div>
                <h3 style={{ marginBottom: '16px' }}>用户统计</h3>
                <Row gutter={24} style={{ marginBottom: '24px' }}>
                  <Col span={8}><Card bordered={false} style={{ background: '#f6ffed' }}><Statistic title="总用户数" value={stats.total_users} prefix={<UserOutlined />} /></Card></Col>
                  <Col span={8}><Card bordered={false} style={{ background: '#e6f7ff' }}><Statistic title="活跃用户" value={stats.active_users} valueStyle={{ color: '#3f8600' }} /></Card></Col>
                  <Col span={8}><Card bordered={false} style={{ background: '#fff2e8' }}><Statistic title="管理员数" value={stats.admin_users} valueStyle={{ color: '#cf1322' }} /></Card></Col>
                </Row>
                <h3 style={{ marginBottom: '16px' }}>视频统计</h3>
                <Row gutter={24} style={{ marginBottom: '24px' }}>
                  <Col span={8}><Card bordered={false} style={{ background: '#f9f0ff' }}><Statistic title="总视频数 (Qdrant)" value={stats.total_qdrant_videos ?? stats.total_videos} prefix={<VideoCameraOutlined />} /></Card></Col>
                  <Col span={8}><Card bordered={false} style={{ background: '#e6fffb' }}><Statistic title="转写记录数 (DB)" value={stats.total_videos} /></Card></Col>
                </Row>
                <h3 style={{ marginBottom: '16px' }}>任务统计</h3>
                <Row gutter={24}>
                  <Col span={8}><Card bordered={false} style={{ background: '#f0f5ff' }}><Statistic title="总任务数" value={stats.total_jobs} /></Card></Col>
                  <Col span={8}><Card bordered={false} style={{ background: '#e6f7ff' }}><Statistic title="待处理任务" value={stats.pending_jobs} valueStyle={{ color: '#1890ff' }} /></Card></Col>
                  <Col span={8}><Card bordered={false} style={{ background: '#fff1f0' }}><Statistic title="失败任务" value={stats.failed_jobs} valueStyle={{ color: '#cf1322' }} /></Card></Col>
                </Row>
              </div>
            )}
          </TabPane>

          {/* 用户管理 */}
          <TabPane tab={<span><UserOutlined /> 用户管理</span>} key="users">
            <Space style={{ marginBottom: '16px' }}>
              <Input.Search placeholder="搜索用户名或邮箱" onSearch={setUserSearch} allowClear style={{ width: 300 }} />
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingUser(null); userForm.resetFields(); setUserModalVisible(true) }}>新建用户</Button>
              <Button icon={<UploadOutlined />} onClick={() => { importForm.resetFields(); importForm.setFieldsValue({ defaultPassword: '123456' }); setImportModalVisible(true) }}>批量导入</Button>
            </Space>
            <Table columns={userColumns} dataSource={users} rowKey="id" loading={userLoading} pagination={{ current: userPage, pageSize: userPageSize, total: userTotal, onChange: setUserPage, showTotal: (total) => `共 ${total} 个用户` }} />
          </TabPane>

          {/* 视频管理 */}
          <TabPane tab={<span><VideoCameraOutlined /> 视频管理</span>} key="videos">
            <Space style={{ marginBottom: '16px' }}>
              <Input.Search placeholder="搜索视频标题、路径或ID" onSearch={setVideoSearch} allowClear style={{ width: 400 }} />
              <Button icon={<ReloadOutlined />} onClick={loadVideos}>刷新</Button>
            </Space>
            <Table columns={videoColumns} dataSource={videos} rowKey="video_id" loading={videoLoading} scroll={{ x: 1000 }} pagination={{ current: videoPage, pageSize: videoPageSize, total: videoTotal, onChange: setVideoPage, showTotal: (total) => `共 ${total} 个视频 (来自 Qdrant)` }} />
          </TabPane>

          {/* 文件夹管理 */}
          <TabPane tab={<span><FolderOutlined /> 文件夹管理</span>} key="folders">
            <Space style={{ marginBottom: '16px' }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingFolder(null); setSelectedParentId(null); folderForm.resetFields(); setFolderModalVisible(true) }}>新建根文件夹</Button>
              <Button icon={<ReloadOutlined />} onClick={loadFolders}>刷新</Button>
            </Space>
            <Table
              columns={folderColumns}
              dataSource={buildTreeData(folders)}
              rowKey="folder_id"
              loading={folderLoading}
              pagination={false}
              expandable={{ defaultExpandAllRows: true }}
            />
            <div style={{ marginTop: 16, color: '#999' }}>
              共 {folders.length} 个文件夹，{folders.reduce((sum, f) => sum + (f.video_count || 0), 0)} 个视频已分类
            </div>
          </TabPane>

          {/* 系统配置 */}
          <TabPane tab={<span><SettingOutlined /> 系统配置</span>} key="config">
            <Form form={configForm} layout="vertical" style={{ maxWidth: '800px' }}>
              <Card title="基础设置" style={{ marginBottom: '16px' }}>
                <Form.Item label="网站标题" name="site_title" help="显示在浏览器标签和页面顶部">
                  <Input placeholder="HearSight - AI 视频智能分析" />
                </Form.Item>
              </Card>

              <Card title="思维导图设置" style={{ marginBottom: '16px' }}>
                <Form.Item label="生成提示词" name="mindmap_prompt" help="用于 LLM 生成思维导图的提示词模板">
                  <TextArea rows={8} placeholder={`请根据以下视频内容，生成一个清晰、结构化的思维导图（Markdown 格式）：

要求：
1. 提取视频的主要主题作为根节点（一级标题，使用 #）
2. 识别2-5个核心分支作为二级标题（使用 ##）
3. 每个分支下列出2-4个关键要点作为三级标题（使用 ###）
4. 使用中文输出
5. 保持层次清晰，逻辑连贯`} />
                </Form.Item>
              </Card>

              <Form.Item>
                <Button type="primary" onClick={handleSaveConfig} loading={configLoading}>保存配置</Button>
              </Form.Item>
            </Form>
          </TabPane>
        </Tabs>
      </Card>

      {/* 用户编辑弹窗 */}
      <Modal title={editingUser ? '编辑用户' : '新建用户'} open={userModalVisible} onOk={handleUserSubmit} onCancel={() => { setUserModalVisible(false); userForm.resetFields(); setEditingUser(null) }}>
        <Form form={userForm} layout="vertical">
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}><Input placeholder="用户名" /></Form.Item>
          {!editingUser && <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}><Input.Password placeholder="密码" /></Form.Item>}
          {editingUser && <Form.Item label="新密码" name="password" help="留空则不修改密码"><Input.Password placeholder="留空则不修改" /></Form.Item>}
          <Form.Item label="邮箱" name="email" rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}><Input placeholder="邮箱（可选）" /></Form.Item>
          <Form.Item label="管理员权限" name="is_admin" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item label="账号状态" name="is_active" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>

      {/* 用户导入弹窗 */}
      <Modal
        title="批量导入用户"
        open={importModalVisible}
        onOk={handleImportUsers}
        onCancel={() => { setImportModalVisible(false); importForm.resetFields() }}
        okText="导入"
        cancelText="取消"
        confirmLoading={importLoading}
      >
        <Form form={importForm} layout="vertical">
          <Form.Item
            label="用户名列表"
            name="usernames"
            rules={[{ required: true, message: '请输入用户名' }]}
            help="每行一个用户名，用户名至少3个字符"
          >
            <Input.TextArea
              rows={10}
              placeholder={`请输入用户名，每行一个，例如：\nuser001\nuser002\nuser003`}
            />
          </Form.Item>
          <Form.Item
            label="默认密码"
            name="defaultPassword"
            initialValue="123456"
            help="所有导入用户的初始密码，默认为 123456"
          >
            <Input.Password placeholder="默认密码" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 文件夹编辑弹窗 */}
      <Modal
        title={editingFolder ? '重命名文件夹' : (selectedParentId ? '新建子文件夹' : '新建根文件夹')}
        open={folderModalVisible}
        onOk={handleFolderSubmit}
        onCancel={() => { setFolderModalVisible(false); folderForm.resetFields(); setEditingFolder(null); setSelectedParentId(null) }}
        okText={editingFolder ? '保存' : '创建'}
        cancelText="取消"
      >
        <Form form={folderForm} layout="vertical">
          {!editingFolder && selectedParentId && (
            <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4 }}>
              <strong>父文件夹:</strong> {getFolderPath(selectedParentId)}
            </div>
          )}
          <Form.Item
            label="文件夹名称"
            name="name"
            rules={[
              { required: true, message: '请输入文件夹名称' },
              { max: 100, message: '文件夹名称最多100个字符' }
            ]}
          >
            <Input placeholder="请输入文件夹名称" />
          </Form.Item>
          {!editingFolder && !selectedParentId && (
            <Form.Item label="父文件夹（可选）">
              <Select
                value={selectedParentId}
                onChange={setSelectedParentId}
                allowClear
                placeholder="选择父文件夹（留空则创建根文件夹）"
              >
                {folders.map(folder => (
                  <Select.Option key={folder.folder_id} value={folder.folder_id}>
                    {getFolderPath(folder.folder_id)}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          {editingFolder && (
            <div style={{ color: '#999', fontSize: 12 }}>
              当前文件夹包含 {editingFolder.video_count || 0} 个视频
              {editingFolder.parent_id && (
                <span>，位于「{getFolderPath(editingFolder.parent_id)}」下</span>
              )}
            </div>
          )}
        </Form>
      </Modal>

      {/* 移动文件夹弹窗 */}
      <Modal
        title="移动到文件夹"
        open={moveModalVisible}
        onOk={handleMoveVideo}
        onCancel={() => { setMoveModalVisible(false); setMovingVideo(null) }}
        okText="确定移动"
        cancelText="取消"
      >
        {movingVideo && (
          <div>
            <p style={{ marginBottom: 16 }}>
              <strong>视频:</strong> {movingVideo.video_title}
            </p>
            <p style={{ marginBottom: 8 }}>
              <strong>当前文件夹:</strong> <Tag color="blue">{movingVideo.folder || '未分类'}</Tag>
            </p>
            <div style={{ marginTop: 16 }}>
              <p style={{ marginBottom: 8 }}><strong>选择目标文件夹:</strong></p>
              <Select
                style={{ width: '100%' }}
                value={selectedFolderId}
                onChange={setSelectedFolderId}
                allowClear
                placeholder="选择文件夹（留空则移动到未分类）"
              >
                <Select.Option value={null}>未分类</Select.Option>
                {folders.map(folder => (
                  <Select.Option key={folder.folder_id} value={folder.folder_id}>
                    {folder.name} ({folder.video_count} 个视频)
                  </Select.Option>
                ))}
              </Select>
            </div>
          </div>
        )}
      </Modal>

      {/* 视频详情/思维导图抽屉 */}
      <Drawer
        title={selectedVideo?.video_title || '视频详情'}
        width={800}
        open={videoDetailVisible}
        onClose={() => { setVideoDetailVisible(false); setSelectedVideo(null); setMindmapContent(''); setMindmapEditing(false) }}
      >
        {selectedVideo && (
          <div>
            <Card title="视频信息" size="small" style={{ marginBottom: '16px' }}>
              <p><strong>视频ID:</strong> {selectedVideo.video_id}</p>
              <p><strong>标题:</strong> {selectedVideo.video_title}</p>
              <p><strong>文件夹:</strong> {selectedVideo.folder || '未分类'}</p>
              <p><strong>分句数:</strong> {selectedVideo.total_segments}</p>
              <p><strong>语言:</strong> {selectedVideo.language}</p>
              <p><strong>点击次数:</strong> {selectedVideo.view_count || 0}</p>
            </Card>

            <Card
              title="思维导图"
              size="small"
              loading={mindmapLoading}
              extra={
                <Space>
                  {mindmapContent ? (
                    <>
                      <Button size="small" onClick={() => setMindmapEditing(!mindmapEditing)}>
                        {mindmapEditing ? '预览' : '编辑'}
                      </Button>
                      <Popconfirm title="确定重新生成？这将覆盖现有内容" onConfirm={() => handleGenerateMindmap(true)}>
                        <Button size="small" icon={<ReloadOutlined />}>重新生成</Button>
                      </Popconfirm>
                      <Popconfirm title="确定删除思维导图？" onConfirm={handleDeleteMindmap}>
                        <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                      </Popconfirm>
                    </>
                  ) : (
                    <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => handleGenerateMindmap(false)}>生成思维导图</Button>
                  )}
                </Space>
              }
            >
              {mindmapContent ? (
                mindmapEditing ? (
                  <div>
                    <TextArea
                      value={mindmapContent}
                      onChange={(e) => setMindmapContent(e.target.value)}
                      rows={20}
                      style={{ fontFamily: 'monospace', marginBottom: 12 }}
                    />
                    <Button type="primary" onClick={handleSaveMindmap}>保存修改</Button>
                  </div>
                ) : (
                  <div style={{ height: '500px', border: '1px solid #f0f0f0', borderRadius: 4 }}>
                    <MindMapViewer
                      markdown={mindmapContent}
                      loading={false}
                      error={null}
                    />
                  </div>
                )
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  暂无思维导图，点击"生成思维导图"按钮创建
                </div>
              )}
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  )
}
