import type { ExchangeAdapter, PlaceOrderRequest } from "./ExchangeAdapter";

export class BinanceAdapter implements ExchangeAdapter {
  async connectPublicStreams(_symbols: string[]): Promise<void> {}
  async connectPrivateStreams(_connectionId: string): Promise<void> {}
  async fetchSnapshot(_symbol: string): Promise<unknown> { return {}; }
  async fetchCandles(_symbol: string, _timeframe: string): Promise<unknown> { return []; }
  async placeOrder(_request: PlaceOrderRequest): Promise<unknown> { return { status: "mock-accepted" }; }
  async cancelOrder(_orderId: string, _symbol: string): Promise<unknown> { return { status: "mock-cancelled" }; }
  async setLeverage(_symbol: string, _leverage: number): Promise<unknown> { return { status: "ok" }; }
  async getAccountState(_connectionId: string): Promise<unknown> { return { balances: [], positions: [], orders: [] }; }
}

