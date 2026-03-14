import { randomUUID } from "node:crypto";
import type { ConnectionService, ExchangeConnectionRecord } from "../connectionService.ts";
import type { TraderExchange } from "../traderHub/types.ts";
import type { CoreEvent, CoreIntentRecord, ExchangeCoreMetrics } from "./types.ts";

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

export class ExchangeCoreService {
  private readonly connections: ConnectionService;
  private readonly tickMs: number;
  private readonly maxConcurrent: number;
  private started = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = 0;
  private lastTickAt = "";

  private readonly interactiveQueue: string[] = [];
  private readonly batchQueue: string[] = [];
  private readonly intents = new Map<string, CoreIntentRecord>();
  private readonly events: CoreEvent[] = [];
  private readonly maxEvents = 5000;

  constructor(connections: ConnectionService, options: ExchangeCoreOptions = {}) {
    this.connections = connections;
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
      intentsTotal: this.intents.size,
      eventsTotal: this.events.length,
      lastTickAt: this.lastTickAt,
    };
  }

  listIntentsByUser(userId: string): CoreIntentRecord[] {
    return [...this.intents.values()]
      .filter((row) => row.userId === userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  listEventsByUser(userId: string): CoreEvent[] {
    return this.events.filter((event) => event.scope.userId === userId);
  }

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
      this.intents.set(rejected.id, rejected);
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
    this.intents.set(row.id, row);
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
      const row = this.intents.get(nextId);
      if (!row || row.state === "REJECTED" || row.state === "DONE") continue;
      this.inFlight += 1;
      void this.processIntent(row)
        .catch((err) => {
          const message = err instanceof Error ? err.message : "intent_process_failed";
          const failed = this.intents.get(row.id);
          if (!failed) return;
          failed.state = "ERROR";
          failed.rejectCode = "PROCESS_ERROR";
          failed.rejectReason = message;
          failed.updatedAt = nowIso();
          this.emitEvent(failed, "error", {
            stage: "exchange_core.process",
            message,
          });
        })
        .finally(() => {
          this.inFlight = Math.max(0, this.inFlight - 1);
        });
    }
  }

  private async processIntent(row: CoreIntentRecord) {
    row.state = "SENT";
    row.updatedAt = nowIso();
    const orderId = `${row.venue.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 10_000)}`;
    this.emitEvent(row, "order.sent", {
      exchangeOrderId: orderId,
      symbol: row.symbolInternal,
      venue: row.venue,
      exchange: toExchangeDisplay(row.venue),
      orderType: row.orderType,
      side: row.side,
    });

    row.state = "DONE";
    row.updatedAt = nowIso();
    this.emitEvent(row, "order.update", {
      exchangeOrderId: orderId,
      status: "FILLED",
      filledQty: row.qty ?? null,
      avgFillPrice: row.price ?? null,
    });
  }

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

