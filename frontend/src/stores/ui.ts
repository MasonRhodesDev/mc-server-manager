import { defineStore } from "pinia";
import { ref } from "vue";

export const useUIStore = defineStore("ui", () => {
  const sidebarCollapsed = ref(false);
  const loading = ref(false);
  const notifications = ref<{ id: string; type: "success" | "error" | "info"; message: string }[]>([]);

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function notify(type: "success" | "error" | "info", message: string, durationMs = 4000) {
    const id = crypto.randomUUID();
    notifications.value.push({ id, type, message });
    setTimeout(() => {
      notifications.value = notifications.value.filter(n => n.id !== id);
    }, durationMs);
  }

  function dismiss(id: string) {
    notifications.value = notifications.value.filter(n => n.id !== id);
  }

  return { sidebarCollapsed, loading, notifications, toggleSidebar, notify, dismiss };
});
