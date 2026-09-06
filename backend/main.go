package main

import (
	"io"
	"log/slog"
	"os"

	"ant-torrent/backend/internal/agent"
	"ant-torrent/backend/internal/ai"
	"ant-torrent/backend/internal/api"
	"ant-torrent/backend/internal/auth"
	"ant-torrent/backend/internal/config"
	"ant-torrent/backend/internal/logbuf"
	"ant-torrent/backend/internal/logging"
	"ant-torrent/backend/internal/qbt"
	"ant-torrent/backend/internal/settings"
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

	r := api.SetupRouter(store, qbtMgr, trMgr, agentMgr, aiSvc, authStore, logMgr, settingsStore)

	slog.Info("AntTorrent backend starting", "addr", ":8080")
	if err := r.Run(":8080"); err != nil {
		slog.Error("server error", "err", err)
		os.Exit(1)
	}
}
