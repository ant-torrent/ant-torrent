package transmission

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"ant-torrent/backend/internal/apierr"
)

// fakeRPC 模拟最小 Transmission RPC：409 握手 + JSON-RPC 2.0 包络 + Basic 认证。
type fakeRPC struct {
	mu           sync.Mutex
	sessionID    string
	handshakes   int64 // 409 次数（握手计数）
	failAuth     bool  // 为 true 时校验 Basic 并对错误凭据返回 401
	wantUser     string
	wantPass     string
	methodBodies map[string]any            // method → result 载荷
	methodErrs   map[string]*rpcError      // method → JSON-RPC error
	lastParams   map[string]map[string]any // method → 最近一次 params
	callLog      map[string][]map[string]any // method → 全部 params（按序）
}

func newFakeRPC() *fakeRPC {
	return &fakeRPC{
		sessionID:    "sid-1",
		methodBodies: map[string]any{},
		methodErrs:   map[string]*rpcError{},
		lastParams:   map[string]map[string]any{},
		callLog:      map[string][]map[string]any{},
	}
}

func (f *fakeRPC) handler(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failAuth {
		user, pass, ok := r.BasicAuth()
		if !ok || user != f.wantUser || pass != f.wantPass {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
	}
	if r.Header.Get("X-Transmission-Session-Id") != f.sessionID {
		f.handshakes++
		w.Header().Set("X-Transmission-Session-Id", f.sessionID)
		w.WriteHeader(http.StatusConflict)
		return
	}
	// 解析请求记录 params
	var req struct {
		Method string         `json:"method"`
		Params map[string]any `json:"params"`
	}
	if err := decodeBody(r, &req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	f.lastParams[req.Method] = req.Params
	f.callLog[req.Method] = append(f.callLog[req.Method], req.Params)

	if e, ok := f.methodErrs[req.Method]; ok {
		writeJSON(w, map[string]any{"jsonrpc": "2.0", "id": 1, "error": e})
		return
	}
	body, ok := f.methodBodies[req.Method]
	if !ok {
		body = map[string]any{}
	}
	writeJSON(w, map[string]any{"jsonrpc": "2.0", "id": 1, "result": body})
}

// closedServer 返回一个立即断连的服务器（模拟不可达）。
func closedServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
}

func decodeBody(r *http.Request, into any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(into)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func TestTrRPCURL(t *testing.T) {
	cases := map[string]string{
		"http://h:9091":                  "http://h:9091/transmission/rpc",
		"http://h:9091/":                 "http://h:9091/transmission/rpc",
		"http://h:9091/transmission/rpc": "http://h:9091/transmission/rpc",
		"http://h:9091/torrent/rpc":      "http://h:9091/torrent/rpc", // 反代子路径（以 /rpc 结尾）
		"https://h/x/transmission/rpc/":  "https://h/x/transmission/rpc",
	}
	for in, want := range cases {
		if got := trRPCURL(in); got != want {
			t.Errorf("trRPCURL(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestHandshakeOnceAndRetry 首次 409 握手后原样重发,握手只发生一次。
func TestHandshakeOnceAndRetry(t *testing.T) {
	f := newFakeRPC()
	f.methodBodies["session_get"] = map[string]any{"version": "4.1.0"}
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	version, err := m.TestConnection("s1", Conn{BaseURL: srv.URL})
	if err != nil {
		t.Fatal(err)
	}
	if version != "4.1.0" {
		t.Errorf("version = %q", version)
	}
	if f.handshakes != 1 {
		t.Errorf("握手应恰好 1 次, got %d", f.handshakes)
	}
	// 会话缓存后,后续请求不再握手
	if _, err := m.TestConnection("s1", Conn{BaseURL: srv.URL}); err != nil {
		t.Fatal(err)
	}
	if f.handshakes != 1 {
		t.Errorf("会话缓存后不应再握手, got %d", f.handshakes)
	}
}

// TestSessionIDRotation 409 响应头中的新 session id 须被采用并重发原请求。
func TestSessionIDRotation(t *testing.T) {
	f := newFakeRPC()
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	if _, err := m.TestConnection("s1", Conn{BaseURL: srv.URL}); err != nil {
		t.Fatal(err)
	}
	// 服务端轮换 session id,旧 id 失效 → 应自动重握手
	f.mu.Lock()
	f.sessionID = "sid-2"
	f.mu.Unlock()
	if _, err := m.TestConnection("s1", Conn{BaseURL: srv.URL}); err != nil {
		t.Fatalf("轮换 session id 后应自动重握手: %v", err)
	}
}

func TestAuthFailureMapsTo502(t *testing.T) {
	f := newFakeRPC()
	f.failAuth = true
	f.wantUser = "u"
	f.wantPass = "p"
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	_, err := m.TestConnection("s1", Conn{BaseURL: srv.URL, Username: "u", Password: "wrong"})
	if err == nil {
		t.Fatal("凭据错误应报错")
	}
	var e *apierr.APIError
	if !errors.As(err, &e) {
		t.Fatalf("应返回 *APIError, got %T", err)
	}
	if e.Status != 502 || e.Code != "trAuthFailed" {
		t.Errorf("上游 401 应翻译为 502/trAuthFailed, got %d/%s", e.Status, e.Code)
	}
}

func TestJSONRPCErrorMapsTo502(t *testing.T) {
	f := newFakeRPC()
	f.methodErrs["session_get"] = &rpcError{Code: -32600, Message: "bad request"}
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	_, err := m.TestConnection("s1", Conn{BaseURL: srv.URL})
	var e *apierr.APIError
	if !errors.As(err, &e) {
		t.Fatalf("应返回 *APIError, got %T", err)
	}
	if e.Status != 502 || e.Code != "trError" {
		t.Errorf("JSON-RPC error 应映射 502/trError, got %d/%s", e.Status, e.Code)
	}
}

func TestUnreachableMapsTo502(t *testing.T) {
	srv := closedServer()
	defer srv.Close()

	m := NewManager()
	_, err := m.TestConnection("s1", Conn{BaseURL: srv.URL})
	var e *apierr.APIError
	if !errors.As(err, &e) || e.Status != 502 {
		t.Fatalf("不可达应 502, got %v", err)
	}
}

func TestConcurrentCallsSingleHandshake(t *testing.T) {
	f := newFakeRPC()
	f.methodBodies["session_stats"] = map[string]any{"torrent_count": 1}
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := m.GetSessionStats("s1", Conn{BaseURL: srv.URL}); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if f.handshakes != 1 {
		t.Errorf("并发下握手应恰好 1 次, got %d", f.handshakes)
	}
}
