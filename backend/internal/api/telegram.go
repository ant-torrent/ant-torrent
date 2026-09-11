// telegram.go 为 Telegram bot 的设置页端点：配置读写（token 脱敏，与 AI Key
// 同策略——GET 恒空 + hasKey，PUT 空 = 沿用、clearBotToken = 清除）与
// 「测试连接」（草稿配置临时 getMe，不影响运行中的 bot）。
package api

import (
	"net/http"
	"net/url"
	"strings"

	"ant-torrent/backend/internal/i18n"
	"ant-torrent/backend/internal/settings"
	"ant-torrent/backend/internal/telegram"

	"github.com/gin-gonic/gin"
)

// telegramConfigView 为 GET/PUT 的脱敏视图。
type telegramConfigView struct {
	Enabled        bool             `json:"enabled"`
	BotToken       string           `json:"botToken"`                // GET 恒空串
	HasKey         bool             `json:"hasKey"`                  // 已存 token
	ClearBotToken  bool             `json:"clearBotToken,omitempty"` // 仅 PUT：true = 清除已存 token
	AllowedUserIDs []int64          `json:"allowedUserIds"`
	ProxyURL       string           `json:"proxyUrl"`
	Language       string           `json:"language"`
	Status         *telegram.Status `json:"status,omitempty"` // GET 附带运行状态
}

// telegramView 由配置构造脱敏视图（st 非 nil 时附带运行状态）。
func telegramView(cfg telegram.Config, st *telegram.Status) telegramConfigView {
	view := telegramConfigView{
		Enabled:        cfg.Enabled,
		HasKey:         cfg.BotToken != "",
		AllowedUserIDs: cfg.AllowedUserIDs,
		ProxyURL:       cfg.ProxyURL,
		Language:       cfg.Language,
		Status:         st,
	}
	if view.AllowedUserIDs == nil {
		view.AllowedUserIDs = []int64{}
	}
	return view
}

// getTelegramConfig 返回脱敏配置与运行状态。
func getTelegramConfig(settingsStore *settings.Store, tgMgr *telegram.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := settingsStore.TelegramConfig()
		st := tgMgr.Status()
		c.JSON(http.StatusOK, telegramView(cfg, &st))
	}
}

// updateTelegramConfig 保存配置并对齐 bot 运行状态（启停/重启长轮询）。
func updateTelegramConfig(settingsStore *settings.Store, tgMgr *telegram.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req telegramConfigView
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}

		cfg := settingsStore.TelegramConfig()

		// 合并 token：留空沿用，clearBotToken 清除，否则覆盖
		switch {
		case req.ClearBotToken:
			cfg.BotToken = ""
		case req.BotToken != "":
			cfg.BotToken = strings.TrimSpace(req.BotToken)
		}

		cfg.Enabled = req.Enabled
		cfg.ProxyURL = strings.TrimSpace(req.ProxyURL)
		cfg.Language = strings.TrimSpace(req.Language)
		cfg.AllowedUserIDs = normalizeUserIDs(req.AllowedUserIDs)

		// 校验
		if cfg.Enabled && cfg.BotToken == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "telegramTokenRequired")})
			return
		}
		if cfg.ProxyURL != "" && !validProxyURL(cfg.ProxyURL) {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "telegramInvalidProxy")})
			return
		}
		if cfg.Language != "" && cfg.Language != i18n.ZhCN && cfg.Language != i18n.EnUS {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "telegramInvalidLanguage")})
			return
		}

		if err := settingsStore.SaveTelegramConfig(cfg); err != nil {
			// 底层原因（如 data/ 目录权限）透传给用户，便于自查
			c.JSON(http.StatusInternalServerError, gin.H{"error": msg(c, "telegramSaveFailed", err)})
			return
		}
		// 保存后对齐 bot：启停 / 配置变更重启长轮询（白名单变更不打断轮询）
		tgMgr.Reconcile(cfg)
		c.JSON(http.StatusOK, telegramView(cfg, nil))
	}
}

// testTelegram 用（草稿）配置临时 getMe 验证 token 与代理连通性：
// 恒 200 + ok 标志，与 MCP 测试端点同风格。
func testTelegram(settingsStore *settings.Store, tgMgr *telegram.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req telegramConfigView
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		cfg := settingsStore.TelegramConfig()
		// token 留空沿用已存值；代理以草稿为准（保存前先验证代理可用性）
		if req.BotToken != "" {
			cfg.BotToken = strings.TrimSpace(req.BotToken)
		}
		cfg.ProxyURL = strings.TrimSpace(req.ProxyURL)

		username, err := tgMgr.Test(c.Request.Context(), cfg)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"ok": false, "botUsername": "", "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "botUsername": username})
	}
}

// normalizeUserIDs 归一化白名单：去重、去非正值（Telegram 用户 ID 恒为正）。
func normalizeUserIDs(in []int64) []int64 {
	seen := make(map[int64]bool, len(in))
	out := make([]int64, 0, len(in))
	for _, id := range in {
		if id <= 0 || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

// validProxyURL 校验代理地址：scheme 限 http/https/socks5(/socks5h)。
func validProxyURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	switch u.Scheme {
	case "http", "https", "socks5", "socks5h":
		return true
	}
	return false
}
