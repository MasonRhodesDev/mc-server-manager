<template>
  <div class="max-w-xl">
    <div class="mb-6">
      <RouterLink to="/servers" class="btn-ghost text-xs px-0 text-coal-500">
        <ChevronLeft class="w-3.5 h-3.5" />
        Back to Servers
      </RouterLink>
    </div>

    <div class="card space-y-5">
      <h2 class="text-base font-semibold text-coal-100">Deploy New Server</h2>

      <div>
        <label class="label">Server Name</label>
        <input v-model="form.name" class="input" placeholder="ftb-skies-2" />
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

      <div>
        <label class="label">RCON Password</label>
        <input v-model="form.rconPassword" type="password" class="input" placeholder="••••••••" autocomplete="new-password" />
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
import { useRouter, RouterLink } from "vue-router";
import { Server, ChevronLeft, Loader2 } from "lucide-vue-next";
import { servers as serversApi } from "../../api/endpoints.js";
import { useUIStore } from "../../stores/ui.js";

const router = useRouter();
const ui = useUIStore();

const submitting = ref(false);
const form = ref({
  name: "",
  serverType: "FTBA",
  modpackId: null as number | null,
  modpackVersionId: null as number | null,
  memoryGb: 8,
  initMemoryGb: 2,
  rconPassword: "",
  serverHostname: "mc.immaduck.xyz",
  serverPort: 25566,
  routerApiPort: 25556,
  autoScaleDownAfter: "10m",
});

async function submit() {
  if (!form.value.name || !form.value.rconPassword) {
    ui.notify("error", "Server name and RCON password are required");
    return;
  }
  submitting.value = true;
  try {
    await serversApi.create({ ...form.value });
    ui.notify("success", `Server '${form.value.name}' created`);
    router.push("/servers");
  } catch (e: any) {
    ui.notify("error", e.response?.data?.error ?? "Failed to create server");
  } finally {
    submitting.value = false;
  }
}
</script>
