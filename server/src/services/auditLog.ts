import { pool } from "../db/pool.ts";

export interface AuditEntry {
  userId: string;
  exchange: string;
  symbol?: string;
  action: string;
  payload: unknown;
  response?: unknown;
  ip?: string;
  device?: string;
  createdAt: string;
}

export class AuditLogService {
  async write(entry: AuditEntry): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO audit_events (user_id, action, exchange, symbol, payload, response, ip, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          entry.userId,
          entry.action,
          entry.exchange ?? null,
          entry.symbol ?? null,
          JSON.stringify(entry.payload ?? null),
          entry.response ? JSON.stringify(entry.response) : null,
          entry.ip ?? null,
          entry.createdAt,
        ],
      );
    } catch (err: any) {
      // Audit write should never break the main flow — log and move on
      console.error("[AuditLog] Write failed:", err?.message ?? err);
    }
  }
}
