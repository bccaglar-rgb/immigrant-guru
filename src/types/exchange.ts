export type ExchangeName = "Binance" | "Bybit" | "OKX" | "Bitrium Labs" | (string & {});
export type AccountMode = "Spot" | "Futures" | "Both";
export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "ERROR" | "CONNECTING";
export type OrderSide = "BUY" | "SELL";
export type OrderType = "Limit" | "Market" | "Stop Limit";

export interface TickerItem {
  symbol: string;
  lastPrice: number;
  change24hPct: number;
  volume24h: number;
  quoteVolume24h?: number;
  high24h?: number;
  low24h?: number;
  markPrice?: number;
  indexPrice?: number;
  fundingRate8h?: number;
  fundingCountdownSec?: number;
  openInterestUsd?: number;
}

export interface OrderbookLevel {
  price: number;
  amount: number;
  total: number;
}

export interface TradeTick {
  id: string;
  price: number;
  amount: number;
  side: OrderSide;
  time: string;
}

export interface BalanceItem {
  asset: string;
  available: number;
  total: number;
}

export interface PositionItem {
  id: string;
  symbol: string;
  side: OrderSide;
  size: number;
  entry: number;
  mark: number;
  pnl: number;
  liquidation: number;
  leverage: number;
}

export interface OpenOrderItem {
  id: string;
  date: string;
  pair: string;
  type: OrderType;
  side: OrderSide;
  price: number;
  amount: number;
  total: number;
  filledPct: number;
}

export interface OrderHistoryItem {
  id: string;
  date: string;
  pair: string;
  type: string;
  side: string;
  price: number;
  amount: number;
  filled: number;
  status: string;
}

export interface TradeHistoryItem {
  id: string;
  date: string;
  pair: string;
  side: string;
  price: number;
  amount: number;
  fee: number;
  feeAsset: string;
  realizedPnl: number;
}

export interface TransactionHistoryItem {
  id: string;
  date: string;
  type: string;
  amount: number;
  asset: string;
  symbol?: string;
  info?: string;
}

export interface ExchangeConnectionInput {
  exchange: ExchangeName;
  accountMode: AccountMode;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  testnet: boolean;
}

export interface ExchangeTradeSignal {
  direction: "LONG" | "SHORT";
  horizon: "SCALP" | "INTRADAY" | "SWING";
  confidence: number;
  tradeValidity: "VALID" | "WEAK" | "NO-TRADE";
  entryWindow: "OPEN" | "NARROW" | "CLOSED";
  slippageRisk: "LOW" | "MED" | "HIGH";
  timeframe: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
  validBars: number;
  timestampUtc: string;
  validUntilUtc: string;
  setup: string;
  entryLow: number;
  entryHigh: number;
  stops: number[];
  targets: number[];
}
