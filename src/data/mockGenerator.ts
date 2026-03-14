import type {
  AiPanelData,
  ConsensusInputConfig,
  DashboardSnapshot,
  DataHealthState,
  FeedConfig,
  FeedKey,
  KeyLevel,
  OhlcvPoint,
  ScenarioConfig,
  IndicatorsState,
  ScoringMode,
  TileState,
  Timeframe,
  TimeframeConfig,
} from "../types";
import { ADVANCED_TILES, DEFAULT_TILES, TILE_DEFINITIONS } from "./tileDefinitions";
import { computeScore, SCORING_CONFIG, scoringModeDescription } from "./scoringEngine";

const nowIso = () => new Date().toISOString();
const MOCK_DATA_DISABLED_ERROR = "Mock data generation is disabled. Use live market feeds only.";

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const jitter = (base: number, spread: number) => base + (Math.random() - 0.5) * spread;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const pick = <T,>(values: readonly T[]): T => values[Math.floor(Math.random() * values.length)];

const throwMockDisabled = (fnName: string): never => {
  throw new Error(`${MOCK_DATA_DISABLED_ERROR} (${fnName})`);
};

const isDefaultTile = (key: string) => DEFAULT_TILES.includes(key as (typeof DEFAULT_TILES)[number]);

const feedQuality = (feeds: FeedConfig): number => {
  const enabled = Object.values(feeds).filter(Boolean).length;
  return enabled / 7;
};

const confidence = (base: number, feeds: FeedConfig) => {
  const quality = feedQuality(feeds);
  return Math.round(clamp(base + quality * 18 + jitter(0, 6), 35, 96));
};

const enumTile = (
  key: string,
  state: string,
  feeds: FeedConfig,
  rawValue: string,
  shortExplanation: string,
): TileState => {
  const def = TILE_DEFINITIONS[key];
  return {
    key,
    label: def.label,
    category: def.category,
    state,
    confidence: confidence(64, feeds),
    rawValue,
    shortExplanation,
    updatedAt: nowIso(),
    advanced: !isDefaultTile(key),
    dependsOnFeeds: def.dependsOnFeeds,
    requiresIndicators: def.requiresIndicators,
  };
};

const numericTile = (
  key: string,
  value: number,
  feeds: FeedConfig,
  rawValue: string,
  shortExplanation: string,
): TileState => {
  const def = TILE_DEFINITIONS[key];
  return {
    key,
    label: def.label,
    category: def.category,
    value,
    unit: def.unit,
    confidence: confidence(61, feeds),
    rawValue,
    shortExplanation,
    updatedAt: nowIso(),
    advanced: !isDefaultTile(key),
    dependsOnFeeds: def.dependsOnFeeds,
    requiresIndicators: def.requiresIndicators,
  };
};

const indicatorOffTile = (key: string, reason: string): TileState => {
  const def = TILE_DEFINITIONS[key];
  return {
    key,
    label: def.label,
    category: def.category,
    state: "N/A",
    confidence: 0,
    rawValue: reason,
    shortExplanation: reason,
    updatedAt: nowIso(),
    advanced: !isDefaultTile(key),
    dependsOnFeeds: def.dependsOnFeeds,
    requiresIndicators: true,
  };
};

export const generateTiles = (scenario: ScenarioConfig, feeds: FeedConfig, indicators?: IndicatorsState): TileState[] => {
  void scenario;
  void feeds;
  void indicators;
  return throwMockDisabled("generateTiles");
  const trendBias = jitter(0, 1.8) + (scenario.horizon === "SWING" ? 0.25 : scenario.horizon === "SCALP" ? -0.15 : 0);
  const trendDirection = trendBias > 0.35 ? "UP" : trendBias < -0.35 ? "DOWN" : "NEUTRAL";
  const trendStrength = Math.abs(trendBias) > 1.05 ? "STRONG" : Math.abs(trendBias) > 0.55 ? "MID" : "WEAK";

  const volScore = clamp(rand(0, 1) + (scenario.horizon === "SCALP" ? 0.22 : 0), 0, 1.2);
  const liqScore = clamp(rand(0, 1) + (scenario.riskMode === "CONSERVATIVE" ? 0.18 : -0.05), 0, 1.1);
  const flowScore = jitter(0, 1.8);

  const regime: "TREND" | "RANGE" | "CHOP" =
    Math.abs(trendBias) > 0.8 ? "TREND" : volScore < 0.45 ? "RANGE" : "CHOP";

  const barsSinceRegime = Math.round(regime === "TREND" ? rand(8, 95) : rand(20, 260));
  const timeInRange = regime === "RANGE" ? Math.round(rand(45, 280)) : regime === "CHOP" ? Math.round(rand(12, 90)) : Math.round(rand(0, 20));
  const structureAge = barsSinceRegime < 20 ? "NEW" : barsSinceRegime < 60 ? "DEVELOPING" : barsSinceRegime < 140 ? "MATURE" : "OLD";

  const atrRegime = volScore > 0.82 ? "HIGH" : volScore > 0.42 ? "NORMAL" : "LOW";
  const breakoutRisk = volScore > 0.86 ? "HIGH" : volScore > 0.5 ? "MED" : "LOW";

  const marketStress = (volScore > 0.85 || liqScore < 0.28) ? "HIGH" : (volScore > 0.55 || liqScore < 0.5) ? "BUILDING" : "LOW";
  const suddenMoveRisk = marketStress === "HIGH" ? "HIGH" : marketStress === "BUILDING" ? "MED" : "LOW";
  const volExpansionProb = breakoutRisk === "HIGH" ? "HIGH" : breakoutRisk === "MED" ? "MED" : "LOW";

  const orderbookStability =
    (marketStress === "HIGH" && liqScore < 0.42) ? "SPOOF_RISK" :
    (liqScore < 0.55 ? "SHIFTING" : "STABLE");

  const spreadRegime = liqScore > 0.74 ? "TIGHT" : liqScore > 0.42 ? "NORMAL" : "WIDE";
  const depthQuality = liqScore > 0.7 ? "GOOD" : liqScore > 0.4 ? "OK" : "POOR";
  const slippageRisk = orderbookStability === "SPOOF_RISK" || spreadRegime === "WIDE" ? "HIGH" : spreadRegime === "NORMAL" ? "MED" : "LOW";

  const liquidityDensity = liqScore > 0.75 ? "HIGH" : liqScore > 0.45 ? "MID" : "LOW";
  const stopClusterProb = orderbookStability === "SPOOF_RISK" ? "HIGH" : regime === "RANGE" ? "MED" : "LOW";
  const liquidityDistance = Number(clamp(rand(0.15, 2.8) + (stopClusterProb === "HIGH" ? -0.35 : 0.25), 0.05, 3.2).toFixed(2));

  const aggressorFlow = flowScore > 0.35 ? "BUYERS_DOMINANT" : flowScore < -0.35 ? "SELLERS_DOMINANT" : "MIXED";
  const refillBehaviour = orderbookStability === "STABLE" ? "STRONG" : orderbookStability === "SHIFTING" ? "NORMAL" : "WEAK";

  const moveParticipation =
    (trendStrength === "STRONG" && aggressorFlow !== "MIXED" && feeds.openInterest) ? "STRONG" :
    (trendStrength === "WEAK" || !feeds.openInterest) ? "WEAK" : "NORMAL";

  const spotVsDeriv =
    !feeds.openInterest ? "SPOT_LED" :
    moveParticipation === "STRONG" && pick([true, false]) ? "DERIV_LED" :
    moveParticipation === "WEAK" ? "SPOT_LED" : "BALANCED";

  const realMomentum =
    (trendDirection === "UP" && aggressorFlow === "BUYERS_DOMINANT") ||
    (trendDirection === "DOWN" && aggressorFlow === "SELLERS_DOMINANT")
      ? "CONFIRMED"
      : "UNCONFIRMED";

  const marketIntent: AiPanelData["marketIntent"] =
    regime === "RANGE" && liquidityDensity === "HIGH"
      ? "ACCUMULATION"
      : regime === "TREND" && trendDirection !== "NEUTRAL"
        ? "TREND_CONTINUATION"
        : stopClusterProb === "HIGH"
          ? "LIQUIDITY_HUNT"
          : "DISTRIBUTION";

  const entryTimingWindow =
    slippageRisk === "HIGH" || suddenMoveRisk === "HIGH"
      ? "CLOSED"
      : orderbookStability === "SHIFTING"
        ? "NARROW"
        : "OPEN";

  const reactionSensitivity = spreadRegime === "WIDE" ? "HIGH" : spreadRegime === "NORMAL" ? "NORMAL" : "LOW";
  const impulseReadiness = entryTimingWindow === "OPEN" && realMomentum === "CONFIRMED" ? "READY" : entryTimingWindow === "CLOSED" ? "NOT_READY" : "BUILDING";

  const asymmetryScore =
    entryTimingWindow === "CLOSED" || suddenMoveRisk === "HIGH"
      ? "RISK_DOMINANT"
      : realMomentum === "CONFIRMED" && trendStrength !== "WEAK"
        ? "REWARD_DOMINANT"
        : "BALANCED";

  const riskArrivalSpeed = suddenMoveRisk === "HIGH" ? "FAST" : suddenMoveRisk === "MED" ? "NORMAL" : "SLOW";
  const rewardAccessibility = asymmetryScore === "REWARD_DOMINANT" ? "EASY" : asymmetryScore === "BALANCED" ? "NORMAL" : "HARD";

  const relativeStrength = trendDirection === "UP" ? "STRONG" : trendDirection === "DOWN" ? "WEAK" : "NEUTRAL";
  const opportunityRank = asymmetryScore === "REWARD_DOMINANT" ? "TOP" : asymmetryScore === "BALANCED" ? "MID" : "LOW";
  const leadership = relativeStrength === "STRONG" ? "MARKET_DRIVER" : "FOLLOWER";

  const conflictVotes = [trendDirection === "UP" ? "BUY" : trendDirection === "DOWN" ? "SELL" : "NEUTRAL", aggressorFlow.includes("BUYERS") ? "BUY" : aggressorFlow.includes("SELLERS") ? "SELL" : "NEUTRAL"];
  const conflictLevel = conflictVotes[0] !== "NEUTRAL" && conflictVotes[1] !== "NEUTRAL" && conflictVotes[0] !== conflictVotes[1] ? "HIGH" : conflictVotes.includes("NEUTRAL") ? "MED" : "LOW";

  const riskGate = marketStress === "HIGH" || conflictLevel === "HIGH" ? "BLOCK" : "PASS";
  const tradeValidity: AiPanelData["tradeValidity"] =
    riskGate === "BLOCK"
      ? "NO-TRADE"
      : asymmetryScore === "REWARD_DOMINANT" && realMomentum === "CONFIRMED"
        ? "VALID"
        : "WEAK";

  const cascadeRisk = (marketStress === "HIGH" && feeds.openInterest) ? "HIGH" : marketStress === "BUILDING" ? "MED" : "LOW";
  const trapProbability = stopClusterProb === "HIGH" || marketIntent === "LIQUIDITY_HUNT" ? "HIGH" : conflictLevel === "MED" ? "MED" : "LOW";

  const tiles: Record<string, TileState> = {
    "market-regime": enumTile("market-regime", regime, feeds, `regime=${regime}`, "Primary structure classifier from trend persistence and volatility."),
    "distance-key-level": enumTile("distance-key-level", pick(["FAR", "NEAR", "AT LEVEL"]), feeds, `${rand(0.1, 2.1).toFixed(2)}%`, "Distance to nearest structural key level."),
    "range-position": enumTile("range-position", trendDirection === "UP" ? "TOP" : trendDirection === "DOWN" ? "BOTTOM" : "MID", feeds, `loc=${rand(0.1, 0.92).toFixed(2)}`, "Position inside active range envelope."),
    "liquidity-cluster": enumTile("liquidity-cluster", liquidityDensity === "HIGH" ? pick(["ABOVE", "BELOW"]) : "NONE", feeds, `density=${liquidityDensity}`, "Nearby passive liquidity concentration side."),
    "last-swing-distance": enumTile("last-swing-distance", trendStrength === "STRONG" ? "FAR" : trendStrength === "MID" ? "MID" : "NEAR", feeds, `${rand(0.3, 2.8).toFixed(2)} ATR`, "Distance to nearest swing anchor."),
    "htf-level-reaction": enumTile("htf-level-reaction", pick(["STRONG", "WEAK", "NONE"]), feeds, `reaction=${Math.round(rand(22, 91))}%`, "HTF reaction force score."),
    "structure-age": enumTile("structure-age", structureAge, feeds, `bars=${barsSinceRegime}`, "Maturity state of current structure phase."),
    "time-in-range": numericTile("time-in-range", timeInRange, feeds, `${timeInRange} bars`, "How long price has stayed in range-like behavior."),
    "market-intent": enumTile("market-intent", marketIntent, feeds, `intent=${marketIntent.toLowerCase()}`, "Inferred intent from regime, liquidity and flow behavior."),

    "trend-direction": enumTile("trend-direction", trendDirection, feeds, `trend_bias=${trendBias.toFixed(2)}`, "Direction from multi-factor slope and structure votes."),
    "trend-strength": enumTile("trend-strength", trendStrength, feeds, `abs_bias=${Math.abs(trendBias).toFixed(2)}`, "Magnitude of trend persistence."),
    "trend-phase": enumTile("trend-phase", trendStrength === "STRONG" ? "MID" : trendStrength === "MID" ? "EARLY" : "LATE", feeds, `phase=${trendStrength.toLowerCase()}`, "Lifecycle phase of trend progression."),
    "ema-alignment": enumTile("ema-alignment", trendDirection === "UP" ? "BULL" : trendDirection === "DOWN" ? "BEAR" : "MIXED", feeds, `ema_stack=${trendDirection}`, "EMA stack directional alignment."),
    "vwap-position": enumTile("vwap-position", trendDirection === "UP" ? "ABOVE" : trendDirection === "DOWN" ? "BELOW" : "AROUND", feeds, `vwap_dev=${jitter(0, 0.8).toFixed(2)}%`, "Price location relative to VWAP."),
    "time-since-regime-change": numericTile("time-since-regime-change", barsSinceRegime, feeds, `${barsSinceRegime} bars`, "Elapsed bars since regime transition."),

    "atr-regime": enumTile("atr-regime", atrRegime, feeds, `atr_norm=${volScore.toFixed(2)}`, "Normalized ATR regime."),
    compression: enumTile("compression", atrRegime === "LOW" ? "ON" : "OFF", feeds, `atr=${atrRegime}`, "Compression flag from low-volatility clustering."),
    "market-speed": enumTile("market-speed", pick(["SLOW", "NORMAL", "FAST", "VIOLENT"]), feeds, `speed=${Math.round(rand(120, 760))} tpm`, "Execution tempo estimate."),
    "breakout-risk": enumTile("breakout-risk", breakoutRisk, feeds, `vol=${volScore.toFixed(2)}`, "Breakout probability proxy from compression/expansion."),
    "fake-breakout-prob": enumTile("fake-breakout-prob", conflictLevel === "HIGH" ? "HIGH" : conflictLevel === "MED" ? "MED" : "LOW", feeds, `conflict=${conflictLevel}`, "Fake breakout probability from signal disagreement."),
    "expansion-prob": enumTile("expansion-prob", volExpansionProb, feeds, `p=${volExpansionProb}`, "Expected volatility expansion chance."),
    "sudden-move-risk": enumTile("sudden-move-risk", suddenMoveRisk, feeds, `stress=${marketStress}`, "Likelihood of abrupt displacement."),
    "volatility-expansion-prob": enumTile("volatility-expansion-prob", volExpansionProb, feeds, `regime=${atrRegime}`, "Expansion probability from volatility regime."),
    "news-risk-flag": enumTile("news-risk-flag", feeds.rawFeeds && rand(0, 1) > 0.78 ? "ON" : "OFF", feeds, "calendar_proxy", "Mock news risk flag from raw feed layer."),

    "spread-regime": enumTile("spread-regime", spreadRegime, feeds, `${rand(1.2, 12.4).toFixed(2)} bps`, "Current spread regime."),
    "depth-quality": enumTile("depth-quality", depthQuality, feeds, `$${Math.round(rand(18, 130))}M`, "Top-book depth quality."),
    "orderbook-imbalance": enumTile("orderbook-imbalance", aggressorFlow === "BUYERS_DOMINANT" ? "BUY" : aggressorFlow === "SELLERS_DOMINANT" ? "SELL" : "NEUTRAL", feeds, `imb=${flowScore.toFixed(2)}`, "Book-side pressure imbalance."),
    "slippage-risk": enumTile("slippage-risk", slippageRisk, feeds, `spread=${spreadRegime} depth=${depthQuality}`, "Estimated execution impact risk."),
    "liquidity-density": enumTile("liquidity-density", liquidityDensity, feeds, `liq=${liqScore.toFixed(2)}`, "Liquidity concentration around mid-price."),
    "stop-cluster-probability": enumTile("stop-cluster-probability", stopClusterProb, feeds, `cluster=${stopClusterProb}`, "Probability of dense stop zone nearby."),
    "liquidity-distance": numericTile("liquidity-distance", liquidityDistance, feeds, `${liquidityDistance}%`, "Distance to nearest major liquidity pocket."),
    "entry-timing-window": enumTile("entry-timing-window", entryTimingWindow, feeds, `window=${entryTimingWindow}`, "Execution window availability."),
    "reaction-sensitivity": enumTile("reaction-sensitivity", reactionSensitivity, feeds, `spread=${spreadRegime}`, "Sensitivity of reaction to orderflow shocks."),
    "impulse-readiness": enumTile("impulse-readiness", impulseReadiness, feeds, `momentum=${realMomentum}`, "Readiness for impulse continuation."),
    "orderbook-stability": enumTile("orderbook-stability", orderbookStability, feeds, `stability=${orderbookStability}`, "Microstructure stability profile."),
    "aggressor-flow": enumTile("aggressor-flow", aggressorFlow, feeds, `flow=${flowScore.toFixed(2)}`, "Dominant aggressor side on tape."),
    "liquidity-refill-behaviour": enumTile("liquidity-refill-behaviour", refillBehaviour, feeds, `refill=${refillBehaviour}`, "How quickly consumed liquidity refills."),

    "volume-spike": enumTile("volume-spike", pick(["ON", "OFF"]), feeds, `z=${jitter(0.9, 3.2).toFixed(2)}`, "Volume anomaly signal."),
    "buy-sell-imbalance": enumTile("buy-sell-imbalance", aggressorFlow === "BUYERS_DOMINANT" ? "BUY" : aggressorFlow === "SELLERS_DOMINANT" ? "SELL" : "NEUTRAL", feeds, `${Math.round(jitter(0, 140))} BTC`, "Taker imbalance state."),
    "oi-change": enumTile("oi-change", pick(["UP", "DOWN", "FLAT"]), feeds, `${jitter(0.5, 5).toFixed(2)}%`, "Open interest change state."),
    "funding-bias": enumTile("funding-bias", pick(["CROWDED_LONG", "CROWDED_SHORT", "NEUTRAL"]), feeds, `${jitter(0.001, 0.03).toFixed(3)}%`, "Funding crowding state."),
    "move-participation-score": enumTile("move-participation-score", moveParticipation, feeds, `flow=${aggressorFlow} oi=${feeds.openInterest ? "on" : "off"}`, "Participation truth from volume/OI/delta."),
    "spot-vs-derivatives-pressure": enumTile("spot-vs-derivatives-pressure", spotVsDeriv, feeds, `mode=${spotVsDeriv}`, "Dominant pressure source.") ,
    "real-momentum-score": enumTile("real-momentum-score", realMomentum, feeds, `trend=${trendDirection} flow=${aggressorFlow}`, "Divergence-aware momentum confirmation."),

    "entry-quality": enumTile("entry-quality", tradeValidity === "VALID" ? "GOOD" : tradeValidity === "WEAK" ? "OK" : "POOR", feeds, `validity=${tradeValidity}`, "Composite entry quality score."),
    "rr-potential": enumTile("rr-potential", asymmetryScore === "REWARD_DOMINANT" ? "HIGH" : asymmetryScore === "BALANCED" ? "NORMAL" : "LOW", feeds, `asym=${asymmetryScore}`, "Reward to risk potential."),
    "invalidation-distance": enumTile("invalidation-distance", atrRegime === "HIGH" ? "WIDE" : atrRegime === "LOW" ? "TIGHT" : "NORMAL", feeds, `${rand(0.4, 2.5).toFixed(2)}%`, "Invalidation distance regime."),
    "reward-distance": enumTile("reward-distance", trendStrength === "STRONG" ? "EXTENDED" : trendStrength === "MID" ? "NORMAL" : "SHORT", feeds, `${rand(0.8, 4.2).toFixed(2)}%`, "Distance to probable reward zone."),
    "risk-arrival-speed": enumTile("risk-arrival-speed", riskArrivalSpeed, feeds, `risk_speed=${riskArrivalSpeed}`, "How fast adverse risk can materialize."),
    "reward-accessibility": enumTile("reward-accessibility", rewardAccessibility, feeds, `reward=${rewardAccessibility}`, "Ease of reaching reward zones."),
    "asymmetry-score": enumTile("asymmetry-score", asymmetryScore, feeds, `asym=${asymmetryScore}`, "Risk/reward asymmetry profile."),

    "trade-validity": enumTile("trade-validity", tradeValidity, feeds, `gate=${riskGate}`, "Final trade validity filter."),
    "signal-conflict": enumTile("signal-conflict", conflictLevel, feeds, `votes=${conflictVotes.join("/")}`, "Cross-signal conflict intensity."),
    "risk-gate": enumTile("risk-gate", riskGate, feeds, `stress=${marketStress} conflict=${conflictLevel}`, "Hard risk gate status."),

    "relative-strength-vs-market": enumTile("relative-strength-vs-market", relativeStrength, feeds, `rs=${relativeStrength}`, "BTC relative strength to broad market."),
    "opportunity-rank": enumTile("opportunity-rank", opportunityRank, feeds, `rank=${opportunityRank}`, "Current opportunity ranking."),
    "btc-leadership-state": enumTile("btc-leadership-state", leadership, feeds, `leadership=${leadership}`, "BTC leadership behavior."),

    "market-stress-level": enumTile("market-stress-level", marketStress, feeds, `stress=${marketStress}`, "Composite market stress layer."),
    "cascade-risk": enumTile("cascade-risk", cascadeRisk, feeds, `cascade=${cascadeRisk}`, "Liquidation cascade probability."),
    "trap-probability": enumTile("trap-probability", trapProbability, feeds, `trap=${trapProbability}`, "Liquidity trap probability."),
  };

  const indicatorsEnabled = indicators?.masterEnabled ?? true;
  const i = indicators?.indicators;

  const rsiLength = Number(i?.rsi?.settings.length ?? 14);
  const rsiOb = Number(i?.rsi?.settings.overbought ?? 70);
  const rsiOs = Number(i?.rsi?.settings.oversold ?? 30);
  const rsiBase = trendDirection === "UP" ? rand(52, 76) : trendDirection === "DOWN" ? rand(24, 48) : rand(42, 58);
  const rsiValue = clamp(jitter(rsiBase, Math.max(4, 18 - rsiLength * 0.4)), 5, 95);
  const rsiState = rsiValue >= rsiOb ? "OVERBOUGHT" : rsiValue <= rsiOs ? "OVERSOLD" : "NEUTRAL";

  const adxThreshold = Number(i?.adx?.settings.thresholdStrong ?? 25);
  const adxValue = trendStrength === "STRONG" ? rand(27, 44) : trendStrength === "MID" ? rand(19, 30) : rand(10, 22);
  const adxState = adxValue >= adxThreshold ? "STRONG" : adxValue >= adxThreshold * 0.65 ? "OK" : "WEAK";

  const macdFast = Number(i?.macd?.settings.fast ?? 12);
  const macdSlow = Number(i?.macd?.settings.slow ?? 26);
  const macdSignal = Number(i?.macd?.settings.signal ?? 9);
  const macdEdge = trendDirection === "UP" ? 1 : trendDirection === "DOWN" ? -1 : 0;
  const macdHistogram = jitter(macdEdge * (macdSlow - macdFast) / Math.max(macdSignal, 1), 1.1);
  const macdState = Math.abs(macdHistogram) < 0.35 ? "FLAT" : macdHistogram > 0 ? "BULL" : "BEAR";

  const bbandsStdev = Number(i?.bbands?.settings.stdev ?? 2);
  const bbandsSqueeze = atrRegime === "LOW" && bbandsStdev >= 1.6 ? "ON" : "OFF";

  const divergenceMode = String(i?.divergence?.settings.mode ?? "BOTH");
  const divergenceSensitivity = String(i?.divergence?.settings.sensitivity ?? "MED");
  const divergenceBias = realMomentum === "UNCONFIRMED" && trendDirection !== "NEUTRAL" ? (trendDirection === "UP" ? "BEAR_DIV" : "BULL_DIV") : "NONE";
  const divergenceNoise = divergenceSensitivity === "HIGH" ? 0.4 : divergenceSensitivity === "LOW" ? 0.1 : 0.25;
  const divergenceState = (divergenceMode === "BOTH" || (divergenceMode === "RSI" && rsiState !== "NEUTRAL") || (divergenceMode === "MACD" && macdState !== "FLAT"))
    && Math.random() < divergenceNoise
    ? divergenceBias
    : "NONE";

  const supertrendDirection = trendDirection === "NEUTRAL" ? (macdState === "BULL" ? "UP" : "DOWN") : trendDirection;
  const ichimokuCloudBias = trendDirection === "UP" ? "BULL" : trendDirection === "DOWN" ? "BEAR" : "NEUTRAL";

  const indicatorTile = (indicatorKey: keyof IndicatorsState["indicators"], key: string, state: string, rawValue: string, why: string): TileState => {
    if (!indicatorsEnabled) return indicatorOffTile(key, "Indicators master OFF");
    if (!i?.[indicatorKey]?.enabled) return indicatorOffTile(key, `${indicatorKey} indicator OFF`);
    return enumTile(key, state, feeds, rawValue, why);
  };

  tiles["rsi-state"] = indicatorTile("rsi", "rsi-state", rsiState, `RSI(${rsiLength})=${rsiValue.toFixed(1)}`, "RSI state from momentum and configured thresholds.");
  tiles["macd-state"] = indicatorTile("macd", "macd-state", macdState, `MACD(${macdFast},${macdSlow},${macdSignal})=${macdHistogram.toFixed(2)}`, "MACD histogram directional state.");
  tiles["adx-state"] = indicatorTile("adx", "adx-state", adxState, `ADX(14)=${adxValue.toFixed(1)} thr=${adxThreshold}`, "Trend strength state from ADX threshold.");
  tiles["bbands-squeeze"] = indicatorTile("bbands", "bbands-squeeze", bbandsSqueeze, `stdev=${bbandsStdev} atr=${atrRegime}`, "Bollinger squeeze from ATR regime and band width.");
  tiles["divergence-state"] = indicatorTile("divergence", "divergence-state", divergenceState, `mode=${divergenceMode} sens=${divergenceSensitivity}`, "Divergence detector state.");
  tiles["supertrend-direction"] = indicatorTile("supertrend", "supertrend-direction", supertrendDirection, `direction=${supertrendDirection}`, "Supertrend directional side.");
  tiles["ichimoku-cloud-bias"] = indicatorTile("ichimoku", "ichimoku-cloud-bias", ichimokuCloudBias, `bias=${ichimokuCloudBias}`, "Ichimoku cloud directional bias.");

  const keys = [...DEFAULT_TILES, ...ADVANCED_TILES];
  return keys.map((key) => tiles[key]);
};

const tileState = (tiles: TileState[], key: string, fallback = "N/A") => {
  const tile = tiles.find((t) => t.key === key);
  return tile?.state ?? (typeof tile?.value === "number" ? `${tile.value}${tile.unit ? ` ${tile.unit}` : ""}` : fallback);
};

const tileValue = (tiles: TileState[], key: string, fallback = 0) => {
  const tile = tiles.find((t) => t.key === key);
  return typeof tile?.value === "number" ? tile.value : fallback;
};

const DEFAULT_CONSENSUS_INPUTS: ConsensusInputConfig = {
  tradeValidity: true,
  bias: true,
  intent: true,
  urgency: true,
  slippage: true,
  entryTiming: true,
  riskGate: true,
  marketStress: true,
  modelAgreement: true,
};

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const scoreToFactor = (score: number, min: number, max: number) => clamp(min + score / 200, min, max);

const biasScore = (value: AiPanelData["bias"]): number => {
  if (value === "LONG" || value === "SHORT") return 72;
  if (value === "WATCH") return 52;
  return 25;
};

const intentScore = (value: AiPanelData["marketIntent"]): number => {
  if (value === "TREND_CONTINUATION") return 82;
  if (value === "ACCUMULATION") return 62;
  if (value === "DISTRIBUTION") return 54;
  return 34;
};

const urgencyScore = (value: AiPanelData["executionUrgency"]): number => {
  if (value === "ACT") return 88;
  if (value === "PREPARE") return 68;
  if (value === "WATCH") return 50;
  return 30;
};

const slippageScore = (value: string): number => {
  if (value === "LOW") return 84;
  if (value === "MED") return 62;
  return 30;
};

const marketStressScore = (value: string): number => {
  if (value === "LOW") return 82;
  if (value === "BUILDING") return 58;
  return 28;
};

const modelAgreementScore = (agreement: AiPanelData["modelAgreement"]): number => {
  const total = Math.max(1, agreement.totalModels);
  const alignedRatio = agreement.aligned / total;
  const oppositeRatio = agreement.opposite / total;
  const unknownRatio = agreement.unknown / total;
  return clamp(Math.round(40 + alignedRatio * 60 - oppositeRatio * 28 - unknownRatio * 12), 0, 100);
};

export const generateAiPanel = (
  tiles: TileState[],
  scenario: ScenarioConfig,
  feeds: FeedConfig,
  consensusInputs: ConsensusInputConfig = DEFAULT_CONSENSUS_INPUTS,
  dataHealth?: DataHealthState,
  scoringMode: ScoringMode = "BALANCED",
): AiPanelData => {
  const modeConfig = SCORING_CONFIG[scoringMode];
  const trendDirection = tileState(tiles, "trend-direction", "N/A");
  const trendStrength = tileState(tiles, "trend-strength", "N/A");
  const regime = tileState(tiles, "market-regime", "N/A");
  const structureAge = tileState(tiles, "structure-age", "N/A");
  const timeInRange = tileValue(tiles, "time-in-range");
  const htfAlignment = tileState(tiles, "relative-strength-vs-market", "N/A");

  const orderbookImbalance = tileState(tiles, "orderbook-imbalance", "N/A");
  const tapeImbalance = tileState(tiles, "buy-sell-imbalance", "N/A");
  const slippage = tileState(tiles, "slippage-risk", "N/A");
  const liquidityDensity = tileState(tiles, "liquidity-density", "N/A");
  const orderbookStability = tileState(tiles, "orderbook-stability", "N/A");
  const entryTiming = tileState(tiles, "entry-timing-window", "N/A");
  const spreadRegime = tileState(tiles, "spread-regime", "N/A");
  const vwapPosition = tileState(tiles, "vwap-position", "N/A");

  const compression = tileState(tiles, "compression", "N/A");
  const breakoutRisk = tileState(tiles, "breakout-risk", "N/A");
  const marketStressRaw = tileState(tiles, "market-stress-level", "N/A");
  const atrRegime = tileState(tiles, "atr-regime", "N/A");
  const marketSpeed = tileState(tiles, "market-speed", "N/A");
  const asymmetry = tileState(tiles, "asymmetry-score", "N/A");

  const participation = tileState(tiles, "move-participation-score", "N/A");
  const derivativesPressure = tileState(tiles, "spot-vs-derivatives-pressure", "N/A");
  const fundingBias = tileState(tiles, "funding-bias", "N/A");
  const oiChange = tileState(tiles, "oi-change", "N/A");
  const liquidityDistance = tileState(tiles, "liquidity-distance", "N/A");

  const coreReadiness = [
    { label: "OHLCV", enabled: feeds.priceOhlcv, ready: trendDirection !== "N/A" },
    { label: "Orderbook", enabled: feeds.orderbook, ready: orderbookImbalance !== "N/A" && slippage !== "N/A" },
    { label: "Trades", enabled: feeds.trades, ready: tapeImbalance !== "N/A" },
  ] as const;
  const coreFeedsEnabled = coreReadiness.every((item) => item.enabled);
  const coreStatesReady = coreReadiness.every((item) => item.ready);
  if (!coreFeedsEnabled || !coreStatesReady) {
    const missingCore = coreReadiness.filter((item) => !item.enabled || !item.ready).map((item) => item.label);
    const readyCoreCount = coreReadiness.filter((item) => item.enabled && item.ready).length;
    const coverage = readyCoreCount / coreReadiness.length;
    const freshnessFactor = clamp(1 - (dataHealth?.lastUpdateAgeSec ?? 12) / 90, 0.2, 1);
    const latencyFactor = clamp(1 - (dataHealth?.latencyMs ?? 900) / 3000, 0.2, 1);
    const staleFactor = dataHealth?.staleFeed ? 0.65 : 1;
    const incompleteConsensus = clamp(
      Math.round(100 * coverage * freshnessFactor * latencyFactor * staleFactor),
      0,
      100,
    );
    const incompleteBandLow = clamp(incompleteConsensus - 10, 0, 100);
    const incompleteBandHigh = clamp(incompleteConsensus + 10, 0, 100);
    const incompleteGatingFlags = [
      ...(missingCore.includes("OHLCV") ? (["LOW_EDGE"] as const) : []),
      ...(missingCore.includes("Orderbook") || missingCore.includes("Trades") ? (["LOW_FILL_PROB", "LOW_CAPACITY"] as const) : []),
    ];
    return {
      summary: ["Live market data is incomplete.", "Signals are withheld until all required feeds are online."],
      keyReasons: [
        `Missing core feeds: ${missingCore.length ? missingCore.join(" / ") : "OHLCV / Orderbook / Trades"}.`,
        "Static fallback is disabled by policy.",
        `Real-time degraded score from feed coverage ${Math.round(coverage * 100)}%, freshness ${Math.round(freshnessFactor * 100)}%, latency ${Math.round(latencyFactor * 100)}%.`,
      ],
      riskChecks: [
        { label: "Risk Gate", status: "BLOCK", detail: "Blocked: incomplete live data." },
        { label: "Execution Certainty", status: "BLOCK", detail: "Cannot evaluate without full live feed set." },
        { label: "Stress Filter", status: "BLOCK", detail: "Stress model unavailable due to missing inputs." },
      ],
      tradeValidity: "NO-TRADE",
      bias: "NONE",
      signalConsensus: incompleteConsensus,
      conflictLevel: "HIGH",
      marketIntent: "ACCUMULATION",
      playbook: "Wait for full data",
      confidenceBand: [incompleteBandLow, incompleteBandHigh],
      confidenceDrivers: { structure: 0, liquidity: 0, positioning: 0, execution: 0 },
      scenarioOutlook: { trendContinuation: 0, rangeContinuation: 0, breakoutMove: 0 },
      crowdingRisk: "LOW",
      priceLocation: "Unavailable",
      freshness: { updatedSecAgo: dataHealth?.lastUpdateAgeSec ?? 0, validForBars: 0 },
      triggerConditions: ["OHLCV feed live", "Orderbook + Trades live", "Funding + OI live"],
      invalidationTriggers: ["N/A"],
      executionUrgency: "WAIT",
      expectedMove: "N/A",
      recentRegimePath: ["N/A"],
      modelAgreement: { totalModels: 6, aligned: 0, neutral: 0, opposite: 0, unknown: 6, direction: "NONE" },
      explainability: ["No inference generated. Live data missing."],
      sizeHint: "0",
      sizeHintReason: "Position sizing disabled until live data is complete.",
      sessionContext: { session: "Weekend", liquidityExpectation: "Lower" },
      timeContextSummary: "Unavailable",
      riskEnvironmentSummary: "Unavailable",
      executionCertaintySummary: "Unavailable",
      portfolioContextSummary: "Unavailable",
      scoringMode,
      scoreBreakdown: {
        edgeAdj: 0,
        riskAdj: Number((freshnessFactor * latencyFactor * staleFactor).toFixed(4)),
        pFill: 0,
        capacity: 0,
        inputModifier: Number(coverage.toFixed(4)),
        penaltyPoints: 0,
      },
      gatingFlags: incompleteGatingFlags,
      scoring_mode: scoringMode,
      score_breakdown: {
        edgeAdj: 0,
        riskAdj: Number((freshnessFactor * latencyFactor * staleFactor).toFixed(4)),
        pFill: 0,
        capacity: 0,
        inputModifier: Number(coverage.toFixed(4)),
        penaltyPoints: 0,
      },
      gating_flags: incompleteGatingFlags,
      consensusEngine: {
        dataComplete: false,
        edgeNetR: 0,
        pWin: 0,
        pStop: 0,
        avgWinR: 0,
        expectedRR: 0,
        costR: 0,
        pFill: 0,
        capacityFactor: 0,
        riskAdjustment: 0,
        riskAdjustedEdgeR: 0,
        expectedHoldingBars: 0,
        inputModifier: Number(coverage.toFixed(4)),
        rawConsensus: incompleteConsensus,
        adjustedConsensus: incompleteConsensus,
        penalizedConsensus: incompleteConsensus,
        penaltyTotal: 0,
        penaltyModel: modeConfig.penaltyModel,
        penaltyRate: 0,
        penaltyApplied: 0,
        hardGates: {
          tradeValidity: false,
          dataHealth: false,
          riskGate: false,
          entryWindow: false,
          fillProb: false,
          edge: false,
          capacity: false,
        },
        formulaLine: `Incomplete score = 100 * coverage(${coverage.toFixed(2)}) * freshness(${freshnessFactor.toFixed(2)}) * latency(${latencyFactor.toFixed(2)}) * stale(${staleFactor.toFixed(2)}) = ${incompleteConsensus}`,
      },
    };
  }

  const stateScore = (state: string, table: Record<string, number>, fallback = 45) => table[state] ?? fallback;
  const weightedScore = (parts: Array<{ score: number; weight: number }>): number => {
    const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
    if (!totalWeight) return 0;
    const total = parts.reduce((sum, part) => sum + part.score * part.weight, 0);
    return Math.round(total / totalWeight);
  };

  const intent: AiPanelData["marketIntent"] =
    trendStrength === "STRONG" || regime === "TREND"
      ? "TREND_CONTINUATION"
      : regime === "RANGE" && ["HIGH", "MID"].includes(liquidityDensity)
        ? "ACCUMULATION"
        : compression === "ON" && breakoutRisk !== "LOW"
          ? "LIQUIDITY_HUNT"
          : trendDirection === "DOWN"
            ? "DISTRIBUTION"
            : "ACCUMULATION";

  let longVotes = 0;
  let shortVotes = 0;
  const addVote = (state: string, longStates: string[], shortStates: string[], weight = 1) => {
    if (longStates.includes(state)) longVotes += weight;
    if (shortStates.includes(state)) shortVotes += weight;
  };

  addVote(trendDirection, ["UP"], ["DOWN"], 2);
  addVote(orderbookImbalance, ["BUY"], ["SELL"], 1);
  addVote(tapeImbalance, ["BUY"], ["SELL"], 1);
  addVote(vwapPosition, ["ABOVE"], ["BELOW"], 1);
  addVote(htfAlignment, ["STRONG"], ["WEAK"], 1);
  if (derivativesPressure === "DERIV_LED" && fundingBias === "CROWDED_LONG") longVotes += 1;
  if (derivativesPressure === "DERIV_LED" && fundingBias === "CROWDED_SHORT") shortVotes += 1;
  if (intent === "TREND_CONTINUATION" && trendDirection === "UP") longVotes += 1;
  if (intent === "TREND_CONTINUATION" && trendDirection === "DOWN") shortVotes += 1;

  let bias: AiPanelData["bias"] = "NONE";
  if (longVotes >= shortVotes + 2) bias = "LONG";
  else if (shortVotes >= longVotes + 2) bias = "SHORT";
  else if (Math.max(longVotes, shortVotes) >= 3) bias = "WATCH";

  const voteTotal = longVotes + shortVotes;
  const voteDominance = voteTotal ? Math.abs(longVotes - shortVotes) / voteTotal : 0;
  const conflictLevel: AiPanelData["conflictLevel"] =
    voteDominance >= 0.45 ? "LOW" : voteDominance >= 0.2 ? "MED" : "HIGH";

  const crowdingRisk: AiPanelData["crowdingRisk"] =
    (fundingBias !== "NEUTRAL" && oiChange === "UP" && participation === "STRONG")
      ? "HIGH"
      : (fundingBias !== "NEUTRAL" || oiChange === "UP")
        ? "MODERATE"
        : "LOW";

  const marketStress = marketStressRaw !== "N/A"
    ? marketStressRaw
    : (marketSpeed === "VIOLENT" || slippage === "HIGH" || atrRegime === "HIGH")
      ? "HIGH"
      : (marketSpeed === "FAST" || slippage === "MED")
        ? "BUILDING"
        : "LOW";
  const suddenMove = marketStress === "HIGH" ? "HIGH" : marketStress === "BUILDING" ? "MED" : "LOW";

  const structureScore = weightedScore([
    { score: stateScore(trendDirection, { UP: 85, DOWN: 85, NEUTRAL: 45 }), weight: 30 },
    { score: stateScore(htfAlignment, { STRONG: 82, NEUTRAL: 60, WEAK: 38 }), weight: 20 },
    { score: stateScore(regime, { TREND: 78, RANGE: 60, CHOP: 42 }), weight: 15 },
    { score: stateScore(structureAge, { NEW: 72, DEVELOPING: 84, MATURE: 74, OLD: 58 }), weight: 15 },
    { score: regime === "RANGE" ? (timeInRange <= 40 ? 75 : timeInRange > 160 ? 55 : 65) : 72, weight: 20 },
  ]);

  const liquidityScore = weightedScore([
    { score: stateScore(liquidityDensity, { HIGH: 90, MID: 70, LOW: 35 }), weight: 30 },
    { score: stateScore(slippage, { LOW: 92, MED: 62, HIGH: 28 }), weight: 30 },
    { score: stateScore(orderbookStability, { STABLE: 86, SHIFTING: 60, SPOOF_RISK: 25 }), weight: 20 },
    { score: stateScore(entryTiming, { OPEN: 90, NARROW: 60, CLOSED: 25 }), weight: 20 },
  ]);

  const positioningScore = weightedScore([
    { score: stateScore(participation, { STRONG: 85, NORMAL: 65, WEAK: 40 }), weight: 25 },
    { score: stateScore(derivativesPressure, { DERIV_LED: 75, SPOT_LED: 70, BALANCED: 60 }), weight: 25 },
    { score: stateScore(crowdingRisk, { LOW: 85, MODERATE: 60, HIGH: 35 }), weight: 25 },
    { score: stateScore(fundingBias, { NEUTRAL: 70, CROWDED_LONG: 55, CROWDED_SHORT: 55 }), weight: 25 },
  ]);

  const volatilityContextScore =
    marketStress === "LOW" && ["LOW", "NORMAL"].includes(atrRegime) ? 82
      : marketStress === "BUILDING" ? 58
        : 30;
  const executionScore = weightedScore([
    { score: stateScore(entryTiming, { OPEN: 90, NARROW: 60, CLOSED: 25 }), weight: 30 },
    { score: stateScore(asymmetry, { REWARD_DOMINANT: 90, BALANCED: 65, RISK_DOMINANT: 30 }), weight: 30 },
    { score: volatilityContextScore, weight: 20 },
    { score: stateScore(spreadRegime, { TIGHT: 88, NORMAL: 65, WIDE: 35 }), weight: 20 },
  ]);

  const baseLayerConsensus = Math.round((structureScore + liquidityScore + positioningScore + executionScore) / 4);
  const provisionalTradeValidity: AiPanelData["tradeValidity"] =
    baseLayerConsensus >= 75 ? "VALID" : baseLayerConsensus >= 60 ? "WEAK" : "NO-TRADE";
  const provisionalRiskGate = baseLayerConsensus >= 60 && slippage !== "HIGH" ? "PASS" : "BLOCK";
  const provisionalUrgency: AiPanelData["executionUrgency"] =
    executionScore >= 82 && entryTiming === "OPEN" ? "ACT"
      : executionScore >= 68 && entryTiming !== "CLOSED" ? "PREPARE"
        : executionScore >= 55 ? "WATCH"
          : "WAIT";

  const toModelVote = (state: string): "LONG" | "SHORT" | "NEUTRAL" | "UNKNOWN" => {
    if (["UP", "BUY", "ABOVE", "STRONG", "LONG"].includes(state)) return "LONG";
    if (["DOWN", "SELL", "BELOW", "WEAK", "SHORT"].includes(state)) return "SHORT";
    if (["NEUTRAL", "AROUND", "BALANCED", "FLAT", "NONE"].includes(state)) return "NEUTRAL";
    return "UNKNOWN";
  };
  const derivativesVote =
    derivativesPressure === "DERIV_LED" && fundingBias === "CROWDED_LONG"
      ? "LONG"
      : derivativesPressure === "DERIV_LED" && fundingBias === "CROWDED_SHORT"
        ? "SHORT"
        : derivativesPressure === "BALANCED"
          ? "NEUTRAL"
          : "UNKNOWN";
  const modelVotes = [
    toModelVote(trendDirection),
    toModelVote(orderbookImbalance),
    toModelVote(tapeImbalance),
    toModelVote(vwapPosition),
    toModelVote(htfAlignment),
    derivativesVote as "LONG" | "SHORT" | "NEUTRAL" | "UNKNOWN",
  ];
  const modelDirection: AiPanelData["modelAgreement"]["direction"] =
    bias === "LONG" || bias === "SHORT" ? bias : bias === "WATCH" ? "WATCH" : "NONE";
  let aligned = 0;
  let neutral = 0;
  let opposite = 0;
  let unknown = 0;
  for (const vote of modelVotes) {
    if (vote === "UNKNOWN") {
      unknown += 1;
      continue;
    }
    if (modelDirection === "LONG" || modelDirection === "SHORT") {
      if (vote === "NEUTRAL") neutral += 1;
      else if (vote === modelDirection) aligned += 1;
      else opposite += 1;
      continue;
    }
    if (modelDirection === "WATCH") {
      neutral += 1;
      continue;
    }
    if (vote === "NEUTRAL") neutral += 1;
    else unknown += 1;
  }
  const modelAgreement = {
    totalModels: modelVotes.length,
    aligned,
    neutral,
    opposite,
    unknown,
    direction: modelDirection,
  };

  const modelAgreementValue = modelAgreementScore(modelAgreement);
  const consensusInputFactors: Array<{ enabled: boolean; factor: number }> = [
    { enabled: consensusInputs.bias, factor: scoreToFactor(biasScore(bias), 0.90, 1.03) },
    { enabled: consensusInputs.intent, factor: scoreToFactor(intentScore(intent), 0.92, 1.04) },
    { enabled: consensusInputs.urgency, factor: scoreToFactor(urgencyScore(provisionalUrgency), 0.92, 1.05) },
    { enabled: consensusInputs.slippage, factor: scoreToFactor(slippageScore(slippage), 0.90, 1.03) },
    { enabled: consensusInputs.marketStress, factor: scoreToFactor(marketStressScore(marketStress), 0.90, 1.03) },
    { enabled: consensusInputs.modelAgreement, factor: scoreToFactor(modelAgreementValue, 0.90, 1.04) },
  ];
  const enabledInputFactors = consensusInputFactors.filter((item) => item.enabled).map((item) => item.factor);
  const softConsensusControlCount = enabledInputFactors.length;
  const inputModifier = enabledInputFactors.length
    ? Math.exp(enabledInputFactors.reduce((sum, factor) => sum + Math.log(Math.max(0.01, factor)), 0) / enabledInputFactors.length)
    : 1;

  const structureNorm = structureScore / 100;
  const liquidityNorm = liquidityScore / 100;
  const positioningNorm = positioningScore / 100;
  const momentumNorm = executionScore / 100;
  const conflictNorm = conflictLevel === "LOW" ? 0.2 : conflictLevel === "MED" ? 0.55 : 0.9;
  const pWin = clamp(
    sigmoid(-0.42 + 1.15 * structureNorm + 0.95 * liquidityNorm + 0.9 * positioningNorm + 1.05 * momentumNorm - 1.1 * conflictNorm),
    0.05,
    0.95,
  );
  const avgWinR = asymmetry === "REWARD_DOMINANT" ? 1.8 : asymmetry === "BALANCED" ? 1.25 : 0.75;
  const feesPct = scenario.horizon === "SCALP" ? 0.001 : scenario.horizon === "INTRADAY" ? 0.0008 : 0.0006;
  const slippagePct = slippage === "LOW" ? 0.0004 : slippage === "MED" ? 0.001 : 0.0018;
  const stopDistancePct = atrRegime === "HIGH" ? 0.018 : atrRegime === "NORMAL" ? 0.012 : 0.008;
  const costR = (feesPct + slippagePct) / Math.max(stopDistancePct, 0.004);
  const pStop = 1 - pWin;
  const edgeNetR = pWin * avgWinR - pStop - costR;
  const expectedRR = avgWinR;

  const spreadBad = spreadRegime === "WIDE" ? 1 : spreadRegime === "NORMAL" ? 0.55 : 0.2;
  const slippageBad = slippage === "HIGH" ? 1 : slippage === "MED" ? 0.55 : 0.2;
  const depthGood = liquidityDensity === "HIGH" ? 1 : liquidityDensity === "MID" ? 0.65 : 0.35;
  const obStable = orderbookStability === "STABLE" ? 1 : orderbookStability === "SHIFTING" ? 0.6 : 0.25;
  const volShock = marketStress === "HIGH" || marketSpeed === "VIOLENT" ? 1 : marketStress === "BUILDING" ? 0.6 : 0.25;
  const pFill = clamp(sigmoid(-0.25 - 1.1 * spreadBad - 1.2 * slippageBad + 1.35 * depthGood + 1.1 * obStable - 0.95 * volShock), 0.05, 0.99);

  const liquidityCapacityShare = liquidityDensity === "HIGH" ? 0.03 : liquidityDensity === "MID" ? 0.018 : 0.009;
  const desiredShareBase = scenario.riskMode === "AGGRESSIVE" ? 0.018 : scenario.riskMode === "NORMAL" ? 0.012 : 0.008;
  const desiredShareAdj = scenario.horizon === "SCALP" ? 0.004 : scenario.horizon === "SWING" ? -0.002 : 0;
  const desiredShare = clamp(desiredShareBase + desiredShareAdj, 0.005, 0.03);
  const capacityFactor = clamp(liquidityCapacityShare / desiredShare, 0, 1);

  const stressNorm = marketStress === "HIGH" ? 0.95 : marketStress === "BUILDING" ? 0.55 : 0.15;
  const shockNorm = marketSpeed === "VIOLENT" ? 1 : marketSpeed === "FAST" ? 0.65 : marketSpeed === "NORMAL" ? 0.35 : 0.15;
  const chopNorm = regime === "CHOP" ? 0.9 : regime === "RANGE" ? 0.55 : 0.2;
  const crowdNorm = crowdingRisk === "HIGH" ? 0.9 : crowdingRisk === "MODERATE" ? 0.55 : 0.2;
  const flowMomentum = clamp(momentumNorm * 0.75 + structureNorm * 0.25, 0, 1);
  const flowVolumeSpike = clamp(shockNorm * 0.8 + (participation === "STRONG" ? 0.2 : participation === "NORMAL" ? 0.1 : 0), 0, 1);
  const flowLiquiditySweep = clamp(
    (shockNorm * 0.45) +
      ((marketSpeed === "VIOLENT" || marketSpeed === "FAST") ? 0.28 : marketSpeed === "NORMAL" ? 0.14 : 0.04) +
      (orderbookImbalance !== "NEUTRAL" ? 0.12 : 0.05),
    0,
    1,
  );
  const holdBaseBars = scenario.horizon === "SCALP" ? 8 : scenario.horizon === "INTRADAY" ? 24 : 72;
  const holdStressFactor = marketStress === "HIGH" ? 0.6 : marketStress === "BUILDING" ? 0.8 : 1;
  const holdEntryFactor = entryTiming === "OPEN" ? 1 : entryTiming === "NARROW" ? 0.85 : 0.65;
  const expectedHoldingBars = Math.max(1, Math.round(holdBaseBars * holdStressFactor * holdEntryFactor));

  const penalties: Array<{ label: string; value: number; reason: string }> = [];
  if ((dataHealth?.latencyMs ?? 0) >= 900) {
    penalties.push({ label: "Latency High", value: 10, reason: "Data latency exceeded execution-safe threshold." });
  }
  if (slippage === "HIGH") {
    penalties.push({ label: "Slippage High", value: 12, reason: "Execution impact risk is high." });
  }
  if (marketStress === "HIGH") {
    penalties.push({ label: "Stress High", value: 10, reason: "Stress regime suppresses risk-adjusted edge." });
  }
  if (entryTiming === "CLOSED") {
    penalties.push({ label: "Entry Closed", value: 8, reason: "No executable timing window." });
  }
  if (orderbookStability === "SPOOF_RISK") {
    penalties.push({ label: "Spoof Risk", value: 6, reason: "Book stability degrades fill confidence." });
  }
  if (regime === "CHOP") {
    penalties.push({ label: "Chop Regime", value: 5, reason: "Directional edge decays in choppy regimes." });
  }
  if (crowdingRisk === "HIGH") {
    penalties.push({ label: "Crowding High", value: 8, reason: "Crowded positioning increases trap probability." });
  }
  const totalPenalty = Math.min(40, penalties.reduce((sum, penalty) => sum + penalty.value, 0));
  const coreConsensus = (0.33 * structureScore) + (0.14 * liquidityScore) + (0.34 * positioningScore) + (0.19 * executionScore);
  const fillFailure = clamp((0.45 - pFill) / 0.25, 0, 1);
  const slippageFailure = slippage === "LOW" ? 0 : slippage === "MED" ? 0.5 : 1;
  const depthFailure = liquidityDensity === "HIGH" ? 0 : liquidityDensity === "MID" ? 0.4 : 1;
  const spreadFailure = spreadRegime === "TIGHT" ? 0 : spreadRegime === "NORMAL" ? 0.4 : 1;
  const spoofFailure = orderbookStability === "STABLE" ? 0 : orderbookStability === "SHIFTING" ? 0.5 : 1;
  const microFailure = clamp((depthFailure + spreadFailure + spoofFailure) / 3, 0, 1);
  const stressFailure = marketStress === "HIGH" ? 1 : marketStress === "BUILDING" ? 0.5 : 0;
  const cascadeFailure = suddenMove === "HIGH" ? 1 : suddenMove === "MED" ? 0.6 : 0;
  const crowdingFailure = crowdingRisk === "HIGH" ? 1 : crowdingRisk === "MODERATE" ? 0.5 : 0;
  const hardExecutionBlock = pFill < 0.2 || (liquidityDensity === "LOW" && spreadRegime === "WIDE" && slippage === "HIGH");
  const degradedFeedsCount = Object.values(dataHealth?.feedSources ?? {}).filter((source) => !source.healthy).length;
  const scoreResult = computeScore({
    mode: scoringMode,
    profile: scenario.horizon,
    edgeNetR,
    pFill,
    capacity: capacityFactor,
    inputModifier,
    stress: stressNorm,
    shock: shockNorm,
    chop: chopNorm,
    crowding: crowdNorm,
    penaltyPoints: totalPenalty,
    momentum: flowMomentum,
    volumeSpike: flowVolumeSpike,
    liquiditySweep: flowLiquiditySweep,
    coreConsensus,
    fillFailure,
    slippageFailure,
    microFailure,
    stressFailure,
    cascadeFailure,
    crowdingFailure,
    structureScore,
    liquidityScore,
    positioningScore,
    executionScore,
    liquidityDensityState: liquidityDensity as "LOW" | "MID" | "HIGH" | "UNKNOWN",
    slippageLevelState: slippage as "LOW" | "MED" | "HIGH" | "UNKNOWN",
    depthQualityState: liquidityDensity === "HIGH" ? "GOOD" : liquidityDensity === "MID" ? "MID" : "POOR",
    spreadRegimeState: spreadRegime as "TIGHT" | "MID" | "NORMAL" | "WIDE" | "UNKNOWN",
    spoofRiskState: orderbookStability as "LOW" | "MID" | "HIGH" | "STABLE" | "SHIFTING" | "SPOOF_RISK" | "UNKNOWN",
    feedLatencyMs: dataHealth?.feedLatencyMs ?? dataHealth?.latencyMs ?? 0,
    latencyMs: dataHealth?.uiLatencyMs ?? 0,
    degradedFeedsCount,
    hardBlockExecution: hardExecutionBlock,
    entryClosed: entryTiming === "CLOSED",
  });
  const riskAdjustment = scoreResult.riskAdj;
  const riskAdjustedEdgeR = edgeNetR * riskAdjustment;
  const rawConsensus = scoreResult.rawScore;
  const adjustedConsensus = scoreResult.baseScore;
  const prePenaltyScore = Math.round(adjustedConsensus);
  const finalScore = scoreResult.finalScore;

  const hardGates = {
    tradeValidity: !consensusInputs.tradeValidity || provisionalTradeValidity !== "NO-TRADE",
    dataHealth: !Boolean(dataHealth?.staleFeed) && (dataHealth?.lastUpdateAgeSec ?? 0) <= 20,
    riskGate: !consensusInputs.riskGate || provisionalRiskGate === "PASS",
    entryWindow: !consensusInputs.entryTiming || entryTiming === "OPEN",
    fillProb: !consensusInputs.slippage || pFill >= 0.2,
    edge: edgeNetR >= modeConfig.gates.minEdgeR,
    capacity: capacityFactor >= 0.2,
  };
  const hardBlocked = !hardGates.tradeValidity || !hardGates.dataHealth || !hardGates.riskGate || !hardGates.fillProb || hardExecutionBlock;

  const decision =
    hardBlocked
      ? "NO_TRADE"
      : entryTiming === "CLOSED"
        ? "WATCHLIST"
        : finalScore < 60
          ? "NO_TRADE"
      : finalScore < 75
        ? "WATCHLIST"
        : finalScore < 85
          ? "TRADE_ELIGIBLE"
          : "HIGH_CONFIDENCE";

  const tradeValidity: AiPanelData["tradeValidity"] =
    decision === "NO_TRADE" ? "NO-TRADE" : decision === "WATCHLIST" ? "WEAK" : "VALID";
  const executionUrgency: AiPanelData["executionUrgency"] =
    decision === "HIGH_CONFIDENCE" && entryTiming === "OPEN" && slippage === "LOW"
      ? "ACT"
      : decision === "TRADE_ELIGIBLE"
        ? "PREPARE"
        : decision === "WATCHLIST"
          ? "WATCH"
          : "WAIT";

  const playbook =
    decision === "NO_TRADE"
      ? "Wait for reclaim"
      : bias === "LONG"
        ? "Buy pullbacks"
        : bias === "SHORT"
          ? "Sell rallies"
          : "Watchlist only";

  const normalizeContributions = (
    raw: Record<"structure" | "liquidity" | "positioning" | "execution", number>,
  ): Record<"structure" | "liquidity" | "positioning" | "execution", number> => {
    const keys = Object.keys(raw) as Array<"structure" | "liquidity" | "positioning" | "execution">;
    const total = keys.reduce((sum, key) => sum + raw[key], 0);
    if (total <= 0) return { structure: 0, liquidity: 0, positioning: 0, execution: 0 };
    let assigned = 0;
    const out = { structure: 0, liquidity: 0, positioning: 0, execution: 0 };
    keys.forEach((key, index) => {
      if (index === keys.length - 1) out[key] = 100 - assigned;
      else {
        out[key] = Math.round((raw[key] / total) * 100);
        assigned += out[key];
      }
    });
    return out;
  };

  const confidenceDrivers = normalizeContributions({
    structure: structureScore,
    liquidity: liquidityScore,
    positioning: positioningScore,
    execution: executionScore,
  });

  const rawTrendContinuation = Math.round((structureScore * 0.4) + (positioningScore * 0.35) + (executionScore * 0.25));
  const rawRangeContinuation = regime === "RANGE"
    ? Math.round((liquidityScore * 0.45) + (executionScore * 0.2) + ((100 - structureScore) * 0.35))
    : Math.round((100 - rawTrendContinuation) * 0.55);
  const trendContinuation = clamp(rawTrendContinuation, 0, 100);
  const rangeContinuation = clamp(rawRangeContinuation, 0, 100);
  const scenarioOutlook = {
    trendContinuation,
    rangeContinuation,
    breakoutMove: clamp(100 - trendContinuation - rangeContinuation, 0, 100),
  };

  const bandSpread = clamp(
    8 + Math.round((1 - pFill) * 12) + Math.round((1 - riskAdjustment) * 10) + Math.round(scoreResult.penaltyApplied / 8),
    8,
    24,
  );
  const confidenceBandLow = clamp(finalScore - bandSpread, 0, 100);
  const confidenceBandHigh = clamp(finalScore + bandSpread, 0, 100);

  const triggerConditions: string[] = [];
  if (entryTiming !== "OPEN") triggerConditions.push("Entry window OPEN");
  if (slippage === "HIGH") triggerConditions.push("Slippage <= MED");
  if (!["MID", "HIGH"].includes(liquidityDensity)) triggerConditions.push("Liquidity density >= MID");
  if (crowdingRisk === "HIGH") triggerConditions.push("Crowding <= MODERATE");
  if (provisionalRiskGate !== "PASS") triggerConditions.push("Risk gate PASS");
  if (pFill < modeConfig.gates.minFillProb) triggerConditions.push(`Fill probability >= ${modeConfig.gates.minFillProb.toFixed(2)}`);
  if (edgeNetR < modeConfig.gates.minEdgeR) triggerConditions.push(`Expected edge >= ${modeConfig.gates.minEdgeR.toFixed(2)}R`);
  if (capacityFactor < modeConfig.gates.minCapacity) triggerConditions.push(`Capacity >= ${modeConfig.gates.minCapacity.toFixed(2)}`);
  if (!hardGates.dataHealth) triggerConditions.push("Data health gate PASS");

  const invalidationTriggers =
    bias === "LONG"
      ? ["Break below VWAP", "Liquidity sweep below support", "Risk gate BLOCK"]
      : bias === "SHORT"
        ? ["Break above VWAP", "Liquidity sweep above resistance", "Risk gate BLOCK"]
        : ["N/A"];

  const penaltySummary = penalties.length
    ? penalties.map((penalty) => `${penalty.label} (-${penalty.value})`).join(", ")
    : "No active penalties";
  const formulaLine = `${scoreResult.formulaPreview} = ${finalScore.toFixed(2)}`;
  const hardGateSummary = `Gates trade=${hardGates.tradeValidity ? "PASS" : "BLOCK"} data=${hardGates.dataHealth ? "PASS" : "BLOCK"} risk=${hardGates.riskGate ? "PASS" : "BLOCK"} entry=${hardGates.entryWindow ? "PASS" : "BLOCK"} fill=${hardGates.fillProb ? "PASS" : "BLOCK"} edge=${hardGates.edge ? "PASS" : "BLOCK"} capacity=${hardGates.capacity ? "PASS" : "BLOCK"}`;
  const modeSummary = `${scoringMode}: ${scoringModeDescription(scoringMode)}`;
  const explainability = [
    modeSummary,
    `Layer scores => Structure ${structureScore}, Liquidity ${liquidityScore}, Positioning ${positioningScore}, Execution ${executionScore}.`,
    `Edge ${edgeNetR.toFixed(3)}R, Fill ${pFill.toFixed(2)}, Capacity ${capacityFactor.toFixed(2)}, RiskAdj ${riskAdjustment.toFixed(2)}, InputMod ${inputModifier.toFixed(2)}.`,
    `Active soft consensus controls ${softConsensusControlCount}.`,
    `Raw ${rawConsensus.toFixed(1)}, adjusted ${prePenaltyScore}, penaltyRate ${(scoreResult.penaltyRate * 100).toFixed(1)}%, final ${finalScore}.`,
    `Penalty set: ${penaltySummary}.`,
    scoreResult.gatingFlags.length ? `Gating flags: ${scoreResult.gatingFlags.join(", ")}.` : "Gating flags: none.",
    hardGateSummary,
    formulaLine,
  ];

  const moveBase = clamp(edgeNetR * 3.5 + finalScore / 140, 0.2, 4.2);
  const lowerMove = Number(moveBase.toFixed(2));
  const upperMove = Number((moveBase * 1.8).toFixed(2));
  const expectedMove = decision === "NO_TRADE" ? "N/A" : `${lowerMove.toFixed(1)}% - ${upperMove.toFixed(1)}% next session`;

  const sizeHint: AiPanelData["sizeHint"] =
    decision === "NO_TRADE" ? "0"
      : decision === "WATCHLIST" ? "0.25x"
        : decision === "TRADE_ELIGIBLE" ? "0.5x"
          : "1x";
  const sizeHintReason =
    decision === "NO_TRADE"
      ? "Rule-based gate blocks execution under current conditions."
      : decision === "WATCHLIST"
        ? "Signals are mixed; keep exploratory risk only."
        : decision === "TRADE_ELIGIBLE"
          ? "Conditions are acceptable but not elite."
          : "Structure, liquidity, positioning and execution are aligned.";

  const sessionContext: AiPanelData["sessionContext"] = (() => {
    const hour = new Date().getUTCHours();
    if (hour < 6) return { session: "Asia", liquidityExpectation: "Normal" };
    if (hour < 12) return { session: "EU", liquidityExpectation: "High" };
    if (hour < 21) return { session: "US", liquidityExpectation: "High" };
    return { session: "Weekend", liquidityExpectation: "Lower" };
  })();

  const priceLocation = `${regime === "RANGE" ? "Inside range" : "Directional move"} / ${vwapPosition === "ABOVE" ? "Above VWAP" : vwapPosition === "BELOW" ? "Below VWAP" : "Near VWAP"} / Liquidity ${liquidityDistance}`;
  const recentRegimePath =
    regime === "RANGE"
      ? ["RANGE", "FAKE BREAK", "RANGE"]
      : regime === "TREND"
        ? ["RANGE", "BREAKOUT", "TREND"]
        : ["TREND", "CHOP", "CHOP"];

  return {
    summary: [
      `Deterministic decision: ${decision} with final score ${finalScore}.`,
      `Scoring mode ${scoringMode}: ${scoringModeDescription(scoringMode)}.`,
      `Layer consensus ${baseLayerConsensus} with edge ${edgeNetR.toFixed(2)}R and fill ${pFill.toFixed(2)}.`,
      `Bias ${bias}, intent ${intent}, conflict ${conflictLevel}. ${hardGateSummary}.`,
      `${scenario.horizon} horizon in ${scenario.riskMode} mode; breakout-only ${scenario.breakoutOnly ? "ON" : "OFF"}.`,
    ],
    keyReasons: [
      `Structure ${structureScore} | Liquidity ${liquidityScore} | Positioning ${positioningScore} | Execution ${executionScore}.`,
      `Edge ${edgeNetR.toFixed(2)}R (pWin ${pWin.toFixed(2)}, avgWin ${avgWinR.toFixed(2)}R, cost ${costR.toFixed(2)}R).`,
      `Pstop ${pStop.toFixed(2)}, expRR ${expectedRR.toFixed(2)}, risk-adjusted edge ${riskAdjustedEdgeR.toFixed(2)}R, hold ~${expectedHoldingBars} bars.`,
      `Entry ${entryTiming}, slippage ${slippage}, fill ${pFill.toFixed(2)}, capacity ${capacityFactor.toFixed(2)}.`,
      `Penalty engine: ${penaltySummary}.`,
      `Model agreement ${modelAgreement.aligned}/${modelAgreement.totalModels} aligned ${modelAgreement.direction}.`,
      `Regime ${regime}, structure age ${structureAge}, time in range ${timeInRange} bars.`,
      `Relative strength ${htfAlignment}, participation ${participation}.`,
    ],
    riskChecks: [
      {
        label: "Risk Gate",
        status: hardGates.riskGate ? "PASS" : "BLOCK",
        detail: hardGates.riskGate ? "Conditions inside configured risk limits." : "Risk gate blocked by state scoring.",
      },
      {
        label: "Execution Certainty",
        status: hardGates.entryWindow && hardGates.fillProb ? "PASS" : "BLOCK",
        detail: `Entry ${entryTiming}, fill ${pFill.toFixed(2)}, capacity ${capacityFactor.toFixed(2)}, execution score ${executionScore}.`,
      },
      {
        label: "Stress Filter",
        status: riskAdjustment >= 0.55 && marketStress !== "HIGH" ? "PASS" : "BLOCK",
        detail: `Stress ${marketStress}, market speed ${marketSpeed}, sudden move ${suddenMove}, riskAdj ${riskAdjustment.toFixed(2)}.`,
      },
    ],
    tradeValidity,
    bias,
    signalConsensus: finalScore,
    conflictLevel,
    marketIntent: intent,
    playbook,
    confidenceBand: [confidenceBandLow, confidenceBandHigh],
    confidenceDrivers,
    scenarioOutlook,
    crowdingRisk,
    priceLocation,
    freshness: {
      updatedSecAgo: dataHealth?.lastUpdateAgeSec ?? 12,
      validForBars: decision === "NO_TRADE" ? 0 : scenario.horizon === "SCALP" ? 2 : scenario.horizon === "INTRADAY" ? 4 : 6,
    },
    triggerConditions: tradeValidity === "VALID" ? [] : triggerConditions,
    invalidationTriggers,
    executionUrgency,
    expectedMove,
    recentRegimePath,
    modelAgreement,
    explainability,
    sizeHint,
    sizeHintReason,
    sessionContext,
    timeContextSummary: `Structure ${structureAge} | Time in range ${timeInRange} bars`,
    riskEnvironmentSummary: `Stress ${marketStress} | Crowding ${crowdingRisk} | Regime ${regime}`,
    executionCertaintySummary: `Entry ${entryTiming} | Fill ${pFill.toFixed(2)} | Capacity ${capacityFactor.toFixed(2)}`,
    portfolioContextSummary: `Bias ${bias} | Intent ${intent} | Edge ${edgeNetR.toFixed(2)}R | Decision ${decision}`,
    scoringMode,
    scoreBreakdown: scoreResult.scoreBreakdown,
    gatingFlags: scoreResult.gatingFlags,
    scoring_mode: scoringMode,
    score_breakdown: scoreResult.scoreBreakdown,
    gating_flags: scoreResult.gatingFlags,
    consensusEngine: {
      dataComplete: true,
      edgeNetR: Number(edgeNetR.toFixed(4)),
      pWin: Number(pWin.toFixed(4)),
      pStop: Number(pStop.toFixed(4)),
      avgWinR: Number(avgWinR.toFixed(4)),
      expectedRR: Number(expectedRR.toFixed(4)),
      costR: Number(costR.toFixed(4)),
      pFill: Number(pFill.toFixed(4)),
      capacityFactor: Number(capacityFactor.toFixed(4)),
      riskAdjustment: Number(riskAdjustment.toFixed(4)),
      riskAdjustedEdgeR: Number(riskAdjustedEdgeR.toFixed(4)),
      expectedHoldingBars,
      inputModifier: Number(inputModifier.toFixed(4)),
      rawConsensus: Number(rawConsensus.toFixed(4)),
      adjustedConsensus: Number(adjustedConsensus.toFixed(4)),
      penalizedConsensus: Number(scoreResult.penalizedScore.toFixed(4)),
      penaltyTotal: Number(scoreResult.penaltyApplied.toFixed(4)),
      penaltyModel: scoreResult.penaltyModel,
      penaltyRate: Number(scoreResult.penaltyRate.toFixed(4)),
      penaltyApplied: Number(scoreResult.penaltyApplied.toFixed(4)),
      hardGates,
      formulaLine,
    },
  };
};

const sourceByFeed: Record<FeedKey, string> = {
  priceOhlcv: "Binance Spot WS",
  orderbook: "Binance L2 WS",
  trades: "Binance Trades WS",
  rawFeeds: "Unified Raw Bus",
  openInterest: "Perp OI Stream",
  fundingRate: "Funding Engine",
  netFlow: "On-chain NetFlow",
};

export const generateDataHealth = (feeds: FeedConfig): DataHealthState => {
  void feeds;
  return throwMockDisabled("generateDataHealth");
  const updatedAt = nowIso();
  const latencyMs = Math.round(rand(45, 260));
  const lastUpdateAgeSec = Math.round(rand(1, 12));
  const missingFields = feeds.rawFeeds ? Math.round(rand(0, 4)) : Math.round(rand(0, 2));
  const staleFeed = latencyMs > 210 || lastUpdateAgeSec > 8;

  const feedSources = (Object.keys(feeds) as FeedKey[]).reduce<DataHealthState["feedSources"]>((acc, feed) => {
    acc[feed] = {
      source: sourceByFeed[feed],
      healthy: feeds[feed] ? Math.random() > 0.08 : true,
    };
    return acc;
  }, {} as DataHealthState["feedSources"]);

  return {
    latencyMs,
    lastUpdateAgeSec,
    staleFeed,
    missingFields,
    updatedAt,
    feedSources,
  };
};

const getTimeframeMinutes = (timeframe: Timeframe): number => {
  if (timeframe === "1m") return 1;
  if (timeframe === "5m") return 5;
  if (timeframe === "15m") return 15;
  if (timeframe === "30m") return 30;
  if (timeframe === "1h") return 60;
  if (timeframe === "4h") return 240;
  return 1440;
};

export const generateOhlcvSeries = (timeframe: Timeframe, bars: number): OhlcvPoint[] => {
  void timeframe;
  void bars;
  return throwMockDisabled("generateOhlcvSeries");
  const tfMinutes = getTimeframeMinutes(timeframe);
  const points: OhlcvPoint[] = [];
  const now = Math.floor(Date.now() / 1000);
  const step = tfMinutes * 60;

  let lastClose = rand(90500, 93800);
  const drift = rand(-8, 8);

  for (let i = bars; i >= 0; i -= 1) {
    const time = now - i * step;
    const open = lastClose;
    const pulse = jitter(drift, tfMinutes > 60 ? 58 : 36);
    const close = Math.max(1000, open + pulse);
    const wickSize = Math.abs(jitter(0, tfMinutes > 60 ? 180 : 90));
    const high = Math.max(open, close) + wickSize;
    const low = Math.min(open, close) - wickSize;
    const volume = Math.round(Math.abs(jitter(2400, 2400)) + tfMinutes * 18);

    points.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });

    lastClose = close;
  }

  return points;
};

export const calculateEma = (series: OhlcvPoint[], period: number): Array<{ time: number; value: number }> => {
  if (!series.length) return [];
  const k = 2 / (period + 1);
  let ema = series[0].close;

  return series.map((point) => {
    ema = point.close * k + ema * (1 - k);
    return { time: point.time, value: Number(ema.toFixed(2)) };
  });
};

export const calculateVwap = (series: OhlcvPoint[]): Array<{ time: number; value: number }> => {
  let cumulativePv = 0;
  let cumulativeVolume = 0;

  return series.map((point) => {
    const typical = (point.high + point.low + point.close) / 3;
    cumulativePv += typical * point.volume;
    cumulativeVolume += point.volume;

    return {
      time: point.time,
      value: Number((cumulativePv / cumulativeVolume).toFixed(2)),
    };
  });
};

export const deriveKeyLevels = (series: OhlcvPoint[]): KeyLevel[] => {
  if (!series.length) return [];
  const last = series[series.length - 1].close;
  return [
    { label: "Weekly Resistance", price: Number((last * 1.018).toFixed(2)) },
    { label: "Current Pivot", price: Number((last * 1.004).toFixed(2)) },
    { label: "VWAP Magnet", price: Number((last * 0.997).toFixed(2)) },
    { label: "Weekly Support", price: Number((last * 0.982).toFixed(2)) },
  ];
};

export const generateSnapshot = (
  timeframe: TimeframeConfig,
  feeds: FeedConfig,
  scenario: ScenarioConfig,
  indicators?: IndicatorsState,
  consensusInputs: ConsensusInputConfig = DEFAULT_CONSENSUS_INPUTS,
  scoringMode: ScoringMode = "BALANCED",
): DashboardSnapshot => {
  void timeframe;
  void feeds;
  void scenario;
  void indicators;
  void consensusInputs;
  void scoringMode;
  return throwMockDisabled("generateSnapshot");
  const ohlcv = generateOhlcvSeries(timeframe.primary, timeframe.lookbackBars);
  const tiles = generateTiles(scenario, feeds, indicators);
  return {
    tiles,
    aiPanel: generateAiPanel(tiles, scenario, feeds, consensusInputs, undefined, scoringMode),
    dataHealth: generateDataHealth(feeds),
    ohlcv,
    keyLevels: deriveKeyLevels(ohlcv),
  };
};

export { DEFAULT_TILES, ADVANCED_TILES, TILE_DEFINITIONS };
