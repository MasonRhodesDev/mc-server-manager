<template>
  <div class="max-w-lg space-y-6">
    <h2 class="text-lg font-semibold text-coal-100">Authentication Providers</h2>

    <div v-if="loading" class="flex justify-center py-12">
      <Loader2 class="w-5 h-5 text-coal-400 animate-spin" />
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="p in providers"
        :key="p.provider"
        class="card space-y-4"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <ProviderIcon :provider="p.provider" class="w-6 h-6" />
            <span class="text-sm font-semibold text-coal-100 capitalize">{{ p.provider }}</span>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" v-model="p.enabled" class="sr-only peer" />
            <div class="w-9 h-5 bg-coal-700 rounded-full peer-checked:bg-green-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-4"></div>
          </label>
        </div>

        <template v-if="p.enabled">
          <div>
            <label class="label">Client ID</label>
            <input v-model="p.clientId" class="input" placeholder="OAuth client ID" />
          </div>
          <div>
            <label class="label">Client Secret</label>
            <input v-model="p.clientSecret" type="password" class="input" placeholder="OAuth client secret" />
          </div>
          <div>
            <label class="label">Redirect URI</label>
            <input v-model="p.redirectUri" class="input" :placeholder="`https://your-domain/auth/callback?provider=${p.provider}`" />
          </div>
          <button @click="save(p)" class="btn-primary text-xs" :disabled="saving === p.provider">
            <Loader2 v-if="saving === p.provider" class="w-3.5 h-3.5 animate-spin" />
            Save
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Loader2 } from "lucide-vue-next";
import ProviderIcon from "../../components/ProviderIcon.vue";
import { settings as settingsApi } from "../../api/endpoints.js";
import { useUIStore } from "../../stores/ui.js";

const ui = useUIStore();
const loading = ref(true);
const saving = ref<string | null>(null);
const providers = ref<any[]>([]);

onMounted(async () => {
  const data = await settingsApi.getAuth();
  providers.value = data.providers.map((p: any) => ({ ...p, clientSecret: "" }));
  loading.value = false;
});

async function save(p: any) {
  saving.value = p.provider;
  try {
    await settingsApi.setAuthProvider(p.provider, {
      clientId: p.clientId,
      clientSecret: p.clientSecret || undefined,
      enabled: p.enabled,
      redirectUri: p.redirectUri,
    });
    ui.notify("success", `${p.provider} settings saved`);
  } catch {
    ui.notify("error", "Failed to save settings");
  } finally {
    saving.value = null;
  }
}
</script>
