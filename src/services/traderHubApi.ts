export type TraderAiModule = "CHATGPT" | "QWEN" | "QWEN2";
export type TraderExchange = "AUTO" | "BINANCE" | "GATEIO";
export type TraderRunStatus = "RUNNING" | "STOPPED" | "ERROR";

export interface TraderHubPlan {
  entryLow: number | null;
  entryHigh: number | null;
  sl1: number | null;
  sl2: number | null;
  tp1: number | null;
  tp2: number | null;
}

export interface TraderHubLastResult {
  ts: string;
  sourceExchange: "Binance" | "Gate.io" | "N/A";
  scorePct: number;
  decision: "TRADE" | "WATCH" | "NO_TRADE" | "N/A";
  bias: "LONG" | "SHORT" | "NEUTRAL";
  reason: string;
  price: number | null;
  dataStale: boolean;
  plan: TraderHubPlan;
  execution?: {
    state: "QUEUED" | "SENT" | "DONE" | "REJECTED" | "N/A";
    venue: "Binance" | "Gate.io" | "N/A";
    intentId: string;
    message: string;
  };
}

export interface TraderHubRow {
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
  stats: {
    runs: number;
    tradeCount: number;
    watchCount: number;
    noTradeCount: number;
    pnlPct: number;
  };
  lastResult: TraderHubLastResult | null;
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
}

const parseError = async (res: Response): Promise<string> => {
  try {
    const body = (await res.json()) as { error?: string };
    return String(body.error ?? `HTTP_${res.status}`);
  } catch {
    return `HTTP_${res.status}`;
  }
};

export const fetchTraderHubState = async (): Promise<TraderHubMetrics> => {
  const res = await fetch("/api/trader-hub/state");
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { ok: boolean; metrics: TraderHubMetrics };
  return body.metrics;
};

export const fetchTraders = async (): Promise<TraderHubRow[]> => {
  const res = await fetch("/api/trader-hub/traders");
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { ok: boolean; items: TraderHubRow[] };
  return Array.isArray(body.items) ? body.items : [];
};

export interface CreateTraderInput {
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
}

export const createTrader = async (input: CreateTraderInput): Promise<TraderHubRow> => {
  const res = await fetch("/api/trader-hub/traders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { ok: boolean; item: TraderHubRow };
  return body.item;
};

export const updateTraderStatus = async (id: string, status: TraderRunStatus): Promise<TraderHubRow> => {
  const res = await fetch(`/api/trader-hub/traders/${encodeURIComponent(id)}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { ok: boolean; item: TraderHubRow };
  return body.item;
};

export const deleteTrader = async (id: string): Promise<void> => {
  const res = await fetch(`/api/trader-hub/traders/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res));
};

export interface ConnectedExchangeAccount {
  exchangeId: string;
  exchangeDisplayName: string;
  status: "READY" | "PARTIAL" | "FAILED";
  enabled: boolean;
  accountName?: string;
  checkedAt?: string;
  id?: string;
}

export const fetchConnectedExchangeAccounts = async (): Promise<ConnectedExchangeAccount[]> => {
  const res = await fetch("/api/exchanges");
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { ok: boolean; exchanges?: ConnectedExchangeAccount[] };
  return Array.isArray(body.exchanges) ? body.exchanges : [];
};
