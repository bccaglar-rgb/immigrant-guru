export interface PlaceOrderRequest {
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET" | "STOP_LIMIT";
  quantity: number;
  price?: number;
  reduceOnly?: boolean;
  postOnly?: boolean;
}

export interface ExchangeAdapter {
  connectPublicStreams(symbols: string[]): Promise<void>;
  connectPrivateStreams(connectionId: string): Promise<void>;
  fetchSnapshot(symbol: string): Promise<unknown>;
  fetchCandles(symbol: string, timeframe: string): Promise<unknown>;
  placeOrder(request: PlaceOrderRequest): Promise<unknown>;
  cancelOrder(orderId: string, symbol: string): Promise<unknown>;
  setLeverage(symbol: string, leverage: number): Promise<unknown>;
  getAccountState(connectionId: string): Promise<unknown>;
}

