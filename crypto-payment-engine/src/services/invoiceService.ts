/**
 * InvoiceService — Core invoice management for payment engine.
 */
import { randomBytes } from "node:crypto";
import { pool } from "../db/pool.ts";
import { ENGINE_CONFIG } from "../config.ts";
import type { WalletPoolService } from "./walletPoolService.ts";

const makeId = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;
const nowIso = () => new Date().toISOString();

export interface Invoice {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  expectedAmountUsdt: number;
  paidAmountUsdt: number;
  depositAddress: string;
  walletIndex: number;
  status: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  paymentTxHash?: string;
  referenceId?: string;
}

export class InvoiceService {
  private readonly walletPool: WalletPoolService;

  constructor(walletPool: WalletPoolService) {
    this.walletPool = walletPool;
  }

  async createInvoice(input: {
    userId: string;
    planId: string;
    planName: string;
    priceUsdt: number;
    durationDays: number;
    expiresInMinutes?: number;
    referenceId?: string;
  }): Promise<Invoice> {
    // Check for existing pending invoice (prevent duplicates)
    const { rows: existing } = await pool.query(
      `SELECT * FROM engine_invoices WHERE user_id = $1 AND plan_id = $2 AND status IN ('awaiting_payment','created') AND expires_at > NOW() LIMIT 1`,
      [input.userId, input.planId],
    );
    if (existing[0]) {
      return this.rowToInvoice(existing[0]);
    }

    // Assign unique deposit address from pool
    const wallet = await this.walletPool.assignAddress(makeId("inv"), input.userId);
    if (!wallet) throw new Error("address_pool_exhausted");

    const id = wallet.assignedInvoiceId!;
    const expiresAt = new Date(Date.now() + (input.expiresInMinutes ?? 30) * 60_000).toISOString();

    await pool.query(
      `INSERT INTO engine_invoices
         (id, user_id, plan_id, plan_name, expected_amount_usdt, paid_amount_usdt,
          deposit_address, wallet_index, status, expires_at, reference_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,0,$6,$7,'awaiting_payment',$8,$9,NOW(),NOW())`,
      [id, input.userId, input.planId, input.planName, input.priceUsdt,
       wallet.address, wallet.walletIndex, expiresAt, input.referenceId ?? null],
    );

    return {
      id,
      userId: input.userId,
      planId: input.planId,
      planName: input.planName,
      expectedAmountUsdt: input.priceUsdt,
      paidAmountUsdt: 0,
      depositAddress: wallet.address,
      walletIndex: wallet.walletIndex,
      status: "awaiting_payment",
      expiresAt,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      referenceId: input.referenceId,
    };
  }

  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    const { rows } = await pool.query(`SELECT * FROM engine_invoices WHERE id = $1`, [invoiceId]);
    return rows[0] ? this.rowToInvoice(rows[0]) : null;
  }

  async listPending(): Promise<Invoice[]> {
    const { rows } = await pool.query(
      `SELECT * FROM engine_invoices WHERE status IN ('awaiting_payment','created','partially_paid','detected','confirming') ORDER BY created_at DESC`,
    );
    return rows.map(this.rowToInvoice);
  }

  async updateStatus(invoiceId: string, status: string, extras?: Record<string, any>): Promise<void> {
    const sets = ["status = $2", "updated_at = NOW()"];
    const values: any[] = [invoiceId, status];
    let idx = 3;
    if (extras) {
      for (const [key, val] of Object.entries(extras)) {
        const col = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
        sets.push(`${col} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    await pool.query(`UPDATE engine_invoices SET ${sets.join(", ")} WHERE id = $1`, values);
  }

  async getPoolStatus(): Promise<Record<string, number>> {
    return this.walletPool.getPoolStatus();
  }

  private rowToInvoice(r: Record<string, any>): Invoice {
    return {
      id: String(r.id),
      userId: String(r.user_id),
      planId: String(r.plan_id),
      planName: String(r.plan_name ?? ""),
      expectedAmountUsdt: Number(r.expected_amount_usdt),
      paidAmountUsdt: Number(r.paid_amount_usdt ?? 0),
      depositAddress: String(r.deposit_address),
      walletIndex: Number(r.wallet_index),
      status: String(r.status),
      expiresAt: String(r.expires_at),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      paymentTxHash: r.payment_tx_hash ? String(r.payment_tx_hash) : undefined,
      referenceId: r.reference_id ? String(r.reference_id) : undefined,
    };
  }
}
