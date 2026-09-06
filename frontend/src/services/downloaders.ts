/**
 * 下载器能力矩阵 —— UI 按服务器类型门控的唯一入口。
 * 禁止在组件里散落 `type === 'transmission'` 判断，一律走 supports()。
 */

import type { ServerConfig } from '@/services/api/client'

export type DownloaderType = 'qbittorrent' | 'transmission'

export const DL_QBITTORRENT: DownloaderType = 'qbittorrent'
export const DL_TRANSMISSION: DownloaderType = 'transmission'

/** 可按下载器开关的功能点 */
export type Feature =
  | 'categories' // 分类（含保存路径绑定、CRUD、分类筛选/操作）
  | 'tagRegistry' // 标签注册表端点（tr 用种子 labels 并集替代）
  | 'tags' // 标签（tr → labels）
  | 'forceStart' // 强制开始（qB 可切换标志；tr = 一次性 start-now）
  | 'forceStartToggle' // 强制开始勾选态（仅 qB）
  | 'detail' // 详情抽屉四面板
  | 'trackersEdit' // Tracker 逐条增删改（tr 仅整表替换，后续迭代）
  | 'rss' // RSS（仅 qB 有服务端 RSS 引擎）
  | 'sessionPrefs' // 下载器设置页（qB 偏好；tr 会话设置后续迭代）
  | 'shareLimits' // 分享率/做种时长限制
  | 'filePriority' // 文件优先级
  | 'autoTMM' // 自动种子管理
  | 'location' // 设置保存位置
  | 'rename' // 添加时重命名
  | 'skipChecking' // 添加时跳过校验
  | 'rootFolder' // 添加时保持顶层目录
  | 'sequentialDownload' // 顺序下载（qB 5 / tr 4.1 均支持）
  | 'firstLastPiecePrio' // 首末块优先
  | 'superSeeding' // 超级做种（仅 qB）
  | 'speedLimitsToggle' // 备用限速切换
  | 'addRatioLimit' // 添加时设置分享率（tr 添加后经 torrent-set 下发）
  | 'addSeedingTimeLimit' // 添加时设置做种时长限制（tr 闲置做种语义不同，不提供）

const QBT_FEATURES: Feature[] = [
  'categories', 'tagRegistry', 'tags', 'forceStart', 'forceStartToggle', 'detail', 'rss',
  'sessionPrefs', 'shareLimits', 'filePriority', 'autoTMM', 'location', 'rename',
  'skipChecking', 'rootFolder', 'sequentialDownload', 'firstLastPiecePrio', 'superSeeding',
  'speedLimitsToggle', 'addRatioLimit', 'addSeedingTimeLimit',
]

const TR_FEATURES: Feature[] = ['tags', 'forceStart', 'sequentialDownload', 'detail', 'addRatioLimit']

const CAPS: Record<DownloaderType, ReadonlySet<Feature>> = {
  qbittorrent: new Set(QBT_FEATURES),
  transmission: new Set(TR_FEATURES),
}

/** 供列定义等需要整组能力集合的场景使用 */
export function capsOf(type?: string): ReadonlySet<Feature> {
  return CAPS[downloaderType(type)]
}

/** 归一化服务器类型（旧数据/未知值兜底 qbittorrent） */
export function downloaderType(type?: string): DownloaderType {
  return type === DL_TRANSMISSION ? DL_TRANSMISSION : DL_QBITTORRENT
}

/** 判断服务器是否支持某功能 */
export function supports(server: Pick<ServerConfig, 'type'> | undefined, feature: Feature): boolean {
  return CAPS[downloaderType(server?.type)].has(feature)
}
