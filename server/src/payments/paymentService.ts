import { createHash, randomBytes } from "node:crypto";
import { deriveInvoiceAddress } from "./addressDeriver.ts";
import { PAYMENT_CONFIG } from "./config.ts";
import { PaymentStore } from "./storage.ts";
import { pool as dbPool } from "../db/pool.ts";
import { redisControl } from "../db/redis.ts";
import type { AddressPoolService } from "./addressPoolService.ts";
import type {
  InvoiceRecord,
  PaymentEventRecord,
  PlanRecord,
  SubscriptionRecord,
  TokenCreatorOrderRecord,
  TronTransferEvent,
  UserRecord,
} from "./types.ts";

/** Minimum absolute tolerance floor in USDT — prevents abuse on small invoices */
const MIN_TOLERANCE_USDT = 0.50;

/** Redis distributed lock TTL in seconds */
const PAYMENT_LOCK_TTL_SEC = 30;

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;

const addDays = (iso: string, days: number) => {
  const ms = Date.parse(iso);
  return new Date(ms + days * 24 * 60 * 60 * 1000).toISOString();
};

export class PaymentService {
  private readonly store: PaymentStore;
  private addressPool: AddressPoolService | null = null;

  constructor(store: PaymentStore) {
    this.store = store;
  }

  /** Set address pool service (optional — falls back to fixed address if not set) */
  setAddressPool(pool: AddressPoolService): void {
    this.addressPool = pool;
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

    // Check for existing pending invoice for same user+plan (prevent duplicates)
    const pending = await this.store.listPendingInvoices();
    const existingPending = pending.find(
      (inv) => inv.userId === user.id && inv.planId === planId &&
      ["awaiting_payment", "created"].includes(inv.status) &&
      Date.parse(inv.expiresAt) > Date.now()
    );
    if (existingPending) {
      console.log(`[Payment] Returning existing pending invoice ${existingPending.id} for user ${user.id}`);
      return existingPending;
    }

    const now = Date.now();
    const id = makeId("inv");

    // Try to get unique address from pool; fallback to fixed address
    let depositAddress: string;
    let addressIndex: number;
    if (this.addressPool) {
      const assigned = await this.addressPool.assignAddress(id, user.id);
      if (!assigned) throw new Error("address_pool_exhausted");
      depositAddress = assigned.address;
      addressIndex = assigned.walletIndex;
      console.log(`[Payment] Invoice ${id}: assigned pool address ${depositAddress} (idx ${addressIndex})`);
    } else {
      addressIndex = await this.store.nextAddressIndex();
      depositAddress = deriveInvoiceAddress(PAYMENT_CONFIG.hd.xpub, id, addressIndex);
    }

    // Per-invoice unique address means exact plan price (no unique cents needed)
    const expectedAmount = plan.priceUsdt;

    const invoice: InvoiceRecord = {
      id,
      userId: user.id,
      planId: plan.id,
      invoiceType: "PLAN",
      title: `Subscription · ${plan.name}`,
      expectedAmountUsdt: expectedAmount,
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
    console.log(`[Payment] stage=invoice_created invoice=${id} user=${user.id} plan=${planId} amount=${expectedAmount} address=${depositAddress} expires=${invoice.expiresAt}`);
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
    // Dedup by txHash+logIndex globally (not per-invoice) — prevents same tx matching multiple invoices
    const globalEventKey = `${transfer.txHash}:${transfer.logIndex ?? 0}`;
    if (await this.store.hasProcessedEventKey(globalEventKey)) return { applied: false, reason: "already_processed" };

    // Distributed lock to prevent dual-worker race condition on same invoice
    const lockKey = `payment_lock:${invoice.id}:${globalEventKey}`;
    let lockAcquired = false;
    try {
      const result = await redisControl.set(lockKey, "1", "EX", PAYMENT_LOCK_TTL_SEC, "NX");
      lockAcquired = result === "OK";
    } catch {
      // Redis unavailable — fall through with DB-level dedup as safety net
      console.warn(`[Payment] Redis lock unavailable for ${lockKey}, relying on DB dedup`);
      lockAcquired = true;
    }
    if (!lockAcquired) {
      console.log(`[Payment] Lock contention on ${lockKey}, skipping (another worker processing)`);
      return { applied: false, reason: "lock_contention" };
    }

    if (transfer.contractAddress !== PAYMENT_CONFIG.usdtContractAddress) {
      console.log(`[Payment] stage=validation_failed invoice=${invoice.id} reason=invalid_contract expected=${PAYMENT_CONFIG.usdtContractAddress} got=${transfer.contractAddress}`);
      return { applied: false, reason: "invalid_contract" };
    }
    if (transfer.to !== invoice.depositAddress) {
      console.log(`[Payment] stage=validation_failed invoice=${invoice.id} reason=recipient_mismatch expected=${invoice.depositAddress} got=${transfer.to}`);
      return { applied: false, reason: "recipient_mismatch" };
    }
    if (!transfer.success) {
      console.log(`[Payment] stage=validation_failed invoice=${invoice.id} reason=tx_failed tx=${transfer.txHash}`);
      return { applied: false, reason: "tx_failed" };
    }
    if (transfer.confirmations < PAYMENT_CONFIG.confirmationsRequired) {
      console.log(`[Payment] stage=validation_failed invoice=${invoice.id} reason=insufficient_confirmations got=${transfer.confirmations} required=${PAYMENT_CONFIG.confirmationsRequired}`);
      return { applied: false, reason: "insufficient_confirmations" };
    }
    console.log(`[Payment] stage=payment_detected invoice=${invoice.id} tx=${transfer.txHash} amount=${transfer.amount} confirmations=${transfer.confirmations}`);

    const now = nowIso();

    // Late payment on expired invoice → manual_review (don't auto-activate)
    if (["expired", "failed"].includes(invoice.status)) {
      invoice.status = "manual_review";
      invoice.paidAmountUsdt = Number((invoice.paidAmountUsdt + transfer.amount).toFixed(6));
      invoice.paymentTxHash = transfer.txHash;
      invoice.updatedAt = now;
      console.warn(`[Payment] Late payment on expired invoice ${invoice.id}: ${transfer.amount} USDT tx=${transfer.txHash}`);
      const event: PaymentEventRecord = { id: makeId("payevt"), invoiceId: invoice.id, txHash: transfer.txHash, fromAddress: transfer.from, toAddress: transfer.to, amountUsdt: transfer.amount, contractAddress: transfer.contractAddress, confirmations: transfer.confirmations, blockNumber: transfer.blockNumber, success: true, processedAt: now };
      await this.store.setPaymentEvent(event);
      await this.store.addProcessedEventKey(globalEventKey);
      await this.store.setInvoice(invoice);
      return { applied: true, reason: "late_payment_manual_review" };
    }

    // Excessive overpay → manual_review
    const overpayMax = invoice.expectedAmountUsdt * PAYMENT_CONFIG.maxOverpayRatio;
    if (transfer.amount > overpayMax) {
      invoice.status = "manual_review";
      invoice.paidAmountUsdt = Number((invoice.paidAmountUsdt + transfer.amount).toFixed(6));
      invoice.paymentTxHash = transfer.txHash;
      invoice.updatedAt = now;
      console.warn(`[Payment] Overpay on invoice ${invoice.id}: expected ${invoice.expectedAmountUsdt}, got ${transfer.amount} USDT`);
      const event: PaymentEventRecord = { id: makeId("payevt"), invoiceId: invoice.id, txHash: transfer.txHash, fromAddress: transfer.from, toAddress: transfer.to, amountUsdt: transfer.amount, contractAddress: transfer.contractAddress, confirmations: transfer.confirmations, blockNumber: transfer.blockNumber, success: true, processedAt: now };
      await this.store.setPaymentEvent(event);
      await this.store.addProcessedEventKey(globalEventKey);
      await this.store.setInvoice(invoice);
      return { applied: true, reason: "overpay_manual_review" };
    }

    // Accumulate paid amount
    invoice.paidAmountUsdt = Number((invoice.paidAmountUsdt + transfer.amount).toFixed(6));
    invoice.updatedAt = now;

    // 1% tolerance for rounding (e.g. 79.01 vs 79.00), with absolute minimum floor
    // to prevent abuse on small invoices (e.g. paying $0.50 for a $50 plan)
    const percentTolerance = invoice.expectedAmountUsdt * 0.01;
    const tolerance = Math.min(percentTolerance, MIN_TOLERANCE_USDT);
    if (invoice.paidAmountUsdt >= invoice.expectedAmountUsdt - tolerance) {
      invoice.status = "paid";
      invoice.paidAt = now;
      invoice.paymentTxHash = transfer.txHash;
      console.log(`[Payment] Invoice ${invoice.id} PAID: ${invoice.paidAmountUsdt}/${invoice.expectedAmountUsdt} USDT`);
      await this.handleInvoicePaid(invoice, transfer.txHash, invoice.paidAmountUsdt, now);
    } else if (invoice.paidAmountUsdt >= invoice.expectedAmountUsdt * PAYMENT_CONFIG.minPartialPaymentRatio) {
      invoice.status = "partially_paid";
      console.log(`[Payment] Invoice ${invoice.id} partial: ${invoice.paidAmountUsdt}/${invoice.expectedAmountUsdt} USDT`);
    }

    const event: PaymentEventRecord = { id: makeId("payevt"), invoiceId: invoice.id, txHash: transfer.txHash, fromAddress: transfer.from, toAddress: transfer.to, amountUsdt: transfer.amount, contractAddress: transfer.contractAddress, confirmations: transfer.confirmations, blockNumber: transfer.blockNumber, success: transfer.success, processedAt: now };
    await this.store.setPaymentEvent(event);
    await this.store.addProcessedEventKey(globalEventKey);
    await this.store.setInvoice(invoice);
    return { applied: true };
  }

  async expireInvoices() {
    const now = Date.now();
    const invoices = await this.store.listPendingInvoices();
    for (const invoice of invoices) {
      if (["paid", "expired", "failed", "manual_review"].includes(invoice.status)) continue;
      if (Date.parse(invoice.expiresAt) <= now) {
        const newStatus = invoice.paidAmountUsdt > 0 ? "manual_review" : "expired";
        invoice.status = newStatus;
        invoice.updatedAt = nowIso();
        await this.store.setInvoice(invoice);
        console.log(`[Payment] stage=invoice_expired invoice=${invoice.id} newStatus=${newStatus} partialPaid=${invoice.paidAmountUsdt}`);
        // Mark address as expired_unused — do NOT release back to pool
        // Reusing expired addresses risks mismatching late payments to new invoices
        if (this.addressPool) {
          await this.addressPool.markExpired(invoice.depositAddress).catch(() => {});
        }
      }
    }
  }

  async manualMarkPaid(invoiceId: string, txHash: string, amountUsdt: number, reason: string, adminUserId?: string) {
    const invoice = await this.store.getInvoice(invoiceId);
    if (!invoice) throw new Error("invoice_not_found");
    if (invoice.status === "paid") throw new Error("invoice_already_paid");
    const now = nowIso();

    // Capture old status BEFORE mutation for audit trail
    const oldStatus = invoice.status;

    // Use invoice expected amount if admin didn't specify
    const finalAmount = amountUsdt > 0 ? amountUsdt : invoice.expectedAmountUsdt;
    invoice.status = "paid";
    invoice.paidAmountUsdt = finalAmount;
    invoice.paymentTxHash = txHash;
    invoice.paidAt = now;
    invoice.updatedAt = now;
    await this.handleInvoicePaid(invoice, txHash, finalAmount, now);
    console.log(`[Payment] stage=manual_confirm invoice=${invoiceId} admin=${adminUserId ?? "unknown"} reason=${reason} amount=${finalAmount} oldStatus=${oldStatus} tx=${txHash}`);

    // Audit trail
    try {
      await dbPool.query(
        `INSERT INTO payment_admin_actions (id, admin_user_id, action, invoice_id, old_status, new_status, reason, metadata, created_at)
         VALUES ($1, $2, 'manual_confirm', $3, $4, 'paid', $5, $6, NOW())`,
        [makeId("audit"), adminUserId ?? "unknown", invoiceId, oldStatus, reason,
         JSON.stringify({ txHash, amount: finalAmount })],
      );
    } catch { /* audit write should not break main flow */ }

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
    if (!invoice.planId) { console.error(`[Payment] Subscription skip: invoice ${invoice.id} has no planId`); return; }
    const plan = await this.store.getPlan(invoice.planId);
    if (!plan) { console.error(`[Payment] Subscription skip: plan ${invoice.planId} not found for invoice ${invoice.id}`); return; }

    // Idempotency: check if subscription already exists for this txHash
    const allSubs = await this.store.listSubscriptions(invoice.userId);
    const alreadyActivated = allSubs.some((s) => s.paymentTxHash === txHash);
    if (alreadyActivated) {
      console.log(`[Payment] Subscription already activated for tx ${txHash}, skipping`);
      return;
    }

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

    // Wrap invoice status + subscription creation in a DB transaction
    // to prevent "paid invoice but no subscription" inconsistency
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      // Update invoice status to paid within the transaction
      await client.query(
        `UPDATE invoices SET status = $1, paid_amount_usdt = $2, paid_at = $3, payment_tx_hash = $4, updated_at = $5 WHERE id = $6`,
        [invoice.status, invoice.paidAmountUsdt, invoice.paidAt ?? null, invoice.paymentTxHash ?? null, invoice.updatedAt, invoice.id],
      );
      // Insert subscription within the same transaction
      await client.query(
        `INSERT INTO subscriptions (id, user_id, plan_id, start_at, end_at, status, payment_tx_hash, paid_amount_usdt, paid_at, plan_snapshot, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET end_at = EXCLUDED.end_at, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
        [sub.id, sub.userId, sub.planId, sub.startAt, sub.endAt, sub.status, sub.paymentTxHash, sub.paidAmountUsdt, sub.paidAt, JSON.stringify(sub.planSnapshot), sub.createdAt, sub.updatedAt],
      );
      await client.query("COMMIT");
      console.log(`[Payment] stage=subscription_activated invoice=${invoice.id} sub=${sub.id} plan=${plan.name} user=${invoice.userId} start=${startAt} end=${endAt} tx=${txHash}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`[Payment] stage=subscription_activation_failed invoice=${invoice.id} user=${invoice.userId} tx=${txHash} error=${(err as Error)?.message}`);
      // Revert invoice status so it can be retried
      invoice.status = "manual_review";
      invoice.updatedAt = nowIso();
      await this.store.setInvoice(invoice);
      throw err;
    } finally {
      client.release();
    }

    // Mark deposit address as paid in pool (outside transaction — best effort)
    if (this.addressPool) {
      await this.addressPool.markPaid(invoice.depositAddress).catch(() => {});
    }
  }

  private async markTokenCreatorOrderPaid(orderId: string, txHash: string) {
    const order = await this.store.getTokenCreatorOrder(orderId);
    if (!order) {
      console.warn(`[Payment] stage=token_order_not_found orderId=${orderId} tx=${txHash}`);
      return;
    }
    order.status = "paid";
    order.paymentTxHash = txHash;
    order.updatedAt = nowIso();
    await this.store.setTokenCreatorOrder(order);
    console.log(`[Payment] stage=token_order_paid orderId=${orderId} tx=${txHash}`);
  }

  private async handleInvoicePaid(invoice: InvoiceRecord, txHash: string, paidAmountUsdt: number, paidAt: string) {
    console.log(`[Payment] stage=invoice_paid invoice=${invoice.id} type=${invoice.invoiceType} amount=${paidAmountUsdt} tx=${txHash}`);
    if (invoice.invoiceType === "TOKEN_CREATOR" && invoice.externalRef) {
      await this.markTokenCreatorOrderPaid(invoice.externalRef, txHash);
      return;
    }
    await this.activateSubscription(invoice, txHash, paidAmountUsdt, paidAt);
  }
}
