/**
 * Docker API client — talks to the Docker socket directly via HTTP over Unix socket.
 * Requires /var/run/docker.sock to be mounted (or set DOCKER_HOST env var).
 */

import { logger } from "../lib/logger.js";

const DOCKER_SOCKET = process.env.DOCKER_HOST ?? "unix:///var/run/docker.sock";

async function dockerFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = DOCKER_SOCKET.startsWith("unix://")
    ? `http://localhost${path}`
    : `${DOCKER_SOCKET}${path}`;

  if (DOCKER_SOCKET.startsWith("unix://")) {
    const socketPath = DOCKER_SOCKET.replace("unix://", "");
    // @ts-ignore — Bun-specific unix socket option
    return fetch(url, { ...init, unix: socketPath });
  }

  return fetch(url, init);
}

export interface ContainerInspect {
  Id: string;
  Name: string;
  State: {
    Status: string;
    Running: boolean;
    Paused: boolean;
    ExitCode: number;
    StartedAt: string;
    FinishedAt: string;
  };
  Config: {
    Image: string;
    Env: string[];
    Labels: Record<string, string>;
  };
  NetworkSettings: {
    Networks: Record<string, { IPAddress: string }>;
  };
}

export interface DockerResult {
  ok: boolean;
  error?: string;
}

// ── Container operations ──────────────────────────────────────────────────────

export async function inspectContainer(name: string): Promise<ContainerInspect | null> {
  try {
    const res = await dockerFetch(`/containers/${name}/json`);
    if (res.status === 404) return null;
    if (!res.ok) {
      logger.warn("docker.inspect_error", { container: name, status: res.status });
      return null;
    }
    return res.json();
  } catch (err) {
    logger.warn("docker.unavailable", { op: "inspect", container: name, error: String(err) });
    return null;
  }
}

export async function startContainer(name: string): Promise<DockerResult> {
  try {
    logger.info("docker.start", { container: name });
    const res = await dockerFetch(`/containers/${name}/start`, { method: "POST" });
    if (res.status === 404) {
      logger.warn("docker.container_not_found", { container: name, op: "start" });
      return { ok: false, error: `Container '${name}' not found — has it been deployed?` };
    }
    // 204 = started, 304 = already running — both are fine
    if (res.status === 204 || res.status === 304) {
      logger.info("docker.started", { container: name });
      return { ok: true };
    }
    const body = await res.text().catch(() => "");
    logger.error("docker.start_failed", { container: name, status: res.status, body });
    return { ok: false, error: `Docker returned ${res.status}: ${body}` };
  } catch (err) {
    logger.error("docker.unavailable", { op: "start", container: name, error: String(err) });
    return { ok: false, error: "Docker socket unavailable — is Docker running?" };
  }
}

export async function stopContainer(name: string, timeoutSecs = 30): Promise<DockerResult> {
  try {
    logger.info("docker.stop", { container: name, timeoutSecs });
    const res = await dockerFetch(
      `/containers/${name}/stop?t=${timeoutSecs}`,
      { method: "POST" }
    );
    if (res.status === 404) {
      logger.warn("docker.container_not_found", { container: name, op: "stop" });
      return { ok: false, error: `Container '${name}' not found` };
    }
    if (res.status === 204 || res.status === 304) {
      logger.info("docker.stopped", { container: name });
      return { ok: true };
    }
    const body = await res.text().catch(() => "");
    logger.error("docker.stop_failed", { container: name, status: res.status, body });
    return { ok: false, error: `Docker returned ${res.status}: ${body}` };
  } catch (err) {
    logger.error("docker.unavailable", { op: "stop", container: name, error: String(err) });
    return { ok: false, error: "Docker socket unavailable — is Docker running?" };
  }
}

export async function containerLogs(name: string, lines = 100): Promise<string[]> {
  try {
    const res = await dockerFetch(
      `/containers/${name}/logs?stdout=true&stderr=true&tail=${lines}`
    );
    if (!res.ok) return [];
    const text = await res.text();
    // Docker multiplexed log stream has an 8-byte header per frame; strip it
    return text
      .split("\n")
      .filter(l => l.length > 8)
      .map(l => l.slice(8).trimEnd())
      .filter(Boolean);
  } catch (err) {
    logger.warn("docker.unavailable", { op: "logs", container: name, error: String(err) });
    return [];
  }
}

export async function listContainers(
  filter?: string
): Promise<{ Id: string; Names: string[]; Status: string; State: string }[]> {
  try {
    const params = filter
      ? `?filters=${encodeURIComponent(JSON.stringify({ name: [filter] }))}&all=true`
      : "?all=true";
    const res = await dockerFetch(`/containers/json${params}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getContainerStatus(
  serverName: string
): Promise<{ game: string; router: string; backup: string }> {
  const [game, router, backup] = await Promise.all([
    inspectContainer(serverName).then(c => c?.State.Status ?? "not deployed"),
    inspectContainer(`${serverName}-router`).then(c => c?.State.Status ?? "not deployed"),
    inspectContainer(`${serverName}-backup`).then(c => c?.State.Status ?? "not deployed"),
  ]);
  return { game, router, backup };
}
