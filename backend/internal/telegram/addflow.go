// addflow.go 实现「添加种子」的会话状态机：
// 输入（链接/文件）→ 服务器键盘 →（仅 qB）分类键盘 → executeAdd 回报结果。
// 每 chat 至多一个活跃 flow（新输入替换旧流程），惰性过期；回调按钮以
// nonce 绑定流程，过期/替换后的按钮一律提示重发。
package telegram

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ant-torrent/backend/internal/apierr"
	"ant-torrent/backend/internal/config"
	"ant-torrent/backend/internal/qbt"
	"ant-torrent/backend/internal/transmission"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
)

const (
	// flowTTL 为流程的惰性过期时长（用户中途放弃后状态最终自行回收）。
	flowTTL = 15 * time.Minute
	// maxCategoryButtons 为分类键盘的按钮上限（v1 简化，超出部分不出现在键盘里）。
	maxCategoryButtons = 48
)

type inputKind int

const (
	inputLink inputKind = iota
	inputFile
)

// flow 为一个进行中的添加流程。
type flow struct {
	Nonce      string         // 回调按钮与流程的绑定标识
	Kind       inputKind      // 链接或 .torrent 文件
	Link       string         // inputLink：磁力/http(s)，可多行
	FileData   []byte         // inputFile：.torrent 原始字节
	FileName   string         // inputFile：原始文件名（仅日志展示）
	ServerIDs  []string       // 服务器键盘的下标 → ID 快照
	ServerID   string         // 已选服务器（空 = 未选）
	Categories []qbt.Category // 已选服务器（qB）的分类缓存
	UserID     int64          // 发起者（仅用于日志，不记链接内容）
	CreatedAt  time.Time
}

// --- 会话状态存取 ---

func (m *Manager) setFlow(chatID int64, f *flow) {
	m.flowsMu.Lock()
	defer m.flowsMu.Unlock()
	m.flows[chatID] = f
}

// getFlow 取活跃流程；缺失或已过期返回 nil（并顺手清理）。
func (m *Manager) getFlow(chatID int64) *flow {
	m.flowsMu.Lock()
	defer m.flowsMu.Unlock()
	f, ok := m.flows[chatID]
	if !ok {
		return nil
	}
	if time.Since(f.CreatedAt) > flowTTL {
		delete(m.flows, chatID)
		return nil
	}
	return f
}

func (m *Manager) clearFlow(chatID int64) {
	m.flowsMu.Lock()
	defer m.flowsMu.Unlock()
	delete(m.flows, chatID)
}

// --- 回调入口 ---

// handleCallback 分发内联按钮：cancel / srv / cat 三类，均先过白名单。
func (m *Manager) handleCallback(ctx context.Context, b *bot.Bot, cb *models.CallbackQuery) {
	cfg, ok := m.authorized(cb.From.ID)
	if !ok {
		_, _ = b.AnswerCallbackQuery(ctx, &bot.AnswerCallbackQueryParams{
			CallbackQueryID: cb.ID,
			Text:            i18nT(cfg.Lang(), "tgUnauthorized", cb.From.ID),
			ShowAlert:       true,
		})
		return
	}
	lang := cfg.Lang()

	chatID, messageID, hasTarget := callbackTarget(cb)
	parts := strings.Split(cb.Data, ":")
	if !hasTarget || len(parts) < 2 {
		_, _ = b.AnswerCallbackQuery(ctx, &bot.AnswerCallbackQueryParams{CallbackQueryID: cb.ID})
		return
	}
	kind, nonce := parts[0], parts[1]
	answer := func(text string) {
		_, _ = b.AnswerCallbackQuery(ctx, &bot.AnswerCallbackQueryParams{CallbackQueryID: cb.ID, Text: text})
	}

	if kind == "cancel" {
		m.clearFlow(chatID)
		m.editText(ctx, b, chatID, messageID, i18nT(lang, "tgCancelled"))
		return
	}
	if kind != "srv" && kind != "cat" {
		answer("")
		return
	}
	idx, err := strconv.Atoi(parts[2])
	if err != nil || idx < 0 {
		answer("")
		return
	}

	f := m.getFlow(chatID)
	if f == nil || f.Nonce != nonce {
		m.editText(ctx, b, chatID, messageID, i18nT(lang, "tgFlowExpired"))
		return
	}

	switch kind {
	case "srv":
		m.pickServer(ctx, b, lang, chatID, messageID, f, idx)
	case "cat":
		m.pickCategory(ctx, b, lang, chatID, messageID, f, idx)
	}
}

// pickServer 处理服务器选择：tr 直接添加；qB 拉分类后出分类键盘。
// 服务器被删或分类拉取失败时保活流程、重发服务器键盘。
func (m *Manager) pickServer(ctx context.Context, b *bot.Bot, lang string, chatID int64, messageID int, f *flow, idx int) {
	if idx >= len(f.ServerIDs) {
		m.editText(ctx, b, chatID, messageID, i18nT(lang, "tgFlowExpired"))
		return
	}
	srv := m.servers.Get(f.ServerIDs[idx])
	if srv == nil {
		m.clearFlow(chatID)
		m.editText(ctx, b, chatID, messageID, i18nT(lang, "tgFlowExpired"))
		return
	}
	f.ServerID = srv.ID

	if srv.Downloader() != config.TypeQbittorrent {
		// Transmission 无分类概念，直接添加
		result := m.executeAdd(lang, f, "")
		m.clearFlow(chatID)
		m.editText(ctx, b, chatID, messageID, result)
		return
	}

	cats, err := m.qbt.GetCategories(srv.ID, qbtConn(*srv))
	if err != nil {
		f.ServerID = "" // 失败保活流程，允许改选其他服务器
		text := renderErr(lang, err) + "\n\n" + i18nT(lang, "tgPickServer")
		m.editWithKeyboard(ctx, b, chatID, messageID, text, m.serverKeyboard(lang, f))
		return
	}
	f.Categories = cats
	m.editWithKeyboard(ctx, b, chatID, messageID, i18nT(lang, "tgPickCategory"), m.categoryKeyboard(lang, f))
}

// pickCategory 处理分类选择（idx=0 为默认分类）并执行添加。
func (m *Manager) pickCategory(ctx context.Context, b *bot.Bot, lang string, chatID int64, messageID int, f *flow, idx int) {
	category := ""
	if idx > 0 {
		if idx > len(f.Categories) {
			m.editText(ctx, b, chatID, messageID, i18nT(lang, "tgFlowExpired"))
			return
		}
		category = f.Categories[idx-1].Name
	}
	srv := m.servers.Get(f.ServerID)
	if srv == nil {
		m.clearFlow(chatID)
		m.editText(ctx, b, chatID, messageID, i18nT(lang, "tgFlowExpired"))
		return
	}
	result := m.executeAdd(lang, f, category)
	m.clearFlow(chatID)
	m.editText(ctx, b, chatID, messageID, result)
}

// --- 添加执行 ---

// executeAdd 把流程内容投递到已选服务器，返回渲染好的结果文案。
func (m *Manager) executeAdd(lang string, f *flow, category string) string {
	srv := m.servers.Get(f.ServerID)
	if srv == nil {
		return i18nT(lang, "tgFlowExpired")
	}
	slog.Info("telegram 添加种子", "server", srv.ID, "type", srv.Downloader(), "user", f.UserID)

	switch srv.Downloader() {
	case config.TypeTransmission:
		conn := transmission.Conn{BaseURL: srv.URL, Username: srv.Username, Password: srv.Password}
		var urls []string
		var metainfo [][]byte
		if f.Kind == inputLink {
			urls = strings.Split(f.Link, "\n")
		} else {
			metainfo = [][]byte{f.FileData}
		}
		dup, _, err := m.tr.AddTorrents(srv.ID, conn, urls, metainfo, transmission.AddOptions{})
		if err != nil {
			return renderErr(lang, err)
		}
		if dup {
			return i18nT(lang, "tgAddDuplicate")
		}
		return addSuccessText(lang, srv.Name, category)
	default: // qbittorrent（键盘入口已保证不会是其他类型）
		conn := qbtConn(*srv)
		var err error
		if f.Kind == inputLink {
			err = m.qbt.AddTorrents(srv.ID, conn, f.Link, category, "", "", false)
		} else {
			err = m.qbt.AddTorrentFiles(srv.ID, conn, [][]byte{f.FileData}, category, "", false)
		}
		if err != nil {
			return renderErr(lang, err)
		}
		return addSuccessText(lang, srv.Name, category)
	}
}

// renderErr 把下载器错误渲染为 bot 文案：APIError → 复用既有 i18n 错误码；
// 其余 → 通用失败文案。
func renderErr(lang string, err error) string {
	if apiErr, ok := apierr.As(err); ok {
		return i18nT(lang, apiErr.Code, apiErr.Args...)
	}
	return i18nT(lang, "tgAddFailed", err)
}

func addSuccessText(lang, server, category string) string {
	if category != "" {
		return i18nT(lang, "tgAddSuccessCat", server, category)
	}
	return i18nT(lang, "tgAddSuccess", server)
}

// qbtConn 由服务器配置构造 qB 连接信息（与 api.resolveConn / ai 工具同构；
// telegram 包不 import internal/api，故在此独立构造）。
func qbtConn(srv config.ServerConfig) qbt.Conn {
	return qbt.Conn{BaseURL: srv.URL, Username: srv.Username, Password: srv.Password}
}

// --- 键盘与消息 ---

// askServer 发出服务器选择键盘（流程入口）；仅一台服务器时自动跳过选择。
func (m *Manager) askServer(ctx context.Context, b *bot.Bot, chatID int64, lang string, f *flow) {
	servers := m.servers.List()
	if len(servers) == 0 {
		m.reply(ctx, b, chatID, i18nT(lang, "tgNoServers"))
		return
	}
	if len(servers) == 1 {
		f.ServerIDs = []string{servers[0].ID}
		f.ServerID = servers[0].ID
		if servers[0].Downloader() != config.TypeQbittorrent {
			m.reply(ctx, b, chatID, m.executeAdd(lang, f, ""))
			m.clearFlow(chatID)
			return
		}
		cats, err := m.qbt.GetCategories(servers[0].ID, qbtConn(servers[0]))
		if err != nil {
			m.reply(ctx, b, chatID, renderErr(lang, err))
			m.clearFlow(chatID)
			return
		}
		f.Categories = cats
		m.send(ctx, b, chatID, i18nT(lang, "tgPickCategory"), m.categoryKeyboard(lang, f))
		return
	}
	f.ServerIDs = make([]string, len(servers))
	for i, s := range servers {
		f.ServerIDs[i] = s.ID
	}
	m.send(ctx, b, chatID, i18nT(lang, "tgPickServer"), m.serverKeyboard(lang, f))
}

// serverKeyboard 构造服务器选择键盘（单列，按钮带类型后缀）。
func (m *Manager) serverKeyboard(lang string, f *flow) *models.InlineKeyboardMarkup {
	var rows [][]models.InlineKeyboardButton
	for i, id := range f.ServerIDs {
		label := id
		if srv := m.servers.Get(id); srv != nil {
			label = fmt.Sprintf("%s · %s", srv.Name, shortType(srv.Downloader()))
		}
		rows = append(rows, []models.InlineKeyboardButton{{
			Text:         label,
			CallbackData: fmt.Sprintf("srv:%s:%d", f.Nonce, i),
		}})
	}
	rows = append(rows, cancelRow(lang, f.Nonce))
	return &models.InlineKeyboardMarkup{InlineKeyboard: rows}
}

// categoryKeyboard 构造分类键盘：首行「默认分类」，其余两列排布，末行取消。
func (m *Manager) categoryKeyboard(lang string, f *flow) *models.InlineKeyboardMarkup {
	var rows [][]models.InlineKeyboardButton
	rows = append(rows, []models.InlineKeyboardButton{{
		Text:         i18nT(lang, "tgDefaultCategory"),
		CallbackData: fmt.Sprintf("cat:%s:0", f.Nonce),
	}})
	n := len(f.Categories)
	if n > maxCategoryButtons {
		n = maxCategoryButtons
	}
	for i := 0; i < n; i += 2 {
		row := []models.InlineKeyboardButton{m.catButton(f, i)}
		if i+1 < n {
			row = append(row, m.catButton(f, i+1))
		}
		rows = append(rows, row)
	}
	rows = append(rows, cancelRow(lang, f.Nonce))
	return &models.InlineKeyboardMarkup{InlineKeyboard: rows}
}

func (m *Manager) catButton(f *flow, i int) models.InlineKeyboardButton {
	return models.InlineKeyboardButton{
		Text:         f.Categories[i].Name,
		CallbackData: fmt.Sprintf("cat:%s:%d", f.Nonce, i+1),
	}
}

func cancelRow(lang, nonce string) []models.InlineKeyboardButton {
	return []models.InlineKeyboardButton{{
		Text:         i18nT(lang, "tgCancel"),
		CallbackData: "cancel:" + nonce,
	}}
}

// shortType 为按钮用的下载器短标签。
func shortType(downloader string) string {
	if downloader == config.TypeTransmission {
		return "tr"
	}
	return "qB"
}

// callbackTarget 提取回调来源消息的 chat/message ID（旧消息可能不可访问，两者均含 ID）。
func callbackTarget(cb *models.CallbackQuery) (chatID int64, messageID int, ok bool) {
	switch {
	case cb.Message.Message != nil:
		return cb.Message.Message.Chat.ID, cb.Message.Message.ID, true
	case cb.Message.InaccessibleMessage != nil:
		return cb.Message.InaccessibleMessage.Chat.ID, cb.Message.InaccessibleMessage.MessageID, true
	}
	return 0, 0, false
}

// reply 发纯文本消息。
func (m *Manager) reply(ctx context.Context, b *bot.Bot, chatID int64, text string) {
	_, _ = b.SendMessage(ctx, &bot.SendMessageParams{ChatID: chatID, Text: text})
}

// send 发带键盘的消息。
func (m *Manager) send(ctx context.Context, b *bot.Bot, chatID int64, text string, markup *models.InlineKeyboardMarkup) {
	_, _ = b.SendMessage(ctx, &bot.SendMessageParams{ChatID: chatID, Text: text, ReplyMarkup: markup})
}

// editText 原位编辑流程消息文本（键盘一并移除，一次流程保持一条消息）。
func (m *Manager) editText(ctx context.Context, b *bot.Bot, chatID int64, messageID int, text string) {
	_, _ = b.EditMessageText(ctx, &bot.EditMessageTextParams{
		ChatID: chatID, MessageID: messageID, Text: text,
	})
}

// editWithKeyboard 原位编辑文本并替换键盘（错误后重发服务器键盘用）。
func (m *Manager) editWithKeyboard(ctx context.Context, b *bot.Bot, chatID int64, messageID int, text string, markup *models.InlineKeyboardMarkup) {
	_, _ = b.EditMessageText(ctx, &bot.EditMessageTextParams{
		ChatID: chatID, MessageID: messageID, Text: text, ReplyMarkup: markup,
	})
}

// downloadFile 经（可能配置了代理的）客户端下载 Telegram 文件。
// 错误文本由调用方脱敏后记录。
func (m *Manager) downloadFile(cfg Config, filePath string) ([]byte, error) {
	client, err := httpClientFor(cfg.ProxyURL)
	if err != nil {
		return nil, err
	}
	url := "https://api.telegram.org/file/bot" + cfg.BotToken + "/" + filePath
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("telegram file download: HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, maxFileDownload+1))
}
