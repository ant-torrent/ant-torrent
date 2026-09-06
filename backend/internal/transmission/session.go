package transmission

import (
	"net/http"

	"ant-torrent/backend/internal/apierr"
)

// 会话配置可写键白名单（session_set）：键 → 期望类型。
// 白名单外的键一律拒绝——session_set 可改动 RPC 自身配置（端口/认证等），
// 任意透传会导致 AntTorrent 自身连接失效甚至变成开放代理。
// 单位约定：限速类 KB/s；idle_seeding_limit 分钟；alt_speed_time_* 分钟。
const sessionKeyInt = "int"
const sessionKeyBool = "bool"
const sessionKeyString = "string"
const sessionKeyDouble = "double"

var sessionWritableKeys = map[string]string{
	// 速度限制（KB/s）
	"speed_limit_up":           sessionKeyInt,
	"speed_limit_up_enabled":   sessionKeyBool,
	"speed_limit_down":         sessionKeyInt,
	"speed_limit_down_enabled": sessionKeyBool,
	// 备用限速（乌龟模式）与计划表
	"alt_speed_up":           sessionKeyInt,
	"alt_speed_down":         sessionKeyInt,
	"alt_speed_enabled":      sessionKeyBool,
	"alt_speed_time_enabled": sessionKeyBool,
	"alt_speed_time_begin":   sessionKeyInt,
	"alt_speed_time_end":     sessionKeyInt,
	"alt_speed_time_day":     sessionKeyInt,
	// 目录
	"download_dir":                    sessionKeyString,
	"incomplete_dir":                  sessionKeyString,
	"incomplete_dir_enabled":          sessionKeyBool,
	"rename_partial_files":            sessionKeyBool,
	"start_added_torrents":            sessionKeyBool,
	"trash_original_torrent_files":    sessionKeyBool,
	"default_trackers":                sessionKeyString,
	"sequential_download":             sessionKeyBool,
	// 队列
	"download_queue_enabled": sessionKeyBool,
	"download_queue_size":    sessionKeyInt,
	"seed_queue_enabled":     sessionKeyBool,
	"seed_queue_size":        sessionKeyInt,
	"queue_stalled_enabled":  sessionKeyBool,
	"queue_stalled_minutes":  sessionKeyInt,
	// 做种/分享限制
	"seed_ratio_limit":            sessionKeyDouble,
	"seed_ratio_limited":          sessionKeyBool,
	"idle_seeding_limit":          sessionKeyInt,
	"idle_seeding_limit_enabled":  sessionKeyBool,
	// 网络与加密
	"peer_port":                 sessionKeyInt,
	"peer_port_random_on_start": sessionKeyBool,
	"port_forwarding_enabled":   sessionKeyBool,
	"peer_limit_global":         sessionKeyInt,
	"peer_limit_per_torrent":    sessionKeyInt,
	"reqq":                      sessionKeyInt,
	"encryption":                sessionKeyString,
	// P2P 发现
	"dht_enabled": sessionKeyBool,
	"pex_enabled": sessionKeyBool,
	"lpd_enabled": sessionKeyBool,
	// 黑名单
	"blocklist_enabled": sessionKeyBool,
	"blocklist_url":     sessionKeyString,
	// 缓存
	"cache_size_mib": sessionKeyInt,
	// RPC 防爆破开关（无封禁列表可读写）
	"anti_brute_force_enabled": sessionKeyBool,
}

// sessionEncryptionValues 为 encryption 的合法取值（4.1 起 tolerated 改名 allowed）。
var sessionEncryptionValues = []string{"required", "preferred", "allowed"}

// ValidSessionKey 报告键是否在会话白名单内。
func ValidSessionKey(key string) bool {
	_, ok := sessionWritableKeys[key]
	return ok
}

// validateSessionValue 校验单个键值对的类型（加密枚举额外校验取值）。
// 返回归一化后的值。
func validateSessionValue(key string, v any) (any, error) {
	invalid := func() (any, error) {
		return nil, apierr.New(http.StatusBadRequest, "invalidRequestBody")
	}
	switch sessionWritableKeys[key] {
	case sessionKeyInt:
		f, ok := v.(float64)
		if !ok || f != float64(int64(f)) {
			return invalid()
		}
		return int64(f), nil
	case sessionKeyDouble:
		f, ok := v.(float64)
		if !ok {
			return invalid()
		}
		return f, nil
	case sessionKeyBool:
		b, ok := v.(bool)
		if !ok {
			return invalid()
		}
		return b, nil
	case sessionKeyString:
		str, ok := v.(string)
		if !ok || len(str) > 4096 {
			return invalid()
		}
		if key == "encryption" {
			valid := false
			for _, e := range sessionEncryptionValues {
				if str == e {
					valid = true
				}
			}
			if !valid {
				return invalid()
			}
		}
		return str, nil
	default:
		return invalid()
	}
}

// SetSession 应用会话配置补丁（session_set）：白名单过滤 + 类型校验后下发，
// Transmission 侧即时生效、无需重启。
func (m *Manager) SetSession(serverID string, conn Conn, patch map[string]any) (map[string]any, error) {
	args := make(map[string]any, len(patch))
	for k, v := range patch {
		if !ValidSessionKey(k) {
			continue // 未知键静默忽略，不阻断整批
		}
		nv, err := validateSessionValue(k, v)
		if err != nil {
			return nil, err
		}
		args[k] = nv
	}
	if len(args) == 0 {
		return nil, apierr.New(http.StatusBadRequest, "invalidRequestBody")
	}
	if err := m.call(serverID, conn, "session_set", args, nil); err != nil {
		return nil, err
	}
	return args, nil
}
