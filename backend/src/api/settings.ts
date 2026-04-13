import Elysia, { t } from "elysia";
import { db } from "../db/index.js";
import { requireAdmin } from "../middleware/auth.js";

export const settingsRoutes = new Elysia({ prefix: "/api/settings" })
  .use(requireAdmin)

  // GET /api/settings/auth
  .get("/auth", async () => {
    const providers = await db.selectFrom("auth_providers").selectAll().execute();
    return {
      providers: providers.map(p => ({
        provider: p.provider,
        clientId: p.client_id,
        // Never return the secret
        enabled: p.enabled === 1,
        redirectUri: p.redirect_uri,
        configured: p.client_id.length > 0 && p.client_secret.length > 0,
      })),
    };
  })

  // POST /api/settings/auth/:provider
  .post("/auth/:provider", async ({ params, body, set }) => {
    const provider = params.provider as "discord" | "github" | "google";
    const allowed = ["discord", "github", "google"];
    if (!allowed.includes(provider)) {
      set.status = 400;
      return { error: "Invalid provider" };
    }

    await db
      .updateTable("auth_providers")
      .set({
        client_id: body.clientId ?? "",
        client_secret: body.clientSecret ?? "",
        enabled: body.enabled ? 1 : 0,
        redirect_uri: body.redirectUri ?? "",
      })
      .where("provider", "=", provider)
      .execute();

    return { success: true };
  }, {
    body: t.Object({
      clientId: t.Optional(t.String()),
      clientSecret: t.Optional(t.String()),
      enabled: t.Boolean(),
      redirectUri: t.Optional(t.String()),
    }),
  })

  // GET /api/settings/system
  .get("/system", () => ({
    settings: {
      dataPath: process.env.DATA_PATH ?? "/mnt/user/appdata/minecraft",
      backupsPath: process.env.BACKUPS_PATH ?? "/mnt/user/appdata/minecraft-backups",
      defaultMemoryGb: Number(process.env.DEFAULT_MEMORY_GB ?? 8),
      ftbCacheTtlHours: Number(process.env.FTB_CACHE_TTL_HOURS ?? 1),
    },
  }));
