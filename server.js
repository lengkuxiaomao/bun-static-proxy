import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { createServer } from "net";
import { resolve } from "node:path";

const app = new Hono();

const preferredPort = parseInt(process.env.PORT || "3000");
const proxyTarget = process.env.PROXY_TARGET || "http://10.20.0.168:9000";
const proxyPrefix = process.env.PROXY_PREFIX || "/gateway";
const prefixRegex = new RegExp(`^${proxyPrefix}`);

// 【静态资源路径】支持从环境变量 DIST_DIR 读取，默认为 ./dist
const distPath = resolve(process.env.DIST_DIR || "./dist");

// 【端口检测】检查端口是否可用
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}

// 【端口检测】从指定端口开始，找到第一个可用端口
async function findAvailablePort(startPort, maxAttempts = 10) {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    if (await isPortAvailable(port)) {
      if (port !== startPort) {
        console.warn(`[启动] 端口 ${startPort} 被占用，切换到 ${port}`);
      }
      return port;
    }
    console.warn(`[启动] 端口 ${port} 被占用，尝试 ${port + 1}...`);
  }
  throw new Error(
    `[启动] 无可用端口 (${startPort}-${startPort + maxAttempts - 1})`,
  );
}

// 【日志】
app.use("*", logger());

// 【心跳】
app.get("/health-check", (c) => c.text("Bun + Hono Server is running!"));

// 【代理】
app.all(`${proxyPrefix}/*`, proxyHandler);
app.all(proxyPrefix, proxyHandler);

async function proxyHandler(c) {
  const rewrittenPath = c.req.path.replace(prefixRegex, "") || "/";
  const query = c.req.url.includes("?")
    ? c.req.url.slice(c.req.url.indexOf("?"))
    : "";
  const targetUrl = `${proxyTarget}${rewrittenPath}${query}`;

  try {
    const headers = new Headers(c.req.raw.headers);
    headers.delete("host");

    const res = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body:
        c.req.method === "GET" || c.req.method === "HEAD"
          ? undefined
          : c.req.raw.body,
      signal: AbortSignal.timeout(85000),
    });

    if (res.status === 404) {
      console.warn(`[Proxy] 后端 404: ${targetUrl}`);
    }

    return res;
  } catch (err) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      console.error(`[Proxy] 超时: ${targetUrl}`);
      return c.text("Gateway Timeout", 504);
    }
    console.error(`[Proxy] 错误: ${err.message}`);
    return c.text("Proxy Error", 500);
  }
}

// 【静态资源】
app.use(
  "/*",
  serveStatic({
    root: distPath,
    onFound: (_path, c) => {
      if (
        _path.endsWith(".html") ||
        _path.endsWith(".json") ||
        _path.endsWith(".webmanifest") ||
        _path.endsWith("sw.js")
      ) {
        c.header("Cache-Control", "no-cache, no-store, must-revalidate");
      } else {
        c.header("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);

// 【SPA 兜底】
const indexFile = Bun.file(resolve(distPath, "index.html"));

app.get("*", async (c) => {
  if (await indexFile.exists()) {
    return new Response(indexFile, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  }
  return c.text("Not Found", 404);
});

// 【启动】
const port = await findAvailablePort(preferredPort);

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  idleTimeout: 90,
  fetch: app.fetch,
});

// 【打印】
const bold = "\x1b[1m";
const reset = "\x1b[0m";
const gray = "\x1b[90m";
const orange = "\x1b[38;5;208m";
const cyan = "\x1b[36m";
const magenta = "\x1b[35m";

console.log(
  `
  ${orange}服务已启动!${reset}
  ${gray}┈${reset}`.padEnd(55, "┈") +
    `
  ${gray}[LOCAL]${reset}   ${cyan}http://localhost:${server.port}${reset}
  ${gray}[HEALTH]${reset}  ${cyan}http://localhost:${server.port}/health-check${reset}
  ${gray}[PROXY]${reset}   ${bold}${proxyPrefix}${reset} ${gray}➔${reset} ${gray}${proxyTarget}${reset}
  ${gray}[STATIC]${reset}  ${cyan}${distPath}${reset}
  ${gray}[ENGINE]${reset}  ${magenta}Bun${reset} ${gray}+${reset} ${orange}Hono 🔥${reset}
  ${gray}┈${reset}`.padEnd(55, "┈") +
    "\n",
);
