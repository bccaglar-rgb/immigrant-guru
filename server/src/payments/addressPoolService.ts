/**
 * AddressPoolService — Manages pre-generated TRON deposit addresses.
 *
 * - Pre-generates addresses into wallet_addresses table
 * - Assigns available address to invoice on checkout
 * - Tracks address lifecycle: available → assigned → paid → swept
 */
import { pool } from "../db/pool.ts";
import { generateTronAddress, encryptPrivateKey } from "./tronAddressGenerator.ts";

export interface WalletAddress {
  walletIndex: number;
  address: string;
  status: string;
  assignedInvoiceId: string | null;
  assignedUserId: string | null;
}

export class AddressPoolService {
  private readonly encryptionKey: Buffer;

  constructor(encryptionKey: Buffer) {
    this.encryptionKey = encryptionKey;
  }

  /** Get count of available (unassigned) addresses in pool. */
  async getAvailableCount(): Promise<number> {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM wallet_addresses WHERE status = 'available'`,
    );
    return rows[0]?.cnt ?? 0;
  }

  /** Get total pool size. */
  async getTotalCount(): Promise<number> {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM wallet_addresses`,
    );
    return rows[0]?.cnt ?? 0;
  }

  /**
   * Pre-generate addresses into the pool.
   * Each address's private key is encrypted with AES-256-GCM.
   */
  async generatePool(count: number): Promise<{ generated: number; errors: number }> {
    let generated = 0;
    let errors = 0;

    for (let i = 0; i < count; i++) {
      try {
        const wallet = generateTronAddress();
        const privateKeyEnc = encryptPrivateKey(wallet.privateKeyHex, this.encryptionKey);

        await pool.query(
          `INSERT INTO wallet_addresses (address, private_key_enc, status, created_at, updated_at)
           VALUES ($1, $2, 'available', NOW(), NOW())
           ON CONFLICT (address) DO NOTHING`,
          [wallet.address, privateKeyEnc],
        );
        generated++;

        // Log progress every 100
        if (generated % 100 === 0) {
          console.log(`[AddressPool] Generated ${generated}/${count} addresses`);
        }
      } catch (err: any) {
        errors++;
        console.error(`[AddressPool] Generation error:`, err?.message);
      }
    }

    console.log(`[AddressPool] Pool generation complete: ${generated} generated, ${errors} errors`);
    return { generated, errors };
  }

  /**
   * Assign an available address to an invoice.
   * Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent race conditions.
   */
  async assignAddress(invoiceId: string, userId: string): Promise<WalletAddress | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Atomically grab one available address
      const { rows } = await client.query(
        `UPDATE wallet_addresses
         SET status = 'assigned',
             assigned_invoice_id = $1,
             assigned_user_id = $2,
             updated_at = NOW()
         WHERE wallet_index = (
           SELECT wallet_index FROM wallet_addresses
           WHERE status = 'available'
           ORDER BY wallet_index ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING wallet_index, address, status, assigned_invoice_id, assigned_user_id`,
        [invoiceId, userId],
      );

      await client.query("COMMIT");

      if (!rows[0]) {
        console.error(`[AddressPool] CRITICAL: No available addresses! Pool exhausted. Generate more addresses immediately.`);
        return null;
      }

      // Pool low warning — check remaining addresses
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM wallet_addresses WHERE status = 'available'`,
      );
      const remaining = countRows[0]?.cnt ?? 0;
      if (remaining < 100) {
        console.error(`[AddressPool] WARNING: Only ${remaining} addresses remaining! Replenish pool urgently.`);
      } else if (remaining < 500) {
        console.warn(`[AddressPool] Pool getting low: ${remaining} addresses available. Consider replenishing.`);
      }

      const r = rows[0];
      return {
        walletIndex: Number(r.wallet_index),
        address: String(r.address),
        status: String(r.status),
        assignedInvoiceId: r.assigned_invoice_id ? String(r.assigned_invoice_id) : null,
        assignedUserId: r.assigned_user_id ? String(r.assigned_user_id) : null,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /** Mark address as paid (payment confirmed). */
  async markPaid(address: string): Promise<void> {
    await pool.query(
      `UPDATE wallet_addresses SET status = 'paid', updated_at = NOW() WHERE address = $1`,
      [address],
    );
  }

  /** Mark address as swept (funds moved to hot wallet). */
  async markSwept(address: string, sweepTxHash: string): Promise<void> {
    await pool.query(
      `UPDATE wallet_addresses SET status = 'swept', sweep_tx_hash = $1, swept_at = NOW(), updated_at = NOW() WHERE address = $2`,
      [sweepTxHash, address],
    );
  }

  /** Mark address as expired_unused — NOT released back to pool. */
  async markExpired(address: string): Promise<void> {
    await pool.query(
      `UPDATE wallet_addresses SET status = 'expired_unused', updated_at = NOW() WHERE address = $1 AND status = 'assigned'`,
      [address],
    );
  }

  /** Release an address back to pool — ADMIN USE ONLY after manual verification. */
  async releaseAddress(invoiceId: string): Promise<void> {
    await pool.query(
      `UPDATE wallet_addresses
       SET status = 'available', assigned_invoice_id = NULL, assigned_user_id = NULL, updated_at = NOW()
       WHERE assigned_invoice_id = $1 AND status = 'assigned'`,
      [invoiceId],
    );
  }

  /** Get address info by invoice ID. */
  async getByInvoice(invoiceId: string): Promise<WalletAddress | null> {
    const { rows } = await pool.query(
      `SELECT wallet_index, address, status, assigned_invoice_id, assigned_user_id
       FROM wallet_addresses WHERE assigned_invoice_id = $1`,
      [invoiceId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      walletIndex: Number(r.wallet_index),
      address: String(r.address),
      status: String(r.status),
      assignedInvoiceId: r.assigned_invoice_id ? String(r.assigned_invoice_id) : null,
      assignedUserId: r.assigned_user_id ? String(r.assigned_user_id) : null,
    };
  }

  /** Get pool status summary. */
  async getPoolStatus(): Promise<Record<string, number>> {
    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int AS cnt FROM wallet_addresses GROUP BY status ORDER BY status`,
    );
    const result: Record<string, number> = {};
    for (const r of rows) result[String(r.status)] = Number(r.cnt);
    return result;
  }
}
