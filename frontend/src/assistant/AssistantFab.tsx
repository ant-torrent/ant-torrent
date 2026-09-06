import { useEffect, useState } from 'react'
import { FloatButton } from 'antd'
import { RobotOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAssistantStore } from './store'
import AssistantDrawer from './AssistantDrawer'

/**
 * 全局悬浮球：仅在后端 AI 配置齐备时渲染（AppLayout 挂载时拉取状态、
 * 设置页保存后刷新）。点击打开聊天抽屉，抽屉与悬浮球同生命周期。
 */
export default function AssistantFab() {
  const { t } = useTranslation()
  const configured = useAssistantStore((s) => s.configured)
  const refresh = useAssistantStore((s) => s.refresh)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!configured) return null

  return (
    <>
      <FloatButton
        icon={<RobotOutlined />}
        tooltip={t('assistant.title')}
        onClick={() => setOpen(true)}
      />
      <AssistantDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
