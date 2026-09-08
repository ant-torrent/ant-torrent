import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Empty, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { qbtApi, type QbtLogEntry } from '@/services/api/client'
import { formatDateTimeSec } from '@/utils/format'
import { useActiveServerId } from '../ServerIdContext'

const { Text } = Typography

/** qB 主日志级别（/log/main 的 type 字段，与 qB WebUI 日志页一致） */
const LOG_LEVELS = [
  { value: 1, key: 'normal', color: 'default' },
  { value: 2, key: 'info', color: 'processing' },
  { value: 3, key: 'warning', color: 'warning' },
  { value: 4, key: 'critical', color: 'error' },
] as const

/** 前端最多保留的条数：qB 缓冲可能很大，长驻页面时截断防止内存无限增长 */
const MAX_ENTRIES = 2000

/** 自动刷新间隔（毫秒） */
const AUTO_REFRESH_MS = 10_000

/** qBittorrent 主日志查看：经 Go 后端通用代理读取 /api/v2/log/main */
export default function LogsTab() {
  const { t } = useTranslation()
  const tt = (k: string) => t(`settings.qbt.logs.${k}`)
  const serverId = useActiveServerId()

  const [entries, setEntries] = useState<QbtLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 级别筛选：默认全选（与 qB WebUI 的四个复选框一致）
  const [levels, setLevels] = useState<number[]>(LOG_LEVELS.map((l) => l.value))
  const [autoRefresh, setAutoRefresh] = useState(true)

  // 增量拉取游标（/log/main?last_known_id=N 返回 id > N 的条目）
  const lastIdRef = useRef(0)

  const load = useCallback(
    async (mode: 'full' | 'incr') => {
      if (mode === 'full') setLoading(true)
      try {
        const since = mode === 'incr' && lastIdRef.current > 0 ? lastIdRef.current : undefined
        const fresh = await qbtApi.getLogs(serverId, since)
        lastIdRef.current = fresh.reduce((max, e) => Math.max(max, e.id), lastIdRef.current)
        setEntries((prev) => {
          // 增量与新数据按 id 去重合并，统一最新在前并截断
          const merged = mode === 'full' ? fresh : [...fresh, ...prev]
          const seen = new Set<number>()
          return merged
            .filter((e) => (seen.has(e.id) ? false : seen.add(e.id)))
            .sort((a, b) => b.id - a.id)
            .slice(0, MAX_ENTRIES)
        })
        setError(null)
      } catch (err) {
        // 增量轮询失败静默（网络瞬时抖动常见），仅全量加载时展示错误
        if (mode === 'full') {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (mode === 'full') setLoading(false)
      }
    },
    [serverId],
  )

  // 切换服务器：重置游标并全量加载
  useEffect(() => {
    lastIdRef.current = 0
    setEntries([])
    void load('full')
  }, [load])

  // 自动刷新：固定间隔增量拉取
  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => void load('incr'), AUTO_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [autoRefresh, load])

  const filtered = useMemo(() => entries.filter((e) => levels.includes(e.type)), [entries, levels])

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <Space wrap size={16}>
          <Checkbox.Group
            options={LOG_LEVELS.map((l) => ({ label: tt(`level.${l.key}`), value: l.value }))}
            value={levels}
            onChange={(v) => setLevels(v as number[])}
          />
          {/* 与「设置 → AntTorrent 设置 → 日志」页的自动刷新控件保持一致 */}
          <Checkbox checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)}>
            {tt('autoRefresh')}
          </Checkbox>
        </Space>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load('full')}>
          {tt('refresh')}
        </Button>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={error}
          action={
            <Button size="small" onClick={() => void load('full')}>
              {t('common.retry')}
            </Button>
          }
        />
      )}

      {/* 全宽表格：日志消息可能很长，不受偏好表单 720px 限宽约束 */}
      <Table<QbtLogEntry>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={filtered}
        pagination={{ pageSize: 50, showSizeChanger: false, hideOnSinglePage: true }}
        tableLayout="fixed"
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tt('empty')} />,
        }}
        columns={[
          {
            title: tt('colTime'),
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 165,
            render: (ts: number) => <Text type="secondary">{formatDateTimeSec(ts)}</Text>,
          },
          {
            title: tt('colLevel'),
            dataIndex: 'type',
            key: 'type',
            width: 90,
            render: (type: number) => {
              const l = LOG_LEVELS.find((x) => x.value === type)
              return <Tag color={l?.color ?? 'default'}>{l ? tt(`level.${l.key}`) : String(type)}</Tag>
            },
          },
          {
            title: tt('colMessage'),
            dataIndex: 'message',
            key: 'message',
            // 单元格级截断；Tooltip 显示完整内容，showTitle:false 避免双提示（与 RSS/种子列表一致）
            ellipsis: { showTitle: false },
            render: (msg: string) => (
              <Tooltip title={msg} mouseEnterDelay={0.2} placement="topLeft">
                <span style={{ wordBreak: 'break-all' }}>{msg}</span>
              </Tooltip>
            ),
          },
        ]}
      />
    </>
  )
}
