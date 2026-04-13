<template>
  <div class="space-y-6">
    <!-- Search bar -->
    <div class="flex items-center gap-4">
      <div class="relative flex-1 max-w-sm">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-coal-500" />
        <input
          v-model="search"
          @input="debouncedSearch"
          class="input pl-9"
          placeholder="Search FTB modpacks..."
        />
      </div>
      <p class="text-xs text-coal-500">{{ total }} packs</p>
    </div>

    <!-- Pack grid -->
    <div v-if="loading && packs.length === 0" class="flex justify-center py-16">
      <Loader2 class="w-6 h-6 text-coal-400 animate-spin" />
    </div>

    <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="pack in packs"
        :key="pack.id"
        class="card hover:border-coal-600 transition-all cursor-pointer group flex flex-col gap-0 p-0 overflow-hidden"
        @click="openDetail(pack)"
      >
        <!-- Cover art banner -->
        <div class="w-full h-36 overflow-hidden bg-coal-800 relative shrink-0">
          <img
            v-if="coverArt(pack)"
            :src="coverArt(pack)"
            :alt="pack.name"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <Layers class="w-12 h-12 text-coal-700" />
          </div>
          <!-- Version pill -->
          <div v-if="latestVersion(pack)" class="absolute bottom-2 right-2">
            <span class="text-xs bg-black/70 text-coal-200 px-2 py-0.5 rounded-full backdrop-blur-sm">
              v{{ latestVersion(pack)?.name }}
            </span>
          </div>
        </div>

        <!-- Body -->
        <div class="p-4 flex flex-col flex-1 gap-2">
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-sm font-semibold text-coal-100 group-hover:text-white leading-snug">{{ pack.name }}</h3>
            <span class="text-xs text-coal-600 shrink-0">ID {{ pack.id }}</span>
          </div>

          <p class="text-xs text-coal-400 line-clamp-2 flex-1">{{ pack.synopsis }}</p>

          <!-- Tags -->
          <div class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="tag in (pack.tags ?? []).slice(0, 4)"
              :key="tag.name ?? tag"
              class="text-xs bg-coal-800 text-coal-400 px-1.5 py-0.5 rounded"
            >{{ tag.name ?? tag }}</span>
          </div>

          <!-- Stats row -->
          <div class="flex items-center gap-3 text-xs text-coal-500 mt-1">
            <span class="flex items-center gap-1">
              <BookOpen class="w-3 h-3" />
              {{ (pack.versions ?? []).length }} versions
            </span>
            <span v-if="pack.plays" class="flex items-center gap-1">
              <Users class="w-3 h-3" />
              {{ formatPlays(pack.plays) }} plays
            </span>
          </div>

          <!-- Deploy button -->
          <button
            class="btn-primary w-full justify-center mt-2 text-xs py-2"
            @click.stop="deployFromCard(pack)"
          >
            <Rocket class="w-3.5 h-3.5" />
            Deploy
          </button>
        </div>
      </div>
    </div>

    <!-- Load more -->
    <div v-if="!loading && packs.length < total" class="flex justify-center">
      <button @click="loadMore" class="btn-secondary">
        <ChevronDown class="w-4 h-4" />
        Load More ({{ total - packs.length }} remaining)
      </button>
    </div>
  </div>

  <!-- Detail panel (slide-in from right) -->
  <Teleport to="body">
    <Transition name="panel">
      <div
        v-if="selected"
        class="fixed inset-0 z-50 flex"
        @click.self="selected = null"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="selected = null" />

        <!-- Panel -->
        <div class="absolute right-0 top-0 h-full w-full max-w-xl bg-coal-900 border-l border-coal-800 overflow-y-auto flex flex-col shadow-2xl">
          <!-- Header image -->
          <div class="w-full h-48 overflow-hidden bg-coal-800 relative shrink-0">
            <img
              v-if="coverArt(selected)"
              :src="coverArt(selected)"
              :alt="selected.name"
              class="w-full h-full object-cover"
            />
            <button
              @click="selected = null"
              class="absolute top-3 right-3 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors"
            >
              <X class="w-4 h-4 text-white" />
            </button>
          </div>

          <!-- Content -->
          <div class="p-5 flex flex-col gap-5 flex-1">
            <!-- Title + meta -->
            <div>
              <div class="flex items-start justify-between gap-3">
                <h2 class="text-xl font-bold text-coal-50">{{ selected.name }}</h2>
                <span class="text-xs text-coal-500 shrink-0 mt-1">Pack ID {{ selected.id }}</span>
              </div>
              <p class="text-sm text-coal-400 mt-2 leading-relaxed">{{ selected.synopsis }}</p>

              <!-- Tags -->
              <div class="flex flex-wrap gap-1.5 mt-3">
                <span
                  v-for="tag in (selected.tags ?? [])"
                  :key="tag.name ?? tag"
                  class="text-xs bg-coal-800 text-coal-300 px-2 py-0.5 rounded-full border border-coal-700"
                >{{ tag.name ?? tag }}</span>
              </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-3 gap-3">
              <div class="card-sm text-center">
                <p class="text-lg font-semibold text-coal-100">{{ (selected.versions ?? []).length }}</p>
                <p class="text-xs text-coal-500 mt-0.5">Versions</p>
              </div>
              <div class="card-sm text-center">
                <p class="text-lg font-semibold text-coal-100">{{ formatPlays(selected.plays) }}</p>
                <p class="text-xs text-coal-500 mt-0.5">Total Plays</p>
              </div>
              <div class="card-sm text-center">
                <p class="text-lg font-semibold text-coal-100">{{ selected.plays_14d ?? '—' }}</p>
                <p class="text-xs text-coal-500 mt-0.5">14d Plays</p>
              </div>
            </div>

            <!-- Version selector + Deploy -->
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <div class="flex-1">
                  <label class="label">Version</label>
                  <select v-model="selectedVersionId" class="input">
                    <option :value="null">Latest ({{ latestVersion(selected)?.name ?? '?' }})</option>
                    <option
                      v-for="v in (selected.versions ?? []).slice().reverse()"
                      :key="v.id"
                      :value="v.id"
                    >
                      {{ v.name }}
                      <template v-if="mcVersion(v)"> · MC {{ mcVersion(v) }}</template>
                      ({{ v.type }})
                    </option>
                  </select>
                </div>
              </div>

              <button
                @click="deployFromDetail"
                class="btn-primary w-full justify-center py-2.5"
              >
                <Rocket class="w-4 h-4" />
                Deploy {{ selected.name }}
              </button>
            </div>

            <!-- Mod list for selected version -->
            <div v-if="selectedVersionId || latestVersion(selected)">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-coal-200">Mods</h3>
                <button
                  v-if="!modList && !modsLoading"
                  @click="loadMods"
                  class="btn-ghost text-xs px-2 py-1"
                >
                  <Package class="w-3.5 h-3.5" />
                  Load mod list
                </button>
                <Loader2 v-if="modsLoading" class="w-4 h-4 text-coal-400 animate-spin" />
                <span v-if="modList" class="text-xs text-coal-500">{{ modList.length }} mods</span>
              </div>

              <div v-if="modList" class="space-y-1 max-h-64 overflow-y-auto pr-1">
                <div
                  v-for="mod in modList"
                  :key="mod.id ?? mod.name"
                  class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-coal-800 transition-colors"
                >
                  <span class="text-xs text-coal-300 truncate">{{ mod.name }}</span>
                  <span class="text-xs text-coal-500 shrink-0 ml-2">{{ mod.version || '' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Search, Layers, Loader2, ChevronDown, BookOpen, Users, Rocket, X, Package } from "lucide-vue-next";
import { ftb as ftbApi } from "../../api/endpoints.js";

const router = useRouter();

const search = ref("");
const packs = ref<any[]>([]);
const total = ref(0);
const loading = ref(true);
const offset = ref(0);
const LIMIT = 24;

// Detail panel state
const selected = ref<any | null>(null);
const selectedVersionId = ref<number | null>(null);
const modList = ref<any[] | null>(null);
const modsLoading = ref(false);

// ── Helpers ──────────────────────────────────────────────────────────────────

function coverArt(pack: any): string | undefined {
  const art = pack.art ?? [];
  return art.find((a: any) => a.type === "square")?.url
    ?? art.find((a: any) => a.width >= 256)?.url
    ?? art[0]?.url
    ?? undefined;
}

function latestVersion(pack: any): any | null {
  const versions: any[] = pack.versions ?? [];
  // prefer "release" type, then last in list
  return versions.filter((v: any) => v.type === "release").at(-1)
    ?? versions.at(-1)
    ?? null;
}

function mcVersion(v: any): string | null {
  const target = (v.targets ?? []).find((t: any) => t.type === "game" || t.name === "minecraft");
  return target?.version ?? null;
}

function formatPlays(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

// ── Data fetching ────────────────────────────────────────────────────────────

let searchTimer: ReturnType<typeof setTimeout>;
function debouncedSearch() {
  clearTimeout(searchTimer);
  offset.value = 0;
  packs.value = [];
  searchTimer = setTimeout(() => fetchPacks(false), 300);
}

async function fetchPacks(append = false) {
  loading.value = true;
  try {
    const data = await ftbApi.packs({
      search: search.value.trim() || undefined,
      limit: LIMIT,
      offset: offset.value,
    });
    packs.value = append ? [...packs.value, ...(data.packs ?? [])] : (data.packs ?? []);
    total.value = data.total ?? 0;
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  offset.value += LIMIT;
  await fetchPacks(true);
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function openDetail(pack: any) {
  selected.value = pack;
  selectedVersionId.value = null;
  modList.value = null;
}

watch(selectedVersionId, () => {
  modList.value = null;
});

async function loadMods() {
  if (!selected.value) return;
  modsLoading.value = true;
  try {
    const versionId = selectedVersionId.value ?? latestVersion(selected.value)?.id;
    if (!versionId) return;
    const data = await ftbApi.versionDetail(selected.value.id, versionId);
    const files = data.version?.files ?? [];
    modList.value = files
      .filter((f: any) => f.type === "mod" || f.path?.includes("mods/"))
      .map((f: any) => ({ name: f.name, version: f.version }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  } finally {
    modsLoading.value = false;
  }
}

// ── Deploy ────────────────────────────────────────────────────────────────────

function deployFromCard(pack: any) {
  const latest = latestVersion(pack);
  router.push({
    path: "/servers/new",
    query: {
      packId: pack.id,
      packName: pack.name,
      ...(latest ? { versionId: latest.id } : {}),
    },
  });
}

function deployFromDetail() {
  if (!selected.value) return;
  router.push({
    path: "/servers/new",
    query: {
      packId: selected.value.id,
      packName: selected.value.name,
      ...(selectedVersionId.value ? { versionId: selectedVersionId.value } : {}),
    },
  });
}

onMounted(fetchPacks);
</script>

<style scoped>
.panel-enter-active,
.panel-leave-active {
  transition: opacity 150ms ease;
}
.panel-enter-active .absolute.right-0,
.panel-leave-active .absolute.right-0 {
  transition: transform 200ms ease;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
}
.panel-enter-from .absolute.right-0 {
  transform: translateX(100%);
}
.panel-leave-to .absolute.right-0 {
  transform: translateX(100%);
}
</style>
