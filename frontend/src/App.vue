<template>
  <RouterView />
  <!-- Toast notifications -->
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
    <TransitionGroup name="toast">
      <div
        v-for="n in ui.notifications"
        :key="n.id"
        class="flex items-start gap-3 p-4 rounded-xl shadow-xl border backdrop-blur-sm"
        :class="{
          'bg-green-900/80 border-green-700': n.type === 'success',
          'bg-red-900/80 border-red-700': n.type === 'error',
          'bg-coal-800/90 border-coal-700': n.type === 'info',
        }"
      >
        <CheckCircle v-if="n.type === 'success'" class="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
        <XCircle v-else-if="n.type === 'error'" class="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
        <Info v-else class="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <span class="text-sm text-coal-100">{{ n.message }}</span>
        <button @click="ui.dismiss(n.id)" class="ml-auto text-coal-400 hover:text-coal-200 shrink-0">
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
import { CheckCircle, XCircle, Info, X } from "lucide-vue-next";
import { useUIStore } from "./stores/ui.js";

const ui = useUIStore();
</script>

<style>
.toast-enter-active,
.toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from   { opacity: 0; transform: translateX(100%); }
.toast-leave-to     { opacity: 0; transform: translateX(100%); }
</style>
