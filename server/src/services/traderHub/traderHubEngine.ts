/**
 * TraderHubEngine — Bot orchestrator (CRUD + lifecycle).
 *
 * Refactored from tick-based scheduler to BullMQ-delegated architecture.
 * The engine no longer contains the scheduling loop or the scoring logic.
 * It owns:
 *   - createTrader / updateStatus / deleteTrader (CRUD with bot limit)
 *   - start / stop (lifecycle delegation to BotScheduler)
 *   - getMetrics (combined engine + queue metrics)
 *
 * Scheduling: BotScheduler (BullMQ)
 * Decision logic: botDecisionWorker.ts
 * Feature data: featureCache.ts (Redis, shared)
 */
import { randomUUID } from "node:crypto";
import { ExchangeCoreService } from "../exchangeCore/exchangeCoreService.ts";
import { BotScheduler } from "./botScheduler.ts";
import { createBotProcessor } from "./botDecisionWorker.ts";
import { TraderHubStore } from "./traderHubStore.ts";
import { batchResultWriter } from "./batchResultWriter.ts";
import { redis } from "../../db/redis.ts";
import { readFeature } from "./featureCache.ts";
import type {
  CoinPoolConfig,
  TraderAiModule,
  TraderHubMetrics,
  TraderRecord,
  TraderRunStatus,
  VirtualPosition,
} from "./types.ts";

const nowIso = () => new Date().toISOString();

const MAX_BOTS_PER_USER = Number(process.env.MAX_BOTS_PER_USER ?? 50);

const toStatus = (raw: string): TraderRunStatus => {
  const value = String(raw ?? "").toUpperCase();
  if (value === "RUNNING") return "RUNNING";
  if (value === "ERROR") return "ERROR";
  return "STOPPED";
};

interface TraderHubEngineOptions {
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
  coinPool?: CoinPoolConfig | null;
}

export class TraderHubEngine {
  private readonly store: TraderHubStore;
  private readonly scheduler: BotScheduler;
  private readonly exchangeCore: ExchangeCoreService | null;
  private started = false;

  constructor(
    store: TraderHubStore,
    scheduler: BotScheduler,
    options: TraderHubEngineOptions = {},
  ) {
    this.store = store;
    this.scheduler = scheduler;
    this.exchangeCore = options.exchangeCore ?? null;

    // Wire the BullMQ processor
    const processor = createBotProcessor(store, this.exchangeCore);
    scheduler.setProcessor(processor);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    batchResultWriter.start();
    await this.scheduler.start();
    console.log("[TraderHubEngine] Started (BullMQ scheduler + batch writer)");
  }

  stop(): void {
    this.started = false;
    batchResultWriter.stop();
    void this.scheduler.stop();
  }

  async createTrader(input: CreateTraderInput): Promise<TraderRecord> {
    // Per-user bot limit
    const count = await this.store.countByUser(input.userId);
    if (count >= MAX_BOTS_PER_USER) {
      throw new Error(`Bot limit reached (${MAX_BOTS_PER_USER} per user)`);
    }

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
      symbol: input.symbol === "MULTI" ? "MULTI" : (input.symbol.endsWith("USDT") ? input.symbol : `${input.symbol}USDT`),
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
      coinPool: input.coinPool ?? null,
    };
    const saved = await this.store.upsert(row);

    // Immediately enqueue in BullMQ
    await this.scheduler.enqueue(saved);

    return saved;
  }

  async listByUser(userId: string): Promise<TraderRecord[]> {
    return this.store.listByUser(userId);
  }

  async listAll(): Promise<TraderRecord[]> {
    return this.store.listAll();
  }

  async updateStatus(id: string, status: TraderRunStatus): Promise<TraderRecord | null> {
    const result = await this.store.patch(id, {
      status: toStatus(status),
      lastError: "",
      failStreak: 0,
      nextRunAt: nowIso(),
    });

    if (result) {
      if (status === "RUNNING") {
        // Re-enqueue when resumed
        await this.scheduler.enqueue(result);
      } else {
        // Remove from queue when stopped
        await this.scheduler.remove(id);
      }
    }

    return result;
  }

  async listBotScans(botId: string, limit = 100) {
    return this.store.listScansByBot(botId, limit);
  }

  async deleteTrader(id: string): Promise<boolean> {
    await this.scheduler.remove(id);
    return this.store.remove(id);
  }

  /**
   * Take Profit — manually close a virtual position for a specific symbol.
   * Reads current price from feature cache, calculates realized PnL,
   * removes position from Redis, updates cumulative PnL stats,
   * and writes an analytics row to bot_decisions.
   */
  async takeProfit(traderId: string, symbol: string): Promise<{
    success: boolean;
    symbol: string;
    side: string;
    entryPrice: number;
    exitPrice: number;
    pnlPct: number;
    message: string;
  }> {
    const VPOS_KEY_PREFIX = "trader:vpos:";
    const VPOS_TTL_SEC = 86400 * 7;

    // 1. Read trader record
    const traders = await this.store.listAll();
    const trader = traders.find((t) => t.id === traderId);
    if (!trader) throw new Error("Trader not found");

    // 2. Read virtual positions from Redis
    const raw = await redis.get(VPOS_KEY_PREFIX + traderId);
    const positions: VirtualPosition[] = raw ? JSON.parse(raw) : [];

    // 3. Find the position for this symbol
    const posIndex = positions.findIndex((p) => p.symbol === symbol);
    if (posIndex === -1) throw new Error(`No open position for ${symbol}`);
    const pos = positions[posIndex];

    // 4. Read current price from feature cache
    const feat = await readFeature(symbol);
    if (!feat) throw new Error(`No price data for ${symbol}`);
    const exitPrice = feat.price;

    // 5. Calculate realized PnL
    const pnlPct = pos.side === "LONG"
      ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - exitPrice) / pos.entryPrice) * 100;
    const roundedPnl = Math.round(pnlPct * 10000) / 10000;

    // 6. Remove position from Redis
    positions.splice(posIndex, 1);
    if (positions.length === 0) {
      await redis.del(VPOS_KEY_PREFIX + traderId);
    } else {
      await redis.set(VPOS_KEY_PREFIX + traderId, JSON.stringify(positions), "EX", VPOS_TTL_SEC);
    }

    // 7. Update cumulative PnL on trader stats
    const cumulativePnl = (trader.stats.pnlPct || 0) + roundedPnl;
    await this.store.patch(traderId, {
      stats: { ...trader.stats, pnlPct: Math.round(cumulativePnl * 10000) / 10000 },
    });

    // 8. Write analytics row to bot_decisions (take profit event)
    batchResultWriter.enqueueAnalytics({
      time: nowIso(),
      botId: traderId,
      userId: trader.userId,
      symbol,
      strategyId: trader.strategyId,
      decision: "TRADE",
      scorePct: 0,
      bias: pos.side,
      execState: "TAKE_PROFIT",
      dataStale: false,
      pnlPct: roundedPnl,
    });

    console.log(`[TakeProfit] ${trader.name}: ${symbol} ${pos.side} entry=${pos.entryPrice} exit=${exitPrice} pnl=${roundedPnl.toFixed(2)}%`);

    return {
      success: true,
      symbol,
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice,
      pnlPct: roundedPnl,
      message: `Closed ${pos.side} ${symbol} @ ${exitPrice} — PnL: ${roundedPnl >= 0 ? "+" : ""}${roundedPnl.toFixed(2)}%`,
    };
  }

  /**
   * Get open virtual positions for a trader from Redis.
   */
  async getOpenPositions(traderId: string): Promise<VirtualPosition[]> {
    const VPOS_KEY_PREFIX = "trader:vpos:";
    const raw = await redis.get(VPOS_KEY_PREFIX + traderId);
    if (!raw) return [];
    try { return JSON.parse(raw) as VirtualPosition[]; } catch { return []; }
  }

  /** Detailed BotScheduler metrics including DLQ, priority split (for Mission Control). */
  async getSchedulerMetrics(): Promise<{
    waiting: number; active: number; delayed: number; failed: number;
    dlqSize: number; priorityHigh: number; priorityNormal: number;
  } | null> {
    try {
      return await this.scheduler.getMetrics();
    } catch {
      return null;
    }
  }

  async getMetrics(): Promise<TraderHubMetrics> {
    const all = await this.store.listAll();
    const running = all.filter((row) => row.status === "RUNNING").length;
    const errored = all.filter((row) => row.status === "ERROR").length;
    const stopped = all.filter((row) => row.status === "STOPPED").length;

    // Get BullMQ queue metrics
    let queueMetrics = { waiting: 0, active: 0, delayed: 0, failed: 0 };
    try {
      queueMetrics = await this.scheduler.getMetrics();
    } catch {
      // best-effort
    }

    return {
      started: this.started,
      inFlightJobs: queueMetrics.active,
      lastTickAt: nowIso(),
      totalTraders: all.length,
      runningTraders: running,
      stoppedTraders: stopped,
      errorTraders: errored,
      maxConcurrentJobs: 64,
      shardCount: 0, // deprecated — BullMQ doesn't use shards
      queueWaiting: queueMetrics.waiting,
      queueDelayed: queueMetrics.delayed,
      queueFailed: queueMetrics.failed,
    };
  }
}
