-- mc-server-manager database schema
-- Applied once at startup via migrate.ts

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ── Servers ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS servers (
  id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name                   TEXT NOT NULL UNIQUE,
  server_type            TEXT NOT NULL DEFAULT 'FTBA',
  modpack_id             INTEGER,
  modpack_version_id     INTEGER,         -- NULL = latest
  memory_gb              INTEGER NOT NULL DEFAULT 8,
  init_memory_gb         INTEGER NOT NULL DEFAULT 2,
  rcon_password          TEXT NOT NULL,
  auto_scale_down_after  TEXT NOT NULL DEFAULT '10m',
  server_hostname        TEXT NOT NULL,
  server_port            INTEGER NOT NULL,
  router_api_port        INTEGER NOT NULL,
  state                  TEXT NOT NULL DEFAULT 'stopped'
                         CHECK (state IN ('running', 'stopped', 'starting', 'created')),
  created_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  email        TEXT UNIQUE NOT NULL,
  username     TEXT UNIQUE NOT NULL,
  avatar_url   TEXT,
  role         TEXT NOT NULL DEFAULT 'viewer'
               CHECK (role IN ('admin', 'operator', 'viewer')),
  provider     TEXT NOT NULL,
  provider_id  TEXT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_id)
);

-- ── Backups ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backups (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  file_path   TEXT NOT NULL UNIQUE,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  type        TEXT NOT NULL DEFAULT 'auto' CHECK (type IN ('auto', 'manual')),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Auth providers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_providers (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  provider      TEXT NOT NULL UNIQUE CHECK (provider IN ('microsoft')),
  client_id     TEXT NOT NULL DEFAULT '',
  client_secret TEXT NOT NULL DEFAULT '',
  enabled       INTEGER NOT NULL DEFAULT 0,
  redirect_uri  TEXT NOT NULL DEFAULT ''
);

-- Seed default provider row (disabled until configured)
INSERT OR IGNORE INTO auth_providers (provider) VALUES ('microsoft');

-- Optional login allowlist. Empty = any Microsoft account may sign in.
CREATE TABLE IF NOT EXISTS auth_allowlist (
  email TEXT PRIMARY KEY NOT NULL
);

-- ── FTB cache ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ftb_cache (
  pack_id    INTEGER PRIMARY KEY,
  data       TEXT NOT NULL,            -- JSON blob
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Sessions ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  DATETIME NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Tasks ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  kind         TEXT NOT NULL CHECK (kind IN ('deploy', 'backup', 'restore')),
  server_id    TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  current_step TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  message      TEXT,
  error        TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at   DATETIME,
  finished_at  DATETIME
);

-- ── Task events ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_backups_server_id  ON backups(server_id);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires   ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_tasks_server_id    ON tasks(server_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_events_task   ON task_events(task_id);
