package transmission

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetTorrentsSendsFieldsWhitelist(t *testing.T) {
	f := newFakeRPC()
	f.methodBodies["torrent_get"] = map[string]any{
		"torrents": []map[string]any{
			{"hash_string": "a1", "name": "t1", "status": float64(4), "percent_done": 0.5},
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	rows, err := m.GetTorrents("s1", Conn{BaseURL: srv.URL})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0]["name"] != "t1" {
		t.Fatalf("返回行不符: %v", rows)
	}
	params := f.lastParams["torrent_get"]
	fields, ok := params["fields"].([]any)
	if !ok || len(fields) == 0 {
		t.Fatal("fields 必填且为数组")
	}
	for _, want := range []string{"hash_string", "name", "status", "percent_done", "labels"} {
		found := false
		for _, f := range fields {
			if f == want {
				found = true
			}
		}
		if !found {
			t.Errorf("fields 缺少 %q: %v", want, fields)
		}
	}
}

func TestAddTorrentsDuplicateDetection(t *testing.T) {
	f := newFakeRPC()
	f.methodBodies["torrent_add"] = map[string]any{
		"torrent_duplicate": map[string]any{"id": 1, "hash_string": "a1"},
	}
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	dup, _, err := m.AddTorrents("s1", Conn{BaseURL: srv.URL},
		[]string{"magnet:?xt=urn:btih:a1"}, nil, AddOptions{Labels: []string{"x"}})
	if err != nil {
		t.Fatal(err)
	}
	if !dup {
		t.Error("torrent_duplicate 应返回 duplicate=true")
	}
	params := f.lastParams["torrent_add"]
	if params["filename"] != "magnet:?xt=urn:btih:a1" {
		t.Errorf("url 应映射为 filename: %v", params)
	}
	if params["labels"] == nil {
		t.Errorf("labels 应下发: %v", params)
	}
}

func TestAddTorrentsFileAsBase64Metainfo(t *testing.T) {
	f := newFakeRPC()
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	if _, _, err := m.AddTorrents("s1", Conn{BaseURL: srv.URL}, nil, [][]byte{[]byte("torrent-bytes")}, AddOptions{Paused: true}); err != nil {
		t.Fatal(err)
	}
	params := f.lastParams["torrent_add"]
	if params["metainfo"] != base64.StdEncoding.EncodeToString([]byte("torrent-bytes")) {
		t.Errorf("文件应 base64 为 metainfo: %v", params["metainfo"])
	}
	if params["paused"] != true {
		t.Errorf("paused 应下发: %v", params)
	}
}

func TestAddTorrentsPostAddSettings(t *testing.T) {
	f := newFakeRPC()
	f.methodBodies["torrent_add"] = map[string]any{
		"torrent_added": map[string]any{"id": 1, "hash_string": "a1"},
	}
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	dl := int64(1024) // 1 KiB/s
	up := int64(2048)
	ratio := float64(2.5)
	_, _, err := m.AddTorrents("s1", Conn{BaseURL: srv.URL},
		[]string{"magnet:?xt=urn:btih:a1"}, nil, AddOptions{
			DlBps: &dl, UpBps: &up, RatioLimit: &ratio, Sequential: true,
		})
	if err != nil {
		t.Fatal(err)
	}

	// torrent_add 不带这些参数：限速一次 torrent-set，分享率 + 顺序下载合并一次
	sets := f.callsOf("torrent_set")
	if len(sets) != 2 {
		t.Fatalf("应恰好 2 次 torrent-set（限速 + 分享率/顺序下载），got %d", len(sets))
	}
	speed, merged := sets[0], sets[1]
	if speed["download_limit"] != float64(1) || speed["upload_limit"] != float64(2) {
		t.Errorf("限速应换算 KB/s 下发: %v", speed)
	}
	if merged["ids"] == nil {
		t.Error("二次设置应带 ids")
	}
	if merged["seed_ratio_mode"] != float64(seedRatioModeSingle) || merged["seed_ratio_limit"] != float64(2.5) {
		t.Errorf("自定义分享率应为 mode=1 + limit: %v", merged)
	}
	if merged["sequential_download"] != true {
		t.Errorf("顺序下载应下发: %v", merged)
	}
}

func TestAddTorrentsUnlimitedRatioSkipsLimit(t *testing.T) {
	f := newFakeRPC()
	f.methodBodies["torrent_add"] = map[string]any{
		"torrent_added": map[string]any{"id": 1, "hash_string": "a1"},
	}
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	ratio := float64(-1) // -1 = 不限
	if _, _, err := m.AddTorrents("s1", Conn{BaseURL: srv.URL},
		[]string{"magnet:?xt=urn:btih:a1"}, nil, AddOptions{RatioLimit: &ratio}); err != nil {
		t.Fatal(err)
	}
	params := f.lastParams["torrent_set"]
	if params["seed_ratio_mode"] != float64(seedRatioModeUnlimited) {
		t.Errorf("-1 应映射 mode=unlimited: %v", params)
	}
	if _, has := params["seed_ratio_limit"]; has {
		t.Error("不限不应下发 seed_ratio_limit")
	}
	if _, has := params["sequential_download"]; has {
		t.Error("未勾选顺序下载不应下发")
	}
}

func TestSetSpeedLimitsConvertsBpsToKBps(t *testing.T) {
	f := newFakeRPC()
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	dl := int64(2 * 1024 * 1024) // 2 MiB/s → 2048 KB/s
	up := int64(0)               // 0 = 不限
	if err := m.SetSpeedLimits("s1", Conn{BaseURL: srv.URL}, []string{"a1"}, &dl, &up); err != nil {
		t.Fatal(err)
	}
	params := f.lastParams["torrent_set"]
	if params["download_limit"] != float64(2048) {
		t.Errorf("B/s→KB/s 应向上取整换算: %v", params["download_limit"])
	}
	if params["download_limited"] != true {
		t.Error("有限速应下发 download_limited=true")
	}
	if params["upload_limited"] != false {
		t.Error("0 应映射 upload_limited=false")
	}
	if _, has := params["upload_limit"]; has {
		t.Error("不限速不应下发 upload_limit")
	}
}

func TestSetLabelsAddRemoveGroups(t *testing.T) {
	f := newFakeRPC()
	f.methodBodies["torrent_get"] = map[string]any{
		"torrents": []map[string]any{
			{"hash_string": "a", "labels": []string{"x"}},
			{"hash_string": "b", "labels": []string{"y"}},
			{"hash_string": "c", "labels": []string{"x"}},
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	if err := m.SetLabels("s1", Conn{BaseURL: srv.URL}, []string{"a", "b", "c"}, []string{"z"}, "add"); err != nil {
		t.Fatal(err)
	}
	// a、c 当前标签相同合并为一组,b 单独一组 → 恰好 2 次 torrent-set
	var sets [][]any
	for _, call := range f.callsOf("torrent_set") {
		sets = append(sets, call["ids"].([]any))
	}
	if len(sets) != 2 {
		t.Fatalf("相同标签集合应合并为一组 torrent-set, got %d 次: %v", len(sets), sets)
	}
}

func TestQueueMoveValidatesDirection(t *testing.T) {
	f := newFakeRPC()
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()

	m := NewManager()
	if err := m.QueueMove("s1", Conn{BaseURL: srv.URL}, []string{"a"}, "sideways"); err == nil {
		t.Error("非法方向应报错")
	}
	if err := m.QueueMove("s1", Conn{BaseURL: srv.URL}, []string{"a"}, "top"); err != nil {
		t.Errorf("合法方向不应报错: %v", err)
	}
	if got := f.lastParams["queue_move_top"]["ids"]; got == nil {
		t.Error("ids 应下发")
	}
}

// callsOf 收集某方法的全部 params（fakeRPC.callLog 按序记录）。
func (f *fakeRPC) callsOf(method string) []map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]map[string]any, 0, len(f.callLog[method]))
	out = append(out, f.callLog[method]...)
	return out
}
