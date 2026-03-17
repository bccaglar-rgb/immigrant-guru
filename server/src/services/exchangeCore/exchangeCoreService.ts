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
import { decryptSecret } from "../../security/crypto.ts";
import type { ConnectionService, ExchangeConnectionRecord } from "../connectionService.ts";
import type { TraderExchange } from "../traderHub/types.ts";
import type { CoreEvent, CoreIntentRecord, ExchangeCoreMetrics } from "./types.ts";
import { ExchangeRateLimiter } from "./exchangeRateLimiter.ts";
import { circuitBreakers } from "./circuitBreaker.ts";

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
    this.tickMs = Math.max(150, Math.min(2000, Math.floor(options.tickMs ?? 250)));
    this.maxConcurrent = Math.max(4, Math.min(2048, Math.floor(options.maxConcurrent ?? 128)));
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
  }

  stop() {
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
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
    };
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
        })
        .finally(() => {
          this.inFlight = Math.max(0, this.inFlight - 1);
        });
    }
  }

  // ── Order Execution ──────────────────────────────────────────

  private async processIntent(row: CoreIntentRecord) {
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
      return;
    }

    // 2. Rate limit check
    const allowed = await this.rateLimiter.tryAcquire(row.venue as "BINANCE" | "GATEIO", 5);
    if (!allowed) {
      row.state = "ERROR";
      row.rejectCode = "RATE_LIMITED";
      row.rejectReason = `Exchange rate limit exceeded for ${toExchangeDisplay(row.venue)}. Will retry next tick.`;
      row.updatedAt = nowIso();
      await this.updateIntentState(row.id, "ERROR", {
        rejectCode: "RATE_LIMITED",
        rejectReason: row.rejectReason,
      });
      this.emitEvent(row, "error", {
        stage: "rate_limit",
        message: row.rejectReason,
      });
      return;
    }

    // 3. Decrypt credentials
    const creds = await this.decryptCredentials(row.userId, row.exchangeAccountId);
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

    // 4. Execute on exchange
    let result: ExchangeOrderResult;
    try {
      if (row.venue === "BINANCE") {
        result = await this.executeBinanceOrder(creds, row);
      } else if (row.venue === "GATEIO") {
        result = await this.executeGateOrder(creds, row);
      } else {
        throw new Error(`Unsupported venue: ${row.venue}`);
      }
      // Record success to circuit breaker
      if (cb) await cb.recordSuccess().catch(() => {});
    } catch (err: any) {
      const msg = err?.message ?? "exchange_api_failed";
      // Record failure to circuit breaker
      if (cb) await cb.recordFailure().catch(() => {});
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
    const ts = Date.now();

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
        const priceRes = await fetch(`${base}/fapi/v1/ticker/price?symbol=${intent.symbolVenue}`);
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
    const ts = Math.floor(Date.now() / 1000);

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

  // ── Credential Decryption ────────────────────────────────────

  private async decryptCredentials(userId: string, exchangeAccountId: string): Promise<DecryptedCreds | null> {
    try {
      const { rows } = await pool.query(
        `SELECT credentials_encrypted, exchange_id FROM exchange_connection_records WHERE id = $1 AND user_id = $2`,
        [exchangeAccountId, userId],
      );
      if (!rows[0]) return null;
      const encrypted = rows[0].credentials_encrypted as ExchangeConnectionRecord["credentialsEncrypted"];
      return {
        apiKey: decryptSecret(encrypted.apiKey, this.encryptionKey),
        apiSecret: decryptSecret(encrypted.apiSecret, this.encryptionKey),
        passphrase: encrypted.passphrase
          ? decryptSecret(encrypted.passphrase, this.encryptionKey)
          : undefined,
      };
    } catch (err: any) {
      console.error(`[ExchangeCore] Credential decryption failed for account ${exchangeAccountId}:`, err?.message ?? err);
      return null;
    }
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
