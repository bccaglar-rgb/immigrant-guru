import type { TradeIdeaRecord } from "./tradeIdeaTypes.ts";

/** Simulate a single resolved trade at a hypothetical RR ratio.
 *
 * Logic (no candle fetching required):
 *  - If trade resolved as SUCCESS (TP hit): actualRR = |hit_level_price - entryMid| / risk
 *    → candidateRR <= actualRR → WIN (price reached our hypothetical TP)
 *    → candidateRR >  actualRR → LOSS (price reversed before reaching hypothetical TP)
 *  - If trade resolved as FAIL (SL hit): always LOSS at any RR
 *  - Otherwise (NONE / no hit data): SKIP
 */
export function simulateTradeAtRR(
  trade: TradeIdeaRecord,
  rr: number,
): "WIN" | "LOSS" | "SKIP" {
  // Need resolved trade with price data
  if (!trade.hit_level_price || !trade.activated_at) return "SKIP";
  if (trade.result === "NONE") return "SKIP";

  const entryMid = (trade.entry_low + trade.entry_high) / 2;
  const sl = trade.sl_levels?.[0];
  if (sl == null) return "SKIP";

  const risk = Math.abs(entryMid - sl);
  if (risk <= 0) return "SKIP";

  if (trade.result === "SUCCESS" && trade.hit_level_type === "TP") {
    const actualRR = Math.abs(trade.hit_level_price - entryMid) / risk;
    return rr <= actualRR ? "WIN" : "LOSS";
  }

  if (trade.result === "FAIL" && trade.hit_level_type === "SL") {
    return "LOSS";
  }

  return "SKIP";
}

/** totalR for a set of trades at a given RR: each WIN = +rr, each LOSS = -1 */
export function calcTotalR(
  trades: TradeIdeaRecord[],
  rr: number,
): { totalR: number; wins: number; losses: number; total: number } {
  let totalR = 0;
  let wins = 0;
  let losses = 0;
  let total = 0;

  for (const t of trades) {
    const sim = simulateTradeAtRR(t, rr);
    if (sim === "SKIP") continue;
    total++;
    if (sim === "WIN") {
      totalR += rr;
      wins++;
    } else {
      totalR -= 1;
      losses++;
    }
  }

  return { totalR, wins, losses, total };
}
