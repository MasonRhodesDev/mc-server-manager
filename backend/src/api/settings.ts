import Elysia, { t } from "elysia";
import { db } from "../db/index.js";
import { requireAdmin } from "../middleware/auth.js";

export const settingsRoutes = new Elysia({ prefix: "/api/settings" })
  .use(requireAdmin)

  // GET /api/settings/auth
  .get("/auth", async () => {
    const providers = await db.selectFrom("auth_providers").selectAll().execute();
    const allowlist = await db.selectFrom("auth_allowlist").selectAll().execute();
    return {
      providers: providers.map(p => ({
        provider: p.provider,
        clientId: p.client_id,
        // Never return the secret
        enabled: p.enabled === 1,
        redirectUri: p.redirect_uri,
        configured: p.client_id.length > 0 && p.client_secret.length > 0,
      })),
      allowedEmails: allowlist.map(r => r.email),
    };
  })

  // POST /api/settings/auth/:provider
  .post("/auth/:provider", async ({ params, body }) => {
    const provider = params.provider;
    const patch: {
      client_id?: string;
      client_secret?: string;
      enabled: number;
      redirect_uri?: string;
    } = {
      enabled: body.enabled ? 1 : 0,
    };
    if (body.clientId !== undefined) patch.client_id = body.clientId;
    if (body.clientSecret) patch.client_secret = body.clientSecret;
    if (body.redirectUri !== undefined) patch.redirect_uri = body.redirectUri;

    await db
      .updateTable("auth_providers")
      .set(patch)
      .where("provider", "=", provider)
      .execute();

    if (body.allowedEmails !== undefined) {
      const emails = [...new Set(
        body.allowedEmails
          .map(e => e.trim().toLowerCase())
          .filter(e => e.includes("@"))
      )];
      await db.deleteFrom("auth_allowlist").execute();
      for (const email of emails) {
        await db.insertInto("auth_allowlist").values({ email }).execute();
      }
    }

    return { success: true };
  }, {
    params: t.Object({ provider: t.Literal("microsoft") }),
    body: t.Object({
      clientId: t.Optional(t.String()),
      clientSecret: t.Optional(t.String()),
      enabled: t.Boolean(),
      redirectUri: t.Optional(t.String()),
      allowedEmails: t.Optional(t.Array(t.String())),
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
