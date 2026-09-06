package ai

// 本文件保留 AI 配置类型定义与持久化接口；
// data/settings.json 的读写已移交 internal/settings（log + ai 双段结构）。

// AIConfig 为 AI 助手的全部配置，持久化在 data/settings.json。
type AIConfig struct {
	Enabled    bool              `json:"enabled"`
	Provider   string            `json:"provider"` // "openai" | "anthropic"
	BaseURL    string            `json:"baseUrl"`  // 空 = 各协议默认地址（支持中转）
	APIKey     string            `json:"apiKey"`   // 永不回传给前端
	Model      string            `json:"model"`
	MCPServers []MCPServerConfig `json:"mcpServers"`
}

// MCPServerConfig 为一台外部 MCP 服务器：stdio 本地进程或 streamable HTTP 远程服务。
type MCPServerConfig struct {
	ID      string `json:"id"` // "mcp-<纳秒时间戳>" 风格
	Name    string `json:"name"`
	Type    string `json:"type"` // "stdio" | "http"
	Enabled bool   `json:"enabled"`
	// stdio 专属
	Command string            `json:"command,omitempty"`
	Args    []string          `json:"args,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	// streamable HTTP 专属
	URL     string            `json:"url,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
}

// Clone 返回深拷贝（MCPServers 切片独立，防外部修改共享底层数组）。
func (c AIConfig) Clone() AIConfig {
	out := c
	out.MCPServers = append([]MCPServerConfig(nil), c.MCPServers...)
	return out
}

// Configured 判断 AI 助手是否已具备可用条件（不校验网络连通性、不启动任何 MCP 进程）。
func (c AIConfig) Configured() bool {
	return c.Enabled && c.APIKey != "" && c.Model != "" && (c.Provider == "openai" || c.Provider == "anthropic")
}

// ConfigStore 为 AI 配置的持久化后端接口（由 internal/settings.Store 实现——
// settings.json 现为 log + ai 双段结构，AI 持久化归属通用配置层，避免双向依赖）。
type ConfigStore interface {
	AIConfig() AIConfig
	SaveAIConfig(cfg AIConfig) error
}
