/**
 * Alpha Signal Module Types
 *
 * 7 modules that enrich CoinUniverseData with advanced signals
 * using only existing data (klines, funding, orderbook).
 */

// ── Module 1: Funding Intelligence ─────────────────────────────
export interface FundingIntelligenceSignals {
  fundingExtremeScore: number;          // 0-100
  fundingCrowdingIndex: number;         // 0-100
  fundingMeanReversionSignal: number;   // -100 to +100
  fundingDirection: "BULLISH_CROWD" | "BEARISH_CROWD" | "NEUTRAL";
  isExtreme: boolean;
}

// ── Module 2: OI Shock Detection ───────────────────────────────
export interface OiShockSignals {
  oiShockScore: number;                 // 0-100
  oiPriceDivergence: number;            // -100 to +100
  leverageBuildupIndicator: number;     // 0-100
  shockType: "SPIKE" | "COLLAPSE" | "DIVERGENT" | "NORMAL";
}

// ── Module 3: Advanced Volatility ──────────────────────────────
export interface AdvancedVolatilitySignals {
  volatilityRegime: "MEAN_REVERTING" | "TRENDING" | "PANIC" | "COMPRESSED";
  compressionScore: number;             // 0-100
  expansionForecast: number;            // 0-100
  volatilityShockIndex: number;         // 0-100
  bollingerWidth: number;               // raw %
}

// ── Module 4: Delta Imbalance & CVD ────────────────────────────
export interface DeltaImbalanceSignals {
  cvdTrend: "RISING" | "FALLING" | "FLAT";
  deltaImbalanceScore: number;          // -100 to +100
  buySellPressureRatio: number;         // 0.1 to 10
  volumeWeightedDelta: number;          // -100 to +100
}

// ── Module 5: Multi-Timeframe Alignment ────────────────────────
export interface MultiTimeframeSignals {
  htfTrendBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  ltfPullbackQuality: number;           // 0-100
  multiTfAlignmentScore: number;        // 0-100
  structureCompression: number;         // 0-100
  htfTrendStrength: number;             // 0-100
}

// ── Module 6: Liquidation Cascade ──────────────────────────────
export interface LiquidationCascadeSignals {
  cascadeScore: number;                 // 0-100
  longSqueezeProb: number;              // 0-100
  shortSqueezeProb: number;             // 0-100
  dominantRisk: "LONG_SQUEEZE" | "SHORT_SQUEEZE" | "LOW_RISK";
  distanceToLiqZone: number;            // % distance
}

// ── Module 7: Trade Timing ─────────────────────────────────────
export interface TradeTimingSignals {
  momentumIgnitionScore: number;        // 0-100
  volumeIgnition: boolean;
  microPullbackQuality: number;         // 0-100
  triggerCandleScore: number;           // 0-100
  timingGrade: "A" | "B" | "C" | "D";
}

// ── Combined ───────────────────────────────────────────────────
export interface AlphaSignals {
  funding: FundingIntelligenceSignals | null;
  oiShock: OiShockSignals | null;
  volatility: AdvancedVolatilitySignals | null;
  delta: DeltaImbalanceSignals | null;
  multiTf: MultiTimeframeSignals | null;
  liquidation: LiquidationCascadeSignals | null;
  timing: TradeTimingSignals | null;
  alphaBonus: number;     // 0 to +15
  alphaPenalty: number;    // 0 to +10
  alphaGrade: "S" | "A" | "B" | "C" | "D";
}
