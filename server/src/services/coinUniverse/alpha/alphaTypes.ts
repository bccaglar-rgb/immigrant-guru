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

// ── Module 8: Liquidity Intelligence ─────────────────────────
export interface LiquidityIntelligenceSignals {
  liquidityHeatmapScore: number;       // 0-100
  stopDensityIndex: number;            // 0-100
  liquiditySweepProbability: number;   // 0-100
  liquidityMagnetScore: number;        // 0-100
  liquidityAbsorptionStrength: number; // 0-100
  liquidityRefillRate: number;         // 0-100
}

// ── Module 9: Market Maker Detection ─────────────────────────
export interface MarketMakerDetectionSignals {
  spoofingProbability: number;         // 0-100
  icebergOrderScore: number;           // 0-100
  quoteStuffingScore: number;          // 0-100
  marketMakerControlScore: number;     // 0-100
  fakeLiquidityScore: number;          // 0-100
  spreadManipulationIndex: number;     // 0-100
}

// ── Module 10: Cross Market Intelligence ─────────────────────
export interface CrossMarketIntelligenceSignals {
  btcDominanceMomentum: number;        // -100 to +100
  ethBtcStrengthRatio: number;         // 0-100
  riskOnOffIndex: number;              // 0-100
}

// ── Module 11: Structure Advanced ────────────────────────────
export interface StructureAdvancedSignals {
  trendExhaustionProbability: number;  // 0-100
  breakoutQualityScore: number;        // 0-100
  orderflowMomentum: number;           // -100 to +100
  trappedRatio: number;                // -100 to +100 (pos = longs trapped, neg = shorts)
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
  liquidity: LiquidityIntelligenceSignals | null;
  marketMaker: MarketMakerDetectionSignals | null;
  crossMarket: CrossMarketIntelligenceSignals | null;
  structure: StructureAdvancedSignals | null;
  alphaBonus: number;     // 0 to +20
  alphaPenalty: number;    // 0 to +15
  alphaGrade: "S" | "A" | "B" | "C" | "D";
}
