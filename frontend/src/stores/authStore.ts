import { create } from 'zustand'

import { useAppStore } from '@/stores/appStore'
import { authApi } from '@/services/api/auth'

/**
 * 登录态全局状态（非持久化，以后端 /auth/status 为准）。
 * AuthGate 挂载时 bootstrap 探测，决定渲染初始化引导 / 登录页 / 主界面；
 * 受保护接口 401 时（client.ts 统一分发）markUnauthenticated 切回登录页。
 */
export type AuthPhase = 'loading' | 'error' | 'setup' | 'anonymous' | 'authenticated'

interface AuthState {
  status: AuthPhase
  username: string | null
  /** 启动探测：GET /auth/status → setup / anonymous / authenticated；网络失败 → error（可重试） */
  bootstrap: () => Promise<void>
  login: (username: string, password: string) => Promise<boolean>
  setup: (username: string, password: string) => Promise<boolean>
  /** 登出：后端清 cookie 后切回 anonymous；同时清空服务器列表停掉轮询 */
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>
  /** 受保护接口 401 时的统一入口（client.ts onUnauthorized 回调） */
  markUnauthenticated: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'loading',
  username: null,

  bootstrap: async () => {
    set({ status: 'loading' })
    try {
      const s = await authApi.status()
      if (s.setupRequired) {
        set({ status: 'setup', username: null })
      } else if (s.authenticated) {
        set({ status: 'authenticated', username: s.username })
      } else {
        set({ status: 'anonymous', username: null })
      }
    } catch {
      set({ status: 'error' })
    }
  },

  login: async (username, password) => {
    try {
      const res = await authApi.login(username, password)
      set({ status: 'authenticated', username: res.username })
      return true
    } catch {
      return false
    }
  },

  setup: async (username, password) => {
    try {
      const res = await authApi.setup(username, password)
      set({ status: 'authenticated', username: res.username })
      return true
    } catch {
      return false
    }
  },

  logout: async () => {
    try {
      await authApi.logout()
    } catch {
      // 后端登出失败也继续本地登出：清除页面数据、回到登录页
    }
    set({ status: 'anonymous', username: null })
    // 清空服务器列表与轮询数据，避免匿名状态下后台继续轮询 401
    useAppStore.setState({ servers: [], activeServerId: null })
  },

  changePassword: async (currentPassword, newPassword) => {
    try {
      await authApi.changePassword(currentPassword, newPassword)
      return true
    } catch {
      return false
    }
  },

  markUnauthenticated: () => {
    set({ status: 'anonymous', username: null })
    useAppStore.setState({ servers: [], activeServerId: null })
  },
}))
