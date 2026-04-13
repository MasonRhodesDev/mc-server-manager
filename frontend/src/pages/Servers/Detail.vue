<template>
  <div v-if="server" class="space-y-6">
    <!-- Breadcrumb + header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <RouterLink to="/servers" class="btn-ghost text-xs px-0 text-coal-500">
          <ChevronLeft class="w-3.5 h-3.5" />
          Servers
        </RouterLink>
        <h2 class="text-xl font-bold text-coal-100 mt-1">{{ server.name }}</h2>
        <div class="flex items-center gap-3 mt-1.5">
          <StatusBadge :status="liveStatus" />
          <span class="text-xs text-coal-500">{{ server.serverType }}<template v-if="server.modpackId"> · Pack {{ server.modpackId }}</template></span>
        </div>
      </div>

      <!-- Control buttons -->
      <div class="flex items-center gap-2 shrink-0">
        <button v-if="liveStatus === 'running'" @click="doStop" class="btn-secondary">
          <Square class="w-4 h-4 text-red-400" />
          Stop
        </button>
        <button v-else @click="doStart" class="btn-primary">
          <Play class="w-4 h-4" />
          Start
        </button>
        <button @click="doBackup" class="btn-secondary">
          <Database class="w-4 h-4" />
          Backup
        </button>
      </div>
    </div>

    <!-- Info cards -->
    <div class="grid sm:grid-cols-3 gap-4">
      <div class="card-sm">
        <p class="label">Memory</p>
        <p class="text-lg font-semibold text-coal-100">{{ server.memoryGb }}GB</p>
        <p class="text-xs text-coal-500">Init: {{ server.initMemoryGb }}GB</p>
      </div>
      <div class="card-sm">
        <p class="label">Auto-Sleep</p>
        <p class="text-lg font-semibold text-coal-100">{{ server.autoScaleDownAfter }}</p>
        <p class="text-xs text-coal-500">after idle</p>
      </div>
      <div class="card-sm">
        <p class="label">Port</p>
        <p class="text-lg font-semibold text-coal-100">:{{ server.serverPort }}</p>
        <p class="text-xs text-coal-500">{{ server.serverHostname }}</p>
      </div>
    </div>

    <!-- Log viewer -->
    <div class="card">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-coal-200">Logs</h3>
        <button @click="fetchLogs" class="btn-ghost text-xs px-2 py-1">
          <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': logsLoading }" />
          Refresh
        </button>
      </div>
      <div class="bg-coal-950 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs">
        <div v-for="(line, i) in logs" :key="i" class="log-line">{{ line }}</div>
        <div v-if="logs.length === 0" class="text-coal-600">No logs available — server may be stopped.</div>
      </div>
    </div>

    <!-- Backups -->
    <div class="card">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-coal-200">Backups</h3>
        <button @click="doBackup" class="btn-secondary text-xs px-3 py-1.5">
          <Plus class="w-3.5 h-3.5" />
          Create
        </button>
      </div>

      <div v-if="serverBackups.length === 0" class="text-center py-6 text-coal-600 text-sm">
        No backups yet
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="backup in serverBackups"
          :key="backup.id"
          class="flex items-center justify-between p-3 rounded-lg bg-coal-800 hover:bg-coal-700 transition-colors"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium text-coal-200 truncate">{{ backup.label }}</p>
            <p class="text-xs text-coal-500">
              {{ formatDate(backup.createdAt) }} ·
              {{ formatBytes(backup.sizeBytes) }} ·
              <span :class="backup.type === 'manual' ? 'text-blue-400' : 'text-coal-500'">{{ backup.type }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button @click="doRestore(backup.id)" class="btn-ghost text-xs px-2 py-1 text-yellow-400 hover:text-yellow-300">
              <Undo2 class="w-3.5 h-3.5" />
              Restore
            </button>
            <button @click="doDeleteBackup(backup.id)" class="btn-ghost text-xs px-2 py-1 text-red-400 hover:text-red-300">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="flex justify-center py-16">
    <Loader2 class="w-6 h-6 text-coal-400 animate-spin" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { ChevronLeft, Square, Play, Database, RefreshCw, Plus, Undo2, Trash2, Loader2 } from "lucide-vue-next";
import { format } from "date-fns";
import StatusBadge from "../../components/StatusBadge.vue";
import { servers as serversApi, backups as backupsApi } from "../../api/endpoints.js";
import { useUIStore } from "../../stores/ui.js";

const route = useRoute();
const ui = useUIStore();

const server = ref<any>(null);
const liveStatus = ref("stopped");
const logs = ref<string[]>([]);
const logsLoading = ref(false);
const serverBackups = ref<any[]>([]);

onMounted(async () => {
  const id = route.params.id as string;
  const [serverData, statusData, backupData] = await Promise.all([
    serversApi.get(id).then(d => d.server),
    serversApi.status(id).then(d => d.containers.game ?? "stopped"),
    backupsApi.list(id).then(d => d.backups),
  ]);
  server.value = serverData;
  liveStatus.value = statusData;
  serverBackups.value = backupData;
  fetchLogs();
});

async function fetchLogs() {
  if (!server.value) return;
  logsLoading.value = true;
  try {
    const data = await serversApi.logs(server.value.id, 150);
    logs.value = data.logs;
  } finally {
    logsLoading.value = false;
  }
}

async function doStart() {
  await serversApi.start(server.value.id);
  liveStatus.value = "starting";
  ui.notify("success", "Server starting...");
}

async function doStop() {
  await serversApi.stop(server.value.id);
  liveStatus.value = "stopped";
  ui.notify("info", "Server stopped");
}

async function doBackup() {
  ui.notify("info", "Creating backup...");
  try {
    const data = await backupsApi.create(server.value.id, "Manual backup");
    serverBackups.value.unshift(data.backup);
    ui.notify("success", "Backup created");
  } catch {
    ui.notify("error", "Backup failed");
  }
}

async function doRestore(backupId: string) {
  if (!confirm("This will replace all server data. Continue?")) return;
  ui.notify("info", "Restoring backup...");
  try {
    await backupsApi.restore(server.value.id, backupId);
    ui.notify("success", "Restore complete — server restarting");
    liveStatus.value = "starting";
  } catch {
    ui.notify("error", "Restore failed");
  }
}

async function doDeleteBackup(backupId: string) {
  if (!confirm("Delete this backup?")) return;
  await backupsApi.delete(server.value.id, backupId);
  serverBackups.value = serverBackups.value.filter((b: any) => b.id !== backupId);
  ui.notify("info", "Backup deleted");
}

function formatDate(iso: string) {
  return format(new Date(iso), "MMM d, HH:mm");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
}
</script>
