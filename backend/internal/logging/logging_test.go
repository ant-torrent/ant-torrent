package logging

import (
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"ant-torrent/backend/internal/logbuf"
	"ant-torrent/backend/internal/settings"
)

// newTestManager 构建指向独立环形缓冲的管理器（隔离全局默认 logger 的干扰）。
func newTestManager(cfg settings.LogConfig) (*Manager, *logbuf.LogBuf) {
	buf := logbuf.New(500)
	return New(buf, cfg), buf
}

func TestLevelFilteringAndLiveApply(t *testing.T) {
	m, buf := newTestManager(settings.LogConfig{Level: "info", Format: "text", AccessLog: true})

	slog.Debug("dbg-line")
	slog.Info("info-line")
	got := strings.Join(buf.Lines(), "\n")
	if strings.Contains(got, "dbg-line") {
		t.Error("info 级别下 debug 日志不应输出")
	}
	if !strings.Contains(got, "info-line") {
		t.Error("info 级别下 info 日志应输出")
	}

	// 热更新到 debug 后，debug 日志即时可见
	m.Apply(settings.LogConfig{Level: "debug", Format: "text", AccessLog: true})
	slog.Debug("dbg-after")
	if !strings.Contains(strings.Join(buf.Lines(), "\n"), "dbg-after") {
		t.Error("Apply(debug) 后 debug 日志应输出")
	}
}

func TestJSONFormat(t *testing.T) {
	m, buf := newTestManager(settings.LogConfig{Level: "info", Format: "text", AccessLog: true})
	m.Apply(settings.LogConfig{Level: "info", Format: "json", AccessLog: true})
	slog.Info("json-line")
	lines := buf.Lines()
	if len(lines) == 0 {
		t.Fatal("应输出日志行")
	}
	var rec map[string]any
	if err := json.Unmarshal([]byte(lines[len(lines)-1]), &rec); err != nil {
		t.Fatalf("json 格式的日志行应可解析: %v | %q", err, lines[len(lines)-1])
	}
}

func TestAccessLogToggle(t *testing.T) {
	m, _ := newTestManager(settings.DefaultLogConfig())
	if !m.AccessLogEnabled() {
		t.Fatal("默认应开启访问日志")
	}
	m.Apply(settings.LogConfig{Level: "info", Format: "text", AccessLog: false})
	if m.AccessLogEnabled() {
		t.Fatal("Apply 后应关闭访问日志")
	}
}
