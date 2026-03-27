/**
 * TradeTracer — Full lifecycle tracing for every trade intent.
 *
 * Every intent gets a trace ID. Each stage of the pipeline logs a trace event:
 * INGEST → RISK → POLICY → NORMALIZE → EXECUTE → RECONCILE
 *
 * Stored in trade_trace_events (TimescaleDB hypertable) for analytics.
 * Auto-injects requestId from AsyncLocalStorage trace context into event data.
 */
import { randomUUID } from "node:crypto";
import { pool } from "../../db/pool.ts";
import { getTrace } from "../context/traceContext.ts";

export interface TraceEvent {
  traceId: string;
  intentId: string;
  stage: string;
  data: Record<string, unknown>;
  durationMs?: number;
  createdAt: string;
}

export class TradeTracer {
  static generateTraceId(): string {
    return `trc-${randomUUID().slice(0, 12)}`;
  }

  async trace(event: {
    traceId: string;
    intentId: string;
    stage: string;
    data: Record<string, unknown>;
    durationMs?: number;
  }): Promise<void> {
    try {
      // Inject requestId from trace context into event data for correlation
      const ctx = getTrace();
      const enrichedData = ctx?.requestId
        ? { ...event.data, requestId: ctx.requestId }
        : event.data;

      await pool.query(
        `INSERT INTO trade_trace_events (trace_id, intent_id, stage, data, duration_ms, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [event.traceId, event.intentId, event.stage,
         JSON.stringify(enrichedData), event.durationMs ?? null],
      );
    } catch (err: any) {
      // Tracing should never break the main flow
      console.error("[TradeTracer] Write failed:", err?.message);
    }
  }

  async getTrace(intentId: string): Promise<TraceEvent[]> {
    try {
      const { rows } = await pool.query(
        `SELECT trace_id, intent_id, stage, data, duration_ms, created_at
         FROM trade_trace_events
         WHERE intent_id = $1
         ORDER BY created_at ASC`,
        [intentId],
      );
      return rows.map((r) => ({
        traceId: String(r.trace_id),
        intentId: String(r.intent_id),
        stage: String(r.stage),
        data: (r.data ?? {}) as Record<string, unknown>,
        durationMs: r.duration_ms != null ? Number(r.duration_ms) : undefined,
        createdAt: String(r.created_at),
      }));
    } catch {
      return [];
    }
  }
}
