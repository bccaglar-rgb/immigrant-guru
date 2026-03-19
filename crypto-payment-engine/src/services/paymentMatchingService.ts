/**
 * PaymentMatchingService — Validates and matches incoming TRON transfers to invoices.
 */
import { randomBytes } from "node:crypto";
import { pool } from "../db/pool.ts";
import { ENGINE_CONFIG } from "../config.ts";
import type { InvoiceService, Invoice } from "./invoiceService.ts";
import type { WalletPoolService } from "./walletPoolService.ts";
import type { WebhookService } from "./webhookService.ts";
import type { TronTransferEvent } from "./tronClient.ts";

const makeId = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;
const nowIso = () => new Date().toISOString();

export class PaymentMatchingService {
  constructor(
    private invoiceService: InvoiceService,
    private walletPool: WalletPoolService,
    private webhook: WebhookService,
  ) {}

  async processTransfer(invoice: Invoice, transfer: TronTransferEvent): Promise<{ applied: boolean; reason?: string }> {
    // Global dedup (txHash:logIndex)
    const globalKey = `${transfer.txHash}:${transfer.logIndex}`;
    const { rows: existing } = await pool.query(
      `SELECT event_key FROM engine_processed_keys WHERE event_key = $1`, [globalKey],
    );
    if (existing.length > 0) return { applied: false, reason: "already_processed" };

    // Validations
    if (transfer.contractAddress !== ENGINE_CONFIG.tron.usdtContract) return { applied: false, reason: "invalid_contract" };
    if (transfer.to !== invoice.depositAddress) return { applied: false, reason: "recipient_mismatch" };
    if (!transfer.success) return { applied: false, reason: "tx_failed" };
    if (transfer.confirmations < ENGINE_CONFIG.tron.confirmationsRequired) return { applied: false, reason: "insufficient_confirmations" };

    const now = nowIso();

    // Late payment on expired invoice → manual_review
    if (["expired", "failed"].includes(invoice.status)) {
      await this.invoiceService.updateStatus(invoice.id, "manual_review", {
        paidAmountUsdt: Number((invoice.paidAmountUsdt + transfer.amount).toFixed(6)),
        paymentTxHash: transfer.txHash,
      });
      console.warn(`[PaymentMatch] Late payment on expired ${invoice.id}: ${transfer.amount} USDT`);
      await this.recordEvent(invoice, transfer, now);
      await this.markProcessed(globalKey);
      return { applied: true, reason: "late_payment_manual_review" };
    }

    // Excessive overpay → manual_review
    const overpayMax = invoice.expectedAmountUsdt * ENGINE_CONFIG.maxOverpayRatio;
    if (transfer.amount > overpayMax) {
      await this.invoiceService.updateStatus(invoice.id, "manual_review", {
        paidAmountUsdt: Number((invoice.paidAmountUsdt + transfer.amount).toFixed(6)),
        paymentTxHash: transfer.txHash,
      });
      console.warn(`[PaymentMatch] Overpay on ${invoice.id}: expected ${invoice.expectedAmountUsdt}, got ${transfer.amount}`);
      await this.recordEvent(invoice, transfer, now);
      await this.markProcessed(globalKey);
      return { applied: true, reason: "overpay_manual_review" };
    }

    // Accumulate
    const newPaid = Number((invoice.paidAmountUsdt + transfer.amount).toFixed(6));
    const tolerance = invoice.expectedAmountUsdt * (ENGINE_CONFIG.amountTolerancePercent / 100);

    if (newPaid >= invoice.expectedAmountUsdt - tolerance) {
      // PAID — confirm and notify main platform
      await this.invoiceService.updateStatus(invoice.id, "paid", {
        paidAmountUsdt: newPaid,
        paymentTxHash: transfer.txHash,
        paidAt: now,
      });
      await this.walletPool.markPaid(invoice.depositAddress);
      console.log(`[PaymentMatch] Invoice ${invoice.id} PAID: ${newPaid}/${invoice.expectedAmountUsdt} USDT`);

      // Send webhook to main platform
      await this.webhook.sendPaymentEvent({
        eventType: "invoice.paid_confirmed",
        eventId: makeId("evt"),
        invoiceId: invoice.id,
        userId: invoice.userId,
        planId: invoice.planId,
        amount: newPaid,
        network: "TRON",
        token: "USDT",
        txHash: transfer.txHash,
        depositAddress: invoice.depositAddress,
        confirmedAt: now,
      });
    } else if (newPaid >= invoice.expectedAmountUsdt * 0.1) {
      await this.invoiceService.updateStatus(invoice.id, "partially_paid", { paidAmountUsdt: newPaid });
      console.log(`[PaymentMatch] Invoice ${invoice.id} partial: ${newPaid}/${invoice.expectedAmountUsdt}`);
    }

    await this.recordEvent(invoice, transfer, now);
    await this.markProcessed(globalKey);
    return { applied: true };
  }

  private async recordEvent(invoice: Invoice, transfer: TronTransferEvent, now: string) {
    await pool.query(
      `INSERT INTO engine_payment_events (id, invoice_id, tx_hash, from_address, to_address, amount_usdt, contract_address, confirmations, block_number, success, processed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [makeId("payevt"), invoice.id, transfer.txHash, transfer.from, transfer.to,
       transfer.amount, transfer.contractAddress, transfer.confirmations, transfer.blockNumber, transfer.success, now],
    );
  }

  private async markProcessed(key: string) {
    await pool.query(`INSERT INTO engine_processed_keys (event_key) VALUES ($1) ON CONFLICT (event_key) DO NOTHING`, [key]);
  }
}
