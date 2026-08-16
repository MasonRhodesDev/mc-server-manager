import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";

import { authRoutes } from "./api/auth.js";
import { serverRoutes } from "./api/servers.js";
import { backupRoutes } from "./api/backups.js";
import { ftbRoutes } from "./api/ftb.js";
import { settingsRoutes } from "./api/settings.js";
import { taskSnapshotRoutes, taskStreamRoutes } from "./api/tasks.js";
import { logger } from "./lib/logger.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = new Elysia()
  .use(cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
  }))
  .use(swagger({
    documentation: {
      info: { title: "MC Server Manager API", version: "1.0.0" },
    },
  }))

  // ── Per-request logging ───────────────────────────────────────────────────
  .derive(() => ({ _reqStart: Date.now() }))

  .onAfterResponse(({ request, set, _reqStart }) => {
    const ms = Date.now() - _reqStart;
    const url = new URL(request.url);
    if (url.pathname.startsWith("/swagger")) return; // skip swagger noise
    logger.info("http", {
      method: request.method,
      path: url.pathname,
      status: set.status ?? 200,
      ms,
      ip: request.headers.get("x-forwarded-for")
        ?? request.headers.get("x-real-ip")
        ?? "local",
    });
  })

  .onError(({ request, error, set, _reqStart }) => {
    const ms = Date.now() - (_reqStart ?? 0);
    const url = new URL(request.url);
    logger.error("http_error", {
      method: request.method,
      path: url.pathname,
      status: set.status ?? 500,
      ms,
      error: error instanceof Error ? error.message : String(error),
    });
  })

  // ── Health check ─────────────────────────────────────────────────────────
  .get("/health", () => ({ status: "ok", ts: new Date().toISOString() }))

  // ── API routes ────────────────────────────────────────────────────────────
  .use(authRoutes)
  .use(serverRoutes)
  .use(backupRoutes)
  .use(ftbRoutes)
  .use(settingsRoutes)
  .use(taskSnapshotRoutes)
  .use(taskStreamRoutes)

  // ── 404 catch-all ────────────────────────────────────────────────────────
  .all("*", ({ set }) => {
    set.status = 404;
    return { error: "Not found" };
  })

  .listen(PORT);

logger.info("startup", {
  port: PORT,
  swagger: `http://localhost:${PORT}/swagger`,
  env: process.env.NODE_ENV ?? "development",
});
