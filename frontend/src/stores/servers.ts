import { defineStore } from "pinia";
import { ref } from "vue";
import { servers as serversApi } from "../api/endpoints.js";

export interface Server {
  id: string;
  name: string;
  serverType: string;
  modpackId: number | null;
  modpackVersionId: number | null;
  memoryGb: number;
  autoScaleDownAfter: string;
  serverHostname: string;
  serverPort: number;
  state: "running" | "stopped" | "starting" | "created";
  createdAt: string;
}

export const useServersStore = defineStore("servers", () => {
  const servers = ref<Server[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchAll() {
    loading.value = true;
    error.value = null;
    try {
      const data = await serversApi.list();
      servers.value = data.servers;
    } catch (e: any) {
      error.value = e.message ?? "Failed to load servers";
    } finally {
      loading.value = false;
    }
  }

  async function refreshStatus() {
    for (const server of servers.value) {
      try {
        const data = await serversApi.status(server.id);
        const gameStatus = data.containers.game as string;
        server.state = (["running", "stopped", "starting", "created"].includes(gameStatus)
          ? gameStatus
          : "stopped") as Server["state"];
      } catch {
        // ignore individual failures
      }
    }
  }

  return { servers, loading, error, fetchAll, refreshStatus };
});
