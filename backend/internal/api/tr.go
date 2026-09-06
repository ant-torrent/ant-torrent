// Transmission 专用端点（/api/servers/:id/tr/*）：规范化 JSON 契约，
// 字段保持 Transmission 原生 snake_case，映射到 UI 模型由前端适配层完成。
// 全部挂在受保护组；仅对 type=transmission 的服务器可用（类型不符 400）。
package api

import (
	"io"
	"net/http"
	"strconv"
	"strings"

	"ant-torrent/backend/internal/config"
	"ant-torrent/backend/internal/transmission"

	"github.com/gin-gonic/gin"
)

// requireTrServer 校验服务器存在且类型为 transmission，返回 RPC 连接信息；
// 校验失败时已写入响应。
func requireTrServer(store *config.Store, c *gin.Context) (string, transmission.Conn, bool) {
	srv := store.Get(c.Param("id"))
	if srv == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": msg(c, "serverNotFound")})
		return "", transmission.Conn{}, false
	}
	if srv.Downloader() != config.TypeTransmission {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "downloaderTypeMismatch")})
		return "", transmission.Conn{}, false
	}
	return srv.ID, transmission.Conn{
		BaseURL:  srv.URL,
		Username: srv.Username,
		Password: srv.Password,
	}, true
}

// trSnapshot 轮询端点：一次返回种子行（torrent-get 原生 snake_case）与会话统计，
// 附带下载目录剩余空间（free_space），减少前端请求数。
func trSnapshot(store *config.Store, trMgr *transmission.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := requireTrServer(store, c)
		if !ok {
			return
		}
		torrents, err := trMgr.GetTorrents(id, conn)
		if err != nil {
			writeQbtError(c, err)
			return
		}
		stats, err := trMgr.GetSessionStats(id, conn)
		if err != nil {
			writeQbtError(c, err)
			return
		}
		freeSpace := int64(0)
		if dir, err := trMgr.GetDownloadDir(id, conn); err == nil && dir != "" {
			if v, err := trMgr.FreeSpace(id, conn, dir); err == nil {
				freeSpace = v
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"torrents": torrents,
			"server": gin.H{
				"stats":     stats,
				"freeSpace": freeSpace,
			},
		})
	}
}

// trTorrentDetail 单种子详情（hash 查询）。
func trTorrentDetail(store *config.Store, trMgr *transmission.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := requireTrServer(store, c)
		if !ok {
			return
		}
		hash := c.Query("hash")
		if hash == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		row, err := trMgr.GetTorrentDetailByIds(id, conn, hash)
		if err != nil {
			writeQbtError(c, err)
			return
		}
		if row == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": msg(c, "torrentNotFound")})
			return
		}
		c.JSON(http.StatusOK, row)
	}
}

// trSessionUpdate 更新会话配置：仅接受白名单键（internal/transmission
// sessionWritableKeys），类型校验后经 session_set 热生效、并持久化到 Transmission。
func trSessionUpdate(store *config.Store, trMgr *transmission.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := requireTrServer(store, c)
		if !ok {
			return
		}
		var patch map[string]any
		if err := c.ShouldBindJSON(&patch); err != nil || len(patch) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		for k := range patch {
			if !transmission.ValidSessionKey(k) {
				c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "trSessionKeyInvalid", k)})
				return
			}
		}
		applied, err := trMgr.SetSession(id, conn, patch)
		if err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "applied": applied})
	}
}

// trSession 返回会话配置（连接页版本展示 / fs 建议路径）。
func trSession(store *config.Store, trMgr *transmission.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := requireTrServer(store, c)
		if !ok {
			return
		}
		session, err := trMgr.GetSession(id, conn)
		if err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, session)
	}
}

// trAddTorrents 添加种子（multipart，字段名与 qB 添加表单对齐以复用前端 FormData）：
// urls 换行分隔（→ filename）、torrents 文件列表（→ base64 metainfo）、
// download_dir、labels 逗号分隔、paused。
func trAddTorrents(store *config.Store, trMgr *transmission.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := requireTrServer(store, c)
		if !ok {
			return
		}
		form, err := c.MultipartForm()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}

		var urls []string
		for _, u := range strings.Split(c.PostForm("urls"), "\n") {
			if u = strings.TrimSpace(u); u != "" {
				urls = append(urls, u)
			}
		}
		files := form.File["torrents"]
		metainfo := make([][]byte, 0, len(files))
		for _, fh := range files {
			f, err := fh.Open()
			if err != nil {
				continue
			}
			data, err := io.ReadAll(f)
			f.Close()
			if err != nil {
				continue
			}
			metainfo = append(metainfo, data)
		}
		if len(urls) == 0 && len(metainfo) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}

		var labels []string
		if v := c.PostForm("labels"); v != "" {
			for _, l := range strings.Split(v, ",") {
				if l = strings.TrimSpace(l); l != "" {
					labels = append(labels, l)
				}
			}
		}

		duplicate, hash, err := trMgr.AddTorrents(id, conn, urls, metainfo, transmission.AddOptions{
			DownloadDir: c.PostForm("download_dir"),
			Labels:      labels,
			Paused:      c.PostForm("paused") == "true",
			// 添加后二次设置项：表单字段名与前端 TorrentAddParams 对齐；空/非法 = 不设置
			DlBps:      parseBpsForm(c.PostForm("dlLimit")),
			UpBps:      parseBpsForm(c.PostForm("upLimit")),
			RatioLimit: parseRatioForm(c.PostForm("ratioLimit")),
			Sequential: c.PostForm("sequentialDownload") == "true",
		})
		if err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "duplicate": duplicate, "hash": hash})
	}
}

// parseBpsForm 解析表单里的整数字节值（空/非法 = nil，不设置）。
func parseBpsForm(v string) *int64 {
	if v == "" {
		return nil
	}
	if n, err := strconv.ParseInt(v, 10, 64); err == nil {
		return &n
	}
	return nil
}

// parseRatioForm 解析表单里的分享率浮点值（空/非法 = nil，不设置）。
func parseRatioForm(v string) *float64 {
	if v == "" {
		return nil
	}
	if f, err := strconv.ParseFloat(v, 64); err == nil {
		return &f
	}
	return nil
}

// trAction 工厂：收编「body 只含 ids 的种子动作」handler（start/stop/verify 等）。
func trAction(store *config.Store, trMgr *transmission.Manager,
	fn func(*transmission.Manager, string, transmission.Conn, []string) error) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := requireTrServer(store, c)
		if !ok {
			return
		}
		var req struct {
			IDs []string `json:"ids"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if err := fn(trMgr, id, conn, req.IDs); err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// trRemove 删除种子（可同时删除已下载数据）。
func trRemove(store *config.Store, trMgr *transmission.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := requireTrServer(store, c)
		if !ok {
			return
		}
		var req struct {
			IDs             []string `json:"ids"`
			DeleteLocalData bool     `json:"deleteLocalData"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if err := trMgr.RemoveTorrents(id, conn, req.IDs, req.DeleteLocalData); err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// trQueueMove 队列相对移动。
func trQueueMove(store *config.Store, trMgr *transmission.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := requireTrServer(store, c)
		if !ok {
			return
		}
		var req struct {
			IDs       []string `json:"ids"`
			Direction string   `json:"direction"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if err := trMgr.QueueMove(id, conn, req.IDs, req.Direction); err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// trSetLabels 设置种子标签（mode: set|add|remove）。
func trSetLabels(store *config.Store, trMgr *transmission.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := requireTrServer(store, c)
		if !ok {
			return
		}
		var req struct {
			IDs    []string `json:"ids"`
			Labels []string `json:"labels"`
			Mode   string   `json:"mode"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if err := trMgr.SetLabels(id, conn, req.IDs, req.Labels, req.Mode); err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// trSetLimits 设置种子级限速。入参为 B/s（0 = 不限速）；缺省方向不修改。
func trSetLimits(store *config.Store, trMgr *transmission.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, conn, ok := requireTrServer(store, c)
		if !ok {
			return
		}
		var req struct {
			IDs           []string `json:"ids"`
			DownloadLimit *int64   `json:"downloadLimit"`
			UploadLimit   *int64   `json:"uploadLimit"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg(c, "invalidRequestBody")})
			return
		}
		if err := trMgr.SetSpeedLimits(id, conn, req.IDs, req.DownloadLimit, req.UploadLimit); err != nil {
			writeQbtError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
