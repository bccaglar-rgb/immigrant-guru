/**
 * CredentialAuditLogger — Logs every credential access for security auditing.
 *
 * Every time credentials are decrypted (for order execution, reconciliation,
 * permission validation, etc.), an entry is written to credential_access_log.
 */
import { pool } from "../../db/pool.ts";

export interface CredentialAuditEntry {
  userId: string;
  exchangeAccountId: string;
  action: "DECRYPT" | "ROTATE" | "VALIDATE" | "REVOKE";
  reason: string;
  ip?: string;
  success: boolean;
}

export class CredentialAuditLogger {
  async logAccess(entry: CredentialAuditEntry): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO credential_access_log
           (user_id, exchange_account_id, action, reason, ip, success, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          entry.userId,
          entry.exchangeAccountId,
          entry.action,
          entry.reason,
          entry.ip ?? null,
          entry.success,
        ],
      );
    } catch (err: any) {
      // Audit logging should never break the main flow
      console.error("[CredentialAudit] Write failed:", err?.message);
    }
  }

  async getAccessLog(userId: string, limit = 50): Promise<CredentialAuditEntry[]> {
    try {
      const { rows } = await pool.query(
        `SELECT user_id, exchange_account_id, action, reason, ip, success, created_at
         FROM credential_access_log
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit],
      );
      return rows.map((r) => ({
        userId: String(r.user_id),
        exchangeAccountId: String(r.exchange_account_id),
        action: String(r.action) as CredentialAuditEntry["action"],
        reason: String(r.reason),
        ip: r.ip ? String(r.ip) : undefined,
        success: Boolean(r.success),
      }));
    } catch {
      return [];
    }
  }
}
