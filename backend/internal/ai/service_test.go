package ai

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"ant-torrent/backend/internal/config"
	"ant-torrent/backend/internal/qbt"
)

// fakeQB 模拟 qBittorrent 的最小面：登录 + torrents/info 返回 1 个种子。
func fakeQB() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v2/auth/login", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Set-Cookie", "SID=qb-test; Path=/")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Ok."))
	})
	mux.HandleFunc("/api/v2/torrents/info", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[{"hash":"aaaabbbbccccdddd000011112222333344445555","name":"Ubuntu 24.04 ISO","state":"stalledDL","progress":0.42,"size":5242880000,"dlspeed":1048576,"upspeed":0,"eta":3600,"ratio":0.1,"category":"iso","tags":"linux","num_seeds":3,"num_leechs":1,"added_on":1700000000,"save_path":"/downloads"}]`))
	})
	return mux
}

// memConfigStore 为 ConfigStore 的内存实现（测试用，不落盘）。
type memConfigStore struct{ cfg AIConfig }

func (s *memConfigStore) AIConfig() AIConfig              { return s.cfg }
func (s *memConfigStore) SaveAIConfig(cfg AIConfig) error { s.cfg = cfg; return nil }

// newTestService 构造指向假 qB 与假 LLM 的服务。
func newTestService(t *testing.T, provider, llmURL string) (*Service, string) {
	t.Helper()
	dir := t.TempDir()
	qbSrv := httptest.NewServer(fakeQB())
	t.Cleanup(qbSrv.Close)

	store := config.NewStore(filepath.Join(dir, "servers.json"))
	for _, s := range store.List() { // 清掉默认服务器（它们指向真实地址）
		_ = store.Delete(s.ID)
	}
	id := store.Create(config.ServerConfig{Name: "本地测试", URL: qbSrv.URL, Username: "admin", Password: "pass"})

	settings := &memConfigStore{}
	if err := settings.SaveAIConfig(AIConfig{
		Enabled: true, Provider: provider, BaseURL: llmURL,
		APIKey: "test-key", Model: "test-model",
	}); err != nil {
		t.Fatal(err)
	}
	return NewService(settings, store, qbt.NewClientManager()), id
}

func collectEvents(t *testing.T, svc *Service, serverID string) ([]ChatEvent, error) {
	t.Helper()
	var events []ChatEvent
	err := svc.ChatStream(context.Background(), ChatRequest{
		Messages:       []ChatMessage{{Role: "user", Content: "我有多少个种子"}},
		ActiveServerID: serverID,
	}, func(ev ChatEvent) error {
		events = append(events, ev)
		return nil
	})
	return events, err
}

func TestChatStreamOpenAIToolLoop(t *testing.T) {
	llm := &fakeLLM{rounds: []string{
		openaiRoundToolCall("call-1", "list_torrents", `{}`),
		openaiRoundText("共有 1 个种子。"),
	}}
	llmSrv := httptest.NewServer(llm)
	defer llmSrv.Close()

	svc, serverID := newTestService(t, "openai", llmSrv.URL)
	events, err := collectEvents(t, svc, serverID)
	if err != nil {
		t.Fatalf("ChatStream: %v", err)
	}

	// 事件序列：tool_start → tool_end → delta… → done(stop)
	var kinds []string
	var text strings.Builder
	for _, ev := range events {
		kinds = append(kinds, ev.Type)
		if ev.Type == "delta" {
			text.WriteString(ev.Text)
		}
	}
	joined := strings.Join(kinds, ",")
	if !strings.HasPrefix(joined, "tool_start,tool_end") {
		t.Errorf("事件应以工具调用开头, got %s", joined)
	}
	if !strings.HasSuffix(joined, ",done") {
		t.Errorf("事件应以 done 结尾, got %s", joined)
	}
	if text.String() != "共有 1 个种子。" {
		t.Errorf("最终文本不符: %q", text.String())
	}

	// tool_end 事件应含成功摘要
	found := false
	for _, ev := range events {
		if ev.Type == "tool_end" {
			found = true
			if ev.Name != "list_torrents" || !ev.OK {
				t.Errorf("tool_end 字段不符: %+v", ev)
			}
			if !strings.Contains(ev.Summary, `"total":1`) {
				t.Errorf("摘要应含 total:1, got %s", ev.Summary)
			}
		}
	}
	if !found {
		t.Error("缺少 tool_end 事件")
	}

	// 第二轮请求应带 tool 结果消息
	if len(llm.bodies) != 2 {
		t.Fatalf("应发生两轮 LLM 调用, got %d", len(llm.bodies))
	}
	if !strings.Contains(llm.bodies[1], `"role":"tool"`) || !strings.Contains(llm.bodies[1], "Ubuntu 24.04 ISO") {
		t.Errorf("第二轮请求应包含工具结果: %.300s", llm.bodies[1])
	}
}

func TestChatStreamAnthropicToolLoop(t *testing.T) {
	llm := &fakeLLM{rounds: []string{
		anthropicRoundToolCall("tu-1", "list_torrents", `{}`),
		anthropicRoundText("共 1 个。"),
	}}
	llmSrv := httptest.NewServer(llm)
	defer llmSrv.Close()

	svc, serverID := newTestService(t, "anthropic", llmSrv.URL)
	events, err := collectEvents(t, svc, serverID)
	if err != nil {
		t.Fatalf("ChatStream: %v", err)
	}
	var kinds []string
	for _, ev := range events {
		kinds = append(kinds, ev.Type)
	}
	joined := strings.Join(kinds, ",")
	// Anthropic 常见"先说一句再调工具"：允许 delta 前置
	if !strings.Contains(joined, "tool_start,tool_end") || !strings.HasSuffix(joined, ",done") {
		t.Errorf("事件序列不符: %s", joined)
	}
	// Anthropic 第二轮请求：tool_result 以 user 角色块出现
	if !strings.Contains(llm.bodies[1], "tool_result") {
		t.Errorf("第二轮请求应包含 tool_result: %.300s", llm.bodies[1])
	}
}

func TestChatStreamMaxIterations(t *testing.T) {
	// LLM 每轮都要求调用工具：应跑满 maxToolRounds 后以 max_iterations 收口
	loop := openaiRoundToolCall("c", "list_servers", `{}`)
	llm := &fakeLLM{rounds: make([]string, maxToolRounds)}
	for i := range llm.rounds {
		llm.rounds[i] = loop
	}
	llmSrv := httptest.NewServer(llm)
	defer llmSrv.Close()

	svc, serverID := newTestService(t, "openai", llmSrv.URL)
	events, err := collectEvents(t, svc, serverID)
	if err != nil {
		t.Fatalf("ChatStream: %v", err)
	}
	last := events[len(events)-1]
	if last.Type != "done" || last.Finish != "max_iterations" {
		t.Errorf("应以 done(max_iterations) 收口, got %+v", last)
	}
	if len(llm.bodies) != maxToolRounds {
		t.Errorf("应恰好 %d 轮, got %d", maxToolRounds, len(llm.bodies))
	}
}

func TestChatStreamNotConfigured(t *testing.T) {
	dir := t.TempDir()
	settings := &memConfigStore{}
	svc := NewService(settings, config.NewStore(filepath.Join(dir, "servers.json")), qbt.NewClientManager())
	err := svc.ChatStream(context.Background(), ChatRequest{Messages: []ChatMessage{{Role: "user", Content: "hi"}}}, func(ChatEvent) error { return nil })
	if err != ErrNotConfigured {
		t.Fatalf("应返回 ErrNotConfigured, got %v", err)
	}
}

func TestChatStreamContextCancel(t *testing.T) {
	// LLM 挂起不响应，取消 ctx 应立刻中断
	block := make(chan struct{})
	llmSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-block
	}))
	defer llmSrv.Close()
	defer close(block)

	svc, serverID := newTestService(t, "openai", llmSrv.URL)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- svc.ChatStream(ctx, ChatRequest{
			Messages:       []ChatMessage{{Role: "user", Content: "hi"}},
			ActiveServerID: serverID,
		}, func(ChatEvent) error { return nil })
	}()
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("取消后应返回错误")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("取消未及时中断 ChatStream")
	}
}
