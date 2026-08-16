/**
 * Task lifecycle service + in-memory pub/sub for SSE delivery.
 *
 * Every long-running operation (deploy, backup, restore) creates a task record,
 * emits named step events, and streams them to connected SSE clients.
 *
 * The DB is the source of truth — in-memory pub/sub is for live delivery only.
 * Missed events are replayed from task_events on reconnect via Last-Event-ID.
 */

import { db } from "../db/index.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskEventData {
  step?: string;
  progressPct?: number;
  message?: string;
  payload?: unknown;
  error?: string;
}

export type TaskEmitter = (type: string, data: TaskEventData) => Promise<void>;

// ── In-memory pub/sub ─────────────────────────────────────────────────────────

const subscribers = new Map<string, Set<(raw: string) => void>>();

export function subscribeToTask(taskId: string, fn: (raw: string) => void): () => void {
  if (!subscribers.has(taskId)) subscribers.set(taskId, new Set());
  subscribers.get(taskId)!.add(fn);
  return () => {
    const set = subscribers.get(taskId);
    if (set) {
      set.delete(fn);
      if (set.size === 0) subscribers.delete(taskId);
    }
  };
}

export function publishToTask(taskId: string, raw: string): void {
  subscribers.get(taskId)?.forEach(fn => fn(raw));
}

// ── SSE wire format ───────────────────────────────────────────────────────────

export function formatSSEEvent(id: number, eventType: string, data: object): string {
  return `id: ${id}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ── Task lifecycle ────────────────────────────────────────────────────────────

export async function createTask(
  kind: 'deploy' | 'backup' | 'restore',
  serverId: string,
): Promise<{ taskId: string; emit: TaskEmitter }> {
  const taskId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await db.insertInto("tasks").values({
    id: taskId,
    kind,
    server_id: serverId,
    status: "queued",
    current_step: null,
    progress_pct: 0,
    message: null,
    error: null,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
  }).execute();

  const emit: TaskEmitter = async (type: string, data: TaskEventData) => {
    // 1. Persist to DB
    const result = await db.insertInto("task_events").values({
      task_id: taskId,
      event_type: type,
      payload: JSON.stringify(data),
      created_at: new Date().toISOString(),
    } as any).returning("id").executeTakeFirst();

    const eventId = result?.id ?? 0;

    // 2. Update task snapshot columns
    const updates: Record<string, unknown> = {};
    if (data.step !== undefined)        updates.current_step = data.step;
    if (data.progressPct !== undefined) updates.progress_pct = data.progressPct;
    if (data.message !== undefined)     updates.message = data.message;
    if (Object.keys(updates).length > 0) {
      await db.updateTable("tasks").set(updates as any).where("id", "=", taskId).execute();
    }

    // 3. Push to live SSE subscribers
    const wire = formatSSEEvent(eventId, type, {
      taskId,
      ...data,
      timestamp: new Date().toISOString(),
    });
    publishToTask(taskId, wire);
  };

  return { taskId, emit };
}

export async function startTask(taskId: string): Promise<void> {
  await db.updateTable("tasks")
    .set({ status: "running", started_at: new Date().toISOString() })
    .where("id", "=", taskId)
    .execute();
}

export async function completeTask(taskId: string, resultPayload?: unknown): Promise<void> {
  const now = new Date().toISOString();
  await db.updateTable("tasks")
    .set({ status: "succeeded", progress_pct: 100, finished_at: now })
    .where("id", "=", taskId)
    .execute();

  // Emit terminal event to flush subscribers
  const result = await db.insertInto("task_events").values({
    task_id: taskId,
    event_type: "task.succeeded",
    payload: JSON.stringify({ payload: resultPayload ?? null }),
    created_at: now,
  } as any).returning("id").executeTakeFirst();

  const wire = formatSSEEvent(result?.id ?? 0, "task.succeeded", {
    taskId,
    progressPct: 100,
    result: resultPayload ?? null,
    timestamp: now,
  });
  publishToTask(taskId, wire);
}

export async function failTask(taskId: string, error: string): Promise<void> {
  const now = new Date().toISOString();
  await db.updateTable("tasks")
    .set({ status: "failed", error, finished_at: now })
    .where("id", "=", taskId)
    .execute();

  const result = await db.insertInto("task_events").values({
    task_id: taskId,
    event_type: "task.failed",
    payload: JSON.stringify({ error }),
    created_at: now,
  } as any).returning("id").executeTakeFirst();

  const wire = formatSSEEvent(result?.id ?? 0, "task.failed", {
    taskId,
    error,
    timestamp: now,
  });
  publishToTask(taskId, wire);
}
