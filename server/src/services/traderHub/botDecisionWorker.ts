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
import { readSignal, readSignalBatch } from "./signalCache.ts";
import { readFeaturesBatch } from "./featureCache.ts";
import { areFeaturesStale } from "./featureFreshness.ts";
import { botBreaker } from "./botBreaker.ts";
import { batchResultWriter } from "./batchResultWriter.ts";
import { resolveCoinPool } from "./coinPoolResolver.ts";
import { redis } from "../../db/redis.ts";
import type { TraderHubStore } from "./traderHubStore.ts";
import type {
  TraderAiModule,
  TraderDecision,
  TraderLastResult,
  TraderRecord,
  CoinScanResult,
  VirtualPosition,
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

    // Multi-coin path: if trader has coinPool, use multi-coin scanning
    if (trader.coinPool) {
      return processMultiCoin(trader, exchangeCore);
    }

    // 2. Check feature freshness (single-symbol legacy path)
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

    // 4a. Minimum RR ratio guard — reject trades with bad risk/reward
    if (decision === "TRADE" && plan.sl1 != null && plan.tp1 != null) {
      const refPrice = plan.entryLow && plan.entryHigh
        ? (plan.entryLow + plan.entryHigh) / 2
        : plan.entryLow ?? plan.entryHigh ?? 0;
      if (refPrice > 0) {
        const slDist = Math.abs(refPrice - plan.sl1);
        const tpDist = Math.abs(plan.tp1 - refPrice);
        const rr = slDist > 0 ? tpDist / slDist : 0;
        if (rr < 1.5) {
          // Reject low RR trades — not worth the risk
          decision = "WATCH";
          execution = {
            state: "N/A",
            venue: "N/A",
            intentId: "",
            message: `RR ratio ${rr.toFixed(2)} < 1.5 minimum — trade rejected`,
          };
        }
      }
    }

    // 4b. Bot Breaker check + exchange submission
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
      // PnL is NOT simulated — actual PnL comes from exchange fill reconciliation.
      // The pnlPct field is updated by fillReconciler when trades close.
      // We only increment the trade counter here.
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

// ── Multi-coin scan processor ──────────────────────────────────────────────────

const VPOS_KEY_PREFIX = "trader:vpos:"; // Redis key for virtual positions
const VPOS_TTL_SEC = 86400 * 7;        // 7 day TTL

const buildCoinRationale = (
  decision: TraderDecision,
  bias: string,
  scorePct: number,
  module: TraderAiModule,
  minConf: number,
): string => {
  if (decision === "TRADE") return `${module}: Setup ≥${minConf}% (${scorePct.toFixed(0)}%), ${bias} bias confirmed.`;
  if (decision === "WATCH") return `${module}: Setup building (${scorePct.toFixed(0)}% < ${minConf}%), waiting.`;
  if (decision === "NO_TRADE") return `${module}: Weak edge (${scorePct.toFixed(0)}%), no trade.`;
  return `${module}: Data unavailable.`;
};

/** Derive rich AI analysis from feature + signal data. */
function deriveSignalDetails(
  feat: { rsi14: number | null; volume24hUsd: number; change24hPct: number; imbalance: number | null; srDistPct: number | null; fundingRate: number | null; compositeScore: number; tier1Score: number; atrPct: number | null; spreadBps: number | null },
  scorePct: number,
  bias: "LONG" | "SHORT" | "NEUTRAL",
  minConf: number,
): { signalLabel: string; signals: string[]; shortComment: string; opportunity: string } {
  // Signal label
  let signalLabel: string;
  if (bias === "LONG") {
    signalLabel = scorePct >= 85 ? "STRONG BUY" : scorePct >= minConf ? "BUY" : "HOLD";
  } else if (bias === "SHORT") {
    signalLabel = scorePct >= 85 ? "STRONG SELL" : scorePct >= minConf ? "SELL" : "HOLD";
  } else {
    signalLabel = "HOLD";
  }

  // Derive technical signals from features
  const signals: string[] = [];
  const rsi = feat.rsi14 ?? 50;

  if (rsi < 30) signals.push("RSI oversold zone");
  else if (rsi < 40 && bias === "LONG") signals.push("RSI oversold recovery");
  else if (rsi > 70) signals.push("RSI overbought zone");
  else if (rsi > 60 && bias === "SHORT") signals.push("RSI overbought reversal");

  if (feat.volume24hUsd > 100_000_000) signals.push("Very high volume activity");
  else if (feat.volume24hUsd > 30_000_000) signals.push("Volume increasing");

  if (feat.change24hPct > 5) signals.push("Strong bullish momentum (+5%+)");
  else if (feat.change24hPct > 2) signals.push("Bullish momentum building");
  else if (feat.change24hPct < -5) signals.push("Strong bearish pressure (-5%+)");
  else if (feat.change24hPct < -2) signals.push("Bearish pressure detected");

  if ((feat.imbalance ?? 0) > 0.2) signals.push("Orderbook bid-side dominant");
  else if ((feat.imbalance ?? 0) < -0.2) signals.push("Orderbook ask-side pressure");

  if ((feat.srDistPct ?? 5) < 1.5) signals.push("Near key support/resistance level");

  const fr = feat.fundingRate ?? 0;
  if (fr < -0.005) signals.push("Negative funding — bullish pressure");
  else if (fr > 0.01) signals.push("High positive funding — bearish wind");

  if (feat.compositeScore > 75) signals.push("High composite quality score");
  if (feat.tier1Score > 80) signals.push("Top-tier quality coin");

  if ((feat.atrPct ?? 0) > 4) signals.push("High volatility environment");
  if ((feat.spreadBps ?? 30) < 3) signals.push("Tight spread — good execution");

  if (bias === "LONG" && feat.change24hPct > 0 && rsi < 60) signals.push("Bullish trend continuation");
  if (bias === "SHORT" && feat.change24hPct < 0 && rsi > 40) signals.push("Bearish trend continuation");

  // Cap at 6 signals
  if (signals.length > 6) signals.length = 6;

  // Opportunity type
  let opportunity: string;
  if (Math.abs(feat.change24hPct) > 5 && bias === "LONG") opportunity = "Breakout";
  else if (feat.change24hPct < -3 && bias === "LONG") opportunity = "Dip Buy";
  else if (Math.abs(feat.change24hPct) > 5 && bias === "SHORT") opportunity = "Short Reversal";
  else if (feat.change24hPct > 3 && bias === "SHORT") opportunity = "Trend Reversal";
  else if ((feat.atrPct ?? 2) < 1.2) opportunity = "Scalping";
  else if ((feat.srDistPct ?? 5) < 1.5) opportunity = "S/R Level Play";
  else if (Math.abs(feat.change24hPct) < 1) opportunity = "Range Trading";
  else opportunity = "Trend Following";

  // Short comment — contextual
  const parts: string[] = [];
  if (signalLabel.includes("STRONG")) parts.push(`Strong ${bias.toLowerCase()} setup with multiple confirmations.`);
  else if (signalLabel === "BUY" || signalLabel === "SELL") parts.push(`${bias} signal detected — moderate confidence.`);
  else parts.push("Neutral conditions — waiting for confirmation.");

  if (feat.volume24hUsd > 50_000_000) parts.push("High volume supports the move.");
  if (Math.abs(feat.change24hPct) > 3) parts.push(`${feat.change24hPct > 0 ? "Upside" : "Downside"} momentum active.`);
  if ((feat.srDistPct ?? 5) < 1.5) parts.push("Price near key level — watch for reaction.");

  const shortComment = parts.join(" ");

  return { signalLabel, signals, shortComment, opportunity };
};

/** Read virtual positions from Redis. */
async function readVirtualPositions(traderId: string): Promise<VirtualPosition[]> {
  try {
    const raw = await redis.get(VPOS_KEY_PREFIX + traderId);
    if (!raw) return [];
    return JSON.parse(raw) as VirtualPosition[];
  } catch { return []; }
}

/** Write virtual positions to Redis. */
async function writeVirtualPositions(traderId: string, positions: VirtualPosition[]): Promise<void> {
  if (positions.length === 0) {
    await redis.del(VPOS_KEY_PREFIX + traderId);
  } else {
    await redis.set(VPOS_KEY_PREFIX + traderId, JSON.stringify(positions), "EX", VPOS_TTL_SEC);
  }
}

async function processMultiCoin(
  trader: TraderRecord,
  exchangeCore: ExchangeCoreService | null,
): Promise<BotJobResult> {
  const pool = trader.coinPool!;
  const minConf = pool.minConfidence ?? 75;
  const stale = await areFeaturesStale();

  // 1. Resolve coin pool → dynamic symbol list
  const symbols = await resolveCoinPool(pool);
  if (symbols.length === 0) {
    batchResultWriter.enqueue({
      id: trader.id,
      lastRunAt: nowIso(),
      lastError: "Empty coin pool — no symbols resolved",
      failStreak: trader.failStreak + 1,
      status: "RUNNING",
      stats: { ...trader.stats, runs: trader.stats.runs + 1, noTradeCount: trader.stats.noTradeCount + 1 } as unknown as Record<string, unknown>,
      lastResult: null,
      nextRunAt: new Date(Date.now() + trader.scanIntervalSec * 1000).toISOString(),
    });
    return { decision: "N/A", scorePct: 0 };
  }

  // 2. Read existing virtual positions
  const openPositions = await readVirtualPositions(trader.id);

  // 2b. Merge position symbols into scan list so PnL is always tracked
  const positionSymbols = openPositions.map((p) => p.symbol).filter((s) => !symbols.includes(s));
  if (positionSymbols.length > 0) symbols.push(...positionSymbols);

  // 3. Batch-read all signals + features from Redis (2 MGET round-trips)
  const signalMap = await readSignalBatch(symbols);
  const featureMap = await readFeaturesBatch(symbols);
  // Debug: log scan summary (TODO: remove after verification)
  if (openPositions.length > 0) console.log(`[MultiCoin] ${trader.name}: ${symbols.length} symbols (${positionSymbols.length} from positions), ${openPositions.length} vpos, minConf=${minConf}`);

  // 4. Close virtual positions that hit SL/TP or reversed bias
  let realizedPnlPct = 0;
  const stillOpen: VirtualPosition[] = [];

  for (const pos of openPositions) {
    const feat = featureMap.get(pos.symbol);
    const sig = signalMap.get(pos.symbol);
    if (!feat) { stillOpen.push(pos); continue; }

    const price = feat.price;
    let closed = false;
    let pnl = 0;

    if (pos.side === "LONG") {
      if (price <= pos.sl1) { pnl = ((pos.sl1 - pos.entryPrice) / pos.entryPrice) * 100; closed = true; }
      else if (price >= pos.tp1) { pnl = ((pos.tp1 - pos.entryPrice) / pos.entryPrice) * 100; closed = true; }
      else if (sig && sig.bias === "SHORT" && sig.scorePct >= minConf) { pnl = ((price - pos.entryPrice) / pos.entryPrice) * 100; closed = true; }
    } else {
      if (price >= pos.sl1) { pnl = ((pos.entryPrice - pos.sl1) / pos.entryPrice) * 100; closed = true; }
      else if (price <= pos.tp1) { pnl = ((pos.entryPrice - pos.tp1) / pos.entryPrice) * 100; closed = true; }
      else if (sig && sig.bias === "LONG" && sig.scorePct >= minConf) { pnl = ((pos.entryPrice - price) / pos.entryPrice) * 100; closed = true; }
    }

    if (closed) {
      realizedPnlPct += pnl;
      console.log(`[MultiCoin] CLOSED vpos: ${pos.symbol} ${pos.side} entry=${pos.entryPrice} price=${price} pnl=${pnl.toFixed(2)}%`);
    } else { stillOpen.push(pos); }
  }

  // 5. Evaluate each coin with user's minConfidence threshold
  const coinScans: CoinScanResult[] = [];
  for (const symbol of symbols) {
    const signal = signalMap.get(symbol);
    const feat = featureMap.get(symbol);
    if (!signal || stale) {
      coinScans.push({
        symbol, scorePct: 0, decision: "N/A", bias: "NEUTRAL",
        suitable: false, riskLevel: "HIGH", entryProbability: 0,
        trendAlignment: false, price: feat?.price,
        rationale: stale ? `Data stale — ${trader.aiModule} skipped.` : `No signal data for ${symbol}.`,
      });
      continue;
    }

    const { scorePct, bias, plan } = signal;
    // Apply user's minConfidence threshold instead of hardcoded 75
    const decision: TraderDecision = signal.decision === "N/A" ? "N/A"
      : scorePct >= minConf ? "TRADE"
      : scorePct >= 52 ? "WATCH"
      : "NO_TRADE";

    // Calculate unrealized PnL if there's an open position for this symbol
    const openPos = stillOpen.find((p) => p.symbol === symbol);
    let unrealizedPnl: number | undefined;
    if (openPos && feat) {
      unrealizedPnl = openPos.side === "LONG"
        ? ((feat.price - openPos.entryPrice) / openPos.entryPrice) * 100
        : ((openPos.entryPrice - feat.price) / openPos.entryPrice) * 100;
    }

    // Derive rich AI analysis from features
    const details = feat
      ? deriveSignalDetails(feat, scorePct, bias, minConf)
      : { signalLabel: "HOLD", signals: [], shortComment: "No data available.", opportunity: "N/A" };

    coinScans.push({
      symbol,
      scorePct: round(scorePct, 2),
      decision,
      bias,
      suitable: decision === "TRADE" || decision === "WATCH",
      riskLevel: scorePct >= minConf ? "LOW" : scorePct >= 52 ? "MEDIUM" : "HIGH",
      entryProbability: round(scorePct / 100, 2),
      trendAlignment: bias !== "NEUTRAL",
      rationale: buildCoinRationale(decision, bias, scorePct, trader.aiModule, minConf),
      price: feat?.price,
      plan: plan ?? undefined,
      pnlPct: unrealizedPnl != null ? round(unrealizedPnl, 2) : undefined,
      signalLabel: details.signalLabel,
      signals: details.signals,
      shortComment: details.shortComment,
      opportunity: details.opportunity,
      change24hPct: feat ? round(feat.change24hPct, 2) : undefined,
      rsi14: feat?.rsi14 != null ? round(feat.rsi14, 1) : undefined,
      fundingRate: feat?.fundingRate != null ? round(feat.fundingRate, 6) : undefined,
      volume24hUsd: feat?.volume24hUsd,
      atrPct: feat?.atrPct != null ? round(feat.atrPct, 2) : undefined,
    });
  }

  // 6. Sort by score desc, find best TRADE candidate
  coinScans.sort((a, b) => b.scorePct - a.scorePct);
  const bestTrade = coinScans.find((c) => c.decision === "TRADE" && c.bias !== "NEUTRAL");

  // 7. Open new virtual position for best TRADE candidate (if not already open)
  if (bestTrade && bestTrade.plan && bestTrade.price && !stale) {
    const alreadyOpen = stillOpen.some((p) => p.symbol === bestTrade.symbol);
    if (!alreadyOpen && bestTrade.plan.sl1 != null && bestTrade.plan.tp1 != null) {
      stillOpen.push({
        symbol: bestTrade.symbol,
        side: bestTrade.bias as "LONG" | "SHORT",
        entryPrice: bestTrade.price,
        sl1: bestTrade.plan.sl1,
        tp1: bestTrade.plan.tp1,
        openedAt: nowIso(),
        scorePct: round(bestTrade.scorePct, 2),
        signalLabel: bestTrade.signalLabel,
        signals: bestTrade.signals,
        shortComment: bestTrade.shortComment,
        opportunity: bestTrade.opportunity,
        riskLevel: bestTrade.riskLevel,
        confidence: round(bestTrade.scorePct, 1),
        entryLow: bestTrade.plan.entryLow ?? undefined,
        entryHigh: bestTrade.plan.entryHigh ?? undefined,
        tp2: bestTrade.plan.tp2 ?? undefined,
      });
      console.log(`[MultiCoin] OPENED vpos: ${bestTrade.symbol} ${bestTrade.bias} @ ${bestTrade.price} [${bestTrade.signalLabel}]`);
    }
  }

  // Persist virtual positions
  await writeVirtualPositions(trader.id, stillOpen);

  // 8. Determine overall decision
  let executedDecision: TraderDecision = bestTrade
    ? "TRADE"
    : coinScans.some((c) => c.decision === "WATCH")
      ? "WATCH"
      : "NO_TRADE";

  let execution: TraderLastResult["execution"] = {
    state: "N/A",
    venue: "N/A",
    intentId: "",
    message: bestTrade ? "Best candidate found." : "No executable candidate in pool.",
  };

  // 9. Execute best candidate (if any)
  if (exchangeCore && bestTrade && !stale) {
    const breakerCheck = await botBreaker.canExecute(bestTrade.symbol, trader.strategyId, trader.userId);
    if (!breakerCheck.allowed) {
      executedDecision = "WATCH";
      execution = { state: "N/A", venue: "N/A", intentId: "", message: `Bot breaker active: ${breakerCheck.reason ?? "unknown"}` };
    } else {
      try {
        const intent = await exchangeCore.submitAiIntent({
          userId: trader.userId, runId: trader.id,
          clientOrderId: `trader-${trader.id.slice(0, 10)}-${Date.now()}`,
          exchangePreference: trader.exchange,
          exchangeAccountId: trader.exchangeAccountId || undefined,
          symbolInternal: bestTrade.symbol,
          side: bestTrade.bias === "LONG" ? "BUY" : "SELL",
          notionalUsdt: 100, leverage: 3,
        });
        const venueName = intent.venue === "GATEIO" ? "Gate.io" : "Binance";
        if (intent.state === "REJECTED") {
          executedDecision = "NO_TRADE";
          execution = { state: "REJECTED", venue: "N/A", intentId: intent.id, message: intent.rejectReason || "Exchange execution rejected" };
          await botBreaker.recordFailure(trader.strategyId, trader.userId);
        } else {
          execution = { state: "QUEUED", venue: venueName, intentId: intent.id, message: `Order queued on ${venueName} for ${bestTrade.symbol}.` };
          await botBreaker.recordSuccess(trader.strategyId, trader.userId);
        }
      } catch {
        execution.message = "Exchange submission failed";
        await botBreaker.recordFailure(trader.strategyId, trader.userId);
      }
    }
  }

  // 10. Build lastResult
  const bestScore = coinScans[0]?.scorePct ?? 0;
  const tradeCount = coinScans.filter((c) => c.decision === "TRADE").length;
  const watchCount = coinScans.filter((c) => c.decision === "WATCH").length;

  // Cumulative PnL = existing + newly realized this cycle
  const cumulativePnl = round(trader.stats.pnlPct + realizedPnlPct, 4);

  const lastResult: TraderLastResult = {
    ts: nowIso(),
    sourceExchange: "Binance",
    scorePct: round(bestScore, 2),
    decision: executedDecision,
    bias: bestTrade?.bias ?? coinScans[0]?.bias ?? "NEUTRAL",
    reason: `Scanned ${symbols.length} coins (min ${minConf}%). ${tradeCount} TRADE, ${watchCount} WATCH.${bestTrade ? ` Best: ${bestTrade.symbol} (${bestTrade.scorePct.toFixed(1)}%)` : ""}`,
    price: null,
    plan: { entryLow: null, entryHigh: null, sl1: null, sl2: null, tp1: null, tp2: null },
    dataStale: stale,
    execution,
    coinScans,
    bestCandidate: bestTrade?.symbol ?? undefined,
    scannedCoins: symbols.length,
    openPositions: stillOpen,
    realizedPnlPct: realizedPnlPct !== 0 ? round(realizedPnlPct, 4) : undefined,
  };

  // 11. Update stats (with PnL)
  const nextStats = { ...trader.stats, runs: trader.stats.runs + 1, pnlPct: cumulativePnl };
  if (executedDecision === "TRADE") nextStats.tradeCount += 1;
  else if (executedDecision === "WATCH") nextStats.watchCount += 1;
  else nextStats.noTradeCount += 1;

  const nextRunAt = new Date(Date.now() + trader.scanIntervalSec * 1000).toISOString();

  // 12. Enqueue trader record update (omit analytics fields — handled below)
  batchResultWriter.enqueue({
    id: trader.id,
    lastRunAt: nowIso(),
    lastError: "",
    failStreak: 0,
    status: "RUNNING",
    stats: nextStats as unknown as Record<string, unknown>,
    lastResult: lastResult as unknown as Record<string, unknown>,
    nextRunAt,
  });

  // 13. Enqueue per-coin analytics rows (one row per symbol in bot_decisions)
  for (const scan of coinScans) {
    if (scan.decision === "N/A") continue;
    batchResultWriter.enqueueAnalytics({
      time: nowIso(),
      botId: trader.id,
      userId: trader.userId,
      symbol: scan.symbol,
      strategyId: trader.strategyId,
      decision: scan.decision,
      scorePct: round(scan.scorePct, 2),
      bias: scan.bias,
      execState: scan.symbol === bestTrade?.symbol ? (execution?.state ?? "N/A") : "N/A",
      dataStale: stale,
      pnlPct: scan.pnlPct,
    });
  }

  return {
    decision: executedDecision,
    scorePct: round(bestScore, 2),
    executionState: execution?.state ?? "N/A",
  };
}
