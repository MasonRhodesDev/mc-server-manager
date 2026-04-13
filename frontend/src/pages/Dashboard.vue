<template>
  <div class="space-y-6">
    <!-- Stats row -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div class="card-sm">
        <p class="label">Total Servers</p>
        <p class="text-2xl font-bold text-coal-100">{{ totalServers }}</p>
      </div>
      <div class="card-sm">
        <p class="label">Running</p>
        <p class="text-2xl font-bold text-green-400">{{ runningServers }}</p>
      </div>
      <div class="card-sm">
        <p class="label">Sleeping</p>
        <p class="text-2xl font-bold text-coal-400">{{ sleepingServers }}</p>
      </div>
      <div class="card-sm">
        <p class="label">Total Backups</p>
        <p class="text-2xl font-bold text-coal-100">{{ totalBackups }}</p>
      </div>
    </div>

    <!-- Server grid -->
    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-semibold text-coal-200">All Servers</h2>
        <RouterLink to="/servers/new" class="btn-primary text-xs px-3 py-1.5">
          <Plus class="w-3.5 h-3.5" />
          New
        </RouterLink>
      </div>

      <div v-if="serversStore.loading" class="flex justify-center py-12">
        <Loader2 class="w-6 h-6 text-coal-400 animate-spin" />
      </div>

      <div v-else-if="serversStore.servers.length === 0" class="card text-center py-12">
        <Server class="w-10 h-10 text-coal-700 mx-auto mb-3" />
        <p class="text-coal-400 text-sm">No servers yet.</p>
        <RouterLink to="/servers/new" class="btn-primary mt-4 inline-flex">
          <Plus class="w-4 h-4" />
          Deploy your first server
        </RouterLink>
      </div>

      <div v-else class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <ServerCard
          v-for="server in serversStore.servers"
          :key="server.id"
          :server="server"
          @start="startServer"
          @stop="stopServer"
          @backup="backupServer"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { Server, Plus, Loader2 } from "lucide-vue-next";
import { useServersStore } from "../stores/servers.js";
import { useUIStore } from "../stores/ui.js";
import { servers as serversApi, backups as backupsApi } from "../api/endpoints.js";
import ServerCard from "../components/ServerCard.vue";

const serversStore = useServersStore();
const ui = useUIStore();

const totalServers  = computed(() => serversStore.servers.length);
const runningServers = computed(() => serversStore.servers.filter(s => s.state === "running").length);
const sleepingServers = computed(() => serversStore.servers.filter(s => s.state === "stopped" || s.state === "created").length);
const totalBackups = computed(() => 0); // TODO: aggregate from backup store

onMounted(() => serversStore.fetchAll());

async function startServer(id: string) {
  await serversApi.start(id);
  ui.notify("success", "Server starting...");
  setTimeout(() => serversStore.refreshStatus(), 2000);
}

async function stopServer(id: string) {
  await serversApi.stop(id);
  ui.notify("info", "Server stopped");
  serversStore.refreshStatus();
}

async function backupServer(id: string) {
  ui.notify("info", "Creating backup...");
  try {
    await backupsApi.create(id, "Quick backup");
    ui.notify("success", "Backup created");
  } catch {
    ui.notify("error", "Backup failed");
  }
}
</script>
