/**
 * BotScheduler — BullMQ-based job scheduler for bot decisions.
 *
 * Replaces the tick-based loop in TraderHubEngine that loaded ALL traders
 * from DB every second. Instead, each bot schedules its own next run as a
 * BullMQ delayed job. This scales to 30K+ bots on a single Redis instance.
 *
 * Flow:
 *   1. seedFromDb() → picks due RUNNING traders → enqueues them
 *   2. Worker processes each job (BotDecisionWorker)
 *   3. On completion → scheduleNextRun() → delayed job in BullMQ
 *   4. reseed() every 30s → picks up any missed bots (crash recovery)
 *
 * Duplicate prevention: jobId = `bot-${traderId}` (BullMQ deduplicates by ID)
 */
import { Queue, Worker } from "bullmq";
import type { Job, Processor } from "bullmq";
import type { TraderHubStore } from "./traderHubStore.ts";

const QUEUE_NAME = "bot-decisions";
const DEFAULT_CONCURRENCY = 64;
const RESEED_INTERVAL_MS = 30_000;
const RESEED_BATCH_SIZE = 200;

export interface BotJobData {
  traderId: string;
  userId: string;
  symbol: string;
  scanIntervalSec: number;
}

export interface BotJobResult {
  decision: string;
  scorePct: number;
  executionState?: string;
}

// ── Redis connection config (reuse same Redis as the app) ──
const redisConnection = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null as null, // BullMQ requires this
};

export class BotScheduler {
  private queue: Queue<BotJobData, BotJobResult>;
  private worker: Worker<BotJobData, BotJobResult> | null = null;
  private store: TraderHubStore;
  private processor: Processor<BotJobData, BotJobResult> | null = null;
  private reseedTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(store: TraderHubStore) {
    this.store = store;
    this.queue = new Queue<BotJobData, BotJobResult>(QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }

  /** Set the function that processes each bot decision. Must be called before start(). */
  setProcessor(fn: Processor<BotJobData, BotJobResult>): void {
    this.processor = fn;
  }

  /**
   * Start the BullMQ worker. Call ONLY on primary worker (Worker 0).
   * Seed queue with due bots, then start the reseed timer.
   */
  async start(): Promise<void> {
    if (this.started) return;
    if (!this.processor) throw new Error("[BotScheduler] Processor not set — call setProcessor() first");

    this.started = true;

    this.worker = new Worker<BotJobData, BotJobResult>(
      QUEUE_NAME,
      this.processor,
      {
        connection: redisConnection,
        concurrency: DEFAULT_CONCURRENCY,
      },
    );

    this.worker.on("completed", (job: Job<BotJobData, BotJobResult> | undefined) => {
      if (!job) return;
      void this.scheduleNextRun(job.data.traderId, job.data.scanIntervalSec);
    });

    this.worker.on("failed", (job: Job<BotJobData, BotJobResult> | undefined, err: Error) => {
      if (!job) return;
      console.error(`[BotScheduler] Job failed for trader ${job.data.traderId}:`, err.message);
      // Re-schedule with a 60s backoff on failure
      void this.scheduleNextRun(job.data.traderId, 60);
    });

    // Seed from DB on startup
    await this.seedFromDb();

    // Periodic reseed to catch stragglers (crash recovery, etc.)
    this.reseedTimer = setInterval(() => void this.reseed(), RESEED_INTERVAL_MS);

    console.log(`[BotScheduler] Started — concurrency=${DEFAULT_CONCURRENCY}, reseed=${RESEED_INTERVAL_MS / 1000}s`);
  }

  /** Stop the worker and close queue. */
  async stop(): Promise<void> {
    this.started = false;
    if (this.reseedTimer) {
      clearInterval(this.reseedTimer);
      this.reseedTimer = null;
    }
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.queue.close();
  }

  /** Enqueue a single bot for immediate or delayed processing. */
  async enqueue(trader: { id: string; userId: string; symbol: string; scanIntervalSec: number }, delaySec = 0): Promise<void> {
    try {
      await this.queue.add(
        `bot:${trader.id}`,
        {
          traderId: trader.id,
          userId: trader.userId,
          symbol: trader.symbol,
          scanIntervalSec: trader.scanIntervalSec,
        },
        {
          delay: delaySec > 0 ? delaySec * 1000 : 0,
          jobId: `bot-${trader.id}`, // prevents duplicate jobs for same bot
        },
      );
    } catch (err: any) {
      // Duplicate job ID → already in queue, which is fine
      if (err?.message?.includes("already exists")) return;
      console.error(`[BotScheduler] Failed to enqueue bot ${trader.id}:`, err?.message ?? err);
    }
  }

  /** Remove a bot from the queue (e.g. when deleted or stopped). */
  async remove(traderId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(`bot-${traderId}`);
      if (job) {
        await job.remove();
      }
    } catch {
      // best-effort
    }
  }

  /** Get queue metrics for monitoring. */
  async getMetrics(): Promise<{
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
  }> {
    const [waiting, active, delayed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getDelayedCount(),
      this.queue.getFailedCount(),
    ]);
    return { waiting, active, delayed, failed };
  }

  // ── Internal ──

  /** Seed the queue with all due RUNNING bots from DB. */
  private async seedFromDb(): Promise<void> {
    try {
      const dueTraders = await this.store.listDue(500);
      let enqueued = 0;
      for (const trader of dueTraders) {
        await this.enqueue(trader);
        enqueued++;
      }
      if (enqueued > 0) {
        console.log(`[BotScheduler] Seeded ${enqueued} due bots from DB`);
      }
    } catch (err: any) {
      console.error("[BotScheduler] Seed failed:", err?.message ?? err);
    }
  }

  /** Periodic reseed: pick up bots whose jobs might have been lost. */
  private async reseed(): Promise<void> {
    try {
      const dueTraders = await this.store.listDue(RESEED_BATCH_SIZE);
      for (const trader of dueTraders) {
        await this.enqueue(trader);
      }
    } catch {
      // best-effort
    }
  }

  /** Schedule the next run for a bot after completion/failure. */
  private async scheduleNextRun(traderId: string, intervalSec: number): Promise<void> {
    try {
      const trader = await this.store.getById(traderId);
      if (!trader || trader.status !== "RUNNING") return;

      const nextRunAt = new Date(Date.now() + intervalSec * 1000).toISOString();
      await this.store.patchSchedule(traderId, nextRunAt);

      await this.queue.add(
        `bot:${traderId}`,
        {
          traderId,
          userId: trader.userId,
          symbol: trader.symbol,
          scanIntervalSec: trader.scanIntervalSec,
        },
        {
          delay: intervalSec * 1000,
          jobId: `bot-${traderId}`,
        },
      );
    } catch (err: any) {
      // Duplicate job → already scheduled. Other errors logged.
      if (!err?.message?.includes("already exists")) {
        console.error(`[BotScheduler] scheduleNextRun failed for ${traderId}:`, err?.message ?? err);
      }
    }
  }
}
