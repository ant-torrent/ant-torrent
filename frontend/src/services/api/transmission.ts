/**
 * Transmission 适配层（/api/servers/:id/tr/*，后端为 JSON-RPC 2.0 薄封装）。
 *
 * 约定：后端保持 Transmission 原生 snake_case 字段透传，本文件的三个纯映射函数
 * （mapTrTorrent / mapTrServerState / mapTrStatus）负责转换成前端 UI 模型
 * （qB 19 态枚举作前端标准）。数值字段全部兜底，防止列排序 NaN。
 */

import i18n from '@/i18n'
import {
  ApiError,
  extractErrorDetail,
  handleAuthStatus,
  request,
} from '@/services/api/client'
import type { Peer, ServerState, Torrent, TorrentDetail, TorrentFile, TorrentState, Tracker } from '@/services/types'


type TrRow = Record<string, unknown>

/** 行字段数值兜底（缺省/类型不符 → 0） */
const numberOf = (row: TrRow, k: string): number =>
  typeof row[k] === 'number' ? (row[k] as number) : 0

/** 行字段对象数组兜底（files/peers/tracker_stats 等） */
const arrayRows = (row: TrRow, k: string): TrRow[] =>
  Array.isArray(row[k]) ? (row[k] as TrRow[]) : []

/** 行字段布尔数组兜底（tr 4.1 起为真 boolean） */
const boolArray = (row: TrRow, k: string): boolean[] =>
  Array.isArray(row[k]) ? (row[k] as boolean[]) : []

/** 行字段数值数组兜底 */
const numberArray = (row: TrRow, k: string): number[] =>
  Array.isArray(row[k]) ? (row[k] as number[]) : []

/** getDetail 返回：抽屉消费的详情（不含 torrent 本身，调用方自行组合） */
type TrTorrentDetail = Omit<TorrentDetail, 'torrent'>

/** tr 状态 → qB 状态枚举（枚举已对照官方 4.0.6/main 文档双重核实） */
export function mapTrStatus(row: TrRow): TorrentState {
  const num = (k: string) => (typeof row[k] === 'number' ? (row[k] as number) : 0)
  const bool = (k: string) => row[k] === true
  // 本地错误（tracker 错误不改变状态，与 qB 行为一致）
  if (num('error') === 3) return 'error'
  switch (num('status')) {
    case 0: return num('percent_done') < 1 ? 'pausedDL' : 'pausedUP'
    case 1: case 2: return num('percent_done') < 1 ? 'checkingDL' : 'checkingUP'
    case 3: return 'queuedDL'
    case 4:
      return num('metadata_percent_complete') < 1
        ? 'metaDL'
        : num('rate_download') > 0 || !bool('is_stalled') ? 'downloading' : 'stalledDL'
    case 5: return 'queuedUP'
    case 6:
      return num('rate_upload') > 0 || !bool('is_stalled') ? 'uploading' : 'stalledUP'
    default: return 'unknown'
  }
}

/** tr 限速（KB/s + limited）→ qB 语义（B/s，-1 = 无限） */
function trLimitToQb(row: TrRow, limitedKey: string, limitKey: string): number {
  if (row[limitedKey] === true && typeof row[limitKey] === 'number') {
    return (row[limitKey] as number) * 1024
  }
  return -1
}

/** tr 分享限制模式 → qB 语义（-2 跟随全局 / -1 不限 / ≥0 自定义）。
 *  tr seedRatioMode 官方语义：0 跟随全局、1 使用 seed_ratio_limit、2 不限 */
function trSeedRatioToQb(row: TrRow): number {
  const mode = typeof row.seed_ratio_mode === 'number' ? row.seed_ratio_mode : 0
  if (mode === 2) return -1
  if (mode === 1 && typeof row.seed_ratio_limit === 'number') return row.seed_ratio_limit
  return -2
}

/** 单行映射：tr snake_case → Torrent（显式构造全字段，数值兜底 0） */
export function mapTrTorrent(row: TrRow, server: { id: string; name: string }): Torrent {
  const num = (k: string) => (typeof row[k] === 'number' ? (row[k] as number) : 0)
  const labels = Array.isArray(row.labels) ? (row.labels as string[]) : []
  const trackerStats = Array.isArray(row.tracker_stats) ? (row.tracker_stats as TrRow[]) : []
  const firstTracker = trackerStats.length > 0 && typeof trackerStats[0].announce === 'string'
    ? (trackerStats[0].announce as string)
    : ''
  const swarmSeeds = Math.max(0, ...trackerStats.map((t) => (typeof t.seeder_count === 'number' ? t.seeder_count : 0)))
  const swarmLeeches = Math.max(0, ...trackerStats.map((t) => (typeof t.leecher_count === 'number' ? t.leecher_count : 0)))
  const doneDate = num('done_date')

  return {
    hash: typeof row.hash_string === 'string' ? row.hash_string : '',
    name: typeof row.name === 'string' ? row.name : '',
    size: num('size_when_done'),
    progress: num('percent_done'),
    state: mapTrStatus(row),
    dlspeed: num('rate_download'),
    upspeed: num('rate_upload'),
    downloaded: num('downloaded_ever'),
    uploaded: num('uploaded_ever'),
    downloaded_session: 0, // tr 无按种子会话量
    uploaded_session: 0,
    // tr eta<0 表示未知/无限 → qB 的 ∞ 语义
    eta: num('eta') < 0 ? 8640000 : num('eta'),
    ratio: num('upload_ratio'),
    added_on: num('added_date'),
    completion_on: doneDate > 0 ? doneDate : -1,
    category: '', // tr 无分类概念
    tags: labels.join(','),
    num_seeds: num('peers_sending_to_us'),
    num_leechs: num('peers_getting_from_us'),
    num_complete: swarmSeeds,
    num_incomplete: swarmLeeches,
    tracker: firstTracker,
    trackers_count: trackerStats.length,
    availability: 0, // tr 无对应字段
    save_path: typeof row.download_dir === 'string' ? row.download_dir : '',
    content_path: typeof row.download_dir === 'string' ? row.download_dir : '',
    magnet_uri: typeof row.magnet_link === 'string' ? row.magnet_link : '',
    private: row.is_private === true,
    force_start: false, // tr start-now 是一次性动作，无持久标志
    auto_tmm: false, // tr 无该概念
    last_activity: num('activity_date'),
    amount_left: num('left_until_done'),
    completed: num('size_when_done') - num('left_until_done'),
    dl_limit: trLimitToQb(row, 'download_limited', 'download_limit'),
    up_limit: trLimitToQb(row, 'upload_limited', 'upload_limit'),
    f_l_piece_prio: false,
    max_ratio: trSeedRatioToQb(row),
    max_seeding_time: -2, // tr 闲置做种限制语义不同，MVP 显示「跟随全局」
    priority: num('queue_position'),
    ratio_limit: -2,
    reannounce: 0, // tr 无对应字段
    seeding_time: num('seconds_seeding'),
    seeding_time_limit: -2,
    seen_complete: 0,
    seq_dl: row.sequential_download === true,
    super_seeding: false,
    time_active: num('seconds_active'),
    total_size: num('total_size'),
    server_id: server.id,
    server_name: server.name,
  }
}

/** session-stats + free_space → ServerState */
export function mapTrServerState(stats: TrRow, freeSpace: number): ServerState {
  const sub = (obj: unknown, k: string) =>
    obj && typeof obj === 'object' && typeof (obj as TrRow)[k] === 'number' ? (obj as TrRow)[k] as number : 0
  const num = (k: string) => (typeof stats[k] === 'number' ? (stats[k] as number) : 0)
  return {
    dl_info_speed: num('download_speed'),
    dl_info_data: sub(stats.current_stats, 'downloaded_bytes'),
    up_info_speed: num('upload_speed'),
    up_info_data: sub(stats.current_stats, 'uploaded_bytes'),
    dht_nodes: 0, // tr RPC 无对应字段
    connection_status: 'connected', // RPC 可达即视为已连
    alltime_dl: sub(stats.cumulative_stats, 'downloaded_bytes'),
    alltime_ul: sub(stats.cumulative_stats, 'uploaded_bytes'),
    free_space_on_disk: freeSpace,
    use_alt_speed_limits: false, // tr 无运行时切换（有 alt-speed 计划表，属设置页范畴）
    uptime: sub(stats.cumulative_stats, 'seconds_active'),
  }
}

/** 快照响应（torrents + server 一次返回） */
interface TrSnapshot {
  torrents: TrRow[]
  server: { stats: TrRow; freeSpace: number }
}

export const trApi = {
  /** 快照：原始 tr 行 + 映射后的前端 UI 模型（一次请求） */
  async getSnapshot(
    serverId: string,
    server: { id: string; name: string },
  ): Promise<{ torrents: Torrent[]; server: ServerState }> {
    const snap = await request<TrSnapshot>(`/servers/${serverId}/tr/snapshot`)
    const stats = snap.server.stats && typeof snap.server.stats === 'object' ? snap.server.stats : {}
    const freeSpace = typeof snap.server.freeSpace === 'number' ? snap.server.freeSpace : 0
    return {
      torrents: (Array.isArray(snap.torrents) ? snap.torrents : []).map((row) =>
        mapTrTorrent(row, server),
      ),
      server: mapTrServerState(stats, freeSpace),
    }
  },

  /** 会话配置（version / download_dir 等，全量） */
  getSession(serverId: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/servers/${serverId}/tr/session`)
  },

  /** 更新会话配置（仅白名单键；后端校验后经 session_set 热生效） */
  updateSession(
    serverId: string,
    patch: Record<string, unknown>,
  ): Promise<{ ok: boolean; applied: Record<string, unknown> }> {
    return request(`/servers/${serverId}/tr/session`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
  },

  /** 添加种子（multipart，字段名与 qB 对齐）；返回最后一条新增的 hash（供添加后二次设置） */
  addTorrents(
    serverId: string,
    params: {
      urls?: string
      torrents?: (File | Blob)[]
      savepath?: string
      tags?: string
      paused?: boolean
      dlLimit?: number
      upLimit?: number
      /** 分享率限制（-1 = 不限，≥0 = 自定义） */
      ratioLimit?: number
      sequentialDownload?: boolean
    },
  ): Promise<{ ok: boolean; duplicate: boolean; hash: string }> {
    const form = new FormData()
    if (params.urls) form.append('urls', params.urls)
    for (const f of params.torrents ?? []) form.append('torrents', f)
    if (params.savepath) form.append('download_dir', params.savepath)
    if (params.tags) form.append('labels', params.tags)
    if (params.paused) form.append('paused', 'true')
    // torrent_add 本身不带这些参数：后端在添加成功后经 torrent-set 统一下发
    if (params.dlLimit !== undefined) form.append('dlLimit', String(params.dlLimit))
    if (params.upLimit !== undefined) form.append('upLimit', String(params.upLimit))
    if (params.ratioLimit !== undefined) form.append('ratioLimit', String(params.ratioLimit))
    if (params.sequentialDownload) form.append('sequentialDownload', 'true')
    // multipart 不能走通用 request()——它强制 JSON Content-Type，后端会解析失败
    const res = fetch(`/qbt-api/servers/${serverId}/tr/torrents/add`, {
      method: 'POST',
      body: form,
      headers: { 'Accept-Language': i18n.language },
    }).then(async (res) => {
      if (!res.ok) {
        handleAuthStatus(`/servers/${serverId}/tr/torrents/add`, res.status)
        throw new ApiError(res.status, extractErrorDetail(res.status, res.statusText, await res.text().catch(() => '')))
      }
      return res.json() as Promise<{ ok: boolean; duplicate: boolean; hash: string }>
    })
    return res
  },

  /** 种子详情：单行 tr 数据映射为抽屉消费的模型（属性/trackers/files/peers） */
  async getDetail(serverId: string, hash: string): Promise<TrTorrentDetail> {
    const row = await request<TrRow>(`/servers/${serverId}/tr/torrents/detail?hash=${encodeURIComponent(hash)}`)

    // tr announce_state → qB Tracker.status（0 停用 1 未联系 2 工作中 3 更新中 4 失效）
    const mapTrackerStatus = (t: TrRow): number => {
      const st = typeof t.announce_state === 'number' ? t.announce_state : -1
      if (st === 3) return 3 // 更新中
      if (st === 0) return 0 // 停用（我们已暂停）
      if (st === 1 || st === 2) return 1 // 未联系
      return t.last_announce_succeeded === true ? 2 : 4 // 空闲后看上次结果
    }

    const trackers: Tracker[] = arrayRows(row, 'tracker_stats').map((t) => ({
      url: typeof t.announce === 'string' ? t.announce : '',
      tier: typeof t.tier === 'number' ? t.tier : 0,
      status: mapTrackerStatus(t),
      peers: typeof t.leecher_count === 'number' ? t.leecher_count : 0,
      seeds: typeof t.seeder_count === 'number' ? t.seeder_count : 0,
      leeches: typeof t.leecher_count === 'number' ? t.leecher_count : 0,
      downloaded: typeof t.download_count === 'number' ? t.download_count : 0,
      msg: typeof t.last_announce_result === 'string' ? t.last_announce_result : '',
    }))

    const files = arrayRows(row, 'files')
    const wanted = boolArray(row, 'wanted')
    const priorities = numberArray(row, 'priorities')
    const fileList: TorrentFile[] = files.map((f, i) => {
      const length = typeof f.length === 'number' ? f.length : 0
      const completed = typeof f.bytes_completed === 'number' ? f.bytes_completed : 0
      const isWanted = wanted[i] !== false
      const trPrio = priorities[i] ?? 0
      return {
        index: i,
        name: typeof f.name === 'string' ? f.name : '',
        size: length,
        progress: length > 0 ? completed / length : 0,
        priority: !isWanted ? 0 : trPrio < 0 ? 1 : trPrio > 0 ? 3 : 2,
        availability: 0,
      }
    })

    const peers: Peer[] = arrayRows(row, 'peers').map((p) => ({
      ip: typeof p.address === 'string' ? p.address : '',
      port: typeof p.port === 'number' ? p.port : 0,
      client: typeof p.client_name === 'string' ? p.client_name : '',
      progress: typeof p.progress === 'number' ? p.progress : 0,
      dl_speed: typeof p.rate_to_client === 'number' ? p.rate_to_client : 0,
      up_speed: typeof p.rate_to_peer === 'number' ? p.rate_to_peer : 0,
      downloaded: typeof p.bytes_to_client === 'number' ? p.bytes_to_client : 0,
      uploaded: typeof p.bytes_to_peer === 'number' ? p.bytes_to_peer : 0,
      connection: p.is_encrypted === true ? ' encrypted' : '',
      flags: typeof p.flag_str === 'string' ? p.flag_str : '',
      relevance: typeof p.progress === 'number' ? p.progress : 0,
    }))

    return {
      trackers,
      files: fileList,
      peers,
      comment: typeof row.comment === 'string' ? row.comment : '',
      created_by: typeof row.creator === 'string' ? row.creator : '',
      creation_date: numberOf(row, 'date_created'),
      seeding_time: numberOf(row, 'seconds_seeding'),
      nb_connections: numberOf(row, 'peers_connected'),
    }
  },

  stop(serverId: string, ids: string[]): Promise<void> {
    return trAction(serverId, 'stop', ids)
  },
  start(serverId: string, ids: string[]): Promise<void> {
    return trAction(serverId, 'start', ids)
  },
  startNow(serverId: string, ids: string[]): Promise<void> {
    return trAction(serverId, 'start-now', ids)
  },
  recheck(serverId: string, ids: string[]): Promise<void> {
    return trAction(serverId, 'verify', ids)
  },
  reannounce(serverId: string, ids: string[]): Promise<void> {
    return trAction(serverId, 'reannounce', ids)
  },
  remove(serverId: string, ids: string[], deleteFiles: boolean): Promise<void> {
    return request(`/servers/${serverId}/tr/torrents/remove`, {
      method: 'POST',
      body: JSON.stringify({ ids, deleteLocalData: deleteFiles }),
    }).then(() => undefined)
  },
  queueMove(serverId: string, ids: string[], direction: 'top' | 'up' | 'down' | 'bottom'): Promise<void> {
    return request(`/servers/${serverId}/tr/torrents/queue-move`, {
      method: 'POST',
      body: JSON.stringify({ ids, direction }),
    }).then(() => undefined)
  },
  setLabels(serverId: string, ids: string[], labels: string[], mode: 'set' | 'add' | 'remove'): Promise<void> {
    return request(`/servers/${serverId}/tr/torrents/labels`, {
      method: 'POST',
      body: JSON.stringify({ ids, labels, mode }),
    }).then(() => undefined)
  },
  setSpeedLimits(serverId: string, ids: string[], limits: { dl?: number; up?: number }): Promise<void> {
    return request(`/servers/${serverId}/tr/torrents/limits`, {
      method: 'POST',
      body: JSON.stringify({ ids, downloadLimit: limits.dl, uploadLimit: limits.up }),
    }).then(() => undefined)
  },
}

function trAction(serverId: string, action: string, ids: string[]): Promise<void> {
  return request(`/servers/${serverId}/tr/torrents/${action}`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  }).then(() => undefined)
}
