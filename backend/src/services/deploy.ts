/**
 * Deploy / undeploy a Minecraft server stack via the Docker socket API directly.
 * No subprocess, no docker CLI, no compose — pure HTTP over unix:///var/run/docker.sock.
 *
 * Stack layout per server:
 *   mc-<name>        bridge network (per-server isolation)
 *   <name>-router    itzg/mc-router  (public port, auto-sleep, restart=unless-stopped)
 *   <name>           itzg/minecraft-server:java21  (restart=no; router owns lifecycle)
 *   <name>-backup    itzg/mc-backup  (RCON-coordinated backups, restart=unless-stopped)
 *
 * The game container is also connected to PROXY_NETWORK (mc-proxy) so Velocity can reach it.
 */

import { statSync } from "node:fs";
import { logger } from "../lib/logger.js";
import type { ServerRow } from "../types/index.js";
import type { TaskEmitter } from "./tasks.js";

const DATA_PATH     = process.env.DATA_PATH     ?? "/mnt/user/appdata/minecraft";
const BACKUPS_PATH  = process.env.BACKUPS_PATH  ?? "/mnt/user/appdata/minecraft-backups";
const PROXY_NETWORK = process.env.PROXY_NETWORK ?? "mc-proxy";
const TZ            = process.env.TZ            ?? "America/Los_Angeles";
const DOCKER_SOCKET = process.env.DOCKER_HOST   ?? "unix:///var/run/docker.sock";

function dockerSocketGid(): string {
  const path = DOCKER_SOCKET.startsWith("unix://")
    ? DOCKER_SOCKET.slice("unix://".length)
    : "/var/run/docker.sock";
  return String(statSync(path).gid);
}

// ── Docker HTTP helpers ───────────────────────────────────────────────────────

async function dockerApi(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const url = "http://localhost" + path;
  const init: RequestInit = {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  };
  if (DOCKER_SOCKET.startsWith("unix://")) {
    // @ts-ignore — Bun-specific unix socket option
    init.unix = DOCKER_SOCKET.replace("unix://", "");
  }
  const res = await fetch(url, init);
  let data: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, data };
}

async function networkCreate(name: string): Promise<void> {
  const r = await dockerApi("POST", "/networks/create", { Name: name, Driver: "bridge" });
  if (r.status !== 201 && r.status !== 409) { // 409 = already exists
    throw new Error(`networkCreate ${name}: HTTP ${r.status} — ${JSON.stringify(r.data)}`);
  }
}

async function networkExists(name: string): Promise<boolean> {
  const r = await dockerApi("GET", `/networks/${name}`);
  return r.status === 200;
}

async function networkConnect(network: string, container: string): Promise<void> {
  if (!await networkExists(network)) {
    logger.info("deploy.proxy_network_absent", { network, container });
    return; // skip silently — proxy network not required in dev
  }
  const r = await dockerApi("POST", `/networks/${network}/connect`, { Container: container });
  if (r.status !== 200 && r.status !== 204) {
    logger.warn("deploy.network_connect_failed", { network, container, status: r.status, data: r.data });
  }
}

async function containerRemove(name: string): Promise<void> {
  await dockerApi("DELETE", `/containers/${name}?force=true`); // 404 is fine
}

async function containerCreate(name: string, spec: unknown): Promise<string> {
  const r = await dockerApi("POST", `/containers/create?name=${encodeURIComponent(name)}`, spec);
  if (r.status !== 201) {
    throw new Error(`containerCreate ${name}: HTTP ${r.status} — ${JSON.stringify(r.data)}`);
  }
  return (r.data as any).Id as string;
}

async function containerStart(nameOrId: string): Promise<void> {
  const r = await dockerApi("POST", `/containers/${nameOrId}/start`);
  if (r.status !== 204 && r.status !== 304) { // 304 = already started
    throw new Error(`containerStart ${nameOrId}: HTTP ${r.status} — ${JSON.stringify(r.data)}`);
  }
}

async function pullImage(image: string): Promise<void> {
  // POST /images/create streams NDJSON progress lines (not a single JSON body).
  // Reading the full text body is what blocks until the pull finishes.
  const [repo = "", tag = "latest"] = image.split(":");
  const url = "http://localhost" + `/images/create?fromImage=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}`;
  const init: RequestInit = { method: "POST" };
  if (DOCKER_SOCKET.startsWith("unix://")) {
    // @ts-ignore
    init.unix = DOCKER_SOCKET.replace("unix://", "");
  }
  logger.info("deploy.pulling", { image });
  const res = await fetch(url, init);
  await res.text(); // drain body — this is what waits for pull completion
  if (!res.ok) throw new Error(`Pull failed for ${image}: HTTP ${res.status}`);
  logger.info("deploy.pulled", { image });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function deployServer(
  server: ServerRow,
  emit: TaskEmitter,
): Promise<{ ok: boolean; error?: string }> {
  const { name } = server;
  const network  = `mc-${name}`;
  const dataDir  = `${DATA_PATH}/${name}/data`;
  const bkDir    = `${BACKUPS_PATH}/${name}`;

  try {
    logger.audit("deploy.start", { serverName: name, serverType: server.server_type });

    // ── 1. Ensure data dirs exist ─────────────────────────────────────────────
    await emit("step.started", { step: "mkdirs", message: "Creating data directories…" });
    Bun.spawnSync(["mkdir", "-p", dataDir, bkDir]);
    await emit("step.completed", { step: "mkdirs", progressPct: 5, message: "Data directories ready" });

    // ── 2. Pull images (sequential — parallel pulls thrash bandwidth) ─────────
    const images: Array<{ img: string; step: string; label: string; pct: number }> = [
      { img: "itzg/mc-router:latest",        step: "pull_router", label: "mc-router",        pct: 20 },
      { img: "itzg/minecraft-server:java25", step: "pull_game",   label: "minecraft-server", pct: 45 },
      { img: "itzg/mc-backup:latest",        step: "pull_backup", label: "mc-backup",        pct: 60 },
    ];
    for (const { img, step, label, pct } of images) {
      await emit("step.started", { step, message: `Pulling ${label}…` });
      await pullImage(img).catch(err => {
        logger.warn("deploy.pull_warning", { image: img, error: String(err) });
      });
      await emit("step.completed", { step, progressPct: pct, message: `Pulled ${label}` });
    }

    // ── 3. Per-server bridge network ──────────────────────────────────────────
    await emit("step.started", { step: "create_network", message: `Creating network mc-${name}…` });
    await networkCreate(network);
    await emit("step.completed", { step: "create_network", progressPct: 65, message: "Network ready" });

    // ── 4. Remove stale containers (idempotent) ───────────────────────────────
    await emit("step.started", { step: "remove_stale", message: "Removing stale containers…" });
    await Promise.all([
      containerRemove(name),
      containerRemove(`${name}-router`),
      containerRemove(`${name}-backup`),
    ]);
    await emit("step.completed", { step: "remove_stale", progressPct: 70, message: "Stale containers removed" });

    // ── 5. mc-router (start immediately) ─────────────────────────────────────
    await emit("step.started", { step: "create_router", message: "Creating router container…" });
    const routerEnv: string[] = [
      "IN_DOCKER=true",
      "AUTO_SCALE_UP=true",
      "AUTO_SCALE_DOWN=true",
      `AUTO_SCALE_DOWN_AFTER=${server.auto_scale_down_after}`,
      `ASLEEP_MOTD=Server is sleeping. Join to wake it up!`,
      `LOADING_MOTD=Server is starting up... reconnect shortly.`,
      `DEFAULT=${name}:25565`,
    ];
    await containerCreate(`${name}-router`, {
      Image: "itzg/mc-router:latest",
      Env: routerEnv,
      HostConfig: {
        Binds: ["/var/run/docker.sock:/var/run/docker.sock:ro"],
        GroupAdd: [dockerSocketGid()],
        PortBindings: {
          "25565/tcp": [{ HostIp: "", HostPort: String(server.server_port) }],
          "25564/tcp": [{ HostIp: "127.0.0.1", HostPort: String(server.router_api_port) }],
        },
        RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 },
        NetworkMode: network,
      },
    });
    await emit("step.completed", { step: "create_router", progressPct: 78, message: "Router container created" });

    await emit("step.started", { step: "start_router", message: "Starting router…" });
    await containerStart(`${name}-router`);
    logger.info("deploy.router_started", { serverName: name });
    await emit("step.completed", { step: "start_router", progressPct: 83, message: "Router started" });

    // ── 6. Game server (create only — mc-router starts it on first connection) ─
    await emit("step.started", { step: "create_game", message: "Creating game server container…" });
    const gameEnv: string[] = [
      "EULA=TRUE",
      `TYPE=${server.server_type}`,
      `MEMORY=${server.memory_gb}G`,
      `INIT_MEMORY=${server.init_memory_gb}G`,
      "JVM_XX_OPTS=-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200",
      "ENABLE_RCON=true",
      "RCON_PORT=25575",
      `RCON_PASSWORD=${server.rcon_password}`,
      `TZ=${TZ}`,
    ];

    if (server.server_type !== "VANILLA" && server.modpack_id) {
      gameEnv.push(`FTB_MODPACK_ID=${server.modpack_id}`);
    }
    if (server.modpack_version_id) {
      gameEnv.push(`FTB_MODPACK_VERSION_ID=${server.modpack_version_id}`);
    }
    if (process.env.VELOCITY_SECRET) {
      gameEnv.push(`VELOCITY_SECRET=${process.env.VELOCITY_SECRET}`);
    }

    await containerCreate(name, {
      Image: "itzg/minecraft-server:java25",
      Env: gameEnv,
      Labels: { "mc-router.host": server.server_hostname, "mc-router.default": "true" },
      Volumes: { "/data": {} },
      HostConfig: {
        Binds: [`${dataDir}:/data`],
        RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
        NetworkMode: network,
      },
    });
    logger.info("deploy.game_created", { serverName: name });
    await emit("step.completed", { step: "create_game", progressPct: 90, message: "Game server container created" });

    // Connect game to shared proxy network (optional — absent in local dev)
    await emit("step.started", { step: "connect_proxy", message: "Connecting to proxy network…" });
    await networkConnect(PROXY_NETWORK, name);
    await emit("step.completed", { step: "connect_proxy", progressPct: 93, message: "Connected to proxy network" });

    // ── 7. Backup sidecar (start immediately) ─────────────────────────────────
    await emit("step.started", { step: "create_backup", message: "Creating backup sidecar…" });
    const backupEnv: string[] = [
      `RCON_HOST=${name}`,
      "RCON_PORT=25575",
      `RCON_PASSWORD=${server.rcon_password}`,
      "RCON_RETRIES=2",
      `BACKUP_INTERVAL=${process.env.BACKUP_INTERVAL ?? "12h"}`,
      "INITIAL_DELAY=5m",
      `PRUNE_BACKUPS_DAYS=${process.env.BACKUP_RETENTION_DAYS ?? "14"}`,
      `BACKUP_NAME=${name}`,
      "DEST_DIR=/backups",
      "SRC_DIR=/data",
      "TAR_COMPRESS_METHOD=gzip",
      "PAUSE_IF_NO_PLAYERS=true",
    ];
    await containerCreate(`${name}-backup`, {
      Image: "itzg/mc-backup:latest",
      Env: backupEnv,
      HostConfig: {
        Binds: [`${dataDir}:/data:ro`, `${bkDir}:/backups`],
        RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 },
        NetworkMode: network,
      },
    });
    await emit("step.completed", { step: "create_backup", progressPct: 97, message: "Backup sidecar created" });

    await emit("step.started", { step: "start_backup", message: "Starting backup sidecar…" });
    await containerStart(`${name}-backup`);
    logger.info("deploy.backup_started", { serverName: name });
    await emit("step.completed", { step: "start_backup", progressPct: 100, message: "Backup sidecar started" });

    logger.audit("deploy.complete", { serverName: name });
    return { ok: true };

  } catch (err) {
    logger.error("deploy.failed", { serverName: name, error: String(err) });
    return { ok: false, error: String(err) };
  }
}

export async function undeployServer(serverName: string): Promise<void> {
  logger.audit("undeploy.start", { serverName });
  await Promise.all([
    containerRemove(serverName),
    containerRemove(`${serverName}-router`),
    containerRemove(`${serverName}-backup`),
  ]);
  await dockerApi("DELETE", `/networks/mc-${serverName}`).catch(() => {});
  logger.audit("undeploy.complete", { serverName });
}
