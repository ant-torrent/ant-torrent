package transmission

import "strconv"

// formatID 把 torrent-get 返回的数字 id（JSON number → float64）转为无小数的字符串。
func formatID(v float64) string {
	return strconv.FormatInt(int64(v), 10)
}

// bpsToKBps 把 B/s 向上取整为 KB/s（1024 进制）——避免向下取整静默放宽限速。
func bpsToKBps(bps int64) int64 {
	return (bps + 1023) / 1024
}
