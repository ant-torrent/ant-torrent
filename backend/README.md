# AntTorrent Backend

AntTorrent 的 Go 后端。作为 API 网关统一管理多台 qBittorrent 实例（连接配置、SID 认证、请求代理），并为前端提供 AI 助手、远程目录浏览（ant-agent）等接口。配置以 JSON 文件落盘，**无数据库依赖**。

## 技术栈

| 组件 | 选型 | 说明 |
|---|---|---|
| 语言 | Go 1.26 | |
| Web 框架 | [Gin](https://github.com/gin-gonic/gin) v1.10 | HTTP API、反向代理、SSE 流式输出 |
| WebSocket | [gorilla/websocket](https://github.com/gorilla/websocket) v1.5 | ant-agent 反向连接通道 |
| MCP | [modelcontextprotocol/go-sdk](https://github.com/modelcontextprotocol/go-sdk) v1.7 | AI 助手外接 MCP 工具服务器（stdio / HTTP） |
| 存储 | 本地 JSON 文件 | `data/servers.json`、`data/settings.json`，首次启动自动生成 |

### 目录结构

Go module 根位于 **`backend/` 目录**（`module ant-torrent/backend`），backend 目录自包含（Go 代码、go.mod、Dockerfile、构建上下文都在其中；agent 已独立为 [ant-agent 仓库](https://github.com/ant-torrent/ant-agent)）：

```
ant-torrent/                  # 仓库根（仅仓库级内容：docs、compose、frontend 等）
├── docker-compose*.yml
├── frontend/
└── backend/                  # Go module 根 + 后端镜像构建上下文
    ├── Dockerfile
    ├── go.mod / go.sum
    ├── main.go               # 入口：装配各模块并启动 :8080
    └── internal/
        ├── api/              # Gin 路由与 handlers
        ├── qbt/              # qBittorrent 客户端（v4/v5 双版本适配）、API 代理
        ├── config/           # 服务器配置存储
        ├── agent/            # ant-agent 连接管理（WebSocket 反连）
        ├── protocol/         # 通信协议帧定义（与 ant-agent 仓库同名包互为拷贝，两端同步）
        ├── fsbrowse/         # 目录枚举（与 ant-agent 仓库同名包互为拷贝，语义一致）
        ├── ai/               # AI 助手：OpenAI 兼容 / Anthropic 提供商、工具循环、MCP
        └── i18n/             # 后端错误消息中英文
```

## 本地开发

要求 Go ≥ 1.26。

```bash
cd backend
go run main.go       # 监听 :8080（或 go run .）
```

> 仓库根目录已无 go.mod，Go 命令一律在 `backend/` 内执行。仓库根的 `npm run dev:backend` 已内置此切换。

配套前端开发服务器见 [`frontend/README.md`](../frontend/README.md)（Vite 已将 `/qbt-api/*` 代理到本服务）。

**注意事项：**

- 监听端口 **`:8080` 为硬编码**，无环境变量可改；与 qBittorrent WebUI 默认端口相同，同机运行时注意错开
- 数据文件以**当前工作目录**为基准读写：在 `backend/` 下启动即为 `backend/data/`
- 设置环境变量 `GIN_MODE=release` 可关闭调试日志

### 测试

```bash
go test ./...
```

另有个别针对真实 qBittorrent 实例的集成测试，需通过环境变量显式开启，默认跳过。

## API 路由

统一前缀 `/api`：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/PUT | `/ai/config` | 读取 / 更新 AI 助手配置 |
| GET | `/ai/status` | AI 配置可用性状态（含 MCP 服务器状态） |
| POST | `/ai/chat` | AI 对话（SSE 流式） |
| POST | `/ai/mcp/test` | 测试 MCP 服务器连通性 |
| GET/POST | `/servers` | 列出 / 创建 qBittorrent 服务器 |
| PUT/DELETE | `/servers/:id` | 更新 / 删除服务器 |
| POST | `/servers/:id/test-connection` | 测试连接（登录 qBittorrent） |
| GET/POST/PUT/DELETE | `/servers/:id/torrents/categories` | 分类管理（代理到 qB） |
| GET/POST/DELETE | `/servers/:id/torrents/tags` | 标签管理（代理到 qB） |
| ANY | `/servers/:id/qbt/*path` | 通用代理：透传到对应 qBittorrent 实例 |
| GET | `/agent/ws` | ant-agent 反向 WebSocket 接入点 |
| GET | `/servers/:id/fs/info`、`/fs/list` | 目录信息 / 浏览（本地或经 agent） |
| GET | `/servers/:id/agent/status` | agent 在线状态 |
| POST | `/servers/:id/agent-token` | 重新生成 agentToken |

## 数据存储

| 文件 | 权限 | 内容 |
|---|---|---|
| `data/servers.json` | 0644 | qB 服务器列表，**含明文 qB 凭据与 agentToken** |
| `data/settings.json` | 0600 | AI 助手配置，**含 LLM API Key** |

备份即复制 `data/` 目录。请勿提交到仓库、不要暴露给其他用户读取。

## 构建与部署

### 二进制构建

```bash
# backend/ 目录内执行
go build -trimpath -ldflags="-s -w" -o ant-torrent .
./ant-torrent         # 以当前工作目录为基准，读取/写入 ./data/，监听 :8080
```

交叉编译时设置 `CGO_ENABLED=0` 与目标平台即可。

**⚠️ 部署要点**：程序以**启动时的工作目录**为基准定位 `data/`。用 systemd 部署时务必配置 `WorkingDirectory=`,并设 `Environment=GIN_MODE=release`。完整示例见 [docs/install.md](../docs/install.md#源码部署)。

### ant-agent（独立仓库）

部署在 qBittorrent 所在机器上的轻量代理，通过出站 WebSocket 反连后端提供远程目录浏览能力（无需开放入站端口）。**已拆分为独立仓库 [github.com/ant-torrent/ant-agent](https://github.com/ant-torrent/ant-agent)**，拥有自有 go.mod 与发布节奏，二进制从其 [Releases](https://github.com/ant-torrent/ant-agent/releases) 获取（早期版本仍在 ant-torrent Releases 附件中）。技术架构、部署指南与安全设计见该仓库 README；配置片段从 设置 → 服务器 页一键复制，补上 `allowedDirs` 即可。

**通信契约（后端 ↔ ant-agent）**

> 本节与 ant-agent 仓库 README 的「通信契约」节是**同一份契约的两份拷贝**；结构性定义同样是两份 Go 拷贝（本仓库 `backend/internal/protocol`、`backend/internal/fsbrowse` ↔ ant-agent 仓库 `internal/protocol`、`internal/fsbrowse`）。两仓库分属不同 Go module，编译器不再兜底——**改一端必须同改另一端**，两份 `protocol.go` 除 import 路径行外应保持一致。

**端点与握手**

- agent 主动 `GET /api/agent/ws`（豁免登录，agent 自带 Bearer 认证）；请求头：`X-Ant-Server-Id: <serverId>` 与 `Authorization: Bearer <agentToken>`
- 后端常量时间比对 token（`crypto/subtle`，见 `internal/api/agent_ws.go`）；凭证缺失/错误一律 401；token 重新生成后旧连接立即断开
- 非浏览器客户端，不做 Origin 校验

**帧（JSON 文本帧，定义见两份 `protocol.go`）**

| 帧 | JSON | 方向 | 时机 |
|---|---|---|---|
| hello 事件 | `{"event":"hello","data":{"version":"…","allowedDirs":["…"]}}` | agent → 后端 | 连接升级完成后立即发送 |
| RPC 请求 | `{"id":<uint64>,"method":"fs.list","params":{"path":"…"}}`（`params` 可省略） | 后端 → agent | 用户在前端浏览目录 |
| RPC 响应 | `{"id":<uint64>,"ok":true,"result":{…}}` 或 `{"id":<uint64>,"ok":false,"error":{"code":"…","message":"…"}}` | agent → 后端 | 按 `id` 配对 |

**方法**

仅 `fs.list`：参数 `{path}`，空路径落到 agent 白名单第一项；结果 `{path, parent, entries:[{name, path}]}`——仅子目录、不含文件，按名称不区分大小写排序，symlink 指向目录会被解析纳入。其余方法一律返回 `methodNotFound`。

**错误码全集**

错误帧只传 code，面向用户的文案由后端 i18n 渲染（`internal/i18n`）；HTTP 状态为本仓库 `writeAgentError`（`internal/api/fs.go`）的映射：

| Code | 产生方 | HTTP | 场景 |
|---|---|---|---|
| `invalidPath` | agent / fsbrowse | 400 | 相对路径，或 params 解析失败 |
| `pathOutsideAllowedDirs` | agent | 400 | symlink 解析后不在任何白名单目录内 |
| `methodNotFound` | agent | 502* | 未知方法 |
| `agentInternal` | agent | 502* | 结果序列化失败等内部错误 |
| `pathNotFound` | fsbrowse | 404 | 路径不存在 |
| `notADirectory` | fsbrowse | 400 | 不是目录 |
| `pathPermissionDenied` | fsbrowse | 403 | 无权限 |
| `fsReadFailed` | fsbrowse | 502 | 目录读取失败 |
| `agentOffline` | 后端 | 409 | 无该 serverId 的连接 |
| `agentTimeout` | 后端 | 504 | RPC 超时（callTimeout=10s） |
| `agentRequired` | 后端 | 409 | agent 不在线且服务器非本机回环 |

\* `methodNotFound` / `agentInternal` 未列入 `knownAgentCodes`，HTTP 状态同为 502、文案收敛为通用 `agentError`。

**超时约束（跨仓库不变量，重点）**

常量分居两仓库，改任一侧必须评估另一侧：

| 常量 | 值 | 归属 | 约束 |
|---|---|---|---|
| `pingPeriod` | 30s | 本仓库 `internal/agent/manager.go` | 必须 < `pongWait` |
| `pongWait` | 60s | 本仓库同上 | 超时未收到 pong 判掉线 |
| `readWait` | 90s | ant-agent `client.go` | **必须 > 2×`pingPeriod`**（容忍丢一次 ping）且 > `pongWait` |
| `callTimeout` | 10s | 本仓库 | 须大于 agent 侧最坏目录枚举耗时，否则误报 `agentTimeout` |
| 写超时 | 10s（close 帧 1s） | 两端各自 | 对称即可 |
| 拨号超时 | 15s | ant-agent | |
| 重连退避 | 1s 起翻倍至 30s 封顶，成功后重置 | ant-agent | |

**演进规则**

- 新增 method / 新增字段 = 向后兼容（两端 `encoding/json` 忽略未知字段，未知 method 已有 `methodNotFound` 兜底）
- 改字段名、删字段、改错误码语义或帧形状 = 破坏性变更：两仓库同发版本，后端至少保留一个版本周期兼容旧 agent
- hello 的 `version` 仅展示于设置页，后端不按其做兼容门控；当前契约未显式版本化，ant-agent v1.0.0 与 ant-torrent 现存任意版本互通

### Docker

预构建镜像由 GitHub Actions（[.github/workflows/docker.yml](../.github/workflows/docker.yml)）自动构建并推送 GHCR：push 到 main 发布 `:latest`，打 `v*` tag 发布 `:版本号`，amd64/arm64 双架构。用户侧 `docker compose up -d` 直接拉取（tag 可用环境变量 `ANT_TORRENT_TAG` 覆盖，默认 latest）。

自建镜像（多阶段构建，`golang:1.26-alpine` 编译 → `alpine:3.22` 运行）：构建上下文为 **`backend/` 目录**（`backend/Dockerfile`；`backend/.dockerignore` 已排除 `data/` 等无关内容），仅产出主程序二进制：

```bash
docker build -t ghcr.io/ant-torrent/backend:latest backend/
# 或连同前端一起（构建配置在 docker-compose.dev.yml，与主 compose 叠加使用）：
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

镜像要点：

- 非 root 用户（uid 1000）运行，数据卷挂载点为 `/app/data`（对应 compose 的 `./data:/app/data`）
- 内置 `HEALTHCHECK`，复用只读接口 `/api/servers`
- Linux 下挂载宿主机目录需先 `sudo chown -R 1000:1000 data`

## 架构总览

```
Frontend (Vite dev :5273 / nginx :8000)
    │  /qbt-api/*  →（开发期 Vite proxy / 生产期 nginx 反代）
    ▼
Go Backend (:8080) ── 配置读写 → data/*.json
    ├─ HTTP + SID per server → qBittorrent 实例 × N
    ├─ SSE ←→ 前端 AI 对话
    └─ WebSocket ←─ ant-agent（独立仓库 github.com/ant-torrent/ant-agent，qB 机器上的出站反连）
```
