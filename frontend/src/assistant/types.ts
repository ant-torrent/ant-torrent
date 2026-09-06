/** 聊天 UI 消息模型（会话仅存内存，一期不持久化） */

/** 单次回复中的一步工具调用 */
export interface ToolStep {
  /** 后端 tool_start/tool_end 携带的调用 ID */
  id: string
  name: string
  /** 原始参数 JSON */
  args: string
  status: 'running' | 'ok' | 'error'
  /** tool_end 摘要（后端已截断） */
  summary: string
}

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  /** 助手消息为 markdown */
  content: string
  /** 仅助手消息：本轮的工具调用轨迹 */
  toolSteps?: ToolStep[]
  /** 流式中 error 事件的文案（与正文分开展示） */
  error?: string
}
