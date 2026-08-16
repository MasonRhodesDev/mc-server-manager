import Elysia, { t } from "elysia";
import { db } from "../db/index.js";
import { jwtPlugin, requireAuth, type JWTPayload } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";

// OAuth state map (in-memory; fine for single-instance)
const oauthStates = new Map<string, { provider: string; createdAt: number }>();
const STATE_TTL_MS = 10 * 60 * 1000;

function generateState(): string {
  return crypto.randomUUID();
}

// Clean stale states
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of oauthStates) {
    if (now - v.createdAt > STATE_TTL_MS) oauthStates.delete(k);
  }
}, 60_000);

// ── OAuth provider configs ────────────────────────────────────────────────────

function getOAuthUrl(provider: "discord" | "github" | "google", clientId: string, redirectUri: string, state: string): string {
  switch (provider) {
    case "discord":
      return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify+email&state=${state}`;
    case "github":
      return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user+user:email&state=${state}`;
    case "google":
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid+email+profile&state=${state}`;
  }
}

async function exchangeCode(
  provider: "discord" | "github" | "google",
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ id: string; email: string; username: string; avatarUrl: string | null }> {
  // Exchange code for access token
  let tokenRes: Response;
  switch (provider) {
    case "discord": {
      tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri }),
      });
      const tokenData = await tokenRes.json() as any;
      const me = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      const u = await me.json() as any;
      return { id: u.id, email: u.email, username: u.username, avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : null };
    }
    case "github": {
      tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
      });
      const tokenData = await tokenRes.json() as any;
      const me = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "mc-server-manager/1.0" } });
      const u = await me.json() as any;
      return { id: String(u.id), email: u.email ?? `${u.login}@github`, username: u.login, avatarUrl: u.avatar_url ?? null };
    }
    case "google": {
      tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri }),
      });
      const tokenData = await tokenRes.json() as any;
      const me = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      const u = await me.json() as any;
      return { id: u.id, email: u.email, username: u.name.replace(/\s+/g, "_").toLowerCase(), avatarUrl: u.picture ?? null };
    }
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(jwtPlugin)

  // POST /api/auth/dev-login — development only, creates/returns a local test user
  .post("/dev-login", async ({ jwt, set, body }) => {
    if (process.env.NODE_ENV === "production") {
      set.status = 404;
      return { error: "Not found" };
    }

    const username = (body as any)?.username ?? "devuser";
    const provider = "dev";
    const providerId = `dev-${username}`;

    let user = await db.selectFrom("users").selectAll()
      .where("provider", "=", provider)
      .where("provider_id", "=", providerId)
      .executeTakeFirst();

    if (!user) {
      const userCount = await db.selectFrom("users").select(db.fn.count("id").as("count")).executeTakeFirst();
      const isFirst = Number(userCount?.count ?? 0) === 0;
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      await db.insertInto("users").values({
        id,
        email: `${username}@localhost`,
        username,
        avatar_url: null,
        role: isFirst ? "admin" : "viewer",
        provider,
        provider_id: providerId,
        created_at: new Date().toISOString(),
      }).execute();
      user = await db.selectFrom("users").selectAll().where("id", "=", id).executeTakeFirst();
    }

    if (!user) { set.status = 500; return { error: "Failed to create dev user" }; }

    const token = await jwt.sign({ userId: user.id, role: user.role } satisfies JWTPayload);
    logger.audit("auth.dev_login", { userId: user.id, username: user.username, role: user.role });
    return { token, user: { id: user.id, email: user.email, username: user.username, avatarUrl: user.avatar_url, role: user.role } };
  })

  // GET /api/auth/providers — list configured/enabled providers
  .get("/providers", async () => {
    const rows = await db.selectFrom("auth_providers").selectAll().execute();
    return {
      providers: rows.map(r => ({
        provider: r.provider,
        enabled: r.enabled === 1,
        configured: r.client_id.length > 0,
      })),
    };
  })

  // GET /api/auth/login?provider=discord
  .get("/login", async ({ query, set }) => {
    const provider = query.provider as "discord" | "github" | "google";
    const row = await db.selectFrom("auth_providers").selectAll().where("provider", "=", provider).executeTakeFirst();
    if (!row || !row.enabled || !row.client_id) {
      set.status = 400;
      return { error: `Provider '${provider}' is not configured or disabled` };
    }
    const state = generateState();
    oauthStates.set(state, { provider, createdAt: Date.now() });
    return { redirect_uri: getOAuthUrl(provider, row.client_id, row.redirect_uri, state) };
  }, { query: t.Object({ provider: t.String() }) })

  // GET /api/auth/callback?code=...&state=...
  .get("/callback", async ({ query, jwt, set }) => {
    const { code, state } = query;
    const stateData = oauthStates.get(state);
    if (!stateData) { set.status = 400; return { error: "Invalid or expired state" }; }
    oauthStates.delete(state);

    const provider = stateData.provider as "discord" | "github" | "google";
    const row = await db.selectFrom("auth_providers").selectAll().where("provider", "=", provider).executeTakeFirst();
    if (!row) { set.status = 500; return { error: "Provider config missing" }; }

    const profile = await exchangeCode(provider, code, row.client_id, row.client_secret, row.redirect_uri);

    // Upsert user
    const existingUser = await db.selectFrom("users").selectAll().where("provider", "=", provider).where("provider_id", "=", profile.id).executeTakeFirst();

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      await db.updateTable("users")
        .set({ avatar_url: profile.avatarUrl, username: profile.username })
        .where("id", "=", userId)
        .execute();
    } else {
      // Check if this is the first user — make them admin
      const userCount = await db.selectFrom("users").select(db.fn.count("id").as("count")).executeTakeFirst();
      const isFirst = Number(userCount?.count ?? 0) === 0;
      userId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      await db.insertInto("users").values({
        id: userId,
        email: profile.email,
        username: profile.username,
        avatar_url: profile.avatarUrl,
        role: isFirst ? "admin" : "viewer",
        provider,
        provider_id: profile.id,
        created_at: new Date().toISOString(),
      }).execute();
    }

    const user = await db.selectFrom("users").selectAll().where("id", "=", userId).executeTakeFirst();
    if (!user) { set.status = 500; return { error: "Failed to create user" }; }

    const token = await jwt.sign({ userId, role: user.role } satisfies JWTPayload);
    logger.audit("auth.login", {
      userId: user.id,
      username: user.username,
      provider,
      role: user.role,
      isNewUser: !existingUser,
    });
    return { token, user: { id: user.id, email: user.email, username: user.username, avatarUrl: user.avatar_url, role: user.role } };
  }, { query: t.Object({ code: t.String(), state: t.String() }) })

  // GET /api/auth/me
  .use(requireAuth)
  .get("/me", ({ currentUser }) => ({
    user: { id: currentUser.id, email: currentUser.email, username: currentUser.username, avatarUrl: currentUser.avatar_url, role: currentUser.role },
  }))

  // POST /api/auth/logout — client drops token; server records nothing (stateless JWT)
  .post("/logout", ({ currentUser }) => {
    logger.audit("auth.logout", { userId: currentUser.id, username: currentUser.username });
    return { success: true };
  });
