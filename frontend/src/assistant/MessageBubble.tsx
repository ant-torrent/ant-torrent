import { Alert, Spin } from 'antd'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AssistantMessage } from './types'
import ToolActivityCard from './ToolActivityCard'

const USER_BUBBLE: React.CSSProperties = {
  maxWidth: '85%',
  padding: '8px 12px',
  borderRadius: 12,
  background: 'var(--ant-color-primary)',
  color: 'var(--ant-color-white)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

/**
 * 用户消息为纯文本右对齐气泡；助手消息左对齐，
 * markdown 渲染（含 GFM 表格），工具轨迹以上下卡片穿插在正文前。
 */
export default function MessageBubble({ message, streaming }: {
  message: AssistantMessage
  /** 是否正在流式接收（用于首字前的加载指示） */
  streaming?: boolean
}) {
  const isUser = message.role === 'user'
  const waitingFirstToken = streaming && !message.content && (message.toolSteps?.length ?? 0) === 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        gap: 8,
        maxWidth: '100%',
      }}
    >
      {message.toolSteps?.map((step) => (
        <ToolActivityCard key={step.id} step={step} />
      ))}
      {waitingFirstToken && <Spin size="small" />}
      {message.content && isUser && <div style={USER_BUBBLE}>{message.content}</div>}
      {message.content && !isUser && (
        <div
          className="assistant-markdown"
          style={{
            maxWidth: '100%',
            overflowX: 'auto',
            lineHeight: 1.7,
            wordBreak: 'break-word',
            // 表格/代码块由内层滚动承载，避免撑破抽屉
          }}
        >
          <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
        </div>
      )}
      {message.error && (
        <Alert type="error" showIcon message={message.error} style={{ width: '100%' }} />
      )}
    </div>
  )
}
