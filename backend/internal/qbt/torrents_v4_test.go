package qbt

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// fakeQB 模拟一台 qBittorrent：记录命中的端点路径，按端点返回预设状态码。
// v4 模式下 torrents/stop|start 返回 404（端点不存在），验证回退到 torrents/pause|resume。
type fakeQB struct {
	mu       sync.Mutex
	status   map[string]int // 端点路径（含方法前缀）→ 状态码
	hit      map[string]string
	lastForm map[string]string
}

func newFakeQB(status map[string]int) *fakeQB {
	return &fakeQB{status: status, hit: map[string]string{}, lastForm: map[string]string{}}
}

func (f *fakeQB) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	key := r.Method + " " + r.URL.Path
	f.hit[key] = key
	if err := r.ParseForm(); err == nil {
		for k, v := range r.Form {
			f.lastForm[k] = strings.Join(v, ",")
		}
	}
	// 登录成功（v4 风格：200 + "Ok." + SID cookie）
	if r.URL.Path == "/api/v2/auth/login" {
		w.Header().Set("Set-Cookie", "SID=fake-sid; Path=/")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Ok."))
		return
	}
	code, ok := f.status[key]
	if !ok {
		code = http.StatusOK
	}
	w.WriteHeader(code)
}

func TestToggleTorrentsV5Direct(t *testing.T) {
	fake := newFakeQB(map[string]int{
		"POST /api/v2/torrents/stop":  http.StatusOK,
		"POST /api/v2/torrents/start": http.StatusOK,
	})
	srv := httptest.NewServer(fake)
	defer srv.Close()

	m := NewClientManager()
	conn := Conn{BaseURL: srv.URL, Username: "u", Password: "p"}

	if err := m.StopTorrents("t", conn, []string{"hash1", "hash2"}); err != nil {
		t.Fatalf("StopTorrents: %v", err)
	}
	if got := fake.lastForm["hashes"]; got != "hash1|hash2" {
		t.Errorf("hashes 应以 | 连接， got %q", got)
	}
	if err := m.StartTorrents("t", conn, []string{"hash1"}); err != nil {
		t.Fatalf("StartTorrents: %v", err)
	}
	if _, hit := fake.hit["POST /api/v2/torrents/pause"]; hit {
		t.Error("v5 服务器不应回退到 torrents/pause")
	}
}

func TestToggleTorrentsV4Fallback(t *testing.T) {
	// qB 4.x：无 torrents/stop|start（404），只有 torrents/pause|resume
	fake := newFakeQB(map[string]int{
		"POST /api/v2/torrents/stop":   http.StatusNotFound,
		"POST /api/v2/torrents/start":  http.StatusNotFound,
		"POST /api/v2/torrents/pause":  http.StatusOK,
		"POST /api/v2/torrents/resume": http.StatusOK,
	})
	srv := httptest.NewServer(fake)
	defer srv.Close()

	m := NewClientManager()
	conn := Conn{BaseURL: srv.URL, Username: "u", Password: "p"}

	if err := m.StopTorrents("t", conn, []string{"h"}); err != nil {
		t.Fatalf("StopTorrents 应回退 v4 端点成功: %v", err)
	}
	if _, hit := fake.hit["POST /api/v2/torrents/pause"]; !hit {
		t.Error("404 后应回退调用 torrents/pause")
	}

	if err := m.StartTorrents("t", conn, []string{"h"}); err != nil {
		t.Fatalf("StartTorrents 应回退 v4 端点成功: %v", err)
	}
	if _, hit := fake.hit["POST /api/v2/torrents/resume"]; !hit {
		t.Error("404 后应回退调用 torrents/resume")
	}
}

func TestToggleTorrentsServerError(t *testing.T) {
	// v5 与 v4 端点都 500：应返回错误而非静默成功
	fake := newFakeQB(map[string]int{
		"POST /api/v2/torrents/stop":  http.StatusInternalServerError,
		"POST /api/v2/torrents/pause": http.StatusInternalServerError,
	})
	srv := httptest.NewServer(fake)
	defer srv.Close()

	m := NewClientManager()
	conn := Conn{BaseURL: srv.URL, Username: "u", Password: "p"}

	err := m.StopTorrents("t", conn, []string{"h"})
	if err == nil {
		t.Fatal("两端点均失败时应返回错误")
	}
}
