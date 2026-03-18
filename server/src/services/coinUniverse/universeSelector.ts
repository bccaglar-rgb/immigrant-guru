/**
 * Universe Selector — Stage 4: Top 10% Selection
 *
 * Selection rules:
 *   1. Score >= 60
 *   2. Must be in top 10% of scored coins
 *   3. Extra rejection rules:
 *      - RANGE regime + expansion_probability < 0.55 → reject
 *      - trend_strength < 55 + no volume spike → reject
 *      - oi_change <= 0 + neutral aggressor flow → reject
 *
 * Score interpretation:
 *   80-100: Elite candidate
 *   70-79:  Strong candidate
 *   60-69:  Watchlist candidate
 *   0-59:   Do not send to quant engine
 */

import type { UniverseCoinRow } from "./types.ts";

const MIN_SCORE_WITH_KLINES = 45;  // Klines add structure/trend data but max realistic score ~65-75
const MIN_SCORE_NO_KLINES = 25;   // Without klines max possible ~49

export interface SelectionResult {
  selected: UniverseCoinRow[];
  watchlist: UniverseCoinRow[];
  rejected: UniverseCoinRow[];
}

function passesExtraRules(coin: UniverseCoinRow): { pass: boolean; reason: string | null } {
  // Skip extra rules when klines data is unavailable (regime=UNKNOWN means no klines)
  const hasKlines = coin.regime !== "UNKNOWN";

  // RANGE regime + low expansion probability → reject
  if (hasKlines && coin.regime === "RANGE" && (coin as any)._expansionProb < 0.55) {
    return { pass: false, reason: "range_low_expansion" };
  }

  // Weak trend + no volume spike → reject (only when klines available)
  if (hasKlines && coin.trendStrength < 55 && !coin.volumeSpike) {
    return { pass: false, reason: "weak_trend_no_volume" };
  }

  // OI decrease + neutral flow → reject
  if (coin.oiChange !== null && coin.oiChange <= 0 && coin.aggressorFlow === "NEUTRAL") {
    return { pass: false, reason: "declining_oi_neutral_flow" };
  }

  return { pass: true, reason: null };
}

export function selectTopCoins(
  coins: UniverseCoinRow[],
  expansionProbs: Map<string, number>,
): SelectionResult {
  // Attach expansion probability for extra rules check
  for (const coin of coins) {
    (coin as any)._expansionProb = expansionProbs.get(coin.symbol) ?? 0.5;
  }

  // Sort by final score descending
  const sorted = [...coins].sort((a, b) =>
    b.compositeScore - a.compositeScore || b.volume24hUsd - a.volume24hUsd,
  );

  // Top 10% threshold
  const top10PctCount = Math.max(1, Math.ceil(sorted.length * 0.10));
  const top10PctThreshold = sorted.length > top10PctCount
    ? sorted[top10PctCount - 1].compositeScore
    : 0;

  const selected: UniverseCoinRow[] = [];
  const watchlist: UniverseCoinRow[] = [];
  const rejected: UniverseCoinRow[] = [];

  // Detect if klines are available (at least one coin has regime != UNKNOWN)
  const hasAnyKlines = sorted.some((c) => c.regime !== "UNKNOWN");
  const minScore = hasAnyKlines ? MIN_SCORE_WITH_KLINES : MIN_SCORE_NO_KLINES;

  for (const coin of sorted) {
    // Below minimum score → GAMMA (reject)
    if (coin.compositeScore < minScore) {
      coin.selected = false;
      coin.tier = "GAMMA";
      coin.rejectedReason = `score_below_${minScore}`;
      rejected.push(coin);
      continue;
    }

    // Extra rules check → BETA if failed
    const extraCheck = passesExtraRules(coin);
    if (!extraCheck.pass) {
      coin.selected = false;
      coin.tier = "BETA";
      coin.rejectedReason = extraCheck.reason;
      if (coin.compositeScore >= minScore) {
        watchlist.push(coin);
      } else {
        coin.tier = "GAMMA";
        rejected.push(coin);
      }
      continue;
    }

    // Top 10% check → ALPHA
    if (coin.compositeScore >= top10PctThreshold) {
      coin.selected = true;
      coin.tier = "ALPHA";
      coin.rejectedReason = null;
      selected.push(coin);
    } else {
      coin.selected = false;
      coin.tier = "BETA";
      coin.rejectedReason = "below_top_10pct";
      watchlist.push(coin);
    }
  }

  // Clean up temp field
  for (const coin of coins) {
    delete (coin as any)._expansionProb;
  }

  return { selected, watchlist, rejected };
}
