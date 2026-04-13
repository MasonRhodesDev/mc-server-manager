<template>
  <div class="flex h-screen overflow-hidden bg-coal-950">
    <!-- Sidebar -->
    <Sidebar />

    <!-- Main content area -->
    <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
      <!-- Pinned header -->
      <Header />

      <!-- Page content -->
      <main class="flex-1 overflow-y-auto p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
import Sidebar from "../components/Sidebar.vue";
import Header from "../components/Header.vue";
</script>
