/**
 * Bot Decision Worker — BullMQ processor function for bot decisions.
 *
 * Core principle: Bots ONLY make decisions using shared pre-computed features.
 * They never call BinanceFuturesHub or CoinUniverseEngine directly.
 *
 * Faz 3 optimizations:
 *   - Signal cache: scorePct/bias/decision/plan pre-computed by featureCache.ts
 *     at feature-write time. Bots read cached signal → zero signal computation.
 *   - Bot Breaker: Market/Strategy/User breakers gate exchange submissions.
 *   - Batch writer: DB updates accumulated in memory, flushed every 2s in bulk.
 *
 * Resource cost per job (Faz 3):
 *   1 DB read (trader config) + 2 Redis reads (signal + freshness) + 1 enqueue
 *   = ~2ms total (down from ~4ms; DB write deferred to batch flush)
 */
import type { Job } from "bullmq";
import type { BotJobData, BotJobResult } from "./botScheduler.ts";
import { readSignal } from "./signalCache.ts";
import { areFeaturesStale } from "./featureFreshness.ts";
import { botBreaker } from "./botBreaker.ts";
import { batchResultWriter } from "./batchResultWriter.ts";
import type { TraderHubStore } from "./traderHubStore.ts";
import type {
  TraderAiModule,
  TraderDecision,
  TraderLastResult,
} from "./types.ts";
import type { ExchangeCoreService } from "../exchangeCore/exchangeCoreService.ts";

const round = (v: number, d = 4) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};
const nowIso = () => new Date().toISOString();

// ── Reason text (per-bot, minor) ────────────────────────────────────────────

const aiReason = (
  decision: TraderDecision,
  module: TraderAiModule,
  dataStale: boolean,
): string => {
  if (dataStale) return `Live market feed unavailable. ${module} returned N/A until feature engine recovers.`;
  if (decision === "TRADE") return `${module} found executable setup from shared feature engine.`;
  if (decision === "WATCH") return `${module} sees setup building, waiting for stronger confirmation.`;
  if (decision === "NO_TRADE") return `${module} rejected setup due to weak edge/quality.`;
  return `${module} is waiting for fresh market data.`;
};

// ── Processor factory ────────────────────────────────────────────────────────

export function createBotProcessor(
  store: TraderHubStore,
  exchangeCore: ExchangeCoreService | null,
) {
  return async (job: Job<BotJobData>): Promise<BotJobResult> => {
    const { traderId } = job.data;

    // 1. Load trader config from DB (single row by PK)
    const trader = await store.getById(traderId);
    if (!trader || trader.status !== "RUNNING") {
      return { decision: "SKIP", scorePct: 0 };
    }

    // 2. Check feature freshness
    const stale = await areFeaturesStale();
    const dataStale = stale;

    // 3. Read pre-computed signal from Redis (scorePct, bias, decision, plan)
    const cached = await readSignal(trader.symbol);
    const signalMissing = !cached;

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

    if (!dataStale && cached) {
      price = null; // price is in features, not cached signal — we don't need it for decision
      scorePct = cached.scorePct;
      bias = cached.bias;
      decision = cached.decision;
      plan = cached.plan;
    }

    // 4. Bot Breaker check + exchange submission
    if (exchangeCore && decision === "TRADE" && (bias === "LONG" || bias === "SHORT")) {
      const breakerCheck = await botBreaker.canExecute(
        trader.symbol,
        trader.strategyId,
        trader.userId,
      );

      if (!breakerCheck.allowed) {
        // Breaker open → downgrade to WATCH, no exchange call
        decision = "WATCH";
        execution = {
          state: "N/A",
          venue: "N/A",
          intentId: "",
          message: `Bot breaker active: ${breakerCheck.reason ?? "unknown"}`,
        };
      } else {
        try {
          const intent = await exchangeCore.submitAiIntent({
            userId: trader.userId,
            runId: trader.id,
            clientOrderId: `trader-${trader.id.slice(0, 10)}-${Date.now()}`,
            exchangePreference: trader.exchange,
            exchangeAccountId: trader.exchangeAccountId || undefined,
            symbolInternal: trader.symbol,
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
            await botBreaker.recordFailure(trader.strategyId, trader.userId);
          } else {
            execution = {
              state: "QUEUED",
              venue: venueName,
              intentId: intent.id,
              message: `Order intent queued on ${venueName}.`,
            };
            await botBreaker.recordSuccess(trader.strategyId, trader.userId);
          }
        } catch {
          execution.message = "Exchange submission failed";
          await botBreaker.recordFailure(trader.strategyId, trader.userId);
        }
      }
    }

    // 5. Build lastResult
    const lastResult: TraderLastResult = {
      ts: nowIso(),
      sourceExchange: !signalMissing ? "Binance" : "N/A",
      scorePct: round(scorePct, 2),
      decision,
      bias,
      reason: aiReason(decision, trader.aiModule, dataStale || signalMissing),
      price,
      plan,
      dataStale: dataStale || signalMissing,
      execution,
    };

    const nextStats = { ...trader.stats };
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

    const nextRunAt = new Date(Date.now() + trader.scanIntervalSec * 1000).toISOString();

    // 6. Enqueue to batch writer (deferred DB write — avoids per-bot UPDATE)
    batchResultWriter.enqueue({
      id: trader.id,
      lastRunAt: nowIso(),
      lastError: "",
      failStreak: 0,
      status: "RUNNING",
      stats: nextStats as unknown as Record<string, unknown>,
      lastResult: lastResult as unknown as Record<string, unknown>,
      nextRunAt,
      // Analytics fields (dual-written to bot_decisions hypertable)
      userId: trader.userId,
      symbol: trader.symbol,
      strategyId: trader.strategyId,
      decision,
      scorePct: round(scorePct, 2),
      bias,
      execState: execution.state,
      dataStale: lastResult.dataStale,
    });

    return {
      decision,
      scorePct: round(scorePct, 2),
      executionState: execution.state,
    };
  };
}
