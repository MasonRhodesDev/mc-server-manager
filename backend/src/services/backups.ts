import { db } from "../db/index.js";
import { inspectContainer } from "./docker.js";
import { logger } from "../lib/logger.js";
import type { TaskEmitter } from "./tasks.js";
import { join } from "path";
import { $ } from "bun";

const BACKUPS_PATH = process.env.BACKUPS_PATH ?? "/backups";
const DATA_PATH    = process.env.DATA_PATH    ?? "/data";

export interface BackupResult {
  backupId: string;
  filePath: string;
  sizeBytes: number;
}

export async function runBackupWithTask(
  serverId: string,
  serverName: string,
  label: string,
  type: "auto" | "manual",
  emit: TaskEmitter,
): Promise<BackupResult> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${serverName}-${type}-${ts}.tar.gz`;
  const dir  = join(BACKUPS_PATH, serverName);
  const dest = join(dir, filename);

  await emit("step.started", { step: "flush_saves", message: "Flushing server saves…" });
  await $`mkdir -p ${dir}`;

  const container = await inspectContainer(serverName);
  if (container?.State.Running) {
    await $`docker exec ${serverName} rcon-cli save-off`.nothrow();
    await $`docker exec ${serverName} rcon-cli save-all`.nothrow();
  }
  await emit("step.completed", { step: "flush_saves", progressPct: 20, message: "Saves flushed" });

  await emit("step.started", { step: "create_archive", message: "Creating archive…" });
  const dataDir = join(DATA_PATH, serverName, "data");
  await $`tar czf ${dest} -C ${dataDir} .`;

  if (container?.State.Running) {
    await $`docker exec ${serverName} rcon-cli save-on`.nothrow();
  }
  await emit("step.completed", { step: "create_archive", progressPct: 80, message: "Archive created" });

  await emit("step.started", { step: "record_db", message: "Recording backup…" });
  const stat = await import("fs/promises").then(fs => fs.stat(dest).catch(() => ({ size: 0 })));

  const backupId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await db.insertInto("backups").values({
    id: backupId,
    server_id: serverId,
    label,
    file_path: dest,
    size_bytes: stat.size,
    type,
    created_at: new Date().toISOString(),
  }).execute();

  logger.info("backup.created", { backupId, serverId, filePath: dest, sizeBytes: stat.size });
  await emit("step.completed", { step: "record_db", progressPct: 100, message: "Backup recorded" });

  return { backupId, filePath: dest, sizeBytes: stat.size };
}

export async function runRestoreWithTask(
  serverId: string,
  serverName: string,
  backupFilePath: string,
  backupLabel: string,
  emit: TaskEmitter,
): Promise<void> {
  const dataDir = join(DATA_PATH, serverName, "data");

  await emit("step.started", { step: "stop_game", message: "Stopping game server…" });
  await $`docker stop ${serverName}`.nothrow();
  await emit("step.completed", { step: "stop_game", progressPct: 20, message: "Game server stopped" });

  await emit("step.started", { step: "wipe_data", message: "Clearing current data…" });
  await $`rm -rf ${dataDir}`;
  await $`mkdir -p ${dataDir}`;
  await emit("step.completed", { step: "wipe_data", progressPct: 40, message: "Data directory cleared" });

  await emit("step.started", { step: "extract_archive", message: `Restoring from ${backupLabel}…` });
  await $`tar xzf ${backupFilePath} -C ${dataDir}`;
  await emit("step.completed", { step: "extract_archive", progressPct: 85, message: "Archive extracted" });

  await emit("step.started", { step: "update_state", message: "Finalising restore…" });
  await db.updateTable("servers")
    .set({ state: "stopped", updated_at: new Date().toISOString() })
    .where("id", "=", serverId)
    .execute();

  logger.info("backup.restored", { serverId, backupLabel, backupFilePath });
  await emit("step.completed", { step: "update_state", progressPct: 100, message: "Restore complete" });
}
