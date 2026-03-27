/**
 * Signal Explanation Engine — generates human-readable reasoning
 * for alpha grades, bonus/penalty, and key signal states.
 *
 * Designed to be consumed by CoinInsight page and admin dashboards.
 * Pure function: no I/O, no side effects.
 */

import type { AlphaSignals } from "./alphaTypes.ts";
import type { CoinUniverseData } from "../types.ts";

export interface SignalExplanation {
  /** One-line summary, e.g. "Compressed volatility + strong MTF alignment → breakout likely" */
  summary: string;
  /** Grade reasoning: why S/A/B/C/D */
  gradeReason: string;
  /** Key bullish factors (max 5) */
  bullish: string[];
  /** Key bearish factors (max 5) */
  bearish: string[];
  /** Risk warnings (max 3) */
  risks: string[];
  /** Data completeness note */
  dataNote: string | null;
  /** Regime context */
  regimeContext: string;
}

export function explainSignals(
  coin: CoinUniverseData,
  alpha: AlphaSignals | null,
): SignalExplanation {
  const bullish: string[] = [];
  const bearish: string[] = [];
  const risks: string[] = [];

  // ── Regime Context ──────────────────────────────────────────────
  const regimeContext = buildRegimeContext(coin);

  // ── No alpha → minimal explanation ─────────────────────────────
  if (!alpha) {
    return {
      summary: `${coin.symbol}: Alpha signals disabled or unavailable`,
      gradeReason: "No alpha data — grade not computed",
      bullish: [],
      bearish: [],
      risks: [],
      dataNote: buildDataNote(coin),
      regimeContext,
    };
  }

  // ── M1: Funding ─────────────────────────────────────────────────
  if (alpha.funding) {
    const f = alpha.funding;
    if (f.isExtreme && f.fundingDirection === "BEARISH_CROWD") {
      bullish.push(`Extreme bearish funding (crowding ${f.fundingCrowdingIndex}%) → contrarian long opportunity`);
    } else if (f.isExtreme && f.fundingDirection === "BULLISH_CROWD") {
      bearish.push(`Extreme bullish funding (crowding ${f.fundingCrowdingIndex}%) → crowded long, reversal risk`);
    }
    if (Math.abs(f.fundingMeanReversionSignal) > 50) {
      const dir = f.fundingMeanReversionSignal > 0 ? "bullish" : "bearish";
      bullish.push(`Funding mean-reversion signal: ${dir} (${f.fundingMeanReversionSignal > 0 ? "+" : ""}${f.fundingMeanReversionSignal.toFixed(0)})`);
    }
  }

  // ── M2: OI Shock ────────────────────────────────────────────────
  if (alpha.oiShock) {
    const oi = alpha.oiShock;
    if (oi.shockType === "DIVERGENT") {
      bullish.push(`OI-price divergence detected (score ${oi.oiShockScore}) → potential reversal setup`);
    }
    if (oi.shockType === "SPIKE" && oi.leverageBuildupIndicator > 70) {
      risks.push(`Leverage buildup high (${oi.leverageBuildupIndicator}%) — liquidation cascade risk`);
    }
    if (oi.shockType === "COLLAPSE") {
      bearish.push(`OI collapse — deleveraging in progress`);
    }
  }

  // ── M3: Volatility ─────────────────────────────────────────────
  if (alpha.volatility) {
    const v = alpha.volatility;
    if (v.volatilityRegime === "COMPRESSED" && v.expansionForecast > 70) {
      bullish.push(`Volatility compressed (BB width ${v.bollingerWidth.toFixed(1)}%) with ${v.expansionForecast}% expansion forecast → breakout imminent`);
    }
    if (v.volatilityRegime === "PANIC") {
      risks.push(`Panic volatility regime — extreme caution advised`);
    }
    if (v.volatilityRegime === "TRENDING" && v.compressionScore < 30) {
      bullish.push(`Trending regime with low compression → trend continuation likely`);
    }
  }

  // ── M4: Delta/CVD ──────────────────────────────────────────────
  if (alpha.delta) {
    const d = alpha.delta;
    const priceUp = coin.change24hPct > 0.5;
    if (priceUp && d.cvdTrend === "RISING" && d.deltaImbalanceScore > 40) {
      bullish.push(`CVD confirming price rise (delta imbalance +${d.deltaImbalanceScore.toFixed(0)}) — real buying pressure`);
    }
    if (priceUp && d.cvdTrend === "FALLING") {
      bearish.push(`CVD diverging from rising price — potential fakeout, selling into strength`);
    }
    if (!priceUp && d.cvdTrend === "RISING") {
      bullish.push(`CVD rising despite price drop — hidden accumulation`);
    }
  }

  // ── M5: Multi-TF ──────────────────────────────────────────────
  if (alpha.multiTf) {
    const m = alpha.multiTf;
    if (m.multiTfAlignmentScore >= 80 && m.htfTrendStrength > 60) {
      bullish.push(`Strong ${m.htfTrendBias.toLowerCase()} alignment across timeframes (${m.multiTfAlignmentScore}% aligned, HTF strength ${m.htfTrendStrength})`);
    }
    if (m.multiTfAlignmentScore === 0) {
      bearish.push(`Zero multi-timeframe alignment — conflicting signals across timeframes`);
    }
    if (m.ltfPullbackQuality > 70) {
      bullish.push(`High-quality LTF pullback (${m.ltfPullbackQuality}) → entry opportunity on dip`);
    }
  }

  // ── M6: Liquidation ────────────────────────────────────────────
  if (alpha.liquidation) {
    const l = alpha.liquidation;
    if (l.cascadeScore > 70) {
      risks.push(`Liquidation cascade risk high (${l.cascadeScore}%) — ${l.dominantRisk.replace("_", " ").toLowerCase()} risk`);
    }
    if (l.dominantRisk === "SHORT_SQUEEZE" && l.shortSqueezeProb > 60) {
      bullish.push(`Short squeeze probability ${l.shortSqueezeProb}% — shorts vulnerable`);
    }
    if (l.dominantRisk === "LONG_SQUEEZE" && l.longSqueezeProb > 60) {
      bearish.push(`Long squeeze probability ${l.longSqueezeProb}% — longs vulnerable`);
    }
  }

  // ── M7: Timing ─────────────────────────────────────────────────
  if (alpha.timing) {
    const t = alpha.timing;
    if (t.timingGrade === "A") {
      bullish.push(`Excellent entry timing (grade A) — momentum ignition ${t.momentumIgnitionScore}, trigger candle ${t.triggerCandleScore}`);
    }
    if (t.timingGrade === "D") {
      bearish.push(`Poor entry timing (grade D) — wait for better setup`);
    }
  }

  // ── M8: Liquidity ──────────────────────────────────────────────
  if (alpha.liquidity) {
    const liq = alpha.liquidity;
    if (liq.liquiditySweepProbability > 70) {
      bullish.push(`Liquidity sweep likely (${liq.liquiditySweepProbability}%) near key levels`);
    }
    if (liq.liquidityAbsorptionStrength < 25) {
      risks.push(`Weak liquidity absorption (${liq.liquidityAbsorptionStrength}%) — thin book, slippage risk`);
    }
  }

  // ── M9: Market Maker ───────────────────────────────────────────
  if (alpha.marketMaker) {
    const mm = alpha.marketMaker;
    if (mm.spoofingProbability > 65) {
      bearish.push(`High spoofing probability (${mm.spoofingProbability}%) — orderbook may be unreliable`);
    }
    if (mm.marketMakerControlScore > 70 && mm.spreadManipulationIndex < 30) {
      bullish.push(`Strong MM control with tight spread — stable execution environment`);
    }
  }

  // ── M10: Cross Market ──────────────────────────────────────────
  if (alpha.crossMarket) {
    const cm = alpha.crossMarket;
    if (cm.riskOnOffIndex > 70) {
      bullish.push(`Risk-on market environment (${cm.riskOnOffIndex}) — favorable for momentum trades`);
    }
    if (cm.riskOnOffIndex < 25) {
      bearish.push(`Risk-off market (${cm.riskOnOffIndex}) — defensive mode recommended`);
    }
    if (cm.btcDominanceMomentum < -30 && coin.symbol !== "BTCUSDT") {
      bullish.push(`BTC dominance declining → alt-season rotation favorable`);
    }
  }

  // ── M11: Structure ─────────────────────────────────────────────
  if (alpha.structure) {
    const s = alpha.structure;
    if (s.breakoutQualityScore > 70) {
      bullish.push(`High-quality breakout setup (${s.breakoutQualityScore}) — strong structural confirmation`);
    }
    if (s.trendExhaustionProbability > 75) {
      bearish.push(`Trend exhaustion likely (${s.trendExhaustionProbability}%) — reversal zone approaching`);
    }
    if (Math.abs(s.trappedRatio) > 60) {
      const side = s.trappedRatio > 0 ? "longs" : "shorts";
      bullish.push(`Trapped ${side} (ratio ${s.trappedRatio.toFixed(0)}) — potential squeeze catalyst`);
    }
  }

  // ── Grade Reasoning ────────────────────────────────────────────
  const net = alpha.alphaBonus - alpha.alphaPenalty;
  const gradeReason = buildGradeReason(alpha.alphaGrade, net, alpha.alphaBonus, alpha.alphaPenalty, bullish.length, bearish.length);

  // ── Summary ────────────────────────────────────────────────────
  const summary = buildSummary(coin, alpha, bullish, bearish, risks);

  return {
    summary,
    gradeReason,
    bullish: bullish.slice(0, 5),
    bearish: bearish.slice(0, 5),
    risks: risks.slice(0, 3),
    dataNote: buildDataNote(coin),
    regimeContext,
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function buildRegimeContext(coin: CoinUniverseData): string {
  const parts: string[] = [];
  parts.push(`Regime: ${coin.regime}`);
  parts.push(`Trend strength: ${coin.trendStrength}`);
  if (coin.atrPct != null) parts.push(`ATR: ${coin.atrPct.toFixed(2)}%`);
  if (coin.rsi14 != null) parts.push(`RSI: ${coin.rsi14.toFixed(1)}`);
  parts.push(`Flow: ${coin.aggressorFlow}`);
  if (coin.volumeSpike) parts.push("Volume spike active");
  return parts.join(" | ");
}

function buildDataNote(coin: CoinUniverseData): string | null {
  const missing: string[] = [];
  if (!coin.bars || coin.bars.length < 20) missing.push("klines (<20 bars)");
  if (coin.fundingRate == null) missing.push("funding rate");
  if (coin.depthUsd == null) missing.push("orderbook depth");
  if (coin.spreadBps == null) missing.push("spread data");
  if (missing.length === 0) return null;
  return `Limited data: missing ${missing.join(", ")}. Signal confidence reduced.`;
}

function buildGradeReason(
  grade: string,
  net: number,
  bonus: number,
  penalty: number,
  bullCount: number,
  bearCount: number,
): string {
  const netStr = net >= 0 ? `+${net.toFixed(1)}` : net.toFixed(1);
  switch (grade) {
    case "S":
      return `Grade S (net ${netStr}): Exceptional signal confluence — ${bullCount} bullish factors, bonus +${bonus.toFixed(1)} significantly outweighs penalty -${penalty.toFixed(1)}`;
    case "A":
      return `Grade A (net ${netStr}): Strong multi-module confirmation — ${bullCount} bullish vs ${bearCount} bearish signals`;
    case "B":
      return `Grade B (net ${netStr}): Moderate opportunity — signals mostly aligned but some conflict`;
    case "C":
      return `Grade C (net ${netStr}): Weak or mixed signals — penalties nearly offset bonuses`;
    case "D":
      return `Grade D (net ${netStr}): Significant headwinds — ${bearCount} bearish factors dominate, penalty -${penalty.toFixed(1)} exceeds bonus +${bonus.toFixed(1)}`;
    default:
      return `Grade ${grade} (net ${netStr})`;
  }
}

function buildSummary(
  coin: CoinUniverseData,
  alpha: AlphaSignals,
  bullish: string[],
  bearish: string[],
  risks: string[],
): string {
  const parts: string[] = [`${coin.symbol} [${alpha.alphaGrade}]`];

  // Regime + key state
  if (alpha.volatility?.volatilityRegime === "COMPRESSED") {
    parts.push("compressed volatility");
  } else if (alpha.volatility?.volatilityRegime === "PANIC") {
    parts.push("panic volatility");
  }

  if (alpha.multiTf && alpha.multiTf.multiTfAlignmentScore >= 80) {
    parts.push(`${alpha.multiTf.htfTrendBias.toLowerCase()} alignment`);
  }

  if (alpha.structure?.breakoutQualityScore && alpha.structure.breakoutQualityScore > 70) {
    parts.push("breakout setup");
  }

  if (alpha.funding?.isExtreme) {
    parts.push(`extreme ${alpha.funding.fundingDirection.toLowerCase().replace("_", " ")}`);
  }

  // Net sentiment
  if (bullish.length > bearish.length + risks.length) {
    parts.push("→ bullish bias");
  } else if (bearish.length + risks.length > bullish.length) {
    parts.push("→ cautious/bearish bias");
  } else {
    parts.push("→ mixed signals");
  }

  return parts.join(" | ");
}
