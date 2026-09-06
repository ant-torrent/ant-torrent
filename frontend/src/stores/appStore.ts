import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { serverApi } from '@/services/api/client'
import type { ServerConfig } from '@/services/api/client'

// Re-export for convenience
export type { ServerConfig } from '@/services/api/client'

export type ThemeMode = 'light' | 'dark' | 'system'
export type AccentKey = 'blue' | 'violet' | 'cyan' | 'green' | 'orange' | 'magenta'
export type Locale = 'zh-CN' | 'en-US'

export interface TorrentColumnPrefs {
  /** 可见列 key 列表 */
  visible: string[]
  /** 全列排序（含隐藏列） */
  order: string[]
}

interface AppState {
  themeMode: ThemeMode
  accent: AccentKey
  locale: Locale
  /** null = 使用默认列配置 */
  torrentColumns: TorrentColumnPrefs | null

  /** 服务器配置（从 Go 后端加载，不持久化到 localStorage） */
  servers: ServerConfig[]
  /** 服务器列表是否正在加载 */
  serversLoading: boolean
  /** 加载/创建服务器失败时的错误信息（成功时清除）；不回退假数据 */
  serversError: string | null
  /** 全局"当前服务器"（种子列表页选择器 + 顶栏徽标），持久化 */
  activeServerId: string | null

  setThemeMode: (mode: ThemeMode) => void
  setAccent: (accent: AccentKey) => void
  setLocale: (locale: Locale) => void
  setActiveServerId: (id: string | null) => void
  setTorrentColumns: (cols: TorrentColumnPrefs | null) => void

  /** 从 Go 后端加载服务器列表 */
  loadServers: () => Promise<void>
  /** 创建服务器（调用 Go API）；失败返回 null 并置 serversError */
  addServer: (config: Omit<ServerConfig, 'id'>) => Promise<string | null>
  /** 更新服务器（调用 Go API，乐观更新） */
  updateServer: (id: string, patch: Partial<ServerConfig>) => Promise<boolean>
  /** 删除服务器（调用 Go API） */
  removeServer: (id: string) => Promise<void>
  /** 设置服务器列表（内部使用） */
  setServers: (servers: ServerConfig[]) => void
}

/** 无历史偏好时：中文浏览器默认中文，其余默认英文 */
const detectLocale = (): Locale => {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
  }
  return 'zh-CN'
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // --- Persisted state ---
      themeMode: 'system',
      accent: 'blue',
      locale: detectLocale(),
      torrentColumns: null,

      // --- Non-persisted server state (loaded from Go API) ---
      servers: [],
      serversLoading: false,
      serversError: null,
      activeServerId: null,

      setThemeMode: (themeMode) => set({ themeMode }),
      setAccent: (accent) => set({ accent }),
      setLocale: (locale) => set({ locale }),
      setActiveServerId: (activeServerId) => set({ activeServerId }),
      setTorrentColumns: (torrentColumns) => set({ torrentColumns }),
      setServers: (servers) => set({ servers }),

      loadServers: async () => {
        set({ serversLoading: true })
        try {
          const servers = await serverApi.listServers()
          set({ servers, serversLoading: false, serversError: null })
          // 校准当前服务器：未选择或已不在列表中（如后端侧被删除）时选第一台
          const { activeServerId } = get()
          if (servers.length === 0) {
            if (activeServerId) set({ activeServerId: null })
          } else if (!activeServerId || !servers.some((s) => s.id === activeServerId)) {
            set({ activeServerId: servers[0]!.id })
          }
        } catch (err) {
          // 不回退假数据：置错误态由 UI 展示重试入口
          set({
            servers: [],
            serversLoading: false,
            serversError: err instanceof Error ? err.message : String(err),
          })
        }
      },

      addServer: async (config) => {
        try {
          const created = await serverApi.createServer(config)
          set((state) => ({ servers: [...state.servers, created], serversError: null }))
          return created.id
        } catch (err) {
          set({ serversError: err instanceof Error ? err.message : String(err) })
          return null
        }
      },

      updateServer: async (id, patch) => {
        // Optimistic update
        set((state) => ({
          servers: state.servers.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        }))
        try {
          await serverApi.updateServer(id, patch)
          return true
        } catch {
          // Revert on error — reload from API
          get().loadServers()
          return false
        }
      },

      removeServer: async (id) => {
        // Optimistic update
        const prevServers = get().servers
        set((state) => ({
          servers: state.servers.filter((s) => s.id !== id),
          activeServerId: state.activeServerId === id
            ? (state.servers.find((s) => s.id !== id)?.id ?? null)
            : state.activeServerId,
        }))
        try {
          await serverApi.deleteServer(id)
        } catch {
          // Revert
          set({ servers: prevServers })
        }
      },
    }),
    {
      name: 'ant-torrent.app',
      // Only persist UI preferences + current server, not server configs
      partialize: (state) => ({
        themeMode: state.themeMode,
        accent: state.accent,
        locale: state.locale,
        torrentColumns: state.torrentColumns,
        activeServerId: state.activeServerId,
      }),
    },
  ),
)
