# AntTorrent Frontend

AntTorrent 的前端单页应用（SPA）：多 qBittorrent 服务器管理、实时仪表盘、种子管理、RSS 自动化与 AI 助手界面。

## 技术栈

| 分类 | 选型 |
|---|---|
| 框架 | [React](https://react.dev) 19 + TypeScript 5.9 |
| 构建工具 | [Vite](https://vite.dev) 8（`@vitejs/plugin-react`） |
| UI 组件库 | [Ant Design](https://ant.design) 6 + `@ant-design/icons` |
| 图表 | `@ant-design/plots`（仪表盘速度曲线等） |
| 路由 | `react-router-dom` v7 |
| 状态管理 | [zustand](https://github.com/pmndrs/zustand) v5 |
| 国际化 | `i18next` + `react-i18next`（简体中文 / English，即时切换） |
| Markdown 渲染 | `react-markdown` + `remark-gfm`（AI 对话） |
| 时间处理 | dayjs |
| 代码质量 | oxlint + Prettier |

包管理使用 **pnpm ≥ 10**，Node.js ≥ 22.12（或 ≥ 20.19）。

### 目录结构

```
frontend/src/
├── main.tsx / App.tsx   # 入口
├── router/              # 路由配置
├── layouts/             # 页面骨架
├── pages/               # 各功能页面（仪表盘、种子、RSS、设置…）
├── components/          # 通用组件
├── assistant/           # AI 助手聊天抽屉
├── services/            # API 封装（走 /qbt-api 前缀）
├── stores/              # zustand 状态
├── hooks/               # 自定义 Hooks
├── i18n/                # 中英文语言资源
└── theme/               # 明暗主题与主题色
```

## 本地开发

```bash
# 1. 先启动后端（:8080）
cd backend && go run main.go

# 2. 启动前端开发服务器（新终端）
cd frontend
pnpm install
pnpm dev
```

打开 **http://localhost:5273**。

开发服务器要点：

- 端口**固定为 5273**（`strictPort: true`），被占用会直接报错而不是顺延——避免与本机其他 Vite 项目混淆
- Vite 已内置代理：`/qbt-api/*` → `http://localhost:8080/api/*`，前后端联调无跨域问题
- 路径别名 `@` → `src/`

### 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 开发服务器（HMR），`:5273` |
| `pnpm build` | 类型检查（`tsc -b`）+ 生产构建，产物在 `dist/` |
| `pnpm preview` | 本地预览生产构建产物 |
| `pnpm lint` | oxlint 静态检查 |
| `pnpm antd:lint` | antd 最佳实践检查 |

## 构建与部署

### 构建产物

```bash
pnpm build     # = tsc -b && vite build → dist/
```

产物为纯静态文件，可由 nginx、Caddy 或任何静态服务器托管。**必须同时把 `/qbt-api/*` 反向代理到后端 `:8080`**，否则页面无法访问 API。

### Docker（推荐）

预构建镜像由 CI 推送至 GHCR（`ghcr.io/ant-torrent/web`），用户侧 `docker compose up -d` 直接拉取，本节为自建方式。多阶段构建：`node:22-alpine` 内 `pnpm install --frozen-lockfile` + 构建 → `nginx:alpine` 托管：

```bash
docker build -t ghcr.io/ant-torrent/web:latest .
# 或从仓库根目录连同后端一起（构建配置在 docker-compose.dev.yml，与主 compose 叠加）：
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

- 容器内 nginx 监听 80，compose 映射宿主机 **8000**
- [`nginx.conf`](./nginx.conf) 已内置必需项：
  - SPA fallback（前端路由刷新不 404）
  - `proxy_buffering off` 等 SSE 相关配置（AI 对话流式输出依赖此项）
  - WebSocket 升级头（浏览器直连场景）

### 源码部署（自备 nginx）

1. `pnpm build` 得到 `dist/`
2. 复制本目录的 `nginx.conf` 作模板，改两处后删去 `resolver` 行（那是 Docker 内嵌 DNS 专用）：

   ```nginx
   set $ant_backend http://127.0.0.1:8080;   # 改为你的后端实际地址
   root /opt/ant-torrent/dist;               # location / 中改为 dist 绝对路径
   ```

3. 重载 nginx。SPA fallback 与 SSE 不缓冲等其余配置保持不动。

完整部署指南（含 systemd、HTTPS 建议、常见问题）见 [docs/install.md](../docs/install.md)。

## 与后端的对接方式

```
浏览器 ──▶ 静态资源 (dist/) + /qbt-api/*
                               │ nginx 反代（生产）/ Vite proxy（开发）
                               ▼
                    Go Backend :8080 的 /api/*
```

前端代码统一以 `/qbt-api` 为 API 前缀请求后端，环境间无需改动。
