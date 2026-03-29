/**
 * ExchangeCoreService — Persistent order router with real exchange execution.
 *
 * Changes from v1 (in-memory mock):
 *   1. order_intents table replaces in-memory Map
 *   2. ExchangeRateLimiter prevents hitting exchange limits
 *   3. Real Binance FAPI + Gate.io order execution via HMAC signing
 *   4. Credential decryption for live API calls
 *
 * Event log stays in-memory (ephemeral, capped at 5000). DB is for intents only.
 */
import { randomUUID, createHmac } from "node:crypto";
import { pool } from "../../db/pool.ts";
import type { ConnectionService, ExchangeConnectionRecord } from "../connectionService.ts";
import type { TraderExchange } from "../traderHub/types.ts";
import type { CoreEvent, CoreIntentRecord, ExchangeCoreMetrics } from "./types.ts";
import { ExchangeRateLimiter } from "./exchangeRateLimiter.ts";
import { circuitBreakers } from "./circuitBreaker.ts";
import { IntentFactory, type ManualIntentInput } from "./intentFactory.ts";
import { IntentDeduplicator } from "./intentDedup.ts";
import { RiskGate } from "./riskGate.ts";
import { exchangeFetch } from "../binanceRateLimiter.ts";
import { SymbolRegistry } from "./symbolRegistry.ts";
import { OrderNormalizer } from "./orderNormalizer.ts";
import { ExchangeTimeSync } from "./timeSync.ts";
import { OrderReconciler } from "./reconciler.ts";
import { ApiVault } from "./apiVault.ts";
import { KillSwitch } from "./killSwitch.ts";
import { PolicyEngine } from "./policyEngine.ts";
import { PositionTracker } from "./positionTracker.ts";
import { ExecutionStatsTracker } from "./executionStatsTracker.ts";

const nowIso = () => new Date().toISOString();

const toVenueCode = (exchangeId: string): "BINANCE" | "GATEIO" | null => {
  const raw = String(exchangeId ?? "").toLowerCase();
  if (raw === "binance") return "BINANCE";
  if (raw === "gate" || raw === "gateio" || raw === "gate.io") return "GATEIO";
  return null;
};

const toExchangeDisplay = (venue: "BINANCE" | "GATEIO"): "Binance" | "Gate.io" =>
  venue === "GATEIO" ? "Gate.io" : "Binance";

const normalizeSymbol = (raw: string): string => {
  const value = String(raw ?? "").toUpperCase().replace(/[-_/]/g, "").trim();
  if (!value) return "BTCUSDT";
  return value.endsWith("USDT") ? value : `${value}USDT`;
};

const toQueue = (source: CoreIntentRecord["source"], priority?: CoreIntentRecord["priority"]) =>
  source === "MANUAL" || priority === "INTERACTIVE" ? "INTERACTIVE" : "BATCH";

// Gate.io uses underscore-separated symbols (BTC_USDT), Binance uses concatenated (BTCUSDT)
const toGateSymbol = (symbol: string): string => {
  const upper = symbol.toUpperCase().replace(/[-_/]/g, "");
  if (upper.endsWith("USDT")) return `${upper.slice(0, -4)}_USDT`;
  return upper;
};

interface ExchangeCoreOptions {
  tickMs?: number;
  maxConcurrent?: number;
}

interface SubmitAiIntentInput {
  userId: string;
  runId: string;
  clientOrderId?: string;
  exchangePreference: TraderExchange;
  exchangeAccountId?: string;
  symbolInternal: string;
  side: "BUY" | "SELL";
  qty?: number | null;
  notionalUsdt?: number | null;
  leverage?: number | null;
}

interface ResolveVenueResult {
  ok: true;
  venue: "BINANCE" | "GATEIO";
  account: ExchangeConnectionRecord;
}

interface ResolveVenueFail {
  ok: false;
  code: string;
  reason: string;
}

type ResolveVenueResponse = ResolveVenueResult | ResolveVenueFail;

interface DecryptedCreds {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

interface ExchangeOrderResult {
  orderId: string;
  status: string;
  filledQty: number | null;
  avgPrice: number | null;
}

// ── DB Row Mapper ──────────────────────────────────────────────

const rowToIntent = (r: Record<string, unknown>): CoreIntentRecord => ({
  id: String(r.id),
  clientOrderId: String(r.client_order_id),
  source: String(r.source) as CoreIntentRecord["source"],
  priority: String(r.priority) as CoreIntentRecord["priority"],
  userId: String(r.user_id),
  runId: String(r.run_id ?? ""),
  exchangeAccountId: String(r.exchange_account_id ?? ""),
  venue: String(r.venue) as CoreIntentRecord["venue"],
  marketType: String(r.market_type ?? "FUTURES") as CoreIntentRecord["marketType"],
  symbolInternal: String(r.symbol_internal),
  symbolVenue: String(r.symbol_venue ?? r.symbol_internal),
  side: String(r.side) as "BUY" | "SELL",
  orderType: String(r.order_type ?? "MARKET") as CoreIntentRecord["orderType"],
  timeInForce: r.time_in_force ? (String(r.time_in_force) as CoreIntentRecord["timeInForce"]) : null,
  qty: r.qty != null ? Number(r.qty) : null,
  notionalUsdt: r.notional_usdt != null ? Number(r.notional_usdt) : null,
  price: r.price != null ? Number(r.price) : null,
  reduceOnly: Boolean(r.reduce_only),
  leverage: r.leverage != null ? Number(r.leverage) : null,
  tp: r.tp ? (r.tp as CoreIntentRecord["tp"]) : null,
  sl: r.sl ? (r.sl as CoreIntentRecord["sl"]) : null,
  state: String(r.state) as CoreIntentRecord["state"],
  rejectCode: String(r.reject_code ?? ""),
  rejectReason: String(r.reject_reason ?? ""),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

// ── Service ────────────────────────────────────────────────────

export class ExchangeCoreService {
  private readonly connections: ConnectionService;
  private readonly encryptionKey: Buffer;
  private readonly rateLimiter: ExchangeRateLimiter;
  private readonly intentFactory: IntentFactory;
  private readonly deduplicator: IntentDeduplicator;
  private readonly riskGate: RiskGate;
  private readonly symbolRegistry: SymbolRegistry;
  private readonly orderNormalizer: OrderNormalizer;
  private readonly timeSync: ExchangeTimeSync;
  private readonly reconciler: OrderReconciler;
  private readonly apiVault: ApiVault;
  private readonly killSwitch: KillSwitch;
  private readonly policyEngine: PolicyEngine;
  private readonly positionTracker: PositionTracker;
  private readonly statsTracker: ExecutionStatsTracker;
  private readonly tickMs: number;
  private readonly maxConcurrent: number;
  private started = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = 0;
  private lastTickAt = "";

  private readonly interactiveQueue: string[] = [];
  private readonly batchQueue: string[] = [];
  // In-memory intent cache for tick processing (avoids DB read per tick)
  private readonly intentCache = new Map<string, CoreIntentRecord>();
  private readonly events: CoreEvent[] = [];
  private readonly maxEvents = 5000;

  constructor(connections: ConnectionService, encryptionKey: Buffer, options: ExchangeCoreOptions = {}) {
    this.connections = connections;
    this.encryptionKey = encryptionKey;
    this.rateLimiter = new ExchangeRateLimiter();
    this.intentFactory = new IntentFactory();
    this.deduplicator = new IntentDeduplicator();
    this.riskGate = new RiskGate();
    this.symbolRegistry = new SymbolRegistry();
    this.orderNormalizer = new OrderNormalizer(this.symbolRegistry);
    this.timeSync = new ExchangeTimeSync();
    this.reconciler = new OrderReconciler(connections, encryptionKey, this.rateLimiter);
    this.apiVault = new ApiVault(encryptionKey);
    this.positionTracker = new PositionTracker();
    this.killSwitch = new KillSwitch();
    this.policyEngine = new PolicyEngine(this.positionTracker);
    this.statsTracker = new ExecutionStatsTracker();
    this.tickMs = Math.max(150, Math.min(2000, Math.floor(options.tickMs ?? 250)));
    this.maxConcurrent = Math.max(4, Math.min(2048, Math.floor(options.maxConcurrent ?? 128)));
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    this.timeSync.start();
    this.reconciler.start();
  }

  stop() {
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.timeSync.stop();
    this.reconciler.stop();
  }

  getMetrics(): ExchangeCoreMetrics {
    return {
      started: this.started,
      inFlight: this.inFlight,
      queueInteractive: this.interactiveQueue.length,
      queueBatch: this.batchQueue.length,
      intentsTotal: this.intentCache.size,
      eventsTotal: this.events.length,
      lastTickAt: this.lastTickAt,
      executionStats: this.statsTracker.getStats(),
    };
  }

  /** Get symbol info from registry (for frontend precision validation). */
  async getSymbolInfo(venue: string, symbol: string) {
    return this.symbolRegistry.getSymbolInfo(venue as any, symbol);
  }

  /** List intents for a user from DB. */
  async listIntentsByUser(userId: string): Promise<CoreIntentRecord[]> {
    const { rows } = await pool.query(
      `SELECT * FROM order_intents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [userId],
    );
    return rows.map(rowToIntent);
  }

  /** List events for a user (from in-memory ring buffer). */
  listEventsByUser(userId: string): CoreEvent[] {
    return this.events.filter((event) => event.scope.userId === userId);
  }

  /** Submit a manual order intent from the Exchange Terminal UI.
   *  Validates exchange connection, deduplicates, persists, and enqueues for execution. */
  async submitManualIntent(input: ManualIntentInput): Promise<CoreIntentRecord> {
    // 1. Build normalized intent record
    const row = this.intentFactory.createManualIntent(input);

    // 2. Dedup check (Redis fast path)
    const dedup = await this.deduplicator.checkAndMark(row.userId, row.clientOrderId, row.id);
    if (dedup.isDuplicate) {
      row.state = "REJECTED";
      row.rejectCode = "DUPLICATE_INTENT";
      row.rejectReason = `Duplicate order: clientOrderId=${row.clientOrderId} already in-flight (intent: ${dedup.existingIntentId ?? "?"})`;
      this.emitEvent(row, "risk.rejected", { code: "DUPLICATE_INTENT", message: row.rejectReason });
      this.statsTracker.recordDedupPrevented();
      return row;
    }

    // 3. Validate exchange account is connected and enabled
    const userConnections = await this.connections.listExchangeConnections(row.userId);
    const account = userConnections.find(
      (c) => c.id === row.exchangeAccountId && c.enabled && c.status !== "FAILED",
    );
    if (!account) {
      row.state = "REJECTED";
      row.rejectCode = "CONNECT_EXCHANGE_REQUIRED";
      row.rejectReason = "Exchange account not connected, disabled, or failed.";
      await this.persistIntent(row);
      await this.deduplicator.release(row.userId, row.clientOrderId);
      this.emitEvent(row, "risk.rejected", { code: row.rejectCode, message: row.rejectReason });
      this.statsTracker.recordRejection();
      return row;
    }

    // 4. Persist to DB + cache + enqueue
    await this.persistIntent(row);
    this.intentCache.set(row.id, row);
    this.emitEvent(row, "order.accepted", {
      source: "MANUAL",
      priority: row.priority,
      venue: row.venue,
      exchange: toExchangeDisplay(row.venue),
      accountName: account.accountName ?? "Main",
    });
    this.enqueue(row.id, toQueue(row.source, row.priority));
    this.statsTracker.recordSubmission("MANUAL", row.venue);
    return row;
  }

  /** Submit an AI-generated order intent. Persists to DB + enqueues for execution. */
  async submitAiIntent(input: SubmitAiIntentInput): Promise<CoreIntentRecord> {
    const resolved = await this.resolveVenueAndAccount(
      input.userId,
      input.exchangePreference,
      input.exchangeAccountId,
    );

    const now = nowIso();
    const intentId = randomUUID();
    const queuePriority: CoreIntentRecord["priority"] = "BATCH";

    if (!resolved.ok) {
      const rejected: CoreIntentRecord = {
        id: intentId,
        clientOrderId: input.clientOrderId ?? `ai-${intentId.slice(0, 12)}`,
        source: "AI",
        priority: queuePriority,
        userId: input.userId,
        runId: input.runId,
        exchangeAccountId: input.exchangeAccountId?.trim() || "unbound",
        venue: "BINANCE",
        marketType: "FUTURES",
        symbolInternal: normalizeSymbol(input.symbolInternal),
        symbolVenue: normalizeSymbol(input.symbolInternal),
        side: input.side,
        orderType: "MARKET",
        timeInForce: null,
        qty: input.qty ?? null,
        notionalUsdt: input.notionalUsdt ?? null,
        price: null,
        reduceOnly: false,
        leverage: input.leverage ?? null,
        tp: null,
        sl: null,
        state: "REJECTED",
        rejectCode: resolved.code,
        rejectReason: resolved.reason,
        createdAt: now,
        updatedAt: now,
      };
      await this.persistIntent(rejected);
      this.emitEvent(rejected, "risk.rejected", {
        code: resolved.code,
        message: resolved.reason,
      });
      this.statsTracker.recordRejection();
      return rejected;
    }

    const row: CoreIntentRecord = {
      id: intentId,
      clientOrderId: input.clientOrderId ?? `ai-${intentId.slice(0, 12)}`,
      source: "AI",
      priority: queuePriority,
      userId: input.userId,
      runId: input.runId,
      exchangeAccountId: resolved.account.id,
      venue: resolved.venue,
      marketType: "FUTURES",
      symbolInternal: normalizeSymbol(input.symbolInternal),
      symbolVenue: normalizeSymbol(input.symbolInternal),
      side: input.side,
      orderType: "MARKET",
      timeInForce: null,
      qty: input.qty ?? null,
      notionalUsdt: input.notionalUsdt ?? 100,
      price: null,
      reduceOnly: false,
      leverage: input.leverage ?? 3,
      tp: null,
      sl: null,
      state: "ACCEPTED",
      rejectCode: "",
      rejectReason: "",
      createdAt: now,
      updatedAt: now,
    };
    await this.persistIntent(row);
    this.intentCache.set(row.id, row);
    this.emitEvent(row, "order.accepted", {
      source: "AI",
      priority: row.priority,
      venue: row.venue,
      exchange: toExchangeDisplay(row.venue),
      accountName: resolved.account.accountName ?? "Main",
    });
    this.enqueue(row.id, toQueue(row.source, row.priority));
    this.statsTracker.recordSubmission("AI", row.venue);
    return row;
  }

  // ── DB Persistence ──────────────────────────────────────────

  private async persistIntent(intent: CoreIntentRecord): Promise<void> {
    await pool.query(
      `INSERT INTO order_intents
         (id, client_order_id, source, priority, user_id, run_id,
          exchange_account_id, venue, market_type, symbol_internal, symbol_venue,
          side, order_type, time_in_force, qty, notional_usdt, price,
          reduce_only, leverage, tp, sl, state, reject_code, reject_reason,
          exchange_order_id, fill_qty, avg_fill_price, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
       ON CONFLICT (id) DO UPDATE SET
         state = EXCLUDED.state,
         reject_code = EXCLUDED.reject_code,
         reject_reason = EXCLUDED.reject_reason,
         updated_at = EXCLUDED.updated_at`,
      [
        intent.id,
        intent.clientOrderId,
        intent.source,
        intent.priority,
        intent.userId,
        intent.runId,
        intent.exchangeAccountId,
        intent.venue,
        intent.marketType,
        intent.symbolInternal,
        intent.symbolVenue,
        intent.side,
        intent.orderType,
        intent.timeInForce,
        intent.qty,
        intent.notionalUsdt,
        intent.price,
        intent.reduceOnly,
        intent.leverage,
        intent.tp ? JSON.stringify(intent.tp) : null,
        intent.sl ? JSON.stringify(intent.sl) : null,
        intent.state,
        intent.rejectCode,
        intent.rejectReason,
        null, // exchange_order_id
        null, // fill_qty
        null, // avg_fill_price
        intent.createdAt,
        intent.updatedAt,
      ],
    );
  }

  private async updateIntentState(
    id: string,
    state: CoreIntentRecord["state"],
    extras?: {
      rejectCode?: string;
      rejectReason?: string;
      exchangeOrderId?: string;
      fillQty?: number | null;
      avgFillPrice?: number | null;
    },
  ): Promise<void> {
    const now = nowIso();
    await pool.query(
      `UPDATE order_intents SET
         state = $2,
         reject_code = COALESCE($3, reject_code),
         reject_reason = COALESCE($4, reject_reason),
         exchange_order_id = COALESCE($5, exchange_order_id),
         fill_qty = COALESCE($6, fill_qty),
         avg_fill_price = COALESCE($7, avg_fill_price),
         updated_at = $8
       WHERE id = $1`,
      [
        id,
        state,
        extras?.rejectCode ?? null,
        extras?.rejectReason ?? null,
        extras?.exchangeOrderId ?? null,
        extras?.fillQty ?? null,
        extras?.avgFillPrice ?? null,
        now,
      ],
    );
    // Update cache too
    const cached = this.intentCache.get(id);
    if (cached) {
      cached.state = state;
      cached.updatedAt = now;
      if (extras?.rejectCode) cached.rejectCode = extras.rejectCode;
      if (extras?.rejectReason) cached.rejectReason = extras.rejectReason;
    }
  }

  // ── Queue / Tick ──────────────────────────────────────────────

  private enqueue(intentId: string, queue: "INTERACTIVE" | "BATCH") {
    if (queue === "INTERACTIVE") this.interactiveQueue.push(intentId);
    else this.batchQueue.push(intentId);
  }

  private async tick() {
    if (!this.started) return;
    this.lastTickAt = nowIso();
    while (this.inFlight < this.maxConcurrent) {
      const nextId = this.interactiveQueue.shift() ?? this.batchQueue.shift();
      if (!nextId) break;
      const row = this.intentCache.get(nextId);
      if (!row || row.state === "REJECTED" || row.state === "DONE") continue;
      this.inFlight += 1;
      void this.processIntent(row)
        .catch((err) => {
          const message = err instanceof Error ? err.message : "intent_process_failed";
          const cached = this.intentCache.get(row.id);
          if (!cached) return;
          cached.state = "ERROR";
          cached.rejectCode = "PROCESS_ERROR";
          cached.rejectReason = message;
          cached.updatedAt = nowIso();
          void this.updateIntentState(row.id, "ERROR", {
            rejectCode: "PROCESS_ERROR",
            rejectReason: message,
          });
          this.emitEvent(cached, "error", {
            stage: "exchange_core.process",
            message,
          });
          this.statsTracker.recordFailure(row.venue, "PROCESS_ERROR", message);
        })
        .finally(() => {
          this.inFlight = Math.max(0, this.inFlight - 1);
        });
    }
  }

  // ── Order Execution ──────────────────────────────────────────

  private async processIntent(row: CoreIntentRecord) {
    // 0. Kill switch check (highest priority)
    const ksResult = await this.killSwitch.isBlocked({
      venue: row.venue,
      userId: row.userId,
      symbolInternal: row.symbolInternal,
      source: row.source,
    });
    if (ksResult.blocked) {
      row.state = "REJECTED";
      row.rejectCode = `KILL_SWITCH_${ksResult.level}`;
      row.rejectReason = ksResult.reason ?? "Kill switch active";
      row.updatedAt = nowIso();
      await this.updateIntentState(row.id, "REJECTED", {
        rejectCode: row.rejectCode,
        rejectReason: row.rejectReason,
      });
      this.emitEvent(row, "risk.rejected", { stage: "kill_switch", level: ksResult.level, message: row.rejectReason });
      this.statsTracker.recordRejection();
      return;
    }

    // 1. Circuit breaker check (OPEN → reject immediately, don't waste the request)
    const cb = circuitBreakers[row.venue as keyof typeof circuitBreakers];
    if (cb && !await cb.canRequest()) {
      row.state = "ERROR";
      row.rejectCode = "CIRCUIT_OPEN";
      row.rejectReason = `${toExchangeDisplay(row.venue)} circuit breaker is OPEN. Will retry after cooldown.`;
      row.updatedAt = nowIso();
      await this.updateIntentState(row.id, "ERROR", {
        rejectCode: "CIRCUIT_OPEN",
        rejectReason: row.rejectReason,
      });
      this.emitEvent(row, "error", { stage: "circuit_breaker", message: row.rejectReason });
      this.statsTracker.recordFailure(row.venue, "CIRCUIT_OPEN", row.rejectReason);
      return;
    }

    // 2. Pre-trade risk check
    const riskResult = await this.riskGate.check(row);
    if (!riskResult.allowed) {
      row.state = "REJECTED";
      row.rejectCode = riskResult.code ?? "RISK_CHECK_FAILED";
      row.rejectReason = riskResult.reason ?? "Risk check failed";
      row.updatedAt = nowIso();
      await this.updateIntentState(row.id, "REJECTED", {
        rejectCode: row.rejectCode,
        rejectReason: row.rejectReason,
      });
      this.emitEvent(row, "risk.rejected", { stage: "risk_gate", code: row.rejectCode, message: row.rejectReason });
      this.statsTracker.recordRejection();
      return;
    }
    if (riskResult.warnings.length > 0) {
      this.emitEvent(row, "order.accepted", { stage: "risk_gate", warnings: riskResult.warnings });
    }

    // 2b. Policy engine check (AI vs manual conflict)
    const policyResult = await this.policyEngine.evaluate(row);
    if (!policyResult.allowed) {
      row.state = "REJECTED";
      row.rejectCode = "POLICY_CONFLICT";
      row.rejectReason = policyResult.reason;
      row.updatedAt = nowIso();
      await this.updateIntentState(row.id, "REJECTED", {
        rejectCode: row.rejectCode,
        rejectReason: row.rejectReason,
      });
      this.emitEvent(row, "risk.rejected", {
        stage: "policy_engine",
        message: policyResult.reason,
        blockedBy: policyResult.blockedBy,
      });
      this.statsTracker.recordRejection();
      return;
    }

    // 3. Order normalization (qty precision, price tick, min notional)
    const normResult = await this.orderNormalizer.normalize(row);
    if (!normResult.ok) {
      row.state = "REJECTED";
      row.rejectCode = normResult.error.code;
      row.rejectReason = normResult.error.reason;
      row.updatedAt = nowIso();
      await this.updateIntentState(row.id, "REJECTED", {
        rejectCode: row.rejectCode,
        rejectReason: row.rejectReason,
      });
      this.emitEvent(row, "risk.rejected", { stage: "order_normalizer", code: row.rejectCode, message: row.rejectReason });
      this.statsTracker.recordRejection();
      return;
    }
    // Apply normalized values back to intent
    row.symbolVenue = normResult.result.symbolVenue;
    if (normResult.result.qty > 0) row.qty = normResult.result.qty;
    if (normResult.result.price != null) row.price = normResult.result.price;

    // 4. Multi-level rate limit check (global → venue → user → symbol)
    const rlResult = await this.rateLimiter.tryAcquireAll(
      row.venue as "BINANCE" | "GATEIO" | "BYBIT" | "OKX",
      row.userId,
      row.symbolInternal,
      5,
    );
    if (!rlResult.allowed) {
      row.state = "ERROR";
      row.rejectCode = "RATE_LIMITED";
      row.rejectReason = `Rate limit exceeded at ${rlResult.blockedBy} level for ${toExchangeDisplay(row.venue)}. Will retry next tick.`;
      row.updatedAt = nowIso();
      await this.updateIntentState(row.id, "ERROR", {
        rejectCode: "RATE_LIMITED",
        rejectReason: row.rejectReason,
      });
      this.emitEvent(row, "error", {
        stage: "rate_limit",
        level: rlResult.blockedBy,
        message: row.rejectReason,
      });
      this.statsTracker.recordFailure(row.venue, "RATE_LIMITED", row.rejectReason);
      return;
    }

    // 5. Decrypt credentials (via ApiVault with audit)
    const creds = await this.apiVault.getCredentials(row.userId, row.exchangeAccountId, "order_execution");
    if (!creds) {
      row.state = "ERROR";
      row.rejectCode = "CREDS_UNAVAILABLE";
      row.rejectReason = "Could not decrypt exchange credentials. Re-connect your exchange account.";
      row.updatedAt = nowIso();
      await this.updateIntentState(row.id, "ERROR", {
        rejectCode: "CREDS_UNAVAILABLE",
        rejectReason: row.rejectReason,
      });
      this.emitEvent(row, "error", {
        stage: "credential_decrypt",
        message: row.rejectReason,
      });
      this.statsTracker.recordFailure(row.venue, "CREDS_UNAVAILABLE", row.rejectReason);
      return;
    }

    // 3. Mark as SENT
    row.state = "SENT";
    row.updatedAt = nowIso();
    await this.updateIntentState(row.id, "SENT");
    this.emitEvent(row, "order.sent", {
      symbol: row.symbolInternal,
      venue: row.venue,
      exchange: toExchangeDisplay(row.venue),
      orderType: row.orderType,
      side: row.side,
    });

    // 4. Execute on exchange (with latency tracking)
    let result: ExchangeOrderResult;
    const execStart = performance.now();
    try {
      if (row.venue === "BINANCE") {
        result = await this.executeBinanceOrder(creds, row);
      } else if (row.venue === "GATEIO") {
        result = await this.executeGateOrder(creds, row);
      } else if (row.venue === "BYBIT") {
        result = await this.executeBybitOrder(creds, row);
      } else if (row.venue === "OKX") {
        result = await this.executeOkxOrder(creds, row);
      } else {
        throw new Error(`Unsupported venue: ${row.venue}`);
      }
      const execMs = Math.round(performance.now() - execStart);
      // Record success to circuit breaker + stats tracker
      if (cb) await cb.recordSuccess().catch(() => {});
      this.statsTracker.recordSuccess(execMs);
    } catch (err: any) {
      const msg = err?.message ?? "exchange_api_failed";
      // Record failure to circuit breaker + stats tracker
      if (cb) await cb.recordFailure().catch(() => {});
      this.statsTracker.recordFailure(row.venue, "EXCHANGE_ERROR", msg);
      row.state = "ERROR";
      row.rejectCode = "EXCHANGE_ERROR";
      row.rejectReason = msg;
      row.updatedAt = nowIso();
      await this.updateIntentState(row.id, "ERROR", {
        rejectCode: "EXCHANGE_ERROR",
        rejectReason: msg,
      });
      this.emitEvent(row, "error", {
        stage: "exchange_api",
        message: msg,
        venue: row.venue,
      });
      return;
    }

    // 5. Mark as DONE with fill data
    row.state = "DONE";
    row.updatedAt = nowIso();
    await this.updateIntentState(row.id, "DONE", {
      exchangeOrderId: result.orderId,
      fillQty: result.filledQty,
      avgFillPrice: result.avgPrice,
    });
    this.emitEvent(row, "order.update", {
      exchangeOrderId: result.orderId,
      status: result.status,
      filledQty: result.filledQty,
      avgFillPrice: result.avgPrice,
    });
  }

  // ── Binance FAPI Order ──────────────────────────────────────

  private async executeBinanceOrder(creds: DecryptedCreds, intent: CoreIntentRecord): Promise<ExchangeOrderResult> {
    const base = "https://fapi.binance.com";
    const ts = this.timeSync.getAdjustedTimestamp("BINANCE");

    const params: Record<string, string> = {
      symbol: intent.symbolVenue,
      side: intent.side,
      type: intent.orderType,
      newClientOrderId: intent.clientOrderId,
      timestamp: String(ts),
      recvWindow: "10000",
    };

    // For MARKET orders: use quantity if set, otherwise compute from notional
    if (intent.qty != null && intent.qty > 0) {
      params.quantity = String(intent.qty);
    } else if (intent.notionalUsdt != null && intent.notionalUsdt > 0) {
      // Binance supports newOrderRespType for market orders
      // We pass notional as quantity isn't known; Binance doesn't have notional param for futures
      // So we estimate qty from a rough price or skip (let exchange handle)
      // For safety, pass a very small qty if we don't know the price
      // Actually: Binance Futures does NOT support quoteOrderQty. We must compute qty.
      // Fallback: store as PENDING and compute qty from last price later.
      // For now, reject if no qty and no way to compute.
      params.quantity = "0"; // Will be computed below
    }

    // Set leverage if specified
    if (intent.leverage != null && intent.leverage > 0) {
      try {
        await this.binanceSigned(base, "POST", "/fapi/v1/leverage", creds, {
          symbol: intent.symbolVenue,
          leverage: String(intent.leverage),
          timestamp: String(ts),
          recvWindow: "10000",
        });
      } catch {
        // Leverage change failed — continue with current leverage
        console.warn(`[ExchangeCore] Leverage change failed for ${intent.symbolVenue}, continuing`);
      }
    }

    // If we need to compute qty from notional, get the current price first
    if (params.quantity === "0" && intent.notionalUsdt != null) {
      try {
        const priceRes = await exchangeFetch(`${base}/fapi/v1/ticker/price?symbol=${intent.symbolVenue}`, undefined, { exchange: "binance", weight: 1, priority: "critical", dedupKey: `price:${intent.symbolVenue}` });
        if (priceRes.ok) {
          const priceData = (await priceRes.json()) as { price: string };
          const price = Number(priceData.price);
          if (price > 0) {
            const effectiveLeverage = intent.leverage ?? 3;
            // notional * leverage / price = qty (with some rounding)
            const rawQty = (intent.notionalUsdt * effectiveLeverage) / price;
            // Round to 3 decimal places (safe for most pairs)
            params.quantity = String(Math.floor(rawQty * 1000) / 1000);
          }
        }
      } catch {
        // Price fetch failed
      }

      // If still 0, reject
      if (params.quantity === "0") {
        throw new Error("Cannot compute order quantity — price unavailable");
      }
    }

    // Place the order
    const data = await this.binanceSigned<{
      orderId: number;
      clientOrderId: string;
      status: string;
      executedQty: string;
      avgPrice: string;
    }>(base, "POST", "/fapi/v1/order", creds, params);

    return {
      orderId: String(data.orderId),
      status: data.status,
      filledQty: Number(data.executedQty) || null,
      avgPrice: Number(data.avgPrice) || null,
    };
  }

  /** HMAC-SHA256 signed Binance FAPI request. */
  private async binanceSigned<T>(
    base: string,
    method: "GET" | "POST" | "DELETE",
    path: string,
    creds: DecryptedCreds,
    params: Record<string, string>,
  ): Promise<T> {
    const query = new URLSearchParams(params).toString();
    const signature = createHmac("sha256", creds.apiSecret).update(query).digest("hex");
    const fullQs = `${query}&signature=${signature}`;

    const url = method === "GET" || method === "DELETE"
      ? `${base}${path}?${fullQs}`
      : `${base}${path}`;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "X-MBX-APIKEY": creds.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
    };

    if (method === "POST") {
      fetchOptions.body = fullQs;
    }

    const res = await fetch(url, fetchOptions);
    const body = await res.text();

    if (!res.ok) {
      let errMsg: string;
      try {
        const parsed = JSON.parse(body) as { msg?: string; code?: number };
        errMsg = `Binance API ${res.status}: ${parsed.msg ?? body} (code: ${parsed.code ?? "?"})`;
      } catch {
        errMsg = `Binance API ${res.status}: ${body.slice(0, 200)}`;
      }
      throw new Error(errMsg);
    }

    return JSON.parse(body) as T;
  }

  // ── Gate.io Futures Order ────────────────────────────────────

  private async executeGateOrder(creds: DecryptedCreds, intent: CoreIntentRecord): Promise<ExchangeOrderResult> {
    const base = "https://fx-api.gateio.ws";
    const path = "/api/v4/futures/usdt/orders";

    // Gate.io uses underscore-separated symbol format
    const gateSymbol = toGateSymbol(intent.symbolVenue);
    const ts = Math.floor(this.timeSync.getAdjustedTimestamp("GATEIO") / 1000);

    // Compute size: Gate.io uses "size" in contracts (1 contract = 1 USD for most pairs)
    let size: number;
    if (intent.qty != null && intent.qty > 0) {
      size = Math.round(intent.qty);
    } else if (intent.notionalUsdt != null) {
      // For Gate.io USDT futures, 1 contract ≈ varies by symbol
      // Conservative: use notional * leverage as approximate contract count
      size = Math.round((intent.notionalUsdt ?? 100) * (intent.leverage ?? 3));
    } else {
      size = 1;
    }

    // Gate.io uses negative size for sell/short
    if (intent.side === "SELL") size = -Math.abs(size);

    const bodyObj = {
      contract: gateSymbol,
      size,
      price: "0", // market order
      tif: "ioc", // Immediate or cancel for market-like execution
      text: `t-${intent.clientOrderId.slice(0, 24)}`,
    };
    const bodyStr = JSON.stringify(bodyObj);

    // Gate.io V4 signing: SHA512-HMAC of timestamp + method + path + query + hash(body)
    const bodyHash = createHmac("sha512", "").update(bodyStr).digest("hex");
    const signStr = `POST\n${path}\n\n${bodyHash}\n${ts}`;
    const signature = createHmac("sha512", creds.apiSecret).update(signStr).digest("hex");

    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "KEY": creds.apiKey,
        "SIGN": signature,
        "Timestamp": String(ts),
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: bodyStr,
    });

    const text = await res.text();
    if (!res.ok) {
      let errMsg: string;
      try {
        const parsed = JSON.parse(text) as { label?: string; message?: string };
        errMsg = `Gate.io API ${res.status}: ${parsed.message ?? text} (label: ${parsed.label ?? "?"})`;
      } catch {
        errMsg = `Gate.io API ${res.status}: ${text.slice(0, 200)}`;
      }
      throw new Error(errMsg);
    }

    const data = JSON.parse(text) as {
      id: number;
      status: string;
      size: number;
      fill_price: string;
    };

    return {
      orderId: String(data.id),
      status: data.status === "finished" ? "FILLED" : data.status.toUpperCase(),
      filledQty: Math.abs(data.size) || null,
      avgPrice: Number(data.fill_price) || null,
    };
  }

  // ── Events ───────────────────────────────────────────────────

  private emitEvent(intent: CoreIntentRecord, type: CoreEvent["type"], data: Record<string, unknown>) {
    const event: CoreEvent = {
      eventId: randomUUID(),
      ts: nowIso(),
      type,
      scope: {
        userId: intent.userId,
        exchangeAccountId: intent.exchangeAccountId,
        runId: intent.runId,
      },
      refs: {
        intentId: intent.id,
        orderId: "",
      },
      data,
    };
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
  }

  // ── Cancel Order ─────────────────────────────────────────────

  /**
   * Cancel an order intent. Handles three scenarios:
   *   1. ACCEPTED/QUEUED → not yet sent to exchange → immediate CANCELED
   *   2. SENT → sent to exchange → send cancel API → wait for ack
   *   3. DONE/CANCELED/REJECTED/ERROR → already terminal → reject cancel
   */
  async cancelIntent(
    intentId: string,
    userId: string,
    reason = "user_requested",
  ): Promise<{ ok: boolean; intent?: CoreIntentRecord; code?: string; message?: string }> {
    // 1. Fetch intent from DB (authoritative)
    const { rows } = await pool.query(
      `SELECT * FROM order_intents WHERE id = $1 LIMIT 1`,
      [intentId],
    );
    if (!rows.length) {
      return { ok: false, code: "NOT_FOUND", message: "Order not found." };
    }
    const intent = rowToIntent(rows[0]);

    // 2. Ownership check
    if (intent.userId !== userId) {
      return { ok: false, code: "FORBIDDEN", message: "You do not own this order." };
    }

    // 3. Idempotency: already canceled or terminal
    if (intent.state === "CANCELED") {
      return { ok: true, intent, code: "ALREADY_CANCELED", message: "Order already canceled." };
    }
    if (intent.state === "DONE") {
      return { ok: false, code: "ALREADY_FILLED", message: "Order already filled — cannot cancel." };
    }
    if (intent.state === "REJECTED" || intent.state === "ERROR") {
      return { ok: true, intent, code: "ALREADY_CLOSED", message: `Order already ${intent.state.toLowerCase()}.` };
    }

    // 4. ACCEPTED or QUEUED — not sent to exchange yet → immediate cancel
    if (intent.state === "ACCEPTED" || intent.state === "QUEUED" || intent.state === "PENDING") {
      // Remove from queue if present
      this.removeFromQueue(intent.id);

      intent.state = "CANCELED";
      intent.rejectCode = "USER_CANCELED";
      intent.rejectReason = reason;
      intent.updatedAt = nowIso();
      await this.updateIntentState(intent.id, "CANCELED", {
        rejectCode: "USER_CANCELED",
        rejectReason: reason,
      });
      this.intentCache.set(intent.id, intent);
      await this.deduplicator.release(intent.userId, intent.clientOrderId);
      this.emitEvent(intent, "order.canceled", {
        reason,
        cancelType: "pre_exchange",
        message: "Canceled before sending to exchange.",
      });
      return { ok: true, intent };
    }

    // 5. SENT — order is on the exchange → send cancel API
    // Get exchange_order_id from DB
    const { rows: fullRows } = await pool.query(
      `SELECT exchange_order_id, fill_qty, avg_fill_price FROM order_intents WHERE id = $1`,
      [intentId],
    );
    const exchangeOrderId = fullRows[0]?.exchange_order_id as string | null;

    this.emitEvent(intent, "order.cancel_requested", { reason, exchangeOrderId });

    // Decrypt credentials
    const creds = await this.apiVault.getCredentials(intent.userId, intent.exchangeAccountId, "order_cancel");
    if (!creds) {
      return { ok: false, code: "CREDS_UNAVAILABLE", message: "Cannot decrypt credentials for cancel." };
    }

    // Rate limit check (cancel = 1 weight)
    const rlResult = await this.rateLimiter.tryAcquireAll(
      intent.venue as "BINANCE" | "GATEIO" | "BYBIT" | "OKX",
      intent.userId,
      intent.symbolInternal,
      1,
    );
    if (!rlResult.allowed) {
      return { ok: false, code: "RATE_LIMITED", message: `Rate limited at ${rlResult.blockedBy} level. Try again shortly.` };
    }

    // Circuit breaker check
    const cb = circuitBreakers[intent.venue as keyof typeof circuitBreakers];
    if (cb && !await cb.canRequest()) {
      return { ok: false, code: "CIRCUIT_OPEN", message: `${toExchangeDisplay(intent.venue)} circuit breaker is OPEN.` };
    }

    try {
      let cancelResult: { success: boolean; finalStatus: string; filledQty: number | null; avgPrice: number | null };

      if (intent.venue === "BINANCE") {
        cancelResult = await this.cancelBinanceOrder(creds, intent, exchangeOrderId);
      } else if (intent.venue === "GATEIO") {
        cancelResult = await this.cancelGateOrder(creds, intent, exchangeOrderId);
      } else if (intent.venue === "BYBIT") {
        cancelResult = await this.cancelBybitOrder(creds, intent, exchangeOrderId);
      } else if (intent.venue === "OKX") {
        cancelResult = await this.cancelOkxOrder(creds, intent, exchangeOrderId);
      } else {
        return { ok: false, code: "UNSUPPORTED_VENUE", message: `Cancel not supported for ${intent.venue}` };
      }

      if (cb) await cb.recordSuccess().catch(() => {});

      // Determine final state based on exchange response
      if (cancelResult.finalStatus === "CANCELED" || cancelResult.finalStatus === "cancelled") {
        // Check if partially filled before cancel
        const filledQty = cancelResult.filledQty ?? 0;
        const finalState = filledQty > 0 ? "DONE" as const : "CANCELED" as const;
        const cancelReason = filledQty > 0
          ? `Partially filled (${filledQty}), then canceled. ${reason}`
          : reason;

        intent.state = finalState;
        intent.rejectCode = "USER_CANCELED";
        intent.rejectReason = cancelReason;
        intent.updatedAt = nowIso();
        await this.updateIntentState(intent.id, finalState, {
          rejectCode: "USER_CANCELED",
          rejectReason: cancelReason,
          fillQty: filledQty || null,
          avgFillPrice: cancelResult.avgPrice,
        });
        this.intentCache.set(intent.id, intent);
        await this.deduplicator.release(intent.userId, intent.clientOrderId);
        this.emitEvent(intent, "order.canceled", {
          reason: cancelReason,
          cancelType: "exchange_confirmed",
          filledQty,
          avgFillPrice: cancelResult.avgPrice,
        });
        return { ok: true, intent };
      }

      if (cancelResult.finalStatus === "FILLED") {
        // Order filled while we tried to cancel
        intent.state = "DONE";
        intent.updatedAt = nowIso();
        await this.updateIntentState(intent.id, "DONE", {
          fillQty: cancelResult.filledQty,
          avgFillPrice: cancelResult.avgPrice,
        });
        this.intentCache.set(intent.id, intent);
        this.emitEvent(intent, "order.cancel_rejected", {
          reason: "Order was filled before cancel could be processed.",
          finalStatus: "FILLED",
          filledQty: cancelResult.filledQty,
        });
        return { ok: false, code: "FILLED_DURING_CANCEL", message: "Order was filled before cancel." };
      }

      // Unknown / still open — mark as cancel_requested, reconciler will catch it
      this.emitEvent(intent, "order.cancel_requested", {
        exchangeStatus: cancelResult.finalStatus,
        message: "Cancel sent, awaiting confirmation from exchange.",
      });
      return { ok: true, intent, code: "CANCEL_PENDING", message: "Cancel request sent. Awaiting exchange confirmation." };

    } catch (err: any) {
      const msg = err?.message ?? "cancel_failed";
      if (cb) await cb.recordFailure().catch(() => {});

      // Check for "order not found" / "already closed" style errors
      const lower = msg.toLowerCase();
      if (lower.includes("unknown order") || lower.includes("not found") || lower.includes("does not exist")) {
        // Order no longer exists on exchange — mark as canceled
        intent.state = "CANCELED";
        intent.rejectCode = "USER_CANCELED";
        intent.rejectReason = `${reason} (exchange: order not found)`;
        intent.updatedAt = nowIso();
        await this.updateIntentState(intent.id, "CANCELED", {
          rejectCode: "USER_CANCELED",
          rejectReason: intent.rejectReason,
        });
        this.intentCache.set(intent.id, intent);
        await this.deduplicator.release(intent.userId, intent.clientOrderId);
        this.emitEvent(intent, "order.canceled", { reason: intent.rejectReason, cancelType: "not_found_on_exchange" });
        return { ok: true, intent };
      }

      this.emitEvent(intent, "error", { stage: "cancel_exchange", message: msg });
      return { ok: false, code: "EXCHANGE_ERROR", message: msg };
    }
  }

  /** Cancel all open intents for a user, optionally filtered. */
  async cancelAllIntents(
    userId: string,
    filter?: { exchangeAccountId?: string; venue?: string; symbol?: string },
  ): Promise<{ canceled: number; failed: number; results: Array<{ intentId: string; ok: boolean; code?: string }> }> {
    const { rows } = await pool.query(
      `SELECT * FROM order_intents WHERE user_id = $1 AND state IN ('ACCEPTED','QUEUED','SENT') ORDER BY created_at DESC`,
      [userId],
    );
    const intents = rows.map(rowToIntent).filter((intent) => {
      if (filter?.exchangeAccountId && intent.exchangeAccountId !== filter.exchangeAccountId) return false;
      if (filter?.venue && intent.venue !== filter.venue.toUpperCase()) return false;
      if (filter?.symbol && intent.symbolInternal !== filter.symbol.toUpperCase().replace(/[-_/]/g, "")) return false;
      return true;
    });

    const results: Array<{ intentId: string; ok: boolean; code?: string }> = [];
    let canceled = 0;
    let failed = 0;

    for (const intent of intents) {
      const result = await this.cancelIntent(intent.id, userId, "cancel_all");
      results.push({ intentId: intent.id, ok: result.ok, code: result.code });
      if (result.ok) canceled++;
      else failed++;
    }

    return { canceled, failed, results };
  }

  // ── Binance Cancel ──────────────────────────────────────────

  private async cancelBinanceOrder(
    creds: DecryptedCreds,
    intent: CoreIntentRecord,
    exchangeOrderId: string | null,
  ): Promise<{ success: boolean; finalStatus: string; filledQty: number | null; avgPrice: number | null }> {
    const base = "https://fapi.binance.com";
    const ts = this.timeSync.getAdjustedTimestamp("BINANCE");

    const params: Record<string, string> = {
      symbol: intent.symbolVenue,
      timestamp: String(ts),
      recvWindow: "10000",
    };

    // Prefer origClientOrderId, fallback to orderId
    if (intent.clientOrderId) {
      params.origClientOrderId = intent.clientOrderId;
    } else if (exchangeOrderId) {
      params.orderId = exchangeOrderId;
    } else {
      throw new Error("No clientOrderId or exchangeOrderId available for cancel");
    }

    const data = await this.binanceSigned<{
      orderId: number;
      status: string;
      executedQty: string;
      avgPrice: string;
      origClientOrderId: string;
    }>(base, "DELETE", "/fapi/v1/order", creds, params);

    return {
      success: true,
      finalStatus: data.status, // CANCELED, FILLED, etc.
      filledQty: Number(data.executedQty) || null,
      avgPrice: Number(data.avgPrice) || null,
    };
  }

  // ── Gate.io Cancel ──────────────────────────────────────────

  private async cancelGateOrder(
    creds: DecryptedCreds,
    intent: CoreIntentRecord,
    exchangeOrderId: string | null,
  ): Promise<{ success: boolean; finalStatus: string; filledQty: number | null; avgPrice: number | null }> {
    if (!exchangeOrderId) {
      throw new Error("No exchangeOrderId available for Gate.io cancel");
    }

    const base = "https://fx-api.gateio.ws";
    const path = `/api/v4/futures/usdt/orders/${exchangeOrderId}`;
    const ts = Math.floor(this.timeSync.getAdjustedTimestamp("GATEIO") / 1000);

    // Gate.io V4 cancel: DELETE with HMAC-SHA512
    const bodyHash = createHmac("sha512", "").update("").digest("hex");
    const signStr = `DELETE\n${path}\n\n${bodyHash}\n${ts}`;
    const signature = createHmac("sha512", creds.apiSecret).update(signStr).digest("hex");

    const res = await fetch(`${base}${path}`, {
      method: "DELETE",
      headers: {
        "KEY": creds.apiKey,
        "SIGN": signature,
        "Timestamp": String(ts),
        "Accept": "application/json",
      },
    });

    const text = await res.text();
    if (!res.ok) {
      let errMsg: string;
      try {
        const parsed = JSON.parse(text) as { label?: string; message?: string };
        errMsg = `Gate.io Cancel ${res.status}: ${parsed.message ?? text} (label: ${parsed.label ?? "?"})`;
      } catch {
        errMsg = `Gate.io Cancel ${res.status}: ${text.slice(0, 200)}`;
      }
      throw new Error(errMsg);
    }

    const data = JSON.parse(text) as {
      id: number;
      status: string;
      size: number;
      fill_price: string;
    };

    return {
      success: true,
      finalStatus: data.status === "finished" ? "FILLED" : data.status === "cancelled" ? "CANCELED" : data.status,
      filledQty: Math.abs(data.size) || null,
      avgPrice: Number(data.fill_price) || null,
    };
  }

  // ── Bybit V5 Signed Request ────────────────────────────────

  private async bybitSigned<T>(
    method: "GET" | "POST",
    path: string,
    creds: DecryptedCreds,
    body?: Record<string, unknown>,
    query?: Record<string, string>,
  ): Promise<T> {
    const ts = String(this.timeSync.getAdjustedTimestamp("BYBIT"));
    const recvWindow = "10000";
    const bodyStr = body ? JSON.stringify(body) : "";
    const queryStr = query ? new URLSearchParams(query).toString() : "";

    // Bybit V5 signing: HMAC-SHA256(secret, timestamp + apiKey + recvWindow + (queryString | body))
    const preSign = ts + creds.apiKey + recvWindow + (method === "GET" ? queryStr : bodyStr);
    const signature = createHmac("sha256", creds.apiSecret).update(preSign).digest("hex");

    const url = method === "GET" && queryStr
      ? `https://api.bybit.com${path}?${queryStr}`
      : `https://api.bybit.com${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        "X-BAPI-API-KEY": creds.apiKey,
        "X-BAPI-SIGN": signature,
        "X-BAPI-TIMESTAMP": ts,
        "X-BAPI-RECV-WINDOW": recvWindow,
        "Content-Type": "application/json",
      },
      body: method === "POST" ? bodyStr : undefined,
    });

    const text = await res.text();
    const parsed = JSON.parse(text) as { retCode: number; retMsg: string; result: T };
    if (parsed.retCode !== 0) {
      throw new Error(`Bybit API ${parsed.retCode}: ${parsed.retMsg}`);
    }
    return parsed.result;
  }

  // ── Bybit V5 Order Execution ─────────────────────────────────

  private async executeBybitOrder(creds: DecryptedCreds, intent: CoreIntentRecord): Promise<ExchangeOrderResult> {
    // Set leverage if specified
    if (intent.leverage != null && intent.leverage > 0) {
      try {
        await this.bybitSigned("POST", "/v5/position/set-leverage", creds, {
          category: "linear",
          symbol: intent.symbolVenue,
          buyLeverage: String(intent.leverage),
          sellLeverage: String(intent.leverage),
        });
      } catch {
        console.warn(`[ExchangeCore] Bybit leverage change failed for ${intent.symbolVenue}, continuing`);
      }
    }

    // Compute qty from notional if needed
    let qty = intent.qty;
    if ((!qty || qty <= 0) && intent.notionalUsdt != null && intent.notionalUsdt > 0) {
      try {
        const ticker = await this.bybitSigned<{ list: Array<{ lastPrice: string }> }>(
          "GET", "/v5/market/tickers", creds, undefined,
          { category: "linear", symbol: intent.symbolVenue },
        );
        const price = Number(ticker.list?.[0]?.lastPrice);
        if (price > 0) {
          const effectiveLeverage = intent.leverage ?? 3;
          qty = Math.floor((intent.notionalUsdt * effectiveLeverage / price) * 1000) / 1000;
        }
      } catch { /* price fetch failed */ }
      if (!qty || qty <= 0) throw new Error("Cannot compute order quantity — price unavailable");
    }

    const orderBody: Record<string, unknown> = {
      category: "linear",
      symbol: intent.symbolVenue,
      side: intent.side === "BUY" ? "Buy" : "Sell",
      orderType: intent.orderType === "MARKET" ? "Market" : "Limit",
      qty: String(qty),
      orderLinkId: intent.clientOrderId,
    };

    if (intent.orderType === "LIMIT" && intent.price != null) {
      orderBody.price = String(intent.price);
    }
    if (intent.timeInForce) {
      orderBody.timeInForce = intent.timeInForce === "POST_ONLY" ? "PostOnly" : intent.timeInForce;
    }
    if (intent.reduceOnly) {
      orderBody.reduceOnly = true;
    }

    const data = await this.bybitSigned<{
      orderId: string;
      orderLinkId: string;
    }>("POST", "/v5/order/create", creds, orderBody);

    return {
      orderId: data.orderId,
      status: "NEW",
      filledQty: null,
      avgPrice: null,
    };
  }

  // ── Bybit V5 Cancel ──────────────────────────────────────────

  private async cancelBybitOrder(
    creds: DecryptedCreds,
    intent: CoreIntentRecord,
    exchangeOrderId: string | null,
  ): Promise<{ success: boolean; finalStatus: string; filledQty: number | null; avgPrice: number | null }> {
    const cancelBody: Record<string, unknown> = {
      category: "linear",
      symbol: intent.symbolVenue,
    };
    if (exchangeOrderId) cancelBody.orderId = exchangeOrderId;
    else if (intent.clientOrderId) cancelBody.orderLinkId = intent.clientOrderId;
    else throw new Error("No orderId or orderLinkId for Bybit cancel");

    await this.bybitSigned("POST", "/v5/order/cancel", creds, cancelBody);

    // Bybit cancel returns success if accepted — query actual status
    try {
      const query = await this.bybitSigned<{ list: Array<{ orderStatus: string; cumExecQty: string; avgPrice: string }> }>(
        "GET", "/v5/order/realtime", creds, undefined,
        { category: "linear", symbol: intent.symbolVenue, orderId: exchangeOrderId ?? "", orderLinkId: intent.clientOrderId },
      );
      const order = query.list?.[0];
      if (order) {
        return {
          success: true,
          finalStatus: order.orderStatus === "Cancelled" ? "CANCELED" : order.orderStatus === "Filled" ? "FILLED" : order.orderStatus,
          filledQty: Number(order.cumExecQty) || null,
          avgPrice: Number(order.avgPrice) || null,
        };
      }
    } catch { /* query failed, assume canceled */ }

    return { success: true, finalStatus: "CANCELED", filledQty: null, avgPrice: null };
  }

  // ── OKX V5 Signed Request ────────────────────────────────────

  private async okxSigned<T>(
    method: "GET" | "POST",
    path: string,
    creds: DecryptedCreds,
    body?: Record<string, unknown>,
    query?: Record<string, string>,
  ): Promise<T> {
    const ts = new Date(this.timeSync.getAdjustedTimestamp("OKX")).toISOString();
    const bodyStr = body ? JSON.stringify(body) : "";
    const queryStr = query ? "?" + new URLSearchParams(query).toString() : "";

    // OKX V5 signing: Base64(HMAC-SHA256(secret, timestamp + method + requestPath + body))
    const preSign = ts + method + path + queryStr + bodyStr;
    const signature = createHmac("sha256", creds.apiSecret).update(preSign).digest("base64");

    const url = `https://www.okx.com${path}${queryStr}`;

    const res = await fetch(url, {
      method,
      headers: {
        "OK-ACCESS-KEY": creds.apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": creds.passphrase ?? "",
        "Content-Type": "application/json",
      },
      body: method === "POST" ? bodyStr : undefined,
    });

    const text = await res.text();
    const parsed = JSON.parse(text) as { code: string; msg: string; data: T };
    if (parsed.code !== "0") {
      throw new Error(`OKX API ${parsed.code}: ${parsed.msg}`);
    }
    return parsed.data;
  }

  // ── OKX V5 Order Execution ───────────────────────────────────

  private async executeOkxOrder(creds: DecryptedCreds, intent: CoreIntentRecord): Promise<ExchangeOrderResult> {
    // Set leverage if specified
    if (intent.leverage != null && intent.leverage > 0) {
      try {
        await this.okxSigned("POST", "/api/v5/account/set-leverage", creds, {
          instId: intent.symbolVenue,
          lever: String(intent.leverage),
          mgnMode: "cross",
        });
      } catch {
        console.warn(`[ExchangeCore] OKX leverage change failed for ${intent.symbolVenue}, continuing`);
      }
    }

    // Compute qty from notional if needed
    let sz = intent.qty;
    if ((!sz || sz <= 0) && intent.notionalUsdt != null && intent.notionalUsdt > 0) {
      try {
        const ticker = await this.okxSigned<Array<{ last: string }>>(
          "GET", "/api/v5/market/ticker", creds, undefined,
          { instId: intent.symbolVenue },
        );
        const price = Number(ticker?.[0]?.last);
        if (price > 0) {
          const effectiveLeverage = intent.leverage ?? 3;
          sz = Math.floor((intent.notionalUsdt * effectiveLeverage / price) * 1000) / 1000;
        }
      } catch { /* price fetch failed */ }
      if (!sz || sz <= 0) throw new Error("Cannot compute order quantity — price unavailable");
    }

    const orderBody: Record<string, unknown> = {
      instId: intent.symbolVenue,
      tdMode: "cross",
      side: intent.side.toLowerCase(),
      ordType: intent.orderType === "MARKET" ? "market" : "limit",
      sz: String(sz),
      clOrdId: intent.clientOrderId.slice(0, 32), // OKX max 32 chars
    };

    if (intent.orderType === "LIMIT" && intent.price != null) {
      orderBody.px = String(intent.price);
    }
    if (intent.reduceOnly) {
      orderBody.reduceOnly = true;
    }

    const data = await this.okxSigned<Array<{ ordId: string; clOrdId: string; sCode: string; sMsg: string }>>(
      "POST", "/api/v5/trade/order", creds, orderBody,
    );

    const result = data?.[0];
    if (!result || result.sCode !== "0") {
      throw new Error(`OKX order rejected: ${result?.sMsg ?? "unknown"} (code: ${result?.sCode ?? "?"})`);
    }

    return {
      orderId: result.ordId,
      status: "NEW",
      filledQty: null,
      avgPrice: null,
    };
  }

  // ── OKX V5 Cancel ────────────────────────────────────────────

  private async cancelOkxOrder(
    creds: DecryptedCreds,
    intent: CoreIntentRecord,
    exchangeOrderId: string | null,
  ): Promise<{ success: boolean; finalStatus: string; filledQty: number | null; avgPrice: number | null }> {
    const cancelBody: Record<string, unknown> = {
      instId: intent.symbolVenue,
    };
    if (exchangeOrderId) cancelBody.ordId = exchangeOrderId;
    if (intent.clientOrderId) cancelBody.clOrdId = intent.clientOrderId.slice(0, 32);
    if (!cancelBody.ordId && !cancelBody.clOrdId) throw new Error("No ordId or clOrdId for OKX cancel");

    const data = await this.okxSigned<Array<{ ordId: string; sCode: string; sMsg: string }>>(
      "POST", "/api/v5/trade/cancel-order", creds, cancelBody,
    );

    const result = data?.[0];
    if (!result || result.sCode !== "0") {
      throw new Error(`OKX cancel failed: ${result?.sMsg ?? "unknown"} (code: ${result?.sCode ?? "?"})`);
    }

    // Query actual status after cancel
    try {
      const orderData = await this.okxSigned<Array<{ state: string; accFillSz: string; avgPx: string }>>(
        "GET", "/api/v5/trade/order", creds, undefined,
        { instId: intent.symbolVenue, ordId: exchangeOrderId ?? result.ordId },
      );
      const order = orderData?.[0];
      if (order) {
        const stateMap: Record<string, string> = { canceled: "CANCELED", filled: "FILLED", live: "NEW", partially_filled: "PARTIALLY_FILLED" };
        return {
          success: true,
          finalStatus: stateMap[order.state] ?? order.state,
          filledQty: Number(order.accFillSz) || null,
          avgPrice: Number(order.avgPx) || null,
        };
      }
    } catch { /* query failed */ }

    return { success: true, finalStatus: "CANCELED", filledQty: null, avgPrice: null };
  }

  // ── Queue Helpers ───────────────────────────────────────────

  private removeFromQueue(intentId: string) {
    const iIdx = this.interactiveQueue.indexOf(intentId);
    if (iIdx >= 0) this.interactiveQueue.splice(iIdx, 1);
    const bIdx = this.batchQueue.indexOf(intentId);
    if (bIdx >= 0) this.batchQueue.splice(bIdx, 1);
  }

  // ── Venue Resolution ─────────────────────────────────────────

  private async resolveVenueAndAccount(
    userId: string,
    preference: TraderExchange,
    exchangeAccountId?: string,
  ): Promise<ResolveVenueResponse> {
    const rows = (await this.connections.listExchangeConnections(userId)).filter(
      (row) => row.enabled && row.status !== "FAILED",
    );
    if (!rows.length) {
      return {
        ok: false,
        code: "CONNECT_EXCHANGE_REQUIRED",
        reason: "No connected exchange account found. Connect Binance or Gate.io in Settings.",
      };
    }

    const byId = exchangeAccountId?.trim()
      ? rows.find((row) => row.id === exchangeAccountId.trim())
      : undefined;
    if (byId) {
      const venue = toVenueCode(byId.exchangeId);
      if (!venue) {
        return {
          ok: false,
          code: "UNSUPPORTED_EXCHANGE_ACCOUNT",
          reason: "Selected account is not Binance/Gate futures ready.",
        };
      }
      if (preference !== "AUTO" && preference !== venue) {
        return {
          ok: false,
          code: "ACCOUNT_EXCHANGE_MISMATCH",
          reason: `Selected account is ${toExchangeDisplay(venue)} but trader route is ${preference}.`,
        };
      }
      return { ok: true, venue, account: byId };
    }

    const pickVenue = (venue: "BINANCE" | "GATEIO"): ExchangeConnectionRecord | undefined => {
      const exchangeId = venue === "BINANCE" ? "binance" : "gate";
      return rows
        .filter((row) => row.exchangeId === exchangeId)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
    };

    if (preference === "BINANCE") {
      const account = pickVenue("BINANCE");
      if (!account) {
        return { ok: false, code: "BINANCE_NOT_CONNECTED", reason: "Binance account not connected or disabled." };
      }
      return { ok: true, venue: "BINANCE", account };
    }

    if (preference === "GATEIO") {
      const account = pickVenue("GATEIO");
      if (!account) {
        return { ok: false, code: "GATE_NOT_CONNECTED", reason: "Gate.io account not connected or disabled." };
      }
      return { ok: true, venue: "GATEIO", account };
    }

    const binancePrimary = pickVenue("BINANCE");
    if (binancePrimary) return { ok: true, venue: "BINANCE", account: binancePrimary };
    const gateFallback = pickVenue("GATEIO");
    if (gateFallback) return { ok: true, venue: "GATEIO", account: gateFallback };
    return {
      ok: false,
      code: "NO_SUPPORTED_EXCHANGE",
      reason: "No Binance/Gate.io account available for AUTO route.",
    };
  }
}
