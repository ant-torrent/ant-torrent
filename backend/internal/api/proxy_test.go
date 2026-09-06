package api

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"ant-torrent/backend/internal/agent"
	"ant-torrent/backend/internal/ai"
	"ant-torrent/backend/internal/auth"
	"ant-torrent/backend/internal/config"
	"ant-torrent/backend/internal/logbuf"
	"ant-torrent/backend/internal/logging"
	"ant-torrent/backend/internal/qbt"
	"ant-torrent/backend/internal/settings"
	"ant-torrent/backend/internal/transmission"

	"github.com/gin-gonic/gin"
)

// newProxyTestRouter 构造带一台指向假 qB 的服务器、已初始化账号的路由。
func newProxyTestRouter(t *testing.T, qbHandler http.HandlerFunc) (*gin.Engine, string, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()

	qbSrv := httptest.NewServer(qbHandler)
	t.Cleanup(qbSrv.Close)

	store := config.NewStore(filepath.Join(dir, "servers.json"))
	serverID := store.Create(config.ServerConfig{Name: "qb", URL: qbSrv.URL, Username: "a", Password: "b"})

	authStore, err := auth.NewStore(filepath.Join(dir, auth.FileName))
	if err != nil {
		t.Fatal(err)
	}
	if err := authStore.Setup(testUsername, testPassword); err != nil {
		t.Fatal(err)
	}
	settingsStore := settings.NewStore(filepath.Join(dir, "settings.json"))
	trMgr := transmission.NewManager()
	logMgr := logging.New(logbuf.New(logbuf.DefaultCap), settingsStore.Log())
	r := SetupRouter(store, qbt.NewClientManager(), trMgr, agent.NewManager(),
		ai.NewService(settingsStore, store, qbt.NewClientManager()), authStore, logMgr, settingsStore)
	return r, serverID, loginSession(t, r)
}

// 401 是「AntTorrent 会话失效」的专属语义（前端据此自动登出，见 client.ts
// handleAuthStatus）：qB 登录失败属上游故障，必须用 502，否则轮询会在 qB
// 瞬时不可达时把用户踢回登录页（历史 bug）。
func TestProxyQbtLoginFailureNotUnauthorized(t *testing.T) {
	// 假 qB：登录端点 404 → qbt.Login 失败（模拟 qB 临时不可达）
	r, serverID, session := newProxyTestRouter(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	resp := doJSON(t, r, http.MethodGet, "/api/servers/"+serverID+"/qbt/v2/torrents/info", session, "")
	if resp.Code != http.StatusBadGateway {
		t.Fatalf("qB 登录失败应 502 而非 401, got %d %s", resp.Code, resp.Body.String())
	}
}

// SID 失效（上游 403）触发自动重登、重登也失败时，同样必须 502 而非 401。
func TestProxyQbtReloginFailureNotUnauthorized(t *testing.T) {
	logins := 0
	r, serverID, session := newProxyTestRouter(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v2/auth/login":
			logins++
			if logins == 1 { // 仅首次登录成功发放 SID，其后（403 重登）失败
				w.Header().Set("Set-Cookie", "SID=qb-session-1; Path=/")
				w.Write([]byte("Ok."))
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
		default: // 业务端点一律 403 → 触发 SID 过期重登路径
			w.WriteHeader(http.StatusForbidden)
		}
	})
	resp := doJSON(t, r, http.MethodGet, "/api/servers/"+serverID+"/qbt/v2/torrents/info", session, "")
	if resp.Code != http.StatusBadGateway {
		t.Fatalf("qB SID 过期且重登失败应 502 而非 401, got %d %s", resp.Code, resp.Body.String())
	}
}
