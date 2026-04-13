import { api } from "./client.js";

// ── Auth ──────────────────────────────────────────────────────────────────────
export const auth = {
  providers: () => api.get("/auth/providers").then(r => r.data),
  login: (provider: string) => api.get(`/auth/login?provider=${provider}`).then(r => r.data),
  me: () => api.get("/auth/me").then(r => r.data),
  logout: () => api.post("/auth/logout"),
  devLogin: (username = "devuser") => api.post("/auth/dev-login", { username }).then(r => r.data),
};

// ── Servers ───────────────────────────────────────────────────────────────────
export const servers = {
  list: () => api.get("/servers").then(r => r.data),
  get: (id: string) => api.get(`/servers/${id}`).then(r => r.data),
  create: (data: Record<string, unknown>) => api.post("/servers", data).then(r => r.data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/servers/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/servers/${id}`).then(r => r.data),
  start: (id: string) => api.post(`/servers/${id}/control/start`).then(r => r.data),
  stop: (id: string) => api.post(`/servers/${id}/control/stop`).then(r => r.data),
  restart: (id: string) => servers.stop(id).then(() => servers.start(id)),
  status: (id: string) => api.get(`/servers/${id}/status`).then(r => r.data),
  logs: (id: string, lines = 100) => api.get(`/servers/${id}/logs?lines=${lines}`).then(r => r.data),
};

// ── Backups ───────────────────────────────────────────────────────────────────
export const backups = {
  list: (serverId: string) => api.get(`/servers/${serverId}/backups`).then(r => r.data),
  create: (serverId: string, label?: string) => api.post(`/servers/${serverId}/backups/create`, { manual: true, label }).then(r => r.data),
  restore: (serverId: string, backupId: string) => api.post(`/servers/${serverId}/backups/${backupId}/restore`).then(r => r.data),
  delete: (serverId: string, backupId: string) => api.delete(`/servers/${serverId}/backups/${backupId}`).then(r => r.data),
};

// ── FTB ───────────────────────────────────────────────────────────────────────
export const ftb = {
  packs: (params?: { search?: string; limit?: number; offset?: number }) =>
    api.get("/ftb/packs", { params }).then(r => r.data),
  pack: (packId: number) => api.get(`/ftb/packs/${packId}`).then(r => r.data),
  versions: (packId: number) => api.get(`/ftb/packs/${packId}/versions`).then(r => r.data),
};

// ── Settings ──────────────────────────────────────────────────────────────────
export const settings = {
  getAuth: () => api.get("/settings/auth").then(r => r.data),
  setAuthProvider: (provider: string, data: Record<string, unknown>) =>
    api.post(`/settings/auth/${provider}`, data).then(r => r.data),
  getSystem: () => api.get("/settings/system").then(r => r.data),
};
