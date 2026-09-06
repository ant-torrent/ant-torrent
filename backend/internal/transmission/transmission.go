// Package transmission 实现 Transmission(>= 4.1.0)下载器的 RPC 客户端。
// 4.1.0 起协议为 JSON-RPC 2.0（params 必须为 Object，全 snake_case），
// 端点默认 {base}/transmission/rpc，认证用 HTTP Basic，
// CSRF 经 X-Transmission-Session-Id 409 握手（正常控制流，非错误）。
package transmission

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"ant-torrent/backend/internal/apierr"
)

// rpcID 为 JSON-RPC 请求的自增 id。
var rpcID atomic.Int64

// Conn 描述一台 Transmission 服务器的连接信息（与 qbt.Conn 平行，避免跨包依赖）。
type Conn struct {
	BaseURL  string
	Username string
	Password string
}

// client 缓存单台服务器的会话状态。
// mu 串行化该服务器的全部 RPC（含 409 握手重发），消除轮询与操作并发的握手竞态。
type client struct {
	mu        sync.Mutex
	sessionID string
}

// Manager 按服务器 ID 管理 RPC 客户端会话。
type Manager struct {
	mu      sync.Mutex
	clients map[string]*client
	http    *http.Client
}

// NewManager 创建 Transmission RPC 管理器。
func NewManager() *Manager {
	return &Manager{
		clients: make(map[string]*client),
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

// Remove 清除服务器的会话缓存（删除服务器/修改配置时调用）。
func (m *Manager) Remove(serverID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.clients, serverID)
}

func (m *Manager) getClient(serverID string) *client {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.clients[serverID]
	if !ok {
		c = &client{}
		m.clients[serverID] = c
	}
	return c
}

// trRPCURL 由服务器 base URL 推导 RPC 端点：
// 去尾斜杠；路径已以 /rpc 结尾则原样使用（兼容反代子路径），否则追加 /transmission/rpc。
func trRPCURL(base string) string {
	base = strings.TrimRight(base, "/")
	if strings.HasSuffix(strings.ToLower(base), "/rpc") {
		return base
	}
	return base + "/transmission/rpc"
}

// rpcRequest 为 JSON-RPC 2.0 请求。params 必须为 Object（Transmission 不支持按位置传参）。
type rpcRequest struct {
	JSONRPC string         `json:"jsonrpc"`
	ID      int            `json:"id"`
	Method  string         `json:"method"`
	Params  map[string]any `json:"params,omitempty"`
}

// rpcError 为 JSON-RPC 2.0 错误对象。
type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// rpcResponse 为 JSON-RPC 2.0 响应包络：成功时数据在 Result，失败时 Error 非 nil。
type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	Result  json.RawMessage `json:"result"`
	Error   *rpcError       `json:"error"`
	ID      json.RawMessage `json:"id"`
}

// call 发送一次 RPC 调用。409 → 握手取新 session id 并原样重发一次（锁内整体串行化）。
// 上游 401（Basic 认证失败）翻译为 502——401 是 AntTorrent 自身会话失效的专属语义，
// 透传会导致前端误登出（与 qbt 包「登录失败→502」约定一致）。
func (m *Manager) call(serverID string, conn Conn, method string, params map[string]any, out any) error {
	c := m.getClient(serverID)
	c.mu.Lock()
	defer c.mu.Unlock()

	body, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		ID:      int(rpcID.Add(1)),
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return apierr.New(500, "trError", err.Error())
	}

	do := func() (*http.Response, error) {
		req, err := http.NewRequest(http.MethodPost, trRPCURL(conn.BaseURL), bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		if c.sessionID != "" {
			req.Header.Set("X-Transmission-Session-Id", c.sessionID)
		}
		if conn.Username != "" || conn.Password != "" {
			req.SetBasicAuth(conn.Username, conn.Password)
		}
		return m.http.Do(req)
	}

	resp, err := do()
	if err != nil {
		return apierr.New(http.StatusBadGateway, "trUnreachable", err.Error())
	}
	defer resp.Body.Close()

	// 409 是正常控制流：响应头携带有效 session id，更新后原样重发一次
	if resp.StatusCode == http.StatusConflict {
		resp.Body.Close()
		c.sessionID = resp.Header.Get("X-Transmission-Session-Id")
		resp, err = do()
		if err != nil {
			return apierr.New(http.StatusBadGateway, "trUnreachable", err.Error())
		}
		defer resp.Body.Close()
	}

	if resp.StatusCode == http.StatusUnauthorized {
		return apierr.New(http.StatusBadGateway, "trAuthFailed")
	}
	if resp.StatusCode != http.StatusOK {
		return apierr.New(http.StatusBadGateway, "trUnreachable", fmt.Sprintf("HTTP %d", resp.StatusCode))
	}

	var envelope rpcResponse
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return apierr.New(http.StatusBadGateway, "trParseError")
	}
	if envelope.Error != nil {
		return apierr.New(http.StatusBadGateway, "trError", envelope.Error.Message)
	}
	if out != nil && len(envelope.Result) > 0 {
		if err := json.Unmarshal(envelope.Result, out); err != nil {
			return apierr.New(http.StatusBadGateway, "trParseError")
		}
	}
	return nil
}
