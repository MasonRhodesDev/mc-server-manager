// ── Database row types (match schema.sql exactly) ────────────────────────────

export interface ServerRow {
  id: string;
  name: string;
  server_type: string;       // "FTBA" | "VANILLA" | "FORGE" | "PAPER"
  modpack_id: number | null;
  modpack_version_id: number | null;
  memory_gb: number;
  init_memory_gb: number;
  rcon_password: string;
  auto_scale_down_after: string;
  server_hostname: string;
  server_port: number;
  router_api_port: number;
  state: "running" | "stopped" | "starting" | "created";
  created_at: string;
  updated_at: string;
}

export interface UserRow {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  role: "admin" | "operator" | "viewer";
  provider: string;
  provider_id: string;
  created_at: string;
}

export interface BackupRow {
  id: string;
  server_id: string;
  label: string;
  file_path: string;
  size_bytes: number;
  type: "auto" | "manual";
  created_at: string;
}

export interface AuthProviderRow {
  id: string;
  provider: "microsoft";
  client_id: string;
  client_secret: string;
  enabled: number; // SQLite stores booleans as 0/1
  redirect_uri: string;
}

export interface AuthAllowlistRow {
  email: string;
}

export interface FtbCacheRow {
  pack_id: number;
  data: string; // JSON blob
  fetched_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface TaskRow {
  id: string;
  kind: 'deploy' | 'backup' | 'restore';
  server_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  current_step: string | null;
  progress_pct: number;
  message: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface TaskEventRow {
  id: number;
  task_id: string;
  event_type: string;
  payload: string; // JSON blob
  created_at: string;
}

// ── API response types ────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  role: "admin" | "operator" | "viewer";
}

export interface Server {
  id: string;
  name: string;
  serverType: string;
  modpackId: number | null;
  modpackVersionId: number | null;
  memoryGb: number;
  initMemoryGb: number;
  autoScaleDownAfter: string;
  serverHostname: string;
  serverPort: number;
  state: string;
  createdAt: string;
}

export interface Backup {
  id: string;
  serverId: string;
  label: string;
  filePath: string;
  sizeBytes: number;
  type: "auto" | "manual";
  createdAt: string;
}

export interface DockerContainerStatus {
  name: string;
  status: string;
  running: boolean;
}

export interface ServerStatus {
  serverId: string;
  containers: {
    game: DockerContainerStatus;
    router: DockerContainerStatus;
    backup: DockerContainerStatus;
  };
  players?: number;
}

export interface FtbModpack {
  id: number;
  name: string;
  synopsis: string;
  art: { url: string; type: string }[];
  versions: { id: number; name: string; type: string }[];
  updated: number;
}
