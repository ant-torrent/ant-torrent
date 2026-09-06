package ai

import (
	"context"
	"errors"
	"net/http"

	"ant-torrent/backend/internal/ai/mcp"
	"ant-torrent/backend/internal/config"
	"ant-torrent/backend/internal/qbt"
)

// ErrNotConfigured 表示 AI 助手未完成启用配置（端点据此返回 400）。
var ErrNotConfigured = errors.New("ai assistant not configured")

// maxToolRounds 为单次聊天的最大"LLM→工具"循环轮数，超出后收口输出。
const maxToolRounds = 8

// Service 为 AI 助手的后端服务：配置管理 + 聊天（M2）+ MCP 客户端（M5）。
type Service struct {
	settings ConfigStore
	store    *config.Store
	qbtMgr   *qbt.ClientManager
	llm      *http.Client // LLM 专用客户端：无整体超时，靠 ctx 取消
	mcp      *mcp.Manager // 外部 MCP 服务器生命周期
}

// NewService 构造 AI 服务。settings 为配置持久化后端（internal/settings.Store）。
func NewService(settings ConfigStore, store *config.Store, qbtMgr *qbt.ClientManager) *Service {
	return &Service{
		settings: settings,
		store:    store,
		qbtMgr:   qbtMgr,
		llm:      newLLMHTTPClient(),
		mcp:      mcp.NewManager(),
	}
}

// Settings 返回设置存储。
func (s *Service) Settings() ConfigStore { return s.settings }

// MCP 返回 MCP 服务器管理器。
func (s *Service) MCP() *mcp.Manager { return s.mcp }

// ChatRequest 为一次聊天请求：纯文本历史 + 当前激活服务器。
type ChatRequest struct {
	Messages       []ChatMessage `json:"messages"`
	ActiveServerID string        `json:"activeServerId"`
}

// ChatEvent 为推送给前端的 SSE 事件（Type 为事件名，序列化时排除）。
type ChatEvent struct {
	Type    string `json:"-"`
	Text    string `json:"text,omitempty"`    // delta：增量文本
	ID      string `json:"id,omitempty"`      // tool_start / tool_end
	Name    string `json:"name,omitempty"`    // tool_start / tool_end
	Args    string `json:"args,omitempty"`    // tool_start：原始参数 JSON
	OK      bool   `json:"ok,omitempty"`      // tool_end：执行是否成功
	Summary string `json:"summary,omitempty"` // tool_end：结果摘要（≤200 字）
	Finish  string `json:"finish,omitempty"`  // done：stop | max_iterations
}

// ChatStream 执行 agent 循环：LLM →（工具 → LLM）×≤maxToolRounds → 收口。
// emit 推送 delta/tool_start/tool_end/done 事件；返回错误时由端点转 error 事件。
// ctx 取消（前端断开）时中断 LLM 流与工具执行。
func (s *Service) ChatStream(ctx context.Context, req ChatRequest, emit func(ChatEvent) error) error {
	cfg := s.settings.AIConfig()
	if !cfg.Configured() {
		return ErrNotConfigured
	}

	provider := newProvider(cfg, s.llm)
	registry := NewRegistry()
	tctx := ToolContext{Ctx: ctx, ActiveServerID: req.ActiveServerID, Store: s.store, Qbt: s.qbtMgr}

	// M5：懒启动启用的 MCP 服务器并把外部工具并入注册表（启动失败仅剔除该服务器，
	// 聊天继续走内置工具；同名冲突先到先得，内置优先）
	for _, info := range s.mcp.EnsureStarted(ctx, ToMcpConfigs(cfg)) {
		registry.Register(mcpTool{
			mgr:      s.mcp,
			serverID: info.ServerID,
			toolName: info.ToolName,
			def: ToolDef{
				Name:        info.FullName,
				Description: info.Description,
				Parameters:  info.InputSchema,
			},
		})
	}
	tools := registry.Defs()

	msgs := make([]ChatMessage, 0, len(req.Messages)+1)
	msgs = append(msgs, ChatMessage{Role: "system", Content: BuildSystemPrompt(s.store, req.ActiveServerID)})
	msgs = append(msgs, req.Messages...)

	for round := 0; round < maxToolRounds; round++ {
		text, calls, err := provider.StreamChat(ctx, msgs, tools, func(t string) error {
			return emit(ChatEvent{Type: "delta", Text: t})
		})
		if err != nil {
			return err
		}
		msgs = append(msgs, ChatMessage{Role: "assistant", Content: text, ToolCalls: calls})
		if len(calls) == 0 {
			return emit(ChatEvent{Type: "done", Finish: "stop"})
		}

		for _, call := range calls {
			if err := ctx.Err(); err != nil {
				return err
			}
			if err := emit(ChatEvent{Type: "tool_start", ID: call.ID, Name: call.Name, Args: call.Arguments}); err != nil {
				return err
			}
			result, ok := registry.Exec(tctx, call.Name, call.Arguments)
			if err := emit(ChatEvent{Type: "tool_end", ID: call.ID, Name: call.Name, OK: ok, Summary: truncStr(result, 200)}); err != nil {
				return err
			}
			msgs = append(msgs, ChatMessage{Role: "tool", ToolCallID: call.ID, Name: call.Name, Content: result})
		}
	}
	return emit(ChatEvent{Type: "done", Finish: "max_iterations"})
}
