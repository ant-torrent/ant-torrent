/**
 * Go 后端 API 客户端
 *
 * 前端通过 Vite 代理 /qbt-api/* 转发到 Go 后端 (localhost:8080/api/*)。
 * Go 后端负责管理服务器配置、SID 认证、请求转发。
 */

import i18n from '@/i18n'
import type { DownloaderType } from '@/services/downloaders'
import { STATUS_GROUP_OF } from '@/services/status'
import type {
  AppPreferences,
  Peer,
  RssArticle,
  RssFeedNode,
  RssRule,
  ServerState,
  Torrent,
  TorrentFile,
  TorrentState,
  Tracker,
} from '@/services/types'

export const BASE = '/qbt-api'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ServerConfig {
  id: string
  name: string
  url: string
  username: string
  password: string
  /** 下载器类型（缺省 = qbittorrent；后端加载时对存量数据回填） */
  type?: DownloaderType
  /** agent 反向连接认证令牌（部署 agent 时写入其配置文件；后端生成） */
  agentToken?: string
}

export interface TestResult {
  success: boolean
  message?: string
}

/** 目录浏览能力探测（分层：agent 在线 > 后端同机 > 远程仅已知路径） */
export interface FsInfo {
  mode: 'agent' | 'local' | 'remote'
  /** qB 默认保存路径（作为浏览起始路径，取不到为空） */
  suggestedPath: string
  /** 后端用户家目录 */
  home: string
  /** agent 模式下上报的版本与白名单 */
  agent?: {
    version: string
    allowedDirs: string[]
  }
}

export interface FsEntry {
  name: string
  path: string
}

export interface FsListResult {
  path: string
  /** 根目录为空串 */
  parent: string
  entries: FsEntry[]
}

/** 服务器 agent 在线状态 */
export interface AgentStatus {
  online: boolean
  version: string
  allowedDirs: string[] | null
}

/** qBittorrent 分类（名称 + 保存路径） */
export interface QbtCategory {
  name: string
  savePath: string
}

/** 添加种子参数（对应 qBittorrent /api/v2/torrents/add） */
export interface AddTorrentParams {
  /** 换行分隔的 magnet/http 链接 */
  urls?: string
  /** .torrent 文件列表（接受 File / Blob / RcFile） */
  torrents?: (File | Blob)[]
  savepath?: string
  category?: string
  /** 逗号分隔 */
  tags?: string
  paused?: boolean
  skipChecking?: boolean
  rootFolder?: boolean
  rename?: string
  /** bytes/s */
  upLimit?: number
  /** bytes/s */
  dlLimit?: number
  ratioLimit?: number
  /** minutes */
  seedingTimeLimit?: number
  autoTMM?: boolean
  sequentialDownload?: boolean
  firstLastPiecePrio?: boolean
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * 提取错误提示文本：后端 JSON 的 error 字段优先（Go 端已按 Accept-Language 本地化）；
 * HTML 响应（nginx 500/502 错误页等）降级为「HTTP 状态码」一行，
 * 避免整页标记被原样塞进 message/Alert；其余非空纯文本保留原文。
 */
export function extractErrorDetail(status: number, statusText: string, body: string): string {
  const trimmed = body.trim()
  if (trimmed.startsWith('{')) {
    try {
      const detail = (JSON.parse(trimmed) as { error?: unknown }).error
      if (typeof detail === 'string' && detail) return detail
    } catch {
      // 非法 JSON，走下方兜底
    }
  }
  if (trimmed === '' || trimmed.startsWith('<')) {
    return `HTTP ${status}: ${statusText}`
  }
  return trimmed
}

/** API 错误：message 为可展示文案，status 供调用方按状态码分支（如 401） */
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/* ------------------------------------------------------------------ */
/* 401 统一分发（零依赖，避免 client ↔ authStore 循环 import）          */
/* ------------------------------------------------------------------ */

const unauthorizedListeners = new Set<() => void>()
/** 去重窗口：会话过期瞬间轮询风暴会并发打出多个 401，1 秒内只触发一次 */
let unauthorizedFired = false

/** 注册未认证回调（由 AuthGate 订阅，切回登录页）；返回退订函数 */
export function onUnauthorized(cb: () => void): () => void {
  unauthorizedListeners.add(cb)
  return () => unauthorizedListeners.delete(cb)
}

function fireUnauthorized(): void {
  if (unauthorizedFired) return
  unauthorizedFired = true
  setTimeout(() => {
    unauthorizedFired = false
  }, 1000)
  for (const cb of unauthorizedListeners) cb()
}

/**
 * 受保护接口 401 时通知登出。auth 自身路径（/auth/login、/auth/password 等）
 * 的 401 是「密码错误」语义，不得触发登出跳转。
 */
export function handleAuthStatus(path: string, status: number): void {
  if (status === 401 && !path.startsWith('/auth/')) fireUnauthorized()
}

/** 后端错误响应统一抛 ApiError（message 兼容旧 Error 用法） */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      // 后端据此返回对应语言的错误文案
      'Accept-Language': i18n.language,
      ...init?.headers,
    },
  })
  if (!res.ok) {
    handleAuthStatus(path, res.status)
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, extractErrorDetail(res.status, res.statusText, body))
  }
  // 204/空响应
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** 后端返回纯文本的接口（qBittorrent /app/version 等），失败时抛错 */
async function requestText(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Accept-Language': i18n.language },
  })
  if (!res.ok) {
    handleAuthStatus(path, res.status)
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, extractErrorDetail(res.status, res.statusText, body))
  }
  return (await res.text()).trim()
}

/** qBittorrent 动作类端点通用表单 POST（hashes 竖线分隔等），失败时抛后端本地化错误 */
async function postForm(path: string, params: Record<string, string>): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Language': i18n.language,
    },
    body: new URLSearchParams(params).toString(),
  })
  if (!res.ok) {
    handleAuthStatus(path, res.status)
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, extractErrorDetail(res.status, res.statusText, body))
  }
}

/* ------------------------------------------------------------------ */
/* Server management API                                               */
/* ------------------------------------------------------------------ */

export const serverApi = {
  /** 获取所有服务器配置 */
  listServers(): Promise<ServerConfig[]> {
    return request('/servers')
  },

  /** 创建新服务器 */
  createServer(cfg: Omit<ServerConfig, 'id'>): Promise<ServerConfig> {
    return request('/servers', {
      method: 'POST',
      body: JSON.stringify(cfg),
    })
  },

  /** 更新服务器配置 */
  updateServer(id: string, patch: Partial<ServerConfig>): Promise<ServerConfig> {
    return request(`/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
  },

  /** 删除服务器 */
  deleteServer(id: string): Promise<void> {
    return request(`/servers/${id}`, { method: 'DELETE' })
  },

  /** 测试连接（登录 qBittorrent 实例）；overrides 用于测试未保存的草稿 */
  testConnection(serverId: string, overrides?: Partial<Pick<ServerConfig, 'url' | 'username' | 'password'>>): Promise<TestResult> {
    return request(`/servers/${serverId}/test-connection`, {
      method: 'POST',
      ...(overrides && {
        body: JSON.stringify({
          url: overrides.url || undefined,
          username: overrides.username || undefined,
          password: overrides.password || undefined,
        }),
      }),
    })
  },

  /** 查询服务器 agent 在线状态 */
  getAgentStatus(serverId: string): Promise<AgentStatus> {
    return request(`/servers/${serverId}/agent/status`)
  },

  /** 重新生成 agent token（旧 token 立即失效，在线 agent 会被断开） */
  regenerateAgentToken(serverId: string): Promise<{ token: string }> {
    return request(`/servers/${serverId}/agent-token`, { method: 'POST' })
  },
}

/* ------------------------------------------------------------------ */
/* Filesystem browsing API (agent / backend-local)                     */
/* ------------------------------------------------------------------ */

export const fsApi = {
  /** 探测该服务器可用的目录浏览模式与起始路径建议 */
  info(serverId: string): Promise<FsInfo> {
    return request(`/servers/${serverId}/fs/info`)
  },

  /** 列目录（仅子目录）；path 为空时后端返回默认起始目录 */
  list(serverId: string, path: string): Promise<FsListResult> {
    const query = path ? `?path=${encodeURIComponent(path)}` : ''
    return request(`/servers/${serverId}/fs/list${query}`)
  },
}

/* ------------------------------------------------------------------ */
/* qBittorrent API (through Go backend proxy)                          */
/* ------------------------------------------------------------------ */

/** JS 字段名 → qBittorrent API 参数名 */
const ADD_FIELD_MAP: Record<string, string> = {
  savepath: 'savepath',
  category: 'category',
  tags: 'tags',
  paused: 'paused',
  skipChecking: 'skip_checking',
  rootFolder: 'root_folder',
  rename: 'rename',
  upLimit: 'upLimit',
  dlLimit: 'dlLimit',
  ratioLimit: 'ratioLimit',
  seedingTimeLimit: 'seedingTimeLimit',
  autoTMM: 'autoTMM',
  sequentialDownload: 'sequentialDownload',
  firstLastPiecePrio: 'firstLastPiecePrio',
}

export const qbtApi = {
  /* ---------------------------------------------------------------- */
  /* 偏好设置（经 Go 后端代理直连 qBittorrent /api/v2/app/*）          */
  /* ---------------------------------------------------------------- */

  /** 获取全部偏好（qBittorrent 返回的完整 JSON，含掩码密码字段） */
  getPreferences(serverId: string): Promise<AppPreferences> {
    return request(`/servers/${serverId}/qbt/v2/app/preferences`)
  },

  /** qBittorrent 应用版本（纯文本，如 v5.2.3） */
  getVersion(serverId: string): Promise<string> {
    return requestText(`/servers/${serverId}/qbt/v2/app/version`)
  },

  /** qBittorrent WebAPI 版本（纯文本，如 2.15.1） */
  getWebApiVersion(serverId: string): Promise<string> {
    return requestText(`/servers/${serverId}/qbt/v2/app/webapiVersion`)
  },

  /** qBittorrent 默认保存路径（纯文本；远程服务器浏览弹窗的候选来源之一） */
  getDefaultSavePath(serverId: string): Promise<string> {
    return requestText(`/servers/${serverId}/qbt/v2/app/defaultSavePath`)
  },

  /**
   * 保存偏好（部分更新：仅下发传入的键，不影响其他配置项）。
   * qBittorrent 要求表单字段 json 携带 JSON 字符串；
   * 掩码密码字段（getPreferences 不回传真实值）为空时跳过，避免清空 qB 端密码。
   */
  async setPreferences(serverId: string, prefs: Partial<AppPreferences>): Promise<void> {
    const payload: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(prefs)) {
      if ((key === 'web_ui_password' || key === 'mail_notification_password') && value === '') continue
      if (value !== undefined) payload[key] = value
    }
    await postForm(`/servers/${serverId}/qbt/v2/app/setPreferences`, { json: JSON.stringify(payload) })
  },

  /** 添加种子（multipart/form-data） */
  async addTorrents(serverId: string, params: AddTorrentParams): Promise<void> {
    const fd = new FormData()
    if (params.urls) fd.append('urls', params.urls)
    if (params.torrents) {
      for (const file of params.torrents) {
        fd.append('torrents', file)
      }
    }
    for (const [jsKey, apiKey] of Object.entries(ADD_FIELD_MAP)) {
      const val = (params as Record<string, unknown>)[jsKey]
      if (val !== undefined && val !== '' && val !== null) {
        fd.append(apiKey, String(val))
      }
    }
    const res = await fetch(`${BASE}/servers/${serverId}/qbt/v2/torrents/add`, {
      method: 'POST',
      body: fd,
      headers: { 'Accept-Language': i18n.language },
    })
    if (res.status === 415) throw new Error('torrent file is not valid')
    if (!res.ok) {
      handleAuthStatus(`/servers/${serverId}/qbt/v2/torrents/add`, res.status)
      const body = await res.text().catch(() => '')
      throw new ApiError(res.status, extractErrorDetail(res.status, res.statusText, body))
    }
  },

  /* ---------------------------------------------------------------- */
  /* 分类管理（Go 后端类型化端点，转发 qBittorrent）                    */
  /* ---------------------------------------------------------------- */

  /** 获取全部分类 */
  getCategories(serverId: string): Promise<QbtCategory[]> {
    return request(`/servers/${serverId}/torrents/categories`)
  },

  /** 新建分类（savePath 可为空） */
  createCategory(serverId: string, name: string, savePath: string): Promise<void> {
    return request(`/servers/${serverId}/torrents/categories`, {
      method: 'POST',
      body: JSON.stringify({ name, savePath }),
    })
  },

  /** 编辑分类保存路径 */
  editCategory(serverId: string, name: string, savePath: string): Promise<void> {
    return request(`/servers/${serverId}/torrents/categories`, {
      method: 'PUT',
      body: JSON.stringify({ name, savePath }),
    })
  },

  /** 删除一个或多个分类 */
  removeCategories(serverId: string, names: string[]): Promise<void> {
    return request(`/servers/${serverId}/torrents/categories`, {
      method: 'DELETE',
      body: JSON.stringify({ names }),
    })
  },

  /* ---------------------------------------------------------------- */
  /* 标签管理（Go 后端类型化端点，转发 qBittorrent）                    */
  /* ---------------------------------------------------------------- */

  /** 获取全部标签 */
  getTags(serverId: string): Promise<string[]> {
    return request(`/servers/${serverId}/torrents/tags`)
  },

  /** 创建一个或多个标签 */
  createTags(serverId: string, tags: string[]): Promise<void> {
    return request(`/servers/${serverId}/torrents/tags`, {
      method: 'POST',
      body: JSON.stringify({ tags }),
    })
  },

  /** 删除一个或多个标签 */
  deleteTags(serverId: string, tags: string[]): Promise<void> {
    return request(`/servers/${serverId}/torrents/tags`, {
      method: 'DELETE',
      body: JSON.stringify({ tags }),
    })
  },
}

/* ------------------------------------------------------------------ */
/* Torrents API (种子列表轮询 / 详情 / 动作，经 Go 后端代理)             */
/* ------------------------------------------------------------------ */

/**
 * qB /sync/maindata 的原始响应。
 * torrents 的值与 /torrents/info 行字段一致（文档明确 "same as torrent list"），
 * server_state 为全局传输状态（含 alltime/剩余空间/备用限速开关，/transfer/info 反而没有这些）。
 */
export interface QbtMaindata {
  rid: number
  full_update: boolean
  /** hash → 种子行 */
  torrents: Record<string, QbtTorrentRow>
  torrents_removed?: string[]
  server_state: Record<string, unknown>
}

/** qB 种子行原始形态：字段与 Torrent 对齐但都可能缺失；v5 私有标记为 isPrivate */
export type QbtTorrentRow = Partial<Torrent> & {
  hash: string
  name: string
  state?: string
  /** qB 5.0+ 私有种子（旧版字段名 private） */
  isPrivate?: boolean
}

/** qB /torrents/properties 原始响应（供详情抽屉组装 TorrentDetail） */
export interface QbtTorrentProperties {
  comment?: string
  created_by?: string
  creation_date?: number
  seeding_time?: number
  nb_connections?: number
  total_download?: number
  total_uploaded?: number
  share_ratio?: number
  piece_size?: number
  total_pieces?: number
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const bool = (v: unknown): boolean => v === true

/** qB 5.x 实际返回 stoppedUP/stoppedDL（旧版为 pausedUP/pausedDL），统一归一到前端枚举 */
const STATE_ALIASES: Record<string, TorrentState> = {
  stoppedUP: 'pausedUP',
  stoppedDL: 'pausedDL',
}

function normalizeState(raw: unknown): TorrentState {
  const s = typeof raw === 'string' ? raw : ''
  return STATE_ALIASES[s] ?? (s in STATUS_GROUP_OF ? (s as TorrentState) : 'unknown')
}

function mapTorrentRow(row: QbtTorrentRow, srv: { id: string; name: string }): Torrent {
  // qB 实际返回全部字段（maindata 与 torrents/info 同构），这里只修正版本差异并盖章归属
  return {
    ...(row as Torrent),
    state: normalizeState(row.state),
    private: row.isPrivate ?? row.private ?? false,
    server_id: srv.id,
    server_name: srv.name,
  }
}

/** 从 maindata.server_state 挑出 ServerState 字段；maindata 不含 uptime（保持 0） */
function normalizeServerState(raw: Record<string, unknown>): ServerState {
  const status = raw.connection_status
  return {
    dl_info_speed: num(raw.dl_info_speed),
    dl_info_data: num(raw.dl_info_data),
    up_info_speed: num(raw.up_info_speed),
    up_info_data: num(raw.up_info_data),
    dht_nodes: num(raw.dht_nodes),
    connection_status:
      status === 'connected' || status === 'firewalled' || status === 'disconnected' ? status : 'disconnected',
    alltime_dl: num(raw.alltime_dl),
    alltime_ul: num(raw.alltime_ul),
    free_space_on_disk: num(raw.free_space_on_disk),
    use_alt_speed_limits: bool(raw.use_alt_speed_limits),
    uptime: 0,
  }
}

export const torrentsApi = {
  /**
   * 拉取单台服务器的全量快照（rid=0 恒为全量）：种子列表 + 服务器状态。
   * 比 torrents/info + transfer/info 少一次请求，且附带仪表盘所需的
   * alltime/剩余空间/备用限速等字段（transfer/info 缺失这些）。
   */
  async getSnapshot(serverId: string, serverName: string): Promise<{ torrents: Torrent[]; server: ServerState }> {
    const md = await request<QbtMaindata>(`/servers/${serverId}/qbt/v2/sync/maindata?rid=0`)
    // maindata 的 torrents 是 { hash: row }，行内不含 hash 字段——必须从 key 带入
    const torrents = Object.entries(md.torrents ?? {})
      .map(([hash, row]) => mapTorrentRow({ ...row, hash }, { id: serverId, name: serverName }))
      // maindata 的 map 顺序不稳定，按添加时间倒序保证表格展示稳定
      .sort((a, b) => b.added_on - a.added_on)
    return { torrents, server: normalizeServerState(md.server_state ?? {}) }
  },

  /* ---- 种子动作（qB v5：stop/start，无 pause/resume 端点）---- */

  /** 暂停（qB stop） */
  stopTorrents(serverId: string, hashes: string[]): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/stop`, { hashes: hashes.join('|') })
  },

  /** 恢复（qB start） */
  startTorrents(serverId: string, hashes: string[]): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/start`, { hashes: hashes.join('|') })
  },

  /** 重新校验 */
  recheckTorrents(serverId: string, hashes: string[]): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/recheck`, { hashes: hashes.join('|') })
  },

  /** 删除种子；deleteFiles 同时删除磁盘文件 */
  deleteTorrents(serverId: string, hashes: string[], deleteFiles: boolean): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/delete`, {
      hashes: hashes.join('|'),
      deleteFiles: String(deleteFiles),
    })
  },

  /** 切换备用速度限制 */
  toggleSpeedLimitsMode(serverId: string): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/transfer/toggleSpeedLimitsMode`, {})
  },

  /* ---- 种子右键菜单动作 ---- */

  /** 强制开始 / 取消强制开始 */
  setForceStart(serverId: string, hashes: string[], value: boolean): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/setForceStart`, {
      hashes: hashes.join('|'),
      value: String(value),
    })
  },

  /**
   * 设置分类（空串 = 移除分类）。qB 文档约定 setCategory 遇到不存在的分类返回 409，
   * 新名称先幂等创建一次（已存在时忽略其 409）再设置。
   */
  async setCategory(serverId: string, hashes: string[], category: string): Promise<void> {
    if (category) {
      await postForm(`/servers/${serverId}/qbt/v2/torrents/createCategory`, {
        category,
        savePath: '',
      }).catch(() => undefined)
    }
    return postForm(`/servers/${serverId}/qbt/v2/torrents/setCategory`, {
      hashes: hashes.join('|'),
      category,
    })
  },

  /** 添加标签（逗号分隔；qB 会自动创建不存在的标签） */
  addTags(serverId: string, hashes: string[], tags: string[]): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/addTags`, {
      hashes: hashes.join('|'),
      tags: tags.join(','),
    })
  },

  /** 移除标签（空列表 = 移除全部标签） */
  removeTags(serverId: string, hashes: string[], tags: string[]): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/removeTags`, {
      hashes: hashes.join('|'),
      tags: tags.join(','),
    })
  },

  /** 设置下载限速（bytes/s；0 = 不限速） */
  setDownloadLimit(serverId: string, hashes: string[], limit: number): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/setDownloadLimit`, {
      hashes: hashes.join('|'),
      limit: String(limit),
    })
  },

  /** 设置上传限速（bytes/s；0 = 不限速） */
  setUploadLimit(serverId: string, hashes: string[], limit: number): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/setUploadLimit`, {
      hashes: hashes.join('|'),
      limit: String(limit),
    })
  },

  /** 设置分享率 / 做种时间限制（-2 = 跟随全局，-1 = 不限制） */
  setShareLimits(
    serverId: string,
    hashes: string[],
    limits: { ratioLimit?: number; seedingTimeLimit?: number },
  ): Promise<void> {
    const params: Record<string, string> = { hashes: hashes.join('|') }
    if (limits.ratioLimit !== undefined) params.ratioLimit = String(limits.ratioLimit)
    if (limits.seedingTimeLimit !== undefined) params.seedingTimeLimit = String(limits.seedingTimeLimit)
    return postForm(`/servers/${serverId}/qbt/v2/torrents/setShareLimits`, params)
  },

  /** 移动保存路径（目录不存在时 qB 会尝试创建，失败则保持原路径） */
  setLocation(serverId: string, hashes: string[], location: string): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/setLocation`, {
      hashes: hashes.join('|'),
      location,
    })
  },

  /**
   * 设置种子内全部文件的下载优先级（0 不下载 / 1 正常 / 6 高 / 7 最高）。
   * filePrio 单次只接受一个 hash，且 id=all 在 qB v5 返回 400——需先取文件表再全量下发。
   */
  async setAllFilesPriority(serverId: string, hashes: string[], priority: number): Promise<void> {
    await Promise.all(
      hashes.map(async (hash) => {
        const files = await this.getFiles(serverId, hash)
        const ids = files.map((f) => f.index).join('|')
        if (!ids) return
        await postForm(`/servers/${serverId}/qbt/v2/torrents/filePrio`, {
          hash,
          id: ids,
          priority: String(priority),
        })
      }),
    )
  },

  /** 自动种子管理（TMM）开关 */
  setAutoManagement(serverId: string, hashes: string[], enable: boolean): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/setAutoManagement`, {
      hashes: hashes.join('|'),
      enable: String(enable),
    })
  },

  /* ---- 种子详情（供详情抽屉）---- */

  /** 种子属性（备注/创建者/连接数等） */
  getProperties(serverId: string, hash: string): Promise<QbtTorrentProperties> {
    return request(`/servers/${serverId}/qbt/v2/torrents/properties?hash=${encodeURIComponent(hash)}`)
  },

  /** Tracker 列表（qB 字段 num_peers 等 → 前端 Tracker 字段） */
  async getTrackers(serverId: string, hash: string): Promise<Tracker[]> {
    const rows = await request<Record<string, unknown>[]>(
      `/servers/${serverId}/qbt/v2/torrents/trackers?hash=${encodeURIComponent(hash)}`,
    )
    return rows.map((r) => ({
      url: str(r.url),
      tier: num(r.tier),
      status: num(r.status),
      peers: num(r.num_peers),
      seeds: num(r.num_seeds),
      leeches: num(r.num_leeches),
      downloaded: num(r.num_downloaded),
      msg: str(r.msg),
    }))
  },

  /** 添加 Tracker（qB 约定多个 URL 用换行分隔） */
  addTrackers(serverId: string, hash: string, urls: string[]): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/addTrackers`, {
      hash,
      urls: urls.join('\n'),
    })
  },

  /** 修改单个 Tracker 地址（origUrl 需与现有条目精确匹配） */
  editTracker(serverId: string, hash: string, origUrl: string, newUrl: string): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/editTracker`, {
      hash,
      origUrl,
      newUrl,
    })
  },

  /** 移除 Tracker（qB 约定多个 URL 用换行分隔） */
  removeTrackers(serverId: string, hash: string, urls: string[]): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/torrents/removeTrackers`, {
      hash,
      urls: urls.join('\n'),
    })
  },

  /** 文件列表 */
  async getFiles(serverId: string, hash: string): Promise<TorrentFile[]> {
    const rows = await request<Record<string, unknown>[]>(
      `/servers/${serverId}/qbt/v2/torrents/files?hash=${encodeURIComponent(hash)}`,
    )
    return rows.map((r) => ({
      index: num(r.index),
      name: str(r.name),
      size: num(r.size),
      progress: num(r.progress),
      priority: num(r.priority),
      availability: num(r.availability),
    }))
  },

  /** Peer 列表（/sync/torrentPeers；peers 可能是数组或按 ip:port 索引的对象） */
  async getPeers(serverId: string, hash: string): Promise<Peer[]> {
    const data = await request<{ peers?: unknown }>(
      `/servers/${serverId}/qbt/v2/sync/torrentPeers?hash=${encodeURIComponent(hash)}&rid=0`,
    )
    const peers = data.peers
    const list = Array.isArray(peers) ? peers : Object.values((peers as Record<string, unknown>) ?? {})
    return list.map((p) => {
      const r = (p ?? {}) as Record<string, unknown>
      return {
        ip: str(r.ip),
        port: num(r.port),
        client: str(r.client),
        progress: num(r.progress),
        dl_speed: num(r.dl_speed),
        up_speed: num(r.up_speed),
        downloaded: num(r.downloaded),
        uploaded: num(r.uploaded),
        connection: str(r.connection),
        flags: str(r.flags),
        relevance: num(r.relevance),
      }
    })
  },
}

/* ------------------------------------------------------------------ */
/* RSS 订阅（/api/v2/rss/*）                                           */
/*                                                                    */
/* 实测参数名（qB 4.6.7 与 5.x 一致，旧文档的 path/src/dest 已废弃）：  */
/*   列表 GET rss/items?withData=true；addFeed(url, path)、             */
/*   addFolder/removeItem(path)、moveItem(itemPath, destPath)、         */
/*   refreshItem(itemPath)、markAsRead(itemPath, articleId?)            */
/* ------------------------------------------------------------------ */

/** /rss/items 原始条目：feed 带 url 字段，folder 的 value 即嵌套子节点 */
type RawRssItem = Record<string, unknown>

function parseRssArticles(raw: unknown): RssArticle[] {
  if (!Array.isArray(raw)) return []
  return raw.map((a) => {
    const r = a as RawRssItem
    return {
      id: str(r.id),
      date: r.date === undefined ? '' : String(r.date),
      title: str(r.title),
      link: str(r.link),
      // 实测两代 qB 均为 torrentURL（全大写），兼容历史小写写法
      torrentUrl: str(r.torrentURL ?? r.torrentUrl),
      description: str(r.description),
      isRead: r.isRead === true,
    }
  })
}

/** 递归解析嵌套订阅树；folder 排前、同类按名称排序 */
function parseRssNode(raw: RawRssItem, path: string, name: string): RssFeedNode {
  const isFolder = raw.url === undefined
  const children: RssFeedNode[] = []
  if (isFolder) {
    for (const [childName, child] of Object.entries(raw)) {
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        children.push(parseRssNode(child as RawRssItem, `${path}\\${childName}`, childName))
      }
    }
    children.sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : a.isFolder ? -1 : 1))
  }
  return {
    path,
    name,
    isFolder,
    uid: str(raw.uid),
    url: str(raw.url),
    title: str(raw.title),
    isLoading: raw.isLoading === true,
    hasError: raw.hasError === true,
    articles: isFolder ? [] : parseRssArticles(raw.articles),
    children,
  }
}

export const rssApi = {
  /** 订阅树（withData 附带文章列表） */
  async getFeeds(serverId: string, withData = true): Promise<RssFeedNode[]> {
    const root = await request<Record<string, RawRssItem>>(
      `/servers/${serverId}/qbt/v2/rss/items?withData=${withData}`,
    )
    const nodes = Object.entries(root).map(([name, v]) =>
      v && typeof v === 'object' ? parseRssNode(v, name, name) : null,
    )
    const list = nodes.filter((n): n is RssFeedNode => n !== null)
    list.sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : a.isFolder ? -1 : 1))
    return list
  },

  /** 添加订阅（path 为含名称的完整路径，如 folder\name） */
  addFeed(serverId: string, url: string, path: string): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/rss/addFeed`, { url, path })
  },

  /** 新建文件夹 */
  addFolder(serverId: string, path: string): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/rss/addFolder`, { path })
  },

  /** 删除订阅或文件夹（文件夹连同其下所有内容） */
  removeItem(serverId: string, path: string): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/rss/removeItem`, { path })
  },

  /** 移动 / 重命名（目标为含名称的完整路径） */
  moveItem(serverId: string, itemPath: string, destPath: string): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/rss/moveItem`, { itemPath, destPath })
  },

  /** 立即拉取订阅（fetch 异步进行，稍后需重新 getFeeds 才能看到新文章） */
  refreshItem(serverId: string, itemPath: string): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/rss/refreshItem`, { itemPath })
  },

  /** 标记已读（缺省 articleId 时标记该订阅全部文章） */
  markAsRead(serverId: string, itemPath: string, articleId?: string): Promise<void> {
    return postForm(
      `/servers/${serverId}/qbt/v2/rss/markAsRead`,
      articleId === undefined ? { itemPath } : { itemPath, articleId },
    )
  },

  /* ---------- 下载规则（/rss/rules 系列） ---------- */

  /** 规则列表（按名称排序） */
  async getRules(serverId: string): Promise<RssRule[]> {
    const raw = await request<Record<string, RawRssRule>>(
      `/servers/${serverId}/qbt/v2/rss/rules`,
    )
    return Object.entries(raw)
      .map(([name, def]) => parseRssRule(name, def))
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  /**
   * 创建/更新规则（setRule 为全量替换：def 以 raw 为底、当前值覆盖，
   * 未映射字段原样保留）。ruleName 即规则名，重命名需先调 renameRule。
   *
   * qB 5.x 兼容：ruleDef 携带 torrentParams 时它整体接管保存路径/分类/
   * 暂停/内容布局（顶层 savePath 等字段被忽略，实测空值也会覆盖），
   * 必须把编辑值同步进 torrentParams；4.x 无该对象，顶层字段原生生效。
   */
  setRule(serverId: string, name: string, rule: RssRule): Promise<void> {
    const { raw, name: _name, lastMatch: _lastMatch, ...def } = rule
    const payload: Record<string, unknown> = { ...raw, ...def }
    if (raw.torrentParams && typeof raw.torrentParams === 'object') {
      const tp = { ...(raw.torrentParams as Record<string, unknown>) }
      tp.save_path = def.savePath
      tp.category = def.assignedCategory
      // null = 跟随全局：从 torrentParams 移除该键，保留服务器原有“无偏好”语义
      if (def.addPaused === null) delete tp.stopped
      else tp.stopped = def.addPaused
      if (def.torrentContentLayout === null) delete tp.content_layout
      else tp.content_layout = def.torrentContentLayout
      payload.torrentParams = tp
    }
    return postForm(`/servers/${serverId}/qbt/v2/rss/setRule`, {
      ruleName: name,
      ruleDef: JSON.stringify(payload),
    })
  },

  /** 重命名规则 */
  renameRule(serverId: string, ruleName: string, newRuleName: string): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/rss/renameRule`, { ruleName, newRuleName })
  },

  /** 删除规则 */
  removeRule(serverId: string, ruleName: string): Promise<void> {
    return postForm(`/servers/${serverId}/qbt/v2/rss/removeRule`, { ruleName })
  },
}

/** /rss/rules 单条 ruleDef 原始对象 */
type RawRssRule = Record<string, unknown>

/** 新建规则的空白定义 */
export function blankRssRule(name: string): RssRule {
  return {
    name,
    enabled: true,
    mustContain: '',
    mustNotContain: '',
    useRegex: false,
    episodeFilter: '',
    smartFilter: false,
    affectedFeeds: [],
    assignedCategory: '',
    savePath: '',
    addPaused: null,
    torrentContentLayout: null,
    lastMatch: '',
    raw: {},
  }
}

function parseRssRule(name: string, raw: RawRssRule): RssRule {
  return {
    ...blankRssRule(name),
    enabled: raw.enabled !== false,
    mustContain: str(raw.mustContain),
    mustNotContain: str(raw.mustNotContain),
    useRegex: raw.useRegex === true,
    episodeFilter: str(raw.episodeFilter),
    smartFilter: raw.smartFilter === true,
    affectedFeeds: Array.isArray(raw.affectedFeeds) ? raw.affectedFeeds.map(String) : [],
    assignedCategory: str(raw.assignedCategory),
    savePath: str(raw.savePath),
    addPaused: typeof raw.addPaused === 'boolean' ? raw.addPaused : null,
    torrentContentLayout:
      typeof raw.torrentContentLayout === 'string' ? raw.torrentContentLayout : null,
    lastMatch: str(raw.lastMatch),
    raw,
  }
}
