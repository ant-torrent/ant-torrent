// Package logging 统一管理后端日志：log/slog 结构化输出，级别与格式可配
// （settings.json log 段），双写 stderr 与内存环形缓冲（logbuf），供前端「日志」页查看。
// slog.SetDefault 同时桥接标准 log 包与第三方库的 std-log 输出，全部进入同一管线。
package logging

import (
	"io"
	"log/slog"
	"os"
	"sync"
	"sync/atomic"

	"ant-torrent/backend/internal/logbuf"
	"ant-torrent/backend/internal/settings"
)

// Manager 持有日志运行时状态：级别（可动态调）、访问日志开关、输出 handler。
type Manager struct {
	buf       *logbuf.LogBuf
	writer    io.Writer // 双写目标（stderr + 环形缓冲），由调用方组装
	levelVar  slog.LevelVar
	accessLog atomic.Bool
	mu        sync.Mutex // 序列化 handler 重建（SetDefault 非并发安全）
}

// New 构建日志管理器并设为全局默认 logger。
// buf 为内存环形缓冲（前端 /api/logs 读取），stderr 保证容器 logs / journal 照常收集。
func New(buf *logbuf.LogBuf, cfg settings.LogConfig) *Manager {
	m := &Manager{buf: buf, writer: io.MultiWriter(os.Stderr, buf)}
	m.Apply(cfg)
	return m
}

// Apply 应用日志配置（级别/格式/访问日志开关），运行中调用即时生效、无需重启。
func (m *Manager) Apply(cfg settings.LogConfig) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.levelVar.Set(levelOf(cfg.Level))
	m.accessLog.Store(cfg.AccessLog)
	var h slog.Handler = slog.NewTextHandler(m.writer, &slog.HandlerOptions{Level: &m.levelVar})
	if cfg.Format == "json" {
		h = slog.NewJSONHandler(m.writer, &slog.HandlerOptions{Level: &m.levelVar})
	}
	slog.SetDefault(slog.New(h))
}

// AccessLogEnabled 报告访问日志是否开启（访问日志中间件每次请求查询）。
func (m *Manager) AccessLogEnabled() bool {
	return m.accessLog.Load()
}

// Lines 返回环形缓冲最近日志（透传给 /api/logs）。
func (m *Manager) Lines() []string {
	return m.buf.Lines()
}

// levelOf 把级别字符串解析为 slog 级别，非法值回退 Info。
func levelOf(s string) slog.Level {
	switch s {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
