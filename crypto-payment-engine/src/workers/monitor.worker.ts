/**
 * Monitor Worker — Periodically scans pending invoices for incoming TRON USDT payments.
 */
import { ENGINE_CONFIG } from "../config.ts";
import { TronClient } from "../services/tronClient.ts";
import type { InvoiceService } from "../services/invoiceService.ts";
import type { PaymentMatchingService } from "../services/paymentMatchingService.ts";
import type { WalletPoolService } from "../services/walletPoolService.ts";

export class MonitorWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private consecutiveErrors = 0;
  private lastTick = 0;

  constructor(
    private tron: TronClient,
    private invoiceService: InvoiceService,
    private matching: PaymentMatchingService,
    private walletPool: WalletPoolService,
  ) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), ENGINE_CONFIG.tron.monitorIntervalMs);
    console.log(`[MonitorWorker] Started (${ENGINE_CONFIG.tron.monitorIntervalMs}ms interval)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      // Expire old invoices
      await this.expireInvoices();

      const invoices = await this.invoiceService.listPending();
      if (!invoices.length) {
        this.consecutiveErrors = 0;
        this.lastTick = Date.now();
        return;
      }

      let processed = 0;
      let errors = 0;

      for (const invoice of invoices) {
        try {
          const events = await this.tron.getRecentUsdtTransfers(invoice.depositAddress);
          for (const evt of events) {
            // Re-fetch invoice in case it was updated by previous event
            const freshInvoice = await this.invoiceService.getInvoice(invoice.id);
            if (!freshInvoice || ["paid", "manual_review"].includes(freshInvoice.status)) break;
            const result = await this.matching.processTransfer(freshInvoice, evt);
            if (result.applied) processed++;
          }
        } catch (err: any) {
          errors++;
          console.error(`[MonitorWorker] Invoice ${invoice.id} error:`, err?.message);
        }
      }

      if (processed > 0) console.log(`[MonitorWorker] Processed ${processed} transfer(s) for ${invoices.length} invoice(s)`);
      this.consecutiveErrors = errors > 0 ? this.consecutiveErrors + 1 : 0;
      this.lastTick = Date.now();

      if (this.consecutiveErrors >= 5) {
        console.error(`[MonitorWorker] ${this.consecutiveErrors} consecutive errors — TronGrid may be down`);
      }
    } catch (err: any) {
      this.consecutiveErrors++;
      console.error(`[MonitorWorker] Tick failed:`, err?.message);
    } finally {
      this.running = false;
    }
  }

  private async expireInvoices() {
    const invoices = await this.invoiceService.listPending();
    const now = Date.now();
    for (const inv of invoices) {
      if (["paid", "expired", "failed", "manual_review"].includes(inv.status)) continue;
      if (Date.parse(inv.expiresAt) <= now) {
        const newStatus = inv.paidAmountUsdt > 0 ? "manual_review" : "expired";
        await this.invoiceService.updateStatus(inv.id, newStatus);
        if (inv.paidAmountUsdt === 0) {
          await this.walletPool.markExpired(inv.depositAddress).catch(() => {});
        }
        console.log(`[MonitorWorker] Invoice ${inv.id} → ${newStatus}`);
      }
    }
  }

  getStatus() {
    return {
      running: Boolean(this.timer),
      consecutiveErrors: this.consecutiveErrors,
      lastTick: this.lastTick ? new Date(this.lastTick).toISOString() : null,
    };
  }
}
