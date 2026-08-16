/**
 * Thin EventSource wrapper for task progress SSE streams.
 *
 * EventSource cannot set custom headers, so auth is passed as ?token= query param.
 * The returned function closes the connection when called.
 */

export interface TaskEventPayload {
  taskId: string;
  step?: string;
  progressPct?: number;
  message?: string;
  error?: string;
  result?: unknown;
  payload?: unknown;
  timestamp: string;
}

export interface TaskStreamHandlers {
  onSnapshot?:    (p: TaskEventPayload) => void;
  onStarted?:     (p: TaskEventPayload) => void;
  onStepStarted?: (p: TaskEventPayload) => void;
  onStepDone?:    (p: TaskEventPayload) => void;
  onProgress?:    (p: TaskEventPayload) => void;
  onSucceeded?:   (p: TaskEventPayload) => void;
  onFailed?:      (p: TaskEventPayload) => void;
  onCancelled?:   (p: TaskEventPayload) => void;
  onError?:       (e: Event) => void;
}

export function connectTaskStream(
  taskId: string,
  handlers: TaskStreamHandlers,
  lastEventId = 0,
): () => void {
  const token = localStorage.getItem("mc_token") ?? "";
  const params = new URLSearchParams({
    token,
    lastEventId: String(lastEventId),
  });
  const url = `/api/tasks/${taskId}/events?${params}`;
  const es = new EventSource(url);

  const parse = (e: MessageEvent): TaskEventPayload => JSON.parse(e.data);

  es.addEventListener("task.snapshot",  e => handlers.onSnapshot?.(parse(e as MessageEvent)));
  es.addEventListener("task.started",   e => handlers.onStarted?.(parse(e as MessageEvent)));
  es.addEventListener("step.started",   e => handlers.onStepStarted?.(parse(e as MessageEvent)));
  es.addEventListener("step.completed", e => handlers.onStepDone?.(parse(e as MessageEvent)));
  es.addEventListener("step.progress",  e => handlers.onProgress?.(parse(e as MessageEvent)));

  es.addEventListener("task.succeeded", e => {
    handlers.onSucceeded?.(parse(e as MessageEvent));
    es.close();
  });
  es.addEventListener("task.failed", e => {
    handlers.onFailed?.(parse(e as MessageEvent));
    es.close();
  });
  es.addEventListener("task.cancelled", e => {
    handlers.onCancelled?.(parse(e as MessageEvent));
    es.close();
  });

  if (handlers.onError) {
    es.onerror = handlers.onError;
  }

  return () => es.close();
}
