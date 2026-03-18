/**
 * False Filter — Stage 3 (Penalty up to 30 points)
 *
 * Identifies false setups and applies penalty:
 *   - Fake Breakout    (0-8): price near S/R but no volume confirmation
 *   - Signal Conflict  (0-7): RSI vs momentum contradiction
 *   - Trap Probability (0-7): bull/bear trap detection
 *   - Cascade Risk     (0-5): liquidation cascade risk
 *   - News Risk        (0-3): abnormal move without structure
 */

import type { CoinUniverseData, FalsePenalty } from "./types.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function computeFalsePenalty(coin: CoinUniverseData): FalsePenalty {
  // 1. Fake Breakout (0-8)
  // Price near S/R but volume is below average = likely fake
  let fakeBreakout = 0;
  if (coin.srDistPct !== null && coin.srDistPct < 1.5) {
    // Near a level — check volume confirmation
    if (!coin.volumeSpike) {
      fakeBreakout += 4; // near level without volume = suspicious
    }
    // RSI in neutral zone + near level = weak conviction
    if (coin.rsi14 !== null && coin.rsi14 > 40 && coin.rsi14 < 60) {
      fakeBreakout += 2;
    }
    // Imbalance opposing the move direction
    if (coin.imbalance !== null) {
      const moveUp = coin.change24hPct > 0;
      const imbalanceBearish = coin.imbalance < -0.2;
      const imbalanceBullish = coin.imbalance > 0.2;
      if ((moveUp && imbalanceBearish) || (!moveUp && imbalanceBullish)) {
        fakeBreakout += 2;
      }
    }
  }
  fakeBreakout = clamp(fakeBreakout, 0, 8);

  // 2. Signal Conflict (0-7)
  // RSI says one thing, momentum says another
  let signalConflict = 0;
  if (coin.rsi14 !== null) {
    const rsiOversold = coin.rsi14 < 30;
    const rsiOverbought = coin.rsi14 > 70;
    const momentumUp = coin.change24hPct > 3;
    const momentumDown = coin.change24hPct < -3;

    // Overbought RSI but still rising strongly = potential exhaustion
    if (rsiOverbought && momentumUp) signalConflict += 3;
    // Oversold RSI but still dropping strongly = potential continuation
    if (rsiOversold && momentumDown) signalConflict += 3;

    // Funding vs momentum conflict
    if (coin.fundingRate !== null) {
      const fundingBullish = coin.fundingRate > 0.0003;
      const fundingBearish = coin.fundingRate < -0.0003;
      if ((fundingBullish && momentumDown) || (fundingBearish && momentumUp)) {
        signalConflict += 2;
      }
    }

    // Flow vs price conflict
    if (coin.aggressorFlow === "BUY" && coin.change24hPct < -2) signalConflict += 2;
    if (coin.aggressorFlow === "SELL" && coin.change24hPct > 2) signalConflict += 2;
  }
  signalConflict = clamp(signalConflict, 0, 7);

  // 3. Trap Probability (0-7)
  // Bull/bear trap detection
  let trapProbability = 0;
  if (coin.nearestSR) {
    const isNearResistance = coin.nearestSR.type === "resistance" && coin.srDistPct !== null && coin.srDistPct < 2;
    const isNearSupport = coin.nearestSR.type === "support" && coin.srDistPct !== null && coin.srDistPct < 2;

    // Bull trap: price near resistance + weak volume + overbought
    if (isNearResistance && coin.change24hPct > 0) {
      if (!coin.volumeSpike) trapProbability += 3;
      if (coin.rsi14 !== null && coin.rsi14 > 70) trapProbability += 2;
    }

    // Bear trap: price near support + weak volume + oversold
    if (isNearSupport && coin.change24hPct < 0) {
      if (!coin.volumeSpike) trapProbability += 3;
      if (coin.rsi14 !== null && coin.rsi14 < 30) trapProbability += 2;
    }

    // Weak S/R level increases trap probability
    if (coin.nearestSR.strength === "WEAK") trapProbability += 2;
  }
  trapProbability = clamp(trapProbability, 0, 7);

  // 4. Cascade Risk (0-5)
  // Liquidation cascade from extreme funding + high OI
  let cascadeRisk = 0;
  if (coin.fundingRate !== null && Math.abs(coin.fundingRate) > 0.0008) {
    cascadeRisk += 2; // extreme funding = crowded trade
  }
  if (coin.oiChange !== null && coin.oiChange > 8) {
    cascadeRisk += 2; // rapid OI buildup = cascade risk
  }
  if (coin.atrPct !== null && coin.atrPct > 4) {
    cascadeRisk += 1; // extremely volatile = cascade amplifier
  }
  cascadeRisk = clamp(cascadeRisk, 0, 5);

  // 5. News Risk (0-3)
  // Abnormal move without structural backing
  let newsRisk = 0;
  const absChange = Math.abs(coin.change24hPct);
  if (absChange > 8) {
    // Huge move — check if it has structural support
    if (coin.regime === "RANGE" || coin.regime === "UNKNOWN") {
      newsRisk += 2; // large move in range/unknown regime = news-driven
    }
    if (coin.trendStrength < 30) {
      newsRisk += 1; // weak trend strength + big move = likely news
    }
  }
  newsRisk = clamp(newsRisk, 0, 3);

  const total = clamp(fakeBreakout + signalConflict + trapProbability + cascadeRisk + newsRisk, 0, 30);

  return {
    total,
    fakeBreakout,
    signalConflict,
    trapProbability,
    cascadeRisk,
    newsRisk,
  };
}
