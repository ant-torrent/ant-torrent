import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { App, Button, Card, Flex, Form, Input, Space, Typography } from 'antd'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import LangSwitch from '@/layouts/LangSwitch'
import ThemeSwitch from '@/layouts/ThemeSwitch'
import { useAuthStore } from '@/stores/authStore'

interface LoginForm {
  username: string
  password: string
}

/** 登录页（顶层路由，不套 AppLayout）。已登录时跳回来源页或仪表盘。 */
export default function LoginPage() {
  const { t } = useTranslation()
  const tt = (k: string) => t(`auth.${k}`)
  const { message } = App.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const status = useAuthStore((s) => s.status)
  const login = useAuthStore((s) => s.login)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'setup') {
    // 尚未初始化账号：登录无意义，直接进引导页
    return <Navigate to="/setup" replace />
  }
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' ? from : '/dashboard'} replace />
  }

  const handleFinish = async (values: LoginForm) => {
    setSubmitting(true)
    const ok = await login(values.username.trim(), values.password)
    setSubmitting(false)
    if (ok) {
      message.success(tt('loginSuccess'))
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true })
    } else {
      // 后端已返回本地化错误文案；此处仅在请求层异常时兜底
      message.error(tt('invalidCredentials'))
    }
  }

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 24, position: 'relative' }}>
      {/* 登录页不套 AppLayout（无顶栏），右上角提供语言/主题切换 */}
      <Space size={12} style={{ position: 'absolute', top: 16, right: 24 }}>
        <LangSwitch />
        <ThemeSwitch />
      </Space>
      <Card style={{ width: 360 }}>
        <Typography.Title level={4} style={{ textAlign: 'center', marginBottom: 4 }}>
          {tt('title')}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: 24 }}>
          {tt('sessionHint')}
        </Typography.Paragraph>
        <Form<LoginForm> layout="vertical" onFinish={handleFinish} requiredMark={false}>
          <Form.Item
            name="username"
            rules={[{ required: true, message: tt('usernameRequired') }]}
          >
            <Input size="large" prefix={<UserOutlined />} placeholder={tt('username')} autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: tt('passwordRequired') }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder={tt('password')}
              autoComplete="current-password"
            />
          </Form.Item>
          <Button type="primary" size="large" htmlType="submit" block loading={submitting}>
            {submitting ? tt('loggingIn') : tt('login')}
          </Button>
        </Form>
      </Card>
    </Flex>
  )
}
