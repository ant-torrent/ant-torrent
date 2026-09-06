package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
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

// newDualRouter 构造路由，含一台 qB 与一台 transmission 服务器（各返回服务器 ID）。
func newDualRouter(t *testing.T) (*gin.Engine, string, string, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	store := config.NewStore(filepath.Join(dir, "servers.json"))
	qbID := store.Create(config.ServerConfig{Name: "qb", URL: "http://127.0.0.1:1"})
	trID := store.Create(config.ServerConfig{Name: "tr", URL: "http://127.0.0.1:2", Type: config.TypeTransmission})

	authStore, err := auth.NewStore(filepath.Join(dir, auth.FileName))
	if err != nil {
		t.Fatal(err)
	}
	if err := authStore.Setup(testUsername, testPassword); err != nil {
		t.Fatal(err)
	}
	settingsStore := settings.NewStore(filepath.Join(dir, settings.FileName))
	trMgr := transmission.NewManager()
	logMgr := logging.New(logbuf.New(logbuf.DefaultCap), settingsStore.Log())
	r := SetupRouter(store, qbt.NewClientManager(), trMgr, agent.NewManager(),
		ai.NewService(settingsStore, store, qbt.NewClientManager()), authStore, logMgr, settingsStore)
	return r, qbID, trID, loginSession(t, r)
}

// 类型守卫：qB 服务器打 /tr/*、transmission 服务器打 /qbt/* 都应 400，
// 且发生在任何上游请求之前（此处上游地址不可达，若守卫失效会变成 502 而非 400）。
func TestDownloaderTypeGuards(t *testing.T) {
	r, qbID, trID, session := newDualRouter(t)

	if resp := doJSON(t, r, http.MethodGet, "/api/servers/"+qbID+"/tr/snapshot", session, ""); resp.Code != http.StatusBadRequest {
		t.Errorf("qB 服务器打 /tr/* 应 400, got %d %s", resp.Code, resp.Body.String())
	}
	if resp := doJSON(t, r, http.MethodPost, "/api/servers/"+trID+"/qbt/v2/torrents/info", session, ""); resp.Code != http.StatusBadRequest {
		t.Errorf("transmission 服务器打 /qbt/* 应 400, got %d %s", resp.Code, resp.Body.String())
	}
}

func TestUpdateServerValidatesType(t *testing.T) {
	r, qbID, _, session := newDualRouter(t)
	if resp := doJSON(t, r, http.MethodPut, "/api/servers/"+qbID, session, `{"type":"rtorrent"}`); resp.Code != http.StatusBadRequest {
		t.Errorf("非法 type 应 400, got %d %s", resp.Code, resp.Body.String())
	}
	if resp := doJSON(t, r, http.MethodPut, "/api/servers/"+qbID, session, `{"type":"transmission"}`); resp.Code != http.StatusOK {
		t.Errorf("合法 type 应 200, got %d %s", resp.Code, resp.Body.String())
	}
}

// TestLiveTrRouterSnapshot 环境门控：TR_LIVE_ADDR 指向真实 Transmission 时，
// 走完整路由验证 snapshot(经服务器注册 type=transmission → /tr/* → RPC)。
func TestLiveTrRouterSnapshot(t *testing.T) {
	addr := os.Getenv("TR_LIVE_ADDR")
	if addr == "" {
		t.Skip("未设置 TR_LIVE_ADDR，跳过 live 路由验证")
	}

	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	store := config.NewStore(filepath.Join(dir, "servers.json"))
	trID := store.Create(config.ServerConfig{Name: "tr", URL: addr, Type: config.TypeTransmission})
	authStore, err := auth.NewStore(filepath.Join(dir, auth.FileName))
	if err != nil {
		t.Fatal(err)
	}
	if err := authStore.Setup(testUsername, testPassword); err != nil {
		t.Fatal(err)
	}
	settingsStore := settings.NewStore(filepath.Join(dir, settings.FileName))
	logMgr := logging.New(logbuf.New(logbuf.DefaultCap), settingsStore.Log())
	r := SetupRouter(store, qbt.NewClientManager(), transmission.NewManager(), agent.NewManager(),
		ai.NewService(settingsStore, store, qbt.NewClientManager()), authStore, logMgr, settingsStore)
	session := loginSession(t, r)

	resp := doJSON(t, r, http.MethodGet, "/api/servers/"+trID+"/tr/snapshot", session, "")
	if resp.Code != http.StatusOK {
		t.Fatalf("live snapshot 应 200, got %d %s", resp.Code, resp.Body.String())
	}
	if !strings.Contains(resp.Body.String(), `"torrents"`) || !strings.Contains(resp.Body.String(), `"freeSpace"`) {
		t.Errorf("snapshot 契约不符: %.200s", resp.Body.String())
	}
}
