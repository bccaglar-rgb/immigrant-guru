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

  listPlans() {
    return [...this.store.plans.values()].sort((a, b) => a.priceUsdt - b.priceUsdt);
  }

  upsertPlan(input: {
    id?: string;
    name: string;
    priceUsdt: number;
    durationDays: number;
    features: string[];
    enabled: boolean;
  }): PlanRecord {
    const now = nowIso();
    const id = input.id ?? makeId("plan");
    const prev = this.store.plans.get(id);
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
    this.store.plans.set(id, row);
    return row;
  }

  deletePlan(id: string) {
    this.store.plans.delete(id);
  }

  createInvoice(user: UserRecord, planId: string): InvoiceRecord {
    const plan = this.store.plans.get(planId);
    if (!plan || !plan.enabled) throw new Error("plan_not_available");

    const now = Date.now();
    const id = makeId("inv");
    const addressIndex = ++this.store.addressCursor;
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
    this.store.invoices.set(invoice.id, invoice);
    return invoice;
  }

  createTokenCreatorInvoice(input: {
    user: UserRecord;
    orderId: string;
    amountUsdt: number;
    tokenSymbol: string;
  }): InvoiceRecord {
    const now = Date.now();
    const id = makeId("inv");
    const addressIndex = ++this.store.addressCursor;
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
    this.store.invoices.set(invoice.id, invoice);
    return invoice;
  }

  getInvoice(invoiceId: string) {
    return this.store.invoices.get(invoiceId) ?? null;
  }

  listInvoices() {
    return [...this.store.invoices.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  listSubscriptions(userId?: string) {
    const all = [...this.store.subscriptions.values()];
    return userId ? all.filter((s) => s.userId === userId) : all;
  }

  listTokenCreatorOrders(userId?: string): TokenCreatorOrderRecord[] {
    const rows = [...this.store.tokenCreatorOrders.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return userId ? rows.filter((r) => r.userId === userId) : rows;
  }

  processTransfer(invoice: InvoiceRecord, transfer: TronTransferEvent): { applied: boolean; reason?: string } {
    const eventKey = `${transfer.txHash}:${transfer.logIndex ?? 0}:${invoice.id}`;
    if (this.store.processedEventKeys.has(eventKey)) return { applied: false, reason: "already_processed" };

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
      this.handleInvoicePaid(invoice, transfer.txHash, invoice.paidAmountUsdt, now);
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

    this.store.paymentEvents.set(event.id, event);
    this.store.processedEventKeys.add(eventKey);
    this.store.invoices.set(invoice.id, invoice);

    return { applied: true };
  }

  expireInvoices() {
    const now = Date.now();
    for (const invoice of this.store.invoices.values()) {
      if (["paid", "expired", "failed"].includes(invoice.status)) continue;
      if (Date.parse(invoice.expiresAt) <= now) {
        invoice.status = invoice.paidAmountUsdt > 0 ? "failed" : "expired";
        invoice.updatedAt = nowIso();
      }
    }
  }

  manualMarkPaid(invoiceId: string, txHash: string, amountUsdt: number, reason: string) {
    const invoice = this.store.invoices.get(invoiceId);
    if (!invoice) throw new Error("invoice_not_found");
    const now = nowIso();
    invoice.status = "paid";
    invoice.paidAmountUsdt = amountUsdt;
    invoice.paymentTxHash = txHash;
    invoice.paidAt = now;
    invoice.updatedAt = now;
    this.handleInvoicePaid(invoice, txHash, amountUsdt, now);

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
    this.store.paymentEvents.set(event.id, event);
    this.store.processedEventKeys.add(createHash("sha256").update(`${invoiceId}:${txHash}:${reason}`).digest("hex"));
    return invoice;
  }

  extendSubscription(subscriptionId: string, extraDays: number) {
    const sub = this.store.subscriptions.get(subscriptionId);
    if (!sub) throw new Error("subscription_not_found");
    sub.endAt = addDays(sub.endAt, extraDays);
    sub.updatedAt = nowIso();
    this.store.subscriptions.set(sub.id, sub);
    return sub;
  }

  private activateSubscription(invoice: InvoiceRecord, txHash: string, paidAmountUsdt: number, paidAt: string) {
    if (!invoice.planId) return;
    const plan = this.store.plans.get(invoice.planId);
    if (!plan) return;

    const active = [...this.store.subscriptions.values()]
      .filter((s) => s.userId === invoice.userId && s.status === "active")
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

    this.store.subscriptions.set(sub.id, sub);
  }

  private markTokenCreatorOrderPaid(orderId: string, txHash: string) {
    const order = this.store.tokenCreatorOrders.get(orderId);
    if (!order) return;
    order.status = "paid";
    order.paymentTxHash = txHash;
    order.updatedAt = nowIso();
    this.store.tokenCreatorOrders.set(order.id, order);
  }

  private handleInvoicePaid(invoice: InvoiceRecord, txHash: string, paidAmountUsdt: number, paidAt: string) {
    if (invoice.invoiceType === "TOKEN_CREATOR" && invoice.externalRef) {
      this.markTokenCreatorOrderPaid(invoice.externalRef, txHash);
      return;
    }
    this.activateSubscription(invoice, txHash, paidAmountUsdt, paidAt);
  }
}
