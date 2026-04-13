<template>
  <header class="sticky top-0 z-30 flex items-center justify-between h-14 px-6 bg-coal-900/80 backdrop-blur border-b border-coal-800 shrink-0">
    <!-- Page title (injected via provide/inject or route meta) -->
    <h1 class="text-sm font-semibold text-coal-100">{{ pageTitle }}</h1>

    <div class="flex items-center gap-3">
      <!-- Quick new server -->
      <RouterLink to="/servers/new" class="btn-primary text-xs px-3 py-1.5">
        <Plus class="w-3.5 h-3.5" />
        New Server
      </RouterLink>

      <!-- Logout -->
      <button @click="handleLogout" class="btn-ghost text-xs px-3 py-1.5 text-coal-400">
        <LogOut class="w-3.5 h-3.5" />
        <span class="hidden sm:inline">Logout</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Plus, LogOut } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth.js";
import { useUIStore } from "../stores/ui.js";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUIStore();

const pageTitles: Record<string, string> = {
  "/dashboard":     "Dashboard",
  "/servers":       "Servers",
  "/servers/new":   "New Server",
  "/backups":       "Backups",
  "/ftb":           "FTB Explorer",
  "/settings/auth": "Settings — Auth",
  "/settings/system": "Settings — System",
};

const pageTitle = computed(() => {
  // Check for exact match, then prefix match
  if (pageTitles[route.path]) return pageTitles[route.path];
  if (route.path.startsWith("/servers/")) return "Server Details";
  return "MC Server Manager";
});

async function handleLogout() {
  await auth.logout();
  router.push("/login");
  ui.notify("info", "Logged out");
}
</script>
