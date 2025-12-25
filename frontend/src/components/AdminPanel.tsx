import { useState, useEffect } from 'react'
import { Tabs, Card, Table, Button, Space, Modal, Form, Input, Switch, message, Statistic, Row, Col, Popconfirm, Tag } from 'antd'
import { UserOutlined, VideoCameraOutlined, DashboardOutlined, EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

const { TabPane } = Tabs

// API 服务
const API_BASE = import.meta.env.VITE_API_BASE || ''

// 获取 token
const getToken = () => localStorage.getItem('auth_token')

// 获取系统统计
const fetchSystemStats = async () => {
  const token = getToken()
  const res = await fetch(`${API_BASE}/api/admin-panel/stats`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  if (!res.ok) throw new Error('获取统计数据失败')
  return res.json()
}

// 用户管理 API
const fetchUsers = async (page: number, pageSize: number, search?: string) => {
  const token = getToken()
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    ...(search && { search })
  })
  const res = await fetch(`${API_BASE}/api/admin-panel/users?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  if (!res.ok) throw new Error('获取用户列表失败')
  return res.json()
}

const createUser = async (data: any) => {
  const token = getToken()
  const res = await fetch(`${API_BASE}/api/admin-panel/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || '创建用户失败')
  }
  return res.json()
}

const updateUser = async (userId: number, data: any) => {
  const token = getToken()
  const res = await fetch(`${API_BASE}/api/admin-panel/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || '更新用户失败')
  }
  return res.json()
}

const deleteUser = async (userId: number) => {
  const token = getToken()
  const res = await fetch(`${API_BASE}/api/admin-panel/users/${userId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || '删除用户失败')
  }
  return res.json()
}

// 视频管理 API
const fetchVideos = async (page: number, pageSize: number, search?: string) => {
  const token = getToken()
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    ...(search && { search })
  })
  const res = await fetch(`${API_BASE}/api/admin-panel/videos?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  if (!res.ok) throw new Error('获取视频列表失败')
  return res.json()
}

const deleteVideo = async (videoId: number) => {
  const token = getToken()
  const res = await fetch(`${API_BASE}/api/admin-panel/videos/${videoId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  if (!res.ok) throw new Error('删除视频失败')
  return res.json()
}

interface AdminPanelProps {
  onClose: () => void
}

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState('stats')
  const [stats, setStats] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [userTotal, setUserTotal] = useState(0)
  const [userPage, setUserPage] = useState(1)
  const [userPageSize] = useState(10)
  const [userSearch, setUserSearch] = useState('')
  const [userLoading, setUserLoading] = useState(false)

  const [videos, setVideos] = useState<any[]>([])
  const [videoTotal, setVideoTotal] = useState(0)
  const [videoPage, setVideoPage] = useState(1)
  const [videoPageSize] = useState(10)
  const [videoSearch, setVideoSearch] = useState('')
  const [videoLoading, setVideoLoading] = useState(false)

  const [userModalVisible, setUserModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [userForm] = Form.useForm()

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
      const data = await fetchVideos(videoPage, videoPageSize, videoSearch || undefined)
      setVideos(data.videos)
      setVideoTotal(data.total)
    } catch (error: any) {
      message.error(error.message)
    } finally {
      setVideoLoading(false)
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
    }
  }, [activeTab, userPage, videoPage, userSearch, videoSearch])

  // 用户表格列
  const userColumns: ColumnsType<any> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '角色',
      dataIndex: 'is_admin',
      key: 'is_admin',
      render: (isAdmin: boolean) => (
        <Tag color={isAdmin ? 'red' : 'blue'}>{isAdmin ? '管理员' : '普通用户'}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>{isActive ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '最后登录',
      dataIndex: 'last_login',
      key: 'last_login',
      render: (time: string) => time ? new Date(time).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: any, record: any) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingUser(record)
              userForm.setFieldsValue({
                username: record.username,
                email: record.email,
                is_admin: record.is_admin,
                is_active: record.is_active,
              })
              setUserModalVisible(true)
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该用户？"
            onConfirm={async () => {
              try {
                await deleteUser(record.id)
                message.success('删除成功')
                loadUsers()
              } catch (error: any) {
                message.error(error.message)
              }
            }}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 视频表格列
  const videoColumns: ColumnsType<any> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '视频路径',
      dataIndex: 'media_path',
      key: 'media_path',
      ellipsis: true,
    },
    {
      title: '分句数',
      dataIndex: 'segment_count',
      key: 'segment_count',
    },
    {
      title: '是否有摘要',
      dataIndex: 'has_summary',
      key: 'has_summary',
      render: (hasSummary: boolean) => (
        <Tag color={hasSummary ? 'green' : 'default'}>{hasSummary ? '是' : '否'}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: any) => (
        <Popconfirm
          title="确认删除该视频？"
          description="删除后将无法恢复，相关的摘要数据也会被删除"
          onConfirm={async () => {
            try {
              await deleteVideo(record.id)
              message.success('删除成功')
              loadVideos()
              loadStats() // 更新统计数据
            } catch (error: any) {
              message.error(error.message)
            }
          }}
        >
          <Button size="small" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ]

  // 处理用户表单提交
  const handleUserSubmit = async () => {
    try {
      const values = await userForm.validateFields()
      if (editingUser) {
        // 编辑用户
        await updateUser(editingUser.id, values)
        message.success('更新成功')
      } else {
        // 创建用户
        await createUser(values)
        message.success('创建成功')
      }
      setUserModalVisible(false)
      userForm.resetFields()
      setEditingUser(null)
      loadUsers()
      loadStats() // 更新统计数据
    } catch (error: any) {
      if (error.errorFields) {
        // 表单验证错误
        return
      }
      message.error(error.message)
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <Card
        title={<span style={{ fontSize: '20px', fontWeight: 'bold' }}>管理后台</span>}
        extra={
          <Button onClick={onClose}>返回</Button>
        }
      >
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          {/* 系统统计 */}
          <TabPane
            tab={
              <span>
                <DashboardOutlined />
                系统概览
              </span>
            }
            key="stats"
          >
            {stats && (
              <div>
                <h3>用户统计</h3>
                <Row gutter={16} style={{ marginBottom: '24px' }}>
                  <Col span={6}>
                    <Card>
                      <Statistic title="总用户数" value={stats.total_users} prefix={<UserOutlined />} />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card>
                      <Statistic title="活跃用户" value={stats.active_users} valueStyle={{ color: '#3f8600' }} />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card>
                      <Statistic title="管理员数" value={stats.admin_users} valueStyle={{ color: '#cf1322' }} />
                    </Card>
                  </Col>
                </Row>

                <h3>视频统计</h3>
                <Row gutter={16} style={{ marginBottom: '24px' }}>
                  <Col span={6}>
                    <Card>
                      <Statistic title="总视频数" value={stats.total_videos} prefix={<VideoCameraOutlined />} />
                    </Card>
                  </Col>
                </Row>

                <h3>任务统计</h3>
                <Row gutter={16}>
                  <Col span={6}>
                    <Card>
                      <Statistic title="总任务数" value={stats.total_jobs} />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card>
                      <Statistic title="待处理任务" value={stats.pending_jobs} valueStyle={{ color: '#1890ff' }} />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card>
                      <Statistic title="失败任务" value={stats.failed_jobs} valueStyle={{ color: '#cf1322' }} />
                    </Card>
                  </Col>
                </Row>
              </div>
            )}
          </TabPane>

          {/* 用户管理 */}
          <TabPane
            tab={
              <span>
                <UserOutlined />
                用户管理
              </span>
            }
            key="users"
          >
            <Space style={{ marginBottom: '16px' }}>
              <Input.Search
                placeholder="搜索用户名或邮箱"
                onSearch={setUserSearch}
                style={{ width: 300 }}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingUser(null)
                  userForm.resetFields()
                  setUserModalVisible(true)
                }}
              >
                新建用户
              </Button>
            </Space>

            <Table
              columns={userColumns}
              dataSource={users}
              rowKey="id"
              loading={userLoading}
              pagination={{
                current: userPage,
                pageSize: userPageSize,
                total: userTotal,
                onChange: setUserPage,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 个用户`,
              }}
            />
          </TabPane>

          {/* 视频管理 */}
          <TabPane
            tab={
              <span>
                <VideoCameraOutlined />
                视频管理
              </span>
            }
            key="videos"
          >
            <Space style={{ marginBottom: '16px' }}>
              <Input.Search
                placeholder="搜索视频路径"
                onSearch={setVideoSearch}
                style={{ width: 300 }}
              />
            </Space>

            <Table
              columns={videoColumns}
              dataSource={videos}
              rowKey="id"
              loading={videoLoading}
              pagination={{
                current: videoPage,
                pageSize: videoPageSize,
                total: videoTotal,
                onChange: setVideoPage,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 个视频`,
              }}
            />
          </TabPane>
        </Tabs>
      </Card>

      {/* 用户编辑弹窗 */}
      <Modal
        title={editingUser ? '编辑用户' : '新建用户'}
        open={userModalVisible}
        onOk={handleUserSubmit}
        onCancel={() => {
          setUserModalVisible(false)
          userForm.resetFields()
          setEditingUser(null)
        }}
      >
        <Form form={userForm} layout="vertical">
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="用户名" />
          </Form.Item>

          {!editingUser && (
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password placeholder="密码" />
            </Form.Item>
          )}

          {editingUser && (
            <Form.Item
              label="新密码"
              name="password"
              help="留空则不修改密码"
            >
              <Input.Password placeholder="留空则不修改" />
            </Form.Item>
          )}

          <Form.Item
            label="邮箱"
            name="email"
            rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
          >
            <Input placeholder="邮箱（可选）" />
          </Form.Item>

          <Form.Item label="管理员权限" name="is_admin" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="账号状态" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
