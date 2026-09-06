package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestEnsureTypesMigratesLegacyServers(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "servers.json")
	// 存量数据：无 type 字段（v1 格式）
	if err := os.WriteFile(path, []byte(`[{"id":"srv-1","name":"nas","url":"http://x:8080","username":"a","password":"b"}]`), 0o644); err != nil {
		t.Fatal(err)
	}
	s := NewStore(path)
	got := s.Get("srv-1")
	if got == nil {
		t.Fatal("存量服务器应被加载")
	}
	if got.Downloader() != TypeQbittorrent {
		t.Errorf("无 type 的存量服务器应回填 qbittorrent, got %q", got.Type)
	}
	// 迁移应已落盘（幂等回填即保存）
	var raw []map[string]any
	if err := json.Unmarshal(mustRead(t, path), &raw); err != nil {
		t.Fatal(err)
	}
	if raw[0]["type"] != TypeQbittorrent {
		t.Errorf("迁移未落盘: %v", raw[0])
	}
}

func TestDownloaderNormalizesUnknown(t *testing.T) {
	c := ServerConfig{Type: "whatever"}
	if c.Downloader() != TypeQbittorrent {
		t.Errorf("非法类型应兜底 qbittorrent, got %q", c.Downloader())
	}
	c2 := ServerConfig{Type: TypeTransmission}
	if c2.Downloader() != TypeTransmission {
		t.Errorf("transmission 应原样返回, got %q", c2.Downloader())
	}
}

func TestCreateDefaultsTypeAndUpdateWhitelist(t *testing.T) {
	s := NewStore(filepath.Join(t.TempDir(), "servers.json"))

	id := s.Create(ServerConfig{Name: "a", URL: "http://a"})
	if got := s.Get(id); got.Type != TypeQbittorrent {
		t.Errorf("Create 未填默认类型: %q", got.Type)
	}

	// 白名单内：合法类型可更新
	if err := s.Update(id, map[string]any{"type": TypeTransmission}); err != nil {
		t.Fatal(err)
	}
	if got := s.Get(id); got.Downloader() != TypeTransmission {
		t.Errorf("type 更新未生效: %q", got.Type)
	}

	// 白名单外：非法类型被忽略（不落库、不报错）
	if err := s.Update(id, map[string]any{"type": "rtorrent"}); err != nil {
		t.Fatal(err)
	}
	if got := s.Get(id); got.Type != TypeTransmission {
		t.Errorf("非法类型应被忽略, got %q", got.Type)
	}

	// 重启后 transmission 类型保留
	if got := NewStore(s.path).Get(id); got.Type != TypeTransmission {
		t.Errorf("重启后类型应保留, got %q", got.Type)
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
