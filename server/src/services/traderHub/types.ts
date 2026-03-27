export type TraderAiModule = "CHATGPT" | "QWEN";

export type TraderExchange = "AUTO" | "BINANCE" | "GATEIO";

export type TraderRunStatus = "RUNNING" | "STOPPED" | "ERROR";

export type TraderDecision = "TRADE" | "WATCH" | "NO_TRADE" | "N/A";

/* ── Multi-coin pool types ──────────────────────────────────────── */

export type CoinPoolSourceType = "STATIC_LIST" | "SNIPER" | "OI_INCREASE" | "OI_DECREASE" | "COIN_UNIVERSE";

export interface CoinPoolConfig {
  sourceTypes: CoinPoolSourceType[];
  maxCoins: number;
  sniperLimit: number;
  oiIncreaseLimit: number;
  oiDecreaseLimit: number;
  coinUniverseLimit: number;
  staticCoins: string[];
  /** User's minimum confidence threshold (0-100). Coins >= this are TRADE candidates. Default 75. */
  minConfidence: number;
}

export interface CoinScanResult {
  symbol: string;
  scorePct: number;
  decision: TraderDecision;
  bias: "LONG" | "SHORT" | "NEUTRAL";
  suitable: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  entryProbability: number;
  trendAlignment: boolean;
  rationale: string;
  /** Current price from feature cache */
  price?: number;
  /** Signal plan (entry/SL/TP) */
  plan?: TraderPlan;
  /** Virtual PnL % for this coin (from open virtual position) */
  pnlPct?: number;
  /** Rich AI analysis fields */
  signalLabel?: string;   // "STRONG BUY" | "BUY" | "SELL" | "STRONG SELL" | "HOLD"
  signals?: string[];     // Technical indicator signals
  shortComment?: string;  // Brief AI analysis
  opportunity?: string;   // "Breakout" | "Dip Buy" | "Scalping" | "Trend Following" etc.
  change24hPct?: number;  // 24h price change %
  rsi14?: number;         // RSI value
  fundingRate?: number;   // Funding rate
  volume24hUsd?: number;  // 24h volume USD
  atrPct?: number;        // ATR volatility %
}

/** Virtual position opened by a TRADE signal — tracked in Redis */
export interface VirtualPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  sl1: number;
  tp1: number;
  openedAt: string;
  /** Signal score % that triggered this position (at open time) */
  scorePct?: number;
  /** Rich analysis snapshot at open time */
  signalLabel?: string;
  signals?: string[];
  shortComment?: string;
  opportunity?: string;
  riskLevel?: string;
  confidence?: number;
  entryLow?: number;
  entryHigh?: number;
  tp2?: number;
}

export interface TraderPlan {
  entryLow: number | null;
  entryHigh: number | null;
  sl1: number | null;
  sl2: number | null;
  tp1: number | null;
  tp2: number | null;
}

export interface TraderLastResult {
  ts: string;
  sourceExchange: "Binance" | "Gate.io" | "N/A";
  scorePct: number;
  decision: TraderDecision;
  bias: "LONG" | "SHORT" | "NEUTRAL";
  reason: string;
  price: number | null;
  plan: TraderPlan;
  dataStale: boolean;
  execution?: {
    state: "QUEUED" | "SENT" | "DONE" | "REJECTED" | "N/A";
    venue: "Binance" | "Gate.io" | "N/A";
    intentId: string;
    message: string;
  };
  /** Multi-coin scan results (when trader uses coinPool) */
  coinScans?: CoinScanResult[];
  /** Best candidate symbol from multi-coin scan */
  bestCandidate?: string;
  /** Number of coins scanned in this cycle */
  scannedCoins?: number;
  /** Open virtual positions for PnL tracking */
  openPositions?: VirtualPosition[];
  /** Realized PnL % from closed virtual positions this cycle */
  realizedPnlPct?: number;
}

export interface TraderStats {
  runs: number;
  tradeCount: number;
  watchCount: number;
  noTradeCount: number;
  pnlPct: number;
}

export interface TraderRecord {
  id: string;
  userId: string;
  name: string;
  aiModule: TraderAiModule;
  exchange: TraderExchange;
  exchangeAccountId: string;
  exchangeAccountName: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: "1m" | "5m" | "15m" | "30m" | "1h";
  scanIntervalSec: number;
  status: TraderRunStatus;
  createdAt: string;
  updatedAt: string;
  nextRunAt: string;
  lastRunAt: string;
  lastError: string;
  failStreak: number;
  stats: TraderStats;
  lastResult: TraderLastResult | null;
  /** Multi-coin pool config — null means legacy single-symbol mode */
  coinPool: CoinPoolConfig | null;
}

export interface TraderHubMetrics {
  started: boolean;
  inFlightJobs: number;
  lastTickAt: string;
  totalTraders: number;
  runningTraders: number;
  stoppedTraders: number;
  errorTraders: number;
  maxConcurrentJobs: number;
  shardCount: number;
  /** BullMQ queue: jobs waiting to be processed */
  queueWaiting?: number;
  /** BullMQ queue: jobs scheduled for future execution */
  queueDelayed?: number;
  /** BullMQ queue: failed jobs */
  queueFailed?: number;
}
