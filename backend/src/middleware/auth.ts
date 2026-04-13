import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db } from "../db/index.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";

export const jwtPlugin = jwt({
  name: "jwt",
  secret: JWT_SECRET,
  exp: "7d",
});

export type JWTPayload = {
  userId: string;
  role: "admin" | "operator" | "viewer";
};

// Middleware plugin: requires valid JWT, injects user into context
export const requireAuth = new Elysia({ name: "require-auth" })
  .use(jwtPlugin)
  .derive({ as: "scoped" }, async ({ jwt, headers, set }) => {
    const auth = headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      set.status = 401;
      throw new Error("Unauthorized");
    }

    const payload = await jwt.verify(token) as JWTPayload | false;
    if (!payload) {
      set.status = 401;
      throw new Error("Invalid or expired token");
    }

    const user = await db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", payload.userId)
      .executeTakeFirst();

    if (!user) {
      set.status = 401;
      throw new Error("User not found");
    }

    return { currentUser: user };
  });

// Admin-only guard
export const requireAdmin = new Elysia({ name: "require-admin" })
  .use(requireAuth)
  .derive({ as: "scoped" }, ({ currentUser, set }) => {
    if (currentUser.role !== "admin") {
      set.status = 403;
      throw new Error("Forbidden: admin role required");
    }
    return {};
  });
