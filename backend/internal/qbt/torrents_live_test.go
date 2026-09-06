package qbt

import (
	"crypto/sha1"
	"encoding/hex"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

// TestLiveTorrents 对真实 qBittorrent 实测 AI 助手所需的种子方法。
// 通过环境变量开启（默认跳过，不污染 CI）：
//
//	QBT_LIVE_ADDR=http://127.0.0.1:38080 QBT_LIVE_USER=admin QBT_LIVE_PASS=admin123 \
//	  go test ./internal/qbt/ -run TestLiveTorrents -v
//
// 测试用自造 infohash 的磁力链接添加种子（不对应任何真实资源），结束后删除，
// 不影响服务器上既有种子。
//
// 注意：qB 5.2.3 实测 torrents/info 不支持 search 参数（被忽略），
// 名词过滤须在调用方按 name 过滤；filter/hashes/category 为服务端有效参数。
func TestLiveTorrents(t *testing.T) {
	addr := os.Getenv("QBT_LIVE_ADDR")
	if addr == "" {
		t.Skip("QBT_LIVE_ADDR 未设置，跳过 live 测试")
	}
	conn := Conn{
		BaseURL:  addr,
		Username: envOr("QBT_LIVE_USER", "admin"),
		Password: envOr("QBT_LIVE_PASS", "admin123"),
	}
	const serverID = "live-test"

	m := NewClientManager()
	if err := m.login(serverID, conn); err != nil {
		t.Fatalf("登录失败: %v", err)
	}

	// 自造磁力：infohash 为固定字符串的 sha1，确定可复现且不对应任何真实种子
	sum := sha1.Sum([]byte("ant-torrent-m1-live-test"))
	infoHash := hex.EncodeToString(sum[:])
	magnet := "magnet:?xt=urn:btih:" + infoHash + "&dn=ant-torrent-m1-test"

	// 无论成败，测试结束都删除测试种子（不删文件）
	t.Cleanup(func() {
		form := url.Values{"hashes": {infoHash}, "deleteFiles": {"false"}}
		_, _, _ = m.doRequest(serverID, conn, http.MethodPost, "torrents/delete", form)
	})

	// findByHash 返回测试种子（qB 的 search 参数无效，按 hash 在调用方过滤）。
	findByHash := func() (TorrentInfo, bool) {
		t.Helper()
		ts, err := m.GetTorrents(serverID, conn, nil)
		if err != nil {
			t.Fatalf("GetTorrents 失败: %v", err)
		}
		for _, tt := range ts {
			if tt.Hash == infoHash {
				return tt, true
			}
		}
		return TorrentInfo{}, false
	}

	// waitState 轮询测试种子直至状态满足 want（启停为异步生效，留 5s 余量）。
	waitState := func(want map[string]bool, desc string) string {
		t.Helper()
		deadline := time.Now().Add(5 * time.Second)
		var last string
		for time.Now().Before(deadline) {
			ts, ok := findByHash()
			if ok {
				last = ts.State
				if want[last] {
					return last
				}
			}
			time.Sleep(200 * time.Millisecond)
		}
		t.Fatalf("等待种子状态 %s 超时，最后状态 %q", desc, last)
		return ""
	}

	t.Run("list_all", func(t *testing.T) {
		ts, err := m.GetTorrents(serverID, conn, nil)
		if err != nil {
			t.Fatalf("GetTorrents 失败: %v", err)
		}
		if len(ts) == 0 {
			t.Log("服务器当前无种子（仅记录，不算失败）")
		}
		for _, tt := range ts {
			t.Logf("hash=%s state=%s progress=%.2f size=%d name=%.40s",
				tt.Hash[:8], tt.State, tt.Progress, tt.Size, tt.Name)
		}
	})

	t.Run("list_filter", func(t *testing.T) {
		// limit 与 hashes 均为服务端有效参数
		ts, err := m.GetTorrents(serverID, conn, url.Values{"limit": {"1"}})
		if err != nil {
			t.Fatalf("GetTorrents(limit) 失败: %v", err)
		}
		if len(ts) != 1 {
			t.Errorf("limit=1 应返回 1 条，got %d", len(ts))
		}
		all, err := m.GetTorrents(serverID, conn, nil)
		if err != nil || len(all) == 0 {
			t.Skipf("无种子可测 hashes 过滤 (err=%v, n=%d)", err, len(all))
		}
		byHash, err := m.GetTorrents(serverID, conn, url.Values{"hashes": {all[0].Hash}})
		if err != nil {
			t.Fatalf("GetTorrents(hashes) 失败: %v", err)
		}
		if len(byHash) != 1 || byHash[0].Hash != all[0].Hash {
			t.Errorf("hashes 过滤应精确命中 1 条，got %d", len(byHash))
		}
	})

	t.Run("properties", func(t *testing.T) {
		ts, err := m.GetTorrents(serverID, conn, nil)
		if err != nil || len(ts) == 0 {
			t.Skipf("无种子可查详情 (err=%v, n=%d)", err, len(ts))
		}
		props, err := m.GetTorrentProperties(serverID, conn, ts[0].Hash)
		if err != nil {
			t.Fatalf("GetTorrentProperties 失败: %v", err)
		}
		if _, ok := props["save_path"]; !ok {
			t.Errorf("properties 应包含 save_path，实际键: %v", keysOf(props))
		}
	})

	t.Run("add_paused", func(t *testing.T) {
		if err := m.AddTorrents(serverID, conn, magnet, "ai-test-cat", "aitest", "", true); err != nil {
			t.Fatalf("AddTorrents 失败: %v", err)
		}
		deadline := time.Now().Add(5 * time.Second)
		got, ok := findByHash()
		for !ok && time.Now().Before(deadline) {
			time.Sleep(200 * time.Millisecond)
			got, ok = findByHash()
		}
		if !ok {
			t.Fatal("添加后按 hash 找不到测试种子")
		}
		if got.Category != "ai-test-cat" {
			t.Errorf("category 未生效: %q", got.Category)
		}
		if !strings.Contains(got.Tags, "aitest") {
			t.Errorf("tags 未生效: %q", got.Tags)
		}
		if got.State != "stoppedDL" {
			t.Errorf("paused 添加应处于 stoppedDL，got %s", got.State)
		}
	})

	t.Run("resume_then_pause", func(t *testing.T) {
		if err := m.StartTorrents(serverID, conn, []string{infoHash}); err != nil {
			t.Fatalf("StartTorrents 失败: %v", err)
		}
		// 启动后应离开 stoppedDL（磁力多为 metaDL / stalledDL）
		state := waitState(map[string]bool{"metaDL": true, "stalledDL": true, "downloading": true}, "非停止")
		t.Logf("启动后状态: %s", state)

		if err := m.StopTorrents(serverID, conn, []string{infoHash}); err != nil {
			t.Fatalf("StopTorrents 失败: %v", err)
		}
		waitState(map[string]bool{"stoppedDL": true}, "停止")
	})

	t.Run("delete", func(t *testing.T) {
		form := url.Values{"hashes": {infoHash}, "deleteFiles": {"false"}}
		if _, _, err := m.doRequest(serverID, conn, http.MethodPost, "torrents/delete", form); err != nil {
			t.Fatalf("删除失败: %v", err)
		}
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			if _, ok := findByHash(); !ok {
				return
			}
			time.Sleep(200 * time.Millisecond)
		}
		t.Fatal("删除后仍能找到测试种子")
	})
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func keysOf(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
