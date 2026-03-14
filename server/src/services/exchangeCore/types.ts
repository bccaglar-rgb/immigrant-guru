export type CoreVenue = "BINANCE" | "GATEIO";
export type CoreMarketType = "FUTURES" | "SPOT";
export type CoreSource = "MANUAL" | "AI";
export type CorePriority = "INTERACTIVE" | "BATCH";
export type CoreIntentState =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "QUEUED"
  | "SENT"
  | "DONE"
  | "CANCELED"
  | "ERROR";

export type CoreOrderStatus = "NEW" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED" | "REJECTED" | "EXPIRED";

export interface CoreTpSlSpec {
  mode: "PERCENT" | "PRICE";
  value: number;
}

export interface OrderIntentInput {
  intentId?: string;
  clientOrderId: string;
  source: CoreSource;
  priority: CorePriority;
  userId: string;
  runId?: string;
  exchangeAccountId: string;
  venue: CoreVenue;
  marketType: CoreMarketType;
  symbolInternal: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "STOP" | "TAKE_PROFIT";
  timeInForce?: "GTC" | "IOC" | "FOK" | "POST_ONLY";
  qty?: number | null;
  notionalUsdt?: number | null;
  price?: number | null;
  reduceOnly?: boolean;
  leverage?: number | null;
  tp?: CoreTpSlSpec | null;
  sl?: CoreTpSlSpec | null;
}

export interface CoreIntentRecord {
  id: string;
  clientOrderId: string;
  source: CoreSource;
  priority: CorePriority;
  userId: string;
  runId: string;
  exchangeAccountId: string;
  venue: CoreVenue;
  marketType: CoreMarketType;
  symbolInternal: string;
  symbolVenue: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "STOP" | "TAKE_PROFIT";
  timeInForce: "GTC" | "IOC" | "FOK" | "POST_ONLY" | null;
  qty: number | null;
  notionalUsdt: number | null;
  price: number | null;
  reduceOnly: boolean;
  leverage: number | null;
  tp: CoreTpSlSpec | null;
  sl: CoreTpSlSpec | null;
  state: CoreIntentState;
  rejectCode: string;
  rejectReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoreOrderRecord {
  id: string;
  intentId: string;
  exchangeAccountId: string;
  venue: CoreVenue;
  marketType: CoreMarketType;
  symbolInternal: string;
  symbolVenue: string;
  exchangeOrderId: string;
  clientOrderId: string;
  status: CoreOrderStatus;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "STOP" | "TAKE_PROFIT";
  price: number | null;
  qty: number;
  filledQty: number;
  avgFillPrice: number | null;
  reduceOnly: boolean;
  leverage: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoreEvent {
  eventId: string;
  ts: string;
  type:
    | "order.accepted"
    | "risk.rejected"
    | "order.sent"
    | "order.update"
    | "fill.created"
    | "position.update"
    | "error";
  scope: {
    userId: string;
    exchangeAccountId: string;
    runId: string;
  };
  refs: {
    intentId: string;
    orderId: string;
  };
  data: Record<string, unknown>;
}

export interface ExchangeCoreMetrics {
  started: boolean;
  inFlight: number;
  queueInteractive: number;
  queueBatch: number;
  intentsTotal: number;
  eventsTotal: number;
  lastTickAt: string;
}

