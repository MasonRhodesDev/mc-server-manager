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

  audit: (action: string, ctx?: LogContext) => write("audit", action, ctx),
};
