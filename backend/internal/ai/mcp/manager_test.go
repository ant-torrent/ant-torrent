package mcp

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// newTestManager 构造注入内存传输的管理器：每次建连都新起一台带单个 echo 工具的服务器。
// 工具名/返回值通过闭包外的 toolName 变量控制（默认 "echo"）。
func newTestManager(t *testing.T) (*Manager, *string) {
	t.Helper()
	toolName := "echo_tool"
	m := NewManager()
	m.transportFactory = func(cfg ServerConfig, ms *managed) (mcp.Transport, error) {
		clientT, serverT := mcp.NewInMemoryTransports()
		server := mcp.NewServer(&mcp.Implementation{Name: "test-" + cfg.ID, Version: "0"}, nil)
		server.AddTool(&mcp.Tool{
			Name:        toolName,
			Description: "echo back",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{"text": map[string]any{"type": "string"}}},
		}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "echo: ok"}}}, nil
		})
		// 服务端会话须保活：由客户端侧 Close 结束
		sess, err := server.Connect(context.Background(), serverT, nil)
		if err != nil {
			return nil, err
		}
		go func() { _ = sess.Wait() }()
		return clientT, nil
	}
	return m, &toolName
}

func cfg(id string) ServerConfig {
	return ServerConfig{ID: id, Name: "Test Server!", Type: "stdio", Enabled: true, Command: "unused"}
}

func TestEnsureStartedAndCallTool(t *testing.T) {
	m, _ := newTestManager(t)
	ctx := context.Background()

	tools := m.EnsureStarted(ctx, []ServerConfig{cfg("s1")})
	if len(tools) != 1 {
		t.Fatalf("want 1 tool, got %d", len(tools))
	}
	want := "mcp_test_server_echo_tool"
	if tools[0].FullName != want {
		t.Fatalf("FullName = %q, want %q", tools[0].FullName, want)
	}
	if tools[0].InputSchema["type"] != "object" {
		t.Fatalf("normalized schema missing type=object: %v", tools[0].InputSchema)
	}

	// 状态应为 running 且带工具数
	st := m.StatusOf("s1", "Test Server!")
	if st.Status != StatusRunning || st.ToolCount != 1 {
		t.Fatalf("status = %+v", st)
	}

	// 通过服务器 ID + 原始工具名调用
	result, ok := m.CallTool(ctx, "s1", "echo_tool", map[string]any{"text": "hi"})
	if !ok || result != "echo: ok" {
		t.Fatalf("CallTool = (%q, %v)", result, ok)
	}
}

func TestStartFailureIsolation(t *testing.T) {
	m := NewManager()
	// 无注入：stdio 类型走 exec.Command，命令不存在 → 启动失败
	m.transportFactory = nil
	tools := m.EnsureStarted(context.Background(), []ServerConfig{{
		ID: "bad", Name: "nope", Type: "stdio", Enabled: true, Command: "/nonexistent/command-absent",
	}})
	if len(tools) != 0 {
		t.Fatalf("failed server should contribute no tools, got %d", len(tools))
	}
	st := m.StatusOf("bad", "nope")
	if st.Status != StatusError || st.Error == "" {
		t.Fatalf("expected error status with message, got %+v", st)
	}
}

func TestReconcileStopsDisabled(t *testing.T) {
	m, _ := newTestManager(t)
	ctx := context.Background()
	m.EnsureStarted(ctx, []ServerConfig{cfg("s1")})

	// 禁用后 Reconcile 应停止该服务器
	m.Reconcile([]ServerConfig{{ID: "s1", Name: "Test Server!", Type: "stdio", Enabled: false, Command: "x"}})
	st := m.StatusOf("s1", "x")
	if st.Status != StatusStopped {
		t.Fatalf("after disable, status = %q, want stopped", st.Status)
	}

	// 停止后调用应返回错误而非 panic
	if _, ok := m.CallTool(ctx, "s1", "echo_tool", nil); ok {
		t.Fatal("call on stopped server should fail")
	}
}

func TestConfigChangeRestarts(t *testing.T) {
	m, _ := newTestManager(t)
	ctx := context.Background()
	c1 := cfg("s1")
	m.EnsureStarted(ctx, []ServerConfig{c1})

	// 配置变更（hash 不同）：EnsureStarted 应重建条目并重新启动
	c2 := c1
	c2.Args = []string{"changed"}
	tools := m.EnsureStarted(ctx, []ServerConfig{c2})
	if len(tools) != 1 {
		t.Fatalf("want 1 tool after restart, got %d", len(tools))
	}
	st := m.StatusOf("s1", c2.Name)
	if st.Status != StatusRunning {
		t.Fatalf("status after restart = %q", st.Status)
	}
}

// nil 与空切片/空 map 的哈希必须一致：前端保存往返会把 args:[] 变成缺省，
// 不一致会误判"配置变更"而重启未修改的服务器。
func TestConfigHashNilVsEmpty(t *testing.T) {
	base := cfg("s1")
	withEmpty := base
	withEmpty.Args = []string{}
	withEmpty.Env = map[string]string{}
	withEmpty.Headers = map[string]string{}
	if configHash(base) != configHash(withEmpty) {
		t.Fatal("nil and empty container configs must hash identically")
	}
	// 内容变化仍要产生不同哈希
	changed := base
	changed.Args = []string{"x"}
	if configHash(base) == configHash(changed) {
		t.Fatal("changed args must alter hash")
	}
}

func TestSanitizeIdent(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Filesystem", "filesystem"},
		{"My Server 2!", "my_server_2"},
		{"  ---  ", "srv"},
		{"中文服务器", "srv"},
		{"a-very-long-server-name-exceeding-limit", "a_very_long_server_name"},
	}
	for _, c := range cases {
		if got := sanitizeIdent(c.in, "srv"); got != c.want {
			t.Errorf("sanitizeIdent(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestNormalizeSchema(t *testing.T) {
	// 非 map → 空 object
	if s := normalizeSchema("junk"); s["type"] != "object" {
		t.Fatalf("non-map schema: %v", s)
	}
	// 缺 type 的 map → 补 object
	s := normalizeSchema(map[string]any{"properties": map[string]any{}})
	if s["type"] != "object" || s["properties"] == nil {
		t.Fatalf("missing type schema: %v", s)
	}
}
