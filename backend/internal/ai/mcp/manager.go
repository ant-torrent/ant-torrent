// Package mcp 管理外部 MCP 服务器的客户端生命周期（基于官方 go-sdk）：
// 懒启动、配置变更重启、工具缓存与错误隔离。独立成包避免与 internal/ai 循环依赖，
// 因此自有 ServerConfig（由 ai 层从 MCPServerConfig 转换）。
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// ServerConfig 为一台 MCP 服务器的启动配置（与 ai.MCPServerConfig 同形）。
type ServerConfig struct {
	ID      string
	Name    string
	Type    string // "stdio" | "http"
	Enabled bool
	Command string
	Args    []string
	Env     map[string]string
	URL     string
	Headers map[string]string
}

// ToolInfo 为并入聊天工具表的 MCP 工具（FullName 形如 mcp_{服务器}_{工具}）。
type ToolInfo struct {
	ServerID    string
	ServerName  string
	ToolName    string // 服务器上的原始工具名
	FullName    string // 注册给大模型的名字
	Description string
	InputSchema map[string]any
}

// ServerStatus 为设置页状态徽标所需的快照。
type ServerStatus struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Status    string `json:"status"` // running | stopped | error
	ToolCount int    `json:"toolCount"`
	Error     string `json:"error,omitempty"`
}

// 状态常量。
const (
	StatusRunning = "running"
	StatusStopped = "stopped"
	StatusError   = "error"
)

const (
	// startTimeout 覆盖 initialize + tools/list（npx 冷启动可达十几秒）。
	startTimeout = 30 * time.Second
	// callTimeout 为单次工具调用上限。
	callTimeout = 60 * time.Second
	// stderrLimit 为子进程 stderr 环形缓冲容量。
	stderrLimit = 8 * 1024
)

// managed 为单台服务器的托管对象：会话、工具缓存与状态。
type managed struct {
	cfg ServerConfig
	// hash 为配置指纹，Reconcile/EnsureStarted 据此判断是否需要重启。
	hash string

	startMu sync.Mutex // 串行化 start/shutdown（可长达 30s，不与 ms.mu 混用）
	mu      sync.Mutex // 保护以下字段
	sess    *mcp.ClientSession
	tools   []ToolInfo
	status  string
	errText string

	cmd    *exec.Cmd   // stdio：用于进程组兜底清理
	stderr *ringBuffer // stdio：子进程诊断输出
}

// Manager 为全部 MCP 服务器的注册表与会话池。
type Manager struct {
	mu      sync.Mutex
	servers map[string]*managed // 按 ID
	client  *mcp.Client         // 共享的客户端身份（每个会话独立连接）

	// transportFactory 为测试注入点（默认按配置类型构造 stdio/http 传输）。
	transportFactory func(cfg ServerConfig, ms *managed) (mcp.Transport, error)
}

// NewManager 构造管理器（不启动任何进程，懒启动）。
func NewManager() *Manager {
	return &Manager{
		servers: map[string]*managed{},
		client:  mcp.NewClient(&mcp.Implementation{Name: "ant-torrent", Version: "0.1.0"}, nil),
	}
}

// Reconcile 按新配置对齐：停掉被删除、禁用或配置变更的服务器；不启动任何进程。
func (m *Manager) Reconcile(cfgs []ServerConfig) {
	want := make(map[string]ServerConfig, len(cfgs))
	for _, c := range cfgs {
		want[c.ID] = c
	}

	m.mu.Lock()
	var stale []*managed
	for id, ms := range m.servers {
		c, ok := want[id]
		if !ok || !c.Enabled || configHash(c) != ms.hash {
			delete(m.servers, id)
			stale = append(stale, ms)
		}
	}
	m.mu.Unlock()

	for _, ms := range stale {
		ms.shutdown()
	}
}

// EnsureStarted 启动所有启用且未运行的服务器（并行、错误隔离），返回可并入工具表的工具。
// 已是 error 状态的会重试一次启动（每次聊天至多一次，防崩溃循环）。
func (m *Manager) EnsureStarted(ctx context.Context, cfgs []ServerConfig) []ToolInfo {
	m.mu.Lock()
	var starting []*managed
	for _, c := range cfgs {
		if !c.Enabled {
			continue
		}
		h := configHash(c)
		ms, ok := m.servers[c.ID]
		if ok && ms.hash != h {
			// 配置已变：摘除旧条目并异步停止
			delete(m.servers, c.ID)
			go ms.shutdown()
			ok = false
		}
		if !ok {
			ms = &managed{cfg: c, hash: h, status: StatusStopped, stderr: newRing(stderrLimit)}
			m.servers[c.ID] = ms
		}
		ms.mu.Lock()
		st := ms.status
		ms.mu.Unlock()
		if st != StatusRunning {
			starting = append(starting, ms)
		}
	}
	m.mu.Unlock()

	if len(starting) > 0 {
		var wg sync.WaitGroup
		for _, ms := range starting {
			wg.Add(1)
			go func(ms *managed) {
				defer wg.Done()
				_ = m.start(ctx, ms)
			}(ms)
		}
		wg.Wait()
	}

	// 汇总运行中服务器的工具（保持配置顺序）
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []ToolInfo
	for _, c := range cfgs {
		if !c.Enabled {
			continue
		}
		if ms, ok := m.servers[c.ID]; ok {
			ms.mu.Lock()
			running := ms.status == StatusRunning
			ms.mu.Unlock()
			if running {
				out = append(out, ms.tools...)
			}
		}
	}
	return out
}

// CallTool 在指定服务器上执行原始工具名。会话不在运行态或调用失败时返回错误 JSON。
func (m *Manager) CallTool(ctx context.Context, serverID, toolName string, args map[string]any) (string, bool) {
	m.mu.Lock()
	ms := m.servers[serverID]
	m.mu.Unlock()
	if ms == nil {
		return errJSON("mcp server is not running"), false
	}
	ms.mu.Lock()
	sess, status := ms.sess, ms.status
	ms.mu.Unlock()
	if status != StatusRunning || sess == nil {
		return errJSON("mcp server is not running"), false
	}

	cctx, cancel := context.WithTimeout(ctx, callTimeout)
	defer cancel()
	res, err := sess.CallTool(cctx, &mcp.CallToolParams{Name: toolName, Arguments: args})
	if err != nil {
		// 传输层错误视为会话已死：标记 error，下次聊天重启；本次调用直接失败
		ms.markDead(sess, fmt.Sprintf("call %s failed: %v", toolName, err))
		return errJSON(err.Error()), false
	}
	text := contentText(res)
	if res.IsError {
		return text, false
	}
	return text, true
}

// Statuses 返回所有已托管服务器的状态快照（从未启动的不在其中，由调用方按 stopped 补齐）。
func (m *Manager) Statuses() []ServerStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]ServerStatus, 0, len(m.servers))
	for _, ms := range m.servers {
		ms.mu.Lock()
		st := ServerStatus{
			ID:        ms.cfg.ID,
			Name:      ms.cfg.Name,
			Status:    ms.status,
			ToolCount: len(ms.tools),
			Error:     ms.errText,
		}
		ms.mu.Unlock()
		out = append(out, st)
	}
	return out
}

// StatusOf 查询单台服务器状态；未托管时返回 stopped。
func (m *Manager) StatusOf(id, name string) ServerStatus {
	m.mu.Lock()
	ms := m.servers[id]
	m.mu.Unlock()
	if ms == nil {
		return ServerStatus{ID: id, Name: name, Status: StatusStopped}
	}
	ms.mu.Lock()
	defer ms.mu.Unlock()
	return ServerStatus{
		ID:        id,
		Name:      ms.cfg.Name,
		Status:    ms.status,
		ToolCount: len(ms.tools),
		Error:     ms.errText,
	}
}

// Test 用给定配置（通常是设置页草稿）临时建连：initialize + tools/list 后即关闭，
// 不影响托管状态。返回工具数与名称列表。
func (m *Manager) Test(ctx context.Context, cfg ServerConfig) (int, []string, error) {
	ctx, cancel := context.WithTimeout(ctx, startTimeout)
	defer cancel()

	ms := &managed{cfg: cfg, stderr: newRing(stderrLimit)}
	sess, err := m.connect(ctx, ms)
	if err != nil {
		return 0, nil, err
	}
	defer func() {
		_ = sess.Close()
		ms.killGroup()
	}()

	res, err := sess.ListTools(ctx, nil)
	if err != nil {
		return 0, nil, fmt.Errorf("%v%s", err, ms.stderrTail())
	}
	names := make([]string, 0, len(res.Tools))
	for _, t := range res.Tools {
		names = append(names, t.Name)
	}
	return len(names), names, nil
}

// --- 单台服务器的生命周期 ---

// start 建连并缓存工具表；并行调用由 startMu 串行化。
func (m *Manager) start(ctx context.Context, ms *managed) error {
	ms.startMu.Lock()
	defer ms.startMu.Unlock()

	ms.mu.Lock()
	if ms.status == StatusRunning {
		ms.mu.Unlock()
		return nil
	}
	ms.mu.Unlock()

	sess, err := m.connect(ctx, ms)
	if err != nil {
		ms.mu.Lock()
		ms.status = StatusError
		ms.errText = err.Error()
		ms.mu.Unlock()
		return err
	}
	res, err := sess.ListTools(ctx, nil)
	if err != nil {
		_ = sess.Close()
		ms.killGroup()
		ms.mu.Lock()
		ms.status = StatusError
		ms.errText = fmt.Sprintf("list tools failed: %v%s", err, ms.stderrTail())
		ms.mu.Unlock()
		return err
	}

	ms.mu.Lock()
	ms.sess = sess
	ms.tools = buildToolInfos(ms.cfg, res.Tools)
	ms.status = StatusRunning
	ms.errText = ""
	ms.mu.Unlock()

	go ms.watch(sess)
	return nil
}

// shutdown 主动停止：关闭会话（stdio 会先关 stdin 等退出再升级信号）并清理进程组。
func (ms *managed) shutdown() {
	ms.startMu.Lock()
	defer ms.startMu.Unlock()

	ms.mu.Lock()
	sess := ms.sess
	ms.sess = nil
	ms.tools = nil
	ms.status = StatusStopped
	ms.errText = ""
	ms.mu.Unlock()

	if sess != nil {
		_ = sess.Close()
	}
	ms.killGroup()
}

// connect 按配置类型建立传输并完成 MCP 握手。
func (m *Manager) connect(ctx context.Context, ms *managed) (*mcp.ClientSession, error) {
	var transport mcp.Transport
	if m.transportFactory != nil {
		t, err := m.transportFactory(ms.cfg, ms)
		if err != nil {
			return nil, err
		}
		transport = t
	} else {
		switch ms.cfg.Type {
		case "stdio":
			cmd := exec.Command(ms.cfg.Command, ms.cfg.Args...)
			cmd.Env = append(os.Environ(), ms.envSlice()...)
			cmd.Stderr = ms.stderr // stdout/stdin 由 SDK 接管
			cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
			ms.cmd = cmd
			transport = &mcp.CommandTransport{Command: cmd}
		case "http":
			transport = &mcp.StreamableClientTransport{
				Endpoint:   ms.cfg.URL,
				HTTPClient: &http.Client{Transport: withHeaders(ms.cfg.Headers)},
			}
		default:
			return nil, fmt.Errorf("unknown mcp server type: %s", ms.cfg.Type)
		}
	}

	sess, err := m.client.Connect(ctx, transport, nil)
	if err != nil {
		ms.killGroup()
		return nil, fmt.Errorf("connect %s failed: %v%s", ms.cfg.Endpoint(), err, ms.stderrTail())
	}
	return sess, nil
}

// Endpoint 返回错误信息里可读的连接目标。
func (c ServerConfig) Endpoint() string {
	if c.Type == "stdio" {
		return c.Command
	}
	return c.URL
}

// watch 监视会话存活：意外断开（进程退出/网络中断）时标记 error 供状态页展示，
// 下次聊天 EnsureStarted 会重试。主动关闭时 ms.sess 已被置空，直接返回。
func (ms *managed) watch(sess *mcp.ClientSession) {
	err := sess.Wait()
	ms.mu.Lock()
	defer ms.mu.Unlock()
	if ms.sess != sess {
		return
	}
	ms.sess = nil
	ms.tools = nil
	ms.status = StatusError
	ms.errText = fmt.Sprintf("connection lost: %v%s", err, ms.stderrTail())
}

// markDead 在调用侧发现会话不可用时标记 error（仅当该会话仍是当前会话）。
func (ms *managed) markDead(sess *mcp.ClientSession, msg string) {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	if ms.sess != sess {
		return
	}
	ms.sess = nil
	ms.tools = nil
	ms.status = StatusError
	ms.errText = msg
}

// killGroup 兜底清理 stdio 进程组（npx 会派生子进程，仅杀直接子进程可能留孤儿）。
func (ms *managed) killGroup() {
	cmd := ms.cmd
	if cmd == nil || cmd.Process == nil {
		return
	}
	// 负 PID = 整个进程组；进程已退出时返回 ESRCH，忽略即可
	_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
}

func (ms *managed) envSlice() []string {
	out := make([]string, 0, len(ms.cfg.Env))
	for k, v := range ms.cfg.Env {
		out = append(out, k+"="+v)
	}
	return out
}

// stderrTail 返回 stderr 尾部片段（带前缀，供错误信息诊断"npx 还在下载"等）。
func (ms *managed) stderrTail() string {
	if ms.stderr == nil {
		return ""
	}
	s := ms.stderr.String()
	if len(s) > 400 {
		s = s[len(s)-400:]
	}
	if s == "" {
		return ""
	}
	return "\nstderr: " + s
}

// --- 工具表构造 ---

func buildToolInfos(cfg ServerConfig, tools []*mcp.Tool) []ToolInfo {
	prefix := sanitizeIdent(cfg.Name, "srv")
	out := make([]ToolInfo, 0, len(tools))
	for _, t := range tools {
		out = append(out, ToolInfo{
			ServerID:    cfg.ID,
			ServerName:  cfg.Name,
			ToolName:    t.Name,
			FullName:    "mcp_" + prefix + "_" + sanitizeIdent(t.Name, "tool"),
			Description: t.Description,
			InputSchema: normalizeSchema(t.InputSchema),
		})
	}
	return out
}

// normalizeSchema 把服务器给的 inputSchema 归一为 JSON Schema object（缺 type 时补上）。
func normalizeSchema(schema any) map[string]any {
	m, ok := schema.(map[string]any)
	if !ok {
		return map[string]any{"type": "object", "properties": map[string]any{}}
	}
	out := make(map[string]any, len(m)+1)
	for k, v := range m {
		out[k] = v
	}
	if t, ok := out["type"].(string); !ok || t != "object" {
		out["type"] = "object"
	}
	return out
}

// sanitizeIdent 清洗为 [a-z0-9_] 标识符（工具名前缀与工具名共用），空则用 fallback。
func sanitizeIdent(s, fallback string) string {
	var b strings.Builder
	lastUnderscore := true // 开头的分隔符直接吞掉
	for _, r := range strings.ToLower(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastUnderscore = false
		default:
			if !lastUnderscore {
				b.WriteByte('_')
				lastUnderscore = true
			}
		}
	}
	out := strings.Trim(b.String(), "_")
	if len(out) > 24 {
		out = strings.Trim(out[:24], "_")
	}
	if out == "" {
		return fallback
	}
	return out
}

// configHash 为配置指纹：任一字段变更即视为需要重启。
// nil 与空切片/空 map 视为相同：前端往返会把 args:[] 变成缺省（nil），
// 不归一化会导致未修改的服务器被误判变更而重启。
func configHash(c ServerConfig) string {
	n := c
	if n.Args == nil {
		n.Args = []string{}
	}
	if n.Env == nil {
		n.Env = map[string]string{}
	}
	if n.Headers == nil {
		n.Headers = map[string]string{}
	}
	b, err := json.Marshal(n)
	if err != nil {
		return "unhashable"
	}
	h := fnv.New64a()
	_, _ = h.Write(b)
	return fmt.Sprintf("%x", h.Sum64())
}

// --- 辅助 ---

// withHeaders 构造透传自定义头（Authorization 等）的 RoundTripper。
func withHeaders(headers map[string]string) http.RoundTripper {
	base := http.DefaultTransport
	if len(headers) == 0 {
		return base
	}
	return headerRT{base: base, headers: headers}
}

type headerRT struct {
	base    http.RoundTripper
	headers map[string]string
}

func (rt headerRT) RoundTrip(req *http.Request) (*http.Response, error) {
	// 克隆请求避免污染复用的连接池请求
	clone := req.Clone(req.Context())
	for k, v := range rt.headers {
		clone.Header.Set(k, v)
	}
	return rt.base.RoundTrip(clone)
}

// contentText 把工具结果内容折叠为文本（拼接 text 内容；无文本时序列化结构化输出）。
func contentText(res *mcp.CallToolResult) string {
	var sb strings.Builder
	for _, c := range res.Content {
		if tc, ok := c.(*mcp.TextContent); ok && tc.Text != "" {
			if sb.Len() > 0 {
				sb.WriteByte('\n')
			}
			sb.WriteString(tc.Text)
		}
	}
	if sb.Len() > 0 {
		return sb.String()
	}
	if res.StructuredContent != nil {
		if b, err := json.Marshal(res.StructuredContent); err == nil {
			return string(b)
		}
	}
	return "{}"
}

func errJSON(msg string) string {
	b, _ := json.Marshal(map[string]string{"error": msg})
	return string(b)
}

// ringBuffer 为定长字节环形缓冲（记子进程 stderr）。
type ringBuffer struct {
	mu  sync.Mutex
	buf []byte
}

func newRing(n int) *ringBuffer { return &ringBuffer{buf: make([]byte, 0, n)} }

func (r *ringBuffer) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.buf = append(r.buf, p...)
	if len(r.buf) > cap(r.buf) {
		r.buf = r.buf[len(r.buf)-cap(r.buf):]
	}
	return len(p), nil
}

func (r *ringBuffer) String() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return string(r.buf)
}
