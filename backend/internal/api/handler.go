package api

import (
	"bytes"
	"io"
	"net/http"
	"strings"

	"ant-torrent/backend/internal/agent"
	"ant-torrent/backend/internal/ai"
	"ant-torrent/backend/internal/auth"
	"ant-torrent/backend/internal/config"
	"ant-torrent/backend/internal/i18n"
	"ant-torrent/backend/internal/logging"
	"ant-torrent/backend/internal/qbt"
	"ant-torrent/backend/internal/settings"
	"ant-torrent/backend/internal/transmission"

	"github.com/gin-gonic/gin"
)

// SetupRouter creates and configures the Gin engine with all API routes.
// 认证豁免的路由显式挂在公开组（healthz / agent 反连 / auth 本身），
// 其余全部业务路由经 authMiddleware 保护——豁免清单以路由表形式可审计。
// 日志：gin.New + 自定义访问日志中间件（slog，可经 settings.json 实时开关），
// 替代 gin.Default 自带的 Logger；Recovery 保留，panic 栈经 DefaultErrorWriter 落缓冲。
func SetupRouter(store *config.Store, qbtMgr *qbt.ClientManager, trMgr *transmission.Manager, agentMgr *agent.Manager, aiSvc *ai.Service, authStore *auth.Store, logMgr *logging.Manager, settingsStore *settings.Store) *gin.Engine {
	r := gin.New()
	r.Use(corsMiddleware())
	r.Use(langMiddleware())
	r.Use(gin.Recovery())
	r.Use(accessLogMiddleware(logMgr))

	apiGroup := r.Group("/api")
	lim := auth.NewLoginLimiter()

	// ---- 公开路由 ----
	apiGroup.GET("/healthz", healthz())
	// agent 是机器客户端，经 Authorization: Bearer <agentToken> 自证身份（见 agent_ws.go）
	apiGroup.GET("/agent/ws", handleAgentWs(store, agentMgr))
	authGroup := apiGroup.Group("/auth")
	{
		authGroup.GET("/status", authStatus(authStore))
		authGroup.POST("/setup", authSetup(authStore))
		authGroup.POST("/login", authLogin(authStore, lim))
		authGroup.POST("/logout", authLogout())
	}

	// ---- 受保护路由：登录后可用 ----
	protected := apiGroup.Group("", authMiddleware(authStore))
	{
		// 修改密码需登录态（中间件注入当前用户名），挂在受保护组
		protected.PUT("/auth/password", authChangePassword(authStore))

		// 日志查看与日志配置（排障用；可能含敏感信息，受登录保护）
		protected.GET("/logs", logsHandler(logMgr))
		protected.GET("/logs/config", logsConfigGet(settingsStore))
		protected.PUT("/logs/config", logsConfigPut(settingsStore, logMgr))

		// Transmission 专用端点（仅 type=transmission 的服务器可用，类型不符 400）
		protected.GET("/servers/:id/tr/snapshot", trSnapshot(store, trMgr))
		protected.GET("/servers/:id/tr/session", trSession(store, trMgr))
		protected.PUT("/servers/:id/tr/session", trSessionUpdate(store, trMgr))
		protected.GET("/servers/:id/tr/torrents/detail", trTorrentDetail(store, trMgr))
		protected.POST("/servers/:id/tr/torrents/add", trAddTorrents(store, trMgr))
		protected.POST("/servers/:id/tr/torrents/start", trAction(store, trMgr, (*transmission.Manager).StartTorrents))
		protected.POST("/servers/:id/tr/torrents/start-now", trAction(store, trMgr, (*transmission.Manager).StartNowTorrents))
		protected.POST("/servers/:id/tr/torrents/stop", trAction(store, trMgr, (*transmission.Manager).StopTorrents))
		protected.POST("/servers/:id/tr/torrents/verify", trAction(store, trMgr, (*transmission.Manager).VerifyTorrents))
		protected.POST("/servers/:id/tr/torrents/reannounce", trAction(store, trMgr, (*transmission.Manager).ReannounceTorrents))
		protected.POST("/servers/:id/tr/torrents/remove", trRemove(store, trMgr))
		protected.POST("/servers/:id/tr/torrents/queue-move", trQueueMove(store, trMgr))
		protected.POST("/servers/:id/tr/torrents/labels", trSetLabels(store, trMgr))
		protected.POST("/servers/:id/tr/torrents/limits", trSetLimits(store, trMgr))

		// AI assistant
		protected.GET("/ai/config", getAiConfig(aiSvc))
		protected.PUT("/ai/config", updateAiConfig(aiSvc))
		protected.GET("/ai/status", getAiStatus(aiSvc))
		protected.POST("/ai/chat", chatWithAi(aiSvc))
		protected.POST("/ai/mcp/test", testMcpServer(aiSvc))

		// Server management
		protected.GET("/servers", listServers(store))
		protected.POST("/servers", createServer(store))
		protected.PUT("/servers/:id", updateServer(store))
		protected.DELETE("/servers/:id", deleteServer(store, qbtMgr, trMgr, agentMgr))

		// qBittorrent operations
		protected.POST("/servers/:id/test-connection", testConnection(store, qbtMgr, trMgr))

		// Categories & tags management (typed, proxied to qBittorrent)
		protected.GET("/servers/:id/torrents/categories", getCategories(store, qbtMgr))
		protected.POST("/servers/:id/torrents/categories", createCategory(store, qbtMgr))
		protected.PUT("/servers/:id/torrents/categories", editCategory(store, qbtMgr))
		protected.DELETE("/servers/:id/torrents/categories", removeCategories(store, qbtMgr))
		protected.GET("/servers/:id/torrents/tags", getTags(store, qbtMgr))
		protected.POST("/servers/:id/torrents/tags", createTags(store, qbtMgr))
		protected.DELETE("/servers/:id/torrents/tags", deleteTags(store, qbtMgr))

		// Filesystem browsing
		protected.GET("/servers/:id/fs/info", getFsInfo(store, qbtMgr, trMgr, agentMgr))
		protected.GET("/servers/:id/fs/list", listFsDir(store, agentMgr))
		protected.GET("/servers/:id/agent/status", getAgentStatus(store, agentMgr))
		protected.POST("/servers/:id/agent-token", regenerateAgentToken(store, agentMgr))

		// qBittorrent API proxy: /api/servers/:id/qbt/*path → qB instance
		protected.Any("/servers/:id/qbt/*path", proxyToQbt(store, qbtMgr))
	}

	return r
}

// --- Server management handlers ---

func listServers(store *config.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		servers := store.List()
		c.JSON(http.StatusOK, servers)
	}
}

func createServer(store *config.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		var cfg config.ServerConfig
		if err := c.ShouldBindJSON(&cfg); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		id := store.Create(cfg)
		created := store.Get(id)
		c.JSON(http.StatusCreated, created)
	}
}

func updateServer(store *config.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var patch map[string]any
		if err := c.ShouldBindJSON(&patch); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		// 名称与地址传入时不允许为空
		if v, ok := patch["name"].(string); ok && strings.TrimSpace(v) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "serverNameEmpty")})
			return
		}
		// 类型校验（白名单内的合法值才允许更新）
		if v, ok := patch["type"].(string); ok &&
			v != config.TypeQbittorrent && v != config.TypeTransmission {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidServerType")})
			return
		}
		if v, ok := patch["url"].(string); ok && strings.TrimSpace(v) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "serverUrlEmpty")})
			return
		}
		if err := store.Update(id, patch); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": msg(c, "serverNotFound")})
			return
		}
		c.JSON(http.StatusOK, store.Get(id))
	}
}

func deleteServer(store *config.Store, qbtMgr *qbt.ClientManager, trMgr *transmission.Manager, agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if err := store.Delete(id); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		qbtMgr.Remove(id)
		trMgr.Remove(id)
		agentMgr.Remove(id)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// --- qBittorrent operation handlers ---

// msg 按请求语言（Accept-Language 协商结果）渲染文案。
func msg(c *gin.Context, key string, args ...any) string {
	return i18n.T(c.GetString("lang"), key, args...)
}

// langMiddleware 解析 Accept-Language 并存入上下文，供错误文案 i18n 使用。
func langMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("lang", i18n.Negotiate(c.GetHeader("Accept-Language")))
		c.Next()
	}
}

// resolveConn 查找服务器并构造 qbt.Conn；未找到时已写入 404 响应。
func resolveConn(store *config.Store, c *gin.Context) (string, qbt.Conn, bool) {
	id := c.Param("id")
	srv := store.Get(id)
	if srv == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": msg(c, "serverNotFound")})
		return "", qbt.Conn{}, false
	}
	return id, qbt.Conn{BaseURL: srv.URL, Username: srv.Username, Password: srv.Password}, true
}

// writeQbtError 区分 qBittorrent 透传错误（原状态码 + i18n 文案）与内部错误（502）。
func writeQbtError(c *gin.Context, err error) {
	if apiErr, ok := qbt.AsAPIError(err); ok {
		c.JSON(apiErr.Status, gin.H{"error": msg(c, apiErr.Code, apiErr.Args...)})
		return
	}
	c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
}

func getCategories(store *config.Store, qbtMgr *qbt.ClientManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := resolveConn(store, c)
		if !ok {
			return
		}
		cats, err := qbtMgr.GetCategories(id, conn)
		if err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, cats)
	}
}

func createCategory(store *config.Store, qbtMgr *qbt.ClientManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := resolveConn(store, c)
		if !ok {
			return
		}
		var req struct {
			Name     string `json:"name"`
			SavePath string `json:"savePath"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "categoryNameEmpty")})
			return
		}
		if err := qbtMgr.CreateCategory(id, conn, req.Name, req.SavePath); err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func editCategory(store *config.Store, qbtMgr *qbt.ClientManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := resolveConn(store, c)
		if !ok {
			return
		}
		var req struct {
			Name     string `json:"name"`
			SavePath string `json:"savePath"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "categoryNameEmpty")})
			return
		}
		if err := qbtMgr.EditCategory(id, conn, req.Name, req.SavePath); err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func removeCategories(store *config.Store, qbtMgr *qbt.ClientManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := resolveConn(store, c)
		if !ok {
			return
		}
		var req struct {
			Names []string `json:"names"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if len(req.Names) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "categoriesRequired")})
			return
		}
		if err := qbtMgr.RemoveCategories(id, conn, req.Names); err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func getTags(store *config.Store, qbtMgr *qbt.ClientManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := resolveConn(store, c)
		if !ok {
			return
		}
		tags, err := qbtMgr.GetTags(id, conn)
		if err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, tags)
	}
}

func createTags(store *config.Store, qbtMgr *qbt.ClientManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := resolveConn(store, c)
		if !ok {
			return
		}
		var req struct {
			Tags []string `json:"tags"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if len(req.Tags) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "tagsRequired")})
			return
		}
		if err := qbtMgr.CreateTags(id, conn, req.Tags); err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func deleteTags(store *config.Store, qbtMgr *qbt.ClientManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := resolveConn(store, c)
		if !ok {
			return
		}
		var req struct {
			Tags []string `json:"tags"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if len(req.Tags) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "tagsRequired")})
			return
		}
		if err := qbtMgr.DeleteTags(id, conn, req.Tags); err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func testConnection(store *config.Store, qbtMgr *qbt.ClientManager, trMgr *transmission.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		srv := store.Get(id)
		if srv == nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": msg(c, "serverNotFound")})
			return
		}

		// 请求体可选：覆盖已保存的连接信息，用于测试未保存的草稿（含新建时的类型）
		url, username, password := srv.URL, srv.Username, srv.Password
		downloader := srv.Downloader()
		var body struct {
			URL      string `json:"url"`
			Username string `json:"username"`
			Password string `json:"password"`
			Type     string `json:"type"`
		}
		if err := c.ShouldBindJSON(&body); err == nil {
			if body.URL != "" {
				url = body.URL
			}
			if body.Username != "" {
				username = body.Username
			}
			if body.Password != "" {
				password = body.Password
			}
			if body.Type == config.TypeQbittorrent || body.Type == config.TypeTransmission {
				downloader = body.Type
			}
		}

		switch downloader {
		case config.TypeTransmission:
			version, err := trMgr.TestConnection(id, transmission.Conn{
				BaseURL: url, Username: username, Password: password,
			})
			if err != nil {
				c.JSON(http.StatusOK, gin.H{"success": false, "message": msg(c, "trUnreachable", err.Error())})
				return
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "message": "Transmission " + version})
		default:
			result, err := qbtMgr.Login(id, url, username, password)
			if err != nil {
				c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
				return
			}
			c.JSON(http.StatusOK, result)
		}
	}
}

// proxySkipHeaders 为不透传给 qBittorrent 的浏览器请求头：
// Origin 会触发 qB 的 CSRF 防护（403/401）；Cookie/Host/Connection 属于会话或逐跳头，
// 会与注入的 SID 冲突；Content-Length/Accept-Encoding 由 Go http 客户端自行协商。
var proxySkipHeaders = map[string]struct{}{
	"Origin":          {},
	"Cookie":          {},
	"Host":            {},
	"Connection":      {},
	"Content-Length":  {},
	"Accept-Encoding": {},
}

// copyProxyHeaders 复制请求头，跳过 proxySkipHeaders 中的键。
func copyProxyHeaders(dst, src http.Header) {
	for key, values := range src {
		if _, skip := proxySkipHeaders[key]; skip {
			continue
		}
		for _, v := range values {
			dst.Set(key, v)
		}
	}
}

// proxyToQbt forwards requests to the corresponding qBittorrent instance.
// Route: /api/servers/:id/qbt/*path → {server.URL}/api/v2/*path
func proxyToQbt(store *config.Store, qbtMgr *qbt.ClientManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		path := c.Param("path") // e.g. /v2/torrents/info

		srv := store.Get(id)
		if srv == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
			return
		}
		// transmission 服务器打 qB 代理 → 明确 400（否则会误报「qB 登录失败 502」）
		if srv.Downloader() != config.TypeQbittorrent {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "downloaderTypeMismatch")})
			return
		}

		// Ensure we have a valid SID (login if needed)
		client := qbtMgr.Get(id)
		if !client.HasValidSID() {
			result, err := qbtMgr.Login(id, srv.URL, srv.Username, srv.Password)
			if err != nil || !result.Success {
				msg := "login failed"
				if err != nil {
					msg = err.Error()
				} else if result != nil {
					msg = result.Message
				}
				// 上游 qB 凭据/可用性问题用 502：401 是「AntTorrent 会话失效」
				// 的专属语义，前端据此自动登出，不能挪用（否则 qB 瞬时不可达
				// 时轮询会把用户踢回登录页）
				c.JSON(http.StatusBadGateway, gin.H{"error": msg})
				return
			}
		}

		// Build target URL (keep the original query string — c.Param("path") is path-only)
		targetURL := strings.TrimRight(srv.URL, "/") + "/api" + path
		if raw := c.Request.URL.RawQuery; raw != "" {
			targetURL += "?" + raw
		}

		// Read request body (saved for potential 403 retry with multipart body)
		var bodyBytes []byte
		var bodyReader io.Reader
		if c.Request.Body != nil {
			bodyBytes, _ = io.ReadAll(c.Request.Body)
			bodyReader = bytes.NewReader(bodyBytes)
		}

		// Create proxy request
		proxyReq, err := http.NewRequest(c.Request.Method, targetURL, bodyReader)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Copy headers
		copyProxyHeaders(proxyReq.Header, c.Request.Header)
		proxyReq.Header.Set("Referer", srv.URL)

		// Execute request (DoRequest automatically adds SID cookie)
		resp, err := qbtMgr.DoRequest(id, proxyReq)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		defer resp.Body.Close()

		// If 403, try re-login once
		if resp.StatusCode == http.StatusForbidden {
			resp.Body.Close()
			result, loginErr := qbtMgr.Login(id, srv.URL, srv.Username, srv.Password)
			if loginErr != nil || !result.Success {
				// 语义同上：qB 侧重登失败是上游故障（502），不是 AntTorrent 会话失效
				c.JSON(http.StatusBadGateway, gin.H{"error": "qBittorrent session expired and re-login failed"})
				return
			}
			// Retry with new SID (reuse saved body bytes so multipart uploads aren't lost)
			proxyReq2, _ := http.NewRequest(c.Request.Method, targetURL, bytes.NewReader(bodyBytes))
			copyProxyHeaders(proxyReq2.Header, c.Request.Header)
			proxyReq2.Header.Set("Referer", srv.URL)
			resp, err = qbtMgr.DoRequest(id, proxyReq2)
			if err != nil {
				c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
				return
			}
			defer resp.Body.Close()
		}

		// Copy response headers
		for key, values := range resp.Header {
			for _, v := range values {
				c.Header(key, v)
			}
		}
		c.Status(resp.StatusCode)
		io.Copy(c.Writer, resp.Body)
	}
}

// --- Middleware ---

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "http://localhost:5273")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
