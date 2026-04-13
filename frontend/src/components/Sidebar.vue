<template>
  <aside
    class="flex flex-col h-full bg-coal-900 border-r border-coal-800 transition-all duration-200 shrink-0"
    :class="ui.sidebarCollapsed ? 'w-[60px]' : 'w-[240px]'"
  >
    <!-- Logo / brand -->
    <div class="flex items-center gap-3 h-14 px-3 border-b border-coal-800">
      <div class="w-8 h-8 bg-green-600/20 border border-green-600/40 rounded-lg flex items-center justify-center shrink-0">
        <Server class="w-4 h-4 text-green-400" />
      </div>
      <Transition name="fade">
        <span v-if="!ui.sidebarCollapsed" class="font-semibold text-sm text-coal-100 whitespace-nowrap">
          MC Manager
        </span>
      </Transition>
    </div>

    <!-- Nav links -->
    <nav class="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
      <SidebarLink v-for="link in navLinks" :key="link.to" v-bind="link" />
    </nav>

    <!-- User / collapse -->
    <div class="border-t border-coal-800 p-2 space-y-1">
      <!-- Collapse toggle -->
      <button
        @click="ui.toggleSidebar()"
        class="btn-ghost w-full justify-center"
        :title="ui.sidebarCollapsed ? 'Expand' : 'Collapse'"
      >
        <ChevronsLeft v-if="!ui.sidebarCollapsed" class="w-4 h-4" />
        <ChevronsRight v-else class="w-4 h-4" />
        <Transition name="fade">
          <span v-if="!ui.sidebarCollapsed" class="text-xs">Collapse</span>
        </Transition>
      </button>

      <!-- User avatar -->
      <div v-if="auth.user" class="flex items-center gap-3 px-2 py-1.5 rounded-lg">
        <img
          v-if="auth.user.avatarUrl"
          :src="auth.user.avatarUrl"
          :alt="auth.user.username"
          class="w-7 h-7 rounded-full shrink-0"
        />
        <div v-else class="w-7 h-7 bg-coal-700 rounded-full flex items-center justify-center shrink-0">
          <User class="w-3.5 h-3.5 text-coal-400" />
        </div>
        <Transition name="fade">
          <div v-if="!ui.sidebarCollapsed" class="min-w-0">
            <p class="text-xs font-medium text-coal-200 truncate">{{ auth.user.username }}</p>
            <p class="text-xs text-coal-500 capitalize">{{ auth.user.role }}</p>
          </div>
        </Transition>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Server, LayoutDashboard, Database, Layers, Settings, ChevronsLeft, ChevronsRight, User } from "lucide-vue-next";
import { useUIStore } from "../stores/ui.js";
import { useAuthStore } from "../stores/auth.js";
import SidebarLink from "./SidebarLink.vue";

const ui = useUIStore();
const auth = useAuthStore();

const navLinks = computed(() => [
  { to: "/dashboard",     icon: LayoutDashboard, label: "Dashboard" },
  { to: "/servers",       icon: Server,          label: "Servers" },
  { to: "/backups",       icon: Database,        label: "Backups" },
  { to: "/ftb",           icon: Layers,          label: "FTB Explorer" },
  { to: "/settings/auth", icon: Settings,        label: "Settings" },
]);
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
</style>
