import type { ColumnsType } from 'antd/es/table'
import { Tag, Progress, Tooltip } from 'antd'
import i18next from 'i18next'
import type { Torrent } from '@/services/types'
import { STATUS_COLOR_OF } from '@/services/status'
import { formatBytes, formatSpeed, formatRatio, formatDateTime, formatEta, formatDuration } from '@/utils/format'
import { splitTags } from '@/utils/misc'
import type { Feature } from '@/services/downloaders'

/**
 * 名称排序：必须携带 locale + numeric 选项。
 * 无参 localeCompare 退化为 Unicode 码位序（`[` < 数字 < 英文 < `【` < 汉字，
 * 且 "10" < "2"），混合字符的种子名看起来毫无规律；
 * numeric 让数字按数值比较，zh-CN 下中文按拼音音序。
 */
const nameCompare = (a: string, b: string): number =>
  a.localeCompare(b, i18next.language, { numeric: true, sensitivity: 'base' })

/** 列定义元数据，用于列设置面板 + antd Table columns 生成 */
export interface ColumnDef {
  key: string
  titleKey: string
  width: number
  /** antd v6 固定列：'left'/'right' 为旧别名，内部归一成 'start'/'end' */
  fixed?: 'start' | 'end'
  /** 默认是否可见 */
  defaultVisible: boolean
  /** 不可隐藏/不可移动（name + actions） */
  locked?: boolean
  render?: (value: unknown, record: Torrent) => React.ReactNode
  sorter?: (a: Torrent, b: Torrent) => number
  /** 该列依赖的下载器能力（不支持时列整体隐藏，如 tr 无分类/强制开始标志） */
  feature?: Feature
}

const speedLimitRender = (v: unknown) => ((v as number) < 0 ? '∞' : formatSpeed(v as number))
const boolRender = (v: unknown) => ((v as boolean) ? '✓' : '—')
const tsRender = (v: unknown) => ((v as number) > 0 ? formatDateTime(v as number) : '—')

export const ALL_COLUMNS: ColumnDef[] = [
  {
    key: 'name',
    titleKey: 'torrents.col.name',
    width: 280,
    fixed: 'start',
    defaultVisible: true,
    locked: true,
    // 悬停显示完整名称（buildColumns 中配合 ellipsis.showTitle:false 避免原生 title 双提示）
    render: (v) => (
      <Tooltip title={v as string} mouseEnterDelay={0.2}>
        <span>{v as string}</span>
      </Tooltip>
    ),
    sorter: (a, b) => nameCompare(a.name, b.name),
  },
  {
    key: 'server_name',
    titleKey: 'torrents.col.serverName',
    width: 130,
    // 单服务器视图下冗余，默认隐藏；保留列供未来聚合视图启用
    defaultVisible: false,
    render: (v) => <Tag>{(v as string) || '—'}</Tag>,
    sorter: (a, b) => nameCompare(a.server_name, b.server_name),
  },
  {
    key: 'state',
    titleKey: 'torrents.col.status',
    width: 120,
    defaultVisible: true,
    render: (v) => {
      const state = v as string
      return (
        <Tag color={STATUS_COLOR_OF[state as keyof typeof STATUS_COLOR_OF]}>
          {i18next.t(`status.${state}`)}
        </Tag>
      )
    },
    sorter: (a, b) => a.state.localeCompare(b.state),
  },
  {
    key: 'progress',
    titleKey: 'torrents.col.progress',
    width: 140,
    defaultVisible: true,
    render: (v) => <Progress percent={Math.round((v as number) * 100)} size="small" />,
    sorter: (a, b) => a.progress - b.progress,
  },
  {
    key: 'dlspeed',
    titleKey: 'torrents.col.dlspeed',
    width: 120,
    defaultVisible: true,
    render: (v) => formatSpeed(v as number),
    sorter: (a, b) => a.dlspeed - b.dlspeed,
  },
  {
    key: 'upspeed',
    titleKey: 'torrents.col.upspeed',
    width: 120,
    defaultVisible: true,
    render: (v) => formatSpeed(v as number),
    sorter: (a, b) => a.upspeed - b.upspeed,
  },
  {
    key: 'size',
    titleKey: 'torrents.col.size',
    width: 120,
    defaultVisible: true,
    render: (v) => formatBytes(v as number),
    sorter: (a, b) => a.size - b.size,
  },
  {
    key: 'ratio',
    titleKey: 'torrents.col.ratio',
    width: 90,
    defaultVisible: true,
    render: (v) => formatRatio(v as number),
    sorter: (a, b) => a.ratio - b.ratio,
  },
  {
    key: 'eta',
    titleKey: 'torrents.col.eta',
    width: 100,
    defaultVisible: true,
    render: (v) => formatEta(v as number),
    sorter: (a, b) => a.eta - b.eta,
  },
  {
    key: 'category',
    titleKey: 'torrents.col.category',
    width: 120,
    defaultVisible: true,
    feature: 'categories',
    render: (v) => (v as string) || '—',
  },
  {
    key: 'tags',
    titleKey: 'torrents.col.tags',
    width: 180,
    defaultVisible: true,
    render: (v) => {
      const tagList = splitTags((v as string) || '')
      return tagList.length > 0
        ? tagList.map((tag) => <Tag key={tag}>{tag}</Tag>)
        : '—'
    },
  },
  {
    key: 'added_on',
    titleKey: 'torrents.col.addedOn',
    width: 160,
    defaultVisible: true,
    render: (v) => formatDateTime(v as number),
    sorter: (a, b) => a.added_on - b.added_on,
  },
  {
    key: 'actions',
    titleKey: 'torrents.col.actions',
    width: 80,
    fixed: 'end',
    defaultVisible: true,
    locked: true,
  },

  /* ---------- 默认隐藏列 ---------- */

  {
    key: 'downloaded',
    titleKey: 'torrents.col.downloaded',
    width: 120,
    defaultVisible: false,
    render: (v) => formatBytes(v as number),
    sorter: (a, b) => a.downloaded - b.downloaded,
  },
  {
    key: 'uploaded',
    titleKey: 'torrents.col.uploaded',
    width: 120,
    defaultVisible: false,
    render: (v) => formatBytes(v as number),
    sorter: (a, b) => a.uploaded - b.uploaded,
  },
  {
    key: 'downloaded_session',
    titleKey: 'torrents.col.downloadedSession',
    width: 120,
    defaultVisible: false,
    render: (v) => formatBytes(v as number),
    sorter: (a, b) => a.downloaded_session - b.downloaded_session,
  },
  {
    key: 'uploaded_session',
    titleKey: 'torrents.col.uploadedSession',
    width: 120,
    defaultVisible: false,
    render: (v) => formatBytes(v as number),
    sorter: (a, b) => a.uploaded_session - b.uploaded_session,
  },
  {
    key: 'completion_on',
    titleKey: 'torrents.col.completionOn',
    width: 160,
    defaultVisible: false,
    render: (v) => ((v as number) > 0 ? formatDateTime(v as number) : '—'),
    sorter: (a, b) => a.completion_on - b.completion_on,
  },
  {
    key: 'tracker',
    titleKey: 'torrents.col.tracker',
    width: 200,
    defaultVisible: false,
    render: (v) => (v as string) || '—',
  },
  {
    key: 'trackers_count',
    titleKey: 'torrents.col.trackersCount',
    width: 100,
    defaultVisible: false,
    sorter: (a, b) => a.trackers_count - b.trackers_count,
  },
  {
    key: 'num_seeds',
    titleKey: 'torrents.col.seeds',
    width: 100,
    defaultVisible: false,
    sorter: (a, b) => a.num_seeds - b.num_seeds,
  },
  {
    key: 'num_leechs',
    titleKey: 'torrents.col.leechs',
    width: 100,
    defaultVisible: false,
    sorter: (a, b) => a.num_leechs - b.num_leechs,
  },
  {
    key: 'num_complete',
    titleKey: 'torrents.col.numSeedsTotal',
    width: 100,
    defaultVisible: false,
    sorter: (a, b) => a.num_complete - b.num_complete,
  },
  {
    key: 'num_incomplete',
    titleKey: 'torrents.col.numLeechsTotal',
    width: 100,
    defaultVisible: false,
    sorter: (a, b) => a.num_incomplete - b.num_incomplete,
  },
  {
    key: 'availability',
    titleKey: 'torrents.col.availability',
    width: 90,
    defaultVisible: false,
    render: (v) => ((v as number) < 0 ? '—' : (v as number).toFixed(2)),
    sorter: (a, b) => a.availability - b.availability,
  },
  {
    key: 'amount_left',
    titleKey: 'torrents.col.amountLeft',
    width: 120,
    defaultVisible: false,
    render: (v) => formatBytes(v as number),
    sorter: (a, b) => a.amount_left - b.amount_left,
  },
  {
    key: 'completed',
    titleKey: 'torrents.col.completedSize',
    width: 120,
    defaultVisible: false,
    render: (v) => formatBytes(v as number),
    sorter: (a, b) => a.completed - b.completed,
  },
  {
    key: 'total_size',
    titleKey: 'torrents.col.totalSize',
    width: 120,
    defaultVisible: false,
    render: (v) => formatBytes(v as number),
    sorter: (a, b) => a.total_size - b.total_size,
  },
  {
    key: 'save_path',
    titleKey: 'torrents.col.savePath',
    width: 200,
    defaultVisible: false,
  },
  {
    key: 'content_path',
    titleKey: 'torrents.col.contentPath',
    width: 240,
    defaultVisible: false,
  },
  {
    key: 'dl_limit',
    titleKey: 'torrents.col.dlLimit',
    width: 120,
    defaultVisible: false,
    render: speedLimitRender,
    sorter: (a, b) => a.dl_limit - b.dl_limit,
  },
  {
    key: 'up_limit',
    titleKey: 'torrents.col.upLimit',
    width: 120,
    defaultVisible: false,
    render: speedLimitRender,
    sorter: (a, b) => a.up_limit - b.up_limit,
  },
  {
    key: 'priority',
    titleKey: 'torrents.col.priority',
    width: 80,
    defaultVisible: false,
    sorter: (a, b) => a.priority - b.priority,
  },
  {
    key: 'reannounce',
    titleKey: 'torrents.col.reannounce',
    width: 100,
    defaultVisible: false,
    render: (v) => formatDuration(v as number),
    sorter: (a, b) => a.reannounce - b.reannounce,
  },
  {
    key: 'seeding_time',
    titleKey: 'torrents.col.seedingTime',
    width: 120,
    defaultVisible: false,
    render: (v) => formatDuration(v as number),
    sorter: (a, b) => a.seeding_time - b.seeding_time,
  },
  {
    key: 'time_active',
    titleKey: 'torrents.col.timeActive',
    width: 120,
    defaultVisible: false,
    render: (v) => formatDuration(v as number),
    sorter: (a, b) => a.time_active - b.time_active,
  },
  {
    key: 'last_activity',
    titleKey: 'torrents.col.lastActivity',
    width: 160,
    defaultVisible: false,
    render: tsRender,
    sorter: (a, b) => a.last_activity - b.last_activity,
  },
  {
    key: 'ratio_limit',
    titleKey: 'torrents.col.ratioLimit',
    width: 110,
    defaultVisible: false,
    render: (v) => ((v as number) < -1 ? '全局' : (v as number) < 0 ? '∞' : String(v)),
  },
  {
    key: 'max_ratio',
    titleKey: 'torrents.col.maxRatio',
    width: 110,
    defaultVisible: false,
    render: (v) => ((v as number) < -1 ? '全局' : (v as number) < 0 ? '∞' : String(v)),
  },
  {
    key: 'max_seeding_time',
    titleKey: 'torrents.col.maxSeedingTime',
    width: 120,
    defaultVisible: false,
    render: (v) => ((v as number) < -1 ? '全局' : (v as number) < 0 ? '∞' : `${v}m`),
  },
  {
    key: 'auto_tmm',
    titleKey: 'torrents.col.autoTmm',
    width: 100,
    defaultVisible: false,
    feature: 'autoTMM',
    render: boolRender,
  },
  {
    key: 'force_start',
    titleKey: 'torrents.col.forceStart',
    width: 100,
    defaultVisible: false,
    feature: 'forceStartToggle',
    render: boolRender,
  },
  {
    key: 'private',
    titleKey: 'torrents.col.private',
    width: 80,
    defaultVisible: false,
    render: boolRender,
  },
  {
    key: 'f_l_piece_prio',
    titleKey: 'torrents.col.flPiecePrio',
    width: 120,
    defaultVisible: false,
    feature: 'firstLastPiecePrio',
    render: boolRender,
  },
  {
    key: 'seq_dl',
    titleKey: 'torrents.col.seqDl',
    width: 110,
    defaultVisible: false,
    feature: 'sequentialDownload',
    render: boolRender,
  },
  {
    key: 'super_seeding',
    titleKey: 'torrents.col.superSeeding',
    width: 110,
    defaultVisible: false,
    feature: 'superSeeding',
    render: boolRender,
  },
]

/** 默认可见列 key 列表 */
export const DEFAULT_VISIBLE_KEYS = ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)

/** 默认全列顺序 */
export const DEFAULT_ORDER = ALL_COLUMNS.map((c) => c.key)

/** 根据用户偏好生成 antd Table columns；caps 提供时过滤下载器不支持的列（tr 无分类/TMM 等） */
export function buildColumns(
  t: (key: string) => string,
  visibleKeys: string[],
  orderKeys: string[],
  onViewDetail: (torrent: Torrent) => void,
  caps?: ReadonlySet<Feature>,
): ColumnsType<Torrent> {
  const defs = caps ? ALL_COLUMNS.filter((c) => !c.feature || caps.has(c.feature)) : ALL_COLUMNS
  const colMap = new Map(defs.map((c) => [c.key, c]))
  const visibleSet = new Set(visibleKeys)

  // 按 orderKeys 排序，过滤不可见（locked 列始终可见）
  const sortedKeys = orderKeys.filter((k) => colMap.has(k) && (visibleSet.has(k) || colMap.get(k)!.locked))

  // fixed 列必须贴边才生效：name(fixed-start) 恒在最前、actions(fixed-end) 恒在最后。
  // 全选列或把其他列拖到 actions 之后会让它落到中间，antd 的 sticky 偏移随即错位、与相邻列重叠。
  const orderedKeys = [
    ...sortedKeys.filter((k) => colMap.get(k)!.fixed === 'start'),
    ...sortedKeys.filter((k) => !colMap.get(k)!.fixed),
    ...sortedKeys.filter((k) => colMap.get(k)!.fixed === 'end'),
  ]

  return orderedKeys.map((key) => {
    const def = colMap.get(key)!
    const col: ColumnsType<Torrent>[number] = {
      title: t(def.titleKey),
      dataIndex: key,
      key,
      width: def.width,
      fixed: def.fixed,
      // name 列用 render 内的 Tooltip 显示全名，关闭原生 title 避免双提示
      ellipsis: key === 'name' ? { showTitle: false } : true,
    }
    if (def.render) {
      col.render = (value: unknown, record: Torrent) => def.render!(value, record)
    }
    if (def.sorter) {
      col.sorter = def.sorter
    }
    // actions 列特殊处理：render 查看按钮
    if (key === 'actions') {
      col.render = (_: unknown, record: Torrent) => (
        <a onClick={(e) => { e.stopPropagation(); onViewDetail(record) }}>
          {t('common.view')}
        </a>
      )
    }
    return col
  })
}
