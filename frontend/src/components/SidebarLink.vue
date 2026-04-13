<template>
  <RouterLink
    :to="to"
    class="flex items-center gap-3 px-2 py-2 rounded-lg text-coal-400 hover:text-coal-100 hover:bg-coal-800 transition-colors text-sm"
    :class="{ '!text-green-400 bg-green-900/20': isActive }"
    :title="ui.sidebarCollapsed ? label : undefined"
  >
    <component :is="icon" class="w-4 h-4 shrink-0" />
    <Transition name="fade">
      <span v-if="!ui.sidebarCollapsed" class="whitespace-nowrap">{{ label }}</span>
    </Transition>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import type { Component } from "vue";
import { useUIStore } from "../stores/ui.js";

const props = defineProps<{ to: string; icon: Component; label: string }>();
const ui = useUIStore();
const route = useRoute();
const isActive = computed(() => route.path.startsWith(props.to));
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
</style>
