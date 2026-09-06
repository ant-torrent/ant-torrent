package ai

import (
	"fmt"
	"math"
	"net/url"
	"sort"
	"strings"
	"unicode/utf8"

	"ant-torrent/backend/internal/qbt"
)

// resolveServer 从参数解析目标服务器：args["server_id"] 缺省用当前激活服务器，
// 非法时返回带合法清单的错误。
func resolveServer(tctx ToolContext, args map[string]any) (string, qbt.Conn, error) {
	id, _ := args["server_id"].(string)
	if id == "" {
		id = tctx.ActiveServerID
	}
	if id != "" {
		if srv := tctx.Store.Get(id); srv != nil {
			return id, qbt.Conn{BaseURL: srv.URL, Username: srv.Username, Password: srv.Password}, nil
		}
	}
	valid := make([]string, 0)
	for _, s := range tctx.Store.List() {
		valid = append(valid, fmt.Sprintf("%s(%s)", s.ID, s.Name))
	}
	if id == "" && len(valid) == 0 {
		return "", qbt.Conn{}, fmt.Errorf("no qBittorrent server is configured")
	}
	return "", qbt.Conn{}, fmt.Errorf("server_id %q not found, valid servers: %s", id, strings.Join(valid, ", "))
}

// argString / argStrings / argInt 为宽松取参：容忍 LLM 把数字、数组分类型传错。
func argString(args map[string]any, key string) string {
	switch v := args[key].(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		return fmt.Sprintf("%v", v)
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", v)
	}
}

func argStrings(args map[string]any, key string) []string {
	switch v := args[key].(type) {
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
		return out
	case string: // 容忍单值
		s := strings.TrimSpace(v)
		if s == "" {
			return nil
		}
		return []string{s}
	default:
		return nil
	}
}

func argInt(args map[string]any, key string, fallback int) int {
	switch v := args[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	case string:
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil {
			return n
		}
	}
	return fallback
}

func truncStr(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	runes := []rune(s)
	return string(runes[:n]) + "…"
}

// --- list_servers ---

type listServersTool struct{}

func (listServersTool) Def() ToolDef {
	return ToolDef{
		Name:        "list_servers",
		Description: "List all configured qBittorrent servers (id and name). Use this first when the user mentions a server you cannot identify.",
		Parameters:  map[string]any{"type": "object", "properties": map[string]any{}},
	}
}

func (listServersTool) Exec(tctx ToolContext, _ map[string]any) (string, bool) {
	type srvRow struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		URL  string `json:"url"`
	}
	rows := make([]srvRow, 0)
	for _, s := range tctx.Store.List() {
		rows = append(rows, srvRow{ID: s.ID, Name: s.Name, URL: s.URL})
	}
	if len(rows) == 0 {
		return toolError("no qBittorrent server is configured"), false
	}
	return toolResult(map[string]any{"servers": rows}), true
}

// --- list_torrents ---

type listTorrentsTool struct{}

func (listTorrentsTool) Def() ToolDef {
	return ToolDef{
		Name:        "list_torrents",
		Description: "List torrents on a qBittorrent server with optional filters. status_filter: all|downloading|seeding|completed|stopped|active|inactive. search matches torrent name (case-insensitive substring).",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"server_id":     map[string]any{"type": "string", "description": "Target server id; omit to use the currently active server"},
				"status_filter": map[string]any{"type": "string", "enum": []string{"all", "downloading", "seeding", "completed", "stopped", "active", "inactive"}},
				"category":      map[string]any{"type": "string"},
				"tag":           map[string]any{"type": "string"},
				"search":        map[string]any{"type": "string"},
				"limit":         map[string]any{"type": "integer", "description": "Max torrents to return, default 20, max 50"},
			},
		},
	}
}

func (listTorrentsTool) Exec(tctx ToolContext, args map[string]any) (string, bool) {
	id, conn, err := resolveServer(tctx, args)
	if err != nil {
		return toolError(err.Error()), false
	}

	// filter/category/tags 为 qB 服务端有效参数；search 需在调用方过滤
	filters := url.Values{}
	if f := argString(args, "status_filter"); f != "" && f != "all" {
		filters.Set("filter", f)
	}
	if c := argString(args, "category"); c != "" {
		filters.Set("category", c)
	}
	if t := argString(args, "tag"); t != "" {
		filters.Set("tags", t)
	}
	all, err := tctx.Qbt.GetTorrents(id, conn, filters)
	if err != nil {
		return toolError(qbtErrText(err)), false
	}

	matched := all
	if s := argString(args, "search"); s != "" {
		needle := strings.ToLower(s)
		matched = matched[:0]
		for _, t := range all {
			if strings.Contains(strings.ToLower(t.Name), needle) || strings.HasPrefix(strings.ToLower(t.Hash), needle) {
				matched = append(matched, t)
			}
		}
	}
	total := len(matched)

	limit := argInt(args, "limit", 20)
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	truncated := total > limit
	if truncated {
		matched = matched[:limit]
	}

	type row struct {
		Hash      string  `json:"hash"`
		Name      string  `json:"name"`
		State     string  `json:"state"`
		Progress  float64 `json:"progress_pct"`
		Size      int64   `json:"size_bytes"`
		Dlspeed   int64   `json:"dlspeed_Bps"`
		Upspeed   int64   `json:"upspeed_Bps"`
		Eta       int64   `json:"eta_seconds"`
		Ratio     float64 `json:"ratio"`
		Category  string  `json:"category"`
		Tags      string  `json:"tags"`
		NumSeeds  int     `json:"num_seeds"`
		NumLeechs int     `json:"num_leechs"`
		AddedOn   int64   `json:"added_on_unix"`
	}
	rows := make([]row, 0, len(matched))
	for _, t := range matched {
		rows = append(rows, row{
			Hash: t.Hash, Name: truncStr(t.Name, 120), State: t.State,
			Progress: math.Round(t.Progress*1000) / 10, Size: t.Size,
			Dlspeed: t.Dlspeed, Upspeed: t.Upspeed, Eta: t.Eta, Ratio: t.Ratio,
			Category: t.Category, Tags: t.Tags, NumSeeds: t.NumSeeds, NumLeechs: t.NumLeechs,
			AddedOn: t.AddedOn,
		})
	}
	// 用 struct 固定字段顺序（total 在前，避免长列表把关键统计挤到截断之后）
	return toolResult(struct {
		Total     int    `json:"total"`
		Truncated bool   `json:"truncated"`
		ServerID  string `json:"server_id"`
		Torrents  any    `json:"torrents"`
	}{total, truncated, id, rows}), true
}

// --- get_torrent_detail ---

type torrentDetailTool struct{}

func (torrentDetailTool) Def() ToolDef {
	return ToolDef{
		Name:        "get_torrent_detail",
		Description: "Get detailed properties of one torrent by its hash (save path, sizes, speeds, dates, share info).",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"server_id": map[string]any{"type": "string", "description": "Target server id; omit to use the currently active server"},
				"hash":      map[string]any{"type": "string", "description": "Torrent hash (40 hex chars)"},
			},
			"required": []string{"hash"},
		},
	}
}

func (torrentDetailTool) Exec(tctx ToolContext, args map[string]any) (string, bool) {
	id, conn, err := resolveServer(tctx, args)
	if err != nil {
		return toolError(err.Error()), false
	}
	hash := strings.ToLower(argString(args, "hash"))
	if hash == "" {
		return toolError("hash is required"), false
	}

	// 基本信息 + 属性白名单合并
	ts, err := tctx.Qbt.GetTorrents(id, conn, url.Values{"hashes": {hash}})
	if err != nil {
		return toolError(qbtErrText(err)), false
	}
	if len(ts) == 0 {
		return toolError("torrent not found: " + hash), false
	}
	t := ts[0]

	props, err := tctx.Qbt.GetTorrentProperties(id, conn, hash)
	out := map[string]any{
		"hash": t.Hash, "name": t.Name, "state": t.State,
		"progress_pct":     math.Round(t.Progress*1000) / 10,
		"size_bytes":       t.Size,
		"category":         t.Category,
		"tags":             t.Tags,
		"save_path":        t.SavePath,
		"ratio":            t.Ratio,
		"added_on_unix":    t.AddedOn,
		"dlspeed_Bps":      t.Dlspeed,
		"upspeed_Bps":      t.Upspeed,
		"num_seeds":        t.NumSeeds,
		"num_leechs":       t.NumLeechs,
		"content_path":     props["content_path"],
		"piece_size":       props["piece_size"],
		"total_downloaded": props["total_downloaded"],
		"total_uploaded":   props["total_uploaded"],
		"seeding_time":     props["seeding_time"],
		"completion_date":  props["completion_date"],
		"tracker":          props["tracker"],
	}
	return toolResult(out), true
}

// --- add_torrent ---

type addTorrentTool struct{}

func (addTorrentTool) Def() ToolDef {
	return ToolDef{
		Name:        "add_torrent",
		Description: "Add one or more torrents by magnet URI or .torrent URL. Only use URLs the user explicitly provided. Multiple links are separated by newlines.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"server_id": map[string]any{"type": "string", "description": "Target server id; omit to use the currently active server"},
				"urls":      map[string]any{"type": "string", "description": "Magnet URI(s) or .torrent URL(s), newline-separated"},
				"category":  map[string]any{"type": "string"},
				"tags":      map[string]any{"type": "string", "description": "Comma-separated tag list"},
				"savepath":  map[string]any{"type": "string"},
				"paused":    map[string]any{"type": "boolean", "description": "Add without starting (default false)"},
			},
			"required": []string{"urls"},
		},
	}
}

func (addTorrentTool) Exec(tctx ToolContext, args map[string]any) (string, bool) {
	id, conn, err := resolveServer(tctx, args)
	if err != nil {
		return toolError(err.Error()), false
	}
	urls := argString(args, "urls")
	if urls == "" {
		return toolError("urls is required"), false
	}
	paused, _ := args["paused"].(bool)
	if err := tctx.Qbt.AddTorrents(id, conn, urls, argString(args, "category"), argString(args, "tags"), argString(args, "savepath"), paused); err != nil {
		return toolError(qbtErrText(err)), false
	}
	return toolResult(map[string]any{"ok": true, "server_id": id}), true
}

// --- pause / resume ---

type pauseTorrentsTool struct{}

func (pauseTorrentsTool) Def() ToolDef {
	return toggleDef("pause_torrents", "Pause (stop) torrents by hashes. Look up hashes with list_torrents first; if multiple torrents match the user's description, list them and ask before pausing.")
}

func (pauseTorrentsTool) Exec(tctx ToolContext, args map[string]any) (string, bool) {
	return execToggle(tctx, args, "paused", tctx.Qbt.StopTorrents)
}

type resumeTorrentsTool struct{}

func (resumeTorrentsTool) Def() ToolDef {
	return toggleDef("resume_torrents", "Resume (start) paused torrents by hashes. Look up hashes with list_torrents first.")
}

func (resumeTorrentsTool) Exec(tctx ToolContext, args map[string]any) (string, bool) {
	return execToggle(tctx, args, "resumed", tctx.Qbt.StartTorrents)
}

func toggleDef(name, desc string) ToolDef {
	return ToolDef{
		Name:        name,
		Description: desc,
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"server_id": map[string]any{"type": "string", "description": "Target server id; omit to use the currently active server"},
				"hashes":    map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Torrent hashes"},
			},
			"required": []string{"hashes"},
		},
	}
}

func execToggle(tctx ToolContext, args map[string]any, doneWord string,
	toggle func(serverID string, conn qbt.Conn, hashes []string) error) (string, bool) {
	id, conn, err := resolveServer(tctx, args)
	if err != nil {
		return toolError(err.Error()), false
	}
	hashes := argStrings(args, "hashes")
	if len(hashes) == 0 {
		return toolError("hashes is required"), false
	}
	if err := toggle(id, conn, hashes); err != nil {
		return toolError(qbtErrText(err)), false
	}
	return toolResult(map[string]any{"ok": true, "count": len(hashes), "state": doneWord}), true
}

// --- list_categories / list_tags ---

type listCategoriesTool struct{}

func (listCategoriesTool) Def() ToolDef {
	return ToolDef{
		Name:        "list_categories",
		Description: "List all torrent categories (with save paths) on a qBittorrent server.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"server_id": map[string]any{"type": "string", "description": "Target server id; omit to use the currently active server"},
			},
		},
	}
}

func (listCategoriesTool) Exec(tctx ToolContext, args map[string]any) (string, bool) {
	id, conn, err := resolveServer(tctx, args)
	if err != nil {
		return toolError(err.Error()), false
	}
	cats, err := tctx.Qbt.GetCategories(id, conn)
	if err != nil {
		return toolError(qbtErrText(err)), false
	}
	type row struct {
		Name     string `json:"name"`
		SavePath string `json:"savePath"`
	}
	rows := make([]row, 0, len(cats))
	for _, c := range cats {
		rows = append(rows, row{Name: c.Name, SavePath: c.SavePath})
	}
	return toolResult(map[string]any{"categories": rows}), true
}

type listTagsTool struct{}

func (listTagsTool) Def() ToolDef {
	return ToolDef{
		Name:        "list_tags",
		Description: "List all torrent tags on a qBittorrent server.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"server_id": map[string]any{"type": "string", "description": "Target server id; omit to use the currently active server"},
			},
		},
	}
}

func (listTagsTool) Exec(tctx ToolContext, args map[string]any) (string, bool) {
	id, conn, err := resolveServer(tctx, args)
	if err != nil {
		return toolError(err.Error()), false
	}
	tags, err := tctx.Qbt.GetTags(id, conn)
	if err != nil {
		return toolError(qbtErrText(err)), false
	}
	sort.Strings(tags)
	return toolResult(map[string]any{"tags": tags}), true
}

// qbtErrText 把 qbt 错误转为给大模型看的简短文本。
func qbtErrText(err error) string {
	if apiErr, ok := qbt.AsAPIError(err); ok {
		return fmt.Sprintf("qBittorrent API error (%s, HTTP %d)", apiErr.Code, apiErr.Status)
	}
	return err.Error()
}
