/**
 * Coin Universe Engine — Types
 *
 * Shared interfaces for the 4-stage pre-filter pipeline:
 *   1. Hard Filter → 2. Universe Score → 3. False Filter → 4. Top 10% Selection
 */

/* ------------------------------------------------------------------ */
/*  Market data (input from WS hub)                                    */
/* ------------------------------------------------------------------ */

export interface RawCoinData {
  symbol: string;
  baseAsset: string;
  price: number;
  change24hPct: number;
  volume24hUsd: number;
  fundingRate: number | null;
  spreadBps: number | null;
  depthUsd: number | null;
  imbalance: number | null;
}

/* ------------------------------------------------------------------ */
/*  OHLCV / Klines                                                     */
/* ------------------------------------------------------------------ */

export interface OhlcvBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/* ------------------------------------------------------------------ */
/*  S/R Level                                                          */
/* ------------------------------------------------------------------ */

export interface SRLevel {
  price: number;
  type: "support" | "resistance";
  strength: "STRONG" | "MID" | "WEAK";
  touchCount: number;
}

/* ------------------------------------------------------------------ */
/*  Market Regime                                                      */
/* ------------------------------------------------------------------ */

export type MarketRegime = "TREND" | "RANGE" | "BREAKOUT" | "UNKNOWN";

/* ------------------------------------------------------------------ */
/*  Enriched coin data (after klines computation)                      */
/* ------------------------------------------------------------------ */

export interface CoinUniverseData extends RawCoinData {
  // Klines-derived (null if klines not available)
  atrPct: number | null;
  rsi14: number | null;
  srDistPct: number | null;
  nearestSR: SRLevel | null;
  srLevels: SRLevel[];
  regime: MarketRegime;
  trendStrength: number;        // 0-100
  expansionProbability: number; // 0-1
  volumeSpike: boolean;
  oiChange: number | null;      // OI % change proxy
  aggressorFlow: "BUY" | "SELL" | "NEUTRAL";

  // Computed from klines
  bars: OhlcvBar[];

  // Alpha signals (enriched by alpha modules, null if disabled)
  alpha: import("./alpha/alphaTypes.ts").AlphaSignals | null;
}

/* ------------------------------------------------------------------ */
/*  Sub-scores (each scorer module output)                             */
/* ------------------------------------------------------------------ */

export interface LiquidityScore {
  total: number;        // 0-25
  volumeScore: number;
  depthScore: number;
  spreadScore: number;
}

export interface StructureScore {
  total: number;        // 0-25
  srProximity: number;
  regimeScore: number;
  trendScore: number;
}

export interface MomentumScore {
  total: number;        // 0-20
  priceChange: number;
  rsiScore: number;
  volumeSpikeScore: number;
}

export interface PositioningScore {
  total: number;        // 0-15
  fundingScore: number;
  oiScore: number;
  flowScore: number;
}

export interface ExecutionScore {
  total: number;        // 0-15
  spreadQuality: number;
  depthQuality: number;
  imbalanceScore: number;
}

/* ------------------------------------------------------------------ */
/*  False Filter penalties                                             */
/* ------------------------------------------------------------------ */

export interface FalsePenalty {
  total: number;              // 0-30
  fakeBreakout: number;       // 0-8
  signalConflict: number;     // 0-7
  trapProbability: number;    // 0-7
  cascadeRisk: number;        // 0-5
  newsRisk: number;           // 0-3
}

/* ------------------------------------------------------------------ */
/*  Universe Score (composite)                                         */
/* ------------------------------------------------------------------ */

export interface UniverseScore {
  raw: number;          // 0-100 (sum of 5 sub-scores)
  penalty: number;      // 0-30 (false filter penalty)
  final: number;        // raw - penalty + alphaBonus - alphaPenalty (clamped 0-100)

  liquidity: LiquidityScore;
  structure: StructureScore;
  momentum: MomentumScore;
  positioning: PositioningScore;
  execution: ExecutionScore;
  falsePenalty: FalsePenalty;

  // Alpha signal adjustments (0 if alpha disabled)
  alphaBonus: number;   // 0 to +15
  alphaPenalty: number;  // 0 to +10
}

/* ------------------------------------------------------------------ */
/*  Final output row (sent to frontend + quant engine)                 */
/* ------------------------------------------------------------------ */

export interface UniverseCoinRow {
  symbol: string;
  baseAsset: string;
  price: number;
  change24hPct: number;
  volume24hUsd: number;
  fundingRate: number | null;
  spreadBps: number | null;

  // Enriched data
  atrPct: number | null;
  rsi14: number | null;
  srDistPct: number | null;
  nearestSR: SRLevel | null;
  regime: MarketRegime;
  trendStrength: number;
  volumeSpike: boolean;
  oiChange: number | null;
  aggressorFlow: "BUY" | "SELL" | "NEUTRAL";

  // Scores
  universeScore: UniverseScore;
  compositeScore: number;       // alias for universeScore.final

  // Alpha signals (null if disabled)
  alpha: import("./alpha/alphaTypes.ts").AlphaSignals | null;

  // Data quality
  dataQuality: DataQuality;

  // Tier classification
  tier: "ALPHA" | "BETA" | "GAMMA";

  // Selection
  selected: boolean;            // passed top 10% filter (ALPHA)
  rejectedReason: string | null; // reason for hard filter rejection

  // Status
  status: "ACTIVE" | "COOLDOWN" | "NEW" | "REJECTED";
  cooldownRoundsLeft: number | null;
  scanner_selected: boolean;
}

/* ------------------------------------------------------------------ */
/*  Data Quality per coin                                              */
/* ------------------------------------------------------------------ */

export interface DataQuality {
  hasKlines: boolean;
  hasOi: boolean;
  hasFunding: boolean;
  hasOrderbook: boolean;
  score: number;  // 0-100 — how complete is the data
}

/* ------------------------------------------------------------------ */
/*  Engine Mode                                                        */
/* ------------------------------------------------------------------ */

export type EngineMode = "full" | "degraded";

/* ------------------------------------------------------------------ */
/*  Engine Health (included in API response)                           */
/* ------------------------------------------------------------------ */

export interface EngineHealth {
  engine: "v2";
  mode: EngineMode;
  klinesAvailable: boolean;
  klinesSource: "binance" | "bybit" | "cache" | "none";
  klinesSuccessCount: number;
  klinesFailCount: number;
  dataQuality: "full" | "degraded" | "minimal";
  binanceStatus: "ok" | "rate_limited" | "error" | "unknown";
}

/* ------------------------------------------------------------------ */
/*  Rejection Telemetry                                                */
/* ------------------------------------------------------------------ */

export interface RejectionTelemetry {
  hard_reject_volume: number;
  hard_reject_spread: number;
  hard_reject_stablecoin: number;
  hard_reject_missing_data: number;
  reject_score_below_threshold: number;
  reject_weak_trend: number;
  reject_range_low_expansion: number;
  reject_declining_oi: number;
  reject_below_top_10pct: number;
  selected_count: number;
  watchlist_count: number;
}

/* ------------------------------------------------------------------ */
/*  Engine snapshot (API response)                                     */
/* ------------------------------------------------------------------ */

export interface UniverseSnapshot {
  activeCoins: UniverseCoinRow[];
  cooldownCoins: UniverseCoinRow[];
  rejectedCoins: UniverseCoinRow[];
  round: number;
  refreshedAt: string;
  stats: {
    totalScanned: number;
    hardFiltered: number;
    scored: number;
    selected: number;
    cooldown: number;
  };
  health: EngineHealth;
  telemetry: RejectionTelemetry;
}

/* ------------------------------------------------------------------ */
/*  Cooldown entry                                                     */
/* ------------------------------------------------------------------ */

export interface CooldownEntry {
  sentAtRound: number;
  cooldownUntilRound: number;
}

/* ------------------------------------------------------------------ */
/*  Hub dependency interface                                           */
/* ------------------------------------------------------------------ */

export interface BinanceFuturesHubLike {
  getUniverseRows(): RawCoinData[];
}
