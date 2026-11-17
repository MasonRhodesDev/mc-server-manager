import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function transformKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(transformKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        snakeToCamel(k),
        transformKeys(v),
      ])
    );
  }
  return value;
}

api.interceptors.request.use(config => {
  const token = localStorage.getItem("mc_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => {
    res.data = transformKeys(res.data);
    return res;
  },
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem("mc_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);
