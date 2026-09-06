package qbt

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
)

// Category 表示一个 qBittorrent 分类（名称 + 保存路径）。
type Category struct {
	Name     string `json:"name"`
	SavePath string `json:"savePath"`
}

// Conn 描述一台 qBittorrent 服务器的连接信息。
type Conn struct {
	BaseURL  string
	Username string
	Password string
}

// APIError/AsAPIError 移至 client.go（internal/apierr 的别名），此处不再重复定义。

// login 强制登录并保存 SID。
func (m *ClientManager) login(serverID string, conn Conn) error {
	result, err := m.Login(serverID, conn.BaseURL, conn.Username, conn.Password)
	if err != nil {
		return &APIError{Status: http.StatusBadGateway, Code: "unreachable", Args: []any{err.Error()}}
	}
	if !result.Success {
		return &APIError{Status: http.StatusUnauthorized, Code: "loginFailed"}
	}
	return nil
}

// ensureSID 在没有有效 SID 时登录。
func (m *ClientManager) ensureSID(serverID string, conn Conn) error {
	if m.Get(serverID).HasValidSID() {
		return nil
	}
	return m.login(serverID, conn)
}

// doRequest 执行对 qBittorrent 的 API 请求：自动附带 SID，403 时重登录并重试一次。
// path 形如 "torrents/categories"，form 为 nil 时发送 GET。
func (m *ClientManager) doRequest(serverID string, conn Conn, method, path string, form url.Values) ([]byte, int, error) {
	targetURL := strings.TrimRight(conn.BaseURL, "/") + "/api/v2/" + path

	do := func() (*http.Response, error) {
		var body io.Reader
		if form != nil {
			body = strings.NewReader(form.Encode())
		}
		req, err := http.NewRequest(method, targetURL, body)
		if err != nil {
			return nil, err
		}
		if form != nil {
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
		req.Header.Set("Referer", conn.BaseURL)
		return m.DoRequest(serverID, req)
	}

	if err := m.ensureSID(serverID, conn); err != nil {
		return nil, 0, err
	}

	resp, err := do()
	if err != nil {
		return nil, 0, &APIError{Status: http.StatusBadGateway, Code: "unreachable", Args: []any{err.Error()}}
	}
	defer resp.Body.Close()

	// 403：会话过期，强制重登录后重试一次
	if resp.StatusCode == http.StatusForbidden {
		resp.Body.Close()
		if err := m.login(serverID, conn); err != nil {
			return nil, 0, err
		}
		resp, err = do()
		if err != nil {
			return nil, 0, &APIError{Status: http.StatusBadGateway, Code: "unreachable", Args: []any{err.Error()}}
		}
		defer resp.Body.Close()
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, &APIError{Status: http.StatusBadGateway, Code: "parseError"}
	}
	return body, resp.StatusCode, nil
}

// callForm 执行写操作并把 qBittorrent 的非 200 状态映射为带错误码的 APIError。
// badRequestCode 为空表示该端点不区分 400（用通用 qbError）。
func (m *ClientManager) callForm(serverID string, conn Conn, path string, form url.Values, badRequestCode, conflictCode string) error {
	_, status, err := m.doRequest(serverID, conn, http.MethodPost, path, form)
	if err != nil {
		return err
	}
	switch status {
	case http.StatusOK:
		return nil
	case http.StatusBadRequest:
		if badRequestCode != "" {
			return &APIError{Status: status, Code: badRequestCode}
		}
		return &APIError{Status: status, Code: "qbError", Args: []any{status}}
	case http.StatusConflict:
		if conflictCode != "" {
			return &APIError{Status: status, Code: conflictCode}
		}
		return &APIError{Status: status, Code: "qbError", Args: []any{status}}
	default:
		return &APIError{Status: http.StatusBadGateway, Code: "qbError", Args: []any{status}}
	}
}

// GetCategories 返回全部分类，按名称排序。
func (m *ClientManager) GetCategories(serverID string, conn Conn) ([]Category, error) {
	body, status, err := m.doRequest(serverID, conn, http.MethodGet, "torrents/categories", nil)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, &APIError{Status: http.StatusBadGateway, Code: "getCategoriesFailed", Args: []any{status}}
	}
	var byName map[string]Category
	if err := json.Unmarshal(body, &byName); err != nil {
		return nil, &APIError{Status: http.StatusBadGateway, Code: "parseError"}
	}
	cats := make([]Category, 0, len(byName))
	for _, c := range byName {
		cats = append(cats, c)
	}
	sort.Slice(cats, func(i, j int) bool { return cats[i].Name < cats[j].Name })
	return cats, nil
}

// CreateCategory 新建分类（savePath 可为空）。
func (m *ClientManager) CreateCategory(serverID string, conn Conn, name, savePath string) error {
	form := url.Values{"category": {name}}
	if savePath != "" {
		form.Set("savePath", savePath)
	}
	return m.callForm(serverID, conn, "torrents/createCategory", form, "categoryNameEmpty", "categoryNameInvalid")
}

// EditCategory 修改分类的保存路径。
func (m *ClientManager) EditCategory(serverID string, conn Conn, name, savePath string) error {
	form := url.Values{"category": {name}, "savePath": {savePath}}
	return m.callForm(serverID, conn, "torrents/editCategory", form, "categoryNameEmpty", "categoryEditFailed")
}

// RemoveCategories 删除一个或多个分类（\n 分隔，与 qBittorrent API 一致）。
func (m *ClientManager) RemoveCategories(serverID string, conn Conn, names []string) error {
	form := url.Values{"categories": {strings.Join(names, "\n")}}
	return m.callForm(serverID, conn, "torrents/removeCategories", form, "", "")
}

// GetTags 返回全部标签。
func (m *ClientManager) GetTags(serverID string, conn Conn) ([]string, error) {
	body, status, err := m.doRequest(serverID, conn, http.MethodGet, "torrents/tags", nil)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, &APIError{Status: http.StatusBadGateway, Code: "getTagsFailed", Args: []any{status}}
	}
	var tags []string
	if err := json.Unmarshal(body, &tags); err != nil {
		return nil, &APIError{Status: http.StatusBadGateway, Code: "parseError"}
	}
	return tags, nil
}

// CreateTags 创建一个或多个标签（逗号分隔，与 qBittorrent API 一致）。
func (m *ClientManager) CreateTags(serverID string, conn Conn, tags []string) error {
	form := url.Values{"tags": {strings.Join(tags, ",")}}
	return m.callForm(serverID, conn, "torrents/createTags", form, "", "tagCreateFailed")
}

// DeleteTags 删除一个或多个标签（逗号分隔，与 qBittorrent API 一致）。
func (m *ClientManager) DeleteTags(serverID string, conn Conn, tags []string) error {
	form := url.Values{"tags": {strings.Join(tags, ",")}}
	return m.callForm(serverID, conn, "torrents/deleteTags", form, "", "tagDeleteFailed")
}

// TorrentInfo 为 torrents/info 的行投影：只保留 AI 工具与服务端需要的摘要字段。
type TorrentInfo struct {
	Hash      string  `json:"hash"`
	Name      string  `json:"name"`
	State     string  `json:"state"`
	Progress  float64 `json:"progress"`
	Size      int64   `json:"size"`
	Dlspeed   int64   `json:"dlspeed"`
	Upspeed   int64   `json:"upspeed"`
	Eta       int64   `json:"eta"`
	Ratio     float64 `json:"ratio"`
	Category  string  `json:"category"`
	Tags      string  `json:"tags"`
	NumSeeds  int     `json:"num_seeds"`
	NumLeechs int     `json:"num_leechs"`
	AddedOn   int64   `json:"added_on"`
	SavePath  string  `json:"save_path"`
}

// GetTorrents 按 filters（status_filter/category/tag/search/limit 等，与 qBittorrent torrents/info
// 参数一致）查询种子列表。
func (m *ClientManager) GetTorrents(serverID string, conn Conn, filters url.Values) ([]TorrentInfo, error) {
	path := "torrents/info"
	if enc := filters.Encode(); enc != "" {
		path += "?" + enc
	}
	body, status, err := m.doRequest(serverID, conn, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, &APIError{Status: http.StatusBadGateway, Code: "getTorrentsFailed", Args: []any{status}}
	}
	var torrents []TorrentInfo
	if err := json.Unmarshal(body, &torrents); err != nil {
		return nil, &APIError{Status: http.StatusBadGateway, Code: "parseError"}
	}
	return torrents, nil
}

// GetTorrentProperties 返回单个种子的属性集合（torrents/properties，键值原样透传）。
func (m *ClientManager) GetTorrentProperties(serverID string, conn Conn, hash string) (map[string]any, error) {
	path := "torrents/properties?hash=" + url.QueryEscape(hash)
	body, status, err := m.doRequest(serverID, conn, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, &APIError{Status: http.StatusBadGateway, Code: "getTorrentDetailFailed", Args: []any{status}}
	}
	var props map[string]any
	if err := json.Unmarshal(body, &props); err != nil {
		return nil, &APIError{Status: http.StatusBadGateway, Code: "parseError"}
	}
	return props, nil
}

// AddTorrents 按链接（磁力/HTTP，可换行分隔多个）添加种子；category/tags/savePath 为空时省略。
func (m *ClientManager) AddTorrents(serverID string, conn Conn, urls, category, tags, savePath string, paused bool) error {
	form := url.Values{"urls": {urls}}
	if category != "" {
		form.Set("category", category)
	}
	if tags != "" {
		form.Set("tags", tags)
	}
	if savePath != "" {
		form.Set("savePath", savePath)
	}
	if paused {
		form.Set("paused", "true")
	}
	return m.callForm(serverID, conn, "torrents/add", form, "addTorrentFailed", "")
}

// StopTorrents 暂停种子（qB v5 torrents/stop，404 时回退 v4 torrents/pause）。
func (m *ClientManager) StopTorrents(serverID string, conn Conn, hashes []string) error {
	return m.toggleTorrents(serverID, conn, "torrents/stop", "torrents/pause", hashes)
}

// StartTorrents 恢复种子（qB v5 torrents/start，404 时回退 v4 torrents/resume）。
func (m *ClientManager) StartTorrents(serverID string, conn Conn, hashes []string) error {
	return m.toggleTorrents(serverID, conn, "torrents/start", "torrents/resume", hashes)
}

// toggleTorrents 执行启停端点调用：优先 v5 端点，qB 4.x 无该端点时返回 404，改用 v4 同义端点。
func (m *ClientManager) toggleTorrents(serverID string, conn Conn, v5Path, v4Path string, hashes []string) error {
	form := url.Values{"hashes": {strings.Join(hashes, "|")}}
	_, status, err := m.doRequest(serverID, conn, http.MethodPost, v5Path, form)
	if err != nil {
		return err
	}
	if status == http.StatusOK {
		return nil
	}
	if status == http.StatusNotFound {
		_, status2, err2 := m.doRequest(serverID, conn, http.MethodPost, v4Path, form)
		if err2 != nil {
			return err2
		}
		if status2 == http.StatusOK {
			return nil
		}
		return &APIError{Status: http.StatusBadGateway, Code: "qbError", Args: []any{status2}}
	}
	return &APIError{Status: http.StatusBadGateway, Code: "qbError", Args: []any{status}}
}
