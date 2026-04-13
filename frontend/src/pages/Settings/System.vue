<template>
  <div class="max-w-lg space-y-6">
    <h2 class="text-lg font-semibold text-coal-100">System Settings</h2>

    <div v-if="loading" class="flex justify-center py-12">
      <Loader2 class="w-5 h-5 text-coal-400 animate-spin" />
    </div>

    <div v-else class="card space-y-4">
      <div>
        <label class="label">Minecraft Data Path</label>
        <input :value="settings.dataPath" class="input" disabled />
        <p class="text-xs text-coal-500 mt-1">Set via DATA_PATH environment variable</p>
      </div>
      <div>
        <label class="label">Backups Path</label>
        <input :value="settings.backupsPath" class="input" disabled />
        <p class="text-xs text-coal-500 mt-1">Set via BACKUPS_PATH environment variable</p>
      </div>
      <div>
        <label class="label">Default Memory (GB)</label>
        <input :value="settings.defaultMemoryGb" class="input" disabled />
      </div>
      <div>
        <label class="label">FTB Cache TTL (hours)</label>
        <input :value="settings.ftbCacheTtlHours" class="input" disabled />
        <p class="text-xs text-coal-500 mt-1">Set via FTB_CACHE_TTL_HOURS environment variable</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Loader2 } from "lucide-vue-next";
import { settings as settingsApi } from "../../api/endpoints.js";

const loading = ref(true);
const settings = ref<any>({});

onMounted(async () => {
  const data = await settingsApi.getSystem();
  settings.value = data.settings;
  loading.value = false;
});
</script>
