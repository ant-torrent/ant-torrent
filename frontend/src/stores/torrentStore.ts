import { create } from 'zustand'

import type { ServerState, SpeedSample, Torrent, TorrentSnapshot } from '@/services/types'

/** 单个服务器的数据分片 */
export interface ServerData {
  torrents: Torrent[]
  server: ServerState
  history: SpeedSample[]
  /** 轮询失败时的错误信息（成功后清除）；失败时保留上次的 torrents/history */
  error?: string
  /** 上次成功快照的时间戳（ms） */
  lastUpdated?: number
}

/** 页面唯一的数据源：轮询客户端（useTorrentPolling）写入这里，页面只读 selector */
interface TorrentStore {
  /** 按 server_id 分片的原始数据 */
  serverData: Record<string, ServerData>
  /** 聚合种子列表（所有服务器平铺） */
  torrents: Torrent[]
  /** 聚合服务器状态（速度求和、dht 求和、uptime 取最大值） */
  server: ServerState
  /** 聚合速度历史（按时间戳对齐后求和） */
  history: SpeedSample[]
  /** 按 server_id 写入单台服务器快照 */
  applyServerSnapshot: (serverId: string, snapshot: TorrentSnapshot) => void
  /** 全量写入（初始化时使用） */
  applyAllSnapshots: (data: Record<string, TorrentSnapshot>) => void
  /** 标记某台服务器轮询失败：保留旧数据，置断连 + 错误信息 */
  markServerError: (serverId: string, message: string) => void
  /** 清除已不存在服务器的残留分片（删除服务器后调用） */
  pruneServerData: (validIds: string[]) => void
}

const INITIAL_SERVER: ServerState = {
  dl_info_speed: 0,
  dl_info_data: 0,
  up_info_speed: 0,
  up_info_data: 0,
  dht_nodes: 0,
  connection_status: 'disconnected',
  alltime_dl: 0,
  alltime_ul: 0,
  free_space_on_disk: 0,
  use_alt_speed_limits: false,
  uptime: 0,
}

/** 从 serverData 计算聚合视图 */
function aggregate(serverData: Record<string, ServerData>): {
  torrents: Torrent[]
  server: ServerState
  history: SpeedSample[]
} {
  const entries = Object.values(serverData)
  if (entries.length === 0) {
    return { torrents: [], server: INITIAL_SERVER, history: [] }
  }
  if (entries.length === 1) {
    const e = entries[0]!
    return { torrents: e.torrents, server: e.server, history: e.history }
  }

  // 平铺 torrents
  const torrents = entries.flatMap((e) => e.torrents)

  // 聚合 server
  const server: ServerState = {
    dl_info_speed: 0,
    dl_info_data: 0,
    up_info_speed: 0,
    up_info_data: 0,
    dht_nodes: 0,
    connection_status: 'connected',
    alltime_dl: 0,
    alltime_ul: 0,
    free_space_on_disk: 0,
    use_alt_speed_limits: false,
    uptime: 0,
  }
  for (const e of entries) {
    server.dl_info_speed += e.server.dl_info_speed
    server.dl_info_data += e.server.dl_info_data
    server.up_info_speed += e.server.up_info_speed
    server.up_info_data += e.server.up_info_data
    server.dht_nodes += e.server.dht_nodes
    server.alltime_dl += e.server.alltime_dl
    server.alltime_ul += e.server.alltime_ul
    server.free_space_on_disk += e.server.free_space_on_disk
    server.uptime = Math.max(server.uptime, e.server.uptime)
    if (e.server.connection_status === 'disconnected') server.connection_status = 'disconnected'
    else if (e.server.connection_status === 'firewalled' && server.connection_status !== 'disconnected') {
      server.connection_status = 'firewalled'
    }
    if (e.server.use_alt_speed_limits) server.use_alt_speed_limits = true
  }

  // 聚合 history：以第一台 server 的时间轴为基准，各 server 同索引位求和
  const base = entries[0]!.history
  const history: SpeedSample[] = base.map((sample, i) => {
    let dl = sample.dl
    let up = sample.up
    for (let j = 1; j < entries.length; j++) {
      const h = entries[j]!.history
      if (h[i]) {
        dl += h[i].dl
        up += h[i].up
      }
    }
    return { t: sample.t, dl, up }
  })

  return { torrents, server, history }
}

export const useTorrentStore = create<TorrentStore>((set) => ({
  serverData: {},
  torrents: [],
  server: INITIAL_SERVER,
  history: [],
  applyServerSnapshot: (serverId, snapshot) =>
    set((state) => {
      const next = {
        ...state.serverData,
        [serverId]: {
          torrents: snapshot.torrents,
          server: snapshot.server,
          history: snapshot.history,
          error: undefined,
          lastUpdated: Date.now(),
        },
      }
      return { serverData: next, ...aggregate(next) }
    }),
  applyAllSnapshots: (data) =>
    set(() => {
      const serverData: Record<string, ServerData> = {}
      for (const [id, snap] of Object.entries(data)) {
        serverData[id] = {
          torrents: snap.torrents,
          server: snap.server,
          history: snap.history,
        }
      }
      return { serverData, ...aggregate(serverData) }
    }),
  markServerError: (serverId, message) =>
    set((state) => {
      const prev = state.serverData[serverId]
      const next = {
        ...state.serverData,
        [serverId]: {
          torrents: prev?.torrents ?? [],
          server: { ...(prev?.server ?? INITIAL_SERVER), connection_status: 'disconnected' as const },
          history: prev?.history ?? [],
          error: message,
          lastUpdated: prev?.lastUpdated,
        },
      }
      return { serverData: next, ...aggregate(next) }
    }),
  pruneServerData: (validIds) =>
    set((state) => {
      const valid = new Set(validIds)
      const ids = Object.keys(state.serverData)
      if (ids.every((id) => valid.has(id))) return state
      const serverData: Record<string, ServerData> = {}
      for (const id of ids) {
        if (valid.has(id)) serverData[id] = state.serverData[id]!
      }
      return { serverData, ...aggregate(serverData) }
    }),
}))
