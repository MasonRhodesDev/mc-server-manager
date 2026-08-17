<template>
  <div class="max-w-lg space-y-6">
    <h2 class="text-lg font-semibold text-coal-100">Authentication</h2>
    <p class="text-coal-400 text-sm">
      Sign-in uses personal Microsoft accounts (the same identity Minecraft uses).
      Register an Azure app with account type “Personal Microsoft accounts only”
      and a Web redirect URI that matches the field below.
    </p>

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
            <input v-model="p.clientId" class="input" placeholder="Azure application (client) ID" />
          </div>
          <div>
            <label class="label">Client Secret</label>
            <input v-model="p.clientSecret" type="password" class="input" placeholder="Leave blank to keep the current secret" />
          </div>
          <div>
            <label class="label">Redirect URI</label>
            <input v-model="p.redirectUri" class="input" placeholder="https://your-domain/auth/callback" />
          </div>
        </template>
      </div>

      <div class="card space-y-3">
        <div>
          <h3 class="text-sm font-semibold text-coal-100">Allowed users</h3>
          <p class="text-coal-500 text-xs mt-1">
            One email per line. Leave empty to allow any Microsoft account.
            First user becomes admin. If you add a list, include your own email or you will be locked out.
          </p>
        </div>
        <textarea
          v-model="allowedEmailsText"
          class="input min-h-[8rem] font-mono text-xs"
          placeholder="you@outlook.com"
        />
      </div>

      <button
        v-if="providers[0]"
        @click="save(providers[0])"
        class="btn-primary text-xs"
        :disabled="saving !== null"
      >
        <Loader2 v-if="saving !== null" class="w-3.5 h-3.5 animate-spin" />
        Save
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Loader2 } from "lucide-vue-next";
import ProviderIcon from "../../components/ProviderIcon.vue";
import { settings as settingsApi } from "../../api/endpoints.js";
import { useUIStore } from "../../stores/ui.js";

type ProviderForm = {
  provider: string;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  redirectUri: string;
};

const ui = useUIStore();
const loading = ref(true);
const saving = ref<string | null>(null);
const providers = ref<ProviderForm[]>([]);
const allowedEmailsText = ref("");

onMounted(async () => {
  const data = await settingsApi.getAuth();
  const rows: unknown = data.providers;
  if (Array.isArray(rows)) {
    providers.value = rows.flatMap((row): ProviderForm[] => {
      if (typeof row !== "object" || row === null) return [];
      const provider = "provider" in row && typeof row.provider === "string" ? row.provider : null;
      const clientId = "clientId" in row && typeof row.clientId === "string" ? row.clientId : "";
      const enabled = "enabled" in row && typeof row.enabled === "boolean" ? row.enabled : false;
      const redirectUri = "redirectUri" in row && typeof row.redirectUri === "string" ? row.redirectUri : "";
      if (!provider) return [];
      return [{ provider, clientId, clientSecret: "", enabled, redirectUri }];
    });
  }
  const emails: unknown = data.allowedEmails;
  if (Array.isArray(emails)) {
    allowedEmailsText.value = emails.filter((e): e is string => typeof e === "string").join("\n");
  }
  loading.value = false;
});

async function save(p: ProviderForm) {
  saving.value = p.provider;
  try {
    await settingsApi.setAuthProvider(p.provider, {
      clientId: p.clientId,
      clientSecret: p.clientSecret || undefined,
      enabled: p.enabled,
      redirectUri: p.redirectUri,
      allowedEmails: allowedEmailsText.value.split("\n"),
    });
    ui.notify("success", `${p.provider} settings saved`);
  } catch {
    ui.notify("error", "Failed to save settings");
  } finally {
    saving.value = null;
  }
}
</script>
