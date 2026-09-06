/**
 * AI 助手后端 API（/api/ai/*，经 Vite 代理 /qbt-api 到 Go 后端）。
 *
 * Key 不出后端：GET 恒不回传真实 apiKey（hasKey 表示已保存过），
 * PUT 时 apiKey 留空 = 沿用已存、clearApiKey = 清除。
 */

import i18n from '@/i18n'
import { BASE, handleAuthStatus, request } from '@/services/api/client'

export type AiProvider = 'openai' | 'anthropic'

/** 单台外部 MCP 服务器配置（headers/env 值可能为 __SAVED__ 哨兵：沿用已存） */
export interface AiMcpServer {
  id: string
  name: string
  type: 'stdio' | 'http' | string
  enabled: boolean
  command?: string
  args?: string[]
  env?: Record<string, string> | null
  url?: string
  headers?: Record<string, string> | null
}

/** GET/PUT /api/ai/config 的脱敏视图 */
export interface AiConfigView {
  enabled: boolean
  provider: AiProvider | string
  baseUrl: string
  model: string
  /** 恒为空串（后端脱敏） */
  apiKey: string
  hasKey: boolean
  /** 仅 PUT：true = 清除已存 Key */
  clearApiKey?: boolean
  mcpServers?: AiMcpServer[]
}

export interface AiMcpStatus {
  id: string
  name: string
  status: 'running' | 'stopped' | 'error' | string
  toolCount: number
  error?: string
}

/** GET /api/ai/status 响应：configured 驱动悬浮助手显隐 */
export interface AiStatus {
  configured: boolean
  mcp: AiMcpStatus[]
}

/** 保存载荷：apiKey 留空沿用已存；clearApiKey=true 清除已存 Key */
export interface AiConfigSave {
  enabled: boolean
  provider: AiProvider
  baseUrl?: string
  model?: string
  apiKey?: string
  clearApiKey?: boolean
  mcpServers?: AiMcpServer[]
}

/** POST /api/ai/mcp/test 响应 */
export interface AiMcpTestResult {
  ok: boolean
  toolCount: number
  tools: string[]
  error?: string
}

export const aiApi = {
  /** 获取脱敏配置（apiKey 恒空串，hasKey 表示已保存） */
  getConfig(): Promise<AiConfigView> {
    return request('/ai/config')
  },

  /** 保存配置，成功返回保存后的脱敏视图 */
  saveConfig(cfg: AiConfigSave): Promise<AiConfigView> {
    return request('/ai/config', { method: 'PUT', body: JSON.stringify(cfg) })
  },

  /** 助手可用性 + MCP 服务器状态（不启动任何进程） */
  getStatus(): Promise<AiStatus> {
    return request('/ai/status')
  },

  /**
   * 用给定（通常为草稿）配置临时建连测试 MCP 服务器：
   * initialize + tools/list 后即关闭，不影响运行中的托管会话。
   */
  testMcp(server: AiMcpServer): Promise<AiMcpTestResult> {
    return request('/ai/mcp/test', { method: 'POST', body: JSON.stringify(server) })
  },
}

/* ------------------------------------------------------------------ */
/* SSE 聊天流（POST /api/ai/chat）                                      */
/* ------------------------------------------------------------------ */

/** 后端 SSE 事件载荷：type 为帧 event 名，字段仅在对应事件中出现 */
export interface AiChatEvent {
  type: 'delta' | 'tool_start' | 'tool_end' | 'error' | 'done'
  /** delta 增量文本 / error 错误文案 */
  text?: string
  /** tool_start / tool_end：调用 ID */
  id?: string
  /** 工具名 */
  name?: string
  /** tool_start：原始参数 JSON */
  args?: string
  /** tool_end：是否成功 */
  ok?: boolean
  /** tool_end：结果摘要（后端已截断至 ~200 字） */
  summary?: string
  /** done：stop | max_iterations */
  finish?: string
}

/** 发送给后端的纯文本历史（工具轨迹只存活于单次请求内，不回传） */
export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 解析一帧 SSE（event:/data: 两行，data 为 JSON） */
function parseSseFrame(frame: string): AiChatEvent | null {
  let type = ''
  let data = ''
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) type = line.slice(7).trim()
    else if (line.startsWith('data: ')) data += line.slice(6)
  }
  if (!type || !data) return null
  try {
    return { type, ...JSON.parse(data) } as AiChatEvent
  } catch {
    return null
  }
}

/**
 * 发起 SSE 聊天并逐事件回调。非 OK 响应先解析后端本地化 JSON 错误再抛出；
 * signal 中止时 fetch/readable 抛 AbortError，由调用方区分处理。
 */
export async function streamChat(
  body: { messages: AiChatMessage[]; activeServerId?: string },
  onEvent: (ev: AiChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 后端系统提示据此决定回复语言
      'Accept-Language': i18n.language,
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    // 受保护接口 401 时同步触发全局登出跳转
    handleAuthStatus('/ai/chat', res.status)
    const text = await res.text().catch(() => '')
    let detail = text
    try {
      detail = JSON.parse(text)?.error ?? text
    } catch {
      // 非 JSON 响应，保留原文
    }
    throw new Error(detail || `HTTP ${res.status}: ${res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    // SSE 帧以空行分隔；末尾不完整的帧留到下一轮拼接
    const frames = buf.split('\n\n')
    buf = frames.pop() ?? ''
    for (const frame of frames) {
      const ev = parseSseFrame(frame)
      if (ev) onEvent(ev)
    }
  }
}
