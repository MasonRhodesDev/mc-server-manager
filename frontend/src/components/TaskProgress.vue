<template>
  <div v-if="task" class="card p-3 space-y-2">
    <div class="flex items-center gap-2 text-sm text-coal-300">
      <Loader2 class="w-3.5 h-3.5 animate-spin shrink-0 text-blue-400" />
      <span class="truncate">{{ task.message ?? task.currentStep ?? labelFor(task.kind) }}</span>
      <span class="ml-auto text-xs text-coal-500 tabular-nums shrink-0">{{ task.progressPct }}%</span>
    </div>
    <div class="h-1 rounded-full bg-coal-700 overflow-hidden">
      <div
        class="h-full bg-blue-500 transition-all duration-300 ease-out"
        :style="{ width: task.progressPct + '%' }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import type { ActiveTask } from "../stores/tasks.js";

defineProps<{ task: ActiveTask | undefined }>();

function labelFor(kind: string) {
  if (kind === "deploy")  return "Deploying…";
  if (kind === "backup")  return "Creating backup…";
  if (kind === "restore") return "Restoring backup…";
  return "Working…";
}
</script>
