/**
 * Telegram bot 后端 API（/api/telegram/*，经 Vite 代理 /qbt-api 到 Go 后端）。
 *
 * Token 不出后端：GET 恒不回传真实 botToken（hasKey 表示已保存过），
 * PUT 时 botToken 留空 = 沿用已存、clearBotToken = 清除。
 */

import { request } from '@/services/api/client'

/** bot 运行状态（错误文本后端已脱敏，不含 token） */
export interface TelegramStatus {
  status: 'running' | 'stopped' | 'error' | string
  error?: string
  botUsername?: string
}

/** GET/PUT /api/telegram/config 的脱敏视图 */
export interface TelegramConfigView {
  enabled: boolean
  /** 恒为空串（后端脱敏） */
  botToken: string
  hasKey: boolean
  /** 仅 PUT：true = 清除已存 token */
  clearBotToken?: boolean
  allowedUserIds: number[]
  proxyUrl: string
  language: 'zh-CN' | 'en-US' | string
  status?: TelegramStatus
}

/** 保存载荷：botToken 留空沿用已存；clearBotToken=true 清除已存 token（test 时 enabled 可省略） */
export interface TelegramConfigSave {
  enabled?: boolean
  botToken?: string
  clearBotToken?: boolean
  allowedUserIds?: number[]
  proxyUrl?: string
  language?: string
}

/** POST /api/telegram/test 响应 */
export interface TelegramTestResult {
  ok: boolean
  botUsername?: string
  error?: string
}

export const telegramApi = {
  /** 获取脱敏配置与运行状态（botToken 恒空串，hasKey 表示已保存） */
  getConfig(): Promise<TelegramConfigView> {
    return request('/telegram/config')
  },

  /** 保存配置并对齐 bot 运行状态，成功返回保存后的脱敏视图 */
  saveConfig(cfg: TelegramConfigSave): Promise<TelegramConfigView> {
    return request('/telegram/config', { method: 'PUT', body: JSON.stringify(cfg) })
  },

  /** 用给定（通常为草稿）配置临时 getMe 验证 token 与代理，不影响运行中的 bot */
  test(cfg: TelegramConfigSave): Promise<TelegramTestResult> {
    return request('/telegram/test', { method: 'POST', body: JSON.stringify(cfg) })
  },
}
