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
    case "running":  return "badge-running";
    case "starting": return "badge-starting";
    case "created":  return "badge-created";
    case "stopped":
    default:         return "badge-stopped";
  }
});

const dotClass = computed(() => {
  switch (props.status) {
    case "running":  return "bg-green-400 animate-pulse";
    case "starting": return "bg-yellow-400 animate-pulse";
    case "created":  return "bg-blue-400";
    default:         return "bg-coal-500";
  }
});

const label = computed(() => props.status.charAt(0).toUpperCase() + props.status.slice(1));
</script>
