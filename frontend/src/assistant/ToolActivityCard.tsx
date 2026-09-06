import { useState } from 'react'
import { CheckCircleFilled, CloseCircleFilled, DownOutlined, LoadingOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ToolStep } from './types'

/** 尝试美化参数 JSON；截断/非法时原样展示 */
function prettyArgs(args: string): string {
  if (!args) return ''
  try {
    return JSON.stringify(JSON.parse(args), null, 2)
  } catch {
    return args
  }
}

/** 工具调用活动卡：状态图标 + 友好名称，点击折叠展开参数与结果摘要 */
export default function ToolActivityCard({ step }: { step: ToolStep }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  // 内置工具有友好名；MCP 工具（mcp_*）直接显示注册名
  const label = t(`assistant.tools.${step.name}`, { defaultValue: step.name })

  return (
    <div
      style={{
        width: '100%',
        border: '1px solid var(--ant-color-border-secondary)',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 12,
        background: 'var(--ant-color-fill-quaternary)',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        {step.status === 'running' ? (
          <LoadingOutlined style={{ color: 'var(--ant-color-primary)' }} />
        ) : step.status === 'ok' ? (
          <CheckCircleFilled style={{ color: 'var(--ant-color-success)' }} />
        ) : (
          <CloseCircleFilled style={{ color: 'var(--ant-color-error)' }} />
        )}
        <span style={{ fontWeight: 500 }}>{label}</span>
        {step.summary && step.status !== 'running' && (
          <span
            style={{
              flex: 1,
              minWidth: 0,
              color: 'var(--ant-color-text-tertiary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'monospace',
            }}
          >
            {step.summary}
          </span>
        )}
        <DownOutlined
          style={{ fontSize: 10, color: 'var(--ant-color-text-tertiary)', transform: open ? 'rotate(180deg)' : undefined }}
        />
      </div>
      {open && (
        <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
          {step.args && (
            <pre style={{ margin: 0, fontSize: 11, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
              {prettyArgs(step.args)}
            </pre>
          )}
          {step.summary && (
            <pre style={{ margin: 0, fontSize: 11, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
              {step.summary}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
