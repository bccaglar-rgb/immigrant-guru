/**
 * SystemLogger — Centralized log writer for all platform events.
 * Writes to system_logs table for admin Logs dashboard.
 *
 * Auto-populates requestId + userId from AsyncLocalStorage trace context
 * when not explicitly provided in the entry.
 */
import { pool } from "../db/pool.ts";
import { getTrace } from "./context/traceContext.ts";

export interface SystemLogEntry {
  level: "info" | "warn" | "error" | "critical";
  module: string;
  eventType: string;
  message: string;
  serviceSource?: string;
  userId?: string;
  requestId?: string;
  route?: string;
  invoiceId?: string;
  txHash?: string;
  depositAddress?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  stackTrace?: string;
}

export async function writeSystemLog(entry: SystemLogEntry): Promise<void> {
  try {
    // Auto-fill requestId, userId, route from trace context if not explicit
    const ctx = getTrace();
    const requestId = entry.requestId ?? ctx?.requestId ?? null;
    const userId = entry.userId ?? ctx?.userId ?? null;
    const route = entry.route ?? ctx?.route ?? null;

    await pool.query(
      `INSERT INTO system_logs (level, module, event_type, message, service_source, user_id, request_id, route, invoice_id, tx_hash, deposit_address, status, metadata, stack_trace)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        entry.level, entry.module, entry.eventType, entry.message,
        entry.serviceSource ?? "main", userId, requestId,
        route, entry.invoiceId ?? null, entry.txHash ?? null,
        entry.depositAddress ?? null, entry.status ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.stackTrace ?? null,
      ],
    );
  } catch (err: any) {
    console.error("[SystemLogger] Write failed:", err?.message);
  }
}
