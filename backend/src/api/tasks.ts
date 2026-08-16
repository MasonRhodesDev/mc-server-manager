/**
 * Task API
 *
 * GET /api/tasks/:taskId          — current task snapshot (Bearer token auth)
 * GET /api/tasks/:taskId/events   — SSE stream (?token= query param auth)
 *
 * Two separate Elysia instances so each can use the appropriate auth plugin.
 */

import Elysia, { t } from "elysia";
import { db } from "../db/index.js";
import { requireAuth, requireAuthSSE } from "../middleware/auth.js";
import { subscribeToTask, formatSSEEvent } from "../services/tasks.js";

const TERMINAL_EVENTS = new Set(["task.succeeded", "task.failed", "task.cancelled"]);

// ── GET /api/tasks/:taskId ────────────────────────────────────────────────────

export const taskSnapshotRoutes = new Elysia({ prefix: "/api/tasks" })
  .use(requireAuth)
  .get("/:taskId", async ({ params, set }) => {
    const task = await db
      .selectFrom("tasks")
      .selectAll()
      .where("id", "=", params.taskId)
      .executeTakeFirst();

    if (!task) { set.status = 404; return { error: "Task not found" }; }
    return { task };
  });

// ── GET /api/tasks/:taskId/events ─────────────────────────────────────────────

export const taskStreamRoutes = new Elysia({ prefix: "/api/tasks" })
  .use(requireAuthSSE)
  .get("/:taskId/events", async ({ params, request, query }) => {
    const task = await db
      .selectFrom("tasks")
      .selectAll()
      .where("id", "=", params.taskId)
      .executeTakeFirst();

    if (!task) {
      return new Response(JSON.stringify({ error: "Task not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Last-Event-ID: prefer header, fall back to query param for initial connect
    const lastEventIdHeader = request.headers.get("last-event-id");
    const lastEventId = Number(
      lastEventIdHeader ?? (query as Record<string, string | undefined>).lastEventId ?? "0"
    );

    const enc = new TextEncoder();
    const taskId = params.taskId;
    const isTerminal = (s: string) => TERMINAL_EVENTS.has(s);

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (raw: string) => {
          try { controller.enqueue(enc.encode(raw)); } catch { /* closed */ }
        };

        // ── Replay missed events ─────────────────────────────────────────────
        const missed = await db
          .selectFrom("task_events")
          .selectAll()
          .where("task_id", "=", taskId)
          .where("id", ">", lastEventId)
          .orderBy("id", "asc")
          .execute();

        for (const evt of missed) {
          let parsed: object = {};
          try { parsed = JSON.parse(evt.payload); } catch { /* empty payload */ }
          enqueue(formatSSEEvent(evt.id, evt.event_type, {
            taskId,
            ...parsed,
            timestamp: evt.created_at,
          }));
        }

        // ── Close immediately if task is already terminal ────────────────────
        const lastReplayed = missed.at(-1);
        const taskAlreadyDone = (
          task.status === "succeeded" ||
          task.status === "failed" ||
          task.status === "cancelled"
        );
        const terminalReplayed = lastReplayed && isTerminal(lastReplayed.event_type);

        if (taskAlreadyDone || terminalReplayed) {
          controller.close();
          return;
        }

        // ── Live subscription ────────────────────────────────────────────────
        let closed = false;

        const unsub = subscribeToTask(taskId, (raw: string) => {
          if (closed) return;
          enqueue(raw);
          if (isTerminal(extractEventType(raw))) {
            setTimeout(() => {
              if (!closed) { closed = true; controller.close(); }
            }, 50);
          }
        });

        // ── Heartbeat ────────────────────────────────────────────────────────
        const heartbeat = setInterval(() => {
          if (closed) { clearInterval(heartbeat); return; }
          enqueue(": heartbeat\n\n");
        }, 15_000);

        // ── Cleanup (called when client disconnects / reader released) ───────
        return () => {
          closed = true;
          clearInterval(heartbeat);
          unsub();
        };
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }, {
    query: t.Object({
      token: t.Optional(t.String()),
      lastEventId: t.Optional(t.String()),
    }),
  });

// ── Helper ────────────────────────────────────────────────────────────────────

function extractEventType(raw: string): string {
  const match = raw.match(/^event: (.+)$/m);
  return match?.[1]?.trim() ?? "";
}
