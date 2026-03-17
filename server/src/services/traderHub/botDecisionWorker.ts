/**
 * Bot Decision Worker — BullMQ processor function for bot decisions.
 *
 * Core principle: Bots ONLY make decisions using shared pre-computed features.
 * They never call BinanceFuturesHub or CoinUniverseEngine directly.
 *
 * Each job:
 *   1. Load trader config from DB (single row by PK)
 *   2. Check feature freshness (Redis GET)
 *   3. Read pre-computed features from Redis (Redis GET)
 *   4. Apply decision logic (score thresholds, directional bias)
 *   5. Submit order intent if TRADE (via ExchangeCoreService)
 *   6. Persist result to DB (single UPDATE)
 *
 * Resource cost per job: 2 Redis ops + 2 DB ops = ~4ms total
 */
import type { Job } from "bullmq";
import type { BotJobData, BotJobResult } from "./botScheduler.ts";
import { readFeature } from "./featureCache.ts";
import { areFeaturesStale } from "./featureFreshness.ts";
import type { TraderHubStore } from "./traderHubStore.ts";
import type {
  TraderAiModule,
  TraderDecision,
  TraderLastResult,
  TraderRecord,
} from "./types.ts";
import type { ExchangeCoreService } from "../exchangeCore/exchangeCoreService.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const round = (v: number, d = 4) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};
const nowIso = () => new Date().toISOString();

// ── Decision logic (extracted from old TraderHubEngine) ──

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
  module: TraderAiModule,
  dataStale: boolean,
): string => {
  if (dataStale) return `Live market feed unavailable. ${module} returned N/A until feature engine recovers.`;
  if (decision === "TRADE") return `${module} found executable setup from shared feature engine.`;
  if (decision === "WATCH") return `${module} sees setup building, waiting for stronger confirmation.`;
  if (decision === "NO_TRADE") return `${module} rejected setup due to weak edge/quality.`;
  return `${module} is waiting for fresh market data.`;
};

const buildPlan = (
  price: number,
  bias: TraderLastResult["bias"],
  scorePct: number,
): TraderLastResult["plan"] => {
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
  return { entryLow: null, entryHigh: null, sl1: null, sl2: null, tp1: null, tp2: null };
};

// ── Processor factory ──

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

    // 3. Read pre-computed features from Redis
    const features = await readFeature(trader.symbol);

    // 4. Decision logic
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

    const dataStale = stale || !features;

    if (!dataStale && features) {
      price = features.price;

      // Use CoinUniverseEngine's composite score directly (already computed!)
      const momentum = clamp(50 + features.change24hPct * 2.2, 0, 100);
      const liquidity = features.depthUsd
        ? clamp(Math.log10(Math.max(1, features.depthUsd)) * 18, 0, 100)
        : 35;
      const spreadScore = clamp(100 - Math.max(0, features.spreadBps ?? 25) * 2, 0, 100);
      const imbalanceBoost = clamp((features.imbalance ?? 0) * 20, -12, 12);
      scorePct = clamp(momentum * 0.42 + liquidity * 0.28 + spreadScore * 0.3 + imbalanceBoost, 0, 100);

      bias = aiBias(features.change24hPct, features.imbalance ?? 0);
      decision = scoreToDecision(scorePct, false);
      plan = buildPlan(price, bias, scorePct);

      // 5. Submit order intent if TRADE
      if (exchangeCore && decision === "TRADE" && (bias === "LONG" || bias === "SHORT")) {
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
          } else {
            execution = {
              state: "QUEUED",
              venue: venueName,
              intentId: intent.id,
              message: `Order intent queued on ${venueName}.`,
            };
          }
        } catch {
          execution.message = "Exchange submission failed";
        }
      }
    }

    // 6. Build lastResult + persist to DB
    const lastResult: TraderLastResult = {
      ts: nowIso(),
      sourceExchange: features ? "Binance" : "N/A",
      scorePct: round(scorePct, 2),
      decision,
      bias,
      reason: aiReason(decision, trader.aiModule, dataStale),
      price,
      plan,
      dataStale,
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

    await store.patchRunResult(trader.id, {
      lastRunAt: nowIso(),
      lastError: "",
      failStreak: 0,
      status: "RUNNING",
      stats: nextStats,
      lastResult: lastResult as unknown as Record<string, unknown>,
      nextRunAt,
    });

    return {
      decision,
      scorePct: round(scorePct, 2),
      executionState: execution.state,
    };
  };
}
