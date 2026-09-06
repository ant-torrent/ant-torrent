/**
 * 领域类型 —— 字段名对齐 qBittorrent WebUI API (2.x)
 * 后续 Go 后端透传 qB 数据时无需二次映射
 */

/** 种子状态（qB /torrents/info 官方枚举，unknown = 未知/异常） */
export type TorrentState =
  | 'unknown'
  | 'error'
  | 'missingFiles'
  | 'uploading'
  | 'pausedUP'
  | 'queuedUP'
  | 'stalledUP'
  | 'checkingUP'
  | 'forcedUP'
  | 'allocating'
  | 'downloading'
  | 'metaDL'
  | 'pausedDL'
  | 'queuedDL'
  | 'stalledDL'
  | 'checkingDL'
  | 'forcedDL'
  | 'checkingResumeData'
  | 'moving'

/** 种子（/torrents/info 单条，含列表/详情页所需全部字段） */
export interface Torrent {
  hash: string
  name: string
  /** 总字节数 */
  size: number
  /** 0–1 */
  progress: number
  state: TorrentState
  /** B/s */
  dlspeed: number
  upspeed: number
  downloaded: number
  uploaded: number
  downloaded_session: number
  uploaded_session: number
  /** 秒；8640000 表示 ∞ */
  eta: number
  ratio: number
  /** unix 秒 */
  added_on: number
  /** unix 秒，-1 = 未完成 */
  completion_on: number
  category: string
  /** qB 逗号分隔字符串 */
  tags: string
  /** 已连接的做种数 */
  num_seeds: number
  /** 已连接的下载数 */
  num_leechs: number
  /** 全网做种数 */
  num_complete: number
  /** 全网下载数 */
  num_incomplete: number
  /** 主 tracker URL */
  tracker: string
  trackers_count: number
  /** -1 = 未知 */
  availability: number
  save_path: string
  magnet_uri: string
  private: boolean
  force_start: boolean
  auto_tmm: boolean
  /** unix 秒 */
  last_activity: number

  /* ---- qB 5.0 补充字段 ---- */
  /** 剩余字节 */
  amount_left: number
  /** 已下载字节（同 downloaded，qB 兼容） */
  completed: number
  /** 内容完整路径 */
  content_path: string
  /** 下载限速 B/s，-1 = 无限 */
  dl_limit: number
  /** 上传限速 B/s，-1 = 无限 */
  up_limit: number
  /** 优先下载首尾块 */
  f_l_piece_prio: boolean
  /** 全局最大分享率（-2 = 使用全局设置） */
  max_ratio: number
  /** 全局最大做种时长 分钟（-2 = 使用全局设置） */
  max_seeding_time: number
  /** 队列优先级 */
  priority: number
  /** 单种子分享率限制 */
  ratio_limit: number
  /** 距下次 reannounce 秒数 */
  reannounce: number
  /** 做种时长 秒 */
  seeding_time: number
  /** 单种子做种时长限制 分钟 */
  seeding_time_limit: number
  /** unix 秒，上次见到完整种子 */
  seen_complete: number
  /** 顺序下载 */
  seq_dl: boolean
  /** 超级做种 */
  super_seeding: boolean
  /** 累计活跃时长 秒 */
  time_active: number
  /** 含未选文件的总大小 */
  total_size: number

  /* ---- 多服务器归属（AntTorrent 扩展） ---- */
  /** 所属服务器 ID */
  server_id: string
  /** 所属服务器名称（冗余，避免跨 store 查找） */
  server_name: string
}

export type ConnectionStatus = 'connected' | 'firewalled' | 'disconnected'

/** 服务器状态（/transfer/info + /sync/maindata 汇总字段） */
export interface ServerState {
  dl_info_speed: number
  dl_info_data: number
  up_info_speed: number
  up_info_data: number
  dht_nodes: number
  connection_status: ConnectionStatus
  alltime_dl: number
  alltime_ul: number
  free_space_on_disk: number
  use_alt_speed_limits: boolean
  /** 秒 */
  uptime: number
}

/** Tracker（/torrents/trackers 单条） */
export interface Tracker {
  url: string
  tier: number
  /** 0 停用 1 未联系 2 工作中 3 更新中 4 失效 */
  status: number
  peers: number
  seeds: number
  leeches: number
  downloaded: number
  msg: string
}

/** 文件（/torrents/files 单条） */
export interface TorrentFile {
  index: number
  name: string
  size: number
  progress: number
  /** 0 跳过 1 正常 2 高 3 最高 4 - 7 更高 */
  priority: number
  availability: number
}

/** RSS 文章（/rss/items?withData=true 单条）。date 为 RFC 字符串或 epoch 秒（随 qB 版本而异） */
export interface RssArticle {
  id: string
  date: string
  title: string
  link: string
  torrentUrl: string
  description: string
  isRead: boolean
}

/** RSS 订阅树节点（feed 或 folder），path 为 `\` 分隔的完整路径 */
export interface RssFeedNode {
  path: string
  name: string
  isFolder: boolean
  uid: string
  url: string
  /** feed 标题（RSS 内声明，可能为空） */
  title: string
  isLoading: boolean
  hasError: boolean
  articles: RssArticle[]
  children: RssFeedNode[]
}

/**
 * RSS 下载规则（/rss/rules 单条）。name 为规则名，其余为 ruleDef 字段；
 * addPaused/torrentContentLayout 为 null 时表示跟随全局设置。
 */
export interface RssRule {
  name: string
  enabled: boolean
  mustContain: string
  mustNotContain: string
  useRegex: boolean
  /** 剧集过滤表达式（如 s01e02），配合 smartFilter 使用 */
  episodeFilter: string
  smartFilter: boolean
  /** 作用的订阅源 URL；空数组 = 全部订阅源 */
  affectedFeeds: string[]
  assignedCategory: string
  savePath: string
  /** null = 跟随全局；true 添加后暂停；false 立即开始 */
  addPaused: boolean | null
  /** null = 跟随全局；Original / Subfolder / NoSubfolder */
  torrentContentLayout: string | null
  /** 最近一次匹配时间（服务端只读，yyyy-MM-dd hh:mm 或空） */
  lastMatch: string
  /** 服务端返回的原始定义：保存时合并回传，避免抹掉未映射字段（如 stopIfConditionsMet） */
  raw: Record<string, unknown>
}

/** 节点（/torrents/peers 单条） */
export interface Peer {
  ip: string
  port: number
  client: string
  progress: number
  dl_speed: number
  up_speed: number
  downloaded: number
  uploaded: number
  /** BT / µTP / Web */
  connection: string
  flags: string
  /** 0–1 */
  relevance: number
}

/** 种子详情（惰性生成） */
export interface TorrentDetail {
  torrent: Torrent
  trackers: Tracker[]
  files: TorrentFile[]
  peers: Peer[]
  comment: string
  created_by: string
  /** unix 秒 */
  creation_date: number
  seeding_time: number
  nb_connections: number
}

/** 速度采样（unix 秒 + B/s） */
export interface SpeedSample {
  t: number
  dl: number
  up: number
}

/** 模拟器/轮询客户端共用的全量快照 */
export interface TorrentSnapshot {
  torrents: Torrent[]
  server: ServerState
  history: SpeedSample[]
}

/**
 * qBittorrent 应用偏好（/app/preferences）。
 * 键名 = 官方 API；扁平结构，注释按设置页 Tab 分组。
 * 注意：dl_limit/up_limit 单位是 B/s，alt_dl_limit/alt_up_limit 是 KiB/s（qB 原生如此）。
 */
export interface AppPreferences {
  /* ---- 行为 ---- */
  locale: string
  add_stopped_enabled: boolean
  confirm_torrent_deletion: boolean
  confirm_torrent_recheck: boolean
  auto_delete_mode: number
  preallocate_all: boolean
  incomplete_files_ext: boolean
  use_category_paths_in_manual_mode: boolean
  torrent_changed_tmm_enabled: boolean
  save_path_changed_tmm_enabled: boolean
  category_changed_tmm_enabled: boolean
  autorun_enabled: boolean
  autorun_on_torrent_added_enabled: boolean
  autorun_program: string

  /* ---- 下载 ---- */
  save_path: string
  temp_path_enabled: boolean
  temp_path: string
  export_dir: string
  export_dir_fin: string
  /** 监控目录：qB v5 实际返回 { 监控目录: 保存目录 | null }（旧版 string[]），
   *  usePreferencesForm 装载/保存时与多行文本互转，这里标表单编辑形态 */
  scan_dirs: string
  mail_notification_enabled: boolean
  mail_notification_email: string
  mail_notification_smtp: string
  mail_notification_ssl_enabled: boolean
  mail_notification_auth_enabled: boolean
  mail_notification_username: string
  mail_notification_password: string

  /* ---- 连接 ---- */
  listen_port: number
  upnp: boolean
  random_port: boolean
  max_connec: number
  max_connec_per_torrent: number
  max_uploads: number
  max_uploads_per_torrent: number
  proxy_type: number
  proxy_ip: string
  proxy_port: number
  proxy_peer_connections: boolean
  proxy_auth_enabled: boolean
  proxy_username: string
  proxy_password: string
  proxy_torrents_only: boolean

  /* ---- 速度 ---- */
  dl_limit: number
  up_limit: number
  alt_dl_limit: number
  alt_up_limit: number
  scheduler_enabled: boolean
  schedule_from_hour: number
  schedule_from_min: number
  schedule_to_hour: number
  schedule_to_min: number
  scheduler_days: number
  limit_utp_rate: boolean
  limit_tcp_overhead: boolean
  limit_lan_peers: boolean

  /* ---- BitTorrent ---- */
  encryption: number
  anonymous_mode: boolean
  bittorrent_protocol: number
  max_active_downloads: number
  max_active_torrents: number
  max_active_uploads: number
  queueing_enabled: boolean
  dont_count_slow_torrents: boolean
  slow_torrent_dl_rate_threshold: number
  slow_torrent_ul_rate_threshold: number
  slow_torrent_inactive_timer: number
  max_ratio_enabled: boolean
  max_ratio: number
  max_ratio_act: number
  max_seeding_time_enabled: boolean
  max_seeding_time: number
  dht: boolean
  pex: boolean
  lsd: boolean
  add_trackers_enabled: boolean
  add_trackers: string

  /* ---- Web UI ---- */
  web_ui_domain_list: string
  web_ui_address: string
  web_ui_port: number
  web_ui_upnp: boolean
  web_ui_username: string
  web_ui_password: string
  web_ui_csrf_protection_enabled: boolean
  web_ui_clickjacking_protection_enabled: boolean
  web_ui_secure_cookie_enabled: boolean
  web_ui_host_header_validation_enabled: boolean
  web_ui_https_enabled: boolean
  web_ui_https_cert_path: string
  web_ui_https_key_path: string
  web_ui_max_auth_fail_count: number
  web_ui_ban_duration: number
  web_ui_session_timeout: number
  alternative_webui_enabled: boolean
  alternative_webui_path: string
  web_ui_use_custom_http_headers_enabled: boolean
  web_ui_custom_http_headers: string
  bypass_local_auth: boolean
  bypass_auth_subnet_whitelist_enabled: boolean
  bypass_auth_subnet_whitelist: string

  /* ---- RSS ---- */
  rss_refresh_interval: number
  rss_max_articles_per_feed: number
  rss_processing_enabled: boolean
  rss_auto_downloading_enabled: boolean

  /* ---- 高级 ---- */
  async_io_threads: number
  hashing_threads: number
  socket_backlog: number
  outgoing_ports_min: number
  outgoing_ports_max: number
  upnp_lease_duration: number
  utp_tcp_mixed_mode: number
  send_buffer_watermark: number
  send_buffer_low_watermark: number
  send_buffer_watermark_factor: number
  disk_cache_size: number
  disk_queue_size: number
  disk_io_read_mode: number
  disk_io_write_mode: number
  upload_choking_algorithm: number
  upload_slots_behavior: number
  announce_ip: string
  max_concurrent_http_announces: number
  stop_tracker_timeout: number
  enable_embedded_tracker: boolean
  embedded_tracker_port: number
  embedded_tracker_port_forwarding: boolean
  enable_multi_connections_from_same_ip: boolean
  validate_https_tracker_certificate: boolean
  ssrf_mitigation: boolean
  recheck_torrents_on_completion: boolean
  refresh_interval: number
  resolve_peer_countries: boolean
  reannounce_when_address_changed: boolean
  enable_os_cache: boolean
}
