import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// Attach auth token from localStorage to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem("mc_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global error handling
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem("mc_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);
