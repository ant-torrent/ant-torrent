import { LockOutlined } from '@ant-design/icons'
import { App, Button, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuthStore } from '@/stores/authStore'

interface PasswordDraft {
  currentPassword: string
  newPassword: string
  confirm: string
}

/**
 * 账号 tab：展示当前用户名，修改密码（需验证当前密码）。
 * 修改成功后其他设备会话全部失效、当前浏览器保持登录（后端重发 cookie）。
 */
export default function AccountTab() {
  const { t } = useTranslation()
  const tt = (k: string) => t(`settings.app.account.${k}`)
  const { message } = App.useApp()
  const username = useAuthStore((s) => s.username)
  const changePassword = useAuthStore((s) => s.changePassword)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<PasswordDraft>()

  const handleFinish = async (values: PasswordDraft) => {
    if (values.currentPassword === values.newPassword) {
      message.warning(tt('passwordSameAsOld'))
      return
    }
    setSaving(true)
    const ok = await changePassword(values.currentPassword, values.newPassword)
    setSaving(false)
    if (ok) {
      message.success(t('auth.changePasswordSuccess'))
      form.resetFields()
    } else {
      // 后端 401（原密码错误/会话失效）已返回本地化文案；此处用通用兜底
      message.error(t('common.saveFailed'))
    }
  }

  return (
    // horizontal 布局下 labelAlign 默认即 right，但需固定 label 列宽（labelCol）才会生效——
    // 不设置时每行 label 列收缩到文字宽度，右对齐无从体现、控件起始位置也参差
    <Form<PasswordDraft>
      form={form}
      onFinish={handleFinish}
      requiredMark={false}
      layout="horizontal"
      labelCol={{ span: 4 }}
      wrapperCol={{ span: 20 }}
    >
      <Form.Item label={tt('username')}>
        <Typography.Text>{username ?? '-'}</Typography.Text>
      </Form.Item>

      <Form.Item
        name="currentPassword"
        label={tt('currentPassword')}
        rules={[{ required: true, message: tt('passwordRequired') }]}
      >
        <Input.Password
          prefix={<LockOutlined />}
          placeholder={tt('currentPassword')}
          autoComplete="current-password"
          style={{ width: 400 }}
        />
      </Form.Item>
      <Form.Item
        name="newPassword"
        label={tt('newPassword')}
        extra={t('auth.changePasswordHint')}
        rules={[
          { required: true, message: tt('passwordRequired') },
          { min: 8, message: t('auth.passwordTooShort') },
        ]}
      >
        <Input.Password
          prefix={<LockOutlined />}
          placeholder={t('auth.passwordPlaceholder')}
          autoComplete="new-password"
          style={{ width: 400 }}
        />
      </Form.Item>
      <Form.Item
        name="confirm"
        label={t('auth.confirmPassword')}
        dependencies={['newPassword']}
        rules={[
          { required: true, message: tt('passwordRequired') },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue('newPassword') === value) return Promise.resolve()
              return Promise.reject(new Error(t('auth.passwordMismatch')))
            },
          }),
        ]}
      >
        <Input.Password
          prefix={<LockOutlined />}
          placeholder={t('auth.confirmPassword')}
          autoComplete="new-password"
          style={{ width: 400 }}
        />
      </Form.Item>
      <Form.Item label=" " colon={false} style={{ marginTop: 16 }}>
        <Button type="primary" htmlType="submit" loading={saving}>
          {t('auth.changePassword')}
        </Button>
      </Form.Item>
    </Form>
  )
}
