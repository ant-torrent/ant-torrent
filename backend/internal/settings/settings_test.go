package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"ant-torrent/backend/internal/ai"
)

func TestDefaultsWhenFileAbsent(t *testing.T) {
	s := NewStore(filepath.Join(t.TempDir(), FileName))
	got := s.Log()
	if got != DefaultLogConfig() {
		t.Fatalf("缺省日志配置应为 %v, got %v", DefaultLogConfig(), got)
	}
	if s.AIConfig().Configured() {
		t.Error("缺省 AI 配置应为未启用")
	}
}

// v1 兼容：历史版本 settings.json 根对象即 AIConfig，须正确读出且日志取默认值。
func TestLegacyV1FormatMigrated(t *testing.T) {
	path := filepath.Join(t.TempDir(), FileName)
	legacy := `{"enabled":true,"provider":"openai","baseUrl":"http://llm","apiKey":"sk-x","model":"m1","mcpServers":[]}`
	if err := os.WriteFile(path, []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}
	s := NewStore(path)
	aiCfg := s.AIConfig()
	if !aiCfg.Enabled || aiCfg.Provider != "openai" || aiCfg.APIKey != "sk-x" || aiCfg.Model != "m1" {
		t.Fatalf("v1 AI 配置迁移失败: %+v", aiCfg)
	}
	if got := s.Log(); got != DefaultLogConfig() {
		t.Fatalf("v1 文件的日志配置应取默认值, got %v", got)
	}

	// 首次保存日志配置 → 自然迁移为 v2 双段结构
	if _, err := s.SaveLog(LogConfig{Level: "debug", Format: "json", AccessLog: false}); err != nil {
		t.Fatal(err)
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(mustRead(t, path), &raw); err != nil {
		t.Fatal(err)
	}
	if _, ok := raw["ai"]; !ok {
		t.Error("保存后应迁移为含 ai 段的 v2 结构")
	}
	if _, ok := raw["log"]; !ok {
		t.Error("保存后应迁移为含 log 段的 v2 结构")
	}
}

func TestAccessLogMissingMeansOn(t *testing.T) {
	path := filepath.Join(t.TempDir(), FileName)
	// log 段存在但缺 accessLog 字段（bool 零值无法区分缺省与显式关闭）
	content := `{"log":{"level":"warn","format":"json"},"ai":{}}`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := NewStore(path).Log().AccessLog; !got {
		t.Error("accessLog 缺省应视为开启")
	}
}

func TestInvalidValuesNormalized(t *testing.T) {
	path := filepath.Join(t.TempDir(), FileName)
	content := `{"log":{"level":"verbose","format":"yaml","accessLog":false},"ai":{}}`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	got := NewStore(path).Log()
	if got.Level != "info" || got.Format != "text" || got.AccessLog {
		t.Fatalf("非法取值应归一化为默认: %v", got)
	}
}

func TestSaveLogRoundTripAndNormalize(t *testing.T) {
	s := NewStore(filepath.Join(t.TempDir(), FileName))
	saved, err := s.SaveLog(LogConfig{Level: "warn", Format: "json", AccessLog: false})
	if err != nil {
		t.Fatal(err)
	}
	if saved != (LogConfig{Level: "warn", Format: "json", AccessLog: false}) {
		t.Fatalf("保存返回值不符: %v", saved)
	}
	if reloaded := NewStore(s.path).Log(); reloaded != saved {
		t.Fatalf("重载后应一致: %v vs %v", reloaded, saved)
	}
	// 非法取值被归一化而非报错/落库
	if saved, _ := s.SaveLog(LogConfig{Level: "x", Format: "y", AccessLog: true}); saved.Level != "info" || saved.Format != "text" {
		t.Fatalf("非法取值应归一化: %v", saved)
	}
}

func TestSaveAIConfigRoundTrip(t *testing.T) {
	s := NewStore(filepath.Join(t.TempDir(), FileName))
	want := ai.AIConfig{Enabled: true, Provider: "anthropic", APIKey: "k", Model: "m",
		MCPServers: []ai.MCPServerConfig{{ID: "mcp-1", Name: "n", Type: "http"}}}
	if err := s.SaveAIConfig(want); err != nil {
		t.Fatal(err)
	}
	got := s.AIConfig()
	if len(got.MCPServers) != 1 || got.MCPServers[0].ID != "mcp-1" || got.APIKey != "k" {
		t.Fatalf("AI 配置往返不一致: %+v", got)
	}
}

func mustRead(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
