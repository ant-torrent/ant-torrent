/**
 * 种子操作分发门面：按服务器类型把统一的操作语义分发到 qB 代理或 Transmission
 * 规范化端点。页面/组件只依赖 TorrentOps 接口，不感知下载器差异；
 * 不支持的操作以可选方法表达（undefined = UI 隐藏/禁用）。
 */

import type { ServerConfig } from '@/services/api/client'
import { qbtApi, torrentsApi } from '@/services/api/client'
import { trApi } from '@/services/api/transmission'
import type { Tracker, ServerState, Torrent, TorrentDetail } from '@/services/types'

export type QueueDir = 'top' | 'up' | 'down' | 'bottom'

/** 添加种子参数（qB 原生形态；tr 适配层忽略不支持的键） */
export interface TorrentAddParams {
  urls?: string
  torrents?: (File | Blob)[]
  savepath?: string
  tags?: string
  paused?: boolean
  dlLimit?: number
  upLimit?: number
  /** 分享率限制（-1 = 不限，≥0 = 自定义）；tr 由后端添加后经 torrent-set 下发 */
  ratioLimit?: number
  sequentialDownload?: boolean
}

export interface TorrentOps {
  /** 快照：种子列表（hash 为主键，按添加时间倒序）+ 服务器状态 */
  getSnapshot(): Promise<{ torrents: Torrent[]; server: ServerState }>
  stop(ids: string[]): Promise<void>
  start(ids: string[]): Promise<void>
  recheck(ids: string[]): Promise<void>
  remove(ids: string[], deleteFiles: boolean): Promise<void>
  addTorrents(params: TorrentAddParams): Promise<{ duplicate?: boolean }>
  /** 强制开始：qB = 切换持久标志；tr = 一次性绕过队列（start-now） */
  forceStart(ids: string[], value: boolean): Promise<void>
  /** 添加/移除标签（tr → labels；mode='remove' 且 tags 空 = 全部移除） */
  setTags(ids: string[], tags: string[], mode: 'add' | 'remove'): Promise<void>
  /** 限速，B/s（0 = 不限） */
  setSpeedLimits(ids: string[], limits: { dl?: number; up?: number }): Promise<void>
  /** 详情抽屉数据（属性/trackers/files/peers；不含 torrent 本身） */
  getDetail(hash: string): Promise<Omit<TorrentDetail, 'torrent'>>
  /** Tracker 列表（抽屉内增删改后的局部刷新；不支持时 undefined） */
  getTrackers?(hash: string): Promise<Tracker[]>
  /** 队列移动（tr 支持；qB 后续补 Prio 系端点） */
  queueMove?(ids: string[], dir: QueueDir): Promise<void>
  /** 立即重新汇报（tr 支持；qB 后续补 torrents/reannounce） */
  reannounce?(ids: string[]): Promise<void>
}

/** qB：薄包装现有 torrentsApi（行为零变化） */
function qbtTorrentOps(server: ServerConfig): TorrentOps {
  const serverId = server.id
  return {
    async getSnapshot() {
      return torrentsApi.getSnapshot(serverId, server.name)
    },
    stop: (ids) => torrentsApi.stopTorrents(serverId, ids),
    start: (ids) => torrentsApi.startTorrents(serverId, ids),
    recheck: (ids) => torrentsApi.recheckTorrents(serverId, ids),
    remove: (ids, deleteFiles) => torrentsApi.deleteTorrents(serverId, ids, deleteFiles),
    async addTorrents(params) {
      await qbtApi.addTorrents(serverId, params)
      return {}
    },
    forceStart: (ids, value) => torrentsApi.setForceStart(serverId, ids, value),
    setTags: (ids, tags, mode) => {
      if (mode === 'add') return torrentsApi.addTags(serverId, ids, tags)
      return torrentsApi.removeTags(serverId, ids, tags)
    },
    setSpeedLimits: (ids, limits) =>
      Promise.all([
        limits.dl !== undefined
          ? torrentsApi.setDownloadLimit(serverId, ids, limits.dl)
          : Promise.resolve(),
        limits.up !== undefined
          ? torrentsApi.setUploadLimit(serverId, ids, limits.up)
          : Promise.resolve(),
      ]).then(() => undefined),
    getDetail: (hash) =>
      Promise.all([
        torrentsApi.getProperties(serverId, hash).catch(() => null),
        torrentsApi.getTrackers(serverId, hash).catch(() => null),
        torrentsApi.getFiles(serverId, hash).catch(() => null),
        torrentsApi.getPeers(serverId, hash).catch(() => null),
      ]).then(([props, trackers, files, peers]) => ({
        trackers: trackers ?? [],
        files: files ?? [],
        peers: peers ?? [],
        comment: props?.comment ?? '',
        created_by: props?.created_by ?? '',
        creation_date: props?.creation_date ?? 0,
        seeding_time: props?.seeding_time ?? 0,
        nb_connections: props?.nb_connections ?? 0,
      })),
    getTrackers: (hash) => torrentsApi.getTrackers(serverId, hash),
  }
}

/** Transmission：包装 trApi */
function trTorrentOps(server: ServerConfig): TorrentOps {
  const serverId = server.id
  return {
    getDetail: (hash) => trApi.getDetail(serverId, hash),
    getSnapshot: () => trApi.getSnapshot(serverId, server),
    stop: (ids) => trApi.stop(serverId, ids),
    start: (ids) => trApi.start(serverId, ids),
    recheck: (ids) => trApi.recheck(serverId, ids),
    getTrackers: async (hash) => (await trApi.getDetail(serverId, hash)).trackers,
    remove: (ids, deleteFiles) => trApi.remove(serverId, ids, deleteFiles),
    // tr 的 torrent_add 不带限速/分享率/顺序下载参数：由后端添加成功后统一 torrent-set 下发
    addTorrents: (params) => trApi.addTorrents(serverId, params),
    forceStart: (ids) => trApi.startNow(serverId, ids),
    setTags: (ids, tags, mode) => {
      // qB「remove 空标签 = 全部移除」→ tr 等价于 set labels 为空
      if (mode === 'remove' && tags.length === 0) {
        return trApi.setLabels(serverId, ids, [], 'set')
      }
      return trApi.setLabels(serverId, ids, tags, mode)
    },
    setSpeedLimits: (ids, limits) => trApi.setSpeedLimits(serverId, ids, limits),
    queueMove: (ids, dir) => trApi.queueMove(serverId, ids, dir),
    reannounce: (ids) => trApi.reannounce(serverId, ids),
  }
}

/** 按服务器类型返回对应的操作集（服务器不存在时按 qB 兜底，行为与旧行为一致） */
export function torrentOps(server: ServerConfig): TorrentOps {
  return server.type === 'transmission' ? trTorrentOps(server) : qbtTorrentOps(server)
}
