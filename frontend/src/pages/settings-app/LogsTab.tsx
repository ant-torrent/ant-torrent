import { SaveOutlined } from '@ant-design/icons'
import { App, Button, Checkbox, Flex, Select, Space, Switch, Typography } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LOG_CAP, logsApi, type LogConfig, type LogFormat, type LogLevel } from '@/services/api/logs'

/** 轮询周期 */
const POLL_MS = 5000

/**
 * 日志 tab：查看后端最近日志（内存环形缓冲，旧 → 新），排障用。
 * 默认每 5s 自动刷新并滚动到底部；上方提供日志配置（级别/格式/访问日志，
 * 持久化到 settings.json 并即时生效）。日志只存于后端进程内存，重启即清空。
 */
export default function LogsTab() {
  const { t } = useTranslation()
  const tt = (k: string, opts?: Record<string, unknown>) => t(`settings.app.logs.${k}`, opts)
  const { message } = App.useApp()
  const [lines, setLines] = useState<string[]>([])
  const [auto, setAuto] = useState(true)
  const [loading, setLoading] = useState(true)
  const [cfg, setCfg] = useState<LogConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  const load = useCallback(async () => {
    try {
      const next = await logsApi.getLines()
      setLines(next)
      // 等新内容渲染后再滚动到底部（日志页默认关注最新输出）
      requestAnimationFrame(() => {
        preRef.current?.scrollTo({ top: preRef.current.scrollHeight })
      })
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [message, t])

  useEffect(() => {
    void load()
    void logsApi.getConfig().then(setCfg).catch(() => setCfg(null))
  }, [load])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => {
      void load()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [auto, load])

  const handleSaveCfg = async () => {
    if (!cfg) return
    setSaving(true)
    try {
      const saved = await logsApi.updateConfig(cfg)
      setCfg(saved)
      message.success(t('common.saved'))
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const patchCfg = (patch: Partial<LogConfig>) => {
    setCfg((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  return (
    <>
      {/* 单一工具栏：配置项（级别/格式/访问日志 + 保存）与自动刷新开关，
          统一默认尺寸与图标风格，竖分隔线分组；窄屏自动换行 */}
      {/* 左：日志配置（级别/格式/访问日志 + 保存）；右：自动刷新开关 */}
      <Flex wrap="wrap" justify="space-between" align="center" gap={16} style={{ marginBottom: 12 }}>
        <Space wrap size={16}>
          {cfg && (
            <>
              <Space size={8}>
                <Typography.Text type="secondary">{tt('level')}</Typography.Text>
                <Select<LogLevel>
                  value={cfg.level}
                  onChange={(level) => patchCfg({ level })}
                  style={{ width: 96 }}
                  options={[
                    { value: 'debug', label: tt('levelDebug') },
                    { value: 'info', label: tt('levelInfo') },
                    { value: 'warn', label: tt('levelWarn') },
                    { value: 'error', label: tt('levelError') },
                  ]}
                />
              </Space>
              <Space size={8}>
                <Typography.Text type="secondary">{tt('format')}</Typography.Text>
                <Select<LogFormat>
                  value={cfg.format}
                  onChange={(format) => patchCfg({ format })}
                  style={{ width: 96 }}
                  options={[
                    { value: 'text', label: tt('formatText') },
                    { value: 'json', label: tt('formatJson') },
                  ]}
                />
              </Space>
              <Space size={8}>
                <Typography.Text type="secondary">{tt('accessLog')}</Typography.Text>
                <Switch checked={cfg.accessLog} onChange={(accessLog) => patchCfg({ accessLog })} />
              </Space>
              <Button type="primary" icon={<SaveOutlined />} onClick={() => void handleSaveCfg()} loading={saving}>
                {t('common.save')}
              </Button>
            </>
          )}
        </Space>
        <Checkbox checked={auto} onChange={(e) => setAuto(e.target.checked)}>
          {tt('autoRefresh')}
        </Checkbox>
      </Flex>

      <pre
        ref={preRef}
        style={{
          margin: 0,
          width: '100%',
          // 高度随视口自适应：扣除页头/卡片标题/tab 栏/工具栏等约 300px 固定占位
          height: 'calc(100vh - 300px)',
          minHeight: 480,
          overflow: 'auto',
          padding: '12px 16px',
          borderRadius: 8,
          background: 'rgba(128, 128, 128, 0.1)',
          fontSize: 12,
          lineHeight: '20px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {lines.length === 0 ? (loading ? ' ' : tt('empty')) : lines.join('\n')}
      </pre>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {tt('hint', { count: LOG_CAP })}
      </Typography.Text>
    </>
  )
}
