import { useState } from 'react'
import { Form, Input, Button, Card, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { userLogin } from '../services/api'

interface LoginPageProps {
  onLoginSuccess: (token: string, userInfo: any) => void
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const result = await userLogin(values.username, values.password)

      // 保存 token 到 localStorage
      localStorage.setItem('auth_token', result.access_token)
      localStorage.setItem('user_info', JSON.stringify({
        id: result.user_id,
        username: result.username,
        is_admin: result.is_admin
      }))

      message.success('登录成功')
      onLoginSuccess(result.access_token, {
        id: result.user_id,
        username: result.username,
        is_admin: result.is_admin
      })
    } catch (error: any) {
      message.error(error.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card
        title={
          <div style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}>
            HearSight 管理后台
          </div>
        }
        style={{ width: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
      >
        <Form
          form={form}
          name="login"
          onFinish={handleSubmit}
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{ height: '40px' }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', color: '#999', fontSize: '12px' }}>
          <p>默认管理员账号：admin / admin123</p>
        </div>
      </Card>
    </div>
  )
}
