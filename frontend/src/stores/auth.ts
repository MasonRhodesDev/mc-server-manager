import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { auth as authApi } from "../api/endpoints.js";

export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  role: "admin" | "operator" | "viewer";
}

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(localStorage.getItem("mc_token"));
  const user = ref<User | null>(null);

  const isAdmin = computed(() => user.value?.role === "admin");
  const isOperator = computed(() => user.value?.role === "admin" || user.value?.role === "operator");

  function setToken(t: string) {
    token.value = t;
    localStorage.setItem("mc_token", t);
  }

  function setAuth(t: string, u: User) {
    token.value = t;
    user.value = u;
    localStorage.setItem("mc_token", t);
  }

  function clearToken() {
    token.value = null;
    user.value = null;
    localStorage.removeItem("mc_token");
  }

  async function fetchMe() {
    const data = await authApi.me();
    user.value = data.user;
  }

  async function logout() {
    await authApi.logout().catch(() => {});
    clearToken();
  }

  return { token, user, isAdmin, isOperator, setToken, setAuth, clearToken, fetchMe, logout };
});
