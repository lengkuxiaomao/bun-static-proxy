# ⚡ Bun Static Server

基于 **Bun + Hono** 的高性能前端静态资源托管服务，附带 API 反向代理能力。

> 用最少的代码、最快的运行时，托管你的前端应用。

## ✨ 特性

- 🚀 **极速** — Bun 原生 HTTP，吞吐量是 Node.js + Express 的 4-7 倍
- 📦 **零配置** — 放入 `dist` 目录即可运行，开箱即用
- 🔀 **API 代理** — 内置反向代理，前端直接调后端接口，无需处理跨域
- 🔌 **端口自适应** — 启动时自动检测端口占用，冲突时自动切换
- ⏱️ **超时保护** — 代理请求 85s 超时自动断开，返回 504，避免资源泄漏
- 🩺 **健康检查** — 内置 `/health-check` 端点，方便监控和负载均衡探活
- 📋 **请求日志** — 自动记录所有请求方法、路径和响应状态
- 💾 **智能缓存** — 静态资源强缓存 1 年，HTML/JSON 等入口文件禁用缓存
- 🏠 **SPA 支持** — 自动兜底到 `index.html`，完美支持前端路由

## 📁 项目结构

```
.
├── dist/            # ⚠️ 前端构建产物（必须叫 dist，放在项目根目录）
│   ├── index.html
│   ├── assets/
│   └── ...
├── server.js        # 服务入口
├── .env             # 环境变量配置
├── package.json
└── README.md
```

> [!IMPORTANT]
> **前端构建产物必须放在项目根目录的 `dist` 文件夹中，且不能重命名。** 服务固定从 `./dist` 目录读取静态资源，`dist/index.html` 作为 SPA 兜底入口。

## 🚀 快速开始

### 1. 安装 Bun

```bash
# 使用 npm 安装（全平台通用）
npm install -g bun

# 或者使用平台原生脚本安装：
# Windows
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

### 2. 安装依赖

```bash
bun install
```

### 3. 放入前端构建产物

将你的前端项目打包后的 `dist` 目录放到项目根目录下：

```bash
# 示例：从你的前端项目复制
cp -r /path/to/your-frontend/dist ./dist
```

### 4. 配置环境变量

复制并修改 `.env` 文件：

```bash
# 服务端口
PORT=3000

# 代理目标地址（你的后端 API 地址）
PROXY_TARGET=http://your-backend-api:9000

# 代理前缀路径（会被剥离后转发）
PROXY_PREFIX=/gateway
```

### 5. 启动服务

你可以选择使用 **Bun** 或 **npm** 来启动服务：

#### 使用 Bun 启动
```bash
# 生产模式
bun run start

# 开发模式（文件修改自动重启）
bun run dev
```

#### 使用 npm 启动
```bash
# 生产模式
npm run start

# 开发模式（文件修改自动重启）
npm run dev
```

启动后你会看到：

```
服务已启动!
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
[LOCAL]   http://localhost:3000
[HEALTH]  http://localhost:3000/health-check
[PROXY]   /gateway ➔ http://your-backend-api:9000
[ENGINE]  Bun + Hono 🔥
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
```

## 🔀 API 代理说明

所有以 `PROXY_PREFIX` 开头的请求会被自动转发到 `PROXY_TARGET`，前缀会被剥离：

| 前端请求 | 实际转发到 |
|---|---|
| `GET /gateway/auth/login` | `GET http://backend:9000/auth/login` |
| `POST /gateway/api/users` | `POST http://backend:9000/api/users` |
| `GET /gateway/api/data?page=1` | `GET http://backend:9000/api/data?page=1` |

## 💾 缓存策略

| 文件类型 | 策略 | 说明 |
|---|---|---|
| `.html` `.json` `.webmanifest` `sw.js` | `no-cache` | 每次请求都验证，确保更新即时生效 |
| 其他静态资源 (`.js` `.css` `.png` 等) | `max-age=31536000, immutable` | 强缓存 1 年，依赖文件名哈希更新 |

## 📋 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 服务监听端口 |
| `PROXY_TARGET` | `http://10.20.0.168:9000` | 后端 API 地址 |
| `PROXY_PREFIX` | `/gateway` | 代理前缀，匹配的请求会被转发 |

## 🩺 健康检查

```bash
curl http://localhost:3000/health-check
# => Bun + Hono Server is running!
```

## 📄 License

[ISC](LICENSE)
