import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";

import { authRoutes } from "./api/auth.js";
import { serverRoutes } from "./api/servers.js";
import { backupRoutes } from "./api/backups.js";
import { ftbRoutes } from "./api/ftb.js";
import { settingsRoutes } from "./api/settings.js";

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

  // Health check
  .get("/health", () => ({ status: "ok", ts: new Date().toISOString() }))

  // API routes
  .use(authRoutes)
  .use(serverRoutes)
  .use(backupRoutes)
  .use(ftbRoutes)
  .use(settingsRoutes)

  // 404 catch-all
  .all("*", ({ set }) => {
    set.status = 404;
    return { error: "Not found" };
  })

  .listen(PORT);

console.log(`MC Server Manager backend running on http://0.0.0.0:${PORT}`);
console.log(`  Swagger UI: http://localhost:${PORT}/swagger`);
