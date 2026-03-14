export type NormalizedExchangeId = "binance" | "gate" | "bybit" | "okx" | "mock";

export type MarketType = "spot" | "perp" | "futures";

export type NormalizedSymbol = string;

export interface NormalizedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NormalizedTicker {
  symbol: NormalizedSymbol;
  price: number;
  change24hPct: number;
  volume24h?: number;
}

export interface NormalizedOrderBookTop {
  symbol: NormalizedSymbol;
  bid: number;
  ask: number;
  spreadBps: number;
}

export interface NormalizedTrade {
  symbol: NormalizedSymbol;
  price: number;
  qty: number;
  side: "buy" | "sell";
  ts: number;
}

export interface NormalizedBalance {
  asset: string;
  available: number;
  total: number;
}

export interface NormalizedPosition {
  symbol: NormalizedSymbol;
  side: "long" | "short";
  size: number;
  entry: number;
  mark: number;
  pnl: number;
  leverage?: number;
  marginMode?: "isolated" | "cross";
}

export interface NormalizedOrderRequest {
  symbol: NormalizedSymbol;
  marketType: MarketType;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop";
  quantity: number;
  price?: number;
  reduceOnly?: boolean;
  postOnly?: boolean;
  timeInForce?: "GTC" | "IOC" | "FOK";
}

export interface NormalizedOrderResponse {
  orderId: string;
  status: "accepted" | "rejected" | "partial";
  exchangeOrderId?: string;
  message?: string;
}

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  subaccount?: string;
}

export interface OnboardingOptions {
  marketType?: MarketType | "both";
  environment?: "mainnet" | "testnet";
  defaultLeverage?: number;
  preferredMarginMode?: "isolated" | "cross";
  preferredPositionMode?: "one-way" | "hedge";
}

export interface StructuredIssue {
  code:
    | "AUTH_FAILED"
    | "RATE_LIMIT"
    | "NETWORK_TIMEOUT"
    | "EXCHANGE_DOWN"
    | "SYMBOL_NOT_FOUND"
    | "PERMISSION_DENIED"
    | "UNSUPPORTED_FEATURE"
    | "INVALID_INPUT"
    | "UNKNOWN";
  message: string;
  retriable: boolean;
  retryAfterMs?: number;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  warnings: string[];
  errors: StructuredIssue[];
  latencyMs?: number;
}

export interface MarketMeta {
  symbol: NormalizedSymbol;
  externalSymbol: string;
  marketType: MarketType;
  base: string;
  quote: string;
  minQty?: number;
  qtyPrecision?: number;
  pricePrecision?: number;
}

export interface DiscoveryResult {
  serverTime?: string;
  marketTypes: MarketType[];
  marketsCount: number;
  sampleSymbols: NormalizedSymbol[];
  preferredSymbols: NormalizedSymbol[];
  symbolsIndex: Record<string, MarketMeta>;
  rateLimitNotes: string[];
  warnings: string[];
  errors: StructuredIssue[];
}

export interface TerminologyMap {
  symbolFormat: string;
  marketTypeMap: Record<string, string>;
  orderTypeMap: Record<string, string>;
  sideMap: Record<string, string>;
  positionModeMap: Record<string, string>;
  marginModeMap: Record<string, string>;
}

export interface AutoSettingsResult {
  applied: Array<{ key: string; value: string | number | boolean }>;
  notApplied: Array<{ key: string; reason: string }>;
  manualSteps: string[];
  warnings: string[];
  errors: StructuredIssue[];
}

export interface ConnectionStatusReport {
  exchangeId: NormalizedExchangeId;
  exchangeDisplayName: string;
  overallStatus: "READY" | "PARTIAL" | "FAILED";
  validated: boolean;
  discovery: {
    marketTypes: MarketType[];
    marketsCount: number;
    sampleSymbols: NormalizedSymbol[];
    preferredSymbols: NormalizedSymbol[];
    rateLimitNotes: string[];
  };
  normalization: {
    baseQuoteScheme: string;
    terminology: TerminologyMap;
  };
  autoSettings: {
    applied: Array<{ key: string; value: string | number | boolean }>;
    notApplied: Array<{ key: string; reason: string }>;
    manualInstructions: string[];
  };
  warnings: string[];
  errors: StructuredIssue[];
  nextActions: string[];
  checkedAt: string;
}

export interface ExchangeAdapterContext {
  credentials: ExchangeCredentials;
  options: OnboardingOptions;
  userId: string;
}
