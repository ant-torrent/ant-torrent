package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// ChatMessage 为统一对话消息（跨 OpenAI / Anthropic 协议）。
// Role 取 system|user|assistant|tool：assistant 可携带 ToolCalls；
// tool 为工具执行结果，ToolCallID 对应某次调用。
type ChatMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	Name       string     `json:"name,omitempty"`
}

// ToolDef 为暴露给大模型的工具声明，Parameters 为 JSON Schema（type:object）。
type ToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

// ToolCall 为大模型发起的一次工具调用，Arguments 为原始 JSON 字符串。
type ToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// Provider 抽象大模型聊天协议。StreamChat 流式调用：
// emit 推送增量文本（供前端逐字渲染），返回完整文本与工具调用列表。
// ctx 取消时应立即中断请求并返回错误。
type Provider interface {
	StreamChat(ctx context.Context, messages []ChatMessage, tools []ToolDef, emit func(text string) error) (text string, toolCalls []ToolCall, err error)
}

// 两协议的默认 BaseURL。OpenAI 兼容中转的 BaseURL 需带到 /v1 层级。
const (
	defaultOpenAIBaseURL    = "https://api.openai.com/v1"
	defaultAnthropicBaseURL = "https://api.anthropic.com"
)

// newProvider 按配置构造协议适配器。
func newProvider(cfg AIConfig, httpClient *http.Client) Provider {
	switch cfg.Provider {
	case "anthropic":
		return &anthropicProvider{cfg: cfg, http: httpClient}
	default:
		return &openaiProvider{cfg: cfg, http: httpClient}
	}
}

// newLLMHTTPClient 构造 LLM 专用 HTTP 客户端：不设整体超时（流式输出可能很长），
// 由请求级 ctx 控制取消；连接建立阶段给 30s 兜底。
func newLLMHTTPClient() *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			MaxIdleConns:          4,
			IdleConnTimeout:       90 * time.Second,
			ResponseHeaderTimeout: 30 * time.Second,
		},
	}
}

// providerHTTPError 统一提取两家协议错误响应中的 message 字段。
type providerHTTPError struct {
	Status int
	Body   string
}

func (e *providerHTTPError) Error() string {
	return fmt.Sprintf("LLM HTTP %d: %s", e.Status, e.providerMessage())
}

// providerMessage 从 JSON 错误响应中取 error.message（两家协议同构字段），失败时截断原文。
func (e *providerHTTPError) providerMessage() string {
	var parsed struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal([]byte(e.Body), &parsed); err == nil {
		if parsed.Error.Message != "" {
			return parsed.Error.Message
		}
		if parsed.Message != "" {
			return parsed.Message
		}
	}
	body := e.Body
	if len(body) > 300 {
		body = body[:300] + "..."
	}
	return body
}
