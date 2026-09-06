// 账号认证相关 handler 与中间件。
// 路由分两类（见 SetupRouter）：
//
//	公开：/api/healthz、/api/auth/*、/api/agent/ws（agent 自带 Bearer 认证）
//	受保护：其余全部业务路由，经 authMiddleware 校验会话 cookie
package api

import (
	"errors"
	"math"
	"net/http"
	"strings"
	"time"

	"ant-torrent/backend/internal/auth"

	"github.com/gin-gonic/gin"
)

// gin 上下文中当前登录用户名的键。
const authUserKey = "authUser"

// healthz 免登录健康检查端点，Docker HEALTHCHECK 专用
// （启用登录后 /api/servers 未登录会 401，不能再用作健康检查）。
func healthz() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// authStatus 公开返回账号状态：是否需要初始化、当前请求是否已登录。
// username 仅在已登录时非空，未认证不泄露账号名。
func authStatus(st *auth.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		setupRequired, err := st.SetupRequired()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": msg(c, "authStoreBroken")})
			return
		}
		username := ""
		if !setupRequired {
			if token, err := c.Cookie(auth.CookieName); err == nil && token != "" {
				if u, _, verr := st.VerifyToken(token, time.Now()); verr == nil {
					username = u
				}
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"setupRequired": setupRequired,
			"authenticated": username != "",
			"username":      username,
		})
	}
}

// authSetup 初始化账号（仅在未设置时可用），成功后直接登录。
func authSetup(st *auth.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		username := strings.TrimSpace(req.Username)
		if err := st.Setup(username, req.Password); err != nil {
			writeAuthError(c, err)
			return
		}
		issueSession(c, st, username)
	}
}

// authLogin 校验凭据并签发会话；带按 IP 的防爆破限流。
func authLogin(st *auth.Store, lim *auth.LoginLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		key := c.ClientIP()
		if !lim.Allow(key) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": msg(c, "authTooManyAttempts", minutesCeil(lim.RetryAfter(key))),
			})
			return
		}
		if err := st.VerifyLogin(strings.TrimSpace(req.Username), req.Password); err != nil {
			lim.Fail(key)
			writeAuthError(c, err)
			return
		}
		lim.Reset(key)
		issueSession(c, st, strings.TrimSpace(req.Username))
	}
}

// authLogout 清除本浏览器的会话 cookie（幂等、公开：会话过期后也能登出）。
// 不推进 epoch——其他设备/标签页不受影响；怀疑泄露请改密码或用 CLI 重置。
func authLogout() gin.HandlerFunc {
	return func(c *gin.Context) {
		clearSessionCookie(c)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// authChangePassword 修改密码。顺序关键：验证旧密码 → 更新哈希并推进 epoch
// （其他会话全部失效）→ 用新 epoch 为当前浏览器重发令牌，保持本会话登录。
func authChangePassword(st *auth.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			CurrentPassword string `json:"currentPassword"`
			NewPassword     string `json:"newPassword"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		username := c.GetString(authUserKey)
		if err := st.ChangePassword(username, req.CurrentPassword, req.NewPassword); err != nil {
			writeAuthError(c, err)
			return
		}
		issueSession(c, st, username)
	}
}

// authMiddleware 校验会话 cookie，通过后注入用户名，并在令牌临近过期时滑动续期。
func authMiddleware(st *auth.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie(auth.CookieName)
		if err != nil || token == "" {
			abortUnauthorized(c)
			return
		}
		username, refresh, err := st.VerifyToken(token, time.Now())
		if err != nil {
			abortUnauthorized(c)
			return
		}
		c.Set(authUserKey, username)
		if refresh {
			// 滑动续期：同 epoch 签发新令牌，不影响其他会话/标签页
			if newToken, _, ierr := st.IssueToken(username, time.Now()); ierr == nil {
				setSessionCookie(c, newToken, int(auth.SessionTTL/time.Second))
			}
		}
		c.Next()
	}
}

// --- 内部工具 ---

// issueSession 校验通过后签发令牌、写 cookie 并返回用户名。
func issueSession(c *gin.Context, st *auth.Store, username string) {
	token, _, err := st.IssueToken(username, time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": msg(c, "authSessionIssueFailed")})
		return
	}
	setSessionCookie(c, token, int(auth.SessionTTL/time.Second))
	c.JSON(http.StatusOK, gin.H{"ok": true, "username": username})
}

// writeAuthError 把 auth 包的错误映射为状态码与 i18n 文案。
func writeAuthError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, auth.ErrInvalidCredentials):
		c.JSON(http.StatusUnauthorized, gin.H{"error": msg(c, "authInvalidCredentials")})
	case errors.Is(err, auth.ErrWrongPassword):
		c.JSON(http.StatusUnauthorized, gin.H{"error": msg(c, "authWrongPassword")})
	case errors.Is(err, auth.ErrNotSetUp):
		c.JSON(http.StatusConflict, gin.H{"error": msg(c, "authNotSetUp")})
	case errors.Is(err, auth.ErrAlreadySetUp):
		c.JSON(http.StatusConflict, gin.H{"error": msg(c, "authAlreadySetUp")})
	case errors.Is(err, auth.ErrUsernameRequired):
		c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "authUsernameRequired")})
	case errors.Is(err, auth.ErrPasswordTooShort):
		c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "authPasswordTooShort")})
	case errors.Is(err, auth.ErrPasswordTooLong):
		c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "authPasswordTooLong")})
	default:
		// auth.json 损坏或写盘失败：500 并提示检查文件
		c.JSON(http.StatusInternalServerError, gin.H{"error": msg(c, "authStoreBroken")})
	}
}

func abortUnauthorized(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": msg(c, "authRequired")})
}

// setSessionCookie 写入会话 cookie。不设 Secure：自托管常见纯 HTTP 部署，
// 带 Secure 会被浏览器在 HTTP 下直接丢弃；TLS 部署用户可通过反代加严。
func setSessionCookie(c *gin.Context, token string, maxAge int) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(auth.CookieName, token, maxAge, "/", "", false, true)
}

// clearSessionCookie 以 Max-Age=-1 立即过期会话 cookie。
func clearSessionCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(auth.CookieName, "", -1, "/", "", false, true)
}

// minutesCeil 把剩余时长向上取整为分钟数（限流文案粒度）。
func minutesCeil(d time.Duration) int {
	if d <= 0 {
		return 1
	}
	return int(math.Ceil(d.Minutes()))
}
