import { ref } from "vue";
import { defineStore } from "pinia";

export interface ActiveTask {
  taskId: string;
  kind: "deploy" | "backup" | "restore";
  serverId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progressPct: number;
  currentStep: string | null;
  message: string | null;
  error: string | null;
}

export const useTaskStore = defineStore("tasks", () => {
  const tasks = ref(new Map<string, ActiveTask>());

  function track(taskId: string, kind: ActiveTask["kind"], serverId: string) {
    tasks.value.set(taskId, {
      taskId,
      kind,
      serverId,
      status: "queued",
      progressPct: 0,
      currentStep: null,
      message: null,
      error: null,
    });
  }

  function update(taskId: string, patch: Partial<ActiveTask>) {
    const task = tasks.value.get(taskId);
    if (task) {
      tasks.value.set(taskId, { ...task, ...patch });
    }
  }

  function remove(taskId: string) {
    tasks.value.delete(taskId);
  }

  /** Returns the first active task associated with a server, if any. */
  function forServer(serverId: string): ActiveTask | undefined {
    for (const task of tasks.value.values()) {
      if (task.serverId === serverId) return task;
    }
    return undefined;
  }

  return { tasks, track, update, remove, forServer };
});
