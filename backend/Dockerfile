# 构建上下文为 backend/ 目录（Go module 根在 backend/，backend 目录自包含；
# 运行时数据 data/ 已由 backend/.dockerignore 排除，严禁进入构建上下文）。
# ---------- 构建阶段 ----------
FROM golang:1.26-alpine AS build

# 国内网络加速模块下载（默认启用 goproxy.cn，海外环境可改为默认代理或注释）
ENV GOPROXY=https://goproxy.cn,direct

WORKDIR /src

# 先复制依赖清单，最大化层缓存命中
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

COPY . .

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ant-torrent .

# ---------- 运行阶段 ----------
FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -g 1000 app && \
    adduser -D -u 1000 -G app app

# 主程序：WORKDIR=/app，data/ 落在 /app/data（卷挂载点）
COPY --from=build /out/ant-torrent /app/ant-torrent

WORKDIR /app
ENV GIN_MODE=release TZ=Asia/Shanghai
USER app
EXPOSE 8080

# 免登录健康端点（启用账号登录后 /api/servers 未登录会 401，不能再用作健康检查）
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/api/healthz || exit 1

ENTRYPOINT ["/app/ant-torrent"]
