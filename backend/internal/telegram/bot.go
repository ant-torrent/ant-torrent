// bot.go 负责 Telegram update 的路由与访问控制：
// 白名单 gate 最先（消息回复用户 ID、callback 仅弹提示），再分发到命令 /
// 文件 / 链接 / 回调四个入口。业务状态机见 addflow.go。
package telegram

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
)

// handleUpdate 为默认 update 入口：仅处理私聊/群消息与内联按钮回调。
func (m *Manager) handleUpdate(ctx context.Context, b *bot.Bot, update *models.Update) {
	switch {
	case update.Message != nil:
		m.handleMessage(ctx, b, update.Message)
	case update.CallbackQuery != nil:
		m.handleCallback(ctx, b, update.CallbackQuery)
	}
}

// authorized 实时读取配置并校验用户白名单（改白名单即生效，无需重启轮询）。
func (m *Manager) authorized(userID int64) (Config, bool) {
	cfg := m.settings.TelegramConfig()
	return cfg, cfg.IsAllowed(userID)
}

// handleMessage 分发文本消息、命令与 .torrent 附件。
func (m *Manager) handleMessage(ctx context.Context, b *bot.Bot, msg *models.Message) {
	if msg.From == nil {
		return
	}
	cfg, ok := m.authorized(msg.From.ID)
	if !ok {
		// 引导管理员加白：未授权回复其数字用户 ID（凭据仅用户自己可见，无泄露面）
		m.reply(ctx, b, msg.Chat.ID, i18nT(cfg.Lang(), "tgUnauthorized", msg.From.ID))
		return
	}
	lang := cfg.Lang()
	text := strings.TrimSpace(msg.Text)

	switch {
	case strings.HasPrefix(text, "/cancel"):
		m.clearFlow(msg.Chat.ID)
		m.reply(ctx, b, msg.Chat.ID, i18nT(lang, "tgCancelled"))
	case strings.HasPrefix(text, "/start"), strings.HasPrefix(text, "/help"):
		m.reply(ctx, b, msg.Chat.ID, i18nT(lang, "tgHelp"))
	case msg.Document != nil:
		m.handleDocument(ctx, b, cfg, msg)
	default:
		m.handleLink(ctx, b, cfg, msg)
	}
}

// handleLink 处理文本输入：提取磁力/http(s) 链接行，建立添加流程并发服务器键盘。
func (m *Manager) handleLink(ctx context.Context, b *bot.Bot, cfg Config, msg *models.Message) {
	lang := cfg.Lang()
	links := extractLinks(msg.Text)
	if links == "" {
		m.reply(ctx, b, msg.Chat.ID, i18nT(lang, "tgInvalidInput"))
		return
	}
	f := &flow{Nonce: newNonce(), Kind: inputLink, Link: links, UserID: msg.From.ID, CreatedAt: time.Now()}
	m.setFlow(msg.Chat.ID, f)
	slog.Info("telegram 收到种子链接", "chat", msg.Chat.ID, "user", msg.From.ID)
	m.askServer(ctx, b, msg.Chat.ID, lang, f)
}

// handleDocument 处理 .torrent 附件：校验 → 经 getFile 下载 → 建流程发服务器键盘。
func (m *Manager) handleDocument(ctx context.Context, b *bot.Bot, cfg Config, msg *models.Message) {
	lang := cfg.Lang()
	doc := msg.Document
	if !strings.EqualFold(filepath.Ext(doc.FileName), ".torrent") {
		m.reply(ctx, b, msg.Chat.ID, i18nT(lang, "tgFileInvalid"))
		return
	}
	if doc.FileSize > maxFileDownload {
		m.reply(ctx, b, msg.Chat.ID, i18nT(lang, "tgFileTooLarge"))
		return
	}

	file, err := b.GetFile(ctx, &bot.GetFileParams{FileID: doc.FileID})
	if err != nil || file == nil || file.FilePath == "" {
		slog.Error("telegram getFile 失败", "err", maskToken(cfg.BotToken, fmt.Sprint(err)))
		m.reply(ctx, b, msg.Chat.ID, i18nT(lang, "tgFileInvalid"))
		return
	}
	data, err := m.downloadFile(cfg, file.FilePath)
	if err != nil || len(data) == 0 || data[0] != 'd' { // bencode 字典首字节
		slog.Error("telegram 下载附件失败", "err", maskToken(cfg.BotToken, fmt.Sprint(err)))
		m.reply(ctx, b, msg.Chat.ID, i18nT(lang, "tgFileInvalid"))
		return
	}

	f := &flow{Nonce: newNonce(), Kind: inputFile, FileData: data, FileName: doc.FileName, UserID: msg.From.ID, CreatedAt: time.Now()}
	m.setFlow(msg.Chat.ID, f)
	slog.Info("telegram 收到种子文件", "chat", msg.Chat.ID, "user", msg.From.ID)
	m.askServer(ctx, b, msg.Chat.ID, lang, f)
}

// extractLinks 从文本中逐行提取磁力/http(s) 链接（换行分隔，容忍粘贴时夹带说明文字）。
func extractLinks(text string) string {
	var lines []string
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "magnet:") ||
			strings.HasPrefix(line, "http://") || strings.HasPrefix(line, "https://") {
			lines = append(lines, line)
		}
	}
	return strings.Join(lines, "\n")
}
