import Elysia, { t } from "elysia";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { inspectContainer } from "../services/docker.js";
import { join } from "path";
import { $ } from "bun";

const BACKUPS_PATH = process.env.BACKUPS_PATH ?? "/mnt/user/appdata/minecraft-backups";
const DATA_PATH = process.env.DATA_PATH ?? "/mnt/user/appdata/minecraft";

async function runBackup(serverName: string, label: string, type: "auto" | "manual"): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${serverName}-${type}-${ts}.tar.gz`;
  const dir = join(BACKUPS_PATH, serverName);
  const dest = join(dir, filename);

  await $`mkdir -p ${dir}`;

  const container = await inspectContainer(serverName);
  if (container?.State.Running) {
    // Save-flush via rcon-cli inside the container
    await $`docker exec ${serverName} rcon-cli save-off`.nothrow();
    await $`docker exec ${serverName} rcon-cli save-all`.nothrow();
  }

  const dataDir = join(DATA_PATH, serverName, "data");
  await $`tar czf ${dest} -C ${dataDir} .`;

  if (container?.State.Running) {
    await $`docker exec ${serverName} rcon-cli save-on`.nothrow();
  }

  return dest;
}

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
  .post("/create", async ({ params, body, set }) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!server) { set.status = 404; return { error: "Server not found" }; }

    const label = body.label ?? (body.manual ? "Manual backup" : "Auto backup");
    const type = body.manual ? "manual" as const : "auto" as const;

    const filePath = await runBackup(server.name, label, type);

    // Get file size
    const stat = await import("fs/promises").then(fs => fs.stat(filePath).catch(() => ({ size: 0 })));

    const backupId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    await db.insertInto("backups").values({
      id: backupId,
      server_id: params.id,
      label,
      file_path: filePath,
      size_bytes: stat.size,
      type,
    }).execute();

    const backup = await db.selectFrom("backups").selectAll().where("id", "=", backupId).executeTakeFirst();
    set.status = 201;
    return { backup };
  }, {
    body: t.Object({
      manual: t.Optional(t.Boolean()),
      label: t.Optional(t.String()),
    }),
  })

  // POST /api/servers/:id/backups/:backupId/restore
  .post("/:backupId/restore", async ({ params, set }) => {
    const server = await db.selectFrom("servers").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!server) { set.status = 404; return { error: "Server not found" }; }

    const backup = await db.selectFrom("backups").selectAll().where("id", "=", params.backupId).executeTakeFirst();
    if (!backup) { set.status = 404; return { error: "Backup not found" }; }

    const dataDir = join(DATA_PATH, server.name, "data");

    // Stop game server
    await $`docker stop ${server.name}`.nothrow();

    // Wipe and restore
    await $`rm -rf ${dataDir}`;
    await $`mkdir -p ${dataDir}`;
    await $`tar xzf ${backup.file_path} -C ${dataDir}`;

    await db.updateTable("servers").set({ state: "stopped", updated_at: new Date().toISOString() }).where("id", "=", params.id).execute();

    return { success: true, restoredFrom: backup.label, restoredAt: new Date().toISOString() };
  })

  // DELETE /api/servers/:id/backups/:backupId
  .delete("/:backupId", async ({ params, set }) => {
    const backup = await db.selectFrom("backups").selectAll().where("id", "=", params.backupId).executeTakeFirst();
    if (!backup) { set.status = 404; return { error: "Backup not found" }; }

    await import("fs/promises").then(fs => fs.unlink(backup.file_path).catch(() => {}));
    await db.deleteFrom("backups").where("id", "=", params.backupId).execute();
    return { success: true };
  });
