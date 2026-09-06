import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Divider, Form, Input, App, Popconfirm, Space, Typography } from 'antd'
import { ApiOutlined, CopyOutlined, SaveOutlined, SyncOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { copyText } from '@/utils/misc'
import { qbtApi, serverApi, type AgentStatus } from '@/services/api/client'
import { trApi } from '@/services/api/transmission'
import { downloaderType } from '@/services/downloaders'

const { Text } = Typography

interface Props {
  serverId: string
}

interface ConnDraft {
  name: string
  url: string
  username: string
  password: string
}

/** AntTorrent 侧的服务器连接配置：本地草稿编辑，点保存才写入（appStore + Go 后端） */
export default function ServerConnectionTab({ serverId }: Props) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const tt = (k: string) => t(`server.${k}`)
  const ta = (k: string) => t(`server.agent.${k}`)
  const server = useAppStore((s) => s.servers.find((srv) => srv.id === serverId))
  const updateServer = useAppStore((s) => s.updateServer)
  const loadServers = useAppStore((s) => s.loadServers)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [webApiVersion, setWebApiVersion] = useState('')
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  /** 版本信息只读展示：加载失败显示 '-'（不弹错误，连接问题由测试连接暴露）。
   *  Transmission 走 tr/session（无 qB 代理端点可打） */
  const loadVersions = useCallback(async () => {
    if (server && downloaderType(server.type) === 'transmission') {
      const session = await trApi.getSession(serverId).catch(() => null)
      setAppVersion(typeof session?.version === 'string' ? session.version : '')
      setWebApiVersion(typeof session?.rpc_version_semver === 'string' ? session.rpc_version_semver : '')
      return
    }
    const [ver, apiVer] = await Promise.all([
      qbtApi.getVersion(serverId).catch(() => ''),
      qbtApi.getWebApiVersion(serverId).catch(() => ''),
    ])
    setAppVersion(ver)
    setWebApiVersion(apiVer)
  }, [serverId, server])

  useEffect(() => {
    void loadVersions()
  }, [loadVersions])

  /** agent 在线状态（轻量端点，不触发 qB 调用；失败仅置空显示离线） */
  const loadAgentStatus = useCallback(async () => {
    try {
      setAgentStatus(await serverApi.getAgentStatus(serverId))
    } catch {
      setAgentStatus(null)
    }
  }, [serverId])

  useEffect(() => {
    void loadAgentStatus()
  }, [loadAgentStatus])

  /** agent 配置片段：backendUrl 取当前页面主机名 + 后端端口，用户按需调整 */
  const agentConfigSnippet = JSON.stringify(
    {
      backendUrl: `http://${window.location.hostname}:8080`,
      serverId,
      token: server?.agentToken ?? '',
      allowedDirs: ['/data/downloads'],
    },
    null,
    2,
  )

  const handleCopyConfig = async () => {
    if (await copyText(agentConfigSnippet)) {
      message.success(t('common.copied'))
    } else {
      message.error(t('common.copyFailed'))
    }
  }

  /** 重新生成 token：旧 token 立即失效并断开在线 agent */
  const handleRegenerateToken = async () => {
    setRegenerating(true)
    try {
      await serverApi.regenerateAgentToken(serverId)
      await loadServers() // 拉回新 token 供配置片段展示
      void loadAgentStatus()
      message.success(ta('regenerated'))
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setRegenerating(false)
    }
  }

  // 面板以 serverId 为 key 重挂载，草稿随服务器初始化即可；
  // 保存失败时 store 会回滚，草稿保留用户输入便于修正重试
  const [draft, setDraft] = useState<ConnDraft>(() => ({
    name: server?.name ?? '',
    url: server?.url ?? '',
    username: server?.username ?? '',
    password: server?.password ?? '',
  }))

  if (!server) return null
  const isTransmission = downloaderType(server.type) === 'transmission'

  const handleChange = (field: keyof ConnDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }))
  }

  const validate = (): ConnDraft | null => {
    const next = {
      name: draft.name.trim(),
      url: draft.url.trim(),
      username: draft.username.trim(),
      password: draft.password,
    }
    if (!next.name) {
      message.warning(tt('nameRequired'))
      return null
    }
    if (!next.url) {
      message.warning(tt('urlRequired'))
      return null
    }
    return next
  }

  /** 用当前草稿（未保存也能测）登录验证 */
  const handleTestConnection = async () => {
    const next = validate()
    if (!next) return
    setTesting(true)
    try {
      const result = await serverApi.testConnection(serverId, {
        url: next.url,
        username: next.username,
        password: next.password,
      })
      if (result.success) {
        message.success(tt('testSuccess'))
        // 连接确认可达后刷新版本信息
        void loadVersions()
      } else {
        message.error(`${tt('testFailed')}：${result.message || ''}`)
      }
    } catch {
      message.error(tt('testNetworkError'))
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    const next = validate()
    if (!next) return
    setSaving(true)
    try {
      const ok = await updateServer(serverId, next)
      if (ok) {
        message.success(t('common.saved'))
      } else {
        message.error(t('common.saveFailed'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* 类型创建后只读：类型与 URL 语义绑定（如 /transmission/rpc），中途更改易错配 */}
      <Form.Item
        label={tt('type')}
        extra={isTransmission ? tt('typeReadonlyHint') : undefined}
      >
        <Text>{isTransmission ? t('server.typeTransmission') : t('server.typeQbittorrent')}</Text>
      </Form.Item>

      <Form.Item label={tt('name')}>
        <Input
          value={draft.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder={tt('namePlaceholder')}
        />
      </Form.Item>

      <Form.Item label={tt('url')}>
        <Input
          value={draft.url}
          onChange={(e) => handleChange('url', e.target.value)}
          placeholder={isTransmission ? tt('urlPlaceholderTransmission') : tt('urlPlaceholder')}
        />
      </Form.Item>

      <Form.Item label={tt('username')}>
        <Input
          value={draft.username}
          onChange={(e) => handleChange('username', e.target.value)}
          placeholder={isTransmission ? tt('usernameOptionalPlaceholder') : tt('usernamePlaceholder')}
        />
      </Form.Item>

      <Form.Item label={tt('password')}>
        <Input.Password
          value={draft.password}
          onChange={(e) => handleChange('password', e.target.value)}
          placeholder={tt('passwordPlaceholder')}
        />
      </Form.Item>

      <Form.Item label={tt('appVersion')}>
        <Text copyable={!!appVersion}>{appVersion || '-'}</Text>
      </Form.Item>

      <Form.Item label={tt('webapiVersion')}>
        <Text copyable={!!webApiVersion}>{webApiVersion || '-'}</Text>
      </Form.Item>

      <Form.Item label=" " colon={false}>
        <Space>
          <Button icon={<ApiOutlined />} onClick={handleTestConnection} loading={testing}>
            {tt('testConnection')}
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            {t('common.save')}
          </Button>
        </Space>
      </Form.Item>

      <Divider>
        <Text strong>{ta('title')}</Text>
      </Divider>

      <Form.Item label={ta('status')}>
        <Space size={8}>
          {agentStatus?.online ? (
            <Badge
              status="success"
              text={`${ta('statusOnline')}${agentStatus.version ? `（v${agentStatus.version.replace(/^v/, '')}）` : ''}`}
            />
          ) : (
            <Badge status="default" text={ta('statusOffline')} />
          )}
          <Button
            size="small"
            type="text"
            icon={<SyncOutlined />}
            onClick={() => void loadAgentStatus()}
          />
        </Space>
      </Form.Item>

      <Form.Item label={ta('configSnippet')}>
        <div style={{ position: 'relative' }}>
          <Button
            size="small"
            type="text"
            icon={<CopyOutlined />}
            onClick={() => void handleCopyConfig()}
            style={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}
          />
          <pre
            style={{
              margin: 0,
              padding: 12,
              background: 'var(--ant-color-fill-tertiary, rgba(0,0,0,0.04))',
              borderRadius: 6,
              fontSize: 12,
              overflowX: 'auto',
            }}
          >
            {agentConfigSnippet}
          </pre>
        </div>
      </Form.Item>

      <Form.Item label=" " colon={false}>
        <Popconfirm
          title={ta('regenerateConfirm')}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
          onConfirm={() => void handleRegenerateToken()}
        >
          <Button danger loading={regenerating}>
            {ta('regenerate')}
          </Button>
        </Popconfirm>
      </Form.Item>
    </>
  )
}
