package transmission

import (
	"encoding/base64"
	"net/http"
	"sort"
	"strings"

	"ant-torrent/backend/internal/apierr"
)

// listFields 为轮询用的 torrent-get 字段白名单（snake_case 原样透传给前端映射；
// 刻意不含 peers/files/trackers 等大对象，详情面板为后续迭代）。
const listFields = "id,name,hash_string,status,error,error_string,percent_done,metadata_percent_complete," +
	"recheck_progress,rate_download,rate_upload,eta,is_stalled,size_when_done,total_size,left_until_done," +
	"downloaded_ever,uploaded_ever,upload_ratio,added_date,activity_date,download_dir,labels," +
	"queue_position,magnet_link,is_private,is_finished,seconds_seeding,seconds_active,file_count," +
	"peers_sending_to_us,peers_getting_from_us,tracker_stats,sequential_download"

// detailExtraFields 为详情面板需要的扩展字段（叠加在 listFields 之上）：
// 文件/优先级/peers/trackers 等大对象仅在此查询返回。
const detailExtraFields = ",comment,creator,date_created,piece_size,piece_count," +
	"files,file_stats,wanted,priorities,peers,trackers,peers_connected"

// GetTorrentDetailByIds 按 ids（单个 hash_string）查询单条种子完整行；
// 未找到返回 nil 行（不视为错误，由调用方决定语义）。
func (m *Manager) GetTorrentDetailByIds(serverID string, conn Conn, hash string) (map[string]any, error) {
	params := map[string]any{
		"ids":    []string{hash},
		"fields": strings.Split(listFields+detailExtraFields, ","),
	}
	var out struct {
		Torrents []map[string]any `json:"torrents"`
	}
	if err := m.call(serverID, conn, "torrent_get", params, &out); err != nil {
		return nil, err
	}
	if len(out.Torrents) == 0 {
		return nil, nil
	}
	return out.Torrents[0], nil
}

// GetTorrents 返回全部种子行（snake_case 原样透传，映射归前端适配层）。
func (m *Manager) GetTorrents(serverID string, conn Conn) ([]map[string]any, error) {
	return m.GetTorrentsByIds(serverID, conn, nil)
}

// GetTorrentsByIds 按 ids（hash_string 数组）查询种子行；ids 为 nil/空 = 全部。
func (m *Manager) GetTorrentsByIds(serverID string, conn Conn, ids []string) ([]map[string]any, error) {
	params := map[string]any{
		"fields": strings.Split(listFields, ","),
	}
	if len(ids) > 0 {
		params["ids"] = ids
	}
	var out struct {
		Torrents []map[string]any `json:"torrents"`
	}
	err := m.call(serverID, conn, "torrent_get", params, &out)
	return out.Torrents, err
}

// GetSessionStats 返回会话统计（速度 B/s、活跃/暂停/总数、累计量）。
func (m *Manager) GetSessionStats(serverID string, conn Conn) (map[string]any, error) {
	var out map[string]any
	err := m.call(serverID, conn, "session_stats", nil, &out)
	return out, err
}

// GetSession 返回会话配置（fields 省略 = 全部）。
func (m *Manager) GetSession(serverID string, conn Conn) (map[string]any, error) {
	var out map[string]any
	err := m.call(serverID, conn, "session_get", nil, &out)
	return out, err
}

// FreeSpace 查询目录剩余空间（字节）。
func (m *Manager) FreeSpace(serverID string, conn Conn, path string) (int64, error) {
	var out struct {
		SizeBytes int64 `json:"size_bytes"`
	}
	err := m.call(serverID, conn, "free_space", map[string]any{"path": path}, &out)
	return out.SizeBytes, err
}

// idsArg 构造 ids 参数：外部主键统一为 hash_string。
func idsArg(ids []string) map[string]any {
	return map[string]any{"ids": ids}
}

// torrentAction 无返回值的种子动作方法名。
func (m *Manager) torrentAction(serverID string, conn Conn, method string, ids []string) error {
	return m.call(serverID, conn, method, idsArg(ids), nil)
}

// StartTorrents 启动种子（遵守队列顺序）。
func (m *Manager) StartTorrents(serverID string, conn Conn, ids []string) error {
	return m.torrentAction(serverID, conn, "torrent_start", ids)
}

// StartNowTorrents 启动并绕过队列（语义等价 qB 强制开始；一次性动作，无持久标志）。
func (m *Manager) StartNowTorrents(serverID string, conn Conn, ids []string) error {
	return m.torrentAction(serverID, conn, "torrent_start_now", ids)
}

// StopTorrents 停止种子。
func (m *Manager) StopTorrents(serverID string, conn Conn, ids []string) error {
	return m.torrentAction(serverID, conn, "torrent_stop", ids)
}

// VerifyTorrents 本地数据校验。
func (m *Manager) VerifyTorrents(serverID string, conn Conn, ids []string) error {
	return m.torrentAction(serverID, conn, "torrent_verify", ids)
}

// ReannounceTorrents 立即向 tracker 重新汇报。
func (m *Manager) ReannounceTorrents(serverID string, conn Conn, ids []string) error {
	return m.torrentAction(serverID, conn, "torrent_reannounce", ids)
}

// RemoveTorrents 删除种子；deleteLocalData 为 true 时同时删除已下载数据。
func (m *Manager) RemoveTorrents(serverID string, conn Conn, ids []string, deleteLocalData bool) error {
	return m.call(serverID, conn, "torrent_remove", map[string]any{
		"ids":               ids,
		"delete_local_data": deleteLocalData,
	}, nil)
}

// QueueMove 队列相对移动：direction ∈ top|up|down|bottom。
func (m *Manager) QueueMove(serverID string, conn Conn, ids []string, dir string) error {
	methods := map[string]string{
		"top": "queue_move_top", "up": "queue_move_up",
		"down": "queue_move_down", "bottom": "queue_move_bottom",
	}
	method, ok := methods[dir]
	if !ok {
		return apierr.New(http.StatusBadRequest, "invalidRequestBody")
	}
	return m.torrentAction(serverID, conn, method, ids)
}

// SetLabels 设置种子标签。mode：set 直接覆盖；add/remove 先按当前 labels 分组
//（同组一次 torrent-set），把 N 个种子的操作收敛为最少的 RPC。
func (m *Manager) SetLabels(serverID string, conn Conn, ids []string, labels []string, mode string) error {
	switch mode {
	case "set", "":
		return m.call(serverID, conn, "torrent_set", map[string]any{
			"ids": ids, "labels": labels,
		}, nil)
	case "add", "remove":
	default:
		return apierr.New(http.StatusBadRequest, "invalidRequestBody")
	}

	rows, err := m.GetTorrentsByIds(serverID, conn, ids)
	if err != nil {
		return err
	}
	// 按当前 labels 集合签名分组（签名相同的目标集合必然相同）
	groups := map[string][]string{}
	wanted := map[string][]string{}
	for _, row := range rows {
		id := hashOf(row)
		cur := labelsOf(row)
		set := map[string]bool{}
		for _, l := range cur {
			set[l] = true
		}
		if mode == "add" {
			for _, l := range labels {
				set[l] = true
			}
		} else {
			for _, l := range labels {
				delete(set, l)
			}
		}
		next := make([]string, 0, len(set))
		for l := range set {
			next = append(next, l)
		}
		// map 迭代顺序随机，必须排序后再生成签名——否则同集合因顺序不同被拆成多组，
		// 且下发到 Transmission 的 labels 顺序不稳定
		sort.Strings(next)
		sig := strings.Join(next, "\x00")
		groups[sig] = append(groups[sig], id)
		wanted[sig] = next
	}
	for sig, groupIds := range groups {
		if err := m.call(serverID, conn, "torrent_set", map[string]any{
			"ids": groupIds, "labels": wanted[sig],
		}, nil); err != nil {
			return err
		}
	}
	return nil
}

// SetSpeedLimits 设置种子级限速。入参为 B/s（前端统一域），Transmission 侧单位为
// KB/s——向上取整换算，避免静默放宽限制；0 表示不限速（limited=false）。
// 单方向传 nil 表示不修改该方向。
func (m *Manager) SetSpeedLimits(serverID string, conn Conn, ids []string, dlBps, upBps *int64) error {
	args := map[string]any{"ids": ids}
	if dlBps != nil {
		if *dlBps <= 0 {
			args["download_limited"] = false
		} else {
			args["download_limited"] = true
			args["download_limit"] = bpsToKBps(*dlBps)
		}
	}
	if upBps != nil {
		if *upBps <= 0 {
			args["upload_limited"] = false
		} else {
			args["upload_limited"] = true
			args["upload_limit"] = bpsToKBps(*upBps)
		}
	}
	return m.call(serverID, conn, "torrent_set", args, nil)
}

// AddOptions 为添加种子的可选项。torrent_add 本身只支持前三个字段；
// 限速/分享率/顺序下载由 AddTorrents 在添加成功后经 torrent-set 统一下发
//（对所有成功定位到 hash 的种子批量生效，含重复添加的已存在种子）。
type AddOptions struct {
	DownloadDir string
	Labels      []string
	Paused      bool
	// ---- 以下为添加后二次设置项 ----
	DlBps      *int64   // 下载限速 B/s（nil = 不设置；0 = 不限速）
	UpBps      *int64   // 上传限速 B/s（同上）
	RatioLimit *float64 // 分享率限制（qB 域：-1 = 不限，≥0 = 自定义；nil = 跟随全局）
	Sequential bool     // 顺序下载（tr 4.1+）
}

// tr seedRatioMode 取值（官方 RPC 语义）：0 跟随全局、1 使用 seed_ratio_limit、2 不限。
const (
	seedRatioModeGlobal    = 0
	seedRatioModeSingle    = 1
	seedRatioModeUnlimited = 2
)

// AddTorrents 添加种子：urls 走 filename，metainfo（.torrent 原始内容）走 base64 metainfo。
// Transmission 对重复添加返回 torrent_duplicate 且 result 仍为成功——以 duplicate=true 区分。
// 返回值 duplicate 与最后一条成功添加的 hash_string。
func (m *Manager) AddTorrents(serverID string, conn Conn, urls []string, metainfo [][]byte, opts AddOptions) (duplicate bool, hash string, err error) {
	var hashes []string
	addOne := func(args map[string]any) error {
		if opts.DownloadDir != "" {
			args["download_dir"] = opts.DownloadDir
		}
		if len(opts.Labels) > 0 {
			args["labels"] = opts.Labels
		}
		if opts.Paused {
			args["paused"] = true
		}
		var result map[string]any
		if err := m.call(serverID, conn, "torrent_add", args, &result); err != nil {
			return err
		}
		if added, ok := result["torrent_added"].(map[string]any); ok {
			if h, ok := added["hash_string"].(string); ok && h != "" {
				hashes = append(hashes, h)
				hash = h
			}
			return nil
		}
		if dup, ok := result["torrent_duplicate"].(map[string]any); ok {
			duplicate = true
			if h, ok := dup["hash_string"].(string); ok && h != "" {
				hashes = append(hashes, h)
				hash = h
			}
		}
		return nil
	}

	for _, u := range urls {
		if strings.TrimSpace(u) == "" {
			continue
		}
		if err := addOne(map[string]any{"filename": strings.TrimSpace(u)}); err != nil {
			return duplicate, hash, err
		}
	}
	for _, data := range metainfo {
		if err := addOne(map[string]any{"metainfo": base64.StdEncoding.EncodeToString(data)}); err != nil {
			return duplicate, hash, err
		}
	}

	// 添加后二次设置：限速复用 SetSpeedLimits；分享率与顺序下载合并为一次 torrent-set
	if len(hashes) > 0 {
		if opts.DlBps != nil || opts.UpBps != nil {
			if err := m.SetSpeedLimits(serverID, conn, hashes, opts.DlBps, opts.UpBps); err != nil {
				return duplicate, hash, err
			}
		}
		setArgs := map[string]any{}
		if opts.RatioLimit != nil {
			if *opts.RatioLimit < 0 {
				setArgs["seed_ratio_mode"] = seedRatioModeUnlimited
			} else {
				setArgs["seed_ratio_mode"] = seedRatioModeSingle
				setArgs["seed_ratio_limit"] = *opts.RatioLimit
			}
		}
		if opts.Sequential {
			setArgs["sequential_download"] = true
		}
		if len(setArgs) > 0 {
			setArgs["ids"] = hashes
			if err := m.call(serverID, conn, "torrent_set", setArgs, nil); err != nil {
				return duplicate, hash, err
			}
		}
	}
	return duplicate, hash, nil
}

// TestConnection 验证连通性与凭据：能完成握手并读到版本即视为成功。
func (m *Manager) TestConnection(serverID string, conn Conn) (string, error) {
	var out struct {
		Version         string `json:"version"`
		RPCVersionSemver string `json:"rpc_version_semver"`
	}
	err := m.call(serverID, conn, "session_get", map[string]any{
		"fields": []string{"version", "rpc_version_semver"},
	}, &out)
	if err != nil {
		return "", err
	}
	if out.Version != "" {
		return out.Version, nil
	}
	return out.RPCVersionSemver, nil
}

// GetDownloadDir 返回默认下载目录（替代 qB 的 app/defaultSavePath）。
func (m *Manager) GetDownloadDir(serverID string, conn Conn) (string, error) {
	var out struct {
		DownloadDir string `json:"download_dir"`
	}
	err := m.call(serverID, conn, "session_get", map[string]any{
		"fields": []string{"download_dir"},
	}, &out)
	return out.DownloadDir, err
}

// hashOf 提取种子行主键（hash_string；缺失时退回数字 id 的字符串形态兜底）。
func hashOf(row map[string]any) string {
	if v, ok := row["hash_string"].(string); ok && v != "" {
		return v
	}
	if v, ok := row["id"].(float64); ok {
		return formatID(v)
	}
	return ""
}

// labelsOf 提取种子行的 labels。
func labelsOf(row map[string]any) []string {
	raw, ok := row["labels"].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}
