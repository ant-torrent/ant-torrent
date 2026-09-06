import type { Torrent, TorrentState } from './types'

/** 状态分组（列表页 Tabs / 看板状态分布共用） */
export type StatusGroup = 'downloading' | 'seeding' | 'completed' | 'paused' | 'errored' | 'checking'

export const STATUS_GROUPS: StatusGroup[] = [
  'downloading',
  'seeding',
  'completed',
  'paused',
  'errored',
  'checking',
]

/** 状态 → 分组 */
export const STATUS_GROUP_OF: Record<TorrentState, StatusGroup> = {
  downloading: 'downloading',
  metaDL: 'downloading',
  stalledDL: 'downloading',
  queuedDL: 'downloading',
  forcedDL: 'downloading',
  allocating: 'downloading',
  moving: 'downloading',
  uploading: 'seeding',
  stalledUP: 'seeding',
  queuedUP: 'seeding',
  forcedUP: 'seeding',
  pausedUP: 'completed',
  pausedDL: 'paused',
  error: 'errored',
  missingFiles: 'errored',
  unknown: 'errored',
  checkingDL: 'checking',
  checkingUP: 'checking',
  checkingResumeData: 'checking',
}

/** 状态 → Tag 预设色（下载蓝系 / 做种绿系 / 异常红系 / 校验 geekblue / 队队灰） */
export const STATUS_COLOR_OF: Record<TorrentState, string> = {
  downloading: 'blue',
  metaDL: 'purple',
  stalledDL: 'orange',
  queuedDL: 'default',
  forcedDL: 'geekblue',
  allocating: 'cyan',
  moving: 'cyan',
  uploading: 'green',
  stalledUP: 'lime',
  queuedUP: 'default',
  forcedUP: 'green',
  pausedUP: 'cyan',
  pausedDL: 'default',
  error: 'red',
  missingFiles: 'volcano',
  unknown: 'default',
  checkingDL: 'geekblue',
  checkingUP: 'geekblue',
  checkingResumeData: 'geekblue',
}

/** i18n 键：状态与分组共用 status.* / statusGroup.* 命名空间 */
export const statusI18nKey = (state: TorrentState): string => `status.${state}`
export const statusGroupI18nKey = (group: StatusGroup): string => `statusGroup.${group}`

/* ------------------------------------------------------------------ */
/* /api/v2/torrents/info 的 filter 参数枚举（列表页状态筛选下拉）        */
/* ------------------------------------------------------------------ */

/**
 * 与 qBittorrent filter 请求参数对齐的枚举值。
 * 数据已全量在本地，实际过滤由前端谓词完成（多选 OR），不回传 API。
 */
export type TorrentFilterKey =
  | 'all'
  | 'downloading'
  | 'seeding'
  | 'completed'
  | 'stopped'
  | 'active'
  | 'inactive'
  | 'running'
  | 'stalled'
  | 'stalled_uploading'
  | 'stalled_downloading'
  | 'errored'

/** 下拉顺序（与 qB WebUI 侧栏一致） */
export const TORRENT_FILTER_KEYS: TorrentFilterKey[] = [
  'all',
  'downloading',
  'seeding',
  'completed',
  'stopped',
  'active',
  'inactive',
  'running',
  'stalled',
  'stalled_uploading',
  'stalled_downloading',
  'errored',
]

/** 下载生命周期状态（未完成、未暂停） */
const DOWNLOADING_STATES = new Set<TorrentState>([
  'downloading',
  'metaDL',
  'forcedDL',
  'stalledDL',
  'queuedDL',
  'checkingDL',
  'allocating',
  'moving',
])

/** 做种生命周期状态（已完成、未暂停） */
const SEEDING_STATES = new Set<TorrentState>([
  'uploading',
  'forcedUP',
  'stalledUP',
  'queuedUP',
  'checkingUP',
])

/** 已停止（stoppedUP/stoppedDL 已归一为 paused*） */
const STOPPED_STATES = new Set<TorrentState>(['pausedUP', 'pausedDL'])

/** 异常态 */
const ERRORED_STATES = new Set<TorrentState>(['error', 'missingFiles', 'unknown'])

/** filter → 匹配谓词（语义对齐 qB WebUI 侧栏） */
export const TORRENT_FILTER_MATCH: Record<TorrentFilterKey, (t: Torrent) => boolean> = {
  all: () => true,
  downloading: (t) => DOWNLOADING_STATES.has(t.state),
  seeding: (t) => SEEDING_STATES.has(t.state),
  completed: (t) => t.progress === 1,
  stopped: (t) => STOPPED_STATES.has(t.state),
  active: (t) => t.dlspeed > 0 || t.upspeed > 0,
  inactive: (t) => t.dlspeed === 0 && t.upspeed === 0,
  running: (t) => !STOPPED_STATES.has(t.state) && !ERRORED_STATES.has(t.state),
  stalled: (t) => t.state === 'stalledUP' || t.state === 'stalledDL',
  stalled_uploading: (t) => t.state === 'stalledUP',
  stalled_downloading: (t) => t.state === 'stalledDL',
  errored: (t) => ERRORED_STATES.has(t.state),
}

/** i18n 键：torrentFilter.* 命名空间（与 statusGroup.* 区分） */
export const torrentFilterI18nKey = (key: TorrentFilterKey): string => `torrentFilter.${key}`
