package api

import (
	"net/http"
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

// newLogsRouter 构造路由并返回日志管理器（用于观察访问日志开关的实际效果）。
func newLogsRouter(t *testing.T) (*gin.Engine, *logging.Manager, *logbuf.LogBuf, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	store := config.NewStore(filepath.Join(dir, "servers.json"))
	authStore, err := auth.NewStore(filepath.Join(dir, auth.FileName))
	if err != nil {
		t.Fatal(err)
	}
	if err := authStore.Setup(testUsername, testPassword); err != nil {
		t.Fatal(err)
	}
	settingsStore := settings.NewStore(filepath.Join(dir, settings.FileName))
	buf := logbuf.New(logbuf.DefaultCap)
	trMgr := transmission.NewManager()
	logMgr := logging.New(buf, settingsStore.Log())
	r := SetupRouter(store, qbt.NewClientManager(), trMgr, agent.NewManager(),
		ai.NewService(settingsStore, store, qbt.NewClientManager()), authStore, logMgr, settingsStore)
	return r, logMgr, buf, loginSession(t, r)
}

func TestLogsConfigGetDefault(t *testing.T) {
	r, _, _, session := newLogsRouter(t)
	resp := doJSON(t, r, http.MethodGet, "/api/logs/config", session, "")
	if resp.Code != http.StatusOK {
		t.Fatalf("应 200, got %d", resp.Code)
	}
	for _, want := range []string{`"level":"info"`, `"format":"text"`, `"accessLog":true`} {
		if !strings.Contains(resp.Body.String(), want) {
			t.Errorf("缺省配置应含 %s: %s", want, resp.Body.String())
		}
	}
}

func TestLogsConfigPutAppliesLive(t *testing.T) {
	r, logMgr, buf, session := newLogsRouter(t)

	// 合法配置：warn + json + 关闭访问日志
	resp := doJSON(t, r, http.MethodPut, "/api/logs/config", session,
		`{"level":"warn","format":"json","accessLog":false}`)
	if resp.Code != http.StatusOK {
		t.Fatalf("合法配置应 200, got %d %s", resp.Code, resp.Body.String())
	}
	if got := logMgr.AccessLogEnabled(); got {
		t.Error("关闭访问日志应即时生效")
	}

	// 关闭后：请求不再产生访问日志行
	before := len(buf.Lines())
	doJSON(t, r, http.MethodGet, "/api/servers", session, "")
	if after := len(buf.Lines()); after != before {
		t.Fatalf("访问日志关闭后不应新增日志行: %d → %d", before, after)
	}

	// 重新开启：请求产生 json 格式的访问日志行
	doJSON(t, r, http.MethodPut, "/api/logs/config", session,
		`{"level":"info","format":"json","accessLog":true}`)
	doJSON(t, r, http.MethodGet, "/api/servers", session, "")
	lines := buf.Lines()
	last := lines[len(lines)-1]
	if !strings.Contains(last, `"msg":"http request"`) || !strings.Contains(last, `"path":"/api/servers"`) {
		t.Fatalf("重新开启后应输出 json 访问日志: %q", last)
	}
}

func TestLogsConfigPutInvalid(t *testing.T) {
	r, _, _, session := newLogsRouter(t)
	for _, body := range []string{
		`{"level":"verbose","format":"text","accessLog":true}`,
		`{"level":"info","format":"yaml","accessLog":true}`,
	} {
		resp := doJSON(t, r, http.MethodPut, "/api/logs/config", session, body)
		if resp.Code != http.StatusBadRequest {
			t.Fatalf("非法配置应 400, got %d %s", resp.Code, resp.Body.String())
		}
	}
}

func TestLogsEndpointRequiresLogin(t *testing.T) {
	r, _, _, _ := newLogsRouter(t)
	resp := doJSON(t, r, http.MethodGet, "/api/logs", "", "")
	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("未登录查日志应 401, got %d", resp.Code)
	}
}
