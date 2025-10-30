import { useState, useEffect } from 'react'
import { Modal, Form, Input, Button, Tabs, App } from 'antd'
import { LockOutlined, SettingOutlined } from '@ant-design/icons'
import { adminLogin, getAdminConfigs, updateAdminConfig } from '../services/api'

const { TextArea } = Input

interface AdminSettingsProps {
  visible: boolean
  onClose: () => void
}

export default function AdminSettings({ visible, onClose }: AdminSettingsProps) {
  const { message } = App.useApp()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [adminToken, setAdminToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [configs, setConfigs] = useState<Record<string, string>>({})
  const [loginForm] = Form.useForm()
  const [configForm] = Form.useForm()

  // 检查本地存储的 token
  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      setAdminToken(token)
      loadConfigs(token)
    }
  }, [])

  // 登录
  const handleLogin = async (values: { password: string }) => {
    setLoading(true)
    try {
      const result = await adminLogin(values.password)
      setAdminToken(result.token)
      localStorage.setItem('admin_token', result.token)
      setIsLoggedIn(true)
      message.success('登录成功')
      await loadConfigs(result.token)
    } catch (error: any) {
      message.error(error.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  // 加载配置
  const loadConfigs = async (token: string) => {
    setLoading(true)
    try {
      const result = await getAdminConfigs(token)
      setConfigs(result.configs)
      setIsLoggedIn(true)
      // 设置表单初始值
      configForm.setFieldsValue({
        system_prompt: result.configs.system_prompt || '',
        site_title: result.configs.site_title || '',
        admin_password: result.configs.admin_password || ''
      })
    } catch (error: any) {
      message.error(error.message || '加载配置失败')
      // 如果token无效，清除登录状态
      setIsLoggedIn(false)
      localStorage.removeItem('admin_token')
    } finally {
      setLoading(false)
    }
  }

  // 保存配置
  const handleSaveConfig = async (values: any) => {
    setLoading(true)
    try {
      // 更新所有修改的配置
      for (const [key, value] of Object.entries(values)) {
        if (value !== configs[key]) {
          await updateAdminConfig(adminToken, key, value as string)
        }
      }
      message.success('配置已更新')
      await loadConfigs(adminToken)

      // 如果修改了网站标题，触发重新加载
      if (values.site_title !== configs.site_title) {
        window.location.reload()
      }
    } catch (error: any) {
      message.error(error.message || '更新配置失败')
    } finally {
      setLoading(false)
    }
  }

  // 退出登录
  const handleLogout = () => {
    setIsLoggedIn(false)
    setAdminToken('')
    localStorage.removeItem('admin_token')
    message.success('已退出')
    onClose()
  }

  return (
    <Modal
      title={<span><SettingOutlined /> 管理员设置</span>}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      {!isLoggedIn ? (
        // 登录表单
        <Form
          form={loginForm}
          onFinish={handleLogin}
          layout="vertical"
        >
          <Form.Item
            label="管理员密码"
            name="password"
            rules={[{ required: true, message: '请输入管理员密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入管理员密码"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
      ) : (
        // 配置编辑表单
        <div>
          <Tabs
            items={[
              {
                key: 'basic',
                label: '基本设置',
                children: (
                  <Form
                    form={configForm}
                    onFinish={handleSaveConfig}
                    layout="vertical"
                  >
                    <Form.Item
                      label="网站标题"
                      name="site_title"
                      tooltip="显示在浏览器标签和页面顶部的标题"
                    >
                      <Input placeholder="例如: HearSight - AI 视频智能分析" />
                    </Form.Item>

                    <Form.Item
                      label="系统提示词"
                      name="system_prompt"
                      tooltip="AI对话时使用的系统提示词，决定了AI的回答风格"
                    >
                      <TextArea
                        rows={8}
                        placeholder="请输入系统提示词..."
                      />
                    </Form.Item>

                    <Form.Item
                      label="管理员密码"
                      name="admin_password"
                      tooltip="修改后需要重新登录"
                    >
                      <Input.Password placeholder="留空则不修改" />
                    </Form.Item>

                    <Form.Item>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button type="primary" htmlType="submit" loading={loading}>
                          保存配置
                        </Button>
                        <Button onClick={handleLogout}>
                          退出登录
                        </Button>
                      </div>
                    </Form.Item>
                  </Form>
                )
              }
            ]}
          />
        </div>
      )}
    </Modal>
  )
}
