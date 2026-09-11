import { useCallback, useEffect, useRef, useState } from 'react'
import { App, Badge, Button, Checkbox, Form, Input, Segmented, Select, Space, Spin, Switch, Typography } from 'antd'
import { ApiOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { telegramApi, type TelegramStatus } from '@/services/api/telegram'

const { Text } = Typography

interface TelegramDraft {
  enabled: boolean
  /** 输入的新 token；留空 = 沿用已存（hasKey 时） */
  botToken: string
  clearBotToken: boolean
  /** 白名单编辑态为字符串（Select tags 自由输入），保存时转数字 */
  allowedUserIds: string[]
  proxyUrl: string
  language: 'zh-CN' | 'en-US'
}

/** Telegram bot 设置：本地草稿编辑，点保存才写入 Go 后端（token 只存后端） */
export default function TelegramTab() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const tt = (k: string, opts?: Record<string, string>) => t(`settings.app.telegram.${k}`, opts)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  /** 后端已保存过 token（输入框可留空沿用） */
  const [hasKey, setHasKey] = useState(false)
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [draft, setDraft] = useState<TelegramDraft>({
    enabled: false,
    botToken: '',
    clearBotToken: false,
    allowedUserIds: [],
    proxyUrl: '',
    language: 'zh-CN',
  })
  /** 保存成功后的延迟刷新句柄（bot 异步启动，稍后重取状态） */
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await telegramApi.getConfig()
      setHasKey(cfg.hasKey)
      setStatus(cfg.status ?? null)
      setDraft((prev) => ({
        ...prev,
        enabled: cfg.enabled,
        botToken: '',
        clearBotToken: false,
        allowedUserIds: (cfg.allowedUserIds ?? []).map(String),
        proxyUrl: cfg.proxyUrl,
        language: cfg.language === 'en-US' ? 'en-US' : 'zh-CN',
      }))
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void loadConfig()
    return () => clearTimeout(refreshTimer.current)
  }, [loadConfig])

  const handleChange = <K extends keyof TelegramDraft>(field: K, value: TelegramDraft[K]) => {
    setDraft((prev) => ({ ...prev, [field]: value }))
  }

  /** 白名单输入只保留数字字符（Telegram 用户 ID 恒为正整数） */
  const handleUserIdsChange = (values: string[]) => {
    handleChange('allowedUserIds', values.map((v) => v.replace(/\D/g, '')).filter(Boolean))
  }

  /** 启用时要求 token（已有保存过的 token 时输入框可留空） */
  const validate = (): TelegramDraft | null => {
    const next = {
      ...draft,
      botToken: draft.botToken.trim(),
      proxyUrl: draft.proxyUrl.trim(),
    }
    if (next.enabled && !next.botToken && (!hasKey || next.clearBotToken)) {
      message.warning(tt('tokenRequired'))
      return null
    }
    return next
  }

  const handleSave = async () => {
    const next = validate()
    if (!next) return
    setSaving(true)
    try {
      const saved = await telegramApi.saveConfig({
        enabled: next.enabled,
        botToken: next.botToken,
        // 输入框有新值时以新值为准，忽略"清除"勾选
        clearBotToken: next.clearBotToken && !next.botToken,
        allowedUserIds: next.allowedUserIds.map(Number),
        proxyUrl: next.proxyUrl,
        language: next.language,
      })
      setHasKey(saved.hasKey)
      setStatus(saved.status ?? null)
      setDraft((prev) => ({ ...prev, botToken: '', clearBotToken: false }))
      message.success(t('common.saved'))
      // bot 为异步启动，稍后重取一次状态让徽标反映 running
      clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(async () => {
        try {
          const cfg = await telegramApi.getConfig()
          setStatus(cfg.status ?? null)
        } catch {
          // 状态刷新失败不打扰用户
        }
      }, 2000)
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    const next = validate()
    if (!next) return
    setTesting(true)
    try {
      const res = await telegramApi.test({
        botToken: next.botToken,
        proxyUrl: next.proxyUrl,
      })
      if (res.ok && res.botUsername) {
        message.success(tt('testOk', { name: `@${res.botUsername}` }))
      } else {
        message.error(res.error || tt('testFailed'))
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : tt('testFailed'))
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return <Spin style={{ display: 'block', margin: '48px auto' }} />
  }

  /** 状态徽标：running 绿 / error 红 / stopped 灰 */
  const statusBadge = (() => {
    if (!status) return null
    const color = status.status === 'running' ? 'green' : status.status === 'error' ? 'red' : 'default'
    const label =
      status.status === 'running' ? tt('statusRunning') : status.status === 'error' ? tt('statusError') : tt('statusStopped')
    return (
      <Space size={8} wrap>
        <Badge status={color as 'success' | 'error' | 'default'} text={<Text>{label}</Text>} />
        {status.botUsername && <Text type="secondary">@{status.botUsername}</Text>}
        {status.status === 'error' && status.error && (
          <Text type="danger" style={{ fontSize: 12 }}>{status.error}</Text>
        )}
      </Space>
    )
  })()

  return (
    // component={false}：只借 Form 提供布局上下文（与账号/AI tab 对齐）
    <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }} component={false}>
      <Form.Item label={tt('enable')} extra={tt('enableHint')}>
        <Switch checked={draft.enabled} onChange={(v) => handleChange('enabled', v)} />
      </Form.Item>

      <Form.Item label={tt('token')} extra={hasKey ? tt('tokenSavedHint') : undefined}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Input.Password
            value={draft.botToken}
            onChange={(e) => handleChange('botToken', e.target.value)}
            placeholder={hasKey ? tt('tokenMasked') : tt('tokenPlaceholder')}
            autoComplete="new-password"
          />
          {hasKey && (
            <Checkbox
              checked={draft.clearBotToken}
              onChange={(e) => handleChange('clearBotToken', e.target.checked)}
            >
              {tt('clearToken')}
            </Checkbox>
          )}
        </Space>
      </Form.Item>

      <Form.Item label={tt('allowedUserIds')} extra={tt('allowedUserIdsHint')}>
        <Select
          mode="tags"
          value={draft.allowedUserIds}
          onChange={handleUserIdsChange}
          open={false}
          tokenSeparators={[',', ' ']}
          placeholder={tt('allowedUserIdsPlaceholder')}
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item label={tt('proxyUrl')} extra={tt('proxyUrlHint')}>
        <Input
          value={draft.proxyUrl}
          onChange={(e) => handleChange('proxyUrl', e.target.value)}
          placeholder="socks5://127.0.0.1:1080"
          allowClear
        />
      </Form.Item>

      <Form.Item label={tt('language')}>
        <Segmented
          value={draft.language}
          onChange={(v) => handleChange('language', v as 'zh-CN' | 'en-US')}
          options={[
            { label: t('lang.zh-CN'), value: 'zh-CN' },
            { label: t('lang.en-US'), value: 'en-US' },
          ]}
        />
      </Form.Item>

      <Form.Item label=" " colon={false}>
        <Space>{statusBadge}</Space>
      </Form.Item>

      <Form.Item label=" " colon={false} style={{ marginTop: 16 }}>
        <Space>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            {t('common.save')}
          </Button>
          <Button icon={<ApiOutlined />} onClick={handleTest} loading={testing}>
            {tt('test')}
          </Button>
        </Space>
      </Form.Item>
    </Form>
  )
}
