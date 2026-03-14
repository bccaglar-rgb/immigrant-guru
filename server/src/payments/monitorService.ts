import { PaymentStore } from "./storage.ts";
import { TronClient } from "./tronClient.ts";
import { PaymentService } from "./paymentService.ts";

export class TronMonitorService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly store: PaymentStore;
  private readonly tron: TronClient;
  private readonly paymentService: PaymentService;

  constructor(
    store: PaymentStore,
    tron: TronClient,
    paymentService: PaymentService,
  ) {
    this.store = store;
    this.tron = tron;
    this.paymentService = paymentService;
  }

  start(intervalMs = 8000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      this.paymentService.expireInvoices();
      const invoices = [...this.store.invoices.values()].filter((inv) => ["awaiting_payment", "partially_paid"].includes(inv.status));
      for (const invoice of invoices) {
        try {
          const events = await this.tron.getRecentUsdtTransfersToAddress(invoice.depositAddress);
          for (const evt of events) {
            this.paymentService.processTransfer(invoice, evt);
          }
        } catch {
          // monitor must continue for other invoices
        }
      }
    } finally {
      this.running = false;
    }
  }
}
