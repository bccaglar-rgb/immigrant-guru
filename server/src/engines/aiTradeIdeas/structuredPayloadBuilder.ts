/**
 * Structured Payload Builder
 *
 * Transforms AiEngineCandidate + quantSnapshot + alpha into a 3-layer
 * structured JSON payload for ChatGPT evaluation.
 *
 * Layer 1: Decision summary (market, decision, trade plan, core metrics)
 * Layer 2: Group scores (8 groups) + penalty groups (4 groups) + model agreement
 * Layer 3: Raw signals + contradictions + data health + strategy rules
 */

import type { AiEngineCandidate } from "./types.ts";
import type {
  StructuredAiPayload,
  AiPayloadRawSignals,
  ContradictionEntry,
  AiPayloadDataHealth,
  AiPayloadModelAgreement,
  AiPayloadStrategyRules,
  RawSignalEntry,
} from "./structuredPayloadTypes.ts";
import { buildAllGroupScores, buildPenaltyGroups } from "./groupScoreCalculator.ts";

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
  return v && typeof v === "object" && !Array.isArray(v) ? (v as QS) : undefined;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;

function sig(value: unknown, role: "primary" | "supporting" | "contextual" | "informational"): RawSignalEntry {
  return { value, role };
}

// ── Contradiction Detection ─────────────────────────────────────

function detectContradictions(
  snapshot: QS | undefined,
  alpha: QS | undefined,
  direction: string,
): ContradictionEntry[] {
  const contradictions: ContradictionEntry[] = [];
  const st = sub(snapshot, "st");
  const aMultiTf = sub(alpha, "multiTf");
  const aFunding = sub(alpha, "funding");
  const o = sub(snapshot, "o");
  const vo = sub(snapshot, "vo");

  const trendDir = num(st, "td", 0);
  const emaAlign = num(st, "ema", 0);
  const vwapPos = num(st, "vw", 0);
  const regime = num(st, "rg", -1);
  const structAge = num(st, "sa", 0);

  const htfBias = str(aMultiTf, "htfTrendBias", "");
  const mtfAlign = num(aMultiTf, "multiTfAlignmentScore", -1);
  const fundingDir = str(aFunding, "fundingDirection", "");
  const crowding = num(aFunding, "fundingCrowdingIndex", 0);
  const compression = num(vo, "cp", 0);

  // Long bias but below VWAP
  if (direction === "LONG" && vwapPos < 0) {
    contradictions.push({
      signal_a: "direction=LONG",
      signal_b: "vwap_position=BELOW",
      description: "Long bias but price below VWAP — pullback may be too deep",
      severity: "medium",
    });
  }

  // Short bias but above VWAP
  if (direction === "SHORT" && vwapPos > 0) {
    contradictions.push({
      signal_a: "direction=SHORT",
      signal_b: "vwap_position=ABOVE",
      description: "Short bias but price above VWAP — countertrend risk",
      severity: "medium",
    });
  }

  // EMA alignment vs trend direction
  if (trendDir > 0 && emaAlign < 0) {
    contradictions.push({
      signal_a: "trend_direction=UP",
      signal_b: "ema_alignment=BEAR",
      description: "Trend says up but EMA alignment is bearish — mixed structure",
      severity: "high",
    });
  } else if (trendDir < 0 && emaAlign > 0) {
    contradictions.push({
      signal_a: "trend_direction=DOWN",
      signal_b: "ema_alignment=BULL",
      description: "Trend says down but EMA alignment is bullish — mixed structure",
      severity: "high",
    });
  }

  // HTF vs LTF direction mismatch
  if (direction === "LONG" && htfBias === "BEARISH") {
    contradictions.push({
      signal_a: "direction=LONG",
      signal_b: "htf_trend_bias=BEARISH",
      description: "Long on LTF but HTF trend is bearish — countertrend on higher TF",
      severity: "high",
    });
  } else if (direction === "SHORT" && htfBias === "BULLISH") {
    contradictions.push({
      signal_a: "direction=SHORT",
      signal_b: "htf_trend_bias=BULLISH",
      description: "Short on LTF but HTF trend is bullish — countertrend on higher TF",
      severity: "high",
    });
  }

  // Funding crowding vs direction
  if (direction === "LONG" && fundingDir === "BULLISH_CROWD" && crowding > 70) {
    contradictions.push({
      signal_a: "direction=LONG",
      signal_b: "funding_crowd=BULLISH_HEAVY",
      description: "Going long while crowd is already heavily long — crowding risk",
      severity: "medium",
    });
  } else if (direction === "SHORT" && fundingDir === "BEARISH_CROWD" && crowding > 70) {
    contradictions.push({
      signal_a: "direction=SHORT",
      signal_b: "funding_crowd=BEARISH_HEAVY",
      description: "Going short while crowd is already heavily short — crowding risk",
      severity: "medium",
    });
  }

  // Range regime + strong trend claims
  if (regime === 0 && trendDir !== 0) {
    contradictions.push({
      signal_a: "market_regime=RANGE",
      signal_b: `trend_direction=${trendDir > 0 ? "UP" : "DOWN"}`,
      description: "Range regime but trend direction is non-neutral — possible regime transition",
      severity: "low",
    });
  }

  // High compression + mature structure
  if (compression === 1 && structAge >= 2) {
    contradictions.push({
      signal_a: "compression=ON",
      signal_b: "structure_age=MATURE",
      description: "Compression in a mature structure — breakout may lack momentum",
      severity: "low",
    });
  }

  // Low MTF alignment + high score
  if (mtfAlign >= 0 && mtfAlign < 40) {
    contradictions.push({
      signal_a: `multi_tf_alignment=${mtfAlign}`,
      signal_b: "expected=high_alignment",
      description: "Low multi-timeframe alignment — directional conviction weak across TFs",
      severity: "medium",
    });
  }

  return contradictions;
}

// ── Data Health Builder ─────────────────────────────────────────

function buildDataHealth(
  snapshot: QS | undefined,
  groupScores: ReturnType<typeof buildAllGroupScores>,
): AiPayloadDataHealth {
  const ed = sub(snapshot, "ed");
  const staleFeed = num(ed, "stale", 0) > 0;
  const missingFields = num(ed, "mf", 0);

  const groupCompleteness: Record<string, number> = {};
  let totalCompleteness = 0;
  let groupCount = 0;
  for (const [name, group] of Object.entries(groupScores)) {
    groupCompleteness[name] = group.completeness;
    totalCompleteness += group.completeness;
    groupCount++;
  }

  // Feed status (derived from what we know)
  const feeds: Record<string, "healthy" | "degraded" | "missing"> = {
    ohlcv: "healthy",
    orderbook: "healthy",
    trades: "healthy",
    open_interest: "healthy",
    funding_rate: "healthy",
  };

  // If data health block exists, check for degradation
  const degradedFeeds = num(ed, "df", 0);
  if (degradedFeeds > 0) {
    // Mark some feeds as degraded (we don't know which specifically)
    if (degradedFeeds >= 3) {
      feeds.open_interest = "degraded";
      feeds.funding_rate = "degraded";
      feeds.trades = "degraded";
    } else if (degradedFeeds >= 1) {
      feeds.open_interest = "degraded";
    }
  }
  if (staleFeed) {
    feeds.ohlcv = "degraded";
  }

  return {
    overall_completeness: groupCount > 0 ? round2(totalCompleteness / groupCount) : 0,
    group_completeness: groupCompleteness,
    stale_feed: staleFeed,
    missing_fields: missingFields,
    feeds,
  };
}

// ── Model Agreement Builder ─────────────────────────────────────

function buildModelAgreement(snapshot: QS | undefined, direction: string): AiPayloadModelAgreement {
  const ag = sub(snapshot, "ag");
  if (!ag) {
    return { aligned_long: 0, aligned_short: 0, neutral: 0, opposite: 0, unknown: 6 };
  }

  // ag block has model agreement counts
  const bull = num(ag, "bl", 0);
  const bear = num(ag, "br", 0);
  const neut = num(ag, "n", 0);
  const total = bull + bear + neut;
  const unknown = Math.max(0, 6 - total);

  const aligned_long = bull;
  const aligned_short = bear;
  const opposite = direction === "LONG" ? bear : direction === "SHORT" ? bull : 0;

  return {
    aligned_long,
    aligned_short,
    neutral: neut,
    opposite,
    unknown,
  };
}

// ── Strategy Rules Builder ──────────────────────────────────────

function buildStrategyRules(
  snapshot: QS | undefined,
  direction: string,
  rrRatio: number,
  tradeValidity: string,
  entryWindow: string,
  slippageRisk: string,
): AiPayloadStrategyRules {
  const st = sub(snapshot, "st");
  const lv = sub(snapshot, "lv");

  const trendDir = num(st, "td", 0);
  const emaAlign = num(st, "ema", 0);
  const vwapPos = num(st, "vw", 0);
  const swingHigh = num(lv, "rh", 0);
  const swingLow = num(lv, "rl", 0);

  // EMA200 trend filter: direction must match EMA trend
  const ema_trend_filter = (direction === "LONG" && trendDir > 0 && emaAlign > 0) ||
    (direction === "SHORT" && trendDir < 0 && emaAlign < 0);

  // Valid swing for SL anchor
  const valid_swing = direction === "LONG" ? swingLow > 0 : swingHigh > 0;

  // Pullback to EMA50 zone (approximated via entry window)
  const pullback_to_ema50 = entryWindow === "OPEN" || entryWindow === "NEAR";

  // Candle confirmation (approximated via trade validity)
  const candle_confirmation = tradeValidity === "VALID" || tradeValidity === "STRONG";

  return {
    ema_trend_filter,
    min_confirmations: 2,
    valid_swing_required: true,
    positive_risk_required: true,

    // Flexible thresholds (AI can adjust within these ranges)
    rsi_long_range: [30, 50],     // default center: 35-45, flex: ±5
    rsi_short_range: [50, 70],    // default center: 55-65, flex: ±5
    sl_buffer_pct: 0.2,           // flex: 0.1-0.5
    min_rr: Math.max(1.8, rrRatio >= 2.0 ? 2.0 : 1.8), // flex: 1.8-2.5
    pullback_to_ema50,
    candle_confirmation,
  };
}

// ── Raw Signals Aggregator ──────────────────────────────────────

function buildRawSignals(
  snapshot: QS | undefined,
  alpha: QS | undefined,
): AiPayloadRawSignals {
  const st = sub(snapshot, "st");
  const lq = sub(snapshot, "lq");
  const ps = sub(snapshot, "ps");
  const vo = sub(snapshot, "vo");
  const ex = sub(snapshot, "ex");
  const lv = sub(snapshot, "lv");
  const o = sub(snapshot, "o");

  const aFunding = sub(alpha, "funding");
  const aVol = sub(alpha, "volatility");
  const aLiq = sub(alpha, "liquidation");
  const aTiming = sub(alpha, "timing");
  const aMultiTf = sub(alpha, "multiTf");
  const aDelta = sub(alpha, "delta");

  const regime = num(st, "rg", -1);
  const trendDir = num(st, "td", 0);
  const trendStrength = num(st, "ts", 0);
  const emaAlign = num(st, "ema", 0);
  const vwapPos = num(st, "vw", 0);
  const timeInRange = num(st, "tir", 0);
  const structAge = num(st, "sa", 0);

  return {
    // Structure
    market_regime: sig(regime === 2 ? "BREAKOUT" : regime === 1 ? "TREND" : regime === 0 ? "RANGE" : "UNKNOWN", "primary"),
    structure_age: sig(structAge >= 2 ? "MATURE" : structAge === 1 ? "MID" : "FRESH", "contextual"),
    time_in_range_bars: sig(timeInRange, "contextual"),
    trend_direction: sig(trendDir > 0 ? "UP" : trendDir < 0 ? "DOWN" : "NEUTRAL", "primary"),
    trend_strength: sig(trendStrength === 2 ? "HIGH" : trendStrength === 1 ? "MID" : "LOW", "primary"),
    ema_alignment: sig(emaAlign > 0 ? "BULL" : emaAlign < 0 ? "BEAR" : "MIXED", "primary"),
    vwap_position: sig(vwapPos > 0 ? "ABOVE" : vwapPos < 0 ? "BELOW" : "AT", "supporting"),
    pivot_swing_high: sig(num(lv, "rh", 0) || "N/A", "supporting"),
    pivot_swing_low: sig(num(lv, "rl", 0) || "N/A", "supporting"),

    // Liquidity
    orderbook_imbalance: sig(num(lq, "ob", 0) > 0 ? "BUY" : num(lq, "ob", 0) < 0 ? "SELL" : "NEUTRAL", "primary"),
    liquidity_distance_pct: sig(round2(num(lq, "d", 0)) || "N/A", "supporting"),
    depth_quality: sig(num(lq, "dp", 1) === 2 ? "HIGH" : num(lq, "dp", 1) === 0 ? "LOW" : "MID", "primary"),
    spread_regime: sig(num(lq, "sp", 1) === 2 ? "TIGHT" : num(lq, "sp", 1) === 0 ? "WIDE" : "MID", "supporting"),
    stop_cluster_above: sig(num(aLiq, "shortSqueezeProb", -1) >= 0 ? num(aLiq, "shortSqueezeProb", 0) > 50 : "N/A", "contextual"),
    stop_cluster_below: sig(num(aLiq, "longSqueezeProb", -1) >= 0 ? num(aLiq, "longSqueezeProb", 0) > 50 : "N/A", "contextual"),

    // Positioning
    funding_bias: sig(num(ps, "fb", 0) > 0 ? "BULLISH" : num(ps, "fb", 0) < 0 ? "BEARISH" : "NEUTRAL", "primary"),
    funding_crowding: sig(num(aFunding, "fundingCrowdingIndex", -1) >= 0 ? num(aFunding, "fundingCrowdingIndex", 0) : "N/A", "primary"),
    funding_extreme: sig(aFunding ? Boolean(aFunding.isExtreme) : "N/A", "supporting"),
    oi_shock_score: sig(num(alpha, "oiShock.oiShockScore", -1) >= 0 ? num(sub(alpha, "oiShock"), "oiShockScore", 0) : "N/A", "supporting"),
    liquidations_bias: sig(num(ps, "lb", 0) > 0 ? "SHORTS_VULNERABLE" : num(ps, "lb", 0) < 0 ? "LONGS_VULNERABLE" : "BALANCED", "supporting"),
    buy_sell_imbalance: sig(num(ps, "bs", 0) > 0 ? "BUY_HEAVY" : num(ps, "bs", 0) < 0 ? "SELL_HEAVY" : "NEUTRAL", "contextual"),

    // Execution
    fill_probability: sig(num(ex, "pf", -1) >= 0 ? round2(num(ex, "pf", 0)) : "N/A", "primary"),
    capacity: sig(num(ex, "cpct", -1) >= 0 ? round2(num(ex, "cpct", 0)) : "N/A", "primary"),
    entry_timing: sig(num(ex, "en", -1) === 1 ? "OPEN" : num(ex, "en", -1) === 0 ? "CLOSED" : "N/A", "supporting"),
    slippage: sig(num(ex, "sl", 1) === 0 ? "LOW" : num(ex, "sl", 1) === 2 ? "HIGH" : "MID", "primary"),
    entry_quality_score: sig("N/A", "informational"),

    // Volatility
    atr_regime: sig(num(vo, "atr", 1) >= 2 ? "HIGH" : num(vo, "atr", 1) === 0 ? "LOW" : "MID", "primary"),
    compression: sig(num(vo, "cp", -1) === 1 ? "ON" : num(vo, "cp", -1) === 0 ? "OFF" : "N/A", "primary"),
    market_speed: sig(num(vo, "atr", 1) >= 2 ? "FAST" : num(vo, "atr", 1) === 0 ? "SLOW" : "MODERATE", "supporting"),
    expansion_probability: sig(num(aVol, "expansionForecast", -1) >= 0 ? num(aVol, "expansionForecast", 0) : "N/A", "supporting"),
    breakout_risk: sig(num(vo, "cp", 0) === 1 && num(aVol, "expansionForecast", 0) >= 60 ? "HIGH" : num(vo, "cp", 0) === 1 ? "MID" : "LOW", "contextual"),
    volatility_regime: sig(str(aVol, "volatilityRegime", "N/A"), "contextual"),

    // Risk environment
    signal_conflict: sig(num(o, "sc", 1) >= 3 ? "HIGH" : num(o, "sc", 1) >= 2 ? "MID" : "LOW", "primary"),
    cascade_risk: sig(num(o, "cr", 0) >= 2 ? "HIGH" : num(o, "cr", 0) >= 1 ? "MID" : "LOW", "primary"),
    market_stress: sig(num(vo, "ms", 0) >= 2 ? "HIGH" : num(vo, "ms", 0) >= 1 ? "MID" : "LOW", "primary"),
    crowding_risk: sig(num(aFunding, "fundingCrowdingIndex", 0) > 70 ? "HIGH" : num(aFunding, "fundingCrowdingIndex", 0) > 40 ? "MID" : "LOW", "supporting"),

    // Timing (alpha)
    timing_grade: sig(str(aTiming, "timingGrade", "N/A"), "supporting"),
    momentum_ignition: sig(num(aTiming, "momentumIgnitionScore", -1) >= 0 ? num(aTiming, "momentumIgnitionScore", 0) : "N/A", "supporting"),
    trigger_candle_score: sig(num(aTiming, "triggerCandleScore", -1) >= 0 ? num(aTiming, "triggerCandleScore", 0) : "N/A", "contextual"),

    // Multi-TF (alpha)
    htf_trend_bias: sig(str(aMultiTf, "htfTrendBias", "N/A"), "supporting"),
    multi_tf_alignment: sig(num(aMultiTf, "multiTfAlignmentScore", -1) >= 0 ? num(aMultiTf, "multiTfAlignmentScore", 0) : "N/A", "supporting"),
    ltf_pullback_quality: sig(num(aMultiTf, "ltfPullbackQuality", -1) >= 0 ? num(aMultiTf, "ltfPullbackQuality", 0) : "N/A", "contextual"),
  } as AiPayloadRawSignals;
}

// ── Main Builder ────────────────────────────────────────────────

export function buildStructuredPayload(
  candidate: AiEngineCandidate,
  softFlags: string[],
): StructuredAiPayload {
  const snapshot = candidate.quantSnapshot;
  const alpha = sub(snapshot, "alpha") ?? sub(candidate.quantSnapshot, "alpha");

  // Get live price from snapshot or entry mid
  const price = num(snapshot, "closePrice", candidate.entryMid);

  const groupScores = buildAllGroupScores(snapshot, alpha);

  const penaltyGroups = buildPenaltyGroups(
    snapshot,
    alpha,
    softFlags,
    candidate.tradeValidity,
    candidate.slippageRisk,
    candidate.entryWindow,
  );

  const contradictions = detectContradictions(snapshot, alpha, candidate.direction);
  const dataHealth = buildDataHealth(snapshot, groupScores);
  const modelAgreement = buildModelAgreement(snapshot, candidate.direction);
  const rawSignals = buildRawSignals(snapshot, alpha);

  const strategyRules = buildStrategyRules(
    snapshot,
    candidate.direction,
    candidate.rrRatio,
    candidate.tradeValidity,
    candidate.entryWindow,
    candidate.slippageRisk,
  );

  // Capital Guard cross-reference signal (injected for Prime AI)
  const cgSignalSection = candidate.cgSignal ? {
    capital_guard_signal: {
      cg_score: candidate.cgSignal.scorePct,
      cg_decision: candidate.cgSignal.decision,
      cg_direction: candidate.cgSignal.direction,
      cg_trade_validity: candidate.cgSignal.tradeValidity,
      cg_entry_zone: [candidate.cgSignal.entryLow, candidate.cgSignal.entryHigh],
      cg_stop_levels: candidate.cgSignal.slLevels,
      cg_targets: candidate.cgSignal.tpLevels,
      note: "Capital Guard mode uses highest thresholds (score>=85 for APPROVED). Use as safety cross-reference.",
    },
  } : {};

  return {
    engine: "Bitrium Quant Engine",
    version: "2.0",

    // Layer 1
    market: {
      symbol: candidate.symbol,
      venue: "Binance",
      timeframe: candidate.timeframe,
      price,
      mode: candidate.mode,
    },

    // Capital Guard cross-reference (if available)
    ...cgSignalSection,

    decision: {
      final_score: candidate.quantScore,
      decision: candidate.decision,
      bias: candidate.direction,
      direction: candidate.direction,
      intent: candidate.setup,
      urgency: candidate.entryWindow === "OPEN" ? "ACT" : "WAIT",
      trade_validity: candidate.tradeValidity,
      conflict_level: softFlags.includes("signal_conflict") ? "HIGH" : "LOW",
    },
    trade_plan: {
      entry_zone: [candidate.entryLow, candidate.entryHigh],
      stop_levels: candidate.slLevels,
      targets: candidate.tpLevels,
      rr_ratio: round2(candidate.rrRatio),
      horizon: candidate.horizon,
    },
    core_metrics: {
      p_win: num(snapshot, "pWin", 0),
      expected_rr: num(snapshot, "expectedRR", 0),
      edge_net_r: num(snapshot, "edgeNetR", 0),
      fill_probability: num(sub(snapshot, "ex"), "pf", 0),
      capacity: num(sub(snapshot, "ex"), "cpct", 0),
      slippage_risk: candidate.slippageRisk,
    },

    // Layer 2
    group_scores: groupScores,
    penalty_groups: penaltyGroups,
    model_agreement: modelAgreement,

    // Layer 3
    raw_signals: rawSignals,
    contradictions,
    data_health: dataHealth,
    strategy_rules: strategyRules,
  };
}
