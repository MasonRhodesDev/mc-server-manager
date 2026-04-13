<template>
  <div class="space-y-6">
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

    <div v-if="loading" class="flex justify-center py-16">
      <Loader2 class="w-6 h-6 text-coal-400 animate-spin" />
    </div>

    <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <div
        v-for="pack in packs"
        :key="pack.id"
        class="card hover:border-coal-600 transition-colors cursor-pointer group"
        @click="select(pack)"
      >
        <!-- Cover art -->
        <div class="w-full h-28 rounded-lg overflow-hidden bg-coal-800 mb-3">
          <img
            v-if="coverArt(pack)"
            :src="coverArt(pack)"
            :alt="pack.name"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform"
            loading="lazy"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <Layers class="w-8 h-8 text-coal-700" />
          </div>
        </div>

        <h3 class="text-sm font-semibold text-coal-100 truncate">{{ pack.name }}</h3>
        <p class="text-xs text-coal-500 mt-1 line-clamp-2">{{ pack.synopsis }}</p>
        <p class="text-xs text-coal-600 mt-2">ID: {{ pack.id }}</p>

        <!-- Deploy button -->
        <RouterLink
          :to="`/servers/new?packId=${pack.id}&packName=${encodeURIComponent(pack.name)}`"
          class="btn-primary w-full justify-center mt-3 text-xs py-1.5"
          @click.stop
        >
          <Plus class="w-3.5 h-3.5" />
          Deploy
        </RouterLink>
      </div>
    </div>

    <!-- Load more -->
    <div v-if="!loading && packs.length < total" class="flex justify-center">
      <button @click="loadMore" class="btn-secondary">
        <ChevronDown class="w-4 h-4" />
        Load More
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { Search, Layers, Plus, Loader2, ChevronDown } from "lucide-vue-next";
import { ftb as ftbApi } from "../../api/endpoints.js";

const search = ref("");
const packs = ref<any[]>([]);
const total = ref(0);
const loading = ref(true);
const offset = ref(0);
const LIMIT = 24;

let searchTimer: ReturnType<typeof setTimeout>;
function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(fetchPacks, 300);
}

async function fetchPacks(append = false) {
  loading.value = true;
  try {
    const data = await ftbApi.packs({ search: search.value || undefined, limit: LIMIT, offset: offset.value });
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

function coverArt(pack: any) {
  return pack.art?.find((a: any) => a.type === "square")?.url ?? pack.art?.[0]?.url ?? null;
}

function select(pack: any) {
  // Navigate to create with pre-filled pack ID
  window.location.href = `/servers/new?packId=${pack.id}&packName=${encodeURIComponent(pack.name)}`;
}

onMounted(fetchPacks);
</script>
