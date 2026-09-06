# ---------- 构建阶段 ----------
FROM node:22-alpine AS build

# package.json 无 packageManager 字段；pnpm@10 与 lockfileVersion 9.0 匹配
# （追求完全可复现可固定小版本，如 pnpm@10.17.0）
# 国内网络可追加：--registry=https://registry.npmmirror.com
RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---------- 运行阶段 ----------
FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1
