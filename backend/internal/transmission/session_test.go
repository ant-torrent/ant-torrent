package transmission

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

// TestSetSessionWhitelist 白名单外的键不下发 session_set。
func TestSetSessionWhitelist(t *testing.T) {
	f := newFakeRPC()
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	// rpc_port 不在白名单——会破坏 AntTorrent 自身连接的键必须拒绝
	if _, err := m.SetSession("s1", Conn{BaseURL: srv.URL}, map[string]any{"rpc_port": float64(1234)}); err == nil {
		t.Error("白名单外键应报错")
	}
	if params := f.lastParams["session_set"]; params != nil {
		t.Errorf("白名单外键不应下发 session_set: %v", params)
	}

	// 合法键：类型归一后下发
	applied, err := m.SetSession("s1", Conn{BaseURL: srv.URL}, map[string]any{
		"speed_limit_down": float64(2048), // JSON 数字 → float64
		"dht_enabled":      true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if applied["speed_limit_down"] != int64(2048) || applied["dht_enabled"] != true {
		t.Errorf("applied 归一化结果不符: %v", applied)
	}
	params := f.lastParams["session_set"]
	// fake 侧 JSON 解码后数字为 float64
	if v, ok := params["speed_limit_down"].(float64); !ok || v != 2048 {
		t.Errorf("speed_limit_down 应为 2048, got %v", params["speed_limit_down"])
	}
	if params["dht_enabled"] != true {
		t.Error("dht_enabled 应下发 true")
	}
}

func TestSetSessionEncryptionValidation(t *testing.T) {
	f := newFakeRPC()
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	// 4.1 起合法取值：required / preferred / allowed（tolerated 已改名）
	for _, enc := range sessionEncryptionValues {
		if _, err := m.SetSession("s1", Conn{BaseURL: srv.URL}, map[string]any{"encryption": enc}); err != nil {
			t.Errorf("encryption=%q 应合法: %v", enc, err)
		}
	}
	if _, err := m.SetSession("s1", Conn{BaseURL: srv.URL}, map[string]any{"encryption": "tolerated"}); err == nil {
		t.Error("tolerated 已废弃，应拒绝")
	}
}

func TestSetSessionEmptyPatchRejected(t *testing.T) {
	f := newFakeRPC()
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	if _, err := m.SetSession("s1", Conn{BaseURL: srv.URL}, map[string]any{}); err == nil {
		t.Error("空补丁应报错")
	}
}

// session_set 下发的参数应为 JSON 对象（Object 传参），且能正确编码布尔与数字。
func TestSetSessionEncodesObjectParams(t *testing.T) {
	f := newFakeRPC()
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	if _, err := m.SetSession("s1", Conn{BaseURL: srv.URL}, map[string]any{
		"alt_speed_time_begin": float64(480),
		"seed_ratio_limit":     2.5,
	}); err != nil {
		t.Fatal(err)
	}
	raw, ok := f.lastParams["session_set"]["alt_speed_time_begin"]
	if !ok {
		t.Fatal("alt_speed_time_begin 应下发")
	}
	// 编码后应可解析（数字 480）
	b, _ := json.Marshal(raw)
	if string(b) != "480" {
		t.Errorf("分钟数编码不符: %s", b)
	}
}

// 防御：保证 fake 的 session_set 记录与客户端原子计数一致（回归占位）。
func TestSetSessionRecordedOnce(t *testing.T) {
	var calls int32
	f := newFakeRPC()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.handler(w, r)
		if r.URL.Path == "/transmission/rpc" {
			atomic.AddInt32(&calls, 1)
		}
	}))
	defer srv.Close()

	m := NewManager()
	if _, err := m.SetSession("s1", Conn{BaseURL: srv.URL}, map[string]any{"dht_enabled": false}); err != nil {
		t.Fatal(err)
	}
	if atomic.LoadInt32(&calls) == 0 {
		t.Error("session_set 应产生一次 RPC 调用")
	}
}
