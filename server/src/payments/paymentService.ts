import { createHash, randomBytes } from "node:crypto";
import { deriveInvoiceAddress } from "./addressDeriver.ts";
import { PAYMENT_CONFIG } from "./config.ts";
import { PaymentStore } from "./storage.ts";
import type {
  InvoiceRecord,
  PaymentEventRecord,
  PlanRecord,
  SubscriptionRecord,
  TokenCreatorOrderRecord,
  TronTransferEvent,
  UserRecord,
} from "./types.ts";

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;

const addDays = (iso: string, days: number) => {
  const ms = Date.parse(iso);
  return new Date(ms + days * 24 * 60 * 60 * 1000).toISOString();
};

export class PaymentService {
  private readonly store: PaymentStore;

  constructor(store: PaymentStore) {
    this.store = store;
  }

  async listPlans() {
    return this.store.listPlans();
  }

  async upsertPlan(input: {
    id?: string;
    name: string;
    priceUsdt: number;
    durationDays: number;
    features: string[];
    enabled: boolean;
  }): Promise<PlanRecord> {
    const now = nowIso();
    const id = input.id ?? makeId("plan");
    const prev = await this.store.getPlan(id);
    const row: PlanRecord = {
      id,
      name: input.name.trim(),
      priceUsdt: Number(input.priceUsdt),
      durationDays: Number(input.durationDays),
      features: input.features,
      enabled: input.enabled,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    await this.store.setPlan(row);
    return row;
  }

  async deletePlan(id: string) {
    await this.store.deletePlan(id);
  }

  async createInvoice(user: UserRecord, planId: string): Promise<InvoiceRecord> {
    const plan = await this.store.getPlan(planId);
    if (!plan || !plan.enabled) throw new Error("plan_not_available");

    const now = Date.now();
    const id = makeId("inv");
    const addressIndex = await this.store.nextAddressIndex();
    const depositAddress = deriveInvoiceAddress(PAYMENT_CONFIG.hd.xpub, id, addressIndex);
    const invoice: InvoiceRecord = {
      id,
      userId: user.id,
      planId: plan.id,
      invoiceType: "PLAN",
      title: `Subscription · ${plan.name}`,
      expectedAmountUsdt: plan.priceUsdt,
      paidAmountUsdt: 0,
      depositAddress,
      addressIndex,
      status: "awaiting_payment",
      chain: "TRON",
      token: "USDT_TRC20",
      expiresAt: new Date(now + PAYMENT_CONFIG.invoiceExpiryMinutes * 60_000).toISOString(),
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    await this.store.setInvoice(invoice);
    return invoice;
  }

  async createTokenCreatorInvoice(input: {
    user: UserRecord;
    orderId: string;
    amountUsdt: number;
    tokenSymbol: string;
  }): Promise<InvoiceRecord> {
    const now = Date.now();
    const id = makeId("inv");
    const addressIndex = await this.store.nextAddressIndex();
    const depositAddress = deriveInvoiceAddress(PAYMENT_CONFIG.hd.xpub, id, addressIndex);
    const invoice: InvoiceRecord = {
      id,
      userId: input.user.id,
      invoiceType: "TOKEN_CREATOR",
      title: `Token Creator · ${input.tokenSymbol.toUpperCase()}`,
      externalRef: input.orderId,
      expectedAmountUsdt: Number(input.amountUsdt),
      paidAmountUsdt: 0,
      depositAddress,
      addressIndex,
      status: "awaiting_payment",
      chain: "TRON",
      token: "USDT_TRC20",
      expiresAt: new Date(now + PAYMENT_CONFIG.invoiceExpiryMinutes * 60_000).toISOString(),
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    await this.store.setInvoice(invoice);
    return invoice;
  }

  async getInvoice(invoiceId: string) {
    return this.store.getInvoice(invoiceId);
  }

  async listInvoices() {
    return this.store.listInvoices();
  }

  async listSubscriptions(userId?: string) {
    return this.store.listSubscriptions(userId);
  }

  async listTokenCreatorOrders(userId?: string): Promise<TokenCreatorOrderRecord[]> {
    return this.store.listTokenCreatorOrders(userId);
  }

  async processTransfer(invoice: InvoiceRecord, transfer: TronTransferEvent): Promise<{ applied: boolean; reason?: string }> {
    const eventKey = `${transfer.txHash}:${transfer.logIndex ?? 0}:${invoice.id}`;
    if (await this.store.hasProcessedEventKey(eventKey)) return { applied: false, reason: "already_processed" };

    if (transfer.contractAddress !== PAYMENT_CONFIG.usdtContractAddress) {
      return { applied: false, reason: "invalid_contract" };
    }

    if (transfer.to !== invoice.depositAddress) {
      return { applied: false, reason: "recipient_mismatch" };
    }

    if (!transfer.success) {
      return { applied: false, reason: "tx_failed" };
    }

    if (transfer.confirmations < PAYMENT_CONFIG.confirmationsRequired) {
      return { applied: false, reason: "insufficient_confirmations" };
    }

    const now = nowIso();
    const overpayMax = invoice.expectedAmountUsdt * PAYMENT_CONFIG.maxOverpayRatio;
    if (transfer.amount > overpayMax) {
      return { applied: false, reason: "overpay_out_of_policy" };
    }

    invoice.paidAmountUsdt = Number((invoice.paidAmountUsdt + transfer.amount).toFixed(6));
    invoice.updatedAt = now;

    if (invoice.paidAmountUsdt >= invoice.expectedAmountUsdt) {
      invoice.status = "paid";
      invoice.paidAt = now;
      invoice.paymentTxHash = transfer.txHash;
      await this.handleInvoicePaid(invoice, transfer.txHash, invoice.paidAmountUsdt, now);
    } else if (invoice.paidAmountUsdt >= invoice.expectedAmountUsdt * PAYMENT_CONFIG.minPartialPaymentRatio) {
      invoice.status = "partially_paid";
    }

    const event: PaymentEventRecord = {
      id: makeId("payevt"),
      invoiceId: invoice.id,
      txHash: transfer.txHash,
      fromAddress: transfer.from,
      toAddress: transfer.to,
      amountUsdt: transfer.amount,
      contractAddress: transfer.contractAddress,
      confirmations: transfer.confirmations,
      blockNumber: transfer.blockNumber,
      success: transfer.success,
      processedAt: now,
    };

    await this.store.setPaymentEvent(event);
    await this.store.addProcessedEventKey(eventKey);
    await this.store.setInvoice(invoice);

    return { applied: true };
  }

  async expireInvoices() {
    const now = Date.now();
    const invoices = await this.store.listPendingInvoices();
    for (const invoice of invoices) {
      if (["paid", "expired", "failed"].includes(invoice.status)) continue;
      if (Date.parse(invoice.expiresAt) <= now) {
        invoice.status = invoice.paidAmountUsdt > 0 ? "failed" : "expired";
        invoice.updatedAt = nowIso();
        await this.store.setInvoice(invoice);
      }
    }
  }

  async manualMarkPaid(invoiceId: string, txHash: string, amountUsdt: number, reason: string) {
    const invoice = await this.store.getInvoice(invoiceId);
    if (!invoice) throw new Error("invoice_not_found");
    const now = nowIso();
    invoice.status = "paid";
    invoice.paidAmountUsdt = amountUsdt;
    invoice.paymentTxHash = txHash;
    invoice.paidAt = now;
    invoice.updatedAt = now;
    await this.handleInvoicePaid(invoice, txHash, amountUsdt, now);

    const event: PaymentEventRecord = {
      id: makeId("payevt"),
      invoiceId,
      txHash,
      fromAddress: "manual_override",
      toAddress: invoice.depositAddress,
      amountUsdt,
      contractAddress: PAYMENT_CONFIG.usdtContractAddress,
      confirmations: PAYMENT_CONFIG.confirmationsRequired,
      blockNumber: 0,
      success: true,
      processedAt: now,
    };
    await this.store.setPaymentEvent(event);
    await this.store.addProcessedEventKey(createHash("sha256").update(`${invoiceId}:${txHash}:${reason}`).digest("hex"));
    await this.store.setInvoice(invoice);
    return invoice;
  }

  async extendSubscription(subscriptionId: string, extraDays: number) {
    const sub = await this.store.getSubscription(subscriptionId);
    if (!sub) throw new Error("subscription_not_found");
    sub.endAt = addDays(sub.endAt, extraDays);
    sub.updatedAt = nowIso();
    await this.store.setSubscription(sub);
    return sub;
  }

  private async activateSubscription(invoice: InvoiceRecord, txHash: string, paidAmountUsdt: number, paidAt: string) {
    if (!invoice.planId) return;
    const plan = await this.store.getPlan(invoice.planId);
    if (!plan) return;

    const allSubs = await this.store.listSubscriptions(invoice.userId);
    const active = allSubs
      .filter((s) => s.status === "active")
      .sort((a, b) => Date.parse(b.endAt) - Date.parse(a.endAt))[0];

    const startAt = active && Date.parse(active.endAt) > Date.now() ? active.endAt : paidAt;
    const endAt = addDays(startAt, plan.durationDays);

    const sub: SubscriptionRecord = {
      id: makeId("sub"),
      userId: invoice.userId,
      planId: plan.id,
      startAt,
      endAt,
      status: "active",
      paymentTxHash: txHash,
      paidAmountUsdt,
      paidAt,
      planSnapshot: {
        name: plan.name,
        priceUsdt: plan.priceUsdt,
        durationDays: plan.durationDays,
        features: [...plan.features],
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await this.store.setSubscription(sub);
  }

  private async markTokenCreatorOrderPaid(orderId: string, txHash: string) {
    const order = await this.store.getTokenCreatorOrder(orderId);
    if (!order) return;
    order.status = "paid";
    order.paymentTxHash = txHash;
    order.updatedAt = nowIso();
    await this.store.setTokenCreatorOrder(order);
  }

  private async handleInvoicePaid(invoice: InvoiceRecord, txHash: string, paidAmountUsdt: number, paidAt: string) {
    if (invoice.invoiceType === "TOKEN_CREATOR" && invoice.externalRef) {
      await this.markTokenCreatorOrderPaid(invoice.externalRef, txHash);
      return;
    }
    await this.activateSubscription(invoice, txHash, paidAmountUsdt, paidAt);
  }
}
