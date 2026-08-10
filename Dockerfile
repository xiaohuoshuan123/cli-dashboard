# 草料二维码安全设备看板 — 容器部署镜像
# 适用：腾讯云 CloudBase 云托管 / Fly.io / 轻量云+Coolify / 任意 Docker 平台
# Zeabur / Render 可不使用此文件（它们从 package.json 自动构建 Node 服务）。
FROM node:20-alpine

WORKDIR /app

# 先拷贝依赖清单，利用层缓存加速构建
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# 拷贝应用源码（.dockerignore 已排除 node_modules / .env / .workbuddy 等）
COPY . .

# 平台会注入 $PORT；这里仅声明惯例端口
EXPOSE 3000

CMD ["node", "server.js"]
