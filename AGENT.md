# AGENT.md — AI Coding Agent 仓库指南

本文件面向 AI Coding Agent（Claude Code 经 `CLAUDE.md` 导入本文件，其他工具直接读取）。只记录**读代码看不出来的东西**：不变量、约定与坑。

## 项目概览

AntTorrent：自托管的多 qBittorrent 管理器（Web 界面）。Go 后端统一管理多台 qB 实例（连接配置、SID 认证、请求代理）；可选的轻量 agent（ant-agent）部署在 qB 所在机器，经**出站** WebSocket 反连后端，提供远程目录浏览。**agent 已拆分为独立仓库 [github.com/ant-torrent/ant-agent](https://github.com/ant-torrent/ant-agent)**，不在本仓库内。配置以 JSON 文件落盘，无数据库。

- 相关文档：[README_ZH-CN.md](README_ZH-CN.md) · [docs/install.md](docs/install.md) · [backend/README.md](backend/README.md) · [frontend/README.md](frontend/README.md) · [ant-agent 仓库](https://github.com/ant-torrent/ant-agent)（含通信契约与部署指南）

## 常用命令

- **提交前端改动前必跑** `cd frontend && pnpm build`——`noUnusedLocals` 等严格 tsc 检查只在这里生效（lint 用 `pnpm lint`）。
- agent（ant-agent）的构建与交叉编译脚本在 ant-agent 独立仓库内，本仓库不再包含。

## 架构不变量（改动前必读）

- **端口**：后端 `:8080` 硬编码（与 qB WebUI 默认端口相同）；Vite dev 固定 `:5273`（strictPort）；生产 nginx `:8000`。
- **数据目录**：后端以**进程启动时的工作目录**为基准读写 `./data/`（servers.json + settings.json + auth.json）。换启动目录 = 换数据文件。
- **账号认证**：除豁免路由 `/api/healthz`、`/api/agent/ws`（agent 自带 Bearer 认证）、`/api/auth/*` 外，**所有 `/api/*` 必须登录**（authMiddleware，HttpOnly cookie `ant_session`）。新增业务路由一律挂 `SetupRouter` 的受保护组。会话为 HMAC 无状态 token：epoch 不匹配即 401（改密码 / `ant-torrent reset-password` 时 +1 踢全部会话）；滑动续期只延长过期时间、**绝不 bump epoch**。
- **auth.json 损坏即拒绝启动**：`auth.NewStore` 仅「文件不存在」视为未设置账号；文件存在但解析失败必须 Fatal——回退「未设置」等于允许破坏文件重设账号接管。运行中服务端按 mtime+size 热重载 auth.json（CLI 重置密码无需重启）。
- **CLI 子命令**：`backend/main.go` 按首个参数分发（如 `ant-torrent reset-password`，支持 `--data-dir/-d`）；数据目录默认相对 CWD 的 `./data/`，必须与运行中服务端一致。
- **日志体系**：后端用 `log/slog`（标准库，不引第三方日志库），双写 stderr 与内存环形缓冲（`internal/logbuf`，默认 2000 行，不落盘、进程重启即清空），经受保护接口 `GET /api/logs` 供前端「日志」页查看。级别/格式/访问日志开关存于 settings.json 的 `log` 段（`internal/settings`，与 `ai` 段同文件；兼容 v1 旧格式根对象即 AIConfig），经 `GET/PUT /api/logs/config` 修改后经 `logging.Manager.Apply` 热更新、无需重启。访问日志为自写 slog 中间件（gin.Default 不再使用），`slog.SetDefault` 已桥接标准 log 包；`gin.DefaultErrorWriter` 必须在 `SetupRouter` 前设置，panic 栈才会进缓冲。
- **双下载器**：`ServerConfig.Type`（`qbittorrent`（默认）| `transmission`；存量由 `ensureTypes` 回填）。qB 走 `/servers/:id/qbt/*` 代理与 `internal/qbt` 客户端；Transmission 走 `/servers/:id/tr/*` 规范化端点（snake_case 原生字段透传，映射归前端）与 `internal/transmission` JSON-RPC 2.0 客户端（409 握手串行化、Basic Auth、方法名下划线、hash_string 作稳定主键）。**上游 401 一律翻译为 502**（qB 登录失败与 tr 认证失败同约定）——401 是 AntTorrent 会话失效专属语义，透传会被前端误登出。类型不符的跨打必须 400（`downloaderTypeMismatch`），不是 404。前端能力门控统一走 `services/downloaders.ts` 的 CAPS/supports，禁止散落 `type===` 判断；状态映射（tr 0-6 → qB 19 态）集中在 `services/api/transmission.ts` 纯函数。tr 不支持：RSS、分类（仅 labels）、详情面板（后续）、逐 tracker 控制、日志 RPC。
- **agent 是 WebSocket 客户端**：主动反连 `<backend>/api/agent/ws`，后端从不主动发起连接。协议帧结构体现在是**两份拷贝**——本仓库 `backend/internal/protocol`（连同 `backend/internal/fsbrowse`）与 ant-agent 仓库的 `internal/protocol`、`internal/fsbrowse` 互为副本，两仓库分属不同 module、**编译器不再兜底，改动必须两仓库同改**（两份文件除 import 行外保持一致；错误码语义、超时约束尤其要人工对齐）。线上契约文档在 `backend/README.md` 的「通信契约」节与 ant-agent 仓库 README，改协议必须同步改两处。
- **qB v4/v5 适配**：优先 v5 API（如 `torrents/stop|start`），检测到 4.x 自动回退（`pause|resume`）。改 qbt 包时两个版本都要考虑。
- **前端访问后端**统一走 `/qbt-api` 前缀（Vite 代理 / nginx 反代重写为 `/api`）。
- **目录浏览双模式**：本地模式后端直接读盘；agent 模式经白名单校验（`EvalSymlinks` 后前缀匹配，防符号链接逃逸）转发给 agent。路径解析逻辑改动时 POSIX 与 Windows（盘符 `C:\`、UNC `\\srv\share`）都要覆盖。

## 约定

- **语言**：注释与面向用户的文档一律简体中文（根 README.md 是唯一的英文例外，与 README_ZH-CN.md 成对维护）。
- **i18n**：前端一切用户可见文案走 i18next。新增 key 必须**同时**加入 `zh-CN.json` 与 `en-US.json`——`fallbackLng` 是 zh-CN，en-US 缺键会**静默回退中文**，构建不报错（历史上已发生多次）。后端用户可见错误文案在 `backend/internal/i18n/i18n.go`，同样 zh/en 成对。
- **JSON 配置落盘**统一走 `backend/internal/jsonfile.Write`（tmp + fsync + rename 原子写；目标文件已存在时沿用其现有权限位）。
- **前端 401 约定**：受保护接口 401 由 `client.ts` 的 `handleAuthStatus` 统一分发（`onUnauthorized` → authStore 切回登录页）；`/auth/*` 自身路径的 401 是「密码错误」语义，不触发跳转。**401 仅表示 AntTorrent 自身会话失效**——qB 代理的上游认证失败（登录 qB 失败 / SID 过期重登失败）一律返回 502，挪用 401 会导致轮询在 qB 瞬时不可达时把用户踢回登录页。
- **Go 依赖**：agent（ant-agent 仓库）保持最小依赖（仅 gorilla/websocket）；本仓库新增第三方包一律放 backend 侧。
- **版本号**：语义化版本，起于 1.0.0。根与 `frontend/package.json` 两处维护；About 页读的是 **frontend 自己的** package.json。

## 安全红线

- `data/` 含**明文** qB 凭据、agentToken、LLM API Key，以及 auth.json（密码哈希 + 会话签名密钥）。已被 .gitignore 忽略——严禁提交；严禁把其中真实值写进代码、文档、示例或日志。
- agentToken 等同凭据：文档/配置片段中一律用占位符；重新生成后旧连接立即失效。
- 在真实 qB 服务器或用户机器上验证时：**不得删除任何文件**，不得修改用户数据（设置类验证用「取消」退出弹窗，不用「确定」）。

## 已知的坑

- backend/ 是**自包含 Go module**（`module ant-torrent/backend`）：go.mod / go.sum / Dockerfile / 构建上下文都在 `backend/` 内，仓库根已无 go.mod——根目录 `go run ./backend` 不可用，用 `cd backend && go run .`（根 `npm run dev:backend` 已内置，注意 data/ 落在 `backend/data/`）。webui 镜像上下文**仅** `frontend/`——前端代码**不可 import 仓库根的文件**（如根 package.json）。
- en-US i18n 静默回退中文（见「约定」），排查「英文界面显示中文」先查 locale 键。
- 升 Go 版本时本仓库需同步 `backend/Dockerfile` 与 `backend/go.mod` 两处镜像/版本标签；agent 侧（ant-agent 仓库）的 release workflow 与构建脚本镜像标签由该仓库自行同步。
- Docker HEALTHCHECK 依赖免登录端点 `/api/healthz`（登录后 `/api/servers` 会 401，不能用）——路由重组时勿移除该豁免，改动需同步 Dockerfile 与 install.md 的健康检查 FAQ。
