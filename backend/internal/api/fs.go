package api

import (
	"net"
	"net/http"
	"net/url"
	"os"

	"ant-torrent/backend/internal/agent"
	"ant-torrent/backend/internal/config"
	"ant-torrent/backend/internal/fsbrowse"
	"ant-torrent/backend/internal/protocol"
	"ant-torrent/backend/internal/qbt"
	"ant-torrent/backend/internal/transmission"

	"github.com/gin-gonic/gin"
)

// 目录浏览的分层策略：
//  1. agent 在线    → 经 WebSocket RPC 调用 qB 所在机器的 agent（支持远程）
//  2. 本机回环服务器 → 直接读后端本机文件系统（零配置，后端与 qB 同机）
//  3. 其他          → 无法浏览目录树（前端展示 qB 已知路径候选）

// isLoopbackURL 判断服务器 URL 是否指向本机回环地址。
func isLoopbackURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := u.Hostname()
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// getFsInfo 返回该服务器可用的目录浏览模式与起始路径建议。
// 始终 200（qB 不可达只影响 suggestedPath 置空，不报错）。
func getFsInfo(store *config.Store, qbtMgr *qbt.ClientManager, trMgr *transmission.Manager, agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := resolveConn(store, c)
		if !ok {
			return
		}
		srv := store.Get(id)
		resp := gin.H{"mode": "remote", "suggestedPath": "", "home": homeDir()}
		if st := agentMgr.Status(id); st.Online {
			resp["mode"] = "agent"
			resp["agent"] = gin.H{"version": st.Version, "allowedDirs": st.AllowedDirs}
		} else if isLoopbackURL(conn.BaseURL) {
			resp["mode"] = "local"
		}
		// 各模式都尝试用下载器默认保存路径作为浏览起始路径，失败静默置空
		if srv != nil && srv.Downloader() == config.TypeTransmission {
			if p, err := trMgr.GetDownloadDir(id, transmission.Conn{
				BaseURL: conn.BaseURL, Username: conn.Username, Password: conn.Password,
			}); err == nil && p != "" {
				resp["suggestedPath"] = p
			}
		} else if p, err := qbtMgr.GetDefaultSavePath(id, conn); err == nil && p != "" {
			resp["suggestedPath"] = p
		}
		c.JSON(http.StatusOK, resp)
	}
}

// listFsDir 列目录：agent 在线走 agent RPC；否则仅本机回环服务器可读后端本机目录。
func listFsDir(store *config.Store, agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := resolveConn(store, c)
		if !ok {
			return
		}
		raw := c.Query("path")

		if agentMgr.Status(id).Online {
			result, aerr := agentMgr.Call(id, "fs.list", protocol.FsListParams{Path: raw})
			if aerr == nil {
				c.Data(http.StatusOK, "application/json", result)
				return
			}
			// 非“刚掉线”错误，或掉线但服务器并非本机：直接返回错误
			if aerr.Code != "agentOffline" || !isLoopbackURL(conn.BaseURL) {
				writeAgentError(c, aerr)
				return
			}
			// agent 刚掉线且后端与 qB 同机：回落本机实现（走下方共用逻辑）
		}
		if !isLoopbackURL(conn.BaseURL) {
			c.JSON(http.StatusConflict, gin.H{"error": msg(c, "agentRequired")})
			return
		}
		res := fsbrowse.List(raw)
		if res.Code != "" {
			c.JSON(res.Status, gin.H{"error": msg(c, res.Code)})
			return
		}
		c.JSON(http.StatusOK, res.FsListResult)
	}
}

// writeAgentError 将 agent RPC 错误码映射为本地化 HTTP 响应。
func writeAgentError(c *gin.Context, aerr *protocol.AgentError) {
	status := http.StatusBadGateway
	switch aerr.Code {
	case "pathNotFound":
		status = http.StatusNotFound
	case "notADirectory", "invalidPath", "pathOutsideAllowedDirs":
		status = http.StatusBadRequest
	case "pathPermissionDenied":
		status = http.StatusForbidden
	case "agentTimeout":
		status = http.StatusGatewayTimeout
	case "agentOffline":
		status = http.StatusConflict
	}
	key := aerr.Code
	if _, known := knownAgentCodes[key]; !known {
		key = "agentError" // agentInternal / methodNotFound 等收敛为通用文案
	}
	c.JSON(status, gin.H{"error": msg(c, key)})
}

// knownAgentCodes 为 writeAgentError 会原样透传给 i18n 的错误码集合。
var knownAgentCodes = map[string]struct{}{
	"pathNotFound":           {},
	"notADirectory":          {},
	"invalidPath":            {},
	"pathOutsideAllowedDirs": {},
	"pathPermissionDenied":   {},
	"agentTimeout":           {},
	"agentOffline":           {},
	"agentRequired":          {},
}

// getAgentStatus 返回服务器 agent 在线状态（前端连接配置页展示用，不触发 qB 调用）。
func getAgentStatus(store *config.Store, agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if store.Get(id) == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": msg(c, "serverNotFound")})
			return
		}
		st := agentMgr.Status(id)
		c.JSON(http.StatusOK, gin.H{
			"online":      st.Online,
			"version":     st.Version,
			"allowedDirs": st.AllowedDirs,
		})
	}
}

// regenerateAgentToken 重置 agent token；旧连接随旧 token 失效，agent 需用新 token 重连。
func regenerateAgentToken(store *config.Store, agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		token, err := store.RegenerateAgentToken(id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": msg(c, "serverNotFound")})
			return
		}
		agentMgr.Remove(id)
		c.JSON(http.StatusOK, gin.H{"token": token})
	}
}

// homeDir 返回后端用户家目录，取不到为空串。
func homeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return home
}
