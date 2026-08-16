<template>
  <div class="max-w-xl">
    <div class="mb-6">
      <RouterLink to="/servers" class="btn-ghost text-xs px-0 text-coal-500">
        <ChevronLeft class="w-3.5 h-3.5" />
        Back to Servers
      </RouterLink>
    </div>

    <div class="card space-y-5">
      <div class="flex items-start justify-between gap-3">
        <h2 class="text-base font-semibold text-coal-100">Deploy New Server</h2>
        <div v-if="packName" class="flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-2.5 py-1 shrink-0">
          <Layers class="w-3.5 h-3.5 text-green-400 shrink-0" />
          <span class="text-xs text-green-300 truncate max-w-[160px]">{{ packName }}</span>
        </div>
      </div>

      <div>
        <label class="label">Server Name</label>
        <input v-model="form.name" class="input" placeholder="ftb-skies-2" />
        <p class="text-xs text-coal-500 mt-1">Lowercase letters, numbers, hyphens only</p>
      </div>

      <div>
        <label class="label">Server Type</label>
        <select v-model="form.serverType" class="input">
          <option value="FTBA">FTB App (FTBA)</option>
          <option value="VANILLA">Vanilla</option>
          <option value="FORGE">Forge</option>
          <option value="PAPER">Paper</option>
        </select>
      </div>

      <template v-if="form.serverType === 'FTBA'">
        <div>
          <label class="label">FTB Pack ID</label>
          <div class="flex gap-2">
            <input v-model.number="form.modpackId" type="number" class="input" placeholder="129" />
            <RouterLink to="/ftb" class="btn-secondary text-xs px-3 shrink-0">Browse</RouterLink>
          </div>
          <p class="text-xs text-coal-500 mt-1">Find pack IDs at feed-the-beast.com</p>
        </div>
        <div>
          <label class="label">Version ID <span class="text-coal-600 font-normal normal-case">(optional — leave blank for latest)</span></label>
          <input v-model.number="form.modpackVersionId" type="number" class="input" placeholder="Latest" />
        </div>
      </template>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label">Memory (GB)</label>
          <input v-model.number="form.memoryGb" type="number" min="1" max="30" class="input" />
        </div>
        <div>
          <label class="label">Init Memory (GB)</label>
          <input v-model.number="form.initMemoryGb" type="number" min="1" max="8" class="input" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label">Hostname</label>
          <input v-model="form.serverHostname" class="input" placeholder="mc.immaduck.xyz" />
        </div>
        <div>
          <label class="label">Port</label>
          <input v-model.number="form.serverPort" type="number" class="input" placeholder="25566" />
        </div>
      </div>

      <div>
        <label class="label">Router API Port</label>
        <input v-model.number="form.routerApiPort" type="number" class="input" placeholder="25556" />
      </div>

      <div>
        <label class="label">Auto-Sleep After</label>
        <input v-model="form.autoScaleDownAfter" class="input" placeholder="10m" />
        <p class="text-xs text-coal-500 mt-1">e.g. 5m, 30m, 1h</p>
      </div>

      <button type="button" @click="showAdvanced = !showAdvanced" class="btn-ghost text-xs px-0 text-coal-500">
        <ChevronDown class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-180': showAdvanced }" />
        Advanced
      </button>
      <div v-if="showAdvanced" class="space-y-1">
        <label class="label">RCON Password</label>
        <input v-model="form.rconPassword" type="password" class="input" placeholder="Generated automatically" autocomplete="new-password" />
        <p class="text-xs text-coal-500 mt-1">Leave blank to generate a random password. The manager uses this for backups.</p>
      </div>

      <div class="pt-2">
        <button @click="submit" class="btn-primary w-full justify-center" :disabled="submitting">
          <Loader2 v-if="submitting" class="w-4 h-4 animate-spin" />
          <Server v-else class="w-4 h-4" />
          {{ submitting ? "Creating..." : "Create Server" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter, useRoute, RouterLink } from "vue-router";
import { Server, ChevronLeft, ChevronDown, Loader2, Layers } from "lucide-vue-next";
import { isAxiosError } from "axios";
import { servers as serversApi } from "../../api/endpoints.js";
import { useUIStore } from "../../stores/ui.js";

const router = useRouter();
const route = useRoute();
const ui = useUIStore();

// Pre-fill from FTB Explorer query params (?packId=103&packName=FTB+Skies)
const packId = route.query.packId ? Number(route.query.packId) : null;
const packName = route.query.packName ? String(route.query.packName) : "";
const packVersionId = route.query.versionId ? Number(route.query.versionId) : null;

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const submitting = ref(false);
const showAdvanced = ref(false);
const form = ref({
  name: packName ? slugify(packName) : "",
  serverType: packId ? "FTBA" : "FTBA",
  modpackId: packId,
  modpackVersionId: packVersionId,
  memoryGb: 8,
  initMemoryGb: 2,
  rconPassword: "",
  serverHostname: "mc.immaduck.xyz",
  serverPort: 25566,
  routerApiPort: 25556,
  autoScaleDownAfter: "10m",
});

async function submit() {
  if (!form.value.name) {
    ui.notify("error", "Server name is required");
    return;
  }
  submitting.value = true;
  try {
    const { rconPassword, ...rest } = form.value;
    await serversApi.create(rconPassword ? { ...rest, rconPassword } : rest);
    ui.notify("success", `Server '${form.value.name}' created`);
    router.push("/servers");
  } catch (e: unknown) {
    const data = isAxiosError(e) ? e.response?.data : null;
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : "Failed to create server";
    ui.notify("error", message);
  } finally {
    submitting.value = false;
  }
}
</script>
