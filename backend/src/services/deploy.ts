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

import { logger } from "../lib/logger.js";
import type { ServerRow } from "../types/index.js";

const DATA_PATH     = process.env.DATA_PATH     ?? "/mnt/user/appdata/minecraft";
const BACKUPS_PATH  = process.env.BACKUPS_PATH  ?? "/mnt/user/appdata/minecraft-backups";
const PROXY_NETWORK = process.env.PROXY_NETWORK ?? "mc-proxy";
const TZ            = process.env.TZ            ?? "America/Los_Angeles";
const DOCKER_SOCKET = process.env.DOCKER_HOST   ?? "unix:///var/run/docker.sock";

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

async function networkConnect(network: string, container: string): Promise<void> {
  const r = await dockerApi("POST", `/networks/${network}/connect`, { Container: container });
  if (r.status !== 200 && r.status !== 204) {
    // Log but don't throw — proxy network may not exist in local dev
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
  const [repo, tag = "latest"] = image.split(":");
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

export async function deployServer(server: ServerRow): Promise<{ ok: boolean; error?: string }> {
  const { name } = server;
  const network  = `mc-${name}`;
  const dataDir  = `${DATA_PATH}/${name}/data`;
  const bkDir    = `${BACKUPS_PATH}/${name}`;

  try {
    logger.audit("deploy.start", { serverName: name, serverType: server.server_type });

    // ── 1. Ensure data dirs exist ─────────────────────────────────────────────
    // Docker won't create host paths automatically; we need them to exist before bind-mounting.
    Bun.spawnSync(["mkdir", "-p", dataDir, bkDir]);

    // ── 2. Pull images (sequential — parallel pulls thrash bandwidth) ─────────
    for (const img of ["itzg/mc-router:latest", "itzg/minecraft-server:java21", "itzg/mc-backup:latest"]) {
      await pullImage(img).catch(err => {
        logger.warn("deploy.pull_warning", { image: img, error: String(err) });
      });
    }

    // ── 3. Per-server bridge network ──────────────────────────────────────────
    await networkCreate(network);

    // ── 4. Remove stale containers (idempotent) ───────────────────────────────
    await Promise.all([
      containerRemove(name),
      containerRemove(`${name}-router`),
      containerRemove(`${name}-backup`),
    ]);

    // ── 5. mc-router (start immediately) ─────────────────────────────────────
    const routerEnv: string[] = [
      "IN_DOCKER=true",
      "AUTO_SCALE_UP=true",
      "AUTO_SCALE_DOWN=true",
      `AUTO_SCALE_DOWN_AFTER=${server.auto_scale_down_after}`,
      `ASLEEP_MOTD=Server is sleeping. Join to wake it up!`,
      `LOADING_MOTD=Server is starting up... reconnect shortly.`,
    ];
    await containerCreate(`${name}-router`, {
      Image: "itzg/mc-router:latest",
      Env: routerEnv,
      HostConfig: {
        Binds: ["/var/run/docker.sock:/var/run/docker.sock:ro"],
        PortBindings: {
          "25565/tcp": [{ HostIp: "", HostPort: String(server.server_port) }],
          "25564/tcp": [{ HostIp: "127.0.0.1", HostPort: String(server.router_api_port) }],
        },
        RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 },
        NetworkMode: network,
      },
    });
    await containerStart(`${name}-router`);
    logger.info("deploy.router_started", { serverName: name });

    // ── 6. Game server (create only — mc-router starts it on first connection) ─
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
      Image: "itzg/minecraft-server:java21",
      Env: gameEnv,
      Labels: { "mc-router.host": server.server_hostname },
      Volumes: { "/data": {} },
      HostConfig: {
        Binds: [`${dataDir}:/data`],
        RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
        NetworkMode: network,
      },
    });
    logger.info("deploy.game_created", { serverName: name });

    // Connect game to shared proxy network (optional — absent in local dev)
    await networkConnect(PROXY_NETWORK, name);

    // ── 7. Backup sidecar (start immediately) ─────────────────────────────────
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
    await containerStart(`${name}-backup`);
    logger.info("deploy.backup_started", { serverName: name });

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
