import { pool } from "../db/pool.ts";
import type {
  InvoiceRecord,
  PaymentEventRecord,
  PlanRecord,
  ReferralCodeRecord,
  SessionRecord,
  SubscriptionRecord,
  TokenCreatorFeeConfig,
  TokenCreatorOrderRecord,
  UserRecord,
} from "./types.ts";

const nowIso = () => new Date().toISOString();

/* ─────────────────────────────── helpers ────────────────────────────── */

/** Convert a snake_case DB row to the existing camelCase TypeScript type. */
function rowToUser(r: any): UserRecord {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role,
    twoFactorEnabled: r.two_factor_enabled,
    twoFactorSecretEnc: r.two_factor_secret_enc ?? undefined,
    passwordResetTokenHash: r.password_reset_token_hash ?? undefined,
    passwordResetExpiresAt: r.password_reset_expires_at?.toISOString() ?? undefined,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function rowToSession(r: any): SessionRecord {
  return {
    token: r.token,
    userId: r.user_id,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
  };
}

function rowToPlan(r: any): PlanRecord {
  return {
    id: r.id,
    name: r.name,
    priceUsdt: Number(r.price_usdt),
    durationDays: r.duration_days,
    features: r.features,
    enabled: r.enabled,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function rowToInvoice(r: any): InvoiceRecord {
  return {
    id: r.id,
    userId: r.user_id,
    planId: r.plan_id ?? undefined,
    invoiceType: r.invoice_type,
    title: r.title,
    externalRef: r.external_ref ?? undefined,
    expectedAmountUsdt: Number(r.expected_amount_usdt),
    paidAmountUsdt: Number(r.paid_amount_usdt),
    depositAddress: r.deposit_address,
    addressIndex: r.address_index,
    status: r.status,
    chain: r.chain,
    token: r.token,
    expiresAt: r.expires_at.toISOString(),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    paidAt: r.paid_at?.toISOString() ?? undefined,
    paymentTxHash: r.payment_tx_hash ?? undefined,
  };
}

function rowToPaymentEvent(r: any): PaymentEventRecord {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    txHash: r.tx_hash,
    fromAddress: r.from_address,
    toAddress: r.to_address,
    amountUsdt: Number(r.amount_usdt),
    contractAddress: r.contract_address,
    confirmations: r.confirmations,
    blockNumber: Number(r.block_number),
    success: r.success,
    processedAt: r.processed_at.toISOString(),
  };
}

function rowToSubscription(r: any): SubscriptionRecord {
  return {
    id: r.id,
    userId: r.user_id,
    planId: r.plan_id,
    startAt: r.start_at.toISOString(),
    endAt: r.end_at.toISOString(),
    status: r.status,
    paymentTxHash: r.payment_tx_hash,
    paidAmountUsdt: Number(r.paid_amount_usdt),
    paidAt: r.paid_at.toISOString(),
    planSnapshot: r.plan_snapshot,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function rowToReferralCode(r: any): ReferralCodeRecord {
  return {
    id: r.id,
    code: r.code,
    assignedUserId: r.assigned_user_id ?? undefined,
    assignedEmail: r.assigned_email ?? undefined,
    createdByUserId: r.created_by_user_id,
    maxUses: r.max_uses,
    usedCount: r.used_count,
    active: r.active,
    expiresAt: r.expires_at?.toISOString() ?? undefined,
    grantPlanTier: r.grant_plan_tier ?? "explorer",
    grantDurationDays: r.grant_duration_days ?? 30,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function rowToTokenCreatorOrder(r: any): TokenCreatorOrderRecord {
  return {
    id: r.id,
    userId: r.user_id,
    status: r.status,
    token: r.token_config,
    settings: r.settings,
    pricing: r.pricing,
    invoiceId: r.invoice_id ?? undefined,
    paymentTxHash: r.payment_tx_hash ?? undefined,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 *  PaymentStore — PostgreSQL-backed
 *  All public methods are now async. The external interface is preserved
 *  but consumers must await every call.
 * ═══════════════════════════════════════════════════════════════════════ */

export class PaymentStore {
  tokenCreatorFeeConfig: TokenCreatorFeeConfig;

  constructor() {
    const now = nowIso();
    this.tokenCreatorFeeConfig = {
      baseFeeUsdt: 49,
      networkReserveUsdt: 12,
      decimalsSurchargeUsdt: 6,
      supplyTierPrices: { fixed: 0, capped: 12, unlimited: 18 },
      accessTierPrices: { none: 0, ownable: 7, role_based: 14 },
      transferTypePrices: { unstoppable: 0, pausable: 9 },
      featurePrices: { burnable: 8, mintable: 10, recoverable: 7, verifiedSource: 6, erc1363: 11 },
      updatedAt: now,
    };
  }

  /** Called once at server boot — seed default plans + load fee config. */
  async bootstrap(): Promise<void> {
    const now = nowIso();
    const defaults: PlanRecord[] = [
      // Explorer tier
      { id: "explorer-1m",  name: "Explorer · 1 Month",  priceUsdt: 10,  durationDays: 30,  features: ["Bitrium Quant Engine","Coin Universe","Crypto Market","Coin Insight"], enabled: true, createdAt: now, updatedAt: now },
      { id: "explorer-3m",  name: "Explorer · 3 Months", priceUsdt: 27,  durationDays: 90,  features: ["Bitrium Quant Engine","Coin Universe","Crypto Market","Coin Insight"], enabled: true, createdAt: now, updatedAt: now },
      { id: "explorer-6m",  name: "Explorer · 6 Months", priceUsdt: 48,  durationDays: 180, features: ["Bitrium Quant Engine","Coin Universe","Crypto Market","Coin Insight"], enabled: true, createdAt: now, updatedAt: now },
      { id: "explorer-12m", name: "Explorer · 1 Year",   priceUsdt: 84,  durationDays: 365, features: ["Bitrium Quant Engine","Coin Universe","Crypto Market","Coin Insight"], enabled: true, createdAt: now, updatedAt: now },
      // Trader tier
      { id: "trader-1m",  name: "Trader · 1 Month",  priceUsdt: 20,  durationDays: 30,  features: ["All Explorer features","Exchanges","Super Charts","Trade Ideas","Bots (Trader tier)","Indicators","Portfolio"], enabled: true, createdAt: now, updatedAt: now },
      { id: "trader-3m",  name: "Trader · 3 Months", priceUsdt: 54,  durationDays: 90,  features: ["All Explorer features","Exchanges","Super Charts","Trade Ideas","Bots (Trader tier)","Indicators","Portfolio"], enabled: true, createdAt: now, updatedAt: now },
      { id: "trader-6m",  name: "Trader · 6 Months", priceUsdt: 96,  durationDays: 180, features: ["All Explorer features","Exchanges","Super Charts","Trade Ideas","Bots (Trader tier)","Indicators","Portfolio"], enabled: true, createdAt: now, updatedAt: now },
      { id: "trader-12m", name: "Trader · 1 Year",   priceUsdt: 168, durationDays: 365, features: ["All Explorer features","Exchanges","Super Charts","Trade Ideas","Bots (Trader tier)","Indicators","Portfolio"], enabled: true, createdAt: now, updatedAt: now },
      // Titan tier
      { id: "titan-1m",  name: "Titan · 1 Month",  priceUsdt: 30,  durationDays: 30,  features: ["All Trader features","All 30 Bots","Spot Arbitrage","Futures Hedge","Spread Terminal","Institutional","Master Terminal","Alpha War Room"], enabled: true, createdAt: now, updatedAt: now },
      { id: "titan-3m",  name: "Titan · 3 Months", priceUsdt: 81,  durationDays: 90,  features: ["All Trader features","All 30 Bots","Spot Arbitrage","Futures Hedge","Spread Terminal","Institutional","Master Terminal","Alpha War Room"], enabled: true, createdAt: now, updatedAt: now },
      { id: "titan-6m",  name: "Titan · 6 Months", priceUsdt: 144, durationDays: 180, features: ["All Trader features","All 30 Bots","Spot Arbitrage","Futures Hedge","Spread Terminal","Institutional","Master Terminal","Alpha War Room"], enabled: true, createdAt: now, updatedAt: now },
      { id: "titan-12m", name: "Titan · 1 Year",   priceUsdt: 252, durationDays: 365, features: ["All Trader features","All 30 Bots","Spot Arbitrage","Futures Hedge","Spread Terminal","Institutional","Master Terminal","Alpha War Room"], enabled: true, createdAt: now, updatedAt: now },
    ];
    for (const p of defaults) {
      await pool.query(
        `INSERT INTO plans (id, name, price_usdt, duration_days, features, enabled, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [p.id, p.name, p.priceUsdt, p.durationDays, JSON.stringify(p.features), p.enabled, p.createdAt, p.updatedAt],
      );
    }

    // Load token creator fee config from DB (singleton row)
    const { rows } = await pool.query("SELECT config FROM token_creator_fee_config WHERE id = 1");
    if (rows.length > 0) {
      this.tokenCreatorFeeConfig = rows[0].config;
    } else {
      await pool.query(
        "INSERT INTO token_creator_fee_config (id, config, updated_at) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING",
        [JSON.stringify(this.tokenCreatorFeeConfig), now],
      );
    }
  }

  /* ─────────────── Users ────────────────── */

  async getUser(id: string): Promise<UserRecord | null> {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }

  async getUserByResetTokenHash(tokenHash: string): Promise<UserRecord | null> {
    const { rows } = await pool.query("SELECT * FROM users WHERE password_reset_token_hash = $1", [tokenHash]);
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }

  async setUser(user: UserRecord): Promise<void> {
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, two_factor_enabled, two_factor_secret_enc,
                          password_reset_token_hash, password_reset_expires_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         two_factor_enabled = EXCLUDED.two_factor_enabled,
         two_factor_secret_enc = EXCLUDED.two_factor_secret_enc,
         password_reset_token_hash = EXCLUDED.password_reset_token_hash,
         password_reset_expires_at = EXCLUDED.password_reset_expires_at,
         updated_at = EXCLUDED.updated_at`,
      [
        user.id, user.email, user.passwordHash, user.role, user.twoFactorEnabled,
        user.twoFactorSecretEnc ? JSON.stringify(user.twoFactorSecretEnc) : null,
        user.passwordResetTokenHash ?? null, user.passwordResetExpiresAt ?? null,
        user.createdAt, user.updatedAt,
      ],
    );
  }

  async listUsers(): Promise<UserRecord[]> {
    const { rows } = await pool.query("SELECT * FROM users ORDER BY email ASC");
    return rows.map(rowToUser);
  }

  /* ─────────────── Sessions ─────────────── */

  async getSession(token: string): Promise<SessionRecord | null> {
    const { rows } = await pool.query("SELECT * FROM sessions WHERE token = $1", [token]);
    return rows.length > 0 ? rowToSession(rows[0]) : null;
  }

  async setSession(session: SessionRecord): Promise<void> {
    await pool.query(
      `INSERT INTO sessions (token, user_id, created_at, expires_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (token) DO UPDATE SET
         user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at`,
      [session.token, session.userId, session.createdAt, session.expiresAt],
    );
  }

  async deleteSession(token: string): Promise<void> {
    await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
  }

  /* ─────────────── Plans ────────────────── */

  async getPlan(id: string): Promise<PlanRecord | null> {
    const { rows } = await pool.query("SELECT * FROM plans WHERE id = $1", [id]);
    return rows.length > 0 ? rowToPlan(rows[0]) : null;
  }

  async setPlan(plan: PlanRecord): Promise<void> {
    await pool.query(
      `INSERT INTO plans (id, name, price_usdt, duration_days, features, enabled, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, price_usdt = EXCLUDED.price_usdt, duration_days = EXCLUDED.duration_days,
         features = EXCLUDED.features, enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at`,
      [plan.id, plan.name, plan.priceUsdt, plan.durationDays, JSON.stringify(plan.features), plan.enabled, plan.createdAt, plan.updatedAt],
    );
  }

  async deletePlan(id: string): Promise<void> {
    await pool.query("DELETE FROM plans WHERE id = $1", [id]);
  }

  async listPlans(): Promise<PlanRecord[]> {
    const { rows } = await pool.query("SELECT * FROM plans ORDER BY price_usdt ASC");
    return rows.map(rowToPlan);
  }

  /* ─────────────── Invoices ─────────────── */

  async getInvoice(id: string): Promise<InvoiceRecord | null> {
    const { rows } = await pool.query("SELECT * FROM invoices WHERE id = $1", [id]);
    return rows.length > 0 ? rowToInvoice(rows[0]) : null;
  }

  async setInvoice(inv: InvoiceRecord): Promise<void> {
    await pool.query(
      `INSERT INTO invoices (id, user_id, plan_id, invoice_type, title, external_ref,
                             expected_amount_usdt, paid_amount_usdt, deposit_address, address_index,
                             status, chain, token, expires_at, paid_at, payment_tx_hash, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, paid_amount_usdt = EXCLUDED.paid_amount_usdt,
         paid_at = EXCLUDED.paid_at, payment_tx_hash = EXCLUDED.payment_tx_hash,
         updated_at = EXCLUDED.updated_at`,
      [
        inv.id, inv.userId, inv.planId ?? null, inv.invoiceType, inv.title, inv.externalRef ?? null,
        inv.expectedAmountUsdt, inv.paidAmountUsdt, inv.depositAddress, inv.addressIndex,
        inv.status, inv.chain, inv.token, inv.expiresAt, inv.paidAt ?? null, inv.paymentTxHash ?? null,
        inv.createdAt, inv.updatedAt,
      ],
    );
  }

  async listInvoices(): Promise<InvoiceRecord[]> {
    const { rows } = await pool.query("SELECT * FROM invoices ORDER BY created_at DESC");
    return rows.map(rowToInvoice);
  }

  async listPendingInvoices(): Promise<InvoiceRecord[]> {
    const { rows } = await pool.query(
      "SELECT * FROM invoices WHERE status IN ('created','awaiting_payment','partially_paid','detected','confirming')",
    );
    return rows.map(rowToInvoice);
  }

  /* ─────────────── Payment Events ───────── */

  async setPaymentEvent(evt: PaymentEventRecord): Promise<void> {
    await pool.query(
      `INSERT INTO payment_events (id, invoice_id, tx_hash, from_address, to_address,
                                   amount_usdt, contract_address, confirmations, block_number, success, processed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        evt.id, evt.invoiceId, evt.txHash, evt.fromAddress, evt.toAddress,
        evt.amountUsdt, evt.contractAddress, evt.confirmations, evt.blockNumber, evt.success, evt.processedAt,
      ],
    );
  }

  /* ─────────────── Processed Event Keys ─── */

  async hasProcessedEventKey(key: string): Promise<boolean> {
    const { rows } = await pool.query("SELECT 1 FROM processed_event_keys WHERE event_key = $1", [key]);
    return rows.length > 0;
  }

  async addProcessedEventKey(key: string): Promise<void> {
    await pool.query("INSERT INTO processed_event_keys (event_key) VALUES ($1) ON CONFLICT (event_key) DO NOTHING", [key]);
  }

  /* ─────────────── Subscriptions ────────── */

  async getSubscription(id: string): Promise<SubscriptionRecord | null> {
    const { rows } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [id]);
    return rows.length > 0 ? rowToSubscription(rows[0]) : null;
  }

  async setSubscription(sub: SubscriptionRecord): Promise<void> {
    await pool.query(
      `INSERT INTO subscriptions (id, user_id, plan_id, start_at, end_at, status,
                                  payment_tx_hash, paid_amount_usdt, paid_at, plan_snapshot, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         end_at = EXCLUDED.end_at, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
      [
        sub.id, sub.userId, sub.planId, sub.startAt, sub.endAt, sub.status,
        sub.paymentTxHash, sub.paidAmountUsdt, sub.paidAt, JSON.stringify(sub.planSnapshot),
        sub.createdAt, sub.updatedAt,
      ],
    );
  }

  async listSubscriptions(userId?: string): Promise<SubscriptionRecord[]> {
    if (userId) {
      const { rows } = await pool.query(
        "SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC", [userId],
      );
      return rows.map(rowToSubscription);
    }
    const { rows } = await pool.query("SELECT * FROM subscriptions ORDER BY created_at DESC");
    return rows.map(rowToSubscription);
  }

  /* ─────────────── Referral Codes ───────── */

  async getReferralCode(id: string): Promise<ReferralCodeRecord | null> {
    const { rows } = await pool.query("SELECT * FROM referral_codes WHERE id = $1", [id]);
    return rows.length > 0 ? rowToReferralCode(rows[0]) : null;
  }

  async setReferralCode(rc: ReferralCodeRecord): Promise<void> {
    await pool.query(
      `INSERT INTO referral_codes (id, code, assigned_user_id, assigned_email, created_by_user_id,
                                   max_uses, used_count, active, expires_at, grant_plan_tier, grant_duration_days, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         active = EXCLUDED.active, used_count = EXCLUDED.used_count, updated_at = EXCLUDED.updated_at`,
      [
        rc.id, rc.code, rc.assignedUserId ?? null, rc.assignedEmail ?? null, rc.createdByUserId,
        rc.maxUses, rc.usedCount, rc.active, rc.expiresAt ?? null,
        rc.grantPlanTier ?? "explorer", rc.grantDurationDays ?? 30,
        rc.createdAt, rc.updatedAt,
      ],
    );
  }

  async deleteReferralCode(id: string): Promise<void> {
    await pool.query("DELETE FROM referral_codes WHERE id = $1", [id]);
  }

  async listReferralCodes(): Promise<ReferralCodeRecord[]> {
    const { rows } = await pool.query("SELECT * FROM referral_codes ORDER BY created_at DESC");
    return rows.map(rowToReferralCode);
  }

  /* ─────────────── Token Creator Orders ─── */

  async getTokenCreatorOrder(id: string): Promise<TokenCreatorOrderRecord | null> {
    const { rows } = await pool.query("SELECT * FROM token_creator_orders WHERE id = $1", [id]);
    return rows.length > 0 ? rowToTokenCreatorOrder(rows[0]) : null;
  }

  async setTokenCreatorOrder(order: TokenCreatorOrderRecord): Promise<void> {
    await pool.query(
      `INSERT INTO token_creator_orders (id, user_id, status, token_config, settings, pricing,
                                         invoice_id, payment_tx_hash, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, payment_tx_hash = EXCLUDED.payment_tx_hash,
         invoice_id = EXCLUDED.invoice_id, updated_at = EXCLUDED.updated_at`,
      [
        order.id, order.userId, order.status, JSON.stringify(order.token), JSON.stringify(order.settings),
        JSON.stringify(order.pricing), order.invoiceId ?? null, order.paymentTxHash ?? null,
        order.createdAt, order.updatedAt,
      ],
    );
  }

  async listTokenCreatorOrders(userId?: string): Promise<TokenCreatorOrderRecord[]> {
    if (userId) {
      const { rows } = await pool.query(
        "SELECT * FROM token_creator_orders WHERE user_id = $1 ORDER BY created_at DESC", [userId],
      );
      return rows.map(rowToTokenCreatorOrder);
    }
    const { rows } = await pool.query("SELECT * FROM token_creator_orders ORDER BY created_at DESC");
    return rows.map(rowToTokenCreatorOrder);
  }

  /* ─────────────── Token Creator Fee Config (singleton) ── */

  async saveFeeConfig(config: TokenCreatorFeeConfig): Promise<void> {
    this.tokenCreatorFeeConfig = config;
    await pool.query(
      "INSERT INTO token_creator_fee_config (id, config, updated_at) VALUES (1, $1, $2) ON CONFLICT (id) DO UPDATE SET config = $1, updated_at = $2",
      [JSON.stringify(config), config.updatedAt],
    );
  }

  /* ─────────────── Address Cursor ───────── */

  async nextAddressIndex(): Promise<number> {
    const { rows } = await pool.query("SELECT nextval('address_cursor_seq') AS idx");
    return Number(rows[0].idx);
  }

  /* ─────────────── Member Overview ──────── */

  async getMemberOverview(): Promise<{
    totalUsers: number;
    totalActiveSubscriptions: number;
    totalRevenue: number;
  }> {
    const uRes = await pool.query("SELECT COUNT(*) AS cnt FROM users");
    const sRes = await pool.query("SELECT COUNT(*) AS cnt FROM subscriptions WHERE status = 'active' AND end_at > now()");
    const rRes = await pool.query("SELECT COALESCE(SUM(paid_amount_usdt),0) AS total FROM invoices WHERE status = 'paid'");
    return {
      totalUsers: Number(uRes.rows[0].cnt),
      totalActiveSubscriptions: Number(sRes.rows[0].cnt),
      totalRevenue: Number(rRes.rows[0].total),
    };
  }
}
