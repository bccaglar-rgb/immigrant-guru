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
import type {
  TraderAiModule,
  TraderHubMetrics,
  TraderRecord,
  TraderRunStatus,
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

  async deleteTrader(id: string): Promise<boolean> {
    await this.scheduler.remove(id);
    return this.store.remove(id);
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
