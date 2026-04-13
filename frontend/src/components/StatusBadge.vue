<template>
  <span :class="badgeClass">
    <span class="w-1.5 h-1.5 rounded-full" :class="dotClass" />
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ status: string }>();

const badgeClass = computed(() => {
  switch (props.status) {
    case "running":       return "badge-running";
    case "starting":
    case "deploying":     return "badge-starting";
    case "created":       return "badge-created";
    case "not deployed":  return "badge-ghost";
    case "stopped":
    case "exited":
    default:              return "badge-stopped";
  }
});

const dotClass = computed(() => {
  switch (props.status) {
    case "running":       return "bg-green-400 animate-pulse";
    case "starting":
    case "deploying":     return "bg-yellow-400 animate-pulse";
    case "created":       return "bg-blue-400";
    case "not deployed":  return "bg-coal-600";
    default:              return "bg-coal-500";
  }
});

const label = computed(() => {
  if (props.status === "not deployed") return "Not Deployed";
  return props.status.charAt(0).toUpperCase() + props.status.slice(1);
});
</script>
