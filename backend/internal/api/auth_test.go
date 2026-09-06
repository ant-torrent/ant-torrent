package api

import (
	"net/http"
	"net/http/httptest"
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

// newAuthTestRouter 构造已初始化账号（testUsername/testPassword）的完整路由。
func newAuthTestRouter(t *testing.T) *gin.Engine {
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
	settingsStore := settings.NewStore(filepath.Join(dir, "settings.json"))
	trMgr := transmission.NewManager()
	logMgr := logging.New(logbuf.New(logbuf.DefaultCap), settingsStore.Log())
	return SetupRouter(store, qbt.NewClientManager(), trMgr, agent.NewManager(),
		ai.NewService(settingsStore, store, qbt.NewClientManager()), authStore, logMgr, settingsStore)
}

// newUnsetupTestRouter 构造未初始化账号的路由（应进入 setup 引导流程）。
func newUnsetupTestRouter(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	store := config.NewStore(filepath.Join(dir, "servers.json"))
	authStore, err := auth.NewStore(filepath.Join(dir, auth.FileName))
	if err != nil {
		t.Fatal(err)
	}
	settingsStore := settings.NewStore(filepath.Join(dir, "settings.json"))
	trMgr := transmission.NewManager()
	logMgr := logging.New(logbuf.New(logbuf.DefaultCap), settingsStore.Log())
	return SetupRouter(store, qbt.NewClientManager(), trMgr, agent.NewManager(),
		ai.NewService(settingsStore, store, qbt.NewClientManager()), authStore, logMgr, settingsStore)
}

// loginSession 走 /api/auth/login 换取会话 cookie 串（"name=value"）。
func loginSession(t *testing.T, r *gin.Engine) string {
	t.Helper()
	return doLogin(t, r, testUsername, testPassword)
}

func doLogin(t *testing.T, r *gin.Engine, username, password string) string {
	t.Helper()
	resp := httptest.NewRecorder()
	body := `{"username":"` + username + `","password":"` + password + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Fatalf("登录失败: %d %s", resp.Code, resp.Body.String())
	}
	cookies := resp.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("登录响应未携带会话 cookie")
	}
	return cookies[0].Name + "=" + cookies[0].Value
}

func doJSON(t *testing.T, r *gin.Engine, method, path, cookie, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	resp := httptest.NewRecorder()
	r.ServeHTTP(resp, req)
	return resp
}

func TestHealthzPublic(t *testing.T) {
	r := newAuthTestRouter(t)
	resp := doJSON(t, r, http.MethodGet, "/api/healthz", "", "")
	if resp.Code != http.StatusOK {
		t.Fatalf("healthz 应公开 200, got %d", resp.Code)
	}
}

func TestProtectedRequiresLogin(t *testing.T) {
	r := newAuthTestRouter(t)
	resp := doJSON(t, r, http.MethodGet, "/api/servers", "", "")
	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("未登录访问受保护路由应 401, got %d", resp.Code)
	}
	if !strings.Contains(resp.Body.String(), "error") {
		t.Errorf("应返回 JSON 错误: %s", resp.Body.String())
	}
}

// agent 反连端点豁免浏览器认证：未带 cookie 也应到达其自带校验（报 agent 凭据缺失，
// 而非「请先登录」）。
func TestAgentWsExemptFromBrowserAuth(t *testing.T) {
	r := newAuthTestRouter(t)
	resp := doJSON(t, r, http.MethodGet, "/api/agent/ws", "", "")
	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("agent/ws 无凭据应 401, got %d", resp.Code)
	}
	if !strings.Contains(resp.Body.String(), "agent") {
		t.Errorf("应是 agent 自身的凭据错误而非登录拦截: %s", resp.Body.String())
	}
}

func TestAuthStatusStates(t *testing.T) {
	// 未初始化：setupRequired=true、未认证
	ru := newUnsetupTestRouter(t)
	resp := doJSON(t, ru, http.MethodGet, "/api/auth/status", "", "")
	if resp.Code != http.StatusOK {
		t.Fatalf("status 应公开 200, got %d", resp.Code)
	}
	if !strings.Contains(resp.Body.String(), `"setupRequired":true`) {
		t.Errorf("未初始化应 setupRequired=true: %s", resp.Body.String())
	}

	// 已初始化 + 未带 cookie：setupRequired=false、未认证、username 为空
	ra := newAuthTestRouter(t)
	resp = doJSON(t, ra, http.MethodGet, "/api/auth/status", "", "")
	if !strings.Contains(resp.Body.String(), `"setupRequired":false`) ||
		!strings.Contains(resp.Body.String(), `"authenticated":false`) {
		t.Errorf("未登录状态不符: %s", resp.Body.String())
	}
	if strings.Contains(resp.Body.String(), `"username":"admin"`) {
		t.Errorf("未登录不应泄露用户名: %s", resp.Body.String())
	}

	// 已初始化 + 会话 cookie：已认证并返回用户名
	session := loginSession(t, ra)
	resp = doJSON(t, ra, http.MethodGet, "/api/auth/status", session, "")
	if !strings.Contains(resp.Body.String(), `"authenticated":true`) ||
		!strings.Contains(resp.Body.String(), `"username":"`+testUsername+`"`) {
		t.Errorf("已登录状态不符: %s", resp.Body.String())
	}
}

func TestSetupTwiceRejected(t *testing.T) {
	r := newAuthTestRouter(t)
	resp := doJSON(t, r, http.MethodPost, "/api/auth/setup", "",
		`{"username":"root","password":"another-pw-1"}`)
	if resp.Code != http.StatusConflict {
		t.Fatalf("重复初始化应 409, got %d %s", resp.Code, resp.Body.String())
	}
}

func TestSetupThenProtectedAccessible(t *testing.T) {
	r := newUnsetupTestRouter(t)
	resp := doJSON(t, r, http.MethodPost, "/api/auth/setup", "",
		`{"username":"`+testUsername+`","password":"`+testPassword+`"}`)
	if resp.Code != http.StatusOK {
		t.Fatalf("首次初始化应 200, got %d %s", resp.Code, resp.Body.String())
	}
	cookies := resp.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("初始化成功应直接登录（携带会话 cookie）")
	}
	session := cookies[0].Name + "=" + cookies[0].Value
	resp = doJSON(t, r, http.MethodGet, "/api/servers", session, "")
	if resp.Code != http.StatusOK {
		t.Fatalf("初始化后带会话访问受保护路由应 200, got %d", resp.Code)
	}
}

func TestLoginWrongPasswordAndRateLimit(t *testing.T) {
	r := newAuthTestRouter(t)
	// 前 5 次错密码：401（凭据错误语义）；第 5 次失败后才落锁（阈值 5 来自 limiter）
	for i := 0; i < 5; i++ {
		doLoginExpect(t, r, testUsername, "wrong-pw-xxx", http.StatusUnauthorized)
	}
	// 落锁后 → 429
	doLoginExpect(t, r, testUsername, "wrong-pw-xxx", http.StatusTooManyRequests)
	// 锁定期间即使密码正确也 429
	doLoginExpect(t, r, testUsername, testPassword, http.StatusTooManyRequests)
}

func doLoginExpect(t *testing.T, r *gin.Engine, username, password string, want int) {
	t.Helper()
	resp := httptest.NewRecorder()
	body := `{"username":"` + username + `","password":"` + password + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(resp, req)
	if resp.Code != want {
		t.Fatalf("登录 %q/%q 期望 %d, got %d %s", username, password, want, resp.Code, resp.Body.String())
	}
}

func TestLogoutClearsSession(t *testing.T) {
	r := newAuthTestRouter(t)
	session := loginSession(t, r)

	resp := doJSON(t, r, http.MethodPost, "/api/auth/logout", session, "")
	if resp.Code != http.StatusOK {
		t.Fatalf("登出应 200, got %d", resp.Code)
	}
	cookies := resp.Result().Cookies()
	if len(cookies) == 0 || cookies[0].MaxAge >= 0 {
		t.Fatalf("登出应下发过期 cookie, got %+v", cookies)
	}
	// 继续用旧会话访问受保护路由仍有效——登出只清浏览器 cookie，不吊销令牌
	//（验证点：服务端不再下发任何新 cookie，且旧 cookie 本身仍能访问）
	resp = doJSON(t, r, http.MethodGet, "/api/servers", session, "")
	if resp.Code != http.StatusOK {
		t.Fatalf("logout 不吊销令牌, 旧会话应仍可用, got %d", resp.Code)
	}
}

func TestChangePasswordFlow(t *testing.T) {
	r := newAuthTestRouter(t)
	session := loginSession(t, r)

	// 错误旧密码 → 401，会话不变
	resp := doJSON(t, r, http.MethodPut, "/api/auth/password", session,
		`{"currentPassword":"bad-old-pw","newPassword":"brand-new-pw-1"}`)
	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("错误旧密码应 401, got %d %s", resp.Code, resp.Body.String())
	}

	// 正确改密 → 200 且重发新 cookie（当前浏览器保持登录）
	resp = doJSON(t, r, http.MethodPut, "/api/auth/password", session,
		`{"currentPassword":"`+testPassword+`","newPassword":"brand-new-pw-1"}`)
	if resp.Code != http.StatusOK {
		t.Fatalf("改密应 200, got %d %s", resp.Code, resp.Body.String())
	}
	cookies := resp.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("改密成功应重发会话 cookie")
	}
	newSession := cookies[0].Name + "=" + cookies[0].Value

	// epoch 推进：旧会话失效、新会话有效
	if resp := doJSON(t, r, http.MethodGet, "/api/servers", session, ""); resp.Code != http.StatusUnauthorized {
		t.Fatalf("改密后旧会话应 401, got %d", resp.Code)
	}
	if resp := doJSON(t, r, http.MethodGet, "/api/servers", newSession, ""); resp.Code != http.StatusOK {
		t.Fatalf("改密后新会话应 200, got %d", resp.Code)
	}
	// 新密码可登录
	doLoginExpect(t, r, testUsername, "brand-new-pw-1", http.StatusOK)
}

// TestCLIResetKicksSessions 模拟 CLI 重置：另建 Store 实例写新哈希（epoch+1），
// 运行中服务端热感知后旧会话失效、新密码可登录。
func TestCLIResetKicksSessions(t *testing.T) {
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
	settingsStore := settings.NewStore(filepath.Join(dir, "settings.json"))
	trMgr := transmission.NewManager()
	logMgr := logging.New(logbuf.New(logbuf.DefaultCap), settingsStore.Log())
	r := SetupRouter(store, qbt.NewClientManager(), trMgr, agent.NewManager(),
		ai.NewService(settingsStore, store, qbt.NewClientManager()), authStore, logMgr, settingsStore)
	session := loginSession(t, r)

	// CLI 侧：独立实例重置密码（与 store 单测不同,这里经 HTTP 验证服务端感知）
	cliStore, err := auth.NewStore(filepath.Join(dir, auth.FileName))
	if err != nil {
		t.Fatal(err)
	}
	hash, err := auth.HashPassword("cli-new-pw-123")
	if err != nil {
		t.Fatal(err)
	}
	if err := cliStore.SetPasswordHash(hash); err != nil {
		t.Fatal(err)
	}

	if resp := doJSON(t, r, http.MethodGet, "/api/servers", session, ""); resp.Code != http.StatusUnauthorized {
		t.Fatalf("CLI 重置后旧会话应 401, got %d", resp.Code)
	}
	doLoginExpect(t, r, testUsername, "cli-new-pw-123", http.StatusOK)
}
