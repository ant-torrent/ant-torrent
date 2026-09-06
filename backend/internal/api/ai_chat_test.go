package api

import (
	"bufio"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"ant-torrent/backend/internal/agent"
	"ant-torrent/backend/internal/ai"
	"ant-torrent/backend/internal/auth"
	"ant-torrent/backend/internal/config"
	"ant-torrent/backend/internal/logbuf"
	"ant-torrent/backend/internal/logging"
	"ant-torrent/backend/internal/qbt"
	"ant-torrent/backend/internal/settings"
	"ant-torrent/backend/internal/transmission"

	"github.com/gin-gonic/gin"
)

// 测试账号：所有需要登录态的测试共用（每个测试用独立的临时数据目录）。
const (
	testUsername = "admin"
	testPassword = "test-password-123"
)

// newChatTestRouter 构造挂了假 qB 与假 LLM 的完整路由，
// 返回路由与已登录会话 cookie（/api/ai/chat 已受登录保护）。
func newChatTestRouter(t *testing.T, llmScript string) (*gin.Engine, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()

	qbSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v2/auth/login":
			w.Header().Set("Set-Cookie", "SID=qb; Path=/")
			w.Write([]byte("Ok."))
		case "/api/v2/torrents/info":
			w.Write([]byte(`[{"hash":"aaaabbbbccccdddd000011112222333344445555","name":"Ubuntu ISO","state":"stalledDL","progress":0.5,"size":1000,"added_on":1700000000}]`))
		}
	}))
	t.Cleanup(qbSrv.Close)

	store := config.NewStore(filepath.Join(dir, "servers.json"))
	for _, s := range store.List() {
		_ = store.Delete(s.ID)
	}
	store.Create(config.ServerConfig{Name: "test", URL: qbSrv.URL, Username: "a", Password: "b"})

	llmSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		buf := &bytes.Buffer{}
		buf.ReadFrom(r.Body)
		// 首轮（messages 中无 role=tool）返回工具调用，次轮返回文本
		if strings.Contains(buf.String(), `"role":"tool"`) {
			w.Write([]byte(`data: {"choices":[{"delta":{"content":"好了"}}]}` + "\n\n" + "data: [DONE]" + "\n\n"))
		} else {
			w.Write([]byte(llmScript))
		}
	}))
	t.Cleanup(llmSrv.Close)

	settingsStore := settings.NewStore(filepath.Join(dir, "settings.json"))
	if err := settingsStore.SaveAIConfig(ai.AIConfig{Enabled: true, Provider: "openai", BaseURL: llmSrv.URL, APIKey: "k", Model: "m"}); err != nil {
		t.Fatal(err)
	}

	authStore, err := auth.NewStore(filepath.Join(dir, auth.FileName))
	if err != nil {
		t.Fatal(err)
	}
	if err := authStore.Setup(testUsername, testPassword); err != nil {
		t.Fatal(err)
	}
	trMgr := transmission.NewManager()
	logMgr := logging.New(logbuf.New(logbuf.DefaultCap), settingsStore.Log())
	r := SetupRouter(store, qbt.NewClientManager(), trMgr, agent.NewManager(), ai.NewService(settingsStore, store, qbt.NewClientManager()), authStore, logMgr, settingsStore)
	return r, loginSession(t, r)
}

// parseSSE 从响应体解析 (event, data) 帧序列。
func parseSSE(t *testing.T, body string) [][2]string {
	t.Helper()
	var frames [][2]string
	scanner := bufio.NewScanner(strings.NewReader(body))
	var event, data string
	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case strings.HasPrefix(line, "event: "):
			event = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			data = strings.TrimPrefix(line, "data: ")
			frames = append(frames, [2]string{event, data})
			event, data = "", ""
		}
	}
	return frames
}

func TestChatSSEUnconfigured(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	store := config.NewStore(filepath.Join(dir, "servers.json"))
	for _, s := range store.List() {
		_ = store.Delete(s.ID)
	}
	settingsStore := settings.NewStore(filepath.Join(dir, "settings.json"))
	authStore, err := auth.NewStore(filepath.Join(dir, auth.FileName))
	if err != nil {
		t.Fatal(err)
	}
	if err := authStore.Setup(testUsername, testPassword); err != nil {
		t.Fatal(err)
	}
	trMgr := transmission.NewManager()
	logMgr := logging.New(logbuf.New(logbuf.DefaultCap), settingsStore.Log())
	r := SetupRouter(store, qbt.NewClientManager(), trMgr, agent.NewManager(), ai.NewService(settingsStore, store, qbt.NewClientManager()), authStore, logMgr, settingsStore)
	session := loginSession(t, r)

	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/ai/chat", strings.NewReader(`{"messages":[{"role":"user","content":"hi"}]}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", session)
	r.ServeHTTP(resp, req)

	if resp.Code != http.StatusBadRequest {
		t.Fatalf("未配置应 400, got %d body=%s", resp.Code, resp.Body.String())
	}
	if !strings.Contains(resp.Body.String(), "error") {
		t.Errorf("应返回 JSON 错误: %s", resp.Body.String())
	}
}

func TestChatSSEFullFlow(t *testing.T) {
	toolCall := `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"list_torrents","arguments":"{}"}}]}}]}` + "\n\n" +
		"data: [DONE]" + "\n\n"
	r, session := newChatTestRouter(t, toolCall)

	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/ai/chat",
		strings.NewReader(`{"messages":[{"role":"user","content":"列一下种子"}],"activeServerId":""}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", session)
	r.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("期望 200, got %d body=%s", resp.Code, resp.Body.String())
	}
	if ct := resp.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Errorf("Content-Type 应为 SSE: %s", ct)
	}

	frames := parseSSE(t, resp.Body.String())
	var events []string
	for _, f := range frames {
		events = append(events, f[0])
	}
	joined := strings.Join(events, ",")
	if !strings.HasPrefix(joined, "tool_start,tool_end,delta") || !strings.HasSuffix(joined, ",done") {
		t.Fatalf("事件序列不符: %s\nbody=%s", joined, resp.Body.String())
	}
	// delta 帧聚合出完整文本、done 帧带 finish
	var text string
	for _, f := range frames {
		if f[0] == "delta" {
			var d struct {
				Text string `json:"text"`
			}
			if err := json.Unmarshal([]byte(f[1]), &d); err == nil {
				text += d.Text
			}
		}
	}
	if text != "好了" {
		t.Errorf("delta 聚合不符: %q", text)
	}
}

func TestChatSSEEmptyMessages(t *testing.T) {
	r, session := newChatTestRouter(t, "data: [DONE]\n\n")
	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/ai/chat", strings.NewReader(`{"messages":[]}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", session)
	r.ServeHTTP(resp, req)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("空 messages 应 400, got %d", resp.Code)
	}
}
