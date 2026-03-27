/**
 * Request ID Middleware — Generates/propagates X-Request-ID header
 * and wraps the entire request lifecycle in AsyncLocalStorage trace context.
 *
 * Must be registered BEFORE all other middleware (first app.use()).
 *
 * Flow:
 *   1. Extract X-Request-ID from incoming header (or generate one)
 *   2. Set response header X-Request-ID (for client correlation)
 *   3. Create AsyncLocalStorage context with requestId + route + method
 *   4. Wrap remaining middleware/handler chain inside withTrace()
 *
 * The trace context is then available everywhere via getTrace().
 */
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { withTrace, enrichTrace } from "../services/context/traceContext.ts";

/**
 * Generate a short request ID: "req-" + 12 hex chars
 * Compact but unique enough for millions of requests/day.
 */
function generateRequestId(): string {
  return `req-${randomUUID().slice(0, 12)}`;
}

/**
 * Express middleware that wraps the entire request in a trace context.
 * Register as: app.use(requestIdMiddleware);
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string) || generateRequestId();

  // Echo back to client for correlation
  res.setHeader("x-request-id", requestId);

  // Wrap the remaining middleware/handler chain in trace context
  withTrace(
    {
      requestId,
      route: req.path,
      method: req.method,
      startMs: Date.now(),
    },
    () => {
      next();
    },
  );
}

/**
 * Optional: Call after auth middleware resolves to enrich trace with userId.
 * Already handled automatically if authMiddleware calls enrichTrace().
 * Can be used standalone for routes that extract userId differently.
 */
export function enrichRequestWithUser(req: Request): void {
  if (req.userId) {
    enrichTrace({ userId: req.userId });
  }
}
