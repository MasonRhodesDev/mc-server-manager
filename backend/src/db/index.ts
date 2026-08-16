import { Database } from "bun:sqlite";
import { Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-sqlite";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Database location ─────────────────────────────────────────────────────────
// Prefer the env-var path (Docker volume); fall back to local dev path.
const DB_PATH = process.env.DB_PATH ?? join(__dirname, "../../data/mc-manager.db");

// Ensure parent directory exists
const dbDir = DB_PATH.substring(0, DB_PATH.lastIndexOf("/"));
if (dbDir) {
  await import("fs/promises").then(fs => fs.mkdir(dbDir, { recursive: true }));
}

// ── SQLite instance ───────────────────────────────────────────────────────────
export const sqlite = new Database(DB_PATH);

// Apply schema on startup
const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
sqlite.run(schema);

// ── Kysely instance (typed query builder) ────────────────────────────────────
import type {
  ServerRow,
  UserRow,
  BackupRow,
  AuthProviderRow,
  FtbCacheRow,
  SessionRow,
  TaskRow,
  TaskEventRow,
} from "../types/index.js";

interface Database_Tables {
  servers: ServerRow;
  users: UserRow;
  backups: BackupRow;
  auth_providers: AuthProviderRow;
  ftb_cache: FtbCacheRow;
  sessions: SessionRow;
  tasks: TaskRow;
  task_events: TaskEventRow;
}

export const db = new Kysely<Database_Tables>({
  dialect: new BunSqliteDialect({ database: sqlite }),
});
