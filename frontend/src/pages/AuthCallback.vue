<template>
  <div class="min-h-screen bg-coal-950 flex items-center justify-center">
    <div class="text-center">
      <Loader2 class="w-8 h-8 text-green-400 animate-spin mx-auto mb-3" />
      <p class="text-coal-400 text-sm">{{ statusMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { Loader2 } from "lucide-vue-next";
import { api } from "../api/client.js";
import { useAuthStore } from "../stores/auth.js";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const statusMessage = ref("Completing sign-in...");

onMounted(async () => {
  const code = route.query.code as string;
  const state = route.query.state as string;

  if (!code || !state) {
    statusMessage.value = "Invalid callback. Redirecting...";
    setTimeout(() => router.push("/login"), 1500);
    return;
  }

  try {
    const res = await api.get(`/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
    auth.setToken(res.data.token);
    auth.fetchMe();
    const redirect = (route.query.redirect as string) ?? "/servers";
    router.push(redirect);
  } catch {
    statusMessage.value = "Sign-in failed. Redirecting...";
    setTimeout(() => router.push("/login"), 1500);
  }
});
</script>
