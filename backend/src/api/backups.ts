import Elysia, { t } from "elysia";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { runBackupWithTask, runRestoreWithTask } from "../services/backups.js";
import { createTask, startTask, completeTask, failTask } from "../services/tasks.js";

export const backupRoutes = new Elysia({ prefix: "/api/servers/:id/backups" })
  .use(requireAuth)

  // GET /api/servers/:id/backups
  .get("/", async ({ params }) => {
    const backups = await db
      .selectFrom("backups")
      .selectAll()
      .where("server_id", "=", params.id)
      .orderBy("created_at", "desc")
      .execute();
    return { backups };
  })

  // POST /api/servers/:id/backups/create
  .post("/create", async ({ params, body, set, currentUser }) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!server) { set.status = 404; return { error: "Server not found" }; }

    const label = body.label ?? (body.manual ? "Manual backup" : "Auto backup");
    const type  = body.manual ? "manual" as const : "auto" as const;

    logger.audit("backup.create", {
      userId: currentUser.id,
      username: currentUser.username,
      serverId: server.id,
      serverName: server.name,
      label,
      type,
    });

    const { taskId, emit } = await createTask("backup", server.id);

    (async () => {
      await startTask(taskId);
      await emit("task.started", { message: `Creating ${type} backup: ${label}` });
      try {
        const result = await runBackupWithTask(server.id, server.name, label, type, emit);
        // Fetch the full backup record to include in the success payload
        const backup = await db
          .selectFrom("backups")
          .selectAll()
          .where("id", "=", result.backupId)
          .executeTakeFirst();
        await completeTask(taskId, backup ?? null);
      } catch (err) {
        logger.error("backup.failed", { serverId: server.id, error: String(err) });
        await failTask(taskId, String(err));
      }
    })();

    set.status = 202;
    return { taskId, status: "queued" };
  }, {
    body: t.Object({
      manual: t.Optional(t.Boolean()),
      label: t.Optional(t.String()),
    }),
  })

  // POST /api/servers/:id/backups/:backupId/restore
  .post("/:backupId/restore", async ({ params, set, currentUser }) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!server) { set.status = 404; return { error: "Server not found" }; }

    const backup = await db.selectFrom("backups").selectAll().where("id", "=", params.backupId).executeTakeFirst();
    if (!backup) { set.status = 404; return { error: "Backup not found" }; }

    logger.audit("backup.restore", {
      userId: currentUser.id,
      username: currentUser.username,
      serverId: server.id,
      serverName: server.name,
      backupId: backup.id,
      backupLabel: backup.label,
      filePath: backup.file_path,
    });

    const { taskId, emit } = await createTask("restore", server.id);

    (async () => {
      await startTask(taskId);
      await emit("task.started", { message: `Restoring from: ${backup.label}` });
      try {
        await runRestoreWithTask(server.id, server.name, backup.file_path, backup.label, emit);
        await completeTask(taskId, { restoredFrom: backup.label, restoredAt: new Date().toISOString() });
      } catch (err) {
        logger.error("restore.failed", { serverId: server.id, backupId: backup.id, error: String(err) });
        await failTask(taskId, String(err));
      }
    })();

    set.status = 202;
    return { taskId, status: "queued" };
  })

  // DELETE /api/servers/:id/backups/:backupId
  .delete("/:backupId", async ({ params, set, currentUser }) => {
    const backup = await db.selectFrom("backups").selectAll().where("id", "=", params.backupId).executeTakeFirst();
    if (!backup) { set.status = 404; return { error: "Backup not found" }; }

    logger.audit("backup.delete", {
      userId: currentUser.id,
      username: currentUser.username,
      backupId: backup.id,
      filePath: backup.file_path,
    });

    await import("fs/promises").then(fs => fs.unlink(backup.file_path).catch(() => {}));
    await db.deleteFrom("backups").where("id", "=", params.backupId).execute();
    return { success: true };
  });
