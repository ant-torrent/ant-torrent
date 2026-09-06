package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// openaiProvider 适配 OpenAI 兼容协议（含各类中转）：POST {BaseURL}/chat/completions，
// Bearer 鉴权，SSE 流式；不发 stream_options（部分中转不识别该字段）。
type openaiProvider struct {
	cfg  AIConfig
	http *http.Client
}

type openaiRequest struct {
	Model    string          `json:"model"`
	Messages []openaiMessage `json:"messages"`
	Tools    []openaiTool    `json:"tools,omitempty"`
	Stream   bool            `json:"stream"`
}

type openaiMessage struct {
	Role       string           `json:"role"`
	Content    string           `json:"content,omitempty"`
	ToolCalls  []openaiToolCall `json:"tool_calls,omitempty"`
	ToolCallID string           `json:"tool_call_id,omitempty"`
}

type openaiTool struct {
	Type     string       `json:"type"` // 恒为 function
	Function openaiToolFn `json:"function"`
}

type openaiToolFn struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type openaiToolCall struct {
	// index 仅为流内累积时的键，序列化时省略
	Index    int             `json:"-"`
	ID       string          `json:"id"`
	Type     string          `json:"type"`
	Function openaiToolCallF `json:"function"`
}

type openaiToolCallF struct {
	Name string `json:"name,omitempty"`
	// arguments 为协议必填字段：无参数调用须落成 "{}"（见 toOpenAIMessages 的归一），
	// 缺字段会被严格服务端（serde 反序列化的中转）以 400 拒收，故不用 omitempty
	Arguments string `json:"arguments"`
}

// toOpenAIMessages 把统一消息转为 OpenAI 格式（system 原样、tool 结果 role=tool）。
func toOpenAIMessages(messages []ChatMessage) []openaiMessage {
	out := make([]openaiMessage, 0, len(messages))
	for _, m := range messages {
		om := openaiMessage{Role: m.Role, Content: m.Content, ToolCallID: m.ToolCallID}
		for _, tc := range m.ToolCalls {
			args := tc.Arguments
			if strings.TrimSpace(args) == "" {
				args = "{}" // 与 toAnthropicMessages 同规则：空参数归一，保证回传历史时字段必在
			}
			om.ToolCalls = append(om.ToolCalls, openaiToolCall{
				ID:   tc.ID,
				Type: "function",
				Function: openaiToolCallF{
					Name:      tc.Name,
					Arguments: args,
				},
			})
		}
		out = append(out, om)
	}
	return out
}

func (p *openaiProvider) StreamChat(ctx context.Context, messages []ChatMessage, tools []ToolDef, emit func(string) error) (string, []ToolCall, error) {
	base := strings.TrimSpace(p.cfg.BaseURL)
	if base == "" {
		base = defaultOpenAIBaseURL
	}
	reqBody := openaiRequest{
		Model:    p.cfg.Model,
		Messages: toOpenAIMessages(messages),
		Stream:   true,
	}
	for _, t := range tools {
		reqBody.Tools = append(reqBody.Tools, openaiTool{
			Type:     "function",
			Function: openaiToolFn{Name: t.Name, Description: t.Description, Parameters: t.Parameters},
		})
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return "", nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(base, "/")+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.cfg.APIKey)
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

	// SSE 解析：data: {...} 逐帧；delta.content 为文本增量；
	// delta.tool_calls 按 index 累积（id/name 首帧到达，arguments 分片拼接）。
	var text strings.Builder
	calls := map[int]*ToolCall{}
	sawDone := false

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
		if data == "[DONE]" {
			sawDone = true
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string           `json:"content"`
					ToolCalls []openaiToolCall `json:"tool_calls"`
				} `json:"delta"`
			} `json:"choices"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue // 忽略无法识别的帧（部分中转会夹带注释帧）
		}
		if chunk.Error != nil {
			return "", nil, fmt.Errorf("LLM error: %s", chunk.Error.Message)
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		delta := chunk.Choices[0].Delta
		if delta.Content != "" {
			text.WriteString(delta.Content)
			if err := emit(delta.Content); err != nil {
				return "", nil, err
			}
		}
		for _, tc := range delta.ToolCalls {
			idx := tc.Index
			// 防御不带 index 的中转帧：同槽位但 ID 不同视为新调用，追加到新槽位
			if existing, ok := calls[idx]; ok && tc.ID != "" && existing.ID != "" && tc.ID != existing.ID {
				for i := 0; ; i++ {
					if _, used := calls[i]; !used {
						idx = i
						break
					}
				}
			}
			call, ok := calls[idx]
			if !ok {
				call = &ToolCall{}
				calls[idx] = call
			}
			if tc.ID != "" {
				call.ID = tc.ID
			}
			if tc.Function.Name != "" {
				call.Name = tc.Function.Name
			}
			call.Arguments += tc.Function.Arguments
		}
	}
	if err := scanner.Err(); err != nil && !sawDone {
		return "", nil, err
	}

	// 按 index 升序输出（跳过未命名的残缺调用）
	indices := make([]int, 0, len(calls))
	for i := range calls {
		indices = append(indices, i)
	}
	sort.Ints(indices)
	ordered := make([]ToolCall, 0, len(calls))
	for _, i := range indices {
		if c := calls[i]; c.Name != "" {
			if strings.TrimSpace(c.Arguments) == "" {
				c.Arguments = "{}" // 无参数调用的分片可能整体缺席；与 anthropic 收口逻辑一致
			}
			ordered = append(ordered, *c)
		}
	}
	return text.String(), ordered, nil
}
