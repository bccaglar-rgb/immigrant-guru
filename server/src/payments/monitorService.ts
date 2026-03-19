import { PaymentStore } from "./storage.ts";
import { TronClient } from "./tronClient.ts";
import { PaymentService } from "./paymentService.ts";

export class TronMonitorService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private consecutiveErrors = 0;
  private lastSuccessfulTick = 0;
  private readonly store: PaymentStore;
  private readonly tron: TronClient;
  private readonly paymentService: PaymentService;

  constructor(store: PaymentStore, tron: TronClient, paymentService: PaymentService) {
    this.store = store;
    this.tron = tron;
    this.paymentService = paymentService;
  }

  start(intervalMs = 8000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    console.log(`[TronMonitor] Started (${intervalMs}ms interval)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.paymentService.expireInvoices();
      const invoices = await this.store.listPendingInvoices();
      if (!invoices.length) { this.consecutiveErrors = 0; this.lastSuccessfulTick = Date.now(); return; }

      let processed = 0;
      let errors = 0;
      for (const invoice of invoices) {
        try {
          const events = await this.tron.getRecentUsdtTransfersToAddress(invoice.depositAddress);
          for (const evt of events) {
            const result = await this.paymentService.processTransfer(invoice, evt);
            if (result.applied) processed++;
          }
        } catch (err: any) {
          errors++;
          console.error(`[TronMonitor] Invoice ${invoice.id} check failed:`, err?.message);
        }
      }

      if (processed > 0) console.log(`[TronMonitor] Processed ${processed} transfer(s) for ${invoices.length} invoice(s)`);
      this.consecutiveErrors = errors > 0 ? this.consecutiveErrors + 1 : 0;
      this.lastSuccessfulTick = Date.now();
      if (this.consecutiveErrors >= 5) console.error(`[TronMonitor] ${this.consecutiveErrors} consecutive errors — TronGrid may be down`);
    } catch (err: any) {
      this.consecutiveErrors++;
      console.error(`[TronMonitor] Tick failed:`, err?.message);
    } finally {
      this.running = false;
    }
  }

  getStatus() {
    return { running: Boolean(this.timer), consecutiveErrors: this.consecutiveErrors, lastSuccessfulTick: this.lastSuccessfulTick ? new Date(this.lastSuccessfulTick).toISOString() : null };
  }
}
