import { Database } from "bun:sqlite";
import { Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-sqlite";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH ?? join(__dirname, "../../data/mc-manager.db");

const dbDir = DB_PATH.substring(0, DB_PATH.lastIndexOf("/"));
if (dbDir) {
  await import("fs/promises").then(fs => fs.mkdir(dbDir, { recursive: true }));
}

export const sqlite = new Database(DB_PATH);

{
  const row: unknown = sqlite.query(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auth_providers'"
  ).get();
  if (
    typeof row === "object" &&
    row !== null &&
    "sql" in row &&
    typeof row.sql === "string" &&
    !row.sql.includes("'microsoft'")
  ) {
    sqlite.run("DROP TABLE auth_providers");
  }
}

const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
sqlite.run(schema);

import type {
  ServerRow,
  UserRow,
  BackupRow,
  AuthProviderRow,
  AuthAllowlistRow,
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
  auth_allowlist: AuthAllowlistRow;
  ftb_cache: FtbCacheRow;
  sessions: SessionRow;
  tasks: TaskRow;
  task_events: TaskEventRow;
}

export const db = new Kysely<Database_Tables>({
  dialect: new BunSqliteDialect({ database: sqlite }),
});
