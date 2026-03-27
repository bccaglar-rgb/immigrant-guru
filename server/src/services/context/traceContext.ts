/**
 * TraceContext — AsyncLocalStorage-based request context propagation.
 *
 * Provides a request-scoped context that flows through all async operations
 * within an HTTP request lifecycle. Auto-populated by requestId middleware.
 *
 * Usage:
 *   import { getTrace, withTrace } from "./context/traceContext.ts";
 *
 *   // In middleware: sets context for entire request
 *   withTrace({ requestId: "req-abc123", userId: "u-1" }, () => handler(req, res));
 *
 *   // Anywhere in async call chain: reads context
 *   const ctx = getTrace();
 *   console.log(ctx?.requestId); // "req-abc123"
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface TraceContextData {
  /** Unique request ID — set from X-Request-ID header or auto-generated */
  requestId: string;
  /** User ID from auth middleware (set after auth resolves) */
  userId?: string;
  /** Trade intent ID (set when processing a trade) */
  intentId?: string;
  /** Trade trace ID (set when TradeTracer generates one) */
  traceId?: string;
  /** Bot/trader ID (set when processing a bot decision) */
  botId?: string;
  /** Exchange name (set when interacting with exchange) */
  exchange?: string;
  /** Trading symbol (set during trade/bot processing) */
  symbol?: string;
  /** HTTP route path (e.g. /api/trade/place) */
  route?: string;
  /** HTTP method */
  method?: string;
  /** Request start time (epoch ms) */
  startMs?: number;
}

const store = new AsyncLocalStorage<TraceContextData>();

/**
 * Run a function within a trace context.
 * All async operations inside `fn` will inherit this context.
 */
export function withTrace<T>(ctx: TraceContextData, fn: () => T): T {
  return store.run(ctx, fn);
}

/**
 * Get the current trace context (or undefined if outside a traced scope).
 * Safe to call anywhere — returns undefined for background timers, cron, etc.
 */
export function getTrace(): TraceContextData | undefined {
  return store.getStore();
}

/**
 * Merge additional data into the current trace context.
 * No-op if called outside a traced scope.
 *
 * Example: After auth resolves, enrich with userId:
 *   enrichTrace({ userId: req.userId });
 *
 * Example: When starting a trade:
 *   enrichTrace({ intentId: "int-abc", symbol: "BTCUSDT" });
 */
export function enrichTrace(patch: Partial<TraceContextData>): void {
  const ctx = store.getStore();
  if (ctx) Object.assign(ctx, patch);
}

/**
 * Get requestId from current context, or a fallback value.
 * Convenience for logging — never throws.
 */
export function getRequestId(fallback = "no-ctx"): string {
  return store.getStore()?.requestId ?? fallback;
}
