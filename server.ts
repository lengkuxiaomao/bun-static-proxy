import { Hono } from "hono";
import type { Context } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { createServer } from "net";
import { resolve } from "node:path";

const app = new Hono();

const preferredPort: number = parseInt(process.env.PORT || "80");
const proxyTarget: string = process.env.PROXY_TARGET || "http://127.0.0.1:80";
const proxyPrefix: string = process.env.PROXY_PREFIX || "";
const prefixRegex: RegExp = new RegExp(`^${proxyPrefix}`);

// 【静态资源路径】支持从环境变量 DIST_DIR 读取，默认为 ./dist
const distPath: string = resolve(process.env.DIST_DIR || "./dist");

// 【端口检测】检查端口是否可用
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}

// 【端口检测】从指定端口开始，找到第一个可用端口
async function findAvailablePort(
  startPort: number,
  maxAttempts: number = 10,
): Promise<number> {
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
app.get("/health-check", (c: Context) =>
  c.text("Bun + Hono Server is running!"),
);

// 【代理】
app.all(`${proxyPrefix}/*`, proxyHandler);
app.all(proxyPrefix, proxyHandler);

async function proxyHandler(c: Context): Promise<Response> {
  const rewrittenPath: string = c.req.path.replace(prefixRegex, "") || "/";
  const query: string = c.req.url.includes("?")
    ? c.req.url.slice(c.req.url.indexOf("?"))
    : "";
  const targetUrl: string = `${proxyTarget}${rewrittenPath}${query}`;

  try {
    const headers = new Headers(c.req.raw.headers);
    headers.delete("host");

    const res: Response = await fetch(targetUrl, {
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
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      console.error(`[Proxy] 超时: ${targetUrl}`);
      return c.text("Gateway Timeout", 504);
    }
    console.error(`[Proxy] 错误: ${error.message}`);
    return c.text("Proxy Error", 500);
  }
}

// 【静态资源】
app.use(
  "/*",
  serveStatic({
    root: distPath,
    onFound: (_path: string, c: Context) => {
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
const indexFile: ReturnType<typeof Bun.file> = Bun.file(
  resolve(distPath, "index.html"),
);

app.get("*", async (c: Context): Promise<Response> => {
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
const port: number = await findAvailablePort(preferredPort);

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  idleTimeout: 90,
  fetch: app.fetch,
});

// 【打印】
const bold: string = "\x1b[1m";
const reset: string = "\x1b[0m";
const gray: string = "\x1b[90m";
const orange: string = "\x1b[38;5;208m";
const cyan: string = "\x1b[36m";
const magenta: string = "\x1b[35m";

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
