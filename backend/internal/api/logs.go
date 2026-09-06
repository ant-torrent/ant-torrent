// 日志查看与日志配置 handler：返回/更新进程内环形缓冲与 settings.json 的日志配置，
// 供前端「日志」页排障。均在受保护组——日志可能含敏感信息。
package api

import (
	"log/slog"
	"net/http"
	"slices"
	"time"

	"ant-torrent/backend/internal/logging"
	"ant-torrent/backend/internal/settings"

	"github.com/gin-gonic/gin"
)

// logsHandler 返回最近日志行。
func logsHandler(m *logging.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"lines": m.Lines()})
	}
}

// logsConfigGet 返回当前日志配置。
func logsConfigGet(st *settings.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, st.Log())
	}
}

// logsConfigPut 更新日志配置：校验 → 持久化（settings.json）→ 热应用（无需重启）。
func logsConfigPut(st *settings.Store, m *logging.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req settings.LogConfig
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if !slices.Contains(settings.LogLevels, req.Level) {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "logInvalidLevel")})
			return
		}
		if !slices.Contains(settings.LogFormats, req.Format) {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "logInvalidFormat")})
			return
		}
		saved, err := st.SaveLog(req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": msg(c, "logSaveFailed", err)})
			return
		}
		m.Apply(saved)
		slog.Info("log config updated", "level", saved.Level, "format", saved.Format, "accessLog", saved.AccessLog)
		c.JSON(http.StatusOK, saved)
	}
}

// accessLogMiddleware 以 slog 输出访问日志（一条/请求），受 settings.json
// 的 log.accessLog 控制、可实时开关（替代 gin.Default 自带的 Logger 中间件）。
func accessLogMiddleware(m *logging.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		if !m.AccessLogEnabled() {
			return
		}
		slog.Info("http request",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"latency", time.Since(start).String(),
			"ip", c.ClientIP(),
		)
	}
}
