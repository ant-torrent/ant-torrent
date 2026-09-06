/**
 * 后端日志 API（/api/logs*，受登录保护）。
 * 日志存于后端进程内存环形缓冲（最近 2000 行），进程重启即清空；
 * 配置持久化在 settings.json 的 log 段，保存即热更新（无需重启）。
 */

import { request } from '@/services/api/client'

/** 与后端 logbuf.DefaultCap 对应（仅用于展示提示文案） */
export const LOG_CAP = 2000

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFormat = 'text' | 'json'

/** 日志配置（settings.json 的 log 段） */
export interface LogConfig {
  level: LogLevel
  format: LogFormat
  accessLog: boolean
}

export const DEFAULT_LOG_CONFIG: LogConfig = { level: 'info', format: 'text', accessLog: true }

export const logsApi = {
  /** 获取最近日志行（旧 → 新） */
  getLines(): Promise<string[]> {
    return request<{ lines: string[] }>('/logs').then((res) => res.lines ?? [])
  },

  /** 获取日志配置 */
  getConfig(): Promise<LogConfig> {
    return request<LogConfig>('/logs/config')
  },

  /** 更新日志配置，返回归一化后的生效值 */
  updateConfig(cfg: LogConfig): Promise<LogConfig> {
    return request<LogConfig>('/logs/config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    })
  },
}
