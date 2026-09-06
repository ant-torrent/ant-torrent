import { useCallback, useRef, useState } from 'react'
import { streamChat } from '@/services/api/ai'
import { useAppStore } from '@/stores/appStore'
import type { AssistantMessage } from './types'

/** 发送给后端的纯文本历史上限（约 20 轮），防上下文无限膨胀 */
const MAX_HISTORY = 40

let seq = 0
const nextId = () => `msg-${++seq}`

/**
 * 聊天状态机：SSE 事件折叠进流式气泡；
 * 会话仅存内存，历史裁剪只影响发往后端的请求，不影响本地展示。
 */
export function useAssistant() {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [sending, setSending] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(async (text: string) => {
    const content = text.trim()
    if (!content || abortRef.current) return

    const userMsg: AssistantMessage = { id: nextId(), role: 'user', content }
    const replyId = nextId()
    const replyMsg: AssistantMessage = { id: replyId, role: 'assistant', content: '', toolSteps: [] }
    const history = [...messages, userMsg]
    setMessages([...history, replyMsg])
    setSending(true)

    const updateReply = (fn: (m: AssistantMessage) => AssistantMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === replyId ? fn(m) : m)))
    }

    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamChat(
        {
          // 只回传非空纯文本消息（工具轨迹不进历史），截最近 N 条
          messages: history
            .filter((m) => m.content.trim())
            .slice(-MAX_HISTORY)
            .map((m) => ({ role: m.role, content: m.content })),
          activeServerId: useAppStore.getState().activeServerId ?? undefined,
        },
        (ev) => {
          switch (ev.type) {
            case 'delta':
              if (ev.text) updateReply((m) => ({ ...m, content: m.content + ev.text }))
              break
            case 'tool_start':
              updateReply((m) => ({
                ...m,
                toolSteps: [
                  ...(m.toolSteps ?? []),
                  { id: ev.id ?? '', name: ev.name ?? '', args: ev.args ?? '', status: 'running', summary: '' },
                ],
              }))
              break
            case 'tool_end':
              updateReply((m) => ({
                ...m,
                toolSteps: (m.toolSteps ?? []).map((s) =>
                  s.id === ev.id
                    ? { ...s, status: ev.ok ? 'ok' : 'error', summary: ev.summary ?? '' }
                    : s,
                ),
              }))
              break
            case 'error':
              updateReply((m) => ({ ...m, error: ev.text ?? '' }))
              break
            // done 无需处理：sending 在 finally 收口
          }
        },
        controller.signal,
      )
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        updateReply((m) => ({ ...m, error: err instanceof Error ? err.message : String(err) }))
      }
    } finally {
      abortRef.current = null
      setSending(false)
      // 整轮无产出（如立刻失败/中止）时移除空气泡
      setMessages((prev) =>
        prev.filter((m) => m.id !== replyId || m.content || m.error || (m.toolSteps?.length ?? 0) > 0),
      )
    }
  }, [messages])

  /** 中止当前流式回复（已收到的部分保留） */
  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
  }, [])

  return { messages, sending, send, abort, clear }
}
