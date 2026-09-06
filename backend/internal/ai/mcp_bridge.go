package ai

import (
	"ant-torrent/backend/internal/ai/mcp"
)

// mcpTool 把一台 MCP 服务器的单个工具适配为内置 Tool 接口，并入统一注册表。
type mcpTool struct {
	mgr      *mcp.Manager
	def      ToolDef
	serverID string
	toolName string // 服务器上的原始工具名
}

func (t mcpTool) Def() ToolDef { return t.def }

func (t mcpTool) Exec(tctx ToolContext, args map[string]any) (string, bool) {
	if tctx.Ctx == nil {
		return toolError("missing context"), false
	}
	return t.mgr.CallTool(tctx.Ctx, t.serverID, t.toolName, args)
}

// ToMcpConfigs 把持久化配置转换为 mcp 包的自有配置类型。
func ToMcpConfigs(cfg AIConfig) []mcp.ServerConfig {
	out := make([]mcp.ServerConfig, 0, len(cfg.MCPServers))
	for _, s := range cfg.MCPServers {
		out = append(out, ToMcpConfig(s))
	}
	return out
}

// ToMcpConfig 转换单台服务器配置。
func ToMcpConfig(s MCPServerConfig) mcp.ServerConfig {
	return mcp.ServerConfig{
		ID:      s.ID,
		Name:    s.Name,
		Type:    s.Type,
		Enabled: s.Enabled,
		Command: s.Command,
		Args:    s.Args,
		Env:     s.Env,
		URL:     s.URL,
		Headers: s.Headers,
	}
}
