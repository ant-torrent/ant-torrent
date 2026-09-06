import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { App, Button, Card, Flex, Form, Input, Space, Typography } from 'antd'
import { Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import LangSwitch from '@/layouts/LangSwitch'
import ThemeSwitch from '@/layouts/ThemeSwitch'
import { useAuthStore } from '@/stores/authStore'

interface SetupForm {
  username: string
  password: string
  confirm: string
}

/**
 * 首次启动初始化引导：设置管理员账号密码。
 * 成功后 authStore 切到 authenticated，本页重定向、RequireAuth 自动放行。
 */
export default function SetupPage() {
  const { t } = useTranslation()
  const tt = (k: string) => t(`auth.${k}`)
  const { message } = App.useApp()
  const status = useAuthStore((s) => s.status)
  const setup = useAuthStore((s) => s.setup)
  const [submitting, setSubmitting] = useState(false)

  // 已完成设置（含设置成功瞬间）→ 离开引导页
  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />
  }

  const handleFinish = async (values: SetupForm) => {
    if (values.password !== values.confirm) {
      message.warning(tt('passwordMismatch'))
      return
    }
    if (values.password.length < 8) {
      message.warning(tt('passwordTooShort'))
      return
    }
    setSubmitting(true)
    const ok = await setup(values.username.trim(), values.password)
    setSubmitting(false)
    if (!ok) {
      message.error(tt('setupFailed'))
    }
  }

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 24, position: 'relative' }}>
      {/* 引导页不套 AppLayout（无顶栏），右上角提供语言/主题切换 */}
      <Space size={12} style={{ position: 'absolute', top: 16, right: 24 }}>
        <LangSwitch />
        <ThemeSwitch />
      </Space>
      <Card style={{ width: 400 }}>
        <Typography.Title level={4} style={{ textAlign: 'center', marginBottom: 4 }}>
          {tt('setupTitle')}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: 24 }}>
          {tt('setupSubtitle')}
        </Typography.Paragraph>
        <Form<SetupForm> layout="vertical" onFinish={handleFinish} requiredMark={false}>
          <Form.Item
            name="username"
            rules={[{ required: true, message: tt('usernameRequired') }]}
          >
            <Input size="large" prefix={<UserOutlined />} placeholder={tt('username')} autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: tt('passwordRequired') },
              { min: 8, message: tt('passwordTooShort') },
            ]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder={tt('passwordPlaceholder')}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            name="confirm"
            dependencies={['password']}
            rules={[
              { required: true, message: tt('passwordRequired') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve()
                  return Promise.reject(new Error(tt('passwordMismatch')))
                },
              }),
            ]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder={tt('confirmPassword')}
              autoComplete="new-password"
            />
          </Form.Item>
          <Button type="primary" size="large" htmlType="submit" block loading={submitting}>
            {tt('setupSubmit')}
          </Button>
        </Form>
      </Card>
    </Flex>
  )
}
