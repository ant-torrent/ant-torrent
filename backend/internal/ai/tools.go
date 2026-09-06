package ai

import (
	"context"
	"encoding/json"
	"fmt"

	"ant-torrent/backend/internal/config"
	"ant-torrent/backend/internal/qbt"
)

// ToolContext 为单次工具执行的上下文。
type ToolContext struct {
	Ctx            context.Context
	ActiveServerID string             // 前端当前激活的服务器 ID，作为 server_id 缺省值
	Store          *config.Store      // 服务器配置
	Qbt            *qbt.ClientManager // qB 会话与请求
}

// Tool 为内置工具：Def 声明给大模型的 schema，Exec 执行并返回结果 JSON 文本。
type Tool interface {
	Def() ToolDef
	Exec(tctx ToolContext, args map[string]any) (result string, ok bool)
}

// Registry 统一登记内置工具（M5 起并入 MCP 工具），按名查找、保持注册顺序。
type Registry struct {
	tools  []Tool
	byName map[string]Tool
}

// NewRegistry 构造登记表并注册全部内置 qB 工具。
func NewRegistry() *Registry {
	r := &Registry{byName: map[string]Tool{}}
	for _, t := range []Tool{
		listServersTool{},
		listTorrentsTool{},
		torrentDetailTool{},
		addTorrentTool{},
		pauseTorrentsTool{},
		resumeTorrentsTool{},
		listCategoriesTool{},
		listTagsTool{},
	} {
		r.Register(t)
	}
	return r
}

// Register 登记工具（同名先到先得）。
func (r *Registry) Register(t Tool) {
	name := t.Def().Name
	if _, exists := r.byName[name]; exists {
		return
	}
	r.tools = append(r.tools, t)
	r.byName[name] = t
}

// Defs 返回全部工具声明。
func (r *Registry) Defs() []ToolDef {
	defs := make([]ToolDef, 0, len(r.tools))
	for _, t := range r.tools {
		defs = append(defs, t.Def())
	}
	return defs
}

// Exec 按名执行工具：参数 JSON 解析失败或工具不存在时返回错误结果（不中断对话）。
func (r *Registry) Exec(tctx ToolContext, name, argsJSON string) (result string, ok bool) {
	tool, exists := r.byName[name]
	if !exists {
		return toolError(fmt.Sprintf("unknown tool: %s", name)), false
	}
	var args map[string]any
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return toolError(fmt.Sprintf("invalid arguments for %s: %v", name, err)), false
	}
	return tool.Exec(tctx, args)
}

// toolError 构造工具结果中的错误 JSON。
func toolError(msg string) string {
	b, _ := json.Marshal(map[string]string{"error": msg})
	return string(b)
}

// toolResult 构造成功结果的 JSON 文本。
func toolResult(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return toolError("marshal result failed")
	}
	return string(b)
}
