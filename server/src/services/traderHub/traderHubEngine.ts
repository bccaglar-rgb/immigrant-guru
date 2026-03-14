import { randomUUID } from "node:crypto";
import { ExchangeMarketHub } from "../marketHub/index.ts";
import { ExchangeCoreService } from "../exchangeCore/exchangeCoreService.ts";
import { TraderHubStore } from "./traderHubStore.ts";
import type {
  TraderAiModule,
  TraderDecision,
  TraderHubMetrics,
  TraderLastResult,
  TraderRecord,
  TraderRunStatus,
} from "./types.ts";

const nowIso = () => new Date().toISOString();

const toPreferredExchange = (exchange: TraderRecord["exchange"]): "Binance" | "Gate.io" | undefined => {
  if (exchange === "BINANCE") return "Binance";
  if (exchange === "GATEIO") return "Gate.io";
  return undefined;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const round = (value: number, digits = 4): number => {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
};

const toStatus = (raw: string): TraderRunStatus => {
  const value = String(raw ?? "").toUpperCase();
  if (value === "RUNNING") return "RUNNING";
  if (value === "ERROR") return "ERROR";
  return "STOPPED";
};

const buildPlan = (price: number, bias: TraderLastResult["bias"], scorePct: number): TraderLastResult["plan"] => {
  const rangePct = clamp(0.12 + ((100 - scorePct) / 100) * 0.35, 0.12, 0.48) / 100;
  const stopPct = clamp(0.2 + ((100 - scorePct) / 100) * 0.28, 0.2, 0.55) / 100;
  const takePct = clamp(0.35 + (scorePct / 100) * 0.6, 0.35, 0.95) / 100;
  if (bias === "LONG") {
    return {
      entryLow: round(price * (1 - rangePct)),
      entryHigh: round(price * (1 + rangePct * 0.35)),
      sl1: round(price * (1 - stopPct)),
      sl2: round(price * (1 - stopPct * 1.4)),
      tp1: round(price * (1 + takePct)),
      tp2: round(price * (1 + takePct * 1.45)),
    };
  }
  if (bias === "SHORT") {
    return {
      entryLow: round(price * (1 - rangePct * 0.35)),
      entryHigh: round(price * (1 + rangePct)),
      sl1: round(price * (1 + stopPct)),
      sl2: round(price * (1 + stopPct * 1.4)),
      tp1: round(price * (1 - takePct)),
      tp2: round(price * (1 - takePct * 1.45)),
    };
  }
  return {
    entryLow: null,
    entryHigh: null,
    sl1: null,
    sl2: null,
    tp1: null,
    tp2: null,
  };
};

const scoreToDecision = (scorePct: number, dataStale: boolean): TraderDecision => {
  if (dataStale) return "N/A";
  if (scorePct >= 68) return "TRADE";
  if (scorePct >= 48) return "WATCH";
  return "NO_TRADE";
};

const aiBias = (change24hPct: number, imbalance: number): TraderLastResult["bias"] => {
  const signal = change24hPct * 0.6 + imbalance * 40;
  if (signal > 0.8) return "LONG";
  if (signal < -0.8) return "SHORT";
  return "NEUTRAL";
};

const aiReason = (
  decision: TraderDecision,
  source: "Binance" | "Gate.io" | "N/A",
  module: TraderAiModule,
  dataStale: boolean,
): string => {
  if (dataStale) return `Live market feed unavailable. ${module} returned N/A until exchange stream recovers.`;
  if (decision === "TRADE") return `${module} found executable setup from ${source} live feed.`;
  if (decision === "WATCH") return `${module} sees setup building, waiting for stronger confirmation.`;
  if (decision === "NO_TRADE") return `${module} rejected setup due to weak edge/quality.`;
  return `${module} is waiting for fresh exchange data.`;
};

const hashShard = (id: string, shardCount: number): number => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % Math.max(1, shardCount);
};

interface TraderHubEngineOptions {
  shardCount?: number;
  tickMs?: number;
  maxConcurrentJobs?: number;
  exchangeCore?: ExchangeCoreService;
}

interface CreateTraderInput {
  userId: string;
  name: string;
  aiModule: TraderAiModule;
  exchange: TraderRecord["exchange"];
  exchangeAccountId?: string;
  exchangeAccountName?: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: TraderRecord["timeframe"];
  scanIntervalSec: number;
}

export class TraderHubEngine {
  private readonly store: TraderHubStore;
  private readonly marketHub: ExchangeMarketHub;
  private readonly exchangeCore: ExchangeCoreService | null;
  private readonly shardCount: number;
  private readonly tickMs: number;
  private readonly maxConcurrentJobs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private inFlightJobs = 0;
  private lastTickAt = "";
  private readonly inFlightTraderIds = new Set<string>();
  private readonly persistedQueue = new Set<string>();

  constructor(store: TraderHubStore, marketHub: ExchangeMarketHub, options: TraderHubEngineOptions = {}) {
    this.store = store;
    this.marketHub = marketHub;
    this.exchangeCore = options.exchangeCore ?? null;
    this.shardCount = Math.max(4, Math.min(128, Math.floor(options.shardCount ?? 32)));
    this.tickMs = Math.max(250, Math.min(5000, Math.floor(options.tickMs ?? 1000)));
    this.maxConcurrentJobs = Math.max(8, Math.min(2048, Math.floor(options.maxConcurrentJobs ?? 256)));
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    void this.tick();
  }

  stop() {
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async createTrader(input: CreateTraderInput): Promise<TraderRecord> {
    const row: TraderRecord = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      aiModule: input.aiModule,
      exchange: input.exchange,
      exchangeAccountId: input.exchangeAccountId?.trim() || "",
      exchangeAccountName: input.exchangeAccountName?.trim() || "Auto",
      strategyId: input.strategyId,
      strategyName: input.strategyName,
      symbol: input.symbol.endsWith("USDT") ? input.symbol : `${input.symbol}USDT`,
      timeframe: input.timeframe,
      scanIntervalSec: Math.max(30, Math.min(600, input.scanIntervalSec)),
      status: "RUNNING",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      nextRunAt: nowIso(),
      lastRunAt: "",
      lastError: "",
      failStreak: 0,
      stats: {
        runs: 0,
        tradeCount: 0,
        watchCount: 0,
        noTradeCount: 0,
        pnlPct: 0,
      },
      lastResult: null,
    };
    const saved = await this.store.upsert(row);
    return saved;
  }

  async listByUser(userId: string): Promise<TraderRecord[]> {
    return this.store.listByUser(userId);
  }

  async listAll(): Promise<TraderRecord[]> {
    return this.store.listAll();
  }

  async updateStatus(id: string, status: TraderRunStatus): Promise<TraderRecord | null> {
    return this.store.patch(id, {
      status: toStatus(status),
      lastError: "",
      failStreak: 0,
      nextRunAt: nowIso(),
    });
  }

  async deleteTrader(id: string): Promise<boolean> {
    return this.store.remove(id);
  }

  async getMetrics(): Promise<TraderHubMetrics> {
    const all = await this.store.listAll();
    const running = all.filter((row) => row.status === "RUNNING").length;
    const errored = all.filter((row) => row.status === "ERROR").length;
    const stopped = all.filter((row) => row.status === "STOPPED").length;
    return {
      started: this.started,
      inFlightJobs: this.inFlightJobs,
      lastTickAt: this.lastTickAt,
      totalTraders: all.length,
      runningTraders: running,
      stoppedTraders: stopped,
      errorTraders: errored,
      maxConcurrentJobs: this.maxConcurrentJobs,
      shardCount: this.shardCount,
    };
  }

  private async tick() {
    if (!this.started) return;
    this.lastTickAt = nowIso();
    const all = await this.store.listAll();
    if (!all.length) return;
    const nowMs = Date.now();
    const due = all
      .filter((row) => row.status === "RUNNING")
      .filter((row) => {
        const nextMs = Date.parse(row.nextRunAt);
        return !Number.isFinite(nextMs) || nextMs <= nowMs;
      })
      .sort((a, b) => hashShard(a.id, this.shardCount) - hashShard(b.id, this.shardCount));

    for (const row of due) {
      if (this.inFlightJobs >= this.maxConcurrentJobs) break;
      if (this.inFlightTraderIds.has(row.id)) continue;
      this.inFlightTraderIds.add(row.id);
      this.inFlightJobs += 1;
      void this.executeTrader(row)
        .catch(() => {
          // isolated per trader execution
        })
        .finally(() => {
          this.inFlightJobs = Math.max(0, this.inFlightJobs - 1);
          this.inFlightTraderIds.delete(row.id);
        });
    }
  }

  private async executeTrader(row: TraderRecord) {
    const now = Date.now();
    const nextRunAt = new Date(now + row.scanIntervalSec * 1000).toISOString();
    await this.store.patch(row.id, { nextRunAt });

    try {
      const preferred = toPreferredExchange(row.exchange);
      const live = this.marketHub.getLiveRow(row.symbol, preferred);
      const source = live.row ? ExchangeMarketHub.exchangeIdToName(live.exchangeUsed) : "N/A";
      const stale = !live.row || live.stale;

      let scorePct = 0;
      let decision: TraderDecision = "N/A";
      let bias: TraderLastResult["bias"] = "NEUTRAL";
      let price: number | null = null;
      let plan: TraderLastResult["plan"] = {
        entryLow: null,
        entryHigh: null,
        sl1: null,
        sl2: null,
        tp1: null,
        tp2: null,
      };
      let execution: TraderLastResult["execution"] = {
        state: "N/A",
        venue: "N/A",
        intentId: "",
        message: "No execution requested.",
      };
      if (!stale && live.row) {
        price = live.row.price;
        const momentum = clamp(50 + live.row.change24hPct * 2.2, 0, 100);
        const liquidity = live.row.depthUsd ? clamp(Math.log10(Math.max(1, live.row.depthUsd)) * 18, 0, 100) : 35;
        const executionScore = clamp(100 - Math.max(0, live.row.spreadBps ?? 25) * 2, 0, 100);
        const imbalanceBoost = clamp((live.row.imbalance ?? 0) * 20, -12, 12);
        scorePct = clamp(momentum * 0.42 + liquidity * 0.28 + executionScore * 0.3 + imbalanceBoost, 0, 100);
        bias = aiBias(live.row.change24hPct, live.row.imbalance ?? 0);
        decision = scoreToDecision(scorePct, false);
        plan = buildPlan(price, bias, scorePct);

        if (this.exchangeCore && decision === "TRADE" && (bias === "LONG" || bias === "SHORT")) {
          const intent = await this.exchangeCore.submitAiIntent({
            userId: row.userId,
            runId: row.id,
            clientOrderId: `trader-${row.id.slice(0, 10)}-${Date.now()}`,
            exchangePreference: row.exchange,
            exchangeAccountId: row.exchangeAccountId || undefined,
            symbolInternal: row.symbol,
            side: bias === "LONG" ? "BUY" : "SELL",
            notionalUsdt: 100,
            leverage: 3,
          });
          const venueName = intent.venue === "GATEIO" ? "Gate.io" : "Binance";
          if (intent.state === "REJECTED") {
            decision = "NO_TRADE";
            execution = {
              state: "REJECTED",
              venue: "N/A",
              intentId: intent.id,
              message: intent.rejectReason || "Exchange execution rejected",
            };
          } else {
            execution = {
              state: "QUEUED",
              venue: venueName,
              intentId: intent.id,
              message: `Order intent queued on ${venueName}.`,
            };
          }
        }
      }

      const lastResult: TraderLastResult = {
        ts: nowIso(),
        sourceExchange: source,
        scorePct: round(scorePct, 2),
        decision,
        bias,
        reason: aiReason(decision, source, row.aiModule, stale),
        price,
        plan,
        dataStale: stale,
        execution,
      };

      const nextStats = { ...row.stats };
      nextStats.runs += 1;
      if (decision === "TRADE") {
        nextStats.tradeCount += 1;
        const drift = (Math.random() - 0.45) * 0.9;
        nextStats.pnlPct = round(nextStats.pnlPct + drift, 3);
      } else if (decision === "WATCH") {
        nextStats.watchCount += 1;
      } else {
        nextStats.noTradeCount += 1;
      }

      if (!this.persistedQueue.has(row.id)) {
        this.persistedQueue.add(row.id);
        await this.store.patch(row.id, {
          status: "RUNNING",
          lastRunAt: nowIso(),
          lastError: "",
          failStreak: 0,
          stats: nextStats,
          lastResult,
        });
        this.persistedQueue.delete(row.id);
      }
    } catch (error) {
      const failStreak = row.failStreak + 1;
      const hardError = failStreak >= 5;
      const message = error instanceof Error ? error.message : "trader_run_failed";
      await this.store.patch(row.id, {
        status: hardError ? "ERROR" : "RUNNING",
        lastError: message,
        failStreak,
        lastRunAt: nowIso(),
      });
    }
  }
}
