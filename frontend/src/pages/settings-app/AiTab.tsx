import { useCallback, useEffect, useState } from 'react'
import { App, AutoComplete, Button, Checkbox, Form, Input, Segmented, Space, Spin, Switch } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { aiApi, type AiMcpServer, type AiProvider } from '@/services/api/ai'
import { useAssistantStore } from '@/assistant/store'
import McpSection from './McpSection'

/** 各服务商的官方默认接口地址（草稿留空时后端取该值）与常用模型建议项 */
const PROVIDER_PRESETS: Record<AiProvider, { defaultBaseUrl: string; models: string[] }> = {
  openai: {
    defaultBaseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.2', 'gpt-5.2-mini', 'gpt-5-mini'],
  },
  anthropic: {
    defaultBaseUrl: 'https://api.anthropic.com',
    models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  },
}

interface AiDraft {
  enabled: boolean
  provider: AiProvider
  baseUrl: string
  /** 输入的新 Key；留空 = 沿用已存（hasKey 时） */
  apiKey: string
  clearApiKey: boolean
  model: string
  /** MCP 服务器列表（由 JSON 编辑器解析得出；headers/env 值可能带 __SAVED__ 哨兵，原样回传由后端还原） */
  mcpServers: AiMcpServer[]
}

/** AI 助手设置：本地草稿编辑，点保存才写入 Go 后端（Key 只存后端） */
export default function AiTab() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const tt = (k: string, opts?: Record<string, string>) => t(`settings.app.ai.${k}`, opts)
  const refreshAssistant = useAssistantStore((s) => s.refresh)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  /** 后端已保存过 Key（输入框可留空沿用） */
  const [hasKey, setHasKey] = useState(false)
  /** 保存成功后自增：驱动 MCP 状态徽标刷新 */
  const [mcpRefreshKey, setMcpRefreshKey] = useState(0)
  /** MCP JSON 编辑器当前是否有效（无效则阻止保存） */
  const [mcpInvalid, setMcpInvalid] = useState(false)
  const [draft, setDraft] = useState<AiDraft>({
    enabled: false,
    provider: 'openai',
    baseUrl: '',
    apiKey: '',
    clearApiKey: false,
    model: '',
    mcpServers: [],
  })

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await aiApi.getConfig()
      setHasKey(cfg.hasKey)
      setDraft((prev) => ({
        ...prev,
        enabled: cfg.enabled,
        provider: cfg.provider === 'anthropic' ? 'anthropic' : 'openai',
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        apiKey: '',
        clearApiKey: false,
        mcpServers: cfg.mcpServers ?? [],
      }))
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const handleChange = <K extends keyof AiDraft>(field: K, value: AiDraft[K]) => {
    setDraft((prev) => ({ ...prev, [field]: value }))
  }

  /** 切换服务商时，草稿里是另一家的默认地址或空 → 跟着切到新家的默认占位 */
  const handleProviderChange = (provider: AiProvider) => {
    setDraft((prev) => ({
      ...prev,
      provider,
      baseUrl:
        prev.baseUrl === '' || prev.baseUrl === PROVIDER_PRESETS[prev.provider].defaultBaseUrl
          ? ''
          : prev.baseUrl,
    }))
  }

  /** 启用时要求模型与 Key（已有保存过的 Key 时输入框可留空） */
  const validate = (): AiDraft | null => {
    const next = {
      ...draft,
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim(),
    }
    if (next.enabled) {
      if (!next.model) {
        message.warning(tt('modelRequired'))
        return null
      }
      // 已保存 Key 可留空沿用；但勾选"清除"就必须提供新值（启用状态不允许无 Key）
      if (!next.apiKey && (!hasKey || next.clearApiKey)) {
        message.warning(tt('apiKeyRequired'))
        return null
      }
    }
    if (mcpInvalid) {
      message.warning(tt('mcpInvalid'))
      return null
    }
    return next
  }

  const handleSave = async () => {
    const next = validate()
    if (!next) return
    setSaving(true)
    try {
      const saved = await aiApi.saveConfig({
        enabled: next.enabled,
        provider: next.provider,
        baseUrl: next.baseUrl,
        model: next.model,
        apiKey: next.apiKey,
        // 输入框有新值时以新值为准，忽略"清除"勾选
        clearApiKey: next.clearApiKey && !next.apiKey,
        mcpServers: next.mcpServers,
      })
      setHasKey(saved.hasKey)
      setDraft((prev) => ({
        ...prev,
        apiKey: '',
        clearApiKey: false,
        // 新增条目在此拿到后端分配的 ID；哨兵值原样回传继续沿用
        mcpServers: saved.mcpServers ?? [],
      }))
      setMcpRefreshKey((k) => k + 1)
      message.success(t('common.saved'))
      void refreshAssistant() // 刷新悬浮球显隐
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Spin style={{ display: 'block', margin: '48px auto' }} />
  }

  const preset = PROVIDER_PRESETS[draft.provider]

  return (
    // component={false}：只借 Form 提供布局上下文（labelCol/wrapperCol），不渲染真实 form 元素，
    // 避免保存按钮默认 submit 行为；labelCol 固定 label 列宽使 labelAlign=right（默认）生效
    <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }} component={false}>
      <Form.Item label={tt('enable')}>
        <Switch checked={draft.enabled} onChange={(v) => handleChange('enabled', v)} />
      </Form.Item>

      <Form.Item label={tt('provider')}>
        <Segmented
          value={draft.provider}
          onChange={(v) => handleProviderChange(v as AiProvider)}
          options={[
            { label: tt('providerOpenai'), value: 'openai' },
            { label: tt('providerAnthropic'), value: 'anthropic' },
          ]}
        />
      </Form.Item>

      <Form.Item label={tt('baseUrl')} extra={tt('baseUrlHint', { url: preset.defaultBaseUrl })}>
        <Input
          value={draft.baseUrl}
          onChange={(e) => handleChange('baseUrl', e.target.value)}
          placeholder={preset.defaultBaseUrl}
        />
      </Form.Item>

      <Form.Item label={tt('apiKey')} extra={hasKey ? tt('apiKeySavedHint') : undefined}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Input.Password
            value={draft.apiKey}
            onChange={(e) => handleChange('apiKey', e.target.value)}
            placeholder={hasKey ? tt('apiKeyMasked') : tt('apiKeyPlaceholder')}
            autoComplete="new-password"
          />
          {hasKey && (
            <Checkbox
              checked={draft.clearApiKey}
              onChange={(e) => handleChange('clearApiKey', e.target.checked)}
            >
              {tt('clearApiKey')}
            </Checkbox>
          )}
        </Space>
      </Form.Item>

      <Form.Item label={tt('model')} extra={tt('modelHint')}>
        <AutoComplete
          value={draft.model}
          onChange={(v) => handleChange('model', v)}
          options={preset.models.map((m) => ({ value: m }))}
          placeholder={tt('modelPlaceholder')}
        />
      </Form.Item>

      {/* key=refreshKey：保存成功后重挂载，让 JSON 编辑器取回写后的最新配置。
          包一层空 label 的 Form.Item，让 MCP 区块与上方控件列左对齐 */}
      <Form.Item label=" " colon={false}>
        <McpSection
          key={mcpRefreshKey}
          servers={draft.mcpServers}
          onChange={(v) => handleChange('mcpServers', v)}
          onValidityChange={(valid) => setMcpInvalid(!valid)}
          refreshKey={mcpRefreshKey}
        />
      </Form.Item>

      <Form.Item label=" " colon={false} style={{ marginTop: 16 }}>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          {t('common.save')}
        </Button>
      </Form.Item>
    </Form>
  )
}
