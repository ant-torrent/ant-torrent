# AntTorrent 安装部署指南

AntTorrent 是自托管的多 qBittorrent 管理器（Go/Gin 后端 + React 前端），支持多服务器管理、AI 助手与远程目录浏览（ant-agent）。本文覆盖三种安装方式：

- [Docker 部署（推荐）](#docker-部署推荐)
- [源码部署](#源码部署)
- [Agent（ant-agent）安装](#agentant-agent安装)

## 目录

- [前置要求](#前置要求)
- [架构与端口](#架构与端口)
- [登录与账号管理](#登录与账号管理)
- [Docker 部署（推荐）](#docker-部署推荐)
- [源码部署](#源码部署)
- [Agent（ant-agent）安装](#agentant-agent安装)
- [常见问题（FAQ）](#常见问题faq)

## 前置要求

**Docker 部署**：

- Docker Engine（任意近期版本即可）+ Docker Compose（v1.29+ 或 v2，**推荐 v2** 的 `docker compose` 子命令；v1 已停止维护）
- 镜像来自 GHCR（`ghcr.io/ant-torrent/{backend,web}`），由 GitHub Actions 自动构建（amd64/arm64 双架构），**无需本地构建**
- 仅从源码构建镜像时需 Docker Engine ≥ 23（Dockerfile 使用了 BuildKit cache mount），见[从源码构建镜像](#从源码构建镜像可选)

**源码部署**：

- Go ≥ 1.26
- Node.js ≥ 22.12（或 ≥ 20.19）、pnpm ≥ 10
- nginx 或其他能做反向代理的 Web 服务器

**通用**：

- 可网络访问的 qBittorrent WebUI（4.x / 5.x 均支持）

> **国内网络提示**：
> - Docker 镜像拉取慢：为 Docker daemon 配置 registry mirror（如阿里云加速器）
> - Go 模块下载慢：`backend/Dockerfile` 已默认启用 `GOPROXY=https://goproxy.cn,direct`（海外环境可用环境变量改回默认代理）
> - pnpm 安装慢：`frontend/Dockerfile` 内的 `npm install -g pnpm@10` 可追加 `--registry=https://registry.npmmirror.com`

## 架构与端口

```
  浏览器 ──HTTP──▶ web 容器（nginx，宿主机 :8000）
                    ├─ 静态资源 frontend/dist
                    └─ /qbt-api/* ──▶ backend 容器 :8080/api/*
                                       │（HTTP + SID，后端主动访问）
                                       ▼
                                 qBittorrent 实例（一台或多台）
                                       ▲
                                       │ 出站 WebSocket 反向连接（无需开放入站端口）
                                 ant-agent（部署在 qB 所在机器）
```

| 端口 | 用途 | 说明 |
|---|---|---|
| 8000（宿主机） | Web 界面 | nginx 托管前端并反代 API，浏览器只访问这里 |
| 8080（宿主机） | 后端 API | **ant-agent 的反向连接入口**；也是 agent 唯一需要能访问的地址 |

> ⚠️ **端口冲突警示**：qBittorrent WebUI 默认端口也是 8080。若 qB 与 AntTorrent 部署在同一台机器，务必把后端映射改为其他端口（如 `"18080:8080"`），见[端口冲突](#端口冲突)。

## 登录与账号管理

AntTorrent 自带单用户账号认证，**所有功能（含全部 API）需登录后使用**。

### 首次启动：初始化引导

部署完成后浏览器打开 Web 入口（如 `http://<主机IP>:8000`），检测到尚未设置账号时会自动进入**初始化引导页**——设置管理员用户名与密码（至少 8 位）后即完成并直接登录。老部署升级到带登录功能的版本后同样会先进入这一步。

### 会话与退出

- 登录会话有效期 **30 天**，活跃使用自动续期；浏览器关闭不影响（持久 cookie）
- 右上角用户菜单可**退出登录**（仅清除当前浏览器会话，其他设备不受影响）
- **修改密码**在 设置 → 应用设置 → 账号：需验证当前密码；修改成功后**其他设备的登录全部失效**，当前浏览器保持登录

### 忘记密码：CLI 重置

```bash
# 裸机 / 源码部署（在服务端的 WorkingDirectory 下执行，保证指向同一 data/ 目录）
./ant-torrent reset-password

# Docker 部署（容器 WORKDIR 为 /app，正好命中挂载的 ./data:/app/data）
docker exec -it ant-torrent-backend /app/ant-torrent reset-password
```

输出形如：

```
AntTorrent 密码已重置
  用户名:   admin
  新密码:   k7Rq2mXz9b
  数据文件: ./data/auth.json

所有已登录会话已失效（正在运行的服务端会自动感知，无需重启）。
请使用新密码重新登录，并妥善保存新密码（它不会再次显示）。
```

说明：

- 新密码为 **8-12 位随机字符**（大小写字母 + 数字，已剔除易混淆的 `O/0`、`I/l/1`），只显示这一次
- 重置后**全部已登录会话立即失效**；正在运行的服务端自动感知，无需重启
- 数据目录不在默认位置时用 `--data-dir`（缩写 `-d`）指定，**必须与运行中服务端的数据目录一致**

### 安全说明

- 登录接口带防爆破限流：同一来源 15 分钟内连续失败 5 次锁 5 分钟，另有全局失败兜底
- 会话 cookie 为 `HttpOnly` + `SameSite=Lax`；纯 HTTP 部署下凭据明文传输，跨不受信网络建议套 TLS（外部反代）
- `data/auth.json` 含密码哈希与会话签名密钥，权限 0600；**请保护 `data/` 目录**——拥有该目录写权限的人可删除 `auth.json` 后重启服务端重新初始化账号
- 退出登录仅清除本浏览器会话；怀疑会话泄露请改密码（踢出其他会话）或用 CLI 重置

## Docker 部署（推荐）

### 快速开始

```bash
git clone <仓库地址> ant-torrent
cd ant-torrent

# Linux 需要（容器以 uid 1000 运行）；macOS / Windows Docker Desktop 跳过
mkdir -p data && sudo chown -R 1000:1000 data

docker compose up -d
```

首次启动会从 GHCR 拉取两个预构建镜像，之后不再需要联网构建。浏览器打开 `http://<主机IP>:8000`。

查看状态：`docker compose ps`，两个容器都应为 `healthy`。

### 首次配置

进入 设置 → 服务器，添加 qBittorrent 服务器。**服务器 URL 必须从 backend 容器内可达**：

| qB 位置 | URL 写法 |
|---|---|
| 另一台机器 | `http://192.168.x.x:8080` |
| 与容器同一台宿主机 | `http://host.docker.internal:8080`（compose 已配 extra_hosts） |

> ❌ 不要填 `localhost` / `127.0.0.1` —— 在容器里指向容器自身，不是宿主机。

### 数据持久化

所有配置落在仓库根目录 `./data/`（bind mount 到容器 `/app/data`）：

| 文件 | 权限 | 内容 |
|---|---|---|
| `data/servers.json` | 0644 | qB 服务器列表（**含明文 qB 凭据与 agentToken**） |
| `data/settings.json` | 0600 | AI 助手与日志配置（**含 LLM API Key**） |
| `data/auth.json` | 0600 | 登录账号（用户名 + bcrypt 密码哈希 + 会话签名密钥） |

备份 = 复制 `data/` 目录。请确保宿主机上该目录不被其他用户读取。

### 升级

```bash
cp -r data data.bak      # 可选：升级前备份
git pull
docker compose pull      # 拉取最新 :latest 镜像
docker compose up -d     # 以新镜像重建容器
```

> 想锁定版本：`ANT_TORRENT_TAG=1.0.0 docker compose up -d`（或写入同目录 `.env` 文件），tag 与 GitHub Release 对应；去掉该变量即回到跟随 `latest`。

### 从源码构建镜像（可选）

不想用预构建镜像、或要改代码后自建时，叠加开发用 compose 文件：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

构建出的镜像在本机打 tag 为 `ghcr.io/ant-torrent/…`（仅本地标签，不会推送）。CI 侧由 GitHub Actions（[.github/workflows/docker.yml](../.github/workflows/docker.yml)）自动完成：push 到 main 发布 `:latest`，打 `v*` tag 发布 `:版本号` 与 `:主次版本`，amd64/arm64 双架构。

### MCP（stdio）注意事项

后端容器**不含 node/npx**。stdio 型 MCP 服务器（`command: npx …`）在容器内无法启动，AI 设置页会显示 error 状态。两种解决方案：

- **方案 A（推荐）**：改用 http 型 MCP 服务器（Type = http，填 URL），容器内完全可用
- **方案 B**：派生镜像补装 node：

```dockerfile
# Dockerfile.node
FROM ghcr.io/ant-torrent/backend:latest
USER root
RUN apk add --no-cache nodejs npm
USER app
```

```bash
docker build -f Dockerfile.node -t ant-torrent/backend:node .
# docker-compose.yml 中 backend 服务改用 image: ghcr.io/ant-torrent/backend:node
```

### 端口冲突

qB WebUI 已占用宿主机 8080 时，修改 `docker-compose.yml`：

```yaml
    ports:
      - "18080:8080"      # backend 对外端口
```

注意：ant-agent 的 `backendUrl` 也要相应改为 `http://<主机IP>:18080`。

backend 镜像只含主程序；agent 二进制不随镜像分发，获取见 [ant-agent 仓库](https://github.com/ant-torrent/ant-agent)。

## 源码部署

### 后端（Go）

Go module 位于 **`backend/` 目录**（`module ant-torrent/backend`，backend 目录自包含：go.mod、Dockerfile、构建上下文都在其中）。在 `backend/` 内执行：

```bash
cd backend
go build -o ant-torrent .
./ant-torrent    # 监听 :8080
```

> 仓库根目录已无 go.mod，`go run ./backend` / `go build ./backend` 不再可用；Go 命令一律在 `backend/` 内执行。

> ⚠️ **关键**：程序以**当前工作目录**为基准读写 `data/servers.json`、`data/settings.json`，监听端口 `:8080` 硬编码（无环境变量可改）。必须用启动目录 / `WorkingDirectory` 控制数据文件位置。

systemd 服务示例（Linux）：

```ini
# /etc/systemd/system/ant-torrent.service
[Unit]
Description=AntTorrent backend
After=network.target

[Service]
WorkingDirectory=/opt/ant-torrent/backend
ExecStart=/opt/ant-torrent/backend/ant-torrent
Environment=GIN_MODE=release
Restart=on-failure
User=anttorrent

[Install]
WantedBy=multi-user.target
```

`WorkingDirectory` 决定 `data/` 的位置（上例为 `/opt/ant-torrent/backend/data/`）。

### 前端（pnpm + nginx）

```bash
cd frontend
pnpm install
pnpm build        # 产物 dist/
```

用 nginx 托管 `dist/` 并反代 API。最简单的方式：复制 `frontend/nginx.conf`，把其中一行

```nginx
set $ant_backend http://backend:8080;
```

改为后端实际地址：

```nginx
set $ant_backend http://127.0.0.1:8080;
```

同时把 `location /` 的 `root` 改为你的 dist 绝对路径（如 `/opt/ant-torrent/dist`），并删去 `resolver` 行（那是 Docker 内嵌 DNS）。其余配置（SPA fallback、SSE 不缓冲、WebSocket 升级头）保持不动——它们都是必需项。

### 开发模式

仓库根目录可一键同时启动前后端（需 Node.js；首次使用先在根目录 `npm install` 安装 concurrently）：

```bash
npm run dev      # 同时拉起 Go 后端 :8080 与 Vite 前端 :5273，Ctrl+C 一并退出
                 # 也可只起一边：npm run dev:backend / npm run dev:frontend
```

或分别用两个终端：

```bash
# 后端（终端 1）
cd backend && go run main.go        # :8080

# 前端（终端 2）
cd frontend && pnpm dev             # :5273，Vite 已代理 /qbt-api → 127.0.0.1:8080
```

## Agent（ant-agent）安装

ant-agent 是部署在 **qBittorrent 所在机器**上的轻量代理：主动向 AntTorrent 后端发起出站 WebSocket 连接，提供远程目录浏览能力（添加种子时选择保存路径用）。它不代理 qB 流量，只做目录列表，且只读。

### 何时需要

- qB 与后端**不同机**，且想在添加种子时浏览 qB 那台机器的目录 → 需要
- qB 与后端同机（服务器 URL 为 `localhost` / 回环地址）→ 后端直接读本地文件系统，**无需安装**

### 获取配置

后端为每台服务器自动生成 agentToken。打开 设置 → 服务器 → 选择目标服务器，页面提供 **Agent 配置** JSON 片段（含 `backendUrl` / `serverId` / `token`），一键复制后只需补上 `allowedDirs`。

### 下载与安装

> **agent 已拆分为独立仓库 [github.com/ant-torrent/ant-agent](https://github.com/ant-torrent/ant-agent)**，拥有独立的发布节奏与完整文档。下载预编译二进制（5 平台）、`ant-agent.json` 字段说明、原生 / Docker 交叉编译、systemd / NSSM 注册为系统服务、安全设计等，均见该仓库 [README](https://github.com/ant-torrent/ant-agent)。本章仅保留 AntTorrent 侧相关的内容。

从 [ant-agent Releases](https://github.com/ant-torrent/ant-agent/releases) 下载对应平台二进制，配置文件用上一节从设置页复制的片段补上 `allowedDirs`，前台运行：

```bash
./ant-agent -config /etc/ant-torrent/ant-agent.json   # 或缩写 -c
# 日志出现连接成功、serverId=… 即正常；同时设置页 Agent 状态徽标变为「在线」
```

断线自动重连：退避 1s 起、翻倍至最大 30s，成功后重置。

> agent 尚在本仓库内的历史版本，其二进制仍在本仓库 [Releases](https://github.com/ant-torrent/ant-torrent/releases) 附件中，协议互通，可继续使用。

### 重新生成 token

设置页 服务器 → 「重新生成 Token」（危险操作，需确认）。旧连接会被后端立即断开；把新 token 更新进 `ant-agent.json` 后重启 agent 即可。怀疑 token 泄露时用这招最直接。

### 安全注意

- **token 等同凭据**：`ant-agent.json` 权限设为 600，不要提交到仓库
- `allowedDirs` 只给必要目录（如 `/downloads`），不要给 `/`
- 完整安全设计（TLS、白名单防符号链接逃逸等）见 [ant-agent 仓库 README · 安全设计](https://github.com/ant-torrent/ant-agent#安全设计)

## 常见问题（FAQ）

**端口被占用 / 与 qBittorrent WebUI 8080 冲突**
改 compose 端口映射（如 `"18080:8080"`），agent 的 `backendUrl` 同步修改。见[端口冲突](#端口冲突)。

**AI 对话没有流式输出（一次性全部吐出或超时）**
反向代理未关闭缓冲。确认 nginx 配置里有 `proxy_buffering off`、`gzip_proxied off`（本项目 `frontend/nginx.conf` 已内置）。

**agent 一直显示离线**
按顺序排查：① `backendUrl` 从 agent 机器可达（`curl` 试一下）② token 是否被重新生成过 ③ `serverId` 拼写 ④ 防火墙。agent 重连退避最长 30s，改完配置耐心等日志。

**添加 qB 服务器时测试连接失败**
URL 是否从** backend 容器视角**可达？`localhost` 指向容器自身（见[首次配置](#首次配置)）。

**qBittorrent 4.x 能用吗**
能用。后端内置 v4/v5 双版本适配（前端用 v5 `torrents/stop|start`，4.x 自动回退 `pause|resume`）；个别 5.x 新字段在 4.x 上不可用，不影响核心功能。

**容器里 stdio MCP（npx）启动失败**
后端镜像不含 node。见 [MCP（stdio）注意事项](#mcpstdio注意事项)。

**Linux 上 backend 容器启动失败 / 无法写入配置**
`./data` 目录属主不是 1000。执行 `sudo chown -R 1000:1000 data`。

**健康检查为什么打 `/api/healthz`**
启用账号登录后，`/api/servers` 未登录会返回 401，不能再用作健康检查，故改打专用的免登录端点 `/api/healthz`。若日后该路由变更，需同步更新根目录 `Dockerfile`。

**忘记登录密码**
见[登录与账号管理 · 忘记密码](#忘记密码cli-重置)。
