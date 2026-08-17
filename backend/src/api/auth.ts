import Elysia, { t } from "elysia";
import { db } from "../db/index.js";
import { jwtPlugin, requireAuth, type JWTPayload } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";

const MS_AUTHORIZE = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const MS_TOKEN = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const MS_GRAPH_ME = "https://graph.microsoft.com/v1.0/me";
const MS_SCOPE = "openid profile email User.Read";

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getOAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MS_SCOPE,
    state,
  });
  return `${MS_AUTHORIZE}?${params.toString()}`;
}

function slugUsername(displayName: string, email: string): string {
  const fromName = displayName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (fromName.length > 0) return fromName;
  const local = email.split("@")[0] ?? "user";
  const fromEmail = local.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return fromEmail.length > 0 ? fromEmail : "user";
}

async function uniqueUsername(base: string, providerId: string): Promise<string> {
  const existing = await db
    .selectFrom("users")
    .select(["provider_id"])
    .where("username", "=", base)
    .executeTakeFirst();
  if (!existing || existing.provider_id === providerId) return base;
  return `${base}_${providerId.slice(0, 8)}`;
}

async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ id: string; email: string; username: string; avatarUrl: string | null }> {
  const tokenRes = await fetch(MS_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      scope: MS_SCOPE,
    }),
  });
  const tokenJson: unknown = await tokenRes.json();
  if (!isObject(tokenJson)) throw new Error("Invalid token response from Microsoft");
  const accessToken = stringField(tokenJson, "access_token");
  if (!accessToken) {
    const description = stringField(tokenJson, "error_description") ?? "Microsoft token exchange failed";
    throw new Error(description);
  }

  const meRes = await fetch(MS_GRAPH_ME, { headers: { Authorization: `Bearer ${accessToken}` } });
  const meJson: unknown = await meRes.json();
  if (!isObject(meJson)) throw new Error("Invalid profile response from Microsoft Graph");

  const id = stringField(meJson, "id");
  const mail = stringField(meJson, "mail");
  const upn = stringField(meJson, "userPrincipalName");
  const displayName = stringField(meJson, "displayName") ?? "";
  const email = (mail ?? upn)?.toLowerCase();
  if (!id || !email) throw new Error("Microsoft account did not return an id and email");

  return {
    id,
    email,
    username: slugUsername(displayName, email),
    avatarUrl: null,
  };
}

async function isEmailAllowed(email: string): Promise<boolean> {
  const rows = await db.selectFrom("auth_allowlist").selectAll().execute();
  if (rows.length === 0) return true;
  return rows.some(r => r.email === email);
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

    const username = body.username ?? "devuser";
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
  }, {
    body: t.Object({ username: t.Optional(t.String()) }),
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

  // GET /api/auth/login?provider=microsoft
  .get("/login", async ({ query, set }) => {
    const provider = query.provider;
    const row = await db.selectFrom("auth_providers").selectAll().where("provider", "=", provider).executeTakeFirst();
    if (!row || !row.enabled || !row.client_id) {
      set.status = 400;
      return { error: `Provider '${provider}' is not configured or disabled` };
    }
    const state = generateState();
    oauthStates.set(state, { provider, createdAt: Date.now() });
    return { redirect_uri: getOAuthUrl(row.client_id, row.redirect_uri, state) };
  }, { query: t.Object({ provider: t.Literal("microsoft") }) })

  // GET /api/auth/callback?code=...&state=...
  .get("/callback", async ({ query, jwt, set }) => {
    const { code, state } = query;
    const stateData = oauthStates.get(state);
    if (!stateData) { set.status = 400; return { error: "Invalid or expired state" }; }
    oauthStates.delete(state);

    const provider = stateData.provider;
    if (provider !== "microsoft") {
      set.status = 400;
      return { error: "Invalid provider" };
    }
    const row = await db.selectFrom("auth_providers").selectAll().where("provider", "=", provider).executeTakeFirst();
    if (!row) { set.status = 500; return { error: "Provider config missing" }; }

    let profile: { id: string; email: string; username: string; avatarUrl: string | null };
    try {
      profile = await exchangeCode(code, row.client_id, row.client_secret, row.redirect_uri);
    } catch (err) {
      set.status = 502;
      return { error: err instanceof Error ? err.message : "OAuth exchange failed" };
    }

    if (!(await isEmailAllowed(profile.email))) {
      set.status = 403;
      logger.audit("auth.denied", { email: profile.email, provider });
      return { error: "This Microsoft account is not allowed" };
    }

    const username = await uniqueUsername(profile.username, profile.id);

    // Upsert user
    const existingUser = await db.selectFrom("users").selectAll().where("provider", "=", provider).where("provider_id", "=", profile.id).executeTakeFirst();

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      await db.updateTable("users")
        .set({ avatar_url: profile.avatarUrl, username, email: profile.email })
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
        username,
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
