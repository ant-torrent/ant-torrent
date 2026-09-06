import { create } from 'zustand'
import { aiApi } from '@/services/api/ai'

/**
 * AI 助手全局状态：configured 驱动悬浮球显隐。
 * AppLayout 挂载时拉取一次、设置页保存后刷新；请求失败按未配置处理，
 * 悬浮球隐藏即可，不影响主功能。
 */
interface AssistantState {
  /** 后端 AI 已完成配置（enabled + provider/model/key 齐备） */
  configured: boolean
  refresh: () => Promise<void>
}

export const useAssistantStore = create<AssistantState>()((set) => ({
  configured: false,
  refresh: async () => {
    try {
      const status = await aiApi.getStatus()
      set({ configured: status.configured })
    } catch {
      set({ configured: false })
    }
  },
}))
