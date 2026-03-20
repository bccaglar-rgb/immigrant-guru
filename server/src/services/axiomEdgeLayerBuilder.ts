/**
 * Axiom Edge Layer Builder
 *
 * Transforms existing Bitrium market data (quantSnapshot, alpha signals,
 * hub snapshots) into the structured 5-layer input format required by
 * the Axiom AI Trading Engine.
 */

// ── Types ────────────────────────────────────────────────────────

export interface AxiomEdgeLayerInput {
  symbol: string;
  timeframe: string;
  price: number;

  market_regime: {
    state: "trend" | "range" | "transition";
    trend_direction: "up" | "down" | "neutral";
    trend_strength: number;       // 0-1
    range_condition: boolean;
    transition_risk: number;      // 0-1
  };

  liquidity: {
    nearest_buyside_liquidity: number;
    nearest_sellside_liquidity: number;
    major_liquidity_target_up: number;
    major_liquidity_target_down: number;
    liquidity_clarity_score: number;   // 0-1
    sweep_risk_up: number;             // 0-1
    sweep_risk_down: number;           // 0-1
    stop_cluster_above: boolean;
    stop_cluster_below: boolean;
  };

  positioning: {
    funding_bias: string;                  // "long_heavy" | "short_heavy" | "neutral"
    open_interest_change_pct: number;
    liquidation_bias: string;              // "longs_vulnerable" | "shorts_vulnerable" | "balanced"
    crowd_position: string;                // "overlong" | "overshort" | "balanced"
    trap_probability_longs: number;        // 0-1
    trap_probability_shorts: number;       // 0-1
  };

  volatility: {
    state: "compression" | "expansion" | "exhaustion" | "dead";
    expansion_probability: number;   // 0-1
    exhaustion_risk: number;         // 0-1
    market_speed: string;            // "slow" | "moderate" | "fast"
  };

  execution: {
    spread_score: number;            // 0-1
    depth_score: number;             // 0-1
    slippage_risk: number;           // 0-1
    entry_efficiency_score: number;  // 0-1
  };

  context: {
    ema_alignment: string;           // "bullish" | "bearish" | "mixed"
    vwap_position: string;           // "above" | "below" | "at"
    time_in_range_score: number;     // 0-1
    move_participation_score: number; // 0-1
    signal_conflict_level: number;   // 0-1
    market_stress: number;           // 0-1
  };

  risk_model: {
    min_rr: number;
    max_signal_conflict: number;
    max_market_stress: number;
    min_liquidity_clarity: number;
    min_confidence: number;
  };
}

// ── Quant Snapshot abbreviated field accessors ───────────────────

type QS = Record<string, unknown>;

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
  return (v && typeof v === "object" && !Array.isArray(v)) ? v as QS : undefined;
};

// ── Builder ──────────────────────────────────────────────────────

/**
 * Build structured 5-layer input for the Axiom AI engine.
 *
 * @param symbol     Trading pair (e.g. "BTCUSDT")
 * @param price      Current market price
 * @param timeframe  Candle timeframe (e.g. "15m")
 * @param snapshot   Abbreviated quant engine JSON (st, lq, ps, vo, ex, ed, ag, o, lv)
 * @param alpha      Alpha signals from Coin Universe engine (optional)
 */
export function buildAxiomEdgeLayerInput(
  symbol: string,
  price: number,
  timeframe: string,
  snapshot: QS | undefined,
  alpha?: QS | null,
): AxiomEdgeLayerInput {
  const st = sub(snapshot, "st");
  const lq = sub(snapshot, "lq");
  const ps = sub(snapshot, "ps");
  const vo = sub(snapshot, "vo");
  const ex = sub(snapshot, "ex");
  const ed = sub(snapshot, "ed");
  const lv = sub(snapshot, "lv");
  const ag = sub(snapshot, "ag");
  const o = sub(snapshot, "o");

  // Alpha sub-modules
  const aFunding = sub(alpha, "funding");
  const aVolatility = sub(alpha, "volatility");
  const aLiquidation = sub(alpha, "liquidation");
  const aMultiTf = sub(alpha, "multiTf");
  const aDelta = sub(alpha, "delta");
  const aOiShock = sub(alpha, "oiShock");

  return {
    symbol,
    timeframe,
    price,

    market_regime: buildMarketRegime(st, vo, aVolatility),
    liquidity: buildLiquidity(lq, lv, price, aLiquidation),
    positioning: buildPositioning(ps, aFunding, aLiquidation, aOiShock),
    volatility: buildVolatility(vo, aVolatility),
    execution: buildExecution(ex, lq, ed),
    context: buildContext(st, ag, o, aDelta, aMultiTf),
    risk_model: {
      min_rr: 2.0,
      max_signal_conflict: 0.45,
      max_market_stress: 0.65,
      min_liquidity_clarity: 0.60,
      min_confidence: 0.62,
    },
  };
}

// ── Layer Builders ───────────────────────────────────────────────

function buildMarketRegime(
  st: QS | undefined,
  vo: QS | undefined,
  aVol: QS | undefined,
): AxiomEdgeLayerInput["market_regime"] {
  const regime = num(st, "rg", 0); // 0=range, 1=trend, 2=breakout
  const trendDir = num(st, "td", 0); // -1/0/1
  const trendStrength = num(st, "ts", 1); // 1=LOW, 2=HIGH
  const compression = num(vo, "cp", 0);
  const marketStress = num(vo, "ms", 0);

  // Determine state
  let state: "trend" | "range" | "transition";
  if (regime === 2) {
    state = "trend"; // breakout is a type of trend
  } else if (regime === 1) {
    state = "trend";
  } else if (regime === 0) {
    state = "range";
  } else {
    state = "transition";
  }

  // If market stress is high and regime is unclear, mark as transition
  if (marketStress >= 2 && trendStrength <= 1) {
    state = "transition";
  }

  // Trend direction
  const trend_direction = trendDir > 0 ? "up" as const
    : trendDir < 0 ? "down" as const
    : "neutral" as const;

  // Trend strength normalized to 0-1
  const rawStrength = trendStrength === 2 ? 0.8 : trendStrength === 1 ? 0.4 : 0.1;
  // Boost if breakout
  const trend_strength = regime === 2 ? Math.min(rawStrength + 0.15, 1.0) : rawStrength;

  // Range condition
  const range_condition = regime === 0;

  // Transition risk: higher when mixed signals
  let transition_risk = 0.1;
  if (state === "transition") transition_risk = 0.7;
  else if (state === "range" && compression === 1) transition_risk = 0.4;
  else if (marketStress >= 1) transition_risk = 0.3;

  // Use alpha volatility if available for better transition detection
  const volRegime = str(aVol, "volatilityRegime", "");
  if (volRegime === "PANIC") transition_risk = Math.max(transition_risk, 0.6);

  return { state, trend_direction, trend_strength, range_condition, transition_risk };
}

function buildLiquidity(
  lq: QS | undefined,
  lv: QS | undefined,
  price: number,
  aLiq: QS | undefined,
): AxiomEdgeLayerInput["liquidity"] {
  // Key levels from lv block
  const r1 = num(lv, "r1", 0);
  const s1 = num(lv, "s1", 0);
  const rh = num(lv, "rh", 0);
  const rl = num(lv, "rl", 0);

  // Nearest liquidity targets
  const nearest_buyside = r1 > price ? r1 : rh > price ? rh : price * 1.01;
  const nearest_sellside = s1 > 0 && s1 < price ? s1 : rl > 0 && rl < price ? rl : price * 0.99;
  const major_up = rh > nearest_buyside ? rh : nearest_buyside * 1.015;
  const major_down = rl > 0 && rl < nearest_sellside ? rl : nearest_sellside * 0.985;

  // Liquidity clarity from spread + depth
  const spread = num(lq, "sp", 1); // 0=wide, 1=mid, 2=tight
  const depth = num(lq, "dp", 1); // 0=LOW, 1=MID, 2=HIGH
  const depthRatio = num(lq, "d", 0.15);
  const liquidity_clarity = clamp((spread / 2) * 0.4 + (depth / 2) * 0.35 + depthRatio * 0.25 / 0.35, 0, 1);

  // Sweep risk from orderbook imbalance
  const obImbalance = num(lq, "ob", 0); // -1/0/1
  const sweep_risk_up = obImbalance < 0 ? 0.7 : obImbalance === 0 ? 0.4 : 0.2;
  const sweep_risk_down = obImbalance > 0 ? 0.7 : obImbalance === 0 ? 0.4 : 0.2;

  // Stop clusters from liquidation alpha
  const longSqueeze = num(aLiq, "longSqueezeProb", 30);
  const shortSqueeze = num(aLiq, "shortSqueezeProb", 30);
  const stop_cluster_above = shortSqueeze > 50;
  const stop_cluster_below = longSqueeze > 50;

  return {
    nearest_buyside_liquidity: round(nearest_buyside),
    nearest_sellside_liquidity: round(nearest_sellside),
    major_liquidity_target_up: round(major_up),
    major_liquidity_target_down: round(major_down),
    liquidity_clarity_score: round2(liquidity_clarity),
    sweep_risk_up: round2(sweep_risk_up),
    sweep_risk_down: round2(sweep_risk_down),
    stop_cluster_above,
    stop_cluster_below,
  };
}

function buildPositioning(
  ps: QS | undefined,
  aFunding: QS | undefined,
  aLiq: QS | undefined,
  aOi: QS | undefined,
): AxiomEdgeLayerInput["positioning"] {
  const fundingBias = num(ps, "fb", 0); // -1/0/1
  const fundingStatus = num(ps, "fs", 0);
  const buySellBias = num(ps, "bs", 0);
  const liqBias = num(ps, "lb", 0);

  // Alpha funding
  const fundingCrowding = num(aFunding, "fundingCrowdingIndex", 50);
  const fundingExtreme = num(aFunding, "fundingExtremeScore", 0);
  const fundingDir = str(aFunding, "fundingDirection", "NEUTRAL");
  const isExtreme = aFunding ? Boolean(aFunding.isExtreme) : false;

  // Determine crowd position
  let crowd_position: string;
  let funding_bias_label: string;
  if (fundingCrowding > 70 || (isExtreme && fundingDir === "BULLISH_CROWD")) {
    crowd_position = "overlong";
    funding_bias_label = "long_heavy";
  } else if (fundingCrowding > 70 || (isExtreme && fundingDir === "BEARISH_CROWD")) {
    crowd_position = "overshort";
    funding_bias_label = "short_heavy";
  } else if (fundingBias > 0) {
    crowd_position = fundingCrowding > 55 ? "overlong" : "balanced";
    funding_bias_label = "long_heavy";
  } else if (fundingBias < 0) {
    crowd_position = fundingCrowding > 55 ? "overshort" : "balanced";
    funding_bias_label = "short_heavy";
  } else {
    crowd_position = "balanced";
    funding_bias_label = "neutral";
  }

  // OI change from alpha
  const oiShockScore = num(aOi, "oiShockScore", 0);
  const leverageBuildup = num(aOi, "leverageBuildupIndicator", 0);
  const open_interest_change = oiShockScore > 60 ? oiShockScore / 10 : leverageBuildup / 15;

  // Liquidation bias
  const longSqueeze = num(aLiq, "longSqueezeProb", 30);
  const shortSqueeze = num(aLiq, "shortSqueezeProb", 30);
  const liquidation_bias = longSqueeze > shortSqueeze + 15 ? "longs_vulnerable"
    : shortSqueeze > longSqueeze + 15 ? "shorts_vulnerable"
    : "balanced";

  // Trap probabilities
  const trap_longs = clamp(longSqueeze / 100, 0, 1);
  const trap_shorts = clamp(shortSqueeze / 100, 0, 1);

  return {
    funding_bias: funding_bias_label,
    open_interest_change_pct: round2(open_interest_change),
    liquidation_bias,
    crowd_position,
    trap_probability_longs: round2(trap_longs),
    trap_probability_shorts: round2(trap_shorts),
  };
}

function buildVolatility(
  vo: QS | undefined,
  aVol: QS | undefined,
): AxiomEdgeLayerInput["volatility"] {
  const compression = num(vo, "cp", 0);
  const atrRegime = num(vo, "atr", 1);
  const marketStress = num(vo, "ms", 0);
  const expansionProb = num(vo, "xp", 1);
  const squeezeScore = num(vo, "sm", 1);

  // Alpha volatility
  const volRegime = str(aVol, "volatilityRegime", "");
  const alphaCompression = num(aVol, "compressionScore", 0);
  const alphaExpansion = num(aVol, "expansionForecast", 0);
  const shockIndex = num(aVol, "volatilityShockIndex", 0);

  // Determine volatility state
  let state: "compression" | "expansion" | "exhaustion" | "dead";
  if (volRegime === "COMPRESSED" || (compression === 1 && alphaCompression > 60)) {
    state = "compression";
  } else if (volRegime === "TRENDING" || expansionProb >= 2 || alphaExpansion > 70) {
    state = "expansion";
  } else if (volRegime === "PANIC" || (marketStress >= 2 && shockIndex > 60)) {
    state = "exhaustion";
  } else if (atrRegime === 0 && alphaExpansion < 30) {
    state = "dead";
  } else if (compression === 1) {
    state = "compression";
  } else {
    state = "expansion";
  }

  // Expansion probability
  const expansion_probability = alphaExpansion > 0
    ? clamp(alphaExpansion / 100, 0, 1)
    : expansionProb >= 2 ? 0.75 : expansionProb === 1 ? 0.45 : 0.2;

  // Exhaustion risk
  const exhaustion_risk = state === "exhaustion" ? 0.8
    : shockIndex > 50 ? clamp(shockIndex / 100, 0.3, 0.9)
    : marketStress >= 2 ? 0.5
    : 0.15;

  // Market speed
  const market_speed = atrRegime >= 2 ? "fast"
    : atrRegime === 0 ? "slow"
    : "moderate";

  return {
    state,
    expansion_probability: round2(expansion_probability),
    exhaustion_risk: round2(exhaustion_risk),
    market_speed,
  };
}

function buildExecution(
  ex: QS | undefined,
  lq: QS | undefined,
  ed: QS | undefined,
): AxiomEdgeLayerInput["execution"] {
  const entryOpen = num(ex, "en", 0);
  const slippage = num(ex, "sl", 1); // 0=tight, 1=mid, 2=wide
  const fillProb = num(ex, "pf", 0.5);
  const capacity = num(ex, "cpct", 0.5);

  const spread = num(lq, "sp", 1); // 0=wide, 1=mid, 2=tight
  const depth = num(lq, "dp", 1);

  // Spread score: tight=high, wide=low
  const spread_score = spread === 2 ? 0.9 : spread === 1 ? 0.6 : 0.25;

  // Depth score
  const depth_score = depth === 2 ? 0.85 : depth === 1 ? 0.55 : 0.2;

  // Slippage risk (inverted: tight=low risk)
  const slippage_risk = slippage === 0 ? 0.1 : slippage === 1 ? 0.35 : 0.7;

  // Entry efficiency from fill prob, capacity, entry openness
  const entry_efficiency = clamp(
    fillProb * 0.35 + capacity * 0.25 + (entryOpen ? 0.3 : 0.05) + (spread_score * 0.1),
    0, 1,
  );

  return {
    spread_score: round2(spread_score),
    depth_score: round2(depth_score),
    slippage_risk: round2(slippage_risk),
    entry_efficiency_score: round2(entry_efficiency),
  };
}

function buildContext(
  st: QS | undefined,
  ag: QS | undefined,
  o: QS | undefined,
  aDelta: QS | undefined,
  aMultiTf: QS | undefined,
): AxiomEdgeLayerInput["context"] {
  const emaAlign = num(st, "ema", 0); // -1/0/1
  const vwapPos = num(st, "vw", 0);
  const timeInRange = num(st, "tir", 8);
  const structAlign = num(st, "sa", 1);

  const signalConflict = num(o, "sc", 1); // 1=low
  const marketStressGrade = num(o, "gt", 1);

  // Alpha multi-TF
  const mtfAlign = num(aMultiTf, "multiTfAlignmentScore", 50);
  const htfBias = str(aMultiTf, "htfTrendBias", "NEUTRAL");

  // Alpha delta
  const deltaImbalance = num(aDelta, "deltaImbalanceScore", 0);

  // EMA alignment
  const ema_alignment = emaAlign > 0 ? "bullish" : emaAlign < 0 ? "bearish" : "mixed";

  // VWAP position
  const vwap_position = vwapPos > 0 ? "above" : vwapPos < 0 ? "below" : "at";

  // Time in range (normalized: lower = just entered range, higher = been stuck)
  const time_in_range_score = clamp(timeInRange / 20, 0, 1);

  // Move participation from delta + multi-TF alignment
  const move_participation = clamp(
    (mtfAlign / 100) * 0.5 + (Math.abs(deltaImbalance) / 100) * 0.3 + (structAlign / 2) * 0.2,
    0, 1,
  );

  // Signal conflict (1 = low in quant notation, invert for 0-1 scale where higher=worse)
  const signal_conflict_level = signalConflict >= 2 ? 0.7 : signalConflict === 1 ? 0.2 : 0.1;

  // Market stress
  const market_stress = marketStressGrade >= 2 ? 0.7 : marketStressGrade === 1 ? 0.3 : 0.1;

  return {
    ema_alignment,
    vwap_position,
    time_in_range_score: round2(time_in_range_score),
    move_participation_score: round2(move_participation),
    signal_conflict_level: round2(signal_conflict_level),
    market_stress: round2(market_stress),
  };
}

// ── Utilities ────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round(v: number): number {
  if (v >= 1000) return Math.round(v * 100) / 100;
  if (v >= 1) return Math.round(v * 10000) / 10000;
  if (v >= 0.01) return Math.round(v * 1000000) / 1000000;
  return Math.round(v * 100000000) / 100000000;
}
