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
 *
 * V2 improvements:
 *   - Dead letter queue (DLQ) after MAX_CONSECUTIVE_FAILURES
 *   - Per-job execution timeout (30s default)
 *   - Per-plan concurrency budget (Explorer=0, Trader=4, Strategist=16, Titan=64)
 *   - Consecutive failure tracking in Redis
 */
import { Queue, Worker } from "bullmq";
import type { Job, Processor } from "bullmq";
import type { TraderHubStore } from "./traderHubStore.ts";
import { getBullMQConnection } from "../../db/redis.ts";
import { redisControl } from "../../db/redis.ts";

const QUEUE_NAME = "bot-decisions";
const DLQ_QUEUE_NAME = "bot-decisions-dlq";
const DEFAULT_CONCURRENCY = 64;
const RESEED_INTERVAL_MS = 30_000;
const RESEED_BATCH_SIZE = 200;
const JOB_TIMEOUT_MS = 30_000;          // 30s per job execution
const MAX_CONSECUTIVE_FAILURES = 5;      // → move to DLQ after 5 consecutive failures
const FAILURE_COUNTER_TTL = 3600;        // Reset failure counter after 1h of silence

// Priority levels: lower number = higher priority (BullMQ convention)
export const JOB_PRIORITY = {
  HIGH: 1,    // bot with open position — must not be delayed
  NORMAL: 5,  // standard scan bot
} as const;

// Per-plan concurrency budget: max active jobs per user based on subscription plan
export const PLAN_CONCURRENCY = {
  explorer: 0,
  trader: 4,
  strategist: 16,
  titan: 64,
} as const;
export type UserPlan = keyof typeof PLAN_CONCURRENCY;

export interface BotJobData {
  traderId: string;
  userId: string;
  symbol: string;
  scanIntervalSec: number;
  hasOpenPosition?: boolean; // true → HIGH priority
  userPlan?: UserPlan;       // for per-plan budget enforcement
}

export interface BotJobResult {
  decision: string;
  scorePct: number;
  executionState?: string;
}

// ── Redis connection config (reuse queue Redis from db/redis.ts) ──
const redisConnection = getBullMQConnection();

export class BotScheduler {
  private queue: Queue<BotJobData, BotJobResult>;
  private dlq: Queue<BotJobData, BotJobResult>;
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
        removeOnComplete: true,
        removeOnFail: { count: 5000 },
      },
    });
    this.dlq = new Queue<BotJobData, BotJobResult>(DLQ_QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: { count: 5000 },
        removeOnFail: { count: 10000 },
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
        limiter: {
          max: DEFAULT_CONCURRENCY,
          duration: 1000,
        },
      },
    );

    this.worker.on("completed", (job: Job<BotJobData, BotJobResult> | undefined) => {
      if (!job) return;
      // Reset failure counter on success
      void this.resetFailureCount(job.data.traderId);
      void this.scheduleNextRun(job.data.traderId, job.data.scanIntervalSec);
    });

    this.worker.on("failed", (job: Job<BotJobData, BotJobResult> | undefined, err: Error) => {
      if (!job) return;
      console.error(`[BotScheduler] Job failed for trader ${job.data.traderId}:`, err.message);
      // Track consecutive failures → DLQ if too many
      void this.handleJobFailure(job);
    });

    // Seed from DB on startup
    await this.seedFromDb();

    // Periodic reseed to catch stragglers (crash recovery, etc.)
    this.reseedTimer = setInterval(() => void this.reseed(), RESEED_INTERVAL_MS);

    console.log(
      `[BotScheduler] Started — concurrency=${DEFAULT_CONCURRENCY}, ` +
      `timeout=${JOB_TIMEOUT_MS / 1000}s, dlq_after=${MAX_CONSECUTIVE_FAILURES}_failures, ` +
      `reseed=${RESEED_INTERVAL_MS / 1000}s`,
    );
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
    await this.dlq.close();
  }

  /** Enqueue a single bot for immediate or delayed processing. */
  async enqueue(
    trader: {
      id: string; userId: string; symbol: string;
      scanIntervalSec: number; hasOpenPosition?: boolean;
      userPlan?: UserPlan;
    },
    delaySec = 0,
  ): Promise<void> {
    try {
      // Check per-plan budget (best-effort — don't block on failure)
      if (trader.userPlan) {
        const budget = PLAN_CONCURRENCY[trader.userPlan] ?? PLAN_CONCURRENCY.strategist;
        if (budget === 0) return; // explorer plan → no bots
        const active = await this.getUserActiveCount(trader.userId);
        if (active >= budget) {
          // Silently skip — user at plan limit. Bot will be picked up by next reseed.
          return;
        }
      }

      const priority = trader.hasOpenPosition ? JOB_PRIORITY.HIGH : JOB_PRIORITY.NORMAL;
      await this.queue.add(
        `bot:${trader.id}`,
        {
          traderId: trader.id,
          userId: trader.userId,
          symbol: trader.symbol,
          scanIntervalSec: trader.scanIntervalSec,
          hasOpenPosition: trader.hasOpenPosition ?? false,
          userPlan: trader.userPlan,
        },
        {
          delay: delaySec > 0 ? delaySec * 1000 : 0,
          jobId: `bot-${trader.id}`, // prevents duplicate jobs for same bot
          priority,
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
      // Also clear failure counter
      await this.resetFailureCount(traderId);
    } catch {
      // best-effort
    }
  }

  /** Get queue metrics for monitoring (Prometheus / dashboard). */
  async getMetrics(): Promise<{
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    dlqSize: number;
    priorityHigh: number;
    priorityNormal: number;
  }> {
    const [waiting, active, delayed, failed, dlqWaiting, dlqFailed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getDelayedCount(),
      this.queue.getFailedCount(),
      this.dlq.getWaitingCount(),
      this.dlq.getFailedCount(),
    ]);

    // Count jobs by priority (best-effort — sample from waiting jobs)
    let priorityHigh = 0;
    let priorityNormal = 0;
    try {
      const waitingJobs = await this.queue.getWaiting(0, Math.min(waiting, 500));
      for (const job of waitingJobs) {
        if ((job.opts?.priority ?? JOB_PRIORITY.NORMAL) <= JOB_PRIORITY.HIGH) priorityHigh++;
        else priorityNormal++;
      }
    } catch { /* best-effort */ }

    return { waiting, active, delayed, failed, dlqSize: dlqWaiting + dlqFailed, priorityHigh, priorityNormal };
  }

  /** Retry a bot from DLQ back into the main queue. */
  async retryFromDlq(traderId: string): Promise<boolean> {
    try {
      const job = await this.dlq.getJob(`dlq-${traderId}`);
      if (!job) return false;

      // Reset failure counter
      await this.resetFailureCount(traderId);

      // Re-enqueue to main queue
      await this.enqueue({
        id: job.data.traderId,
        userId: job.data.userId,
        symbol: job.data.symbol,
        scanIntervalSec: job.data.scanIntervalSec,
        hasOpenPosition: job.data.hasOpenPosition,
      });

      // Remove from DLQ
      await job.remove();
      console.log(`[BotScheduler] Retried bot ${traderId} from DLQ`);
      return true;
    } catch (err: any) {
      console.error(`[BotScheduler] DLQ retry failed for ${traderId}:`, err?.message);
      return false;
    }
  }

  // ── Internal ──

  /** Handle job failure: track consecutive failures, move to DLQ if threshold reached. */
  private async handleJobFailure(job: Job<BotJobData, BotJobResult>): Promise<void> {
    const traderId = job.data.traderId;
    try {
      const count = await this.incrementFailureCount(traderId);

      if (count >= MAX_CONSECUTIVE_FAILURES) {
        // Move to DLQ
        console.warn(
          `[BotScheduler] Bot ${traderId} hit ${count} consecutive failures → moving to DLQ`,
        );
        await this.moveToDlq(job.data);
        // Remove from main queue scheduling
        await this.remove(traderId);
        return;
      }

      // Re-schedule with progressive backoff: 60s × failure count (60s, 120s, 180s, 240s)
      const backoffSec = 60 * count;
      void this.scheduleNextRun(traderId, backoffSec);
    } catch {
      // Fallback: simple 60s reschedule
      void this.scheduleNextRun(traderId, 60);
    }
  }

  /** Track consecutive failures in Redis. Returns new count. */
  private async incrementFailureCount(traderId: string): Promise<number> {
    const key = `bot:fail:${traderId}`;
    const count = await redisControl.incr(key);
    await redisControl.expire(key, FAILURE_COUNTER_TTL);
    return count;
  }

  /** Reset consecutive failure counter (on success or manual retry). */
  private async resetFailureCount(traderId: string): Promise<void> {
    try {
      await redisControl.del(`bot:fail:${traderId}`);
    } catch { /* best-effort */ }
  }

  /** Move a job to the dead letter queue. */
  private async moveToDlq(data: BotJobData): Promise<void> {
    try {
      await this.dlq.add(
        `dlq:${data.traderId}`,
        data,
        { jobId: `dlq-${data.traderId}` },
      );
    } catch (err: any) {
      if (!err?.message?.includes("already exists")) {
        console.error(`[BotScheduler] DLQ add failed for ${data.traderId}:`, err?.message);
      }
    }
  }

  /** Count active jobs for a user (for per-plan budget). */
  private async getUserActiveCount(userId: string): Promise<number> {
    try {
      const activeJobs = await this.queue.getActive(0, 200);
      return activeJobs.filter((j) => j.data.userId === userId).length;
    } catch {
      return 0; // Don't block on count failure
    }
  }

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
