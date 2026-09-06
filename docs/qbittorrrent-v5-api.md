# qBittorrent WebUI API 接口文档

> 基于 [qBittorrent 官方 Wiki — WebUI-API (qBittorrent 5.0)](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)) 整理而成
> 适用版本：qBittorrent **v5.0+** · WebAPI 版本 **2.11.x** · 共 **8 个分组 / 91 个接口**

| | |
|---|---|
| 基础路径 | `/api/v2/APIName/methodName` |
| 请求方法 | 仅支持 `GET` / `POST`（变更状态或请求过大时使用 POST；v4.4.4 起错误方法返回 `405`） |
| 认证方式 | 基于 Cookie（`SID`）的会话认证；除 `auth/login` 外所有接口均需认证 |
| 参数编码 | 表单编码 `application/x-www-form-urlencoded` |

---

## 目录

- [01 · 认证 Authentication](#auth)
  - [1. login — 登录](#auth-login)
  - [2. logout — 注销](#auth-logout)
- [02 · 应用 Application](#app)
  - [1. version — 获取应用版本](#app-version)
  - [2. webapiVersion — 获取 API 版本](#app-webapiversion)
  - [3. buildInfo — 获取构建信息](#app-buildinfo)
  - [4. shutdown — 关闭应用](#app-shutdown)
  - [5. preferences — 获取应用偏好设置](#app-preferences)
  - [6. setPreferences — 设置应用偏好设置](#app-setpreferences)
  - [7. defaultSavePath — 获取默认保存路径](#app-defaultsavepath)
  - [8. cookies — 获取 Cookies](#app-cookies)
  - [9. setCookies — 设置 Cookies](#app-setcookies)
- [03 · 日志 Log](#log)
  - [1. main — 获取日志](#log-main)
  - [2. peers — 获取 Peer 日志](#log-peers)
- [04 · 同步 Sync](#sync)
  - [1. maindata — 获取主数据](#sync-maindata)
  - [2. torrentPeers — 获取种子 Peer 数据](#sync-torrentpeers)
- [05 · 传输信息 Transfer Info](#transfer)
  - [1. info — 获取全局传输信息](#transfer-info)
  - [2. speedLimitsMode — 获取备选限速状态](#transfer-speedlimitsmode)
  - [3. toggleSpeedLimitsMode — 切换备选限速](#transfer-togglespeedlimitsmode)
  - [4. downloadLimit — 获取全局下载限速](#transfer-downloadlimit)
  - [5. setDownloadLimit — 设置全局下载限速](#transfer-setdownloadlimit)
  - [6. uploadLimit — 获取全局上传限速](#transfer-uploadlimit)
  - [7. setUploadLimit — 设置全局上传限速](#transfer-setuploadlimit)
  - [8. banPeers — 封禁 Peer](#transfer-banpeers)
- [06 · 种子管理 Torrent Management](#torrents)
  - [1. info — 获取种子列表](#torrents-info)
  - [2. properties — 获取种子通用属性](#torrents-properties)
  - [3. trackers — 获取种子 Tracker](#torrents-trackers)
  - [4. webseeds — 获取种子 Web Seeds](#torrents-webseeds)
  - [5. files — 获取种子内容（文件列表）](#torrents-files)
  - [6. pieceStates — 获取种子分片状态](#torrents-piecestates)
  - [7. pieceHashes — 获取种子分片哈希](#torrents-piecehashes)
  - [8. stop — 暂停种子](#torrents-stop)
  - [9. start — 恢复种子](#torrents-start)
  - [10. delete — 删除种子](#torrents-delete)
  - [11. recheck — 重新校验种子](#torrents-recheck)
  - [12. reannounce — 重新宣告种子](#torrents-reannounce)
  - [13. add — 添加新种子](#torrents-add)
  - [14. addTrackers — 向种子添加 Tracker](#torrents-addtrackers)
  - [15. editTracker — 编辑 Tracker](#torrents-edittracker)
  - [16. removeTrackers — 移除 Tracker](#torrents-removetrackers)
  - [17. addPeers — 添加 Peer](#torrents-addpeers)
  - [18. increasePrio — 提升种子优先级](#torrents-increaseprio)
  - [19. decreasePrio — 降低种子优先级](#torrents-decreaseprio)
  - [20. topPrio — 设为最高优先级](#torrents-topprio)
  - [21. bottomPrio — 设为最低优先级](#torrents-bottomprio)
  - [22. filePrio — 设置文件优先级](#torrents-fileprio)
  - [23. downloadLimit — 获取种子下载限速](#torrents-downloadlimit)
  - [24. setDownloadLimit — 设置种子下载限速](#torrents-setdownloadlimit)
  - [25. setShareLimits — 设置种子分享限制](#torrents-setsharelimits)
  - [26. uploadLimit — 获取种子上传限速](#torrents-uploadlimit)
  - [27. setUploadLimit — 设置种子上传限速](#torrents-setuploadlimit)
  - [28. setLocation — 设置种子保存位置](#torrents-setlocation)
  - [29. rename — 重命名种子](#torrents-rename)
  - [30. setCategory — 设置种子分类](#torrents-setcategory)
  - [31. categories — 获取全部分类](#torrents-categories)
  - [32. createCategory — 新建分类](#torrents-createcategory)
  - [33. editCategory — 编辑分类](#torrents-editcategory)
  - [34. removeCategories — 删除分类](#torrents-removecategories)
  - [35. addTags — 添加标签](#torrents-addtags)
  - [36. removeTags — 移除标签](#torrents-removetags)
  - [37. tags — 获取全部标签](#torrents-tags)
  - [38. createTags — 创建标签](#torrents-createtags)
  - [39. deleteTags — 删除标签](#torrents-deletetags)
  - [40. setAutoManagement — 设置自动种子管理 (ATM)](#torrents-setautomanagement)
  - [41. toggleSequentialDownload — 切换顺序下载](#torrents-togglesequentialdownload)
  - [42. toggleFirstLastPiecePrio — 切换首尾分片优先](#torrents-togglefirstlastpieceprio)
  - [43. setForceStart — 设置强制开始](#torrents-setforcestart)
  - [44. setSuperSeeding — 设置超级做种](#torrents-setsuperseeding)
  - [45. renameFile — 重命名文件](#torrents-renamefile)
  - [46. renameFolder — 重命名文件夹](#torrents-renamefolder)
- [07 · RSS（实验性） RSS (experimental)](#rss)
  - [1. addFolder — 添加文件夹](#rss-addfolder)
  - [2. addFeed — 添加订阅源](#rss-addfeed)
  - [3. removeItem — 移除项目](#rss-removeitem)
  - [4. moveItem — 移动项目](#rss-moveitem)
  - [5. items — 获取全部订阅项目](#rss-items)
  - [6. markAsRead — 标记已读](#rss-markasread)
  - [7. refreshItem — 刷新项目](#rss-refreshitem)
  - [8. setRule — 设置自动下载规则](#rss-setrule)
  - [9. renameRule — 重命名自动下载规则](#rss-renamerule)
  - [10. removeRule — 删除自动下载规则](#rss-removerule)
  - [11. rules — 获取全部自动下载规则](#rss-rules)
  - [12. matchingArticles — 获取匹配规则的文章](#rss-matchingarticles)
- [08 · 搜索 Search](#search)
  - [1. start — 开始搜索](#search-start)
  - [2. stop — 停止搜索](#search-stop)
  - [3. status — 获取搜索状态](#search-status)
  - [4. results — 获取搜索结果](#search-results)
  - [5. delete — 删除搜索](#search-delete)
  - [6. plugins — 获取搜索插件](#search-plugins)
  - [7. installPlugin — 安装搜索插件](#search-installplugin)
  - [8. uninstallPlugin — 卸载搜索插件](#search-uninstallplugin)
  - [9. enablePlugin — 启用/禁用搜索插件](#search-enableplugin)
  - [10. updatePlugins — 更新搜索插件](#search-updateplugins)

---

## <a id="overview"></a> 总览 General Information

- **基础路径**：所有接口路径形如 `/api/v2/APIName/methodName`。
- **请求方法**：仅允许 `GET` 与 `POST`。变更状态或请求体过大时使用 POST；自 v4.4.4 起，使用错误方法将返回 `405`。
- **认证**：qBittorrent 采用基于 Cookie（`SID`）的认证。除 `auth/login` 外，所有接口都需要先登录获取会话。
- **本文档**：适用于 qBittorrent v5.0+，对应 WebAPI 版本 2.11.x。

## <a id="auth"></a> 01 · 认证 Authentication

所有认证接口位于 `auth` 分组下，例如 `/api/v2/auth/methodName`。qBittorrent 采用基于 Cookie 的认证机制（SID）。

### <a id="auth-login"></a> 1. login — 登录

**`POST` `/api/v2/auth/login`**

使用用户名和密码登录。成功后响应会返回包含 SID 的 Cookie，之后所有需要认证的操作都必须携带该 Cookie。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `username` | `string` | **是** | Username used to access the WebUI |
| `password` | `string` | **是** | Password used to access the WebUI |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 403 | User's IP is banned for too many failed login attempts |
| 200 | All other scenarios |

**示例 Example**

```bash
$ curl -i --header 'Referer: http://localhost:8080' --data 'username=admin&password=adminadmin' http://localhost:8080/api/v2/auth/login
HTTP/1.1 200 OK
Content-Encoding:
Content-Length: 3
Content-Type: text/plain; charset=UTF-8
Set-Cookie: SID=hBc7TxF76ERhvIw0jQQ4LZ7Z1jQUV0tQ; path=/
$ curl http://localhost:8080/api/v2/torrents/info --cookie "SID=hBc7TxF76ERhvIw0jQQ4LZ7Z1jQUV0tQ"
```

**注意事项 Notes**

- Upon success, the response will contain a cookie with your SID. You must supply the cookie whenever you want to perform an operation that requires authentication.
- Set `Referer` or `Origin` header to the exact same domain and port as used in the HTTP query `Host` header.

### <a id="auth-logout"></a> 2. logout — 注销

**`POST` `/api/v2/auth/logout`**

注销当前会话，使 SID Cookie 失效。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

---

## <a id="app"></a> 02 · 应用 Application

所有应用接口位于 `app` 分组下，例如 `/api/v2/app/methodName`。

### <a id="app-version"></a> 1. version — 获取应用版本

**`GET` `/api/v2/app/version`**

返回应用版本字符串。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回值 Response**

返回应用版本字符串，例如 `v4.1.3`。

### <a id="app-webapiversion"></a> 2. webapiVersion — 获取 API 版本

**`GET` `/api/v2/app/webapiVersion`**

返回 WebAPI 版本字符串。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回值 Response**

返回 WebAPI 版本字符串，例如 `2.0`。

### <a id="app-buildinfo"></a> 3. buildInfo — 获取构建信息

**`GET` `/api/v2/app/buildInfo`**

返回构建信息 JSON 对象。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `qt` | `string` | QT version |
| `libtorrent` | `string` | libtorrent version |
| `boost` | `string` | Boost version |
| `openssl` | `string` | OpenSSL version |
| `bitness` | `int` | Application bitness (e.g. 64-bit) |

### <a id="app-shutdown"></a> 4. shutdown — 关闭应用

**`GET` `/api/v2/app/shutdown`**

关闭 qBittorrent 应用。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="app-preferences"></a> 5. preferences — 获取应用偏好设置

**`GET` `/api/v2/app/preferences`**

以键值对形式返回应用的设置项。具体内容可能随 qBittorrent.ini 中的配置而异。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `locale` | `string` | Currently selected language (e.g. en_GB for English) |
| `create_subfolder_enabled` | `bool` | True if a subfolder should be created when adding a torrent |
| `start_paused_enabled` | `bool` | True if torrents should be added in a Paused state |
| `auto_delete_mode` | `integer` | TODO |
| `preallocate_all` | `bool` | True if disk space should be pre-allocated for all files |
| `incomplete_files_ext` | `bool` | True if ".!qB" should be appended to incomplete files |
| `auto_tmm_enabled` | `bool` | True if Automatic Torrent Management is enabled by default |
| `torrent_changed_tmm_enabled` | `bool` | True if torrent should be relocated when its Category changes |
| `save_path_changed_tmm_enabled` | `bool` | True if torrent should be relocated when the default save path changes |
| `category_changed_tmm_enabled` | `bool` | True if torrent should be relocated when its Category's save path changes |
| `save_path` | `string` | Default save path for torrents, separated by slashes |
| `temp_path_enabled` | `bool` | True if folder for incomplete torrents is enabled |
| `temp_path` | `string` | Path for incomplete torrents, separated by slashes |
| `scan_dirs` | `object` | Property: directory to watch for torrent files, value: where torrents loaded from this directory should be downloaded to. Slashes are used as path separators; multiple key/value pairs can be specified |
| `export_dir` | `string` | Path to directory to copy .torrent files to. Slashes are used as path separators |
| `export_dir_fin` | `string` | Path to directory to copy .torrent files of completed downloads to. Slashes are used as path separators |
| `mail_notification_enabled` | `bool` | True if e-mail notification should be enabled |
| `mail_notification_sender` | `string` | e-mail where notifications should originate from |
| `mail_notification_email` | `string` | e-mail to send notifications to |
| `mail_notification_smtp` | `string` | smtp server for e-mail notifications |
| `mail_notification_ssl_enabled` | `bool` | True if smtp server requires SSL connection |
| `mail_notification_auth_enabled` | `bool` | True if smtp server requires authentication |
| `mail_notification_username` | `string` | Username for smtp authentication |
| `mail_notification_password` | `string` | Password for smtp authentication |
| `autorun_enabled` | `bool` | True if external program should be run after torrent has finished downloading |
| `autorun_program` | `string` | Program path/name/arguments to run if autorun_enabled is enabled; path is separated by slashes; `%f` and `%n` arguments expanded as path_to_torrent_file and torrent_name |
| `queueing_enabled` | `bool` | True if torrent queuing is enabled |
| `max_active_downloads` | `integer` | Maximum number of active simultaneous downloads |
| `max_active_torrents` | `integer` | Maximum number of active simultaneous downloads and uploads |
| `max_active_uploads` | `integer` | Maximum number of active simultaneous uploads |
| `dont_count_slow_torrents` | `bool` | If true torrents w/o any activity (stalled ones) will not be counted towards max_active_* limits |
| `slow_torrent_dl_rate_threshold` | `integer` | Download rate in KiB/s for a torrent to be considered "slow" |
| `slow_torrent_ul_rate_threshold` | `integer` | Upload rate in KiB/s for a torrent to be considered "slow" |
| `slow_torrent_inactive_timer` | `integer` | Seconds a torrent should be inactive before considered "slow" |
| `max_ratio_enabled` | `bool` | True if share ratio limit is enabled |
| `max_ratio` | `float` | Get the global share ratio limit |
| `max_ratio_act` | `integer` | Action performed when a torrent reaches the maximum share ratio |
| `listen_port` | `integer` | Port for incoming connections |
| `upnp` | `bool` | True if UPnP/NAT-PMP is enabled |
| `random_port` | `bool` | True if the port is randomly selected |
| `dl_limit` | `integer` | Global download speed limit in KiB/s; -1 means no limit is applied |
| `up_limit` | `integer` | Global upload speed limit in KiB/s; -1 means no limit is applied |
| `max_connec` | `integer` | Maximum global number of simultaneous connections |
| `max_connec_per_torrent` | `integer` | Maximum number of simultaneous connections per torrent |
| `max_uploads` | `integer` | Maximum number of upload slots |
| `max_uploads_per_torrent` | `integer` | Maximum number of upload slots per torrent |
| `stop_tracker_timeout` | `integer` | Timeout in seconds for a stopped announce request to trackers |
| `enable_piece_extent_affinity` | `bool` | True if the advanced libtorrent option piece_extent_affinity is enabled |
| `bittorrent_protocol` | `integer` | Bittorrent Protocol to use |
| `limit_utp_rate` | `bool` | True if [du]l_limit should be applied to uTP connections |
| `limit_tcp_overhead` | `bool` | True if [du]l_limit should be applied to estimated TCP overhead |
| `limit_lan_peers` | `bool` | True if [du]l_limit should be applied to peers on the LAN |
| `alt_dl_limit` | `integer` | Alternative global download speed limit in KiB/s |
| `alt_up_limit` | `integer` | Alternative global upload speed limit in KiB/s |
| `scheduler_enabled` | `bool` | True if alternative limits should be applied according to schedule |
| `schedule_from_hour` | `integer` | Scheduler starting hour |
| `schedule_from_min` | `integer` | Scheduler starting minute |
| `schedule_to_hour` | `integer` | Scheduler ending hour |
| `schedule_to_min` | `integer` | Scheduler ending minute |
| `scheduler_days` | `integer` | Scheduler days |
| `dht` | `bool` | True if DHT is enabled |
| `pex` | `bool` | True if PeX is enabled |
| `lsd` | `bool` | True if LSD is enabled |
| `encryption` | `integer` | Encryption setting |
| `anonymous_mode` | `bool` | If true anonymous mode will be enabled |
| `proxy_type` | `integer` | Proxy type |
| `proxy_ip` | `string` | Proxy IP address or domain name |
| `proxy_port` | `integer` | Proxy port |
| `proxy_peer_connections` | `bool` | True if peer and web seed connections should be proxified |
| `proxy_auth_enabled` | `bool` | True proxy requires authentication; doesn't apply to SOCKS4 proxies |
| `proxy_username` | `string` | Username for proxy authentication |
| `proxy_password` | `string` | Password for proxy authentication |
| `proxy_torrents_only` | `bool` | True if proxy is only used for torrents |
| `ip_filter_enabled` | `bool` | True if external IP filter should be enabled |
| `ip_filter_path` | `string` | Path to IP filter file (.dat, .p2p, .p2b files are supported); path is separated by slashes |
| `ip_filter_trackers` | `bool` | True if IP filters are applied to trackers |
| `web_ui_domain_list` | `string` | Semicolon-separated list of domains to accept when performing Host header validation |
| `web_ui_address` | `string` | IP address to use for the WebUI |
| `web_ui_port` | `integer` | WebUI port |
| `web_ui_upnp` | `bool` | True if UPnP is used for the WebUI port |
| `web_ui_username` | `string` | WebUI username |
| `web_ui_password` | `string` | For API ≥ v2.3.0: Plaintext WebUI password, not readable, write-only. For API < v2.3.0: MD5 hash of WebUI password |
| `web_ui_csrf_protection_enabled` | `bool` | True if WebUI CSRF protection is enabled |
| `web_ui_clickjacking_protection_enabled` | `bool` | True if WebUI clickjacking protection is enabled |
| `web_ui_secure_cookie_enabled` | `bool` | True if WebUI cookie Secure flag is enabled |
| `web_ui_max_auth_fail_count` | `integer` | Maximum number of authentication failures before WebUI access ban |
| `web_ui_ban_duration` | `integer` | WebUI access ban duration in seconds |
| `web_ui_session_timeout` | `integer` | Seconds until WebUI is automatically signed off |
| `web_ui_host_header_validation_enabled` | `bool` | True if WebUI host header validation is enabled |
| `bypass_local_auth` | `bool` | True if authentication challenge for loopback address (127.0.0.1) should be disabled |
| `bypass_auth_subnet_whitelist_enabled` | `bool` | True if webui authentication should be bypassed for clients whose ip resides within (at least) one of the subnets on the whitelist |
| `bypass_auth_subnet_whitelist` | `string` | (White)list of ipv4/ipv6 subnets for which webui authentication should be bypassed; list entries are separated by commas |
| `alternative_webui_enabled` | `bool` | True if an alternative WebUI should be used |
| `alternative_webui_path` | `string` | File path to the alternative WebUI |
| `use_https` | `bool` | True if WebUI HTTPS access is enabled |
| `ssl_key` | `string` | For API < v2.0.1: SSL keyfile contents (this is a not a path) |
| `ssl_cert` | `string` | For API < v2.0.1: SSL certificate contents (this is a not a path) |
| `web_ui_https_key_path` | `string` | For API ≥ v2.0.1: Path to SSL keyfile |
| `web_ui_https_cert_path` | `string` | For API ≥ v2.0.1: Path to SSL certificate |
| `dyndns_enabled` | `bool` | True if server DNS should be updated dynamically |
| `dyndns_service` | `integer` | DDNS service |
| `dyndns_username` | `string` | Username for DDNS service |
| `dyndns_password` | `string` | Password for DDNS service |
| `dyndns_domain` | `string` | Your DDNS domain name |
| `rss_refresh_interval` | `integer` | RSS refresh interval |
| `rss_max_articles_per_feed` | `integer` | Max stored articles per RSS feed |
| `rss_processing_enabled` | `bool` | Enable processing of RSS feeds |
| `rss_auto_downloading_enabled` | `bool` | Enable auto-downloading of torrents from the RSS feeds |
| `rss_download_repack_proper_episodes` | `bool` | For API ≥ v2.5.1: Enable downloading of repack/proper Episodes |
| `rss_smart_episode_filters` | `string` | For API ≥ v2.5.1: List of RSS Smart Episode Filters |
| `add_trackers_enabled` | `bool` | Enable automatic adding of trackers to new torrents |
| `add_trackers` | `string` | List of trackers to add to new torrent |
| `web_ui_use_custom_http_headers_enabled` | `bool` | For API ≥ v2.5.1: Enable custom http headers |
| `web_ui_custom_http_headers` | `string` | For API ≥ v2.5.1: List of custom http headers |
| `max_seeding_time_enabled` | `bool` | True enables max seeding time |
| `max_seeding_time` | `integer` | Number of minutes to seed a torrent |
| `announce_ip` | `string` | TODO |
| `announce_to_all_tiers` | `bool` | True always announce to all tiers |
| `announce_to_all_trackers` | `bool` | True always announce to all trackers in a tier |
| `async_io_threads` | `integer` | Number of asynchronous I/O threads |
| `banned_IPs` | `string` | List of banned IPs |
| `checking_memory_use` | `integer` | Outstanding memory when checking torrents in MiB |
| `current_interface_address` | `string` | IP Address to bind to. Empty String means All addresses |
| `current_network_interface` | `string` | Network Interface used |
| `disk_cache` | `integer` | Disk cache used in MiB |
| `disk_cache_ttl` | `integer` | Disk cache expiry interval in seconds |
| `embedded_tracker_port` | `integer` | Port used for embedded tracker |
| `enable_coalesce_read_write` | `bool` | True enables coalesce reads & writes |
| `enable_embedded_tracker` | `bool` | True enables embedded tracker |
| `enable_multi_connections_from_same_ip` | `bool` | True allows multiple connections from the same IP address |
| `enable_os_cache` | `bool` | True enables os cache |
| `enable_upload_suggestions` | `bool` | True enables sending of upload piece suggestions |
| `file_pool_size` | `integer` | File pool size |
| `outgoing_ports_max` | `integer` | Maximal outgoing port (0: Disabled) |
| `outgoing_ports_min` | `integer` | Minimal outgoing port (0: Disabled) |
| `recheck_completed_torrents` | `bool` | True rechecks torrents on completion |
| `resolve_peer_countries` | `bool` | True resolves peer countries |
| `save_resume_data_interval` | `integer` | Save resume data interval in min |
| `send_buffer_low_watermark` | `integer` | Send buffer low watermark in KiB |
| `send_buffer_watermark` | `integer` | Send buffer watermark in KiB |
| `send_buffer_watermark_factor` | `integer` | Send buffer watermark factor in percent |
| `socket_backlog_size` | `integer` | Socket backlog size |
| `upload_choking_algorithm` | `integer` | Upload choking algorithm used |
| `upload_slots_behavior` | `integer` | Upload slots behavior used |
| `upnp_lease_duration` | `integer` | UPnP lease duration (0: Permanent lease) |
| `utp_tcp_mixed_mode` | `integer` | μTP-TCP mixed mode algorithm |

**Possible values of `scan_dirs`**

| 值 | 含义 |
| --- | --- |
| `0` | Download to the monitored folder |
| `1` | Download to the default save path |
| `"/path/to/download/to"` | Download to this path |

**Possible values of `scheduler_days`**

| 值 | 含义 |
| --- | --- |
| `0` | Every day |
| `1` | Every weekday |
| `2` | Every weekend |
| `3` | Every Monday |
| `4` | Every Tuesday |
| `5` | Every Wednesday |
| `6` | Every Thursday |
| `7` | Every Friday |
| `8` | Every Saturday |
| `9` | Every Sunday |

**Possible values of `encryption`**

| 值 | 含义 |
| --- | --- |
| `0` | Prefer encryption (default; allows both encrypted and unencrypted) |
| `1` | Force encryption on |
| `2` | Force encryption off |

**Possible values of `proxy_type`**

| 值 | 含义 |
| --- | --- |
| `-1` | Proxy is disabled |
| `1` | HTTP proxy without authentication |
| `2` | SOCKS5 proxy without authentication |
| `3` | HTTP proxy with authentication |
| `4` | SOCKS5 proxy with authentication |
| `5` | SOCKS4 proxy without authentication |

**Possible values of `dyndns_service`**

| 值 | 含义 |
| --- | --- |
| `0` | Use DyDNS |
| `1` | Use NOIP |

**Possible values of `max_ratio_act`**

| 值 | 含义 |
| --- | --- |
| `0` | Pause torrent |
| `1` | Remove torrent |

**Possible values of `bittorrent_protocol`**

| 值 | 含义 |
| --- | --- |
| `0` | TCP and μTP |
| `1` | TCP |
| `2` | μTP |

**Possible values of `upload_choking_algorithm`**

| 值 | 含义 |
| --- | --- |
| `0` | Round-robin |
| `1` | Fastest upload |
| `2` | Anti-leech |

**Possible values of `upload_slots_behavior`**

| 值 | 含义 |
| --- | --- |
| `0` | Fixed slots |
| `1` | Upload rate based |

**Possible values of `utp_tcp_mixed_mode`**

| 值 | 含义 |
| --- | --- |
| `0` | Prefer TCP |
| `1` | Peer proportional |

**示例 Example**

```json
{
    "add_trackers": "",
    "add_trackers_enabled": false,
    "alt_dl_limit": 10240,
    "alt_up_limit": 10240,
    "alternative_webui_enabled": false,
    "alternative_webui_path": "/home/user/Documents/qbit-webui",
    "announce_ip": "",
    "announce_to_all_tiers": true,
    "announce_to_all_trackers": false,
    "anonymous_mode": false,
    "async_io_threads": 4,
    "auto_delete_mode": 0,
    "auto_tmm_enabled": false,
    "autorun_enabled": false,
    "autorun_program": "",
    "banned_IPs": "",
    "bittorrent_protocol": 0,
    "bypass_auth_subnet_whitelist": "",
    "bypass_auth_subnet_whitelist_enabled": false,
    "bypass_local_auth": false,
    "category_changed_tmm_enabled": false,
    "checking_memory_use": 32,
    "create_subfolder_enabled": true,
    "current_interface_address": "",
    "current_network_interface": "",
    "dht": true,
    "disk_cache": -1,
    "disk_cache_ttl": 60,
    "dl_limit": 0,
    "dont_count_slow_torrents": false,
    "dyndns_domain": "changeme.dyndns.org",
    "dyndns_enabled": false,
    "dyndns_password": "",
    "dyndns_service": 0,
    "dyndns_username": "",
    "embedded_tracker_port": 9000,
    "enable_coalesce_read_write": false,
    "enable_embedded_tracker": false,
    "enable_multi_connections_from_same_ip": false,
    "enable_os_cache": true,
    "enable_piece_extent_affinity": false,
    "enable_upload_suggestions": false,
    "encryption": 0,
    "export_dir": "/home/user/Downloads/all",
    "export_dir_fin": "/home/user/Downloads/completed",
    "file_pool_size": 40,
    "incomplete_files_ext": false,
    "ip_filter_enabled": false,
    "ip_filter_path": "",
    "ip_filter_trackers": false,
    "limit_lan_peers": true,
    "limit_tcp_overhead": false,
    "limit_utp_rate": true,
    "listen_port": 58925,
    "locale": "en",
    "lsd": true,
    "mail_notification_auth_enabled": false,
    "mail_notification_email": "",
    "mail_notification_enabled": false,
    "mail_notification_password": "",
    "mail_notification_sender": "qBittorrent_notification@example.com",
    "mail_notification_smtp": "smtp.changeme.com",
    "mail_notification_ssl_enabled": false,
    "mail_notification_username": "",
    "max_active_downloads": 3,
    "max_active_torrents": 5,
    "max_active_uploads": 3,
    "max_connec": 500,
    "max_connec_per_torrent": 100,
    "max_ratio": -1,
    "max_ratio_act": 0,
    "max_ratio_enabled": false,
    "max_seeding_time": -1,
    "max_seeding_time_enabled": false,
    "max_uploads": -1,
    "max_uploads_per_torrent": -1,
    "outgoing_ports_max": 0,
    "outgoing_ports_min": 0,
    "pex": true,
    "preallocate_all": false,
    "proxy_auth_enabled": false,
    "proxy_ip": "0.0.0.0",
    "proxy_password": "",
    "proxy_peer_connections": false,
    "proxy_port": 8080,
    "proxy_torrents_only": false,
    "proxy_type": 0,
    "proxy_username": "",
    "queueing_enabled": false,
    "random_port": false,
    "recheck_completed_torrents": false,
    "resolve_peer_countries": true,
    "rss_auto_downloading_enabled": true,
    "rss_download_repack_proper_episodes": true,
    "rss_max_articles_per_feed": 50,
    "rss_processing_enabled": true,
    "rss_refresh_interval": 30,
    "rss_smart_episode_filters": "s(\\d+)e(\\d+)\n(\\d+)x(\\d+)\n(\\d{4}[.\\-]\\d{1,2}[.\\-]\\d{1,2})",
    "save_path": "/home/user/Downloads/",
    "save_path_changed_tmm_enabled": false,
    "save_resume_data_interval": 60,
    "scan_dirs": {
        "/home/user/Downloads/incoming/games": 0,
        "/home/user/Downloads/incoming/movies": 1
    },
    "schedule_from_hour": 8,
    "schedule_from_min": 0,
    "schedule_to_hour": 20,
    "schedule_to_min": 0,
    "scheduler_days": 0,
    "scheduler_enabled": false,
    "send_buffer_low_watermark": 10,
    "send_buffer_watermark": 500,
    "send_buffer_watermark_factor": 50,
    "slow_torrent_dl_rate_threshold": 2,
    "slow_torrent_inactive_timer": 60,
    "slow_torrent_ul_rate_threshold": 2,
    "socket_backlog_size": 30,
    "start_paused_enabled": false,
    "stop_tracker_timeout": 1,
    "temp_path": "/home/user/Downloads/temp",
    "temp_path_enabled": false,
    "torrent_changed_tmm_enabled": true,
    "up_limit": 0,
    "upload_choking_algorithm": 1,
    "upload_slots_behavior": 0,
    "upnp": true,
    "use_https": false,
    "utp_tcp_mixed_mode": 0,
    "web_ui_address": "*",
    "web_ui_ban_duration": 3600,
    "web_ui_clickjacking_protection_enabled": true,
    "web_ui_csrf_protection_enabled": true,
    "web_ui_custom_http_headers": "",
    "web_ui_domain_list": "*",
    "web_ui_host_header_validation_enabled": true,
    "web_ui_https_cert_path": "",
    "web_ui_https_key_path": "",
    "web_ui_max_auth_fail_count": 5,
    "web_ui_port": 8080,
    "web_ui_secure_cookie_enabled": true,
    "web_ui_session_timeout": 3600,
    "web_ui_upnp": false,
    "web_ui_use_custom_http_headers_enabled": false,
    "web_ui_username": "admin"
}
```

### <a id="app-setpreferences"></a> 6. setPreferences — 设置应用偏好设置

**`POST` `/api/v2/app/setPreferences`**

以 JSON 键值对形式修改应用的设置项。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `json` | `json` | **是** | A JSON object with key-value pairs of the settings you want to change and their new values |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```json
json={"save_path":"C:/Users/Dayman/Downloads","queueing_enabled":false,"scan_dirs":{"C:/Games": 0,"D:/Downloads": 1}}
```

**注意事项 Notes**

- There is no need to pass all possible preferences' `token:value` pairs if you only want to change one option
- Paths in `scan_dirs` must exist, otherwise this option will have no effect
- String values must be quoted; integer and boolean values must never be quoted
- For a list of possible preference options see `GET /api/v2/app/preferences`

### <a id="app-defaultsavepath"></a> 7. defaultSavePath — 获取默认保存路径

**`GET` `/api/v2/app/defaultSavePath`**

返回默认下载保存路径字符串。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回值 Response**

返回默认保存路径字符串，例如 `C:/Users/Dayman/Downloads`。

### <a id="app-cookies"></a> 8. cookies — 获取 Cookies

**`GET` `/api/v2/app/cookies`**

返回用于下载 .torrent 文件的 Cookie 列表（JSON 数组）。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | Cookie name |
| `domain` | `string` | Cookie domain |
| `path` | `string` | Cookie path |
| `value` | `string` | Cookie value |
| `expirationDate` | `integer` | Seconds since epoch |

**示例 Example**

```json
[
    {
        "name": "Example",
        "domain": "example.com",
        "path": "/",
        "value": "foo=bar",
        "expirationDate": 1507969127
    }
]
```

### <a id="app-setcookies"></a> 9. setCookies — 设置 Cookies

**`POST` `/api/v2/app/setCookies`**

设置下载 .torrent 文件时发送的 Cookie 列表。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `cookies` | `json array` | **是** | A JSON array of cookies to send when downloading .torrent files |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | Cookies were saved |
| 400 | Request was not a valid json array of cookie objects |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string?` | Cookie name |
| `domain` | `string?` | Cookie domain |
| `path` | `string?` | Cookie path |
| `value` | `string?` | Cookie value |
| `expirationDate` | `integer?` | Seconds since epoch |

---

## <a id="log"></a> 03 · 日志 Log

所有日志接口位于 `log` 分组下，例如 `/api/v2/log/methodName`。

### <a id="log-main"></a> 1. main — 获取日志

**`GET` `/api/v2/log/main`**

获取 qBittorrent 日志，可按消息级别过滤。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `normal` | `bool` | 否 | Include normal messages (default: `true`) |
| `info` | `bool` | 否 | Include info messages (default: `true`) |
| `warning` | `bool` | 否 | Include warning messages (default: `true`) |
| `critical` | `bool` | 否 | Include critical messages (default: `true`) |
| `last_known_id` | `integer` | 否 | Exclude messages with "message id" <= `last_known_id` (default: `-1`) |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `integer` | ID of the message |
| `message` | `string` | Text of the message |
| `timestamp` | `integer` | Seconds since epoch (switched from milliseconds to seconds in v4.5.0) |
| `type` | `integer` | Log::NORMAL: `1`, Log::INFO: `2`, Log::WARNING: `4`, Log::CRITICAL: `8` |

**示例 Example**

```http
/api/v2/log/main?normal=true&info=true&warning=true&critical=true&last_known_id=-1
```

```json
[
    {"id":0,"message":"qBittorrent v3.4.0 started","timestamp":1507969127,"type":1},
    {"id":1,"message":"qBittorrent is trying to listen on any interface port: 19036","timestamp":1507969127,"type":2},
    {"id":2,"message":"Peer ID: -qB3400-","timestamp":1507969127,"type":1},
    {"id":3,"message":"HTTP User-Agent is 'qBittorrent/3.4.0'","timestamp":1507969127,"type":1},
    {"id":4,"message":"DHT support [ON]","timestamp":1507969127,"type":2},
    {"id":5,"message":"Local Peer Discovery support [ON]","timestamp":1507969127,"type":2},
    {"id":6,"message":"PeX support [ON]","timestamp":1507969127,"type":2},
    {"id":7,"message":"Anonymous mode [OFF]","timestamp":1507969127,"type":2},
    {"id":8,"message":"Encryption support [ON]","timestamp":1507969127,"type":2},
    {"id":9,"message":"Embedded Tracker [OFF]","timestamp":1507969127,"type":2},
    {"id":10,"message":"UPnP / NAT-PMP support [ON]","timestamp":1507969127,"type":2},
    {"id":11,"message":"Web UI: Now listening on port 8080","timestamp":1507969127,"type":1},
    {"id":12,"message":"Options were saved successfully.","timestamp":1507969128,"type":1},
    {"id":13,"message":"qBittorrent is successfully listening on interface :: port: TCP/19036","timestamp":1507969128,"type":2},
    {"id":14,"message":"qBittorrent is successfully listening on interface 0.0.0.0 port: TCP/19036","timestamp":1507969128,"type":2},
    {"id":15,"message":"qBittorrent is successfully listening on interface 0.0.0.0 port: UDP/19036","timestamp":1507969128,"type":2}
]
```

### <a id="log-peers"></a> 2. peers — 获取 Peer 日志

**`GET` `/api/v2/log/peers`**

获取 Peer 相关日志（封禁记录等）。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `last_known_id` | `integer` | 否 | Exclude messages with "message id" <= `last_known_id` (default: `-1`) |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `integer` | ID of the peer |
| `ip` | `string` | IP of the peer |
| `timestamp` | `integer` | Seconds since epoch |
| `blocked` | `boolean` | Whether or not the peer was blocked |
| `reason` | `string` | Reason of the block |

---

## <a id="sync"></a> 04 · 同步 Sync

Sync API 用于实现「自上次请求以来的变更」增量同步。所有接口位于 `sync` 分组下，例如 `/api/v2/sync/methodName`。

### <a id="sync-maindata"></a> 1. maindata — 获取主数据

**`GET` `/api/v2/sync/maindata`**

获取主数据（增量）。通过 `rid` 实现增量同步：若传入的 `rid` 与上次服务端返回的不同，则 `full_update` 为 `true`。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `rid` | `integer` | 否 | Response ID. If not provided, `rid=0` will be assumed. If the given `rid` is different from the one of last server reply, `full_update` will be `true` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `rid` | `integer` | Response ID |
| `full_update` | `bool` | Whether the response contains all the data or partial data |
| `torrents` | `object` | Property: torrent hash, value: same as torrent list |
| `torrents_removed` | `array` | List of hashes of torrents removed since last request |
| `categories` | `object` | Info for categories added since last request |
| `categories_removed` | `array` | List of categories removed since last request |
| `tags` | `array` | List of tags added since last request |
| `tags_removed` | `array` | List of tags removed since last request |
| `server_state` | `object` | Global transfer info |

**示例 Example**

```http
/api/v2/sync/maindata?rid=14
```

```json
{
    "rid": 15,
    "torrents": {
        "8c212779b4abde7c6bc608063a0d008b7e40ce32": {
            "state": "pausedUP"
        }
    }
}
```

### <a id="sync-torrentpeers"></a> 2. torrentPeers — 获取种子 Peer 数据

**`GET` `/api/v2/sync/torrentPeers`**

获取指定种子的 Peer 增量数据。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | Torrent hash |
| `rid` | `integer` | 否 | Response ID. If not provided, `rid=0` will be assumed. If the given `rid` is different from the one of last server reply, `full_update` will be `true` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Torrent hash was not found |
| 200 | All other scenarios |

**示例 Example**

```http
/api/v2/sync/torrentPeers?hash=8c212779b4abde7c6bc608063a0d008b7e40ce32?rid=14
```

---

## <a id="transfer"></a> 05 · 传输信息 Transfer Info

所有传输信息接口位于 `transfer` 分组下，例如 `/api/v2/transfer/methodName`。

### <a id="transfer-info"></a> 1. info — 获取全局传输信息

**`GET` `/api/v2/transfer/info`**

返回 qBittorrent 状态栏中常见的信息（全局速率、连接状态等）。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `dl_info_speed` | `integer` | Global download rate (bytes/s) |
| `dl_info_data` | `integer` | Data downloaded this session (bytes) |
| `up_info_speed` | `integer` | Global upload rate (bytes/s) |
| `up_info_data` | `integer` | Data uploaded this session (bytes) |
| `dl_rate_limit` | `integer` | Download rate limit (bytes/s) |
| `up_rate_limit` | `integer` | Upload rate limit (bytes/s) |
| `dht_nodes` | `integer` | DHT nodes connected to |
| `connection_status` | `string` | Connection status: `connected`, `firewalled`, or `disconnected` |

**Possible values of `connection_status`**

| 值 | 含义 |
| --- | --- |
| `connected` |  |
| `firewalled` |  |
| `disconnected` |  |

**示例 Example**

```json
{
    "connection_status": "connected",
    "dht_nodes": 386,
    "dl_info_data": 681521119,
    "dl_info_speed": 0,
    "dl_rate_limit": 0,
    "up_info_data": 10747904,
    "up_info_speed": 0,
    "up_rate_limit": 1048576
}
```

### <a id="transfer-speedlimitsmode"></a> 2. speedLimitsMode — 获取备选限速状态

**`GET` `/api/v2/transfer/speedLimitsMode`**

返回备选限速是否开启。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回值 Response**

返回 `1` 表示备选限速已启用，`0` 表示未启用。

### <a id="transfer-togglespeedlimitsmode"></a> 3. toggleSpeedLimitsMode — 切换备选限速

**`GET` `/api/v2/transfer/toggleSpeedLimitsMode`**

在普通限速与备选限速之间切换。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="transfer-downloadlimit"></a> 4. downloadLimit — 获取全局下载限速

**`GET` `/api/v2/transfer/downloadLimit`**

返回当前全局下载限速。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回值 Response**

返回当前全局下载限速（bytes/second）；未设置限速时返回 `0`。

### <a id="transfer-setdownloadlimit"></a> 5. setDownloadLimit — 设置全局下载限速

**`POST` `/api/v2/transfer/setDownloadLimit`**

设置全局下载限速。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | `integer` | **是** | The global download speed limit to set in bytes/second |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="transfer-uploadlimit"></a> 6. uploadLimit — 获取全局上传限速

**`GET` `/api/v2/transfer/uploadLimit`**

返回当前全局上传限速。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回值 Response**

返回当前全局上传限速（bytes/second）；未设置限速时返回 `0`。

### <a id="transfer-setuploadlimit"></a> 7. setUploadLimit — 设置全局上传限速

**`POST` `/api/v2/transfer/setUploadLimit`**

设置全局上传限速。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | `integer` | **是** | The global upload speed limit to set in bytes/second |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="transfer-banpeers"></a> 8. banPeers — 封禁 Peer

**`POST` `/api/v2/transfer/banPeers`**

封禁一个或多个 Peer。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `peers` | `string` | **是** | The peer to ban, or multiple peers separated by a pipe `\|`. Each peer is a colon-separated `host:port` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

---

## <a id="torrents"></a> 06 · 种子管理 Torrent Management

所有种子管理接口位于 `torrents` 分组下，例如 `/api/v2/torrents/methodName`。

### <a id="torrents-info"></a> 1. info — 获取种子列表

**`GET` `/api/v2/torrents/info`**

获取种子列表，支持按状态、分类、标签、排序、分页与哈希过滤。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 | 版本 |
| --- | --- | --- | --- | --- |
| `filter` | `string` | 否 | Filter torrent list by state. Allowed: `all`, `downloading`, `seeding`, `completed`, `stopped`, `active`, `inactive`, `running`, `stalled`, `stalled_uploading`, `stalled_downloading`, `errored` | — |
| `category` | `string` | 否 | Get torrents with the given category (empty string means "without category"; no parameter means "any category"). URL-encode the category name, e.g. `My category` becomes `My%20category` | — |
| `tag` | `string` | 否 | Get torrents with the given tag (empty string means "without tag"; no parameter means "any tag"). URL-encode the tag name | 2.8.3 |
| `sort` | `string` | 否 | Sort torrents by given key (any field of the response JSON) | — |
| `reverse` | `bool` | 否 | Enable reverse sorting. Defaults to `false` | — |
| `limit` | `integer` | 否 | Limit the number of torrents returned | — |
| `offset` | `integer` | 否 | Set offset (if less than 0, offset from end) | — |
| `hashes` | `string` | 否 | Filter by hashes. Multiple hashes separated by `\|` | — |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 | 版本 |
| --- | --- | --- | --- |
| `added_on` | `integer` | Time (Unix Epoch) when the torrent was added to the client | — |
| `amount_left` | `integer` | Amount of data left to download (bytes) | — |
| `auto_tmm` | `bool` | Whether this torrent is managed by Automatic Torrent Management | — |
| `availability` | `float` | Percentage of file pieces currently available | — |
| `category` | `string` | Category of the torrent | — |
| `completed` | `integer` | Amount of transfer data completed (bytes) | — |
| `completion_on` | `integer` | Time (Unix Epoch) when the torrent completed | — |
| `content_path` | `string` | Absolute path of torrent content (root path for multifile torrents, absolute file path for singlefile torrents) | — |
| `dl_limit` | `integer` | Torrent download speed limit (bytes/s). `-1` if unlimited | — |
| `dlspeed` | `integer` | Torrent download speed (bytes/s) | — |
| `downloaded` | `integer` | Amount of data downloaded | — |
| `downloaded_session` | `integer` | Amount of data downloaded this session | — |
| `eta` | `integer` | Torrent ETA (seconds) | — |
| `f_l_piece_prio` | `bool` | True if first last piece are prioritized | — |
| `force_start` | `bool` | True if force start is enabled for this torrent | — |
| `hash` | `string` | Torrent hash | — |
| `isPrivate` | `bool` | True if torrent is from a private tracker | 5.0.0 |
| `last_activity` | `integer` | Last time (Unix Epoch) when a chunk was downloaded/uploaded | — |
| `magnet_uri` | `string` | Magnet URI corresponding to this torrent | — |
| `max_ratio` | `float` | Maximum share ratio until torrent is stopped from seeding/uploading | — |
| `max_seeding_time` | `integer` | Maximum seeding time (seconds) until torrent is stopped from seeding | — |
| `name` | `string` | Torrent name | — |
| `num_complete` | `integer` | Number of seeds in the swarm | — |
| `num_incomplete` | `integer` | Number of leechers in the swarm | — |
| `num_leechs` | `integer` | Number of leechers connected to | — |
| `num_seeds` | `integer` | Number of seeds connected to | — |
| `priority` | `integer` | Torrent priority. Returns `-1` if queuing is disabled or torrent is in seed mode | — |
| `progress` | `float` | Torrent progress (percentage/100) | — |
| `ratio` | `float` | Torrent share ratio. Max ratio value: 9999 | — |
| `ratio_limit` | `float` | TODO (what is different from `max_ratio`?) | — |
| `reannounce` | `integer` | Time until the next tracker reannounce | — |
| `save_path` | `string` | Path where this torrent's data is stored | — |
| `seeding_time` | `integer` | Torrent elapsed time while complete (seconds) | — |
| `seeding_time_limit` | `integer` | Per torrent setting when ATM is disabled. If ATM enabled, value is -2. If unset, default -1 | — |
| `seen_complete` | `integer` | Time (Unix Epoch) when this torrent was last seen complete | — |
| `seq_dl` | `bool` | True if sequential download is enabled | — |
| `size` | `integer` | Total size (bytes) of files selected for download | — |
| `state` | `string` | Torrent state (see table below) | — |
| `super_seeding` | `bool` | True if super seeding is enabled | — |
| `tags` | `string` | Comma-concatenated tag list of the torrent | — |
| `time_active` | `integer` | Total active time (seconds) | — |
| `total_size` | `integer` | Total size (bytes) of all files (including unselected) | — |
| `tracker` | `string` | The first tracker with working status. Returns empty string if no tracker is working | — |
| `up_limit` | `integer` | Torrent upload speed limit (bytes/s). `-1` if unlimited | — |
| `uploaded` | `integer` | Amount of data uploaded | — |
| `uploaded_session` | `integer` | Amount of data uploaded this session | — |
| `upspeed` | `integer` | Torrent upload speed (bytes/s) | — |

**Possible values of `state`**

| 值 | 含义 |
| --- | --- |
| `error` | Some error occurred, applies to paused torrents |
| `missingFiles` | Torrent data files is missing |
| `uploading` | Torrent is being seeded and data is being transferred |
| `pausedUP` | Torrent is paused and has finished downloading |
| `queuedUP` | Queuing is enabled and torrent is queued for upload |
| `stalledUP` | Torrent is being seeded, but no connections were made |
| `checkingUP` | Torrent has finished downloading and is being checked |
| `forcedUP` | Torrent is forced to uploading and ignores queue limit |
| `allocating` | Torrent is allocating disk space for download |
| `downloading` | Torrent is being downloaded and data is being transferred |
| `metaDL` | Torrent has just started downloading and is fetching metadata |
| `pausedDL` | Torrent is paused and has NOT finished downloading |
| `queuedDL` | Queuing is enabled and torrent is queued for download |
| `stalledDL` | Torrent is being downloaded, but no connections were made |
| `checkingDL` | Same as checkingUP, but torrent has NOT finished downloading |
| `forcedDL` | Torrent is forced to downloading to ignore queue limit |
| `checkingResumeData` | Checking resume data on qBt startup |
| `moving` | Torrent is moving to another location |
| `unknown` | Unknown status |

**示例 Example**

```http
/api/v2/torrents/info?filter=downloading&category=sample%20category&sort=ratio
```

```json
[
    {
        "dlspeed": 9681262,
        "eta": 87,
        "f_l_piece_prio": false,
        "force_start": false,
        "hash": "8c212779b4abde7c6bc608063a0d008b7e40ce32",
        "category": "",
        "tags": "",
        "name": "debian-8.1.0-amd64-CD-1.iso",
        "num_complete": -1,
        "num_incomplete": -1,
        "num_leechs": 2,
        "num_seeds": 54,
        "priority": 1,
        "progress": 0.16108787059783936,
        "ratio": 0,
        "seq_dl": false,
        "size": 657457152,
        "state": "downloading",
        "super_seeding": false,
        "upspeed": 0,
        "isPrivate": true
    }
]
```

### <a id="torrents-properties"></a> 2. properties — 获取种子通用属性

**`GET` `/api/v2/torrents/properties`**

需要知道种子哈希（可从种子列表接口获取）。返回指定种子的通用属性。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent you want to get the generic properties of |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Torrent hash was not found |
| 200 | All other scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `save_path` | `string` | Torrent save path |
| `creation_date` | `integer` | Torrent creation date (Unix timestamp) |
| `piece_size` | `integer` | Torrent piece size (bytes) |
| `comment` | `string` | Torrent comment |
| `total_wasted` | `integer` | Total data wasted for torrent (bytes) |
| `total_uploaded` | `integer` | Total data uploaded for torrent (bytes) |
| `total_uploaded_session` | `integer` | Total data uploaded this session (bytes) |
| `total_downloaded` | `integer` | Total data downloaded for torrent (bytes) |
| `total_downloaded_session` | `integer` | Total data downloaded this session (bytes) |
| `up_limit` | `integer` | Torrent upload limit (bytes/s) |
| `dl_limit` | `integer` | Torrent download limit (bytes/s) |
| `time_elapsed` | `integer` | Torrent elapsed time (seconds) |
| `seeding_time` | `integer` | Torrent elapsed time while complete (seconds) |
| `nb_connections` | `integer` | Torrent connection count |
| `nb_connections_limit` | `integer` | Torrent connection count limit |
| `share_ratio` | `float` | Torrent share ratio |
| `addition_date` | `integer` | When this torrent was added (Unix timestamp) |
| `completion_date` | `integer` | Torrent completion date (Unix timestamp) |
| `created_by` | `string` | Torrent creator |
| `dl_speed_avg` | `integer` | Torrent average download speed (bytes/second) |
| `dl_speed` | `integer` | Torrent download speed (bytes/second) |
| `eta` | `integer` | Torrent ETA (seconds) |
| `last_seen` | `integer` | Last seen complete date (Unix timestamp) |
| `peers` | `integer` | Number of peers connected to |
| `peers_total` | `integer` | Number of peers in the swarm |
| `pieces_have` | `integer` | Number of pieces owned |
| `pieces_num` | `integer` | Number of pieces of the torrent |
| `reannounce` | `integer` | Number of seconds until the next announce |
| `seeds` | `integer` | Number of seeds connected to |
| `seeds_total` | `integer` | Number of seeds in the swarm |
| `total_size` | `integer` | Torrent total size (bytes) |
| `up_speed_avg` | `integer` | Torrent average upload speed (bytes/second) |
| `up_speed` | `integer` | Torrent upload speed (bytes/second) |
| `isPrivate` | `bool` | True if torrent is from a private tracker |

**示例 Example**

```json
{
    "addition_date": 1438429165,
    "comment": "\"Debian CD from cdimage.debian.org\"",
    "completion_date": 1438429234,
    "created_by": "",
    "creation_date": 1433605214,
    "dl_limit": -1,
    "dl_speed": 0,
    "dl_speed_avg": 9736015,
    "eta": 8640000,
    "isPrivate": true,
    "last_seen": 1438430354,
    "nb_connections": 3,
    "nb_connections_limit": 250,
    "peers": 1,
    "peers_total": 89,
    "piece_size": 524288,
    "pieces_have": 1254,
    "pieces_num": 1254,
    "reannounce": 672,
    "save_path": "/Downloads/debian-8.1.0-amd64-CD-1.iso",
    "seeding_time": 1128,
    "seeds": 1,
    "seeds_total": 254,
    "share_ratio": 0.00072121022562178299,
    "time_elapsed": 1197,
    "total_downloaded": 681521119,
    "total_downloaded_session": 681521119,
    "total_size": 657457152,
    "total_uploaded": 491520,
    "total_uploaded_session": 491520,
    "total_wasted": 23481724,
    "up_limit": -1,
    "up_speed": 0,
    "up_speed_avg": 410
}
```

**注意事项 Notes**

- -1` is returned if the type of the property is integer but its value is not known.

### <a id="torrents-trackers"></a> 3. trackers — 获取种子 Tracker

**`GET` `/api/v2/torrents/trackers`**

需要知道种子哈希。返回指定种子的 Tracker 列表。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent you want to get the trackers of |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Torrent hash was not found |
| 200 | All other scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `url` | `string` | Tracker URL |
| `status` | `integer` | Tracker status (see below) |
| `tier` | `integer` | Tracker priority tier. Lower tier tried before higher. `< 0` is placeholder when tier doesn't exist (e.g. DHT) |
| `num_peers` | `integer` | Number of peers for current torrent, as reported by the tracker |
| `num_seeds` | `integer` | Number of seeds for current torrent, as reported by the tracker |
| `num_leeches` | `integer` | Number of leeches for current torrent, as reported by the tracker |
| `num_downloaded` | `integer` | Number of completed downloads for current torrent, as reported by the tracker |
| `msg` | `string` | Tracker message |

**Possible values of `status`**

| 值 | 含义 |
| --- | --- |
| `0` | Tracker is disabled (used for DHT, PeX, and LSD) |
| `1` | Tracker has not been contacted yet |
| `2` | Tracker has been contacted and is working |
| `3` | Tracker is updating |
| `4` | Tracker has been contacted, but is not working (or doesn't send proper replies) |

**示例 Example**

```json
[
    {
        "msg": "",
        "num_peers": 100,
        "status": 2,
        "url": "http://bttracker.debian.org:6969/announce"
    }
]
```

### <a id="torrents-webseeds"></a> 4. webseeds — 获取种子 Web Seeds

**`GET` `/api/v2/torrents/webseeds`**

需要知道种子哈希。返回指定种子的 Web Seed 列表。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent you want to get the webseeds of |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Torrent hash was not found |
| 200 | All other scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `url` | `string` | URL of the web seed |

**示例 Example**

```json
[
    {"url": "http://some_url/"},
    {"url": "http://some_other_url/"}
]
```

### <a id="torrents-files"></a> 5. files — 获取种子内容（文件列表）

**`GET` `/api/v2/torrents/files`**

需要知道种子哈希。返回指定种子的文件列表，可通过 `indexes` 过滤。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 | 版本 |
| --- | --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent you want to get the contents of | — |
| `indexes` | `string` | 否 | The indexes of the files you want to retrieve, separated by `\|` | 2.8.2 |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Torrent hash was not found |
| 200 | All other scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 | 版本 |
| --- | --- | --- | --- |
| `index` | `integer` | File index | 2.8.2 |
| `name` | `string` | File name (including relative path) | — |
| `size` | `integer` | File size (bytes) | — |
| `progress` | `float` | File progress (percentage/100) | — |
| `priority` | `integer` | File priority (see below) | — |
| `is_seed` | `bool` | True if file is seeding/complete | — |
| `piece_range` | `integer array` | Starting and ending piece index (inclusive) | — |
| `availability` | `float` | Percentage of file pieces currently available (percentage/100) | — |

**Possible values of `priority`**

| 值 | 含义 |
| --- | --- |
| `0` | Do not download |
| `1` | Normal priority |
| `6` | High priority |
| `7` | Maximal priority |

**示例 Example**

```json
[
    {
        "index": 0,
        "is_seed": false,
        "name": "debian-8.1.0-amd64-CD-1.iso",
        "piece_range": [0, 1253],
        "priority": 1,
        "progress": 0,
        "size": 657457152,
        "availability": 0.5
    }
]
```

### <a id="torrents-piecestates"></a> 6. pieceStates — 获取种子分片状态

**`GET` `/api/v2/torrents/pieceStates`**

需要知道种子哈希。返回该种子所有分片的状态数组（按顺序）。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent you want to get the pieces' states of |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Torrent hash was not found |
| 200 | All other scenarios |

**Value meanings**

| 值 | 含义 |
| --- | --- |
| `0` | Not downloaded yet |
| `1` | Now downloading |
| `2` | Already downloaded |

**示例 Example**

```json
[0,0,2,1,0,0,2,1]
```

### <a id="torrents-piecehashes"></a> 7. pieceHashes — 获取种子分片哈希

**`GET` `/api/v2/torrents/pieceHashes`**

需要知道种子哈希。返回该种子所有分片的哈希数组（按顺序）。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent you want to get the pieces' hashes of |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Torrent hash was not found |
| 200 | All other scenarios |

**示例 Example**

```json
["54eddd830a5b58480a6143d616a97e3a6c23c439","f8a99d225aa4241db100f88407fc3bdaead583ab","928fb615b9bd4dd8f9e9022552c8f8f37ef76f58"]
```

### <a id="torrents-stop"></a> 8. stop — 暂停种子

**`GET` `/api/v2/torrents/stop`**

暂停一个或多个种子。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes of torrents to pause, separated by `\|`, or `all` for all torrents |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
/api/v2/torrents/stop?hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|54eddd830a5b58480a6143d616a97e3a6c23c439
```

### <a id="torrents-start"></a> 9. start — 恢复种子

**`GET` `/api/v2/torrents/start`**

恢复（继续）一个或多个种子。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes of torrents to resume, separated by `\|`, or `all` for all torrents |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
/api/v2/torrents/start?hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|54eddd830a5b58480a6143d616a97e3a6c23c439
```

### <a id="torrents-delete"></a> 10. delete — 删除种子

**`GET` `/api/v2/torrents/delete`**

删除一个或多个种子，可选择同时删除下载的数据文件。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes of torrents to delete, separated by `\|`, or `all` for all torrents |
| `deleteFiles` | `string` | 否 | If set to `true`, the downloaded data will also be deleted, otherwise has no effect |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
/api/v2/torrents/delete?hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32&deleteFiles=false
```

### <a id="torrents-recheck"></a> 11. recheck — 重新校验种子

**`GET` `/api/v2/torrents/recheck`**

重新校验一个或多个种子的文件完整性。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes of torrents to recheck, separated by `\|`, or `all` for all torrents |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
/api/v2/torrents/recheck?hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|54eddd830a5b58480a6143d616a97e3a6c23c439
```

### <a id="torrents-reannounce"></a> 12. reannounce — 重新宣告种子

**`GET` `/api/v2/torrents/reannounce`**

向 Tracker 重新宣告一个或多个种子。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes of torrents to reannounce, separated by `\|`, or `all` for all torrents |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
/api/v2/torrents/reannounce?hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|54eddd830a5b58480a6143d616a97e3a6c23c439
```

### <a id="torrents-add"></a> 13. add — 添加新种子

**`POST` `/api/v2/torrents/add`**

从服务器本地文件或 URL 添加种子。支持 `http://`、`https://`、`magnet:` 与 `bc://bt/` 链接。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 | 版本 |
| --- | --- | --- | --- | --- |
| `urls` | `string` | 否 | URLs separated with newlines | — |
| `torrents` | `raw` | 否 | Raw data of torrent file. Can be presented multiple times | — |
| `savepath` | `string` | 否 | Download folder | — |
| `category` | `string` | 否 | Category for the torrent | — |
| `tags` | `string` | 否 | Tags for the torrent, split by ',' | — |
| `skip_checking` | `string` | 否 | Skip hash checking. `true` or `false` (default) | — |
| `paused` | `string` | 否 | Add torrents in the paused state. `true` or `false` (default) | — |
| `root_folder` | `string` | 否 | Create the root folder. `true`, `false`, or unset (default) | — |
| `rename` | `string` | 否 | Rename torrent | — |
| `upLimit` | `integer` | 否 | Set torrent upload speed limit. Unit in bytes/second | — |
| `dlLimit` | `integer` | 否 | Set torrent download speed limit. Unit in bytes/second | — |
| `ratioLimit` | `float` | 否 | Set torrent share ratio limit | 2.8.1 |
| `seedingTimeLimit` | `integer` | 否 | Set torrent seeding time limit. Unit in minutes | 2.8.1 |
| `autoTMM` | `bool` | 否 | Whether Automatic Torrent Management should be used | — |
| `sequentialDownload` | `string` | 否 | Enable sequential download. `true` or `false` (default) | — |
| `firstLastPiecePrio` | `string` | 否 | Prioritize download first last piece. `true` or `false` (default) | — |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 415 | Torrent file is not valid |
| 200 | All other scenarios |

**示例 Example**

```http
POST /api/v2/torrents/add HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: multipart/form-data; boundary=---------------------------6688794727912
Content-Length: length

-----------------------------6688794727912
Content-Disposition: form-data; name="urls"

https://torcache.net/torrent/3B1A1469C180F447B77021074DBBCCAEF62611E7.torrent
https://torcache.net/torrent/3B1A1469C180F447B77021074DBBCCAEF62611E8.torrent
-----------------------------6688794727912
Content-Disposition: form-data; name="savepath"

C:/Users/qBit/Downloads
-----------------------------6688794727912
Content-Disposition: form-data; name="category"

movies
-----------------------------6688794727912
Content-Disposition: form-data; name="skip_checking"

true
-----------------------------6688794727912
Content-Disposition: form-data; name="paused"

true
-----------------------------6688794727912
Content-Disposition: form-data; name="root_folder"

true
-----------------------------6688794727912--
```

```http
POST /api/v2/torrents/add HTTP/1.1
Content-Type: multipart/form-data; boundary=-------------------------acebdf13572468
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Length: length

---------------------------acebdf13572468
Content-Disposition: form-data; name="torrents"; filename="8f18036b7a205c9347cb84a253975e12f7adddf2.torrent"
Content-Type: application/x-bittorrent

file_binary_data_goes_here
---------------------------acebdf13572468
Content-Disposition: form-data; name="torrents"; filename="UFS.torrent"
Content-Type: application/x-bittorrent

file_binary_data_goes_here
---------------------------acebdf13572468--
```

### <a id="torrents-addtrackers"></a> 14. addTrackers — 向种子添加 Tracker

**`POST` `/api/v2/torrents/addTrackers`**

需要知道种子哈希。向指定种子添加一个或多个 Tracker URL。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent |
| `urls` | `string` | **是** | Tracker URLs, separated by newlines (`%0A`). Ampersand in tracker URLs MUST be escaped |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Torrent hash was not found |
| 200 | All other scenarios |

**示例 Example**

```http
POST /api/v2/torrents/addTrackers HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hash=8c212779b4abde7c6bc608063a0d008b7e40ce32&urls=http://192.168.0.1/announce%0Audp://192.168.0.1:3333/dummyAnnounce
```

**注意事项 Notes**

- This adds two trackers to torrent. Note `%0A` (aka LF newline) between trackers. Ampersand in tracker urls MUST be escaped.

### <a id="torrents-edittracker"></a> 15. editTracker — 编辑 Tracker

**`POST` `/api/v2/torrents/editTracker`**

将指定种子的某个 Tracker URL 替换为新 URL。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent |
| `url` | `string` | **是** | The tracker URL you want to edit |
| `newUrl` | `string` | **是** | The new URL to replace the `url` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 400 | `newUrl` is not a valid URL |
| 404 | Torrent hash was not found |
| 409 | `newUrl` already exists for the torrent |
| 409 | `url` was not found |
| 200 | All other scenarios |

### <a id="torrents-removetrackers"></a> 16. removeTrackers — 移除 Tracker

**`POST` `/api/v2/torrents/removeTrackers`**

从指定种子移除一个或多个 Tracker。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent |
| `urls` | `string` | **是** | URLs to remove, separated by `\|` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Torrent hash was not found |
| 409 | All `urls` were not found |
| 200 | All other scenarios |

### <a id="torrents-addpeers"></a> 17. addPeers — 添加 Peer

**`POST` `/api/v2/torrents/addPeers`**

向一个或多个种子添加 Peer。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | The hash of the torrent, or multiple hashes separated by a pipe `\|` |
| `peers` | `string` | **是** | The peer to add, or multiple peers separated by a pipe `\|`. Each peer is a colon-separated `host:port` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 400 | None of the supplied peers are valid |
| 200 | All other scenarios |

### <a id="torrents-increaseprio"></a> 18. increasePrio — 提升种子优先级

**`GET` `/api/v2/torrents/increasePrio`**

提升一个或多个种子的队列优先级。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes of torrents, separated by `\|`, or `all` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 409 | Torrent queueing is not enabled |
| 200 | All other scenarios |

### <a id="torrents-decreaseprio"></a> 19. decreasePrio — 降低种子优先级

**`GET` `/api/v2/torrents/decreasePrio`**

降低一个或多个种子的队列优先级。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes of torrents, separated by `\|`, or `all` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 409 | Torrent queueing is not enabled |
| 200 | All other scenarios |

### <a id="torrents-topprio"></a> 20. topPrio — 设为最高优先级

**`GET` `/api/v2/torrents/topPrio`**

将一个或多个种子设为队列最高优先级。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes of torrents, separated by `\|`, or `all` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 409 | Torrent queueing is not enabled |
| 200 | All other scenarios |

### <a id="torrents-bottomprio"></a> 21. bottomPrio — 设为最低优先级

**`GET` `/api/v2/torrents/bottomPrio`**

将一个或多个种子设为队列最低优先级。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes of torrents, separated by `\|`, or `all` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 409 | Torrent queueing is not enabled |
| 200 | All other scenarios |

### <a id="torrents-fileprio"></a> 22. filePrio — 设置文件优先级

**`POST` `/api/v2/torrents/filePrio`**

设置种子内文件的下载优先级。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent |
| `id` | `string` | **是** | File ids, separated by `\|` |
| `priority` | `number` | **是** | File priority to set (see torrent contents API for possible values) |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 400 | Priority is invalid |
| 400 | At least one file `id` is not a valid integer |
| 404 | Torrent hash was not found |
| 409 | Torrent metadata hasn't downloaded yet |
| 409 | At least one file `id` was not found |
| 200 | All other scenarios |

**注意事项 Notes**

- id` values correspond to file position inside the array returned by torrent contents API, e.g. `id=0` for first file, `id=1` for second file, etc.
- Since 2.8.2 it is recommended to use `index` field returned by torrent contents API (since the files can be filtered and the `index` value may differ from the position inside the response array).

### <a id="torrents-downloadlimit"></a> 23. downloadLimit — 获取种子下载限速

**`POST` `/api/v2/torrents/downloadLimit`**

获取一个或多个种子的下载限速。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|` or `all` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回值 Response**

返回 JSON 对象，将种子哈希映射到其下载限速（bytes/second，未限速为 `0`）。

**示例 Example**

```http
POST /api/v2/torrents/downloadLimit HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|284b83c9c7935002391129fd97f43db5d7cc2ba0
```

```json
{"8c212779b4abde7c6bc608063a0d008b7e40ce32": 338944, "284b83c9c7935002391129fd97f43db5d7cc2ba0": 123}
```

### <a id="torrents-setdownloadlimit"></a> 24. setDownloadLimit — 设置种子下载限速

**`POST` `/api/v2/torrents/setDownloadLimit`**

设置一个或多个种子的下载限速。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|` or `all` |
| `limit` | `integer` | **是** | Download speed limit in bytes/second |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
POST /api/v2/torrents/setDownloadLimit HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|284b83c9c7935002391129fd97f43db5d7cc2ba0&limit=131072
```

### <a id="torrents-setsharelimits"></a> 25. setShareLimits — 设置种子分享限制

**`POST` `/api/v2/torrents/setShareLimits`**

设置一个或多个种子的分享率 / 做种时间限制。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | The hashes of the torrents for which you want to set the share limits, separated by `\|` or `all` |
| `ratioLimit` | `float` | 否 | Maximum seeding ratio. `-2` = global limit, `-1` = no limit |
| `seedingTimeLimit` | `integer` | 否 | Maximum seeding time (minutes). `-2` = global limit, `-1` = no limit |
| `inactiveSeedingTimeLimit` | `integer` | 否 | Maximum inactive seeding time (minutes). `-2` = global limit, `-1` = no limit |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All other scenarios |
| 400 | Bad Request, e.g. missing parameter |

**示例 Example**

```http
POST /api/v2/torrents/setShareLimits HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|284b83c9c7935002391129fd97f43db5d7cc2ba0&ratioLimit=1.0&seedingTimeLimit=60&inactiveSeedingTimeLimit=-2
```

### <a id="torrents-uploadlimit"></a> 26. uploadLimit — 获取种子上传限速

**`POST` `/api/v2/torrents/uploadLimit`**

获取一个或多个种子的上传限速。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|` or `all` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回值 Response**

返回 JSON 对象，将种子哈希映射到其上传限速（bytes/second，未限速为 `0`）。

**示例 Example**

```http
POST /api/v2/torrents/uploadLimit HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|284b83c9c7935002391129fd97f43db5d7cc2ba0
```

```json
{"8c212779b4abde7c6bc608063a0d008b7e40ce32": 338944, "284b83c9c7935002391129fd97f43db5d7cc2ba0": 123}
```

### <a id="torrents-setuploadlimit"></a> 27. setUploadLimit — 设置种子上传限速

**`POST` `/api/v2/torrents/setUploadLimit`**

设置一个或多个种子的上传限速。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|` or `all` |
| `limit` | `integer` | **是** | Upload speed limit in bytes/second |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
POST /api/v2/torrents/setUploadLimit HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|284b83c9c7935002391129fd97f43db5d7cc2ba0&limit=131072
```

### <a id="torrents-setlocation"></a> 28. setLocation — 设置种子保存位置

**`POST` `/api/v2/torrents/setLocation`**

移动一个或多个种子的下载位置。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|` or `all` |
| `location` | `string` | **是** | Location to download the torrent to. If it doesn't exist, torrent's location is unchanged |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 400 | Save path is empty |
| 403 | User does not have write access to directory |
| 409 | Unable to create save path directory |
| 200 | All other scenarios |

**示例 Example**

```http
POST /api/v2/torrents/setLocation HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|284b83c9c7935002391129fd97f43db5d7cc2ba0&location=/mnt/nfs/media
```

### <a id="torrents-rename"></a> 29. rename — 重命名种子

**`POST` `/api/v2/torrents/rename`**

重命名指定种子。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent |
| `name` | `string` | **是** | The new name |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Torrent hash is invalid |
| 409 | Torrent name is empty |
| 200 | All other scenarios |

**示例 Example**

```http
POST /api/v2/torrents/rename HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hash=8c212779b4abde7c6bc608063a0d008b7e40ce32&name=This%20is%20a%20test
```

### <a id="torrents-setcategory"></a> 30. setCategory — 设置种子分类

**`POST` `/api/v2/torrents/setCategory`**

为一个或多个种子设置分类。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|` or `all` |
| `category` | `string` | **是** | The torrent category to set |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 409 | Category name does not exist |
| 200 | All other scenarios |

**示例 Example**

```http
POST /api/v2/torrents/setCategory HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|284b83c9c7935002391129fd97f43db5d7cc2ba0&category=CategoryName
```

### <a id="torrents-categories"></a> 31. categories — 获取全部分类

**`GET` `/api/v2/torrents/categories`**

以 JSON 格式返回全部分类。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```json
{
    "Video": {
        "name": "Video",
        "savePath": "/home/user/torrents/video/"
    },
    "eBooks": {
        "name": "eBooks",
        "savePath": "/home/user/torrents/eBooks/"
    }
}
```

### <a id="torrents-createcategory"></a> 32. createCategory — 新建分类

**`POST` `/api/v2/torrents/createCategory`**

创建一个新的分类。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `category` | `string` | **是** | The category to create |
| `savePath` | `string` | 否 | Save path for the category |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 400 | Category name is empty |
| 409 | Category name is invalid |
| 200 | All other scenarios |

**示例 Example**

```http
POST /api/v2/torrents/createCategory HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

category=CategoryName&savePath=/path/to/dir
```

### <a id="torrents-editcategory"></a> 33. editCategory — 编辑分类

**`POST` `/api/v2/torrents/editCategory`**

编辑分类的保存路径。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `category` | `string` | **是** | The category to edit |
| `savePath` | `string` | **是** | New save path |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 400 | Category name is empty |
| 409 | Category editing failed |
| 200 | All other scenarios |

**示例 Example**

```http
POST /api/v2/torrents/editCategory HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

category=CategoryName&savePath=/path/to/save/torrents/to
```

### <a id="torrents-removecategories"></a> 34. removeCategories — 删除分类

**`POST` `/api/v2/torrents/removeCategories`**

删除一个或多个分类。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `categories` | `string` | **是** | Categories to remove, separated by `\n` (`%0A` URL-encoded) |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
POST /api/v2/torrents/removeCategories HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

categories=Category1%0ACategory2
```

### <a id="torrents-addtags"></a> 35. addTags — 添加标签

**`POST` `/api/v2/torrents/addTags`**

为一个或多个种子添加标签。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|` or `all` |
| `tags` | `string` | **是** | List of tags to add, comma-separated |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
POST /api/v2/torrents/addTags HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|284b83c9c7935002391129fd97f43db5d7cc2ba0&tags=TagName1,TagName2
```

### <a id="torrents-removetags"></a> 36. removeTags — 移除标签

**`POST` `/api/v2/torrents/removeTags`**

从一个或多个种子移除标签。空列表将移除全部标签。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|` or `all` |
| `tags` | `string` | **是** | List of tags to remove, comma-separated. Empty list removes all tags |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
POST /api/v2/torrents/removeTags HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|284b83c9c7935002391129fd97f43db5d7cc2ba0&tags=TagName1,TagName2
```

### <a id="torrents-tags"></a> 37. tags — 获取全部标签

**`GET` `/api/v2/torrents/tags`**

以 JSON 格式返回全部标签。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```json
["Tag 1", "Tag 2"]
```

### <a id="torrents-createtags"></a> 38. createTags — 创建标签

**`POST` `/api/v2/torrents/createTags`**

创建标签，多个标签以逗号分隔。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `tags` | `string` | **是** | List of tags to create, comma-separated |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
POST /api/v2/torrents/createTags HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

tags=TagName1,TagName2
```

### <a id="torrents-deletetags"></a> 39. deleteTags — 删除标签

**`POST` `/api/v2/torrents/deleteTags`**

删除标签，多个标签以逗号分隔。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `tags` | `string` | **是** | List of tags to delete, comma-separated |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
POST /api/v2/torrents/deleteTags HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

tags=TagName1,TagName2
```

### <a id="torrents-setautomanagement"></a> 40. setAutoManagement — 设置自动种子管理 (ATM)

**`POST` `/api/v2/torrents/setAutoManagement`**

启用或禁用指定种子的自动种子管理。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|` or `all` |
| `enable` | `bool` | 否 | Whether to enable ATM. Default: `false` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
POST /api/v2/torrents/setAutoManagement HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32|284b83c9c7935002391129fd97f43db5d7cc2ba0&enable=true
```

### <a id="torrents-togglesequentialdownload"></a> 41. toggleSequentialDownload — 切换顺序下载

**`GET` `/api/v2/torrents/toggleSequentialDownload`**

切换一个或多个种子的顺序下载模式。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|`, or `all` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="torrents-togglefirstlastpieceprio"></a> 42. toggleFirstLastPiecePrio — 切换首尾分片优先

**`GET` `/api/v2/torrents/toggleFirstLastPiecePrio`**

切换一个或多个种子的首/尾分片优先下载。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|`, or `all` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="torrents-setforcestart"></a> 43. setForceStart — 设置强制开始

**`POST` `/api/v2/torrents/setForceStart`**

启用或禁用指定种子的强制开始。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|` or `all` |
| `value` | `bool` | 否 | Whether to enable force start. Default: `false` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
POST /api/v2/torrents/setForceStart HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32&value=true
```

### <a id="torrents-setsuperseeding"></a> 44. setSuperSeeding — 设置超级做种

**`POST` `/api/v2/torrents/setSuperSeeding`**

启用或禁用指定种子的超级做种模式。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hashes` | `string` | **是** | Hashes separated by `\|` or `all` |
| `value` | `bool` | 否 | Whether to enable super seeding. Default: `false` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```http
POST /api/v2/torrents/setSuperSeeding HTTP/1.1
User-Agent: Fiddler
Host: 127.0.0.1
Cookie: SID=your_sid
Content-Type: application/x-www-form-urlencoded
Content-Length: length

hashes=8c212779b4abde7c6bc608063a0d008b7e40ce32&value=true
```

### <a id="torrents-renamefile"></a> 45. renameFile — 重命名文件

**`POST` `/api/v2/torrents/renameFile`**

重命名种子内的单个文件。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent |
| `oldPath` | `string` | **是** | The old path of the file |
| `newPath` | `string` | **是** | The new path to use for the file |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 400 | Missing `newPath` parameter |
| 409 | Invalid `newPath` or `oldPath`, or `newPath` already in use |
| 200 | All other scenarios |

### <a id="torrents-renamefolder"></a> 46. renameFolder — 重命名文件夹

**`POST` `/api/v2/torrents/renameFolder`**

重命名种子内的单个文件夹。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hash` | `string` | **是** | The hash of the torrent |
| `oldPath` | `string` | **是** | The old path of the folder |
| `newPath` | `string` | **是** | The new path to use for the folder |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 400 | Missing `newPath` parameter |
| 409 | Invalid `newPath` or `oldPath`, or `newPath` already in use |
| 200 | All other scenarios |

---

## <a id="rss"></a> 07 · RSS（实验性） RSS (experimental)

所有 RSS 接口位于 `rss` 分组下，例如 `/api/v2/rss/methodName`。该功能仍处于实验阶段。

### <a id="rss-addfolder"></a> 1. addFolder — 添加文件夹

**`POST` `/api/v2/rss/addFolder`**

在 RSS 订阅树中添加文件夹。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `path` | `string` | **是** | Full path of added folder (e.g. "The Pirate Bay\Top100") |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 409 | Failure to add folder |
| 200 | All other scenarios |

### <a id="rss-addfeed"></a> 2. addFeed — 添加订阅源

**`POST` `/api/v2/rss/addFeed`**

添加 RSS 订阅源。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `url` | `string` | **是** | URL of RSS feed (e.g. `http://thepiratebay.org/rss//top100/200`) |
| `path` | `string` | 否 | Full path of added folder (e.g. "The Pirate Bay\Top100\Video") |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 409 | Failure to add feed |
| 200 | All other scenarios |

### <a id="rss-removeitem"></a> 3. removeItem — 移除项目

**`POST` `/api/v2/rss/removeItem`**

移除文件夹或订阅源。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `path` | `string` | **是** | Full path of removed item (e.g. "The Pirate Bay\Top100") |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 409 | Failure to remove item |
| 200 | All other scenarios |

### <a id="rss-moveitem"></a> 4. moveItem — 移动项目

**`POST` `/api/v2/rss/moveItem`**

移动 / 重命名文件夹或订阅源。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `itemPath` | `string` | **是** | Current full path of item (e.g. "The Pirate Bay\Top100") |
| `destPath` | `string` | **是** | New full path of item (e.g. "The Pirate Bay") |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 409 | Failure to move item |
| 200 | All other scenarios |

### <a id="rss-items"></a> 5. items — 获取全部订阅项目

**`GET` `/api/v2/rss/items`**

返回 RSS 订阅树中的所有项目。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `withData` | `bool` | 否 | True if you need current feed articles |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```json
{
    "HD-Torrents.org": "https://hd-torrents.org/rss.php",
    "PowerfulJRE": "https://www.youtube.com/feeds/videos.xml?channel_id=UCzQUP1qoWDoEbmsQxvdjxgQ",
    "The Pirate Bay": {
        "Audio": "https://thepiratebay.org/rss//top100/100",
        "Video": "https://thepiratebay.org/rss//top100/200"
    }
}
```

### <a id="rss-markasread"></a> 6. markAsRead — 标记已读

**`POST` `/api/v2/rss/markAsRead`**

如果提供了 `articleId`，则仅将该文章标记为已读，否则将整个订阅源标记为已读。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `itemPath` | `string` | **是** | Current full path of item (e.g. "The Pirate Bay\Top100") |
| `articleId` | `string` | 否 | ID of article |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="rss-refreshitem"></a> 7. refreshItem — 刷新项目

**`POST` `/api/v2/rss/refreshItem`**

刷新文件夹或订阅源。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `itemPath` | `string` | **是** | Current full path of item (e.g. "The Pirate Bay\Top100") |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="rss-setrule"></a> 8. setRule — 设置自动下载规则

**`POST` `/api/v2/rss/setRule`**

创建或更新 RSS 自动下载规则。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ruleName` | `string` | **是** | Rule name (e.g. "Punisher") |
| `ruleDef` | `string` | **是** | JSON encoded rule definition |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `enabled` | `bool` | Whether the rule is enabled |
| `mustContain` | `string` | The substring that the torrent name must contain |
| `mustNotContain` | `string` | The substring that the torrent name must not contain |
| `useRegex` | `bool` | Enable regex mode in "mustContain" and "mustNotContain" |
| `episodeFilter` | `string` | Episode filter definition |
| `smartFilter` | `bool` | Enable smart episode filter |
| `previouslyMatchedEpisodes` | `list` | The list of episode IDs already matched by smart filter |
| `affectedFeeds` | `list` | The feed URLs the rule applied to |
| `ignoreDays` | `number` | Ignore subsequent rule matches |
| `lastMatch` | `string` | The rule last match time |
| `addPaused` | `bool` | Add matched torrent in paused mode |
| `assignedCategory` | `string` | Assign category to the torrent |
| `savePath` | `string` | Save torrent to the given directory |

**示例 Example**

```json
{
    "enabled": false,
    "mustContain": "The *Punisher*",
    "mustNotContain": "",
    "useRegex": false,
    "episodeFilter": "1x01-;",
    "smartFilter": false,
    "previouslyMatchedEpisodes": [
    ],
    "affectedFeeds": [
        "http://showrss.info/user/134567.rss?magnets=true"
    ],
    "ignoreDays": 0,
    "lastMatch": "20 Nov 2017 09:05:11",
    "addPaused": true,
    "assignedCategory": "",
    "savePath": "C:/Users/JohnDoe/Downloads/Punisher"
}
```

### <a id="rss-renamerule"></a> 9. renameRule — 重命名自动下载规则

**`POST` `/api/v2/rss/renameRule`**

重命名 RSS 自动下载规则。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ruleName` | `string` | **是** | Rule name (e.g. "Punisher") |
| `newRuleName` | `string` | **是** | New rule name (e.g. "The Punisher") |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="rss-removerule"></a> 10. removeRule — 删除自动下载规则

**`POST` `/api/v2/rss/removeRule`**

删除 RSS 自动下载规则。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ruleName` | `string` | **是** | Rule name (e.g. "Punisher") |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="rss-rules"></a> 11. rules — 获取全部自动下载规则

**`GET` `/api/v2/rss/rules`**

以 JSON 格式返回全部自动下载规则。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```json
{
    "The Punisher": {
        "enabled": false,
        "mustContain": "The *Punisher*",
        "mustNotContain": "",
        "useRegex": false,
        "episodeFilter": "1x01-;",
        "smartFilter": false,
        "previouslyMatchedEpisodes": [
        ],
        "affectedFeeds": [
            "http://showrss.info/user/134567.rss?magnets=true"
        ],
        "ignoreDays": 0,
        "lastMatch": "20 Nov 2017 09:05:11",
        "addPaused": true,
        "assignedCategory": "",
        "savePath": "C:/Users/JohnDoe/Downloads/Punisher"
    }
}
```

### <a id="rss-matchingarticles"></a> 12. matchingArticles — 获取匹配规则的文章

**`GET` `/api/v2/rss/matchingArticles`**

按订阅源名称返回与规则匹配的全部文章。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ruleName` | `string` | **是** | Rule name (e.g. "Linux") |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**示例 Example**

```json
{
    "DistroWatch": [
        "sparkylinux-5.11-i686-minimalgui.iso.torrent",
        "sparkylinux-5.11-x86_64-minimalgui.iso.torrent",
        "sparkylinux-5.11-i686-xfce.iso.torrent",
        "bluestar-linux-5.6.3-2020.04.09-x86_64.iso.torrent",
        "robolinux64-mate3d-v10.10.iso.torrent"
    ],
    "Linuxtracker": [
        "[Alpine Linux] alpine-extended-3.11.6",
        "[Alpine Linux] alpine-standard-3.11.6",
        "[Linuxfx] linuxfx10-wxs-lts-beta5.iso",
        "[Linux Lite] linux-lite-5.0-rc1-64bit.iso (MULTI)",
        "[Scientific Linux] SL-7.8-x86_64-Pack",
        "[NixOS] nixos-plasma5-20.03.1418.5272327b81e-x86_64-linux.iso"
    ]
}
```

---

## <a id="search"></a> 08 · 搜索 Search

所有搜索接口位于 `search` 分组下，例如 `/api/v2/search/methodName`。

### <a id="search-start"></a> 1. start — 开始搜索

**`POST` `/api/v2/search/start`**

使用指定的搜索插件开始搜索。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `pattern` | `string` | **是** | Pattern to search for (e.g. "Ubuntu 18.04") |
| `plugins` | `string` | **是** | Plugins to use for searching (e.g. "legittorrents"). Supports multiple plugins separated by `\|`. Also supports `all` and `enabled` |
| `category` | `string` | 否 | Categories to limit your search to (e.g. "legittorrents"). Available categories depend on the specified `plugins`. Also supports `all` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 409 | User has reached the limit of max `Running` searches (currently set to 5) |
| 200 | All other scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `number` | ID of the search job |

**示例 Example**

```json
{
    "id": 12345
}
```

### <a id="search-stop"></a> 2. stop — 停止搜索

**`POST` `/api/v2/search/stop`**

停止指定的搜索任务。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | **是** | ID of the search job |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Search job was not found |
| 200 | All other scenarios |

### <a id="search-status"></a> 3. status — 获取搜索状态

**`GET` `/api/v2/search/status`**

获取搜索任务的状态。不指定 `id` 时返回全部搜索任务。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | 否 | ID of the search job. If not specified, all search jobs are returned |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Search job was not found |
| 200 | All other scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `number` | ID of the search job |
| `status` | `string` | Current status of the search job (either `Running` or `Stopped`) |
| `total` | `number` | Total number of results. If the status is `Running` this number may continue to increase |

**示例 Example**

```json
[
    {
        "id": 12345,
        "status": "Running",
        "total": 170
    }
]
```

### <a id="search-results"></a> 4. results — 获取搜索结果

**`GET` `/api/v2/search/results`**

获取指定搜索任务的结果，支持分页。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | **是** | ID of the search job |
| `limit` | `number` | 否 | Max number of results to return. 0 or negative means no limit |
| `offset` | `number` | 否 | Result to start at. A negative number means count backwards (e.g. `-2` returns the 2 most recent results) |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Search job was not found |
| 409 | Offset is too large, or too small (e.g. absolute value of negative number is greater than # results) |
| 200 | All other scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `results` | `array` | Array of `result` objects (see below) |
| `status` | `string` | Current status of the search job (either `Running` or `Stopped`) |
| `total` | `number` | Total number of results. If the status is `Running` this number may continue to increase |

**示例 Example**

```json
{
    "results": [
        {
            "descrLink": "http://www.legittorrents.info/index.php?page=torrent-details&id=8d5f512e1acb687029b8d7cc6c5a84dce51d7a41",
            "fileName": "Ubuntu-10.04-32bit-NeTV.ova",
            "fileSize": -1,
            "fileUrl": "http://www.legittorrents.info/download.php?id=8d5f512e1acb687029b8d7cc6c5a84dce51d7a41&f=Ubuntu-10.04-32bit-NeTV.ova.torrent",
            "nbLeechers": 1,
            "nbSeeders": 0,
            "siteUrl": "http://www.legittorrents.info"
        },
        {
            "descrLink": "http://www.legittorrents.info/index.php?page=torrent-details&id=d5179f53e105dc2c2401bcfaa0c2c4936a6aa475",
            "fileName": "mangOH-Legato-17_06-Ubuntu-16_04.ova",
            "fileSize": -1,
            "fileUrl": "http://www.legittorrents.info/download.php?id=d5179f53e105dc2c2401bcfaa0c2c4936a6aa475&f=mangOH-Legato-17_06-Ubuntu-16_04.ova.torrent",
            "nbLeechers": 0,
            "nbSeeders": 59,
            "siteUrl": "http://www.legittorrents.info"
        }
    ],
    "status": "Running",
    "total": 2
}
```

### <a id="search-delete"></a> 5. delete — 删除搜索

**`POST` `/api/v2/search/delete`**

删除指定的搜索任务。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | **是** | ID of the search job |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 404 | Search job was not found |
| 200 | All other scenarios |

### <a id="search-plugins"></a> 6. plugins — 获取搜索插件

**`GET` `/api/v2/search/plugins`**

返回已安装的搜索插件列表。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

**返回字段 Response Fields**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `enabled` | `bool` | Whether the plugin is enabled |
| `fullName` | `string` | Full name of the plugin |
| `name` | `string` | Short name of the plugin |
| `supportedCategories` | `array` | List of category objects |
| `url` | `string` | URL of the torrent site |
| `version` | `string` | Installed version of the plugin |

**示例 Example**

```json
[
    {
        "enabled": true,
        "fullName": "Legit Torrents",
        "name": "legittorrents",
        "supportedCategories": [{
            "id": "all",
            "name": "All categories"
        }, {
            "id": "anime",
            "name": "Anime"
        }, {
            "id": "books",
            "name": "Books"
        }, {
            "id": "games",
            "name": "Games"
        }, {
            "id": "movies",
            "name": "Movies"
        }, {
            "id": "music",
            "name": "Music"
        }, {
            "id": "tv",
            "name": "TV shows"
        }],
        "url": "http://www.legittorrents.info",
        "version": "2.3"
    }
]
```

### <a id="search-installplugin"></a> 7. installPlugin — 安装搜索插件

**`POST` `/api/v2/search/installPlugin`**

通过 URL 或文件路径安装搜索插件。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sources` | `string` | **是** | Url or file path of the plugin to install. Supports multiple sources separated by `\|` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="search-uninstallplugin"></a> 8. uninstallPlugin — 卸载搜索插件

**`POST` `/api/v2/search/uninstallPlugin`**

卸载一个或多个搜索插件。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `names` | `string` | **是** | Name of the plugin to uninstall. Supports multiple names separated by `\|` |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="search-enableplugin"></a> 9. enablePlugin — 启用/禁用搜索插件

**`POST` `/api/v2/search/enablePlugin`**

启用或禁用一个或多个搜索插件。

**请求参数 Parameters**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `names` | `string` | **是** | Name of the plugin to enable/disable. Supports multiple names separated by `\|` |
| `enable` | `bool` | **是** | Whether the plugins should be enabled |

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

### <a id="search-updateplugins"></a> 10. updatePlugins — 更新搜索插件

**`GET` `/api/v2/search/updatePlugins`**

检查并更新全部搜索插件。

**请求参数 Parameters**

无参数 None

**响应状态码 Status Codes**

| 状态码 | 说明 |
| --- | --- |
| 200 | All scenarios |

---

## <a id="changes"></a> 附录 A · 版本变更 Changes

### API v2.9.3

- 在 `/torrents/info` 响应中新增 `reannounce` 字段（[#19571](https://github.com/qbittorrent/qBittorrent/pull/19571)）

### API v2.11.3

- 新增管理 Cookies 的 API（[#21340](https://github.com/qbittorrent/qBittorrent/pull/21340)）
- 从 `/torrents/add` 请求中移除了 `cookie` 字段

---

## <a id="versioning"></a> 附录 B · WebAPI 版本号 WebAPI Versioning

WebAPI 使用 `1.2.3` 形式的三段式版本号，规则如下：

| 段位 | 变更时机 |
|---|---|
| **1 · 主版本** | Should be changed only on some global changes (e.g. total redesign/relayout)。仅在发生全局性变更（如整体重新设计 / 布局调整）时变更。 |
| **2 · 次版本** | Changed on incompatible API changes (i.e. if it breaks outdated clients), e.g. if you change/remove something。发生不兼容的 API 变更（会破坏旧客户端，如修改 / 删除内容）时变更。 |
| **3 · 修订号** | Changed on compatible API changes (i.e. if it doesn't break outdated clients), e.g. if you add something new outdated clients still can access old subset of API。发生兼容性变更（不影响旧客户端）时变更，例如新增内容，旧客户端仍可访问原有 API。 |
