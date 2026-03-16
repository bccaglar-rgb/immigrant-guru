export type LiquidityDensity = "LOW" | "MID" | "HIGH";
export type OrderbookImbalance = "BUY" | "SELL" | "NEUTRAL";
export type DepthQuality = "GOOD" | "MID" | "POOR";
export type SpreadRegime = "TIGHT" | "MID" | "WIDE";
export type SpoofRisk = "LOW" | "MID" | "HIGH";
export type OiChangeStrength = "LOW" | "MID" | "HIGH";
export type FundingBias = "BULLISH" | "BEARISH" | "NEUTRAL" | "EXTREME";
export type SpotVsDerivativesPressure = "SPOT_DOM" | "DERIV_DOM" | "BALANCED";
export type BinaryToggle = "ON" | "OFF";
export type MarketSpeed = "SLOW" | "NORMAL" | "FAST";
export type SuddenMoveRisk = "LOW" | "MID" | "HIGH";
export type SlippageLevel = "LOW" | "MED" | "HIGH";
export type CascadeRisk = "LOW" | "MID" | "HIGH";
export type WhaleActivity = "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL";
export type ExchangeFlow = "INFLOW" | "OUTFLOW" | "NEUTRAL";
export type RelativeStrength = "STRONG" | "WEAK" | "NEUTRAL";
export type AsymmetryScore = "REWARD_DOMINANT" | "RISK_DOMINANT" | "NEUTRAL";
export type MacroTrend = "UP" | "DOWN" | "FLAT" | "UNKNOWN";
export type LiquidationPoolBias = "UP" | "DOWN" | "MIXED" | "UNKNOWN";
export type SpotVolumeSupport = "STRONG" | "WEAK" | "UNKNOWN";
export type RsiState = "OVERSOLD" | "OVERBOUGHT" | "NEUTRAL" | "UNKNOWN";

export interface ExtremeConsensusInput {
  liquidityDensity: LiquidityDensity;
  orderbookImbalance: OrderbookImbalance;
  depthQuality: DepthQuality;
  spreadRegime: SpreadRegime;
  spoofRisk: SpoofRisk;
  oiChangeStrength: OiChangeStrength;
  fundingBias: FundingBias;
  spotVsDerivativesPressure: SpotVsDerivativesPressure;
  compression: BinaryToggle;
  volumeSpike: BinaryToggle;
  marketSpeed: MarketSpeed;
  suddenMoveRisk: SuddenMoveRisk;
  cascadeRisk: CascadeRisk;
  pFill: number;
  slippageLevel: SlippageLevel;
  whaleActivity?: WhaleActivity;
  exchangeFlow?: ExchangeFlow;
  relativeStrength?: RelativeStrength;
  asymmetryScore?: AsymmetryScore;
  fundingRate1hPct?: number | null;
  fundingRate8hPct?: number | null;
  oiChange5mPct?: number | null;
  oiChange1hPct?: number | null;
  liquidationPoolBias?: LiquidationPoolBias;
  spotVolumeSupport?: SpotVolumeSupport;
  dxyTrend?: MacroTrend;
  nasdaqTrend?: MacroTrend;
  atrRegime?: "LOW" | "MID" | "HIGH" | "UNKNOWN";
  rsiState?: RsiState;
}

export interface ExtremeConsensusOutput {
  mode: "EXTREME";
  extremeScore: number;
  rating: "LOW PROBABILITY" | "SPECULATIVE" | "HIGH RISK SETUP" | "LIQUIDATION / SQUEEZE LEVEL";
  directionBias: "LONG" | "SHORT" | "NEUTRAL";
  phase: "NO_TRADE" | "WAIT" | "SPECULATIVE" | "TRADE" | "SQUEEZE_EVENT";
}

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const EXTREME_PENALTY_MULTIPLIER = 0.20;

const normalizePercent = (value: number | null | undefined): number | null => {
  if (!Number.isFinite(value)) return null;
  const numeric = Number(value);
  if (Math.abs(numeric) <= 0.005) return numeric * 100;
  return numeric;
};

const normalizeOiPercent = (value: number | null | undefined): number | null => {
  if (!Number.isFinite(value)) return null;
  const numeric = Number(value);
  if (Math.abs(numeric) <= 1) return numeric * 100;
  return numeric;
};

const ratingFromScore = (score: number): ExtremeConsensusOutput["rating"] => {
  if (score <= 39) return "LOW PROBABILITY";
  if (score <= 59) return "SPECULATIVE";
  if (score <= 79) return "HIGH RISK SETUP";
  return "LIQUIDATION / SQUEEZE LEVEL";
};

const phaseFromScore = (score: number): ExtremeConsensusOutput["phase"] => {
  const rounded = Math.round(score);
  if (rounded <= 24) return "NO_TRADE";
  if (rounded <= 39) return "WAIT";
  if (rounded <= 54) return "SPECULATIVE";
  if (rounded <= 84) return "TRADE";
  return "SQUEEZE_EVENT";
};

const fundingCrowdInfo = (input: ExtremeConsensusInput) => {
  const rate1h = normalizePercent(input.fundingRate1hPct);
  const rate8h = normalizePercent(input.fundingRate8hPct);
  const maxAbs = Math.max(Math.abs(rate1h ?? 0), Math.abs(rate8h ?? 0));
  const extremeByRate = maxAbs >= 0.03;
  const squeezeByRate = maxAbs >= 0.06;
  const fromBiasExtreme = input.fundingBias === "EXTREME";
  const extreme = extremeByRate || fromBiasExtreme;
  const squeeze = squeezeByRate || (fromBiasExtreme && input.oiChangeStrength === "HIGH");

  const positive = (rate1h ?? 0) > 0 || (rate8h ?? 0) > 0 || input.fundingBias === "BULLISH";
  const negative = (rate1h ?? 0) < 0 || (rate8h ?? 0) < 0 || input.fundingBias === "BEARISH";

  return {
    extreme,
    squeeze,
    longCrowded: positive && !negative,
    shortCrowded: negative && !positive,
  };
};

const resolveDirectionBias = (
  input: ExtremeConsensusInput,
): { direction: "LONG" | "SHORT" | "NEUTRAL"; longVotes: number; shortVotes: number } => {
  const funding = fundingCrowdInfo(input);
  let longVotes = 0;
  let shortVotes = 0;

  if (funding.shortCrowded || (input.fundingBias === "EXTREME" && !funding.longCrowded)) longVotes += 2;
  if (funding.longCrowded || (input.fundingBias === "EXTREME" && !funding.shortCrowded)) shortVotes += 2;

  if (input.whaleActivity === "ACCUMULATION") longVotes += 1;
  if (input.whaleActivity === "DISTRIBUTION") shortVotes += 1;

  if (input.exchangeFlow === "OUTFLOW") longVotes += 1;
  if (input.exchangeFlow === "INFLOW") shortVotes += 1;

  if (input.orderbookImbalance === "BUY") longVotes += 1;
  if (input.orderbookImbalance === "SELL") shortVotes += 1;

  if (input.relativeStrength === "STRONG") longVotes += 1;
  if (input.relativeStrength === "WEAK") shortVotes += 1;

  if (input.liquidationPoolBias === "UP") longVotes += 1;
  if (input.liquidationPoolBias === "DOWN") shortVotes += 1;

  if (longVotes >= shortVotes + 1) return { direction: "LONG", longVotes, shortVotes };
  if (shortVotes >= longVotes + 1) return { direction: "SHORT", longVotes, shortVotes };
  return { direction: "NEUTRAL", longVotes, shortVotes };
};

const macroBias = (dxyTrend: MacroTrend, nasdaqTrend: MacroTrend): "LONG" | "SHORT" | "NEUTRAL" => {
  const riskOff = dxyTrend === "UP" || nasdaqTrend === "DOWN";
  const riskOn = dxyTrend === "DOWN" || nasdaqTrend === "UP";
  if (riskOff && !riskOn) return "SHORT";
  if (riskOn && !riskOff) return "LONG";
  return "NEUTRAL";
};

const executionCleanScore = (input: ExtremeConsensusInput): { score: number; badCount: number } => {
  let score = 0;
  let badCount = 0;
  const pFill = clamp(input.pFill, 0, 1);

  if (pFill >= 0.7) score += 14;
  else if (pFill >= 0.5) score += 10;
  else if (pFill >= 0.3) {
    score += 6;
    badCount += 1;
  } else {
    score += 2;
    badCount += 1;
  }

  if (input.slippageLevel === "LOW") score += 7;
  else if (input.slippageLevel === "MED") score += 4;
  else {
    badCount += 1;
  }

  if (input.depthQuality === "GOOD") score += 7;
  else if (input.depthQuality === "MID") score += 4;
  else {
    badCount += 1;
  }

  if (input.spreadRegime === "TIGHT") score += 6;
  else if (input.spreadRegime === "MID") score += 3;
  else {
    badCount += 1;
  }

  if (input.spoofRisk === "HIGH") badCount += 1;
  if (input.cascadeRisk === "HIGH") badCount += 1;

  return { score: clamp(score, 0, 40), badCount };
};

const liquidityScore = (input: ExtremeConsensusInput): number => {
  let score = 0;
  score += input.liquidityDensity === "HIGH" ? 12 : input.liquidityDensity === "MID" ? 8 : 3;
  score += input.orderbookImbalance === "NEUTRAL" ? 2 : 6;
  score += input.depthQuality === "GOOD" ? 6 : input.depthQuality === "MID" ? 4 : 1;
  score += input.spreadRegime === "TIGHT" ? 7 : input.spreadRegime === "MID" ? 4 : 1;
  return clamp(score, 0, 30);
};

const positioningScore = (input: ExtremeConsensusInput): number => {
  let score = 0;
  score += input.oiChangeStrength === "HIGH" ? 12 : input.oiChangeStrength === "MID" ? 7 : 2;
  score += input.fundingBias === "EXTREME" ? 8 : input.fundingBias === "NEUTRAL" ? 2 : 5;
  score += input.spotVsDerivativesPressure === "DERIV_DOM" ? 7 : input.spotVsDerivativesPressure === "SPOT_DOM" ? 5 : 3;
  return clamp(score, 0, 25);
};

const volatilityScore = (input: ExtremeConsensusInput): number => {
  let score = 0;
  if (input.compression === "ON") score += 6;
  if (input.volumeSpike === "ON") score += 8;
  score += input.marketSpeed === "FAST" ? 6 : input.marketSpeed === "NORMAL" ? 4 : 1;
  score += input.suddenMoveRisk === "HIGH" ? 5 : input.suddenMoveRisk === "MID" ? 3 : 1;

  const oi5m = normalizeOiPercent(input.oiChange5mPct);
  const oi1h = normalizeOiPercent(input.oiChange1hPct);
  const oiSpike = Math.abs(oi5m ?? 0) >= 5 || Math.abs(oi1h ?? 0) >= 5;
  if (oiSpike && input.compression === "ON") score += 3;
  if (input.atrRegime === "LOW" && input.compression === "ON" && oiSpike) score += 3;
  return clamp(score, 0, 25);
};

const executionScore = (input: ExtremeConsensusInput): number => {
  const pFill = clamp(input.pFill, 0, 1);
  let score = 0;
  if (pFill >= 0.7) score += 10;
  else if (pFill >= 0.5) score += 7;
  else if (pFill >= 0.3) score += 4;
  else score += 1;
  score += input.slippageLevel === "LOW" ? 5 : input.slippageLevel === "MED" ? 3 : 1;
  return clamp(score, 0, 15);
};

const smartMoneyBoost = (
  input: ExtremeConsensusInput,
  direction: "LONG" | "SHORT" | "NEUTRAL",
): number => {
  let score = 0;
  if (input.whaleActivity === "ACCUMULATION" || input.whaleActivity === "DISTRIBUTION") score += 6;
  if (input.exchangeFlow === "INFLOW" || input.exchangeFlow === "OUTFLOW") score += 4;

  const relativeAlign =
    (direction === "LONG" && input.relativeStrength === "STRONG") ||
    (direction === "SHORT" && input.relativeStrength === "WEAK");
  if (relativeAlign) score += 5;
  return clamp(score, 0, 15);
};

export const computeExtremeConsensus = (input: ExtremeConsensusInput): ExtremeConsensusOutput => {
  const pFill = clamp(input.pFill, 0, 1);
  const hardNoTrade =
    (input.depthQuality === "POOR" && input.spreadRegime === "WIDE") ||
    pFill < 0.05 ||
    (input.slippageLevel === "HIGH" && input.depthQuality === "POOR" && pFill < 0.15);

  const directionBias = resolveDirectionBias(input);
  const funding = fundingCrowdInfo(input);
  const macro = macroBias(input.dxyTrend ?? "UNKNOWN", input.nasdaqTrend ?? "UNKNOWN");
  const macroNotAgainst =
    directionBias.direction === "NEUTRAL" ||
    macro === "NEUTRAL" ||
    macro === directionBias.direction;

  const oi5m = normalizeOiPercent(input.oiChange5mPct);
  const oi1h = normalizeOiPercent(input.oiChange1hPct);
  const oiDirectionClear =
    input.oiChangeStrength === "MID" ||
    input.oiChangeStrength === "HIGH" ||
    Math.abs(oi5m ?? 0) >= 5 ||
    Math.abs(oi1h ?? 0) >= 5;

  const liquidityAligned = input.liquidityDensity === "MID" || input.liquidityDensity === "HIGH";
  const volatilityTrigger = input.compression === "ON" || input.volumeSpike === "ON";
  const positioningActive = oiDirectionClear;
  const baseAlignedCount = Number(liquidityAligned) + Number(volatilityTrigger) + Number(positioningActive);

  const liquidationTargetClear = input.liquidationPoolBias === "UP" || input.liquidationPoolBias === "DOWN" || input.orderbookImbalance !== "NEUTRAL";
  const spotSupport =
    input.spotVolumeSupport === "STRONG" ||
    input.spotVsDerivativesPressure === "SPOT_DOM" ||
    (input.spotVsDerivativesPressure === "BALANCED" && input.relativeStrength !== "NEUTRAL");

  const strictFilterCount =
    Number(funding.extreme) +
    Number(oiDirectionClear) +
    Number(liquidationTargetClear) +
    Number(spotSupport) +
    Number(macroNotAgainst);

  const execution = executionCleanScore(input);
  let score =
    liquidityScore(input) +
    positioningScore(input) +
    volatilityScore(input) +
    executionScore(input) +
    smartMoneyBoost(input, directionBias.direction);

  if (funding.squeeze) score += 4;
  if ((oi5m !== null && Math.abs(oi5m) >= 5) || (oi1h !== null && Math.abs(oi1h) >= 5)) score += 3;
  if (directionBias.direction !== "NEUTRAL" && input.liquidationPoolBias !== "UNKNOWN" && input.liquidationPoolBias !== "MIXED") score += 3;

  const manipulationAlarm =
    funding.extreme &&
    ((oi5m !== null && Math.abs(oi5m) >= 5) || (oi1h !== null && Math.abs(oi1h) >= 5) || input.oiChangeStrength === "HIGH") &&
    input.spotVsDerivativesPressure === "DERIV_DOM" &&
    liquidationTargetClear;

  let penalties = 0;
  if (input.spoofRisk === "HIGH") penalties += 4;
  if (input.asymmetryScore === "RISK_DOMINANT") penalties += 6;
  if (input.suddenMoveRisk === "HIGH") penalties += 5;
  if (input.cascadeRisk === "HIGH") penalties += 3;
  if (input.slippageLevel === "HIGH") penalties += 5;
  if (input.spotVsDerivativesPressure === "DERIV_DOM" && input.relativeStrength !== "STRONG") penalties += 4;
  if (!macroNotAgainst) penalties += 8;
  if (manipulationAlarm) penalties += 6;
  if (input.rsiState === "OVERBOUGHT" && directionBias.direction === "LONG") penalties += 3;
  if (input.rsiState === "OVERSOLD" && directionBias.direction === "SHORT") penalties += 3;

  const appliedPenalty = Math.min(penalties * EXTREME_PENALTY_MULTIPLIER, 10);
  score = clamp(score - appliedPenalty, 0, 100);

  if (directionBias.direction === "NEUTRAL") score = Math.min(score, 85);
  if (baseAlignedCount === 0) score = Math.min(score, 70);
  else if (baseAlignedCount < 2) score = Math.min(score, 85);
  if (execution.badCount >= 4) score = Math.min(score, 65);
  if (strictFilterCount < 5) score = Math.min(score, 85);
  if (hardNoTrade) score = Math.min(score, 48);

  const extremeScore = clamp(Number(score.toFixed(2)), 0, 100);
  return {
    mode: "EXTREME",
    extremeScore,
    rating: ratingFromScore(extremeScore),
    directionBias: directionBias.direction,
    phase: phaseFromScore(extremeScore),
  };
};
