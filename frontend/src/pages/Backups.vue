<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-coal-100">Backups</h2>
      <select v-model="filterServerId" class="input w-auto text-xs">
        <option value="">All Servers</option>
        <option v-for="s in servers" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <Loader2 class="w-6 h-6 text-coal-400 animate-spin" />
    </div>

    <div v-else-if="filteredBackups.length === 0" class="card text-center py-12">
      <Database class="w-10 h-10 text-coal-700 mx-auto mb-3" />
      <p class="text-coal-400 text-sm">No backups found</p>
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="backup in filteredBackups"
        :key="backup.id"
        class="card-sm flex items-center justify-between gap-4"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-coal-200 truncate">{{ backup.label }}</span>
            <span :class="backup.type === 'manual' ? 'badge-created' : 'badge-stopped'">
              {{ backup.type }}
            </span>
          </div>
          <p class="text-xs text-coal-500 mt-0.5">
            {{ serverName(backup.server_id) }} ·
            {{ formatDate(backup.created_at) }} ·
            {{ formatBytes(backup.size_bytes) }}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button @click="restore(backup)" class="btn-ghost text-xs text-yellow-400">
            <Undo2 class="w-3.5 h-3.5" />
            Restore
          </button>
          <button @click="deleteBackup(backup)" class="btn-ghost text-xs text-red-400">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { Database, Loader2, Undo2, Trash2 } from "lucide-vue-next";
import { format } from "date-fns";
import { servers as serversApi, backups as backupsApi } from "../api/endpoints.js";
import { useUIStore } from "../stores/ui.js";

const ui = useUIStore();
const loading = ref(true);
const servers = ref<any[]>([]);
const allBackups = ref<any[]>([]);
const filterServerId = ref("");

const filteredBackups = computed(() =>
  filterServerId.value
    ? allBackups.value.filter((b: any) => b.server_id === filterServerId.value)
    : allBackups.value
);

onMounted(async () => {
  const data = await serversApi.list();
  servers.value = data.servers;
  const results = await Promise.all(servers.value.map((s: any) => backupsApi.list(s.id)));
  allBackups.value = results.flatMap((r: any) => r.backups ?? [])
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  loading.value = false;
});

function serverName(serverId: string) {
  return servers.value.find((s: any) => s.id === serverId)?.name ?? serverId;
}

async function restore(backup: any) {
  if (!confirm(`Restore from "${backup.label}"? This replaces all server data.`)) return;
  ui.notify("info", "Restoring...");
  try {
    await backupsApi.restore(backup.server_id, backup.id);
    ui.notify("success", "Restore complete");
  } catch {
    ui.notify("error", "Restore failed");
  }
}

async function deleteBackup(backup: any) {
  if (!confirm("Delete this backup?")) return;
  await backupsApi.delete(backup.server_id, backup.id);
  allBackups.value = allBackups.value.filter((b: any) => b.id !== backup.id);
  ui.notify("info", "Backup deleted");
}

function formatDate(iso: string) { return format(new Date(iso), "MMM d, yyyy HH:mm"); }
function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
}
</script>
