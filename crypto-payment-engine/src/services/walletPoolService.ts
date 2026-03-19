/**
 * WalletPoolService — Manages pre-generated TRON deposit addresses for the engine.
 */
import { pool } from "../db/pool.ts";

export interface WalletAddress {
  walletIndex: number;
  address: string;
  status: string;
  assignedInvoiceId: string | null;
  assignedUserId: string | null;
}

export class WalletPoolService {
  async assignAddress(invoiceId: string, userId: string): Promise<WalletAddress | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `UPDATE engine_wallet_addresses
         SET status = 'assigned', assigned_invoice_id = $1, assigned_user_id = $2, updated_at = NOW()
         WHERE wallet_index = (
           SELECT wallet_index FROM engine_wallet_addresses
           WHERE status = 'available' ORDER BY wallet_index ASC LIMIT 1 FOR UPDATE SKIP LOCKED
         )
         RETURNING wallet_index, address, status, assigned_invoice_id, assigned_user_id`,
        [invoiceId, userId],
      );
      await client.query("COMMIT");
      if (!rows[0]) return null;
      return {
        walletIndex: Number(rows[0].wallet_index),
        address: String(rows[0].address),
        status: "assigned",
        assignedInvoiceId: invoiceId,
        assignedUserId: userId,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async markPaid(address: string): Promise<void> {
    await pool.query(`UPDATE engine_wallet_addresses SET status = 'paid', updated_at = NOW() WHERE address = $1`, [address]);
  }

  async markSwept(address: string, txHash: string): Promise<void> {
    await pool.query(`UPDATE engine_wallet_addresses SET status = 'swept', sweep_tx_hash = $1, swept_at = NOW(), updated_at = NOW() WHERE address = $2`, [txHash, address]);
  }

  async markExpired(address: string): Promise<void> {
    await pool.query(`UPDATE engine_wallet_addresses SET status = 'expired_unused', updated_at = NOW() WHERE address = $1 AND status = 'assigned'`, [address]);
  }

  async releaseAddress(invoiceId: string): Promise<void> {
    await pool.query(
      `UPDATE engine_wallet_addresses SET status = 'available', assigned_invoice_id = NULL, assigned_user_id = NULL, updated_at = NOW() WHERE assigned_invoice_id = $1 AND status = 'assigned'`,
      [invoiceId],
    );
  }

  async getPoolStatus(): Promise<Record<string, number>> {
    const { rows } = await pool.query(`SELECT status, COUNT(*)::int AS cnt FROM engine_wallet_addresses GROUP BY status ORDER BY status`);
    const result: Record<string, number> = {};
    for (const r of rows) result[String(r.status)] = Number(r.cnt);
    return result;
  }
}
