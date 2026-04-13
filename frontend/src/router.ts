import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/auth.js";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "Login",
      component: () => import("./pages/Login.vue"),
      meta: { public: true },
    },
    {
      path: "/auth/callback",
      name: "AuthCallback",
      component: () => import("./pages/AuthCallback.vue"),
      meta: { public: true },
    },
    {
      path: "/",
      component: () => import("./layouts/MainLayout.vue"),
      children: [
        {
          path: "",
          redirect: "/servers",
        },
        {
          path: "dashboard",
          name: "Dashboard",
          component: () => import("./pages/Dashboard.vue"),
        },
        {
          path: "servers",
          name: "Servers",
          component: () => import("./pages/Servers/List.vue"),
        },
        {
          path: "servers/new",
          name: "NewServer",
          component: () => import("./pages/Servers/Create.vue"),
        },
        {
          path: "servers/:id",
          name: "ServerDetail",
          component: () => import("./pages/Servers/Detail.vue"),
        },
        {
          path: "backups",
          name: "Backups",
          component: () => import("./pages/Backups.vue"),
        },
        {
          path: "ftb",
          name: "FTBExplorer",
          component: () => import("./pages/FTB/Explorer.vue"),
        },
        {
          path: "settings/auth",
          name: "SettingsAuth",
          component: () => import("./pages/Settings/Auth.vue"),
        },
        {
          path: "settings/system",
          name: "SettingsSystem",
          component: () => import("./pages/Settings/System.vue"),
        },
      ],
    },
  ],
});

// Auth guard
router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const auth = useAuthStore();
  if (!auth.token) {
    return { name: "Login", query: { redirect: to.fullPath } };
  }
  if (!auth.user) {
    await auth.fetchMe().catch(() => {});
    if (!auth.user) return { name: "Login" };
  }
  return true;
});

export default router;
