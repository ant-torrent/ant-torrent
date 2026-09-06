import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Drawer, Empty, Input, Popconfirm, Space, Typography } from 'antd'
import { ClearOutlined, SendOutlined, StopOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAssistantStore } from './store'
import { useAssistant } from './useAssistant'
import MessageBubble from './MessageBubble'

const { Text } = Typography

/** 示例提问（空态点击直接发送） */
const SUGGESTION_KEYS = ['assistant.suggestion1', 'assistant.suggestion2', 'assistant.suggestion3']

/** 右侧聊天抽屉：消息流 + 工具活动卡 + 输入区；由悬浮球持有开关状态 */
export default function AssistantDrawer({ open, onClose }: {
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const configured = useAssistantStore((s) => s.configured)
  const { messages, sending, send, abort, clear } = useAssistant()
  const [input, setInput] = useState('')

  const listRef = useRef<HTMLDivElement>(null)
  /** 仅当视口近底部时自动跟随滚动，用户上翻回看不打断 */
  const stickBottomRef = useRef(true)

  useEffect(() => {
    const el = listRef.current
    if (el && stickBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const handleScroll = () => {
    const el = listRef.current
    if (!el) return
    stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    void send(text)
  }

  const handleSendSample = (text: string) => {
    if (sending) return
    void send(text)
  }

  const handleClear = () => {
    clear()
    message.success(t('assistant.cleared'))
  }

  return (
    <Drawer
      title={
        <Space>
          <span>{t('assistant.title')}</span>
          <Popconfirm
            title={t('assistant.clearConfirm')}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            onConfirm={handleClear}
            disabled={messages.length === 0}
          >
            <Button size="small" type="text" icon={<ClearOutlined />} disabled={messages.length === 0} />
          </Popconfirm>
        </Space>
      }
      placement="right"
      size={480}
      open={open}
      onClose={onClose}
      destroyOnHidden
      styles={{ body: { display: 'flex', flexDirection: 'column', padding: '12px 16px', gap: 12 } }}
    >
      {!configured && (
        <Alert type="warning" showIcon message={t('assistant.notConfigured')} />
      )}

      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', padding: 24 }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('assistant.emptyTitle')} />
            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              {SUGGESTION_KEYS.map((key) => (
                <Button
                  key={key}
                  onClick={() => handleSendSample(t(key))}
                  style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                >
                  {t(key)}
                </Button>
              ))}
            </div>
            <Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 12 }}>
              {t('assistant.hint')}
            </Text>
          </div>
        ) : (
          messages.map((m, i) => (
            <MessageBubble
              key={m.id}
              message={m}
              streaming={sending && i === messages.length - 1 && m.role === 'assistant'}
            />
          ))
        )}
      </div>

      <Space.Compact style={{ width: '100%' }}>
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={t('assistant.placeholder')}
          autoSize={{ minRows: 1, maxRows: 5 }}
          disabled={!configured}
          variant="borderless"
          style={{ background: 'var(--ant-color-fill-tertiary)', borderRadius: 8 }}
        />
      </Space.Compact>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: -4 }}>
        {sending ? (
          <Button danger icon={<StopOutlined />} onClick={abort}>
            {t('assistant.stop')}
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!input.trim() || !configured}
          >
            {t('assistant.send')}
          </Button>
        )}
      </div>
    </Drawer>
  )
}
