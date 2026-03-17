export type TraderAiModule = "CHATGPT" | "QWEN";

export type TraderExchange = "AUTO" | "BINANCE" | "GATEIO";

export type TraderRunStatus = "RUNNING" | "STOPPED" | "ERROR";

export type TraderDecision = "TRADE" | "WATCH" | "NO_TRADE" | "N/A";

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
