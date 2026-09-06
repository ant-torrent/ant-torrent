package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// fakeLLM 为脚本化的假大模型服务器：按调用次数依次返回预设的 SSE 响应脚本，
// 并记录收到的请求供断言。
type fakeLLM struct {
	mu       sync.Mutex
	protocol string   // openai | anthropic
	rounds   []string // 每轮的完整 SSE 文本
	calls    int
	bodies   []string // 每轮收到的请求体
	auths    []string // 每轮收到的鉴权头
}

func (f *fakeLLM) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	f.calls++
	n := f.calls - 1
	f.auths = append(f.auths, r.Header.Get("Authorization")+"|"+r.Header.Get("x-api-key"))
	f.mu.Unlock()

	var body []byte
	if r.Body != nil {
		buf := make([]byte, 1<<20)
		if nr, _ := r.Body.Read(buf); nr > 0 {
			body = buf[:nr]
		}
	}
	f.mu.Lock()
	f.bodies = append(f.bodies, string(body))
	f.mu.Unlock()
	if n >= len(f.rounds) {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Write([]byte(f.rounds[n]))
}

// openaiChunk 用 json.Marshal 构造一帧 OpenAI 兼容的 delta（避免手写转义出错）。
func openaiChunk(delta map[string]any) string {
	chunk := map[string]any{"choices": []any{map[string]any{"delta": delta}}}
	b, _ := json.Marshal(chunk)
	return "data: " + string(b) + "\n\n"
}

// jsonQuote 把任意字符串安全序列化为 JSON 字符串字面量。
func jsonQuote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// openaiRoundText 构造 OpenAI 兼容的纯文本回复帧。
func openaiRoundText(text string) string {
	var b strings.Builder
	for _, r := range []rune(text) {
		b.WriteString(`data: {"choices":[{"delta":{"content":"` + string(r) + `"}}]}` + "\n\n")
	}
	b.WriteString("data: [DONE]\n\n")
	return b.String()
}

// openaiRoundToolCall 构造 OpenAI 兼容的工具调用帧（arguments 分两片到达）。
func openaiRoundToolCall(id, name, args string) string {
	half := len([]rune(args)) / 2
	argRunes := []rune(args)
	var b strings.Builder
	b.WriteString(openaiChunk(map[string]any{"tool_calls": []any{map[string]any{
		"index": 0, "id": id, "type": "function",
		"function": map[string]any{"name": name, "arguments": ""},
	}}}))
	b.WriteString(openaiChunk(map[string]any{"tool_calls": []any{map[string]any{
		"index": 0, "function": map[string]any{"arguments": string(argRunes[:half])},
	}}}))
	b.WriteString(openaiChunk(map[string]any{"tool_calls": []any{map[string]any{
		"index": 0, "function": map[string]any{"arguments": string(argRunes[half:])},
	}}}))
	b.WriteString("data: [DONE]\n\n")
	return b.String()
}

func TestOpenAIProviderTextAndAuth(t *testing.T) {
	llm := &fakeLLM{protocol: "openai", rounds: []string{openaiRoundText("你好，共 1 个种子。")}}
	srv := httptest.NewServer(llm)
	defer srv.Close()

	cfg := AIConfig{Provider: "openai", BaseURL: srv.URL, APIKey: "sk-test", Model: "gpt-test"}
	p := newProvider(cfg, srv.Client())

	var got strings.Builder
	text, calls, err := p.StreamChat(context.Background(),
		[]ChatMessage{{Role: "user", Content: "hi"}}, nil, func(s string) error { got.WriteString(s); return nil })
	if err != nil {
		t.Fatalf("StreamChat: %v", err)
	}
	if text != "你好，共 1 个种子。" || got.String() != text {
		t.Errorf("文本聚合不符: %q / emit %q", text, got.String())
	}
	if len(calls) != 0 {
		t.Errorf("不应有工具调用, got %v", calls)
	}
	if llm.auths[0] != "Bearer sk-test|" {
		t.Errorf("鉴权头不符: %q", llm.auths[0])
	}
	// 请求体应含 model 与 messages
	if !strings.Contains(llm.bodies[0], `"model":"gpt-test"`) {
		t.Errorf("请求体缺少 model: %s", llm.bodies[0])
	}
}

func TestOpenAIProviderToolCallFragments(t *testing.T) {
	llm := &fakeLLM{protocol: "openai", rounds: []string{openaiRoundToolCall("call-1", "list_torrents", `{"status_filter":"stopped"}`)}}
	srv := httptest.NewServer(llm)
	defer srv.Close()

	cfg := AIConfig{Provider: "openai", BaseURL: srv.URL, APIKey: "k", Model: "m"}
	p := newProvider(cfg, srv.Client())

	_, calls, err := p.StreamChat(context.Background(), []ChatMessage{{Role: "user", Content: "x"}}, nil, func(string) error { return nil })
	if err != nil {
		t.Fatalf("StreamChat: %v", err)
	}
	if len(calls) != 1 {
		t.Fatalf("应解析出 1 个工具调用, got %d", len(calls))
	}
	c := calls[0]
	if c.ID != "call-1" || c.Name != "list_torrents" || c.Arguments != `{"status_filter":"stopped"}` {
		t.Errorf("工具调用字段不符: %+v", c)
	}
}

// openaiRoundToolCallNoArgs 构造无参数工具调用帧：部分模型/中转对无参调用不发任何
// arguments 分片，function 对象里连 arguments 键都没有。
func openaiRoundToolCallNoArgs(id, name string) string {
	var b strings.Builder
	b.WriteString(openaiChunk(map[string]any{"tool_calls": []any{map[string]any{
		"index": 0, "id": id, "type": "function",
		"function": map[string]any{"name": name},
	}}}))
	b.WriteString("data: [DONE]\n\n")
	return b.String()
}

func TestOpenAIProviderToolCallWithoutArguments(t *testing.T) {
	// 回归：无参数调用的 Arguments 累积为空串，omitempty 会把 arguments 字段从
	// 回传历史中整个丢掉，严格服务端报 "missing field arguments"（HTTP 400）
	llm := &fakeLLM{protocol: "openai", rounds: []string{openaiRoundToolCallNoArgs("call-9", "list_servers")}}
	srv := httptest.NewServer(llm)
	defer srv.Close()

	cfg := AIConfig{Provider: "openai", BaseURL: srv.URL, APIKey: "k", Model: "m"}
	p := newProvider(cfg, srv.Client())

	_, calls, err := p.StreamChat(context.Background(), []ChatMessage{{Role: "user", Content: "x"}}, nil, func(string) error { return nil })
	if err != nil {
		t.Fatalf("StreamChat: %v", err)
	}
	if len(calls) != 1 || calls[0].Arguments != "{}" {
		t.Fatalf("空参数应归一为 {}, got %+v", calls)
	}

	// 历史回传的序列化必须携带 arguments 字段
	wire, err := json.Marshal(toOpenAIMessages([]ChatMessage{{Role: "assistant", ToolCalls: calls}}))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(wire), `"arguments":"{}"`) {
		t.Fatalf("tool_calls 序列化缺少 arguments: %s", wire)
	}
}

func TestOpenAIProviderHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":{"message":"Incorrect API key provided"}}`))
	}))
	defer srv.Close()

	cfg := AIConfig{Provider: "openai", BaseURL: srv.URL, APIKey: "bad", Model: "m"}
	p := newProvider(cfg, srv.Client())
	_, _, err := p.StreamChat(context.Background(), []ChatMessage{{Role: "user", Content: "x"}}, nil, func(string) error { return nil })
	if err == nil || !strings.Contains(err.Error(), "Incorrect API key provided") {
		t.Fatalf("应透传 provider 错误信息, got %v", err)
	}
}

// anthropicRoundText 构造 Anthropic 的纯文本回复事件序列。
func anthropicRoundText(text string) string {
	var b strings.Builder
	b.WriteString(anthropicEvent(map[string]any{"type": "message_start"}))
	b.WriteString(anthropicEvent(map[string]any{"type": "content_block_start", "content_block": map[string]any{"type": "text"}}))
	for _, r := range []rune(text) {
		b.WriteString(anthropicEvent(map[string]any{"type": "content_block_delta", "delta": map[string]any{"type": "text_delta", "text": string(r)}}))
	}
	b.WriteString(anthropicEvent(map[string]any{"type": "content_block_stop"}))
	b.WriteString(anthropicEvent(map[string]any{"type": "message_delta", "delta": map[string]any{"stop_reason": "end_turn"}}))
	b.WriteString(anthropicEvent(map[string]any{"type": "message_stop"}))
	return b.String()
}

// anthropicEvent 构造一帧 Anthropic 事件。
func anthropicEvent(payload map[string]any) string {
	b, _ := json.Marshal(payload)
	return "data: " + string(b) + "\n\n"
}

// anthropicRoundToolCall 构造 Anthropic 的工具调用事件（先文本，再 tool_use，参数分片）。
func anthropicRoundToolCall(id, name, args string) string {
	half := len([]rune(args)) / 2
	argRunes := []rune(args)
	var b strings.Builder
	b.WriteString(anthropicEvent(map[string]any{"type": "message_start"}))
	b.WriteString(anthropicEvent(map[string]any{"type": "content_block_start", "content_block": map[string]any{"type": "text"}}))
	b.WriteString(anthropicEvent(map[string]any{"type": "content_block_delta", "delta": map[string]any{"type": "text_delta", "text": "让我查一下"}}))
	b.WriteString(anthropicEvent(map[string]any{"type": "content_block_stop"}))
	b.WriteString(anthropicEvent(map[string]any{"type": "content_block_start", "content_block": map[string]any{"type": "tool_use", "id": id, "name": name}}))
	b.WriteString(anthropicEvent(map[string]any{"type": "content_block_delta", "delta": map[string]any{"type": "input_json_delta", "partial_json": string(argRunes[:half])}}))
	b.WriteString(anthropicEvent(map[string]any{"type": "content_block_delta", "delta": map[string]any{"type": "input_json_delta", "partial_json": string(argRunes[half:])}}))
	b.WriteString(anthropicEvent(map[string]any{"type": "content_block_stop"}))
	b.WriteString(anthropicEvent(map[string]any{"type": "message_delta", "delta": map[string]any{"stop_reason": "tool_use"}}))
	b.WriteString(anthropicEvent(map[string]any{"type": "message_stop"}))
	return b.String()
}

func TestAnthropicProviderTextAndAuth(t *testing.T) {
	llm := &fakeLLM{protocol: "anthropic", rounds: []string{anthropicRoundText("共 1 个种子")}}
	srv := httptest.NewServer(llm)
	defer srv.Close()

	cfg := AIConfig{Provider: "anthropic", BaseURL: srv.URL, APIKey: "sk-ant", Model: "claude-test"}
	p := newProvider(cfg, srv.Client())

	text, calls, err := p.StreamChat(context.Background(),
		[]ChatMessage{{Role: "user", Content: "hi"}}, nil, func(string) error { return nil })
	if err != nil {
		t.Fatalf("StreamChat: %v", err)
	}
	if text != "共 1 个种子" {
		t.Errorf("文本不符: %q", text)
	}
	if len(calls) != 0 {
		t.Errorf("不应有工具调用: %v", calls)
	}
	if llm.auths[0] != "|sk-ant" {
		t.Errorf("x-api-key 头不符: %q", llm.auths[0])
	}
	// system 应抽出、max_tokens 必填
	if !strings.Contains(llm.bodies[0], `"max_tokens":4096`) {
		t.Errorf("max_tokens 应为 4096: %s", llm.bodies[0])
	}
}

func TestAnthropicProviderToolUseAndSystem(t *testing.T) {
	llm := &fakeLLM{protocol: "anthropic", rounds: []string{anthropicRoundToolCall("tu-1", "list_torrents", `{"search":"ubuntu"}`)}}
	srv := httptest.NewServer(llm)
	defer srv.Close()

	cfg := AIConfig{Provider: "anthropic", BaseURL: srv.URL, APIKey: "k", Model: "m"}
	p := newProvider(cfg, srv.Client())

	msgs := []ChatMessage{
		{Role: "system", Content: "You are helpful."},
		{Role: "user", Content: "找 ubuntu"},
	}
	text, calls, err := p.StreamChat(context.Background(), msgs, nil, func(string) error { return nil })
	if err != nil {
		t.Fatalf("StreamChat: %v", err)
	}
	if text != "让我查一下" {
		t.Errorf("文本不符: %q", text)
	}
	if len(calls) != 1 || calls[0].ID != "tu-1" || calls[0].Name != "list_torrents" || calls[0].Arguments != `{"search":"ubuntu"}` {
		t.Fatalf("工具调用解析不符: %+v", calls)
	}

	// system 从 messages 抽出、消息不含 system 角色
	var sent map[string]any
	if err := json.Unmarshal([]byte(llm.bodies[0]), &sent); err != nil {
		t.Fatal(err)
	}
	if sent["system"] != "You are helpful." {
		t.Errorf("system 应抽出: %v", sent["system"])
	}
	am, _ := sent["messages"].([]any)
	if len(am) != 1 {
		t.Errorf("messages 应只剩 user 一条: %v", sent["messages"])
	}
}

// TestAnthropicToolResultMerging 验证连续 tool 消息合并进同一 user 消息。
func TestAnthropicToolResultMerging(t *testing.T) {
	system, out := toAnthropicMessages([]ChatMessage{
		{Role: "user", Content: "q"},
		{Role: "assistant", ToolCalls: []ToolCall{{ID: "a", Name: "t1", Arguments: "{}"}}},
		{Role: "tool", ToolCallID: "a", Content: `{"ok":1}`},
		{Role: "tool", ToolCallID: "b", Content: `{"ok":2}`},
	})
	if system != "" {
		t.Errorf("不应有 system: %q", system)
	}
	if len(out) != 3 {
		t.Fatalf("应为 user提问 + assistant + 1 条合并后的 user，got %d 条", len(out))
	}
	last := out[2]
	if last.Role != "user" || len(last.Content) != 2 {
		t.Fatalf("两个 tool_result 应并入同一条 user 消息: %+v", last)
	}
	for _, blk := range last.Content {
		if blk.Type != "tool_result" {
			t.Errorf("块类型应为 tool_result: %+v", blk)
		}
	}
}
