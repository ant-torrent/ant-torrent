import { useCallback, useEffect, useMemo, useState } from 'react'
import { App, Badge, Button, Card, Input, Popconfirm, Space, Tag, Tooltip, Typography } from 'antd'
import { ApiOutlined, CodeOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { aiApi, type AiMcpServer, type AiMcpStatus } from '@/services/api/ai'

interface McpSectionProps {
  servers: AiMcpServer[]
  onChange: (servers: AiMcpServer[]) => void
  /** 任一编辑框解析失败或重名时置 false（父级阻止保存），恢复有效时置 true */
  onValidityChange?: (valid: boolean) => void
  /** 保存成功后自增：父级以此为 key 重挂载本组件，各编辑框文本取回写后的最新配置 */
  refreshKey: number
}

/** 结构化解析错误：key 为 i18n 键，name 存在时以「名称： 原因」形式展示 */
interface ParseError {
  key: string
  opts?: Record<string, string | number>
  name?: string
}

type ParseResult = { ok: true; servers: AiMcpServer[] } | { ok: false; error: ParseError }

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** env/headers：必须是字符串到字符串/数字/布尔的映射（值统一转字符串） */
const parseStringMap = (v: unknown): Record<string, string> | null => {
  if (!isPlainObject(v)) return null
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v)) {
    if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') return null
    out[k] = String(val)
  }
  return out
}

/**
 * mcpServers JSON → AiMcpServer[]。
 * 格式：{ "<名称>": { command/args/env 或 url/headers, enabled? } }（外层 mcpServers 可省略），
 * type 省略时按有无 url 推断（有 url = http，否则 stdio）；
 * idByName 用于沿用已存服务器的 ID（后端据此回填 __SAVED__ 哨兵的密钥值）。
 */
const parseMcpJson = (text: string, idByName: Map<string, string>): ParseResult => {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, servers: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (err) {
    return {
      ok: false,
      error: { key: 'jsonInvalid', opts: { msg: err instanceof Error ? err.message : String(err) } },
    }
  }

  const root = isPlainObject(parsed) && 'mcpServers' in parsed ? parsed.mcpServers : parsed
  if (!isPlainObject(root)) return { ok: false, error: { key: 'rootInvalid' } }

  const servers: AiMcpServer[] = []
  for (const [rawName, rawEntry] of Object.entries(root)) {
    const name = rawName.trim()
    if (!name) return { ok: false, error: { key: 'nameRequired' } }
    if (!isPlainObject(rawEntry)) return { ok: false, error: { key: 'entryMustBeObject', name } }
    const e = rawEntry

    let type: string
    if (typeof e.type === 'string' && e.type.trim()) {
      type = e.type.trim()
      if (type !== 'stdio' && type !== 'http') return { ok: false, error: { key: 'typeInvalid', name } }
    } else {
      type = typeof e.url === 'string' && e.url.trim() ? 'http' : 'stdio'
    }

    const server: AiMcpServer = {
      id: idByName.get(name) ?? '',
      name,
      type,
      enabled: e.enabled !== false && e.disabled !== true,
    }

    if (type === 'http') {
      if (typeof e.url !== 'string' || !e.url.trim()) {
        return { ok: false, error: { key: 'urlRequired', name } }
      }
      server.url = e.url.trim()
      if (e.headers !== undefined) {
        const m = parseStringMap(e.headers)
        if (!m) return { ok: false, error: { key: 'mapInvalid', opts: { field: 'headers' }, name } }
        if (Object.keys(m).length) server.headers = m
      }
    } else {
      if (typeof e.command !== 'string' || !e.command.trim()) {
        return { ok: false, error: { key: 'commandRequired', name } }
      }
      server.command = e.command.trim()
      if (e.args !== undefined) {
        if (!Array.isArray(e.args) || e.args.some((a) => ['string', 'number', 'boolean'].indexOf(typeof a) < 0)) {
          return { ok: false, error: { key: 'argsInvalid', name } }
        }
        const args = (e.args as (string | number | boolean)[]).map(String)
        if (args.length) server.args = args
      }
      if (e.env !== undefined) {
        const m = parseStringMap(e.env)
        if (!m) return { ok: false, error: { key: 'mapInvalid', opts: { field: 'env' }, name } }
        if (Object.keys(m).length) server.env = m
      }
    }
    servers.push(server)
  }
  return { ok: true, servers }
}

/** 单个编辑框文本 → 一台服务器（null = 空配置）。顶层键即服务器名，只允许一台。 */
const parseSingleServer = (
  text: string,
  idByName: Map<string, string>,
): { ok: true; server: AiMcpServer | null } | { ok: false; error: ParseError } => {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, server: null }
  // 直接粘贴了单台条目体（顶层就是 command/url）→ 提示补上名称键
  try {
    const probe: unknown = JSON.parse(trimmed)
    if (isPlainObject(probe) && !('mcpServers' in probe) && ('command' in probe || 'url' in probe)) {
      return { ok: false, error: { key: 'needsNameKey' } }
    }
  } catch {
    // 语法错误交由 parseMcpJson 统一上报
  }
  const result = parseMcpJson(trimmed, idByName)
  if (!result.ok) return result
  if (result.servers.length > 1) return { ok: false, error: { key: 'singleOnly' } }
  return { ok: true, server: result.servers[0] ?? null }
}

/** AiMcpServer → 单台服务器的规范化 JSON 文本（隐藏 id；密钥哨兵 __SAVED__ 原样保留） */
const serverToBlockJson = (s: AiMcpServer): string => {
  const entry: Record<string, unknown> = {}
  if (!s.enabled) entry.enabled = false
  if (s.type === 'http') {
    entry.url = s.url ?? ''
    if (s.headers && Object.keys(s.headers).length) entry.headers = s.headers
  } else {
    entry.command = s.command ?? ''
    if (s.args?.length) entry.args = s.args
    if (s.env && Object.keys(s.env).length) entry.env = s.env
  }
  return JSON.stringify({ [s.name || 'server']: entry }, null, 2)
}

/**
 * AI 设置页的 MCP 服务器管理区：每台服务器一个独立的 JSON 编辑框
 * （{ "名称": { command/args/env 或 url/headers } }，Claude Desktop 条目格式），
 * 编辑框上方标题展示名称、类型与运行徽标，可单独测试、格式化、删除。草稿态随 AiTab 一并保存。
 */
export default function McpSection({ servers, onChange, onValidityChange, refreshKey }: McpSectionProps) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const tt = (k: string, opts?: Record<string, string | number>) =>
    t(`settings.app.ai.mcp.${k}`, opts)

  /** 每台服务器一个编辑框；文本为本地状态，仅在重挂载时从 servers 初始化 */
  const [texts, setTexts] = useState<string[]>(() => servers.map(serverToBlockJson))

  const [statuses, setStatuses] = useState<Record<string, AiMcpStatus>>({})
  const [testingIdx, setTestingIdx] = useState<number | null>(null)

  const loadStatuses = useCallback(async () => {
    try {
      const st = await aiApi.getStatus()
      setStatuses(Object.fromEntries(st.mcp.map((s) => [s.id, s])))
    } catch {
      // 状态徽标失败可容忍：仅影响展示
    }
  }, [])

  useEffect(() => {
    void loadStatuses()
  }, [loadStatuses, refreshKey])

  // name → id：保持已存服务器 ID 稳定，后端据此回填 __SAVED__ 哨兵的密钥值
  const idByName = useMemo(
    () => new Map(servers.filter((s) => s.id).map((s) => [s.name, s.id])),
    [servers],
  )

  const parsedBlocks = useMemo(
    () => texts.map((text) => parseSingleServer(text, idByName)),
    [texts, idByName],
  )

  /** 与 parsedBlocks 对齐的重名标记：与更早编辑框同名的置 true */
  const dupFlags = useMemo(() => {
    const seen = new Set<string>()
    return parsedBlocks.map((p) => {
      if (!p.ok || !p.server) return false
      if (seen.has(p.server.name)) return true
      seen.add(p.server.name)
      return false
    })
  }, [parsedBlocks])

  const ttError = (e: ParseError): string =>
    e.name ? tt('entryError', { name: e.name, msg: tt(e.key, e.opts) }) : tt(e.key, e.opts)

  /** 汇总全部编辑框：全部有效且无重名 → 上报草稿并置有效；否则仅置无效（草稿保持上次有效值） */
  const report = (nextTexts: string[]) => {
    const parsed = nextTexts.map((text) => parseSingleServer(text, idByName))
    const seen = new Set<string>()
    let allOk = true
    let dup = false
    const out: AiMcpServer[] = []
    for (const p of parsed) {
      if (!p.ok) {
        allOk = false
        continue
      }
      if (p.server) {
        if (seen.has(p.server.name)) dup = true
        seen.add(p.server.name)
        out.push(p.server)
      }
    }
    if (!allOk || dup) {
      onValidityChange?.(false)
      return
    }
    onValidityChange?.(true)
    onChange(out)
  }

  const setText = (i: number, val: string) => {
    const next = texts.map((t, j) => (j === i ? val : t))
    setTexts(next)
    report(next)
  }

  const handleAdd = () => {
    const next = [...texts, '']
    setTexts(next)
    report(next)
  }

  const handleDelete = (i: number) => {
    const next = texts.filter((_, j) => j !== i)
    setTexts(next)
    report(next)
  }

  /** 规范化排版（按键序 + 2 空格缩进重新输出）；语义不变，无需重新上报 */
  const handleFormat = (i: number) => {
    const p = parsedBlocks[i]
    if (!p?.ok || !p.server) return
    const canonical = serverToBlockJson(p.server)
    setTexts(texts.map((t, j) => (j === i ? canonical : t)))
  }

  const handleTest = async (i: number) => {
    const p = parsedBlocks[i]
    if (!p?.ok || !p.server) return
    const s = p.server
    setTestingIdx(i)
    try {
      const res = await aiApi.testMcp({
        ...s,
        name: s.name.trim(),
        command: s.command?.trim(),
        url: s.url?.trim(),
      })
      if (res.ok) {
        message.success(tt('testOk', { count: res.toolCount }))
      } else {
        message.error(res.error || tt('testFailed'))
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : tt('testFailed'))
    } finally {
      setTestingIdx(null)
    }
  }

  const serversCount = parsedBlocks.filter((p) => p.ok && p.server).length
  const enabledCount = parsedBlocks.filter((p) => p.ok && p.server && p.server.enabled).length

  return (
    <Card
      size="small"
      title={tt('title')}
      style={{ marginTop: 8 }}
      extra={
        <Button size="small" icon={<PlusOutlined />} onClick={handleAdd}>
          {tt('add')}
        </Button>
      }
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {texts.length === 0 && (
          <Typography.Text
            type="secondary"
            style={{ display: 'block', textAlign: 'center', padding: '8px 0' }}
          >
            {tt('empty')}
          </Typography.Text>
        )}

        {texts.map((text, i) => {
          const p = parsedBlocks[i]!
          const server = p.ok ? p.server : null
          const errText = !p.ok ? ttError(p.error) : dupFlags[i] ? tt('nameDuplicate') : ''
          return (
            <Card
              key={i}
              type="inner"
              size="small"
              title={
                <Space size={8}>
                  {server?.id && statuses[server.id] && (
                    <StatusBadge status={statuses[server.id]!} labels={tt} />
                  )}
                  <Typography.Text strong>{server?.name ?? tt('newServer')}</Typography.Text>
                  {server && (
                    <Tag style={{ marginInlineEnd: 0 }}>
                      {tt(server.type === 'http' ? 'typeHttp' : 'typeStdio')}
                    </Tag>
                  )}
                  {server && !server.enabled && (
                    <Tag style={{ marginInlineEnd: 0 }}>{tt('disabledTag')}</Tag>
                  )}
                </Space>
              }
              extra={
                <Space size={0}>
                  <Button
                    size="small"
                    type="text"
                    icon={<CodeOutlined />}
                    disabled={!server}
                    onClick={() => handleFormat(i)}
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<ApiOutlined />}
                    disabled={!server}
                    loading={testingIdx === i}
                    onClick={() => void handleTest(i)}
                  >
                    {tt('test')}
                  </Button>
                  <Popconfirm title={tt('deleteConfirm')} onConfirm={() => handleDelete(i)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              }
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Input.TextArea
                  value={text}
                  onChange={(e) => setText(i, e.target.value)}
                  autoSize={{ minRows: 4, maxRows: 16 }}
                  spellCheck={false}
                  style={{
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
                    fontSize: 12,
                  }}
                  placeholder={tt('placeholder')}
                />
                {errText && (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {errText}
                  </Typography.Text>
                )}
              </Space>
            </Card>
          )
        })}

        {serversCount > 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {tt('jsonSummary', { total: serversCount, on: enabledCount })}
          </Typography.Text>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {tt('hint')}
        </Typography.Text>
      </Space>
    </Card>
  )
}

/** 运行状态徽标：running=绿（含工具数）、error=红（Tooltip 展示错误）、其余灰 */
function StatusBadge({
  status,
  labels,
}: {
  status: AiMcpStatus
  labels: (k: string, opts?: Record<string, string | number>) => string
}) {
  if (status.status === 'running') {
    return (
      <Tooltip title={labels('toolCount', { count: status.toolCount })}>
        <Badge status="success" text={labels('statusRunning')} />
      </Tooltip>
    )
  }
  if (status.status === 'error') {
    return (
      <Tooltip title={status.error}>
        <Badge status="error" text={labels('statusError')} />
      </Tooltip>
    )
  }
  return <Badge status="default" text={labels('statusStopped')} />
}
