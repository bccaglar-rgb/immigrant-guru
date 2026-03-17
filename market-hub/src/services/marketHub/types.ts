export type MarketExchangeId = "BINANCE" | "GATEIO";

export type AdapterHealthState = "healthy" | "degraded" | "down";

export interface AdapterHealthSnapshot {
  exchange: MarketExchangeId;
  score: number;
  state: AdapterHealthState;
  connected: boolean;
  latencyMs: number | null;
  lastMessageAt: number | null;
  lastMessageAgeMs: number;
  reconnects: number;
  resyncs: number;
  gapCount: number;
  reasons: string[];
}

export interface AdapterSymbolSnapshot {
  exchange: MarketExchangeId;
  symbol: string;
  price: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  topBid: number | null;
  topAsk: number | null;
  bidQty: number | null;
  askQty: number | null;
  spreadBps: number | null;
  depthUsd: number | null;
  imbalance: number | null;
  markPrice: number | null;
  fundingRate: number | null;
  nextFundingTime: number | null;
  lastTradePrice: number | null;
  lastTradeQty: number | null;
  lastTradeSide: "BUY" | "SELL" | null;
  sourceTs: number | null;
  updatedAt: number;
}

export interface AdapterCandlePoint {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AdapterTradePoint {
  ts: number; // unix ms
  price: number;
  amount: number;
  side: "BUY" | "SELL";
}

export interface NormalizedEventBase {
  type: string;
  exchange: MarketExchangeId;
  symbol: string;
  ts: number;
  recvTs: number;
}

export interface NormalizedTradeEvent extends NormalizedEventBase {
  type: "trade";
  tradeId?: string;
  price: number;
  qty: number;
  side: "BUY" | "SELL";
}

export interface NormalizedBookTickerEvent extends NormalizedEventBase {
  type: "book_ticker";
  bid: number;
  ask: number;
  bidQty?: number;
  askQty?: number;
}

export interface NormalizedBookSnapshotEvent extends NormalizedEventBase {
  type: "book_snapshot";
  seq: number;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
}

export interface NormalizedBookDeltaEvent extends NormalizedEventBase {
  type: "book_delta";
  startSeq: number;
  endSeq: number;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
}

export interface NormalizedTickerEvent extends NormalizedEventBase {
  type: "ticker";
  price: number;
  change24hPct: number;
  volume24hUsd: number;
}

export interface NormalizedMarkPriceEvent extends NormalizedEventBase {
  type: "mark_price";
  markPrice: number;
  fundingRate: number | null;
  nextFundingTime: number | null;
}

export interface NormalizedStatusEvent extends NormalizedEventBase {
  type: "status";
  level: "info" | "warn" | "error";
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface NormalizedKlineEvent extends NormalizedEventBase {
  type: "kline";
  interval: string;
  openTime: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean; // true if candle is final
}

export type NormalizedEvent =
  | NormalizedTradeEvent
  | NormalizedBookTickerEvent
  | NormalizedBookSnapshotEvent
  | NormalizedBookDeltaEvent
  | NormalizedTickerEvent
  | NormalizedMarkPriceEvent
  | NormalizedStatusEvent
  | NormalizedKlineEvent;

export interface LiveHubRow {
  exchangeUsed: MarketExchangeId;
  preferredExchange: MarketExchangeId;
  symbol: string;
  stale: boolean;
  dataAgeMs: number;
  row: AdapterSymbolSnapshot | null;
}
