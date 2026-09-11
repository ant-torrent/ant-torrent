// manager.go 管理 Telegram bot 的生命周期：保存配置后 Reconcile 对齐运行状态
// （借鉴 ai/mcp 的 Reconcile + 配置指纹模式，仅复刻思路、不依赖 internal/ai）。
//
// 热更新语义：重启指纹只含 {Enabled, BotToken, ProxyURL, Language}——改白名单
// 不重启长轮询（白名单在每次收到 update 时实时读取，改动即生效）。
// 退出语义与现有服务端一致：无进程级优雅停机，bot 跟随进程存亡。
package telegram

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"hash/fnv"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"ant-torrent/backend/internal/config"
	"ant-torrent/backend/internal/i18n"
	"ant-torrent/backend/internal/qbt"
	"ant-torrent/backend/internal/transmission"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"golang.org/x/net/proxy"
)

// i18nT 为 i18n.T 的短别名（本包内高频使用）。
func i18nT(lang, key string, args ...any) string {
	return i18n.T(lang, key, args...)
}

// 运行状态（设置页徽标取值）。
const (
	statusRunning = "running"
	statusStopped = "stopped"
	statusError   = "error"
)

const (
	// pollTimeout 为长轮询挂起时长（getUpdates Timeout = 此值 - 1s）。
	pollTimeout = time.Minute
	// testTimeout 为「测试连接」getMe 的超时。
	testTimeout = 15 * time.Second
	// maxFileDownload 为 .torrent 附件下载上限（Telegram bot API 本身上限 20MB）。
	maxFileDownload = 20 << 20
)

// Status 为设置页展示的运行状态快照（Error 已脱敏，不含 token）。
type Status struct {
	Status      string `json:"status"` // running | stopped | error
	Error       string `json:"error,omitempty"`
	BotUsername string `json:"botUsername,omitempty"`
}

// Manager 为 Telegram bot 的生命周期管理器：配置对齐（Reconcile）、
// 运行状态查询（Status）与配置测试（Test）。业务逻辑见 bot.go / addflow.go。
type Manager struct {
	mu      sync.Mutex         // 保护以下全部字段
	startMu sync.Mutex         // 串行化 start/stop（含网络操作，不与 mu 混用）
	hash    string             // 当前对齐配置的指纹（空 = 从未对齐）
	cancel  context.CancelFunc // 当次长轮询的取消句柄（nil = 未运行）
	done    chan struct{}      // 当次 run goroutine 退出信号（nil = 无）
	status  string             // running | stopped | error
	errText string             // 最近一次错误（已脱敏）
	botUser string             // bot 用户名（@xx，GetMe 成功后记录）

	settings ConfigStore           // 配置源（白名单实时读取）
	servers  *config.Store         // 服务器表
	qbt      *qbt.ClientManager    // qBittorrent 客户端
	tr       *transmission.Manager // Transmission 客户端

	flowsMu sync.Mutex      // 保护 flows
	flows   map[int64]*flow // 按 chat ID 的进行中添加流程
}

// NewManager 构造管理器（不启动任何 goroutine，等待首次 Reconcile）。
func NewManager(settings ConfigStore, servers *config.Store, qbtMgr *qbt.ClientManager, trMgr *transmission.Manager) *Manager {
	return &Manager{
		settings: settings,
		servers:  servers,
		qbt:      qbtMgr,
		tr:       trMgr,
		flows:    map[int64]*flow{},
		status:   statusStopped,
	}
}

// Reconcile 按新配置对齐运行状态：指纹相同且在运行 → no-op；未启用/配置缺失 → 停；
// 其余（含同配置但上次启动失败的重试）→ 先停旧实例再异步启动。
func (m *Manager) Reconcile(cfg Config) {
	h := configHash(cfg)

	m.mu.Lock()
	if h == m.hash && m.status == statusRunning {
		m.mu.Unlock()
		return
	}
	m.mu.Unlock()

	m.startMu.Lock()
	defer m.startMu.Unlock()

	// 双检：等锁期间可能已被并发 Reconcile 对齐
	m.mu.Lock()
	if h == m.hash && m.status == statusRunning {
		m.mu.Unlock()
		return
	}
	if m.cancel != nil {
		m.cancel()
	}
	done := m.done
	m.mu.Unlock()
	if done != nil {
		<-done // 等旧长轮询退出，避免两实例并发 getUpdates 触发 409
	}

	if !cfg.Configured() {
		m.mu.Lock()
		m.hash = h
		m.status = statusStopped
		m.errText = ""
		m.botUser = ""
		m.cancel = nil
		m.done = nil
		m.mu.Unlock()
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	done = make(chan struct{})
	m.mu.Lock()
	m.hash = h
	m.cancel = cancel
	m.done = done
	m.mu.Unlock()

	go func() {
		defer close(done)
		m.run(ctx, cfg)
	}()
}

// run 启动一次 bot 实例：构造代理客户端 → 校验 token → 后台长轮询直至 ctx 取消。
func (m *Manager) run(ctx context.Context, cfg Config) {
	httpClient, err := httpClientFor(cfg.ProxyURL)
	if err != nil {
		m.fail(cfg, err.Error())
		return
	}
	b, err := bot.New(cfg.BotToken,
		bot.WithHTTPClient(pollTimeout, httpClient),
		bot.WithErrorsHandler(func(err error) {
			// 长轮询期间的瞬时错误（网络抖动、限流等）只记日志，不中断轮询；
			// 错误串可能内嵌 bot<token>/ URL，必须脱敏
			slog.Error("telegram bot", "err", maskToken(cfg.BotToken, err.Error()))
		}),
		bot.WithDefaultHandler(m.handleUpdate),
	)
	if err != nil {
		m.fail(cfg, err.Error())
		return
	}

	me, err := b.GetMe(ctx)
	if err != nil {
		if ctx.Err() != nil {
			return // 已被并发 stop，状态由 Reconcile 收尾
		}
		m.fail(cfg, err.Error())
		return
	}

	// 注册命令菜单（best-effort，失败不致命）
	lang := cfg.Lang()
	_, _ = b.SetMyCommands(ctx, &bot.SetMyCommandsParams{
		Commands: []models.BotCommand{
			{Command: "start", Description: i18nT(lang, "tgCmdStart")},
			{Command: "help", Description: i18nT(lang, "tgCmdHelp")},
			{Command: "cancel", Description: i18nT(lang, "tgCmdCancel")},
		},
	})

	m.mu.Lock()
	m.status = statusRunning
	m.errText = ""
	m.botUser = me.Username
	m.mu.Unlock()
	slog.Info("telegram bot 已启动", "username", "@"+me.Username)

	defer func() {
		m.mu.Lock()
		defer m.mu.Unlock()
		if ctx.Err() != nil {
			// 正常 stop：若新实例尚未覆盖状态，回落为 stopped
			if m.status == statusRunning {
				m.status = statusStopped
			}
			return
		}
		m.status = statusError
		m.errText = "长轮询异常退出"
	}()
	b.Start(ctx)
}

// fail 记录启动失败状态（错误文本脱敏）。
func (m *Manager) fail(cfg Config, errText string) {
	m.mu.Lock()
	m.status = statusError
	m.errText = maskToken(cfg.BotToken, errText)
	m.mu.Unlock()
	slog.Error("telegram bot 启动失败", "err", maskToken(cfg.BotToken, errText))
}

// Status 返回运行状态快照。
func (m *Manager) Status() Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	return Status{Status: m.status, Error: m.errText, BotUsername: m.botUser}
}

// Test 用（通常为草稿的）配置临时调 getMe 验证 token 与代理连通性，无副作用。
// 返回 bot 用户名；错误文本已脱敏。
func (m *Manager) Test(ctx context.Context, cfg Config) (string, error) {
	if cfg.BotToken == "" {
		return "", errors.New("bot token is empty")
	}
	httpClient, err := httpClientFor(cfg.ProxyURL)
	if err != nil {
		return "", err
	}
	b, err := bot.New(cfg.BotToken, bot.WithHTTPClient(pollTimeout, httpClient))
	if err != nil {
		return "", errors.New(maskToken(cfg.BotToken, err.Error()))
	}
	testCtx, cancel := context.WithTimeout(ctx, testTimeout)
	defer cancel()
	me, err := b.GetMe(testCtx)
	if err != nil {
		return "", errors.New(maskToken(cfg.BotToken, err.Error()))
	}
	return me.Username, nil
}

// --- 内部工具 ---

// configHash 计算触发重启的配置指纹（白名单不在内）。
func configHash(cfg Config) string {
	h := fnv.New64a()
	_, _ = fmt.Fprintf(h, "%t|%s|%s|%s", cfg.Enabled, cfg.BotToken, cfg.ProxyURL, cfg.Language)
	return fmt.Sprintf("%x", h.Sum64())
}

// maskToken 把错误文本中可能出现的 token 替换为 ***（Telegram API 错误串
// 常内嵌 bot<token>/ 请求 URL，直接透出会泄漏凭据）。
func maskToken(token, s string) string {
	if token == "" {
		return s
	}
	return strings.ReplaceAll(s, token, "***")
}

// httpClientFor 按代理配置构造 HTTP 客户端：
// 空 = 直连；http/https 走 Transport.Proxy；socks5 走 x/net/proxy 的上下文拨号。
// 不设整体超时——长轮询挂起可达 1 分钟，超时由库与调用方各自控制。
func httpClientFor(proxyURL string) (*http.Client, error) {
	if proxyURL == "" {
		return &http.Client{}, nil
	}
	u, err := url.Parse(proxyURL)
	if err != nil {
		return nil, fmt.Errorf("invalid proxy URL: %w", err)
	}
	switch u.Scheme {
	case "http", "https":
		return &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(u)}}, nil
	case "socks5", "socks5h":
		dialer, err := proxy.FromURL(u, proxy.Direct)
		if err != nil {
			return nil, fmt.Errorf("invalid socks5 proxy: %w", err)
		}
		cd, ok := dialer.(proxy.ContextDialer)
		if !ok {
			return nil, errors.New("socks5 dialer does not support context dialing")
		}
		tr := &http.Transport{}
		tr.DialContext = cd.DialContext
		return &http.Client{Transport: tr}, nil
	default:
		return nil, errors.New("proxy scheme must be http/https/socks5")
	}
}

// newNonce 生成 8 字符随机 hex，绑定回调按钮与其所属流程（防过期按钮误触）。
func newNonce() string {
	buf := make([]byte, 4)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}
