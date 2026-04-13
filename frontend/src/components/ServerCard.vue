<template>
  <RouterLink :to="`/servers/${server.id}`" class="card hover:border-coal-600 transition-colors block group">
    <div class="flex items-start justify-between gap-4">
      <!-- Icon + name -->
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-lg bg-coal-800 flex items-center justify-center shrink-0">
          <Layers v-if="server.serverType === 'FTBA'" class="w-5 h-5 text-orange-400" />
          <Server v-else class="w-5 h-5 text-coal-400" />
        </div>
        <div class="min-w-0">
          <h3 class="text-sm font-semibold text-coal-100 truncate group-hover:text-white">
            {{ server.name }}
          </h3>
          <p class="text-xs text-coal-500 truncate">
            {{ server.serverType }}
            <template v-if="server.modpackId">· Pack {{ server.modpackId }}</template>
          </p>
        </div>
      </div>
      <StatusBadge :status="server.state" />
    </div>

    <!-- Stats row -->
    <div class="mt-4 flex items-center gap-4 text-xs text-coal-500">
      <span class="flex items-center gap-1">
        <Cpu class="w-3.5 h-3.5" />
        {{ server.memoryGb }}GB RAM
      </span>
      <span class="flex items-center gap-1">
        <Globe class="w-3.5 h-3.5" />
        :{{ server.serverPort }}
      </span>
      <span class="flex items-center gap-1">
        <Clock class="w-3.5 h-3.5" />
        {{ server.autoScaleDownAfter }} idle
      </span>
    </div>

    <!-- Quick actions -->
    <div class="mt-4 flex items-center gap-2" @click.prevent>
      <button
        v-if="server.state !== 'running' && server.state !== 'starting'"
        @click="$emit('start', server.id)"
        class="btn-secondary text-xs px-2.5 py-1.5"
      >
        <Play class="w-3.5 h-3.5 text-green-400" />
        Start
      </button>
      <button
        v-else
        @click="$emit('stop', server.id)"
        class="btn-secondary text-xs px-2.5 py-1.5"
      >
        <Square class="w-3.5 h-3.5 text-red-400" />
        Stop
      </button>
      <button @click="$emit('backup', server.id)" class="btn-ghost text-xs px-2.5 py-1.5">
        <Database class="w-3.5 h-3.5" />
        Backup
      </button>
    </div>
  </RouterLink>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { Server, Layers, Cpu, Globe, Clock, Play, Square, Database } from "lucide-vue-next";
import StatusBadge from "./StatusBadge.vue";
import type { Server as ServerType } from "../stores/servers.js";

defineProps<{ server: ServerType }>();
defineEmits<{ start: [id: string]; stop: [id: string]; backup: [id: string] }>();
</script>
