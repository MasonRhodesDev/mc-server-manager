/**
 * Docker API client — talks to the Docker socket directly via HTTP over Unix socket.
 * Requires /var/run/docker.sock mounted (or DOCKER_HOST env var).
 */

const DOCKER_SOCKET = process.env.DOCKER_HOST ?? "unix:///var/run/docker.sock";

// Bun has native Unix socket support via fetch
async function dockerFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = DOCKER_SOCKET.startsWith("unix://")
    ? `http://localhost${path}`
    : `${DOCKER_SOCKET}${path}`;

  if (DOCKER_SOCKET.startsWith("unix://")) {
    const socketPath = DOCKER_SOCKET.replace("unix://", "");
    // @ts-ignore Bun-specific unix socket option
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

export async function inspectContainer(name: string): Promise<ContainerInspect | null> {
  try {
    const res = await dockerFetch(`/containers/${name}/json`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Docker API error: ${res.status}`);
    return res.json();
  } catch {
    return null;
  }
}

export async function startContainer(name: string): Promise<boolean> {
  const res = await dockerFetch(`/containers/${name}/start`, { method: "POST" });
  return res.status === 204 || res.status === 304;
}

export async function stopContainer(name: string, timeoutSecs = 30): Promise<boolean> {
  const res = await dockerFetch(
    `/containers/${name}/stop?t=${timeoutSecs}`,
    { method: "POST" }
  );
  return res.status === 204 || res.status === 304;
}

export async function containerLogs(name: string, lines = 100): Promise<string[]> {
  const res = await dockerFetch(
    `/containers/${name}/logs?stdout=true&stderr=true&tail=${lines}`
  );
  if (!res.ok) return [];
  const text = await res.text();
  // Docker log stream has an 8-byte header per line; strip it
  return text
    .split("\n")
    .filter(l => l.length > 8)
    .map(l => l.slice(8).trimEnd());
}

export async function listContainers(filter?: string): Promise<{ Id: string; Names: string[]; Status: string; State: string }[]> {
  const params = filter
    ? `?filters=${encodeURIComponent(JSON.stringify({ name: [filter] }))}&all=true`
    : "?all=true";
  const res = await dockerFetch(`/containers/json${params}`);
  if (!res.ok) return [];
  return res.json();
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
