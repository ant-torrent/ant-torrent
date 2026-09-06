// Package agent 管理反向连接的 agent WebSocket 会话：
// 按 serverID 维护注册表，提供带超时的 RPC 调用与心跳保活。
package agent

import (
	"encoding/json"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"ant-torrent/backend/internal/protocol"

	"github.com/gorilla/websocket"
)

const (
	callTimeout = 10 * time.Second // RPC 响应超时
	pongWait    = 60 * time.Second // 读超时，超时视为掉线
	pingPeriod  = 30 * time.Second // 心跳间隔（须小于 pongWait）
	writeWait   = 10 * time.Second // 单次写超时
)

// Status 描述一台服务器 agent 的在线状态。
type Status struct {
	Online      bool
	Version     string
	AllowedDirs []string
}

// Conn 封装单个 agent 连接：写锁串行化帧写入，pending 按 id 配对挂起请求。
type Conn struct {
	serverID  string
	ws        *websocket.Conn
	writeMu   sync.Mutex
	pendingMu sync.Mutex
	pending   map[uint64]chan *protocol.AgentResponse
	status    Status
	closeOnce sync.Once
	closeCh   chan struct{}
}

// Manager 按 serverID 维护 agent 连接注册表。
type Manager struct {
	mu     sync.RWMutex
	conns  map[string]*Conn
	nextID atomic.Uint64
}

// NewManager 创建 agent 连接管理器。
func NewManager() *Manager {
	return &Manager{conns: make(map[string]*Conn)}
}

// Serve 接管一条已通过认证的 agent 连接：注册、处理消息直到断开。
// 同一 serverID 重复连接时踢掉旧连接。阻塞直至连接关闭。
func (m *Manager) Serve(serverID string, ws *websocket.Conn) {
	conn := &Conn{
		serverID: serverID,
		ws:       ws,
		pending:  make(map[uint64]chan *protocol.AgentResponse),
		status:   Status{Online: true},
		closeCh:  make(chan struct{}),
	}

	m.mu.Lock()
	if old := m.conns[serverID]; old != nil {
		log.Printf("[agent] serverID=%s 新连接替换旧连接", serverID)
		old.shutdown()
	}
	m.conns[serverID] = conn
	m.mu.Unlock()
	log.Printf("[agent] serverID=%s 已连接", serverID)

	defer m.unregister(serverID, conn)
	go conn.pingLoop()

	ws.SetReadLimit(1 << 20)
	_ = ws.SetReadDeadline(time.Now().Add(pongWait))
	ws.SetPongHandler(func(string) error {
		return ws.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		_, data, err := ws.ReadMessage()
		if err != nil {
			if !conn.isExpectedClose(err) {
				log.Printf("[agent] serverID=%s 读取失败: %v", serverID, err)
			}
			conn.shutdown()
			return
		}
		conn.handleMessage(data)
	}
}

// Remove 断开并移除服务器的 agent 连接（删除服务器 / 重置 token 时调用）。
func (m *Manager) Remove(serverID string) {
	m.mu.Lock()
	conn := m.conns[serverID]
	delete(m.conns, serverID)
	m.mu.Unlock()
	if conn != nil {
		conn.shutdown()
	}
}

// Status 返回服务器 agent 的在线状态与 hello 上报信息。
func (m *Manager) Status(serverID string) Status {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if conn := m.conns[serverID]; conn != nil {
		return conn.status
	}
	return Status{}
}

// Call 向 serverID 的 agent 发送 RPC 请求并等待响应（callTimeout 超时）。
func (m *Manager) Call(serverID, method string, params any) (json.RawMessage, *protocol.AgentError) {
	m.mu.RLock()
	conn := m.conns[serverID]
	m.mu.RUnlock()
	if conn == nil {
		return nil, &protocol.AgentError{Code: "agentOffline"}
	}
	return conn.call(m.nextID.Add(1), method, params)
}

// handleMessage 分发 agent 上行帧：hello 事件或按 id 配对的 RPC 响应。
func (c *Conn) handleMessage(data []byte) {
	var probe struct {
		ID    *uint64 `json:"id"`
		Event string  `json:"event"`
	}
	if err := json.Unmarshal(data, &probe); err != nil {
		return
	}
	if probe.Event == "hello" {
		var hello protocol.AgentHello
		if err := json.Unmarshal(data, &hello); err != nil {
			return
		}
		c.status = Status{Online: true, Version: hello.Data.Version, AllowedDirs: hello.Data.AllowedDirs}
		log.Printf("[agent] serverID=%s hello version=%s allowedDirs=%v", c.serverID, hello.Data.Version, hello.Data.AllowedDirs)
		return
	}
	if probe.ID == nil {
		return
	}
	var resp protocol.AgentResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return
	}
	c.pendingMu.Lock()
	ch, ok := c.pending[resp.ID]
	if ok {
		delete(c.pending, resp.ID)
	}
	c.pendingMu.Unlock()
	if ok {
		ch <- &resp
	}
}

// call 发送请求并等待响应。
func (c *Conn) call(id uint64, method string, params any) (json.RawMessage, *protocol.AgentError) {
	paramBytes, err := json.Marshal(params)
	if err != nil {
		return nil, &protocol.AgentError{Code: "agentInternal", Message: err.Error()}
	}
	ch := make(chan *protocol.AgentResponse, 1)
	c.pendingMu.Lock()
	c.pending[id] = ch
	c.pendingMu.Unlock()
	remove := func() {
		c.pendingMu.Lock()
		delete(c.pending, id)
		c.pendingMu.Unlock()
	}

	if err := c.writeJSON(protocol.AgentRequest{ID: id, Method: method, Params: paramBytes}); err != nil {
		remove()
		return nil, &protocol.AgentError{Code: "agentOffline", Message: err.Error()}
	}

	select {
	case resp := <-ch:
		if resp.OK {
			return resp.Result, nil
		}
		if resp.Error != nil {
			return nil, resp.Error
		}
		return nil, &protocol.AgentError{Code: "agentInternal"}
	case <-time.After(callTimeout):
		remove()
		return nil, &protocol.AgentError{Code: "agentTimeout"}
	case <-c.closeCh:
		remove()
		return nil, &protocol.AgentError{Code: "agentOffline"}
	}
}

// pingLoop 周期性 ping，写失败视为掉线并关闭连接。
func (c *Conn) pingLoop() {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			c.writeMu.Lock()
			_ = c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			err := c.ws.WriteMessage(websocket.PingMessage, nil)
			c.writeMu.Unlock()
			if err != nil {
				c.shutdown()
				return
			}
		case <-c.closeCh:
			return
		}
	}
}

// writeJSON 串行写一帧 JSON。
func (c *Conn) writeJSON(v any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = c.ws.SetWriteDeadline(time.Now().Add(writeWait))
	return c.ws.WriteJSON(v)
}

// shutdown 关闭连接并唤醒所有挂起请求（幂等）。
func (c *Conn) shutdown() {
	c.closeOnce.Do(func() {
		close(c.closeCh)
		_ = c.ws.Close()
	})
}

// unregister 仅当注册表中的连接仍是自己时才移除，避免误删新连接。
func (m *Manager) unregister(serverID string, conn *Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.conns[serverID] == conn {
		delete(m.conns, serverID)
	}
	log.Printf("[agent] serverID=%s 已断开", serverID)
}

// isExpectedClose 判断读取错误是否属于正常关闭（EOF / 关闭帧）。
func (c *Conn) isExpectedClose(err error) bool {
	return websocket.IsCloseError(err,
		websocket.CloseNormalClosure,
		websocket.CloseGoingAway,
		websocket.CloseNoStatusReceived,
		websocket.CloseAbnormalClosure,
	) || err.Error() == "EOF"
}
