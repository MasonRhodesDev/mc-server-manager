<template>
  <!-- Simple inline SVG icons for OAuth providers -->
  <svg v-if="provider === 'microsoft'" viewBox="0 0 24 24" fill="currentColor" class="text-sky-400">
    <path d="M3 3h8.5v8.5H3V3zm9.5 0H21v8.5h-8.5V3zM3 12.5H11.5V21H3v-8.5zm9.5 0H21V21h-8.5v-8.5z"/>
  </svg>
  <span v-else class="text-coal-400">?</span>
</template>

<script setup lang="ts">
defineProps<{ provider: string }>();
</script>
