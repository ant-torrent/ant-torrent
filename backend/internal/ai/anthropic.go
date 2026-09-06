package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// anthropicProvider 适配 Anthropic Messages 协议：POST {BaseURL}/v1/messages，
// x-api-key + anthropic-version 鉴权，max_tokens 必填。
type anthropicProvider struct {
	cfg  AIConfig
	http *http.Client
}

type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system,omitempty"`
	Messages  []anthropicMessage `json:"messages"`
	Tools     []anthropicTool    `json:"tools,omitempty"`
	Stream    bool               `json:"stream"`
}

type anthropicMessage struct {
	Role    string             `json:"role"` // user|assistant
	Content []anthropicContent `json:"content"`
}

type anthropicContent struct {
	Type string `json:"type"` // text|tool_use|tool_result

	// text 块
	Text string `json:"text,omitempty"`

	// tool_use 块
	ID    string          `json:"id,omitempty"`
	Name  string          `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`

	// tool_result 块
	ToolUseID string `json:"tool_use_id,omitempty"`
}

type anthropicTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
}

// toAnthropicMessages 把统一消息转为 Anthropic 格式：
// system 抽出单独返回；连续的 tool 结果合并进同一条 user 消息（协议要求）。
func toAnthropicMessages(messages []ChatMessage) (system string, out []anthropicMessage) {
	var sysParts []string
	for _, m := range messages {
		switch m.Role {
		case "system":
			sysParts = append(sysParts, m.Content)
		case "tool":
			// 与上一条同为工具结果则并入，否则新开 user 消息
			if len(out) > 0 && out[len(out)-1].mergeToolResult(m) {
				continue
			}
			out = append(out, anthropicMessage{Role: "user", Content: []anthropicContent{{
				Type:      "tool_result",
				ToolUseID: m.ToolCallID,
				Text:      m.Content,
			}}})
		case "assistant":
			blocks := []anthropicContent{}
			if m.Content != "" {
				blocks = append(blocks, anthropicContent{Type: "text", Text: m.Content})
			}
			for _, tc := range m.ToolCalls {
				input := json.RawMessage(tc.Arguments)
				if len(input) == 0 {
					input = json.RawMessage("{}")
				}
				blocks = append(blocks, anthropicContent{Type: "tool_use", ID: tc.ID, Name: tc.Name, Input: input})
			}
			if len(blocks) == 0 {
				blocks = append(blocks, anthropicContent{Type: "text", Text: ""})
			}
			out = append(out, anthropicMessage{Role: "assistant", Content: blocks})
		default: // user
			out = append(out, anthropicMessage{Role: "user", Content: []anthropicContent{{Type: "text", Text: m.Content}}})
		}
	}
	return strings.Join(sysParts, "\n\n"), out
}

// mergeToolResult 尝试把工具结果并入当前消息（须为 user 且末块为 tool_result），成功返回 true。
func (am *anthropicMessage) mergeToolResult(m ChatMessage) bool {
	if am.Role != "user" || len(am.Content) == 0 {
		return false
	}
	last := am.Content[len(am.Content)-1]
	if last.Type != "tool_result" {
		return false
	}
	am.Content = append(am.Content, anthropicContent{Type: "tool_result", ToolUseID: m.ToolCallID, Text: m.Content})
	return true
}

func (p *anthropicProvider) StreamChat(ctx context.Context, messages []ChatMessage, tools []ToolDef, emit func(string) error) (string, []ToolCall, error) {
	base := strings.TrimSpace(p.cfg.BaseURL)
	if base == "" {
		base = defaultAnthropicBaseURL
	}
	system, msgs := toAnthropicMessages(messages)
	reqBody := anthropicRequest{
		Model:     p.cfg.Model,
		MaxTokens: 4096,
		System:    system,
		Messages:  msgs,
		Stream:    true,
	}
	for _, t := range tools {
		reqBody.Tools = append(reqBody.Tools, anthropicTool{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: t.Parameters,
		})
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return "", nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(base, "/")+"/v1/messages", bytes.NewReader(payload))
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.cfg.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("Accept", "text/event-stream")

	resp, err := p.http.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", nil, &providerHTTPError{Status: resp.StatusCode, Body: string(body)}
	}

	// SSE 解析：event: 行 + data: 行成对。
	// content_block_start 开出 text / tool_use 块；content_block_delta 追加
	// text_delta 文本或 input_json_delta 参数分片；content_block_stop 收口块。
	var text strings.Builder
	var calls []ToolCall
	var cur struct { // 当前未收口的块
		index int
		tool  *ToolCall // 非 nil 表示 tool_use 块
		args  strings.Builder
	}
	blockOpen := false

	flushBlock := func() {
		if !blockOpen {
			return
		}
		if cur.tool != nil {
			cur.tool.Arguments = cur.args.String()
			if strings.TrimSpace(cur.tool.Arguments) == "" {
				cur.tool.Arguments = "{}"
			}
			calls = append(calls, *cur.tool)
		}
		blockOpen = false
		cur.tool = nil
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		var ev struct {
			Type         string `json:"type"`
			ContentBlock *struct {
				Type  string          `json:"type"`
				ID    string          `json:"id"`
				Name  string          `json:"name"`
				Input json.RawMessage `json:"input"`
			} `json:"content_block"`
			Delta *struct {
				Type        string `json:"type"`
				Text        string `json:"text"`
				PartialJSON string `json:"partial_json"`
			} `json:"delta"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &ev); err != nil {
			continue // 无法识别的帧（ping 等）直接跳过
		}
		switch ev.Type {
		case "content_block_start":
			flushBlock()
			blockOpen = true
			if ev.ContentBlock != nil && ev.ContentBlock.Type == "tool_use" {
				cur.tool = &ToolCall{ID: ev.ContentBlock.ID, Name: ev.ContentBlock.Name}
			}
		case "content_block_delta":
			if ev.Delta == nil {
				continue
			}
			switch ev.Delta.Type {
			case "text_delta":
				text.WriteString(ev.Delta.Text)
				if err := emit(ev.Delta.Text); err != nil {
					return "", nil, err
				}
			case "input_json_delta":
				cur.args.WriteString(ev.Delta.PartialJSON)
			}
		case "content_block_stop":
			flushBlock()
		case "message_stop":
			flushBlock()
			return text.String(), calls, nil
		case "error":
			msg := "unknown error"
			if ev.Error != nil && ev.Error.Message != "" {
				msg = ev.Error.Message
			}
			return "", nil, fmt.Errorf("LLM error: %s", msg)
		}
	}
	if err := scanner.Err(); err != nil {
		return "", nil, err
	}
	flushBlock() // 流意外截断时也尽量收口
	return text.String(), calls, nil
}
