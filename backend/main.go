package main

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"strconv"
	"strings"

	"ant-torrent/backend/internal/agent"
	"ant-torrent/backend/internal/ai"
	"ant-torrent/backend/internal/api"
	"ant-torrent/backend/internal/auth"
	"ant-torrent/backend/internal/config"
	"ant-torrent/backend/internal/logbuf"
	"ant-torrent/backend/internal/logging"
	"ant-torrent/backend/internal/qbt"
	"ant-torrent/backend/internal/settings"
	"ant-torrent/backend/internal/telegram"
	"ant-torrent/backend/internal/transmission"

	"github.com/gin-gonic/gin"
)

func main() {
	// 带首个参数时进入 CLI 子命令模式（如 reset-password），无参数则启动服务端
	if len(os.Args) > 1 {
		os.Exit(runSubcommand(os.Args[1], os.Args[2:]))
	}
	runServer()
}

// defaultPort 为后端默认监听端口（与 qB WebUI 默认端口相同）。
const defaultPort = "8080"

// listenAddr 解析监听地址：环境变量 ANT_TORRENT_PORT 覆盖，缺省 :8080。
// 端口属部署层配置（容器 / 服务管理器注入），不进 settings.json；
// 非法取值直接拒绝启动——静默回退默认端口会让人「设了却没生效」。
func listenAddr() (string, error) {
	port := strings.TrimSpace(os.Getenv("ANT_TORRENT_PORT"))
	if port == "" {
		port = defaultPort
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return "", fmt.Errorf("ANT_TORRENT_PORT=%q 不是合法端口（1-65535）", port)
	}
	return ":" + port, nil
}

func runServer() {
	store := config.NewStore("data/servers.json")
	qbtMgr := qbt.NewClientManager()
	trMgr := transmission.NewManager()
	agentMgr := agent.NewManager()

	// settings.json：应用级配置（log 段 + ai 段；兼容旧版仅 AI 结构的文件）
	settingsStore := settings.NewStore("data/" + settings.FileName)

	// 日志：slog 结构化输出，双写 stderr（容器 logs / journal 可见）与内存环形
	// 缓冲（/api/logs 前端查看）。级别/格式/访问日志经 settings.json 热更新。
	// slog.SetDefault 同时桥接标准 log 包；DefaultErrorWriter 须在 SetupRouter
	// 前设置，gin.Recovery 的 panic 栈才会进缓冲。
	buf := logbuf.New(logbuf.DefaultCap)
	logMgr := logging.New(buf, settingsStore.Log())
	gin.DefaultErrorWriter = io.MultiWriter(os.Stderr, buf)

	// auth.json 存在但损坏时拒绝启动——回退为「未设置账号」会让任何人
	// 通过破坏文件重新初始化账号接管系统（见 auth.NewStore）
	authStore, err := auth.NewStore("data/" + auth.FileName)
	if err != nil {
		slog.Error("加载账号数据失败", "err", err)
		os.Exit(1)
	}

	aiSvc := ai.NewService(settingsStore, store, qbtMgr)

	// telegram bot：按 settings.json 的 telegram 段对齐运行状态（enabled 时
	// 后台拉起长轮询；无优雅停机，跟随进程存亡），保存配置后热启停。
	tgMgr := telegram.NewManager(settingsStore, store, qbtMgr, trMgr)

	r := api.SetupRouter(store, qbtMgr, trMgr, agentMgr, tgMgr, aiSvc, authStore, logMgr, settingsStore)
	tgMgr.Reconcile(settingsStore.TelegramConfig())

	addr, err := listenAddr()
	if err != nil {
		slog.Error("监听地址无效", "err", err)
		os.Exit(1)
	}
	slog.Info("AntTorrent backend starting", "addr", addr)
	if err := r.Run(addr); err != nil {
		slog.Error("server error", "err", err)
		os.Exit(1)
	}
}
