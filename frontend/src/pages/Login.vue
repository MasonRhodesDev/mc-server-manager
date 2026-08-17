<template>
  <div class="min-h-screen bg-coal-950 flex items-center justify-center p-6">
    <div class="w-full max-w-sm">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="w-16 h-16 bg-green-600/20 border border-green-600/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Server class="w-8 h-8 text-green-400" />
        </div>
        <h1 class="text-2xl font-bold text-coal-50">MC Server Manager</h1>
        <p class="text-coal-400 text-sm mt-1">Sign in to manage your servers</p>
      </div>

      <!-- Provider buttons -->
      <div v-if="!loading" class="space-y-3">
        <div v-if="providers.filter(p => p.enabled).length === 0 && !isDev" class="card text-center">
          <p class="text-coal-400 text-sm">No auth providers configured.</p>
          <p class="text-coal-500 text-xs mt-1">Contact your administrator to set up login.</p>
        </div>

        <button
          v-for="p in providers.filter(p => p.enabled)"
          :key="p.provider"
          @click="login(p.provider)"
          class="w-full btn-secondary justify-center gap-3 py-3"
          :disabled="loggingIn === p.provider"
        >
          <ProviderIcon :provider="p.provider" class="w-5 h-5" />
          <span>Continue with {{ providerNames[p.provider] }}</span>
        </button>

        <!-- Dev-only login bypass -->
        <div v-if="isDev" class="pt-2 border-t border-coal-800 space-y-2">
          <p class="text-coal-500 text-xs text-center">Development mode</p>
          <button
            @click="devLogin"
            :disabled="loggingIn === 'dev'"
            class="w-full btn-ghost justify-center gap-2 py-2.5 border border-dashed border-coal-700"
          >
            <Loader2 v-if="loggingIn === 'dev'" class="w-4 h-4 animate-spin" />
            <span>Quick dev login</span>
          </button>
        </div>
      </div>

      <div v-else class="flex justify-center py-8">
        <Loader2 class="w-6 h-6 text-coal-400 animate-spin" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Server, Loader2 } from "lucide-vue-next";
import { auth as authApi } from "../api/endpoints.js";
import { useAuthStore } from "../stores/auth.js";
import ProviderIcon from "../components/ProviderIcon.vue";

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const loggingIn = ref<string | null>(null);
const providers = ref<{ provider: string; enabled: boolean }[]>([]);
const isDev = import.meta.env.DEV;

const providerNames: Record<string, string> = {
  microsoft: "Microsoft",
};

onMounted(async () => {
  try {
    const data = await authApi.providers();
    providers.value = data.providers;
  } finally {
    loading.value = false;
  }
});

async function login(provider: string) {
  loggingIn.value = provider;
  try {
    const data = await authApi.login(provider);
    window.location.href = data.redirect_uri;
  } catch {
    loggingIn.value = null;
  }
}

async function devLogin() {
  loggingIn.value = "dev";
  try {
    const data = await authApi.devLogin("devuser");
    authStore.setAuth(data.token, data.user);
    router.push("/");
  } finally {
    loggingIn.value = null;
  }
}
</script>
