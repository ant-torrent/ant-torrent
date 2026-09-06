package api

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"ant-torrent/backend/internal/agent"
	"ant-torrent/backend/internal/config"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// handleAgentWs 处理 agent 的反向 WebSocket 连接：
// 校验 serverId + token 后升级协议，交给 agent.Manager 读写直到断开。
func handleAgentWs(store *config.Store, agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		serverID := c.GetHeader("X-Ant-Server-Id")
		token := strings.TrimSpace(strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer "))
		if serverID == "" || token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing agent credentials"})
			return
		}
		srv := store.Get(serverID)
		// 常数时间比较避免时序侧信道
		if srv == nil || srv.AgentToken == "" ||
			subtle.ConstantTimeCompare([]byte(token), []byte(srv.AgentToken)) != 1 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid agent credentials"})
			return
		}

		upgrader := websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			// agent 为非浏览器客户端，不做同源校验
			CheckOrigin: func(r *http.Request) bool { return true },
		}
		ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return // Upgrade 已写入错误响应
		}
		agentMgr.Serve(serverID, ws)
	}
}
