import Elysia, { t } from "elysia";
import { db } from "../db/index.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { getContainerStatus, startContainer, stopContainer, containerLogs, disconnectNetwork } from "../services/docker.js";
import { deployServer, undeployServer } from "../services/deploy.js";
import { createTask, startTask, completeTask, failTask } from "../services/tasks.js";
import { logger } from "../lib/logger.js";

export const serverRoutes = new Elysia({ prefix: "/api/servers" })
  .use(requireAuth)

  // GET /api/servers
  .get("/", async ({ currentUser }) => {
    logger.info("servers.list", { userId: currentUser.id });
    const servers = await db.selectFrom("servers").selectAll().orderBy("created_at", "asc").execute();
    return { servers };
  })

  // POST /api/servers
  .post("/", async ({ body, set, currentUser }) => {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const now = new Date().toISOString();
    try {
      await db.insertInto("servers").values({
        id,
        name: body.name,
        server_type: body.serverType ?? "FTBA",
        modpack_id: body.modpackId ?? null,
        modpack_version_id: body.modpackVersionId ?? null,
        memory_gb: body.memoryGb ?? 8,
        init_memory_gb: body.initMemoryGb ?? 2,
        rcon_password: body.rconPassword,
        auto_scale_down_after: body.autoScaleDownAfter ?? "10m",
        server_hostname: body.serverHostname,
        server_port: body.serverPort,
        router_api_port: body.routerApiPort,
        state: "created",
        created_at: now,
        updated_at: now,
      }).execute();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("UNIQUE constraint failed: servers.name")) {
        set.status = 409;
        return { error: `A server named '${body.name}' already exists` };
      }
      throw err;
    }

    const server = await db.selectFrom("servers").selectAll().where("id", "=", id).executeTakeFirst();
    logger.audit("server.create", {
      userId: currentUser.id,
      username: currentUser.username,
      serverId: id,
      serverName: body.name,
      serverType: body.serverType ?? "FTBA",
    });
    set.status = 201;
    return { server };
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      serverType: t.Optional(t.String()),
      modpackId: t.Optional(t.Nullable(t.Number())),
      modpackVersionId: t.Optional(t.Nullable(t.Number())),
      memoryGb: t.Optional(t.Number()),
      initMemoryGb: t.Optional(t.Number()),
      rconPassword: t.String({ minLength: 1 }),
      autoScaleDownAfter: t.Optional(t.String()),
      serverHostname: t.String({ minLength: 1 }),
      serverPort: t.Number(),
      routerApiPort: t.Number(),
    }),
  })

  // GET /api/servers/:id
  .get("/:id", async ({ params, set }) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!server) { set.status = 404; return { error: "Server not found" }; }
    return { server };
  })

  // PUT /api/servers/:id
  .put("/:id", async ({ params, body, set, currentUser }) => {
    const existing = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!existing) { set.status = 404; return { error: "Server not found" }; }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.memoryGb !== undefined) updates.memory_gb = body.memoryGb;
    if (body.initMemoryGb !== undefined) updates.init_memory_gb = body.initMemoryGb;
    if (body.rconPassword !== undefined) updates.rcon_password = body.rconPassword;
    if (body.autoScaleDownAfter !== undefined) updates.auto_scale_down_after = body.autoScaleDownAfter;
    if (body.modpackVersionId !== undefined) updates.modpack_version_id = body.modpackVersionId;

    await db.updateTable("servers").set(updates as any).where("id", "=", params.id).execute();

    logger.audit("server.update", {
      userId: currentUser.id,
      username: currentUser.username,
      serverId: params.id,
      serverName: existing.name,
      changes: Object.keys(updates).filter(k => k !== "updated_at"),
    });

    const server = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    return { server };
  }, {
    body: t.Object({
      memoryGb: t.Optional(t.Number()),
      initMemoryGb: t.Optional(t.Number()),
      rconPassword: t.Optional(t.String()),
      autoScaleDownAfter: t.Optional(t.String()),
      modpackVersionId: t.Optional(t.Nullable(t.Number())),
    }),
  })

  // DELETE /api/servers/:id (admin only — removes DB record + tears down Docker resources)
  .use(requireAdmin)
  .delete("/:id", async ({ params, set, currentUser }) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!server) { set.status = 404; return { error: "Server not found" }; }

    // Block if a deploy is in flight — tearing down mid-deploy would leave things in a broken state
    const activeTask = await db.selectFrom("tasks").select("id")
      .where("server_id", "=", params.id)
      .where("kind", "=", "deploy")
      .where("status", "in", ["queued", "running"])
      .executeTakeFirst();
    if (activeTask) {
      set.status = 409;
      return { error: "Deploy is in progress — wait for it to finish before deleting.", taskId: activeTask.id };
    }

    // Tear down Docker resources; wrap so a Docker failure doesn't block the DB delete
    await undeployServer(server.name).catch(err =>
      logger.warn("server.delete_undeploy_failed", { serverId: params.id, error: String(err) })
    );

    await db.deleteFrom("servers").where("id", "=", params.id).execute();
    logger.audit("server.delete", {
      userId: currentUser.id,
      username: currentUser.username,
      serverId: params.id,
      serverName: server.name,
    });
    return { success: true };
  })

  // ── Control endpoints ─────────────────────────────────────────────────────

  // POST /api/servers/:id/control/deploy — create containers for the first time (or redeploy)
  .post("/:id/control/deploy", async ({ params, set, currentUser }) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!server) { set.status = 404; return { error: "Server not found" }; }

    // Reject if a deploy is already in flight
    const activeTask = await db
      .selectFrom("tasks")
      .select("id")
      .where("server_id", "=", params.id)
      .where("kind", "=", "deploy")
      .where("status", "in", ["queued", "running"])
      .executeTakeFirst();

    if (activeTask) {
      set.status = 409;
      return { error: "Deploy already in progress", taskId: activeTask.id };
    }

    logger.audit("server.deploy", {
      userId: currentUser.id,
      username: currentUser.username,
      serverId: server.id,
      serverName: server.name,
    });

    await db.updateTable("servers")
      .set({ state: "starting", updated_at: new Date().toISOString() })
      .where("id", "=", params.id)
      .execute();

    const { taskId, emit } = await createTask("deploy", server.id);

    // Run in background — images can take several minutes to pull
    (async () => {
      await startTask(taskId);
      await emit("task.started", { message: "Pulling images and creating containers…" });
      const result = await deployServer(server, emit);
      if (result.ok) {
        await completeTask(taskId);
        await db.updateTable("servers")
          .set({ state: "stopped", updated_at: new Date().toISOString() })
          .where("id", "=", params.id)
          .execute();
      } else {
        await failTask(taskId, result.error ?? "Deploy failed");
        logger.error("server.deploy_failed", { serverId: server.id, error: result.error });
        await db.updateTable("servers")
          .set({ state: "stopped", updated_at: new Date().toISOString() })
          .where("id", "=", params.id)
          .execute();
      }
    })();

    set.status = 202;
    return { taskId, status: "queued", message: "Deploy started — subscribe to task events for progress." };
  })

  // POST /api/servers/:id/control/start
  .post("/:id/control/start", async ({ params, set, currentUser }) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!server) { set.status = 404; return { error: "Server not found" }; }

    // Block start if a deploy task is in flight (replaces the dead server.state === "deploying" check)
    const activeDeployTask = await db
      .selectFrom("tasks")
      .select(["id"])
      .where("server_id", "=", params.id)
      .where("kind", "=", "deploy")
      .where("status", "in", ["queued", "running"])
      .executeTakeFirst();

    if (activeDeployTask) {
      set.status = 409;
      return { error: "Server is currently being deployed — wait for it to finish before starting.", taskId: activeDeployTask.id };
    }

    logger.audit("server.start", {
      userId: currentUser.id,
      username: currentUser.username,
      serverId: server.id,
      serverName: server.name,
    });

    let [gameResult, routerResult] = await Promise.all([
      startContainer(server.name),
      startContainer(`${server.name}-router`),
    ]);

    // If start failed because a referenced network is missing (stale mc-proxy reference),
    // disconnect the dead network and retry once.
    if (!gameResult.ok && gameResult.networkMissing && gameResult.missingNetwork) {
      logger.warn("servers.fixing_stale_network", {
        serverId: server.id,
        container: server.name,
        network: gameResult.missingNetwork,
      });
      await disconnectNetwork(gameResult.missingNetwork, server.name);
      gameResult = await startContainer(server.name);
    }

    if (!gameResult.ok || !routerResult.ok) {
      // One or both containers missing — DB is out of sync; snap back to 'created'
      // so the UI shows Deploy instead of Start on next load.
      if (gameResult.notFound || routerResult.notFound) {
        await db.updateTable("servers")
          .set({ state: "created", updated_at: new Date().toISOString() })
          .where("id", "=", params.id)
          .execute();
        set.status = 409;
        return {
          error: "Server containers are missing — please redeploy the server.",
          detail: { game: gameResult, router: routerResult },
        };
      }
      set.status = 503;
      return {
        error: gameResult.error ?? routerResult.error ?? "Failed to start containers",
        detail: { game: gameResult, router: routerResult },
      };
    }

    await db.updateTable("servers")
      .set({ state: "starting", updated_at: new Date().toISOString() })
      .where("id", "=", params.id)
      .execute();
    return { status: "starting" };
  })

  // POST /api/servers/:id/control/stop
  .post("/:id/control/stop", async ({ params, set, currentUser }) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!server) { set.status = 404; return { error: "Server not found" }; }

    logger.audit("server.stop", {
      userId: currentUser.id,
      username: currentUser.username,
      serverId: server.id,
      serverName: server.name,
    });

    const result = await stopContainer(server.name);
    if (!result.ok) {
      // Container already gone — treat as stopped/undeployed and sync DB state
      if (result.notFound) {
        await db.updateTable("servers")
          .set({ state: "created", updated_at: new Date().toISOString() })
          .where("id", "=", params.id)
          .execute();
        return { status: "created" };
      }
      set.status = 503;
      return { error: result.error ?? "Failed to stop container" };
    }

    await db.updateTable("servers")
      .set({ state: "stopped", updated_at: new Date().toISOString() })
      .where("id", "=", params.id)
      .execute();
    return { status: "stopped" };
  })

  // GET /api/servers/:id/status
  .get("/:id/status", async ({ params, set }) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!server) { set.status = 404; return { error: "Server not found" }; }
    const containers = await getContainerStatus(server.name);
    return { serverId: params.id, containers };
  })

  // GET /api/servers/:id/logs?lines=100
  .get("/:id/logs", async ({ params, query, set }) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!server) { set.status = 404; return { error: "Server not found" }; }
    const lines = Number(query.lines ?? 100);
    const logs = await containerLogs(server.name, lines);
    return { logs };
  }, { query: t.Object({ lines: t.Optional(t.String()) }) });
