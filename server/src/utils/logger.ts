/**
 * Structured JSON logger — zero dependencies.
 * Outputs one JSON object per log line for easy parsing by log aggregators.
 *
 * Usage:
 *   import { createLogger } from "../utils/logger.ts";
 *   const log = createLogger("payments");
 *   log.info("invoice_created", { invoiceId, userId });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

function formatLog(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
  };
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      if (v instanceof Error) {
        entry[k] = { message: v.message, stack: v.stack, name: v.name };
      } else {
        entry[k] = v;
      }
    }
  }
  return JSON.stringify(entry);
}

class Logger {
  private module: string;
  constructor(module: string) {
    this.module = module;
  }

  debug(msg: string, data?: Record<string, unknown>) {
    if (shouldLog("debug")) console.log(formatLog("debug", this.module, msg, data));
  }

  info(msg: string, data?: Record<string, unknown>) {
    if (shouldLog("info")) console.log(formatLog("info", this.module, msg, data));
  }

  warn(msg: string, data?: Record<string, unknown>) {
    if (shouldLog("warn")) console.warn(formatLog("warn", this.module, msg, data));
  }

  error(msg: string, data?: Record<string, unknown>) {
    if (shouldLog("error")) console.error(formatLog("error", this.module, msg, data));
  }

  child(subModule: string): Logger {
    return new Logger(`${this.module}:${subModule}`);
  }
}

export function createLogger(module: string): Logger {
  return new Logger(module);
}
