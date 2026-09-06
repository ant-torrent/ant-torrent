import { Form, Input, Switch, Typography, Divider } from 'antd'
import { useTranslation } from 'react-i18next'
import { DirPathInput } from '@/components/DirPathInput'
import { useActiveServerId } from '../ServerIdContext'

const { Text } = Typography

export default function DownloadsTab() {
  const { t } = useTranslation()
  const tt = (k: string) => t(`settings.qbt.downloads.${k}`)
  const name = (k: string) => ({ name: k })
  const serverId = useActiveServerId()

  return (
    <>
      <Form.Item label={tt('savePath')} {...name('save_path')}>
        <DirPathInput serverId={serverId} />
      </Form.Item>

      <Form.Item label={tt('tempPathEnabled')} {...name('temp_path_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.temp_path_enabled !== c.temp_path_enabled}>
        {({ getFieldValue }) => (
          <Form.Item label={tt('tempPath')} {...name('temp_path')} style={{ marginLeft: 24 }}>
            <DirPathInput serverId={serverId} disabled={!getFieldValue('temp_path_enabled')} />
          </Form.Item>
        )}
      </Form.Item>

      <Form.Item label={tt('exportDir')} {...name('export_dir')}>
        <DirPathInput serverId={serverId} />
      </Form.Item>

      <Form.Item label={tt('exportDirFin')} {...name('export_dir_fin')}>
        <DirPathInput serverId={serverId} />
      </Form.Item>

      {/* scan_dirs 为 qB 字典型多路径配置（usePreferencesForm 负责文本互转），不适合目录选择器 */}
      <Form.Item label={tt('scanDirs')} {...name('scan_dirs')} extra={tt('scanDirsHint')}>
        <Input.TextArea rows={2} placeholder={'/data/watch\n/data/watch2: /data/downloads'} />
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('mailTitle')}</Text>
      <Divider />

      <Form.Item label={tt('mailEnabled')} {...name('mail_notification_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.mail_notification_enabled !== c.mail_notification_enabled}>
        {({ getFieldValue }) => {
          const enabled = getFieldValue('mail_notification_enabled')
          return (
            <>
              <Form.Item label={tt('mailEmail')} {...name('mail_notification_email')} style={{ marginLeft: 24 }}>
                <Input disabled={!enabled} />
              </Form.Item>
              <Form.Item label={tt('mailSmtp')} {...name('mail_notification_smtp')} style={{ marginLeft: 24 }}>
                <Input disabled={!enabled} />
              </Form.Item>
              <Form.Item label={tt('mailSsl')} {...name('mail_notification_ssl_enabled')} valuePropName="checked" style={{ marginLeft: 24 }}>
                <Switch disabled={!enabled} />
              </Form.Item>
              <Form.Item label={tt('mailAuth')} {...name('mail_notification_auth_enabled')} valuePropName="checked" style={{ marginLeft: 24 }}>
                <Switch disabled={!enabled} />
              </Form.Item>
              <Form.Item label={tt('mailUsername')} {...name('mail_notification_username')} style={{ marginLeft: 24 }}>
                <Input disabled={!enabled} />
              </Form.Item>
              <Form.Item label={tt('mailPassword')} {...name('mail_notification_password')} style={{ marginLeft: 24 }}>
                <Input.Password disabled={!enabled} />
              </Form.Item>
            </>
          )
        }}
      </Form.Item>
    </>
  )
}
