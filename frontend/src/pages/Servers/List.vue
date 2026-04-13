<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-coal-100">Servers</h2>
        <p class="text-xs text-coal-500 mt-0.5">{{ serversStore.servers.length }} server(s) configured</p>
      </div>
      <RouterLink to="/servers/new" class="btn-primary">
        <Plus class="w-4 h-4" />
        New Server
      </RouterLink>
    </div>

    <div v-if="serversStore.loading" class="flex justify-center py-16">
      <Loader2 class="w-6 h-6 text-coal-400 animate-spin" />
    </div>

    <div v-else-if="serversStore.servers.length === 0" class="card text-center py-16">
      <Server class="w-12 h-12 text-coal-700 mx-auto mb-4" />
      <p class="text-coal-300 font-medium">No servers deployed</p>
      <p class="text-coal-500 text-sm mt-1">Deploy your first Minecraft server to get started.</p>
      <RouterLink to="/servers/new" class="btn-primary mt-6 inline-flex">
        <Plus class="w-4 h-4" />
        Deploy a Server
      </RouterLink>
    </div>

    <div v-else class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <ServerCard
        v-for="server in serversStore.servers"
        :key="server.id"
        :server="server"
        @start="start"
        @stop="stop"
        @backup="backup"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink } from "vue-router";
import { Plus, Server, Loader2 } from "lucide-vue-next";
import { useServersStore } from "../../stores/servers.js";
import { useUIStore } from "../../stores/ui.js";
import { servers as serversApi, backups as backupsApi } from "../../api/endpoints.js";
import ServerCard from "../../components/ServerCard.vue";

const serversStore = useServersStore();
const ui = useUIStore();

onMounted(() => serversStore.fetchAll());

async function start(id: string) {
  try { await serversApi.start(id); ui.notify("success", "Server starting..."); }
  catch { ui.notify("error", "Failed to start server"); }
  setTimeout(() => serversStore.refreshStatus(), 3000);
}
async function stop(id: string) {
  try { await serversApi.stop(id); ui.notify("info", "Server stopped"); }
  catch { ui.notify("error", "Failed to stop server"); }
  serversStore.refreshStatus();
}
async function backup(id: string) {
  try {
    ui.notify("info", "Creating backup...");
    await backupsApi.create(id, "Manual backup");
    ui.notify("success", "Backup created");
  } catch {
    ui.notify("error", "Backup failed");
  }
}
</script>
