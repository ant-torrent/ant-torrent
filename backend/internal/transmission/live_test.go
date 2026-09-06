// 对真实 Transmission 实例的集成验证（只读 + 自清理的添加/删除闭环）。
// 设置 TR_LIVE_ADDR（如 http://localhost:9091）启用，未设置则跳过；
// 可选 TR_LIVE_USER / TR_LIVE_PASS。要求本地实例为空或可安全添加测试种子：
// 测试添加的磁力以 paused=true 添加（不产生下载流量），结束后必删。
package transmission

import (
	"os"
	"testing"
	"time"
)

func liveConn(t *testing.T) Conn {
	t.Helper()
	addr := os.Getenv("TR_LIVE_ADDR")
	if addr == "" {
		t.Skip("未设置 TR_LIVE_ADDR，跳过 live 验证")
	}
	return Conn{
		BaseURL:  addr,
		Username: os.Getenv("TR_LIVE_USER"),
		Password: os.Getenv("TR_LIVE_PASS"),
	}
}

func TestLiveSession(t *testing.T) {
	conn := liveConn(t)
	m := NewManager()
	session, err := m.GetSession("live", conn)
	if err != nil {
		t.Fatalf("session_get 失败: %v", err)
	}
	t.Logf("version=%v rpc=%v download_dir=%v",
		session["version"], session["rpc_version_semver"], session["download_dir"])
	if session["version"] == nil {
		t.Error("version 不应缺失")
	}
}

func TestLiveSessionStats(t *testing.T) {
	conn := liveConn(t)
	m := NewManager()
	stats, err := m.GetSessionStats("live", conn)
	if err != nil {
		t.Fatalf("session_stats 失败: %v", err)
	}
	if _, ok := stats["torrent_count"]; !ok {
		t.Errorf("torrent_count 缺失: %v", stats)
	}
}

func TestLiveGetTorrents(t *testing.T) {
	conn := liveConn(t)
	m := NewManager()
	rows, err := m.GetTorrents("live", conn)
	if err != nil {
		t.Fatalf("torrent_get 失败: %v", err)
	}
	t.Logf("种子数: %d", len(rows))
	for _, row := range rows {
		if hashOf(row) == "" {
			t.Errorf("存在无 hash_string 的行: %v", row["name"])
		}
	}
}

func TestLiveFreeSpace(t *testing.T) {
	conn := liveConn(t)
	m := NewManager()
	session, err := m.GetSession("live", conn)
	if err != nil {
		t.Fatal(err)
	}
	dir, _ := session["download_dir"].(string)
	if dir == "" {
		t.Skip("download_dir 为空，跳过")
	}
	size, err := m.FreeSpace("live", conn, dir)
	if err != nil {
		t.Fatalf("free_space 失败: %v", err)
	}
	t.Logf("%s 剩余 %d 字节", dir, size)
	if size < 0 {
		t.Error("剩余空间不应为负")
	}
}

// TestLiveAddRemoveCycle 添加→查询→删除闭环（paused 添加、无数据落盘、结束必删）。
func TestLiveAddRemoveCycle(t *testing.T) {
	conn := liveConn(t)
	m := NewManager()

	// 公开测试磁力（Ubuntu 22.04）；paused=true 不产生下载流量。
	// hash_string 即磁力 infohash，作为确定性查找键。
	const (
		magnet    = "magnet:?xt=urn:btih:c9e15763f722f23e98a29decdfae341b98d53056&dn=ubuntu-22.04.4-desktop-amd64.iso"
		testHash  = "c9e15763f722f23e98a29decdfae341b98d53056"
		testLabel = "anttorrent-test"
	)

	// 自清理：上轮失败可能遗留测试种子，先移除并等待消失
	if rows, err := m.GetTorrents("live", conn); err == nil {
		for _, row := range rows {
			if hashOf(row) == testHash {
				t.Log("清理上轮遗留的测试种子")
				if err := m.RemoveTorrents("live", conn, []string{testHash}, false); err != nil {
					t.Fatal(err)
				}
				waitGone(t, m, conn, testHash)
			}
		}
	}

	duplicate, _, err := m.AddTorrents("live", conn, []string{magnet}, nil,
		AddOptions{Labels: []string{testLabel}, Paused: true})
	if err != nil {
		t.Fatalf("添加失败: %v", err)
	}
	t.Logf("duplicate=%v", duplicate)

	rows, err := m.GetTorrents("live", conn)
	if err != nil {
		t.Fatal(err)
	}
	var hash string
	for _, row := range rows {
		if hashOf(row) == testHash {
			hash = testHash
		}
	}
	if hash == "" {
		t.Fatal("添加后的种子未出现在列表中")
	}

	// 标签 set 覆盖验证
	if err := m.SetLabels("live", conn, []string{hash}, []string{testLabel + "-2"}, "set"); err != nil {
		t.Errorf("SetLabels 失败: %v", err)
	}

	// 限速验证（2 MiB/s）
	dl := int64(2 * 1024 * 1024)
	if err := m.SetSpeedLimits("live", conn, []string{hash}, &dl, nil); err != nil {
		t.Errorf("SetSpeedLimits 失败: %v", err)
	}

	// 队列移动验证（接口可用性；停止种子返回成功）
	if err := m.QueueMove("live", conn, []string{hash}, "top"); err != nil {
		t.Errorf("QueueMove 失败: %v", err)
	}

	// 闭环：删除（不删数据——paused 磁力本无数据）。删除异步生效，轮询确认。
	if err := m.RemoveTorrents("live", conn, []string{hash}, false); err != nil {
		t.Fatalf("删除失败: %v", err)
	}
	waitGone(t, m, conn, hash)
}

// waitGone 轮询直到指定 hash 的种子消失（删除异步生效）。
func waitGone(t *testing.T, m *Manager, conn Conn, hash string) {
	t.Helper()
	for i := 0; i < 15; i++ {
		rows, err := m.GetTorrents("live", conn)
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, row := range rows {
			if hashOf(row) == hash {
				found = true
			}
		}
		if !found {
			return
		}
		t.Logf("第 %d 次轮询：删除尚未生效，等待重试", i+1)
		sleepMs(t, 300)
	}
	t.Fatalf("删除后 4.5s 种子 %s 仍存在", hash)
}

func sleepMs(t *testing.T, ms int) {
	t.Helper()
	time.Sleep(time.Duration(ms) * time.Millisecond)
}
