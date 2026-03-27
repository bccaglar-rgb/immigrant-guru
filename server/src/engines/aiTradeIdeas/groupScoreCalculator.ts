/**
 * Group Score Calculators
 *
 * Computes 8 group scores from raw quant snapshot + alpha signals.
 * Each group: 0-100 score, weight, completeness ratio, and labeled signals.
 */

import type {
  GroupScoreDetail,
  AiPayloadGroupScores,
  AiPayloadPenaltyGroups,
  PenaltyGroupDetail,
  RawSignalEntry,
  SignalRole,
} from "./structuredPayloadTypes.ts";

type QS = Record<string, unknown>;

// ── Helpers ─────────────────────────────────────────────────────

const num = (obj: QS | undefined, key: string, fallback = 0): number => {
  if (!obj) return fallback;
  const v = Number(obj[key]);
  return Number.isFinite(v) ? v : fallback;
};

const str = (obj: QS | undefined, key: string, fallback = ""): string => {
  if (!obj) return fallback;
  return String(obj[key] ?? fallback);
};

const sub = (obj: QS | undefined, key: string): QS | undefined => {
  if (!obj) return undefined;
  const v = obj[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as QS) : undefined;
};

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

const round2 = (v: number): number => Math.round(v * 100) / 100;

function sig(value: unknown, role: SignalRole): RawSignalEntry {
  return { value, role };
}

/** Count non-null/non-NA signal values for completeness */
function completeness(signals: Record<string, RawSignalEntry>): number {
  const entries = Object.values(signals);
  if (entries.length === 0) return 0;
  const present = entries.filter(
    (s) => s.value !== null && s.value !== undefined && s.value !== "N/A" && s.value !== "",
  ).length;
  return round2(present / entries.length);
}

// ── Structure Group (weight: 0.20) ──────────────────────────────

function buildStructureGroup(snapshot: QS | undefined, alpha: QS | undefined): GroupScoreDetail {
  const st = sub(snapshot, "st");
  const lv = sub(snapshot, "lv");
  const aMultiTf = sub(alpha, "multiTf");

  const regime = num(st, "rg", -1);       // 0=range, 1=trend, 2=breakout
  const trendDir = num(st, "td", 0);      // -1/0/1
  const trendStrength = num(st, "ts", 0); // 0/1/2
  const emaAlign = num(st, "ema", 0);     // -1/0/1
  const vwapPos = num(st, "vw", 0);       // -1/0/1
  const timeInRange = num(st, "tir", 0);
  const structAge = num(st, "sa", 0);

  // Pivot swing levels from lv block
  const swingHigh = num(lv, "rh", 0);
  const swingLow = num(lv, "rl", 0);

  // HTF alignment from alpha
  const htfBias = str(aMultiTf, "htfTrendBias", "N/A");
  const mtfAlign = num(aMultiTf, "multiTfAlignmentScore", -1);

  // Score computation
  let score = 50;

  // Regime contribution (strongest factor)
  if (regime === 1 || regime === 2) score += 15;
  else if (regime === 0) score -= 10;
  else score -= 20; // unknown

  // Trend strength
  if (trendStrength === 2) score += 12;
  else if (trendStrength === 1) score += 5;
  else score -= 5;

  // EMA + VWAP alignment with trend
  if (trendDir !== 0) {
    if (emaAlign === trendDir) score += 8;
    else if (emaAlign === -trendDir) score -= 10;
    if (vwapPos === trendDir) score += 5;
    else if (vwapPos === -trendDir) score -= 5;
  }

  // Structure maturity (too old = less reliable)
  if (structAge > 2) score -= 3;
  if (timeInRange > 20) score -= 5;

  // MTF alignment bonus
  if (mtfAlign >= 70) score += 8;
  else if (mtfAlign >= 50) score += 3;
  else if (mtfAlign >= 0 && mtfAlign < 30) score -= 5;

  const regimeLabel = regime === 2 ? "BREAKOUT" : regime === 1 ? "TREND" : regime === 0 ? "RANGE" : "UNKNOWN";
  const trendDirLabel = trendDir > 0 ? "UP" : trendDir < 0 ? "DOWN" : "NEUTRAL";
  const trendStrLabel = trendStrength === 2 ? "HIGH" : trendStrength === 1 ? "MID" : "LOW";
  const emaLabel = emaAlign > 0 ? "BULL" : emaAlign < 0 ? "BEAR" : "MIXED";
  const vwapLabel = vwapPos > 0 ? "ABOVE" : vwapPos < 0 ? "BELOW" : "AT";
  const ageLabel = structAge >= 2 ? "MATURE" : structAge === 1 ? "MID" : "FRESH";

  const signals: Record<string, RawSignalEntry> = {
    market_regime: sig(regimeLabel, "primary"),
    trend_direction: sig(trendDirLabel, "primary"),
    trend_strength: sig(trendStrLabel, "primary"),
    ema_alignment: sig(emaLabel, "primary"),
    vwap_position: sig(vwapLabel, "supporting"),
    structure_age: sig(ageLabel, "contextual"),
    time_in_range_bars: sig(timeInRange, "contextual"),
    pivot_swing_high: sig(swingHigh > 0 ? swingHigh : "N/A", "supporting"),
    pivot_swing_low: sig(swingLow > 0 ? swingLow : "N/A", "supporting"),
    htf_trend_bias: sig(htfBias, "supporting"),
    multi_tf_alignment: sig(mtfAlign >= 0 ? mtfAlign : "N/A", "supporting"),
  };

  return {
    score: clamp(Math.round(score), 0, 100),
    weight: 0.20,
    completeness: completeness(signals),
    signals,
  };
}

// ── Liquidity Group (weight: 0.20) ──────────────────────────────

function buildLiquidityGroup(snapshot: QS | undefined, alpha: QS | undefined): GroupScoreDetail {
  const lq = sub(snapshot, "lq");
  const lv = sub(snapshot, "lv");
  const aLiq = sub(alpha, "liquidation");

  const obImbalance = num(lq, "ob", 0);   // -1/0/1
  const spread = num(lq, "sp", 1);        // 0=wide, 1=mid, 2=tight
  const depth = num(lq, "dp", 1);         // 0/1/2
  const depthRatio = num(lq, "d", 0.15);

  const r1 = num(lv, "r1", 0);
  const s1 = num(lv, "s1", 0);

  const longSqueeze = num(aLiq, "longSqueezeProb", -1);
  const shortSqueeze = num(aLiq, "shortSqueezeProb", -1);
  const cascadeScore = num(aLiq, "cascadeScore", -1);

  let score = 50;
  if (spread === 2) score += 12;
  else if (spread === 0) score -= 12;
  if (depth === 2) score += 10;
  else if (depth === 0) score -= 10;
  if (Math.abs(obImbalance) === 1) score += 8;
  if (depthRatio > 0.2) score += 5;
  else if (depthRatio < 0.08) score -= 5;
  if (r1 > 0 && s1 > 0) score += 5; // clear levels
  if (cascadeScore > 60) score -= 8;

  const obLabel = obImbalance > 0 ? "BUY" : obImbalance < 0 ? "SELL" : "NEUTRAL";
  const spreadLabel = spread === 2 ? "TIGHT" : spread === 1 ? "MID" : "WIDE";
  const depthLabel = depth === 2 ? "HIGH" : depth === 1 ? "MID" : "LOW";

  const signals: Record<string, RawSignalEntry> = {
    orderbook_imbalance: sig(obLabel, "primary"),
    depth_quality: sig(depthLabel, "primary"),
    spread_regime: sig(spreadLabel, "supporting"),
    liquidity_distance_pct: sig(depthRatio > 0 ? round2(depthRatio) : "N/A", "supporting"),
    stop_cluster_above: sig(shortSqueeze >= 0 ? shortSqueeze > 50 : "N/A", "contextual"),
    stop_cluster_below: sig(longSqueeze >= 0 ? longSqueeze > 50 : "N/A", "contextual"),
    cascade_score: sig(cascadeScore >= 0 ? cascadeScore : "N/A", "informational"),
  };

  return {
    score: clamp(Math.round(score), 0, 100),
    weight: 0.20,
    completeness: completeness(signals),
    signals,
  };
}

// ── Positioning Group (weight: 0.18) ────────────────────────────

function buildPositioningGroup(snapshot: QS | undefined, alpha: QS | undefined): GroupScoreDetail {
  const ps = sub(snapshot, "ps");
  const aFunding = sub(alpha, "funding");
  const aOiShock = sub(alpha, "oiShock");
  const aLiq = sub(alpha, "liquidation");

  const fundingBias = num(ps, "fb", 0);
  const buySellBias = num(ps, "bs", 0);
  const liqBias = num(ps, "lb", 0);

  const fundingCrowding = num(aFunding, "fundingCrowdingIndex", -1);
  const isExtreme = aFunding ? Boolean(aFunding.isExtreme) : false;
  const fundingDir = str(aFunding, "fundingDirection", "N/A");
  const oiShockScore = num(aOiShock, "oiShockScore", -1);
  const leverageBuildup = num(aOiShock, "leverageBuildupIndicator", -1);
  const longSqueeze = num(aLiq, "longSqueezeProb", -1);
  const shortSqueeze = num(aLiq, "shortSqueezeProb", -1);

  let score = 55;
  // Neutral funding = good (not crowded)
  if (fundingCrowding >= 0 && fundingCrowding < 40) score += 10;
  else if (fundingCrowding > 70) score -= 12;
  if (isExtreme) score -= 8;
  // OI shock is a warning
  if (oiShockScore > 60) score -= 8;
  else if (oiShockScore >= 0 && oiShockScore < 30) score += 5;
  // Balanced liquidations = healthy
  if (longSqueeze >= 0 && shortSqueeze >= 0) {
    if (Math.abs(longSqueeze - shortSqueeze) < 15) score += 5;
    else score -= 5;
  }

  const fundingLabel = fundingBias > 0 ? "BULLISH" : fundingBias < 0 ? "BEARISH" : "NEUTRAL";
  const bsLabel = buySellBias > 0 ? "BUY_HEAVY" : buySellBias < 0 ? "SELL_HEAVY" : "NEUTRAL";
  const liqLabel = liqBias > 0 ? "SHORTS_VULNERABLE" : liqBias < 0 ? "LONGS_VULNERABLE" : "BALANCED";

  const signals: Record<string, RawSignalEntry> = {
    funding_bias: sig(fundingLabel, "primary"),
    funding_crowding: sig(fundingCrowding >= 0 ? fundingCrowding : "N/A", "primary"),
    funding_extreme: sig(isExtreme, "supporting"),
    funding_direction: sig(fundingDir, "contextual"),
    oi_shock_score: sig(oiShockScore >= 0 ? oiShockScore : "N/A", "supporting"),
    leverage_buildup: sig(leverageBuildup >= 0 ? leverageBuildup : "N/A", "contextual"),
    liquidations_bias: sig(liqLabel, "supporting"),
    buy_sell_imbalance: sig(bsLabel, "contextual"),
  };

  return {
    score: clamp(Math.round(score), 0, 100),
    weight: 0.18,
    completeness: completeness(signals),
    signals,
  };
}

// ── Execution Group (weight: 0.17) ──────────────────────────────

function buildExecutionGroup(snapshot: QS | undefined): GroupScoreDetail {
  const ex = sub(snapshot, "ex");
  const lq = sub(snapshot, "lq");

  const fillProb = num(ex, "pf", -1);
  const capacity = num(ex, "cpct", -1);
  const entryOpen = num(ex, "en", -1);
  const slippage = num(ex, "sl", 1);  // 0=tight, 1=mid, 2=wide

  const spread = num(lq, "sp", 1);
  const depth = num(lq, "dp", 1);

  let score = 50;
  if (fillProb >= 0) score += fillProb * 20;
  if (capacity >= 0) score += capacity * 10;
  if (entryOpen === 1) score += 10;
  else if (entryOpen === 0) score -= 5;
  if (slippage === 0) score += 10;
  else if (slippage === 2) score -= 15;
  if (spread === 2) score += 5;
  else if (spread === 0) score -= 8;

  const slipLabel = slippage === 0 ? "LOW" : slippage === 1 ? "MID" : "HIGH";
  const entryLabel = entryOpen === 1 ? "OPEN" : entryOpen === 0 ? "CLOSED" : "N/A";
  const qualityScore = clamp(Math.round(score), 0, 100);
  const qualityLabel = qualityScore >= 70 ? "GOOD" : qualityScore >= 50 ? "FAIR" : "POOR";

  const signals: Record<string, RawSignalEntry> = {
    fill_probability: sig(fillProb >= 0 ? round2(fillProb) : "N/A", "primary"),
    capacity: sig(capacity >= 0 ? round2(capacity) : "N/A", "primary"),
    entry_timing: sig(entryLabel, "supporting"),
    slippage: sig(slipLabel, "primary"),
    entry_quality_score: sig(qualityLabel, "informational"),
  };

  return {
    score: clamp(Math.round(score), 0, 100),
    weight: 0.17,
    completeness: completeness(signals),
    signals,
  };
}

// ── Volatility Group (weight: 0.12) ─────────────────────────────

function buildVolatilityGroup(snapshot: QS | undefined, alpha: QS | undefined): GroupScoreDetail {
  const vo = sub(snapshot, "vo");
  const aVol = sub(alpha, "volatility");

  const compression = num(vo, "cp", -1);
  const atrRegime = num(vo, "atr", 1);    // 0=low, 1=mid, 2=high
  const marketStress = num(vo, "ms", 0);
  const expansionProb = num(vo, "xp", 1);

  const volRegime = str(aVol, "volatilityRegime", "N/A");
  const alphaCompression = num(aVol, "compressionScore", -1);
  const alphaExpansion = num(aVol, "expansionForecast", -1);
  const shockIndex = num(aVol, "volatilityShockIndex", -1);

  let score = 55;
  // Moderate volatility is best
  if (atrRegime === 1) score += 10;
  else if (atrRegime === 0) score -= 8; // dead
  else if (atrRegime === 2) score -= 3; // too hot

  if (compression === 1) score += 8; // compression = potential breakout
  if (volRegime === "COMPRESSED") score += 5;
  else if (volRegime === "PANIC") score -= 15;

  if (alphaExpansion >= 60) score += 5;
  if (shockIndex > 60) score -= 10;
  if (marketStress >= 2) score -= 10;

  const atrLabel = atrRegime >= 2 ? "HIGH" : atrRegime === 0 ? "LOW" : "MID";
  const speedLabel = atrRegime >= 2 ? "FAST" : atrRegime === 0 ? "SLOW" : "MODERATE";
  const compLabel = compression === 1 ? "ON" : compression === 0 ? "OFF" : "N/A";
  const breakoutRisk = compression === 1 && alphaExpansion >= 60 ? "HIGH" : compression === 1 ? "MID" : "LOW";

  const signals: Record<string, RawSignalEntry> = {
    atr_regime: sig(atrLabel, "primary"),
    compression: sig(compLabel, "primary"),
    market_speed: sig(speedLabel, "supporting"),
    expansion_probability: sig(alphaExpansion >= 0 ? alphaExpansion : "N/A", "supporting"),
    breakout_risk: sig(breakoutRisk, "contextual"),
    volatility_regime: sig(volRegime, "contextual"),
    volatility_shock_index: sig(shockIndex >= 0 ? shockIndex : "N/A", "informational"),
  };

  return {
    score: clamp(Math.round(score), 0, 100),
    weight: 0.12,
    completeness: completeness(signals),
    signals,
  };
}

// ── Risk Environment Group (weight: 0.10) ───────────────────────

function buildRiskEnvironmentGroup(snapshot: QS | undefined, alpha: QS | undefined): GroupScoreDetail {
  const o = sub(snapshot, "o");
  const vo = sub(snapshot, "vo");
  const aLiq = sub(alpha, "liquidation");
  const aFunding = sub(alpha, "funding");

  const signalConflict = num(o, "sc", 1);      // 1=low, 2=mid, 3=high
  const cascadeRisk = num(o, "cr", 0);
  const marketStress = num(vo, "ms", 0);
  const crowdingIndex = num(aFunding, "fundingCrowdingIndex", -1);
  const cascadeScore = num(aLiq, "cascadeScore", -1);

  let score = 70; // start healthy, deduct for risk
  if (signalConflict >= 3) score -= 20;
  else if (signalConflict >= 2) score -= 10;
  if (cascadeRisk >= 2) score -= 15;
  else if (cascadeRisk >= 1) score -= 5;
  if (marketStress >= 2) score -= 15;
  else if (marketStress >= 1) score -= 5;
  if (crowdingIndex > 70) score -= 10;
  if (cascadeScore > 60) score -= 10;

  const conflictLabel = signalConflict >= 3 ? "HIGH" : signalConflict >= 2 ? "MID" : "LOW";
  const cascadeLabel = cascadeRisk >= 2 ? "HIGH" : cascadeRisk >= 1 ? "MID" : "LOW";
  const stressLabel = marketStress >= 2 ? "HIGH" : marketStress >= 1 ? "MID" : "LOW";
  const crowdingLabel = crowdingIndex > 70 ? "HIGH" : crowdingIndex > 40 ? "MID" : crowdingIndex >= 0 ? "LOW" : "N/A";

  const signals: Record<string, RawSignalEntry> = {
    signal_conflict: sig(conflictLabel, "primary"),
    cascade_risk: sig(cascadeLabel, "primary"),
    market_stress: sig(stressLabel, "primary"),
    crowding_risk: sig(crowdingLabel, "supporting"),
  };

  return {
    score: clamp(Math.round(score), 0, 100),
    weight: 0.10,
    completeness: completeness(signals),
    signals,
  };
}

// ── Data Health Group (weight: 0.03) ────────────────────────────

function buildDataHealthGroup(snapshot: QS | undefined): GroupScoreDetail {
  const ed = sub(snapshot, "ed");

  const latency = num(ed, "lat", -1);
  const staleFeed = num(ed, "stale", 0);
  const missingFields = num(ed, "mf", 0);
  const feedCount = num(ed, "fc", 6);
  const degradedFeeds = num(ed, "df", 0);

  let score = 100;
  if (staleFeed > 0) score -= 25;
  if (missingFields > 2) score -= 15;
  else if (missingFields > 0) score -= 5;
  if (degradedFeeds > 2) score -= 15;
  else if (degradedFeeds > 0) score -= 5;
  if (latency > 5000) score -= 15;
  else if (latency > 2000) score -= 5;

  const signals: Record<string, RawSignalEntry> = {
    latency_ms: sig(latency >= 0 ? latency : "N/A", "informational"),
    stale_feed: sig(staleFeed > 0, "primary"),
    missing_fields: sig(missingFields, "primary"),
    feed_count: sig(feedCount, "informational"),
    degraded_feeds: sig(degradedFeeds, "supporting"),
  };

  return {
    score: clamp(Math.round(score), 0, 100),
    weight: 0.03,
    completeness: completeness(signals),
    signals,
  };
}

// ── On-chain Context Group (weight: 0.00 — informational) ───────

function buildOnchainGroup(_snapshot: QS | undefined): GroupScoreDetail {
  // Currently no on-chain data available in the pipeline
  // Placeholder for future exchange flow, whale activity, MVRV, NVT etc.
  const signals: Record<string, RawSignalEntry> = {
    exchange_flows: sig("N/A", "informational"),
    whale_activity: sig("N/A", "informational"),
    relative_strength_vs_market: sig("N/A", "contextual"),
  };

  return {
    score: 50, // neutral when no data
    weight: 0.00,
    completeness: 0,
    signals,
  };
}

// ── Penalty Groups ──────────────────────────────────────────────

export function buildPenaltyGroups(
  snapshot: QS | undefined,
  alpha: QS | undefined,
  softFlags: string[],
  tradeValidity: string,
  slippageRisk: string,
  entryWindow: string,
): AiPayloadPenaltyGroups {
  // Execution penalties
  const execDrivers: string[] = [];
  let execImpact = 0;
  if (slippageRisk === "HIGH" || slippageRisk === "EXTREME") {
    execDrivers.push("high_slippage_risk");
    execImpact += 1.5;
  } else if (slippageRisk === "MID") {
    execDrivers.push("moderate_slippage");
    execImpact += 0.5;
  }
  const ex = sub(snapshot, "ex");
  const fillProb = num(ex, "pf", 1);
  if (fillProb < 0.5) {
    execDrivers.push("low_fill_probability");
    execImpact += 1.0;
  }
  if (entryWindow === "CLOSED") {
    execDrivers.push("entry_window_closed");
    execImpact += 1.0;
  }
  if (softFlags.includes("slippage_risk")) {
    execDrivers.push("slippage_flag");
    execImpact += 0.5;
  }

  // Risk penalties
  const riskDrivers: string[] = [];
  let riskImpact = 0;
  const o = sub(snapshot, "o");
  const signalConflict = num(o, "sc", 1);
  if (signalConflict >= 3) {
    riskDrivers.push("high_signal_conflict");
    riskImpact += 2.0;
  } else if (signalConflict >= 2) {
    riskDrivers.push("moderate_signal_conflict");
    riskImpact += 0.8;
  }
  const vo = sub(snapshot, "vo");
  const marketStress = num(vo, "ms", 0);
  if (marketStress >= 2) {
    riskDrivers.push("high_market_stress");
    riskImpact += 1.5;
  }
  const aLiq = sub(alpha, "liquidation");
  const cascadeScore = num(aLiq, "cascadeScore", 0);
  if (cascadeScore > 60) {
    riskDrivers.push("cascade_risk_elevated");
    riskImpact += 1.0;
  }
  const aFunding = sub(alpha, "funding");
  const crowdingIndex = num(aFunding, "fundingCrowdingIndex", 0);
  if (crowdingIndex > 70) {
    riskDrivers.push("crowding_high");
    riskImpact += 0.8;
  }
  if (softFlags.includes("signal_conflict")) {
    riskDrivers.push("conflict_flag");
    riskImpact += 0.5;
  }

  // Data penalties
  const dataDrivers: string[] = [];
  let dataImpact = 0;
  const ed = sub(snapshot, "ed");
  if (num(ed, "stale", 0) > 0) {
    dataDrivers.push("stale_feed");
    dataImpact += 1.5;
  }
  if (num(ed, "mf", 0) > 2) {
    dataDrivers.push("missing_fields");
    dataImpact += 1.0;
  }
  if (num(ed, "df", 0) > 0) {
    dataDrivers.push("degraded_feeds");
    dataImpact += 0.5;
  }

  // Context penalties
  const contextDrivers: string[] = [];
  let contextImpact = 0;
  const st = sub(snapshot, "st");
  const regime = num(st, "rg", -1);
  if (regime === 0) {
    contextDrivers.push("range_regime");
    contextImpact += 1.5;
  }
  const structAge = num(st, "sa", 0);
  if (structAge >= 3) {
    contextDrivers.push("maturity_exhaustion");
    contextImpact += 0.8;
  }
  const vwapPos = num(st, "vw", 0);
  const trendDir = num(st, "td", 0);
  if (trendDir > 0 && vwapPos < 0) {
    contextDrivers.push("long_bias_below_vwap");
    contextImpact += 0.8;
  } else if (trendDir < 0 && vwapPos > 0) {
    contextDrivers.push("short_bias_above_vwap");
    contextImpact += 0.8;
  }
  if (tradeValidity === "WEAK") {
    contextDrivers.push("weak_validity");
    contextImpact += 1.0;
  }
  if (softFlags.includes("weak_validity")) {
    contextDrivers.push("validity_flag");
    contextImpact += 0.3;
  }

  return {
    execution_penalty: { score_impact: round2(execImpact), drivers: execDrivers },
    risk_penalty: { score_impact: round2(riskImpact), drivers: riskDrivers },
    data_penalty: { score_impact: round2(dataImpact), drivers: dataDrivers },
    context_penalty: { score_impact: round2(contextImpact), drivers: contextDrivers },
  };
}

// ── Public API ──────────────────────────────────────────────────

export function buildAllGroupScores(
  snapshot: QS | undefined,
  alpha: QS | undefined,
): AiPayloadGroupScores {
  return {
    structure: buildStructureGroup(snapshot, alpha),
    liquidity: buildLiquidityGroup(snapshot, alpha),
    positioning: buildPositioningGroup(snapshot, alpha),
    execution: buildExecutionGroup(snapshot),
    volatility: buildVolatilityGroup(snapshot, alpha),
    risk_environment: buildRiskEnvironmentGroup(snapshot, alpha),
    data_health: buildDataHealthGroup(snapshot),
    onchain_context: buildOnchainGroup(snapshot),
  };
}
