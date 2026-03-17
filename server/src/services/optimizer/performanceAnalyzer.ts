import type { TradeIdeaRecord } from "../tradeIdeaTypes.ts";
import type { ModuleConfig, PerformanceMetrics } from "./types.ts";
import { ZERO_METRICS } from "./types.ts";

/**
 * Determine if a trade was a WIN, LOSS, or SKIP at a given config.
 *
 * Since we don't re-fetch candles, we use the stored resolution data:
 * - WIN:  result=SUCCESS, hit_level_type=TP → actualRR = |hit_price - entry| / risk
 *         candidateRR <= actualRR → WIN
 * - LOSS: result=FAIL, hit_level_type=SL → always LOSS regardless of config
 * - SKIP: anything else (NONE, missing data)
 */
export function simulateTradeOutcome(
  trade: TradeIdeaRecord,
  config: ModuleConfig,
): "WIN" | "LOSS" | "SKIP" {
  if (!trade.hit_level_price || !trade.activated_at) return "SKIP";
  if (trade.result === "NONE") return "SKIP";

  const entryMid = (trade.entry_low + trade.entry_high) / 2;
  const sl = trade.sl_levels?.[0];
  if (sl == null) return "SKIP";

  const risk = Math.abs(entryMid - sl);
  if (risk <= 0) return "SKIP";

  if (trade.result === "SUCCESS" && trade.hit_level_type === "TP") {
    const actualRR = Math.abs(trade.hit_level_price - entryMid) / risk;
    return config.rr <= actualRR ? "WIN" : "LOSS";
  }

  if (trade.result === "FAIL" && trade.hit_level_type === "SL") {
    return "LOSS";
  }

  return "SKIP";
}

/**
 * Calculate comprehensive performance metrics for a set of trades at a given config.
 */
export function calcMetrics(
  trades: TradeIdeaRecord[],
  config: ModuleConfig,
): PerformanceMetrics {
  if (trades.length === 0) return { ...ZERO_METRICS };

  let wins = 0;
  let losses = 0;
  let tpHits = 0;
  let slHits = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let currentDrawdown = 0;
  let maxDrawdown = 0;

  for (const trade of trades) {
    const outcome = simulateTradeOutcome(trade, config);
    if (outcome === "SKIP") continue;

    if (outcome === "WIN") {
      wins++;
      tpHits++;
      grossWin += config.rr;
      currentDrawdown = 0;
    } else {
      losses++;
      slHits++;
      grossLoss += 1;
      currentDrawdown += 1;
      maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
    }
  }

  const tradeCount = wins + losses;
  if (tradeCount === 0) return { ...ZERO_METRICS };

  const winRate = wins / tradeCount;
  const lossRate = losses / tradeCount;
  const totalR = grossWin - grossLoss;
  const avgR = totalR / tradeCount;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const avgWin = wins > 0 ? grossWin / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;
  const expectancy = winRate * avgWin - lossRate * avgLoss;

  return {
    tradeCount,
    winRate,
    totalR,
    avgR,
    profitFactor: Number.isFinite(profitFactor) ? profitFactor : 999,
    expectancy,
    maxDrawdown,
    tpHitRatio: tradeCount > 0 ? tpHits / tradeCount : 0,
    slHitRatio: tradeCount > 0 ? slHits / tradeCount : 0,
  };
}
