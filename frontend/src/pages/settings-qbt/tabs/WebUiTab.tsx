import { Form, Input, InputNumber, Switch, Typography, Divider } from 'antd'
import { useTranslation } from 'react-i18next'
import { DirPathInput } from '@/components/DirPathInput'
import { useActiveServerId } from '../ServerIdContext'

const { Text } = Typography

export default function WebUiTab() {
  const { t } = useTranslation()
  const tt = (k: string) => t(`settings.qbt.webui.${k}`)
  const name = (k: string) => ({ name: k })
  const serverId = useActiveServerId()

  return (
    <>
      <Text strong>{tt('addressTitle')}</Text>
      <Divider />

      <Form.Item label={tt('domainList')} {...name('web_ui_domain_list')}>
        <Input.TextArea rows={2} />
      </Form.Item>

      <Form.Item label={tt('address')} {...name('web_ui_address')}>
        <Input />
      </Form.Item>

      <Form.Item label={tt('port')} {...name('web_ui_port')} rules={[{ type: 'number', min: 1, max: 65535 }]}>
        <InputNumber min={1} max={65535} />
      </Form.Item>

      <Form.Item label={tt('upnp')} {...name('web_ui_upnp')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('authTitle')}</Text>
      <Divider />

      <Form.Item label={tt('username')} {...name('web_ui_username')}>
        <Input />
      </Form.Item>

      <Form.Item label={tt('password')} {...name('web_ui_password')}>
        <Input.Password />
      </Form.Item>

      <Form.Item label={tt('maxAuthFailCount')} {...name('web_ui_max_auth_fail_count')} rules={[{ type: 'number', min: 1 }]}>
        <InputNumber min={1} />
      </Form.Item>

      <Form.Item label={tt('banDuration')} {...name('web_ui_ban_duration')} rules={[{ type: 'number', min: 1 }]}>
        <InputNumber min={1} />
      </Form.Item>

      <Form.Item label={tt('sessionTimeout')} {...name('web_ui_session_timeout')} rules={[{ type: 'number', min: 1 }]}>
        <InputNumber min={1} />
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('securityTitle')}</Text>
      <Divider />

      <Form.Item label={tt('csrfProtection')} {...name('web_ui_csrf_protection_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('clickjackingProtection')} {...name('web_ui_clickjacking_protection_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('secureCookie')} {...name('web_ui_secure_cookie_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('hostHeaderValidation')} {...name('web_ui_host_header_validation_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('httpsTitle')}</Text>
      <Divider />

      <Form.Item label={tt('httpsEnabled')} {...name('web_ui_https_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.web_ui_https_enabled !== c.web_ui_https_enabled}>
        {({ getFieldValue }) => (
          <>
            <Form.Item label={tt('httpsCertPath')} {...name('web_ui_https_cert_path')} style={{ marginLeft: 24 }}>
              <Input disabled={!getFieldValue('web_ui_https_enabled')} />
            </Form.Item>
            <Form.Item label={tt('httpsKeyPath')} {...name('web_ui_https_key_path')} style={{ marginLeft: 24 }}>
              <Input disabled={!getFieldValue('web_ui_https_enabled')} />
            </Form.Item>
          </>
        )}
      </Form.Item>

      <Text strong style={{ marginTop: 24, display: 'block' }}>{tt('altUiTitle')}</Text>
      <Divider />

      <Form.Item label={tt('altUiEnabled')} {...name('alternative_webui_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.alternative_webui_enabled !== c.alternative_webui_enabled}>
        {({ getFieldValue }) => (
          <Form.Item label={tt('altUiPath')} {...name('alternative_webui_path')} style={{ marginLeft: 24 }}>
            {/* https cert/key 为文件路径，保持手输 */}
            <DirPathInput serverId={serverId} disabled={!getFieldValue('alternative_webui_enabled')} />
          </Form.Item>
        )}
      </Form.Item>

      <Form.Item label={tt('customHeadersEnabled')} {...name('web_ui_use_custom_http_headers_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.web_ui_use_custom_http_headers_enabled !== c.web_ui_use_custom_http_headers_enabled}>
        {({ getFieldValue }) => (
          <Form.Item label={tt('customHeaders')} {...name('web_ui_custom_http_headers')} style={{ marginLeft: 24 }}>
            <Input.TextArea rows={3} disabled={!getFieldValue('web_ui_use_custom_http_headers_enabled')} />
          </Form.Item>
        )}
      </Form.Item>

      <Form.Item label={tt('bypassLocalAuth')} {...name('bypass_local_auth')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={tt('bypassAuthSubnetEnabled')} {...name('bypass_auth_subnet_whitelist_enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(p, c) => p.bypass_auth_subnet_whitelist_enabled !== c.bypass_auth_subnet_whitelist_enabled}>
        {({ getFieldValue }) => (
          <Form.Item label={tt('bypassAuthSubnet')} {...name('bypass_auth_subnet_whitelist')} style={{ marginLeft: 24 }}>
            <Input.TextArea rows={2} disabled={!getFieldValue('bypass_auth_subnet_whitelist_enabled')} />
          </Form.Item>
        )}
      </Form.Item>
    </>
  )
}
