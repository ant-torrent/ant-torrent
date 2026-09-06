package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"ant-torrent/backend/internal/ai"

	"github.com/gin-gonic/gin"
)

// savedValueSentinel 为前端回传的"沿用已存值"哨兵：GET 时替换敏感值（MCP headers/env），
// PUT 时收到该值则保留存储中的原值。
const savedValueSentinel = "__SAVED__"

// nextMcpID 生成 MCP 服务器 ID（与 config.generateID 同风格，冲突时递增）。
func nextMcpID(existing map[string]bool) string {
	base := time.Now().UnixNano() % 1000000
	for i := 0; ; i++ {
		id := fmt.Sprintf("mcp-%d", base+int64(i))
		if !existing[id] {
			return id
		}
	}
}

// --- 配置读写（Key 脱敏：GET 恒空 + hasKey；PUT 空 = 沿用，clearApiKey = 清除） ---

// aiConfigView 为 GET/PUT 的脱敏视图。
type aiConfigView struct {
	Enabled     bool                 `json:"enabled"`
	Provider    string               `json:"provider"`
	BaseURL     string               `json:"baseUrl"`
	Model       string               `json:"model"`
	APIKey      string               `json:"apiKey"`
	HasKey      bool                 `json:"hasKey"`
	ClearAPIKey bool                 `json:"clearApiKey,omitempty"` // 仅 PUT：true = 清除已存 Key
	MCPServers  []ai.MCPServerConfig `json:"mcpServers"`
}

// sanitizeMcpServer 把敏感值（headers/env 的 value）替换为哨兵，其余字段原样返回。
func sanitizeMcpServer(s ai.MCPServerConfig) ai.MCPServerConfig {
	maskMap := func(m map[string]string) map[string]string {
		if m == nil {
			return nil
		}
		out := make(map[string]string, len(m))
		for k, v := range m {
			if v != "" {
				out[k] = savedValueSentinel
			} else {
				out[k] = ""
			}
		}
		return out
	}
	s.Headers = maskMap(s.Headers)
	s.Env = maskMap(s.Env)
	return s
}

func configView(cfg ai.AIConfig) aiConfigView {
	view := aiConfigView{
		Enabled:    cfg.Enabled,
		Provider:   cfg.Provider,
		BaseURL:    cfg.BaseURL,
		Model:      cfg.Model,
		HasKey:     cfg.APIKey != "",
		MCPServers: make([]ai.MCPServerConfig, 0, len(cfg.MCPServers)),
	}
	for _, s := range cfg.MCPServers {
		view.MCPServers = append(view.MCPServers, sanitizeMcpServer(s))
	}
	return view
}

// getAiConfig 返回脱敏后的 AI 配置。
func getAiConfig(aiSvc *ai.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, configView(aiSvc.Settings().AIConfig()))
	}
}

// updateAiConfig 保存 AI 配置：apiKey 留空沿用已存、clearApiKey 清除；
// MCP headers/env 值为哨兵时沿用原值。
func updateAiConfig(aiSvc *ai.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req aiConfigView
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}

		cfg := aiSvc.Settings().AIConfig()

		// 合并 Key：留空沿用，clearApiKey 清除，否则覆盖
		switch {
		case req.ClearAPIKey:
			cfg.APIKey = ""
		case req.APIKey != "":
			cfg.APIKey = strings.TrimSpace(req.APIKey)
		}

		cfg.Enabled = req.Enabled
		cfg.Provider = strings.TrimSpace(req.Provider)
		cfg.BaseURL = strings.TrimSpace(req.BaseURL)
		cfg.Model = strings.TrimSpace(req.Model)

		// 校验
		if cfg.Provider != "" && cfg.Provider != "openai" && cfg.Provider != "anthropic" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiInvalidProvider")})
			return
		}
		if cfg.Enabled {
			if cfg.Provider == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiInvalidProvider")})
				return
			}
			if cfg.Model == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiModelRequired")})
				return
			}
			if cfg.APIKey == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiApiKeyRequired")})
				return
			}
		}

		// 合并 MCP 服务器：新配置为准，哨兵值回填原值，缺失的 ID 自动补
		oldByID := make(map[string]ai.MCPServerConfig, len(cfg.MCPServers))
		for _, s := range cfg.MCPServers {
			oldByID[s.ID] = s
		}
		idUsed := make(map[string]bool, len(req.MCPServers))
		merged := make([]ai.MCPServerConfig, 0, len(req.MCPServers))
		for _, s := range req.MCPServers {
			if s.ID == "" || idUsed[s.ID] {
				s.ID = nextMcpID(idUsed)
			}
			idUsed[s.ID] = true

			s = restoreMcpSentinels(s, oldByID[s.ID])

			s.Name = strings.TrimSpace(s.Name)
			s.Type = strings.TrimSpace(s.Type)
			s.Command = strings.TrimSpace(s.Command)
			s.URL = strings.TrimSpace(s.URL)

			if s.Name == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiMcpNameRequired")})
				return
			}
			switch s.Type {
			case "stdio":
				if s.Command == "" {
					c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiStdioCommandRequired")})
					return
				}
			case "http":
				if s.URL == "" {
					c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiHttpUrlRequired")})
					return
				}
			default:
				c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiMcpTypeInvalid")})
				return
			}
			merged = append(merged, s)
		}
		cfg.MCPServers = merged

		if err := aiSvc.Settings().SaveAIConfig(cfg); err != nil {
			// 把底层原因（如 data/ 目录权限导致的 permission denied）透传给用户，便于自查
			c.JSON(http.StatusInternalServerError, gin.H{"error": msg(c, "aiSaveFailed", err)})
			return
		}
		// 配置变更后对齐 MCP 进程：停掉被删/禁用/变更的服务器（启动仍是懒触发）
		aiSvc.MCP().Reconcile(ai.ToMcpConfigs(cfg))
		c.JSON(http.StatusOK, configView(cfg))
	}
}

// restoreMcpSentinels 把 headers/env 中的哨兵值回填为已存原值（无旧值则丢弃该键）。
func restoreMcpSentinels(s, old ai.MCPServerConfig) ai.MCPServerConfig {
	restoreMap := func(incoming, saved map[string]string) map[string]string {
		if incoming == nil {
			return nil
		}
		out := make(map[string]string, len(incoming))
		for k, v := range incoming {
			if v == savedValueSentinel {
				if oldV, ok := saved[k]; ok {
					out[k] = oldV
				}
				continue
			}
			out[k] = v
		}
		if len(out) == 0 {
			return nil
		}
		return out
	}
	if s.Headers != nil {
		s.Headers = restoreMap(s.Headers, old.Headers)
	}
	if s.Env != nil {
		s.Env = restoreMap(s.Env, old.Env)
	}
	return s
}

// chatWithAi 为 SSE 聊天端点：delta/tool_start/tool_end/error/done 事件直通前端。
// 写 SSE 头之前先完成配置校验（未配置走普通 400 JSON，与其它端点一致）。
func chatWithAi(aiSvc *ai.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req ai.ChatRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if len(req.Messages) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if !aiSvc.Settings().AIConfig().Configured() {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiNotConfigured")})
			return
		}

		c.Header("Content-Type", "text/event-stream; charset=utf-8")
		c.Header("Cache-Control", "no-cache")
		c.Header("X-Accel-Buffering", "no")
		flusher, ok := c.Writer.(http.Flusher)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming unsupported"})
			return
		}

		wrote := false
		emit := func(ev ai.ChatEvent) error {
			payload, err := json.Marshal(ev)
			if err != nil {
				return err
			}
			fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", ev.Type, payload)
			flusher.Flush()
			wrote = true
			return nil
		}

		err := aiSvc.ChatStream(c.Request.Context(), req, emit)
		switch {
		case err == nil:
			return // done 事件已发
		case errors.Is(err, ai.ErrNotConfigured):
			// 极小窗口内配置被改：若已开始写流则降级 error 事件
			if !wrote {
				c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiNotConfigured")})
				return
			}
			_ = emit(ai.ChatEvent{Type: "error", Text: msg(c, "aiNotConfigured")})
		case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
			return // 前端断开，静默收场
		default:
			// 尚未写过任何事件时仍可退回普通 JSON 错误；否则按协议发 error 事件
			if !wrote {
				c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
				return
			}
			_ = emit(ai.ChatEvent{Type: "error", Text: err.Error()})
		}
	}
}

// aiMcpStatusView 为单台 MCP 服务器的运行状态（M5 接入真实数据，M1 仅占位）。
type aiMcpStatusView struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Status    string `json:"status"` // running | stopped | error
	ToolCount int    `json:"toolCount"`
	Error     string `json:"error,omitempty"`
}

// getAiStatus 返回 AI 助手可用性与 MCP 服务器状态（不启动任何进程）。
func getAiStatus(aiSvc *ai.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := aiSvc.Settings().AIConfig()
		mgr := aiSvc.MCP()
		mcpStatuses := make([]aiMcpStatusView, 0, len(cfg.MCPServers))
		for _, s := range cfg.MCPServers {
			st := mgr.StatusOf(s.ID, s.Name)
			mcpStatuses = append(mcpStatuses, aiMcpStatusView{
				ID:        st.ID,
				Name:      st.Name,
				Status:    st.Status,
				ToolCount: st.ToolCount,
				Error:     st.Error,
			})
		}
		c.JSON(http.StatusOK, gin.H{"configured": cfg.Configured(), "mcp": mcpStatuses})
	}
}

// testMcpServer 用请求体里的（通常为草稿）MCP 配置临时建连：
// initialize + tools/list 后立即关闭，不影响托管状态；适合设置页 Test 按钮。
func testMcpServer(aiSvc *ai.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req ai.MCPServerConfig
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		// 哨兵回填：草稿里未改动的敏感值沿用已存配置（按 ID 匹配）
		var old ai.MCPServerConfig
		for _, s := range aiSvc.Settings().AIConfig().MCPServers {
			if s.ID == req.ID {
				old = s
				break
			}
		}
		req = restoreMcpSentinels(req, old)

		req.Name = strings.TrimSpace(req.Name)
		req.Type = strings.TrimSpace(req.Type)
		req.Command = strings.TrimSpace(req.Command)
		req.URL = strings.TrimSpace(req.URL)
		switch req.Type {
		case "stdio":
			if req.Command == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiStdioCommandRequired")})
				return
			}
		case "http":
			if req.URL == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiHttpUrlRequired")})
				return
			}
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "aiMcpTypeInvalid")})
			return
		}

		count, names, err := aiSvc.MCP().Test(c.Request.Context(), ai.ToMcpConfig(req))
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"ok": false, "toolCount": 0, "tools": []string{}, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "toolCount": count, "tools": names})
	}
}
