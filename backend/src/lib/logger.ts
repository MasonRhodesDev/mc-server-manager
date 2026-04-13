/**
 * Structured JSON logger.
 * Every log line is a JSON object — easy to grep, pipe to jq, or ingest into a log aggregator.
 *
 * Levels:
 *   debug  — verbose dev noise
 *   info   — normal operational events (HTTP requests, Docker calls)
 *   warn   — unexpected but non-fatal (Docker container not found, etc.)
 *   error  — something failed that shouldn't have
 *   audit  — user-initiated actions that change state (create/delete/start/stop/backup/restore/login)
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "audit";

export interface LogContext {
  [key: string]: unknown;
}

function write(level: LogLevel, msg: string, ctx?: LogContext) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  };
  if (level === "error" || level === "warn") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => write("debug", msg, ctx),
  info:  (msg: string, ctx?: LogContext) => write("info",  msg, ctx),
  warn:  (msg: string, ctx?: LogContext) => write("warn",  msg, ctx),
  error: (msg: string, ctx?: LogContext) => write("error", msg, ctx),

  /**
   * Audit log — user-initiated state-changing actions.
   * Always include: action, userId, username (when available).
   */
  audit: (action: string, ctx?: LogContext) => write("audit", action, ctx),
};
