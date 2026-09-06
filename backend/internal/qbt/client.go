package qbt

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"ant-torrent/backend/internal/apierr"
)

// LoginResult represents the result of a login attempt.
type LoginResult struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

// APIError 为跨下载器共享的业务错误类型（internal/apierr）的别名——
// api 层的错误渲染逻辑（writeQbtError）因此对 transmission 错误同样生效。
type APIError = apierr.APIError

// AsAPIError 从错误链中提取 *APIError。
func AsAPIError(err error) (*APIError, bool) { return apierr.As(err) }

// Client holds the session state for a single qBittorrent instance.
type Client struct {
	sid       string // SID value
	sidName   string // Cookie name (e.g. "SID" or "QBT_SID_38080")
	updatedAt time.Time
}

// HasValidSID returns true if the client has a non-empty SID.
func (c *Client) HasValidSID() bool {
	return c != nil && c.sid != ""
}

// SID returns the current session ID.
func (c *Client) SID() string {
	if c == nil {
		return ""
	}
	return c.sid
}

// SIDCookieName returns the cookie name for the SID.
func (c *Client) SIDCookieName() string {
	if c == nil || c.sidName == "" {
		return "SID"
	}
	return c.sidName
}

// ClientManager manages qBittorrent client sessions per server.
type ClientManager struct {
	clients map[string]*Client
	mu      sync.RWMutex
	http    *http.Client
}

// NewClientManager creates a new ClientManager.
func NewClientManager() *ClientManager {
	return &ClientManager{
		clients: make(map[string]*Client),
		http: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// Get returns the client for the given server ID, or nil if not found.
func (m *ClientManager) Get(serverID string) *Client {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.clients[serverID]
}

// setSID stores the SID for a server.
func (m *ClientManager) setSID(serverID, sidName, sid string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.clients[serverID] = &Client{
		sid:       sid,
		sidName:   sidName,
		updatedAt: time.Now(),
	}
}

// Remove clears the client session for a server.
func (m *ClientManager) Remove(serverID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.clients, serverID)
}

// Login authenticates with a qBittorrent instance and stores the SID.
func (m *ClientManager) Login(serverID, baseURL, username, password string) (*LoginResult, error) {
	loginURL := strings.TrimRight(baseURL, "/") + "/api/v2/auth/login"

	body := url.Values{
		"username": {username},
		"password": {password},
	}

	req, err := http.NewRequest(http.MethodPost, loginURL, strings.NewReader(body.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Referer", baseURL)

	resp, err := m.http.Do(req)
	if err != nil {
		return &LoginResult{
			Success: false,
			Message: fmt.Sprintf("无法连接到服务器: %v", err),
		}, nil
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	text := strings.TrimSpace(string(respBody))

	if resp.StatusCode == http.StatusForbidden {
		return &LoginResult{
			Success: false,
			Message: "IP 被封禁，登录失败次数过多",
		}, nil
	}

	// qBittorrent v5+: 204 No Content on success
	// qBittorrent v4.x: 200 + body "Ok." on success
	isSuccess := resp.StatusCode == http.StatusNoContent ||
		(resp.StatusCode == http.StatusOK && text == "Ok.")

	if isSuccess {
		// Extract SID from Set-Cookie
		// v5 uses "QBT_SID_{port}", v4 uses "SID"
		for _, cookie := range resp.Cookies() {
			if cookie.Name == "SID" || strings.HasPrefix(cookie.Name, "QBT_SID_") {
				m.setSID(serverID, cookie.Name, cookie.Value)
				return &LoginResult{Success: true}, nil
			}
		}
		return &LoginResult{
			Success: false,
			Message: "登录成功但未获取到 SID",
		}, nil
	}

	// "Fails." or other response
	return &LoginResult{
		Success: false,
		Message: "用户名或密码错误",
	}, nil
}

// DoRequest sends an HTTP request to a qBittorrent instance with the stored SID.
func (m *ClientManager) DoRequest(serverID string, req *http.Request) (*http.Response, error) {
	client := m.Get(serverID)
	if client.HasValidSID() {
		req.AddCookie(&http.Cookie{
			Name:  client.SIDCookieName(),
			Value: client.SID(),
		})
	}
	return m.http.Do(req)
}
