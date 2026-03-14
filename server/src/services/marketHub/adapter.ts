import type {
  AdapterCandlePoint,
  AdapterHealthSnapshot,
  AdapterSymbolSnapshot,
  AdapterTradePoint,
  MarketExchangeId,
  NormalizedEvent,
} from "./types.ts";

export interface IExchangeMarketAdapter {
  readonly exchange: MarketExchangeId;
  start(): void;
  stop(): void;
  subscribeSymbols(symbols: string[]): void;
  onEvent(cb: (event: NormalizedEvent) => void): () => void;
  getHealth(): AdapterHealthSnapshot;
  getSnapshot(symbol: string): AdapterSymbolSnapshot | null;
  getCandles?(symbol: string, interval: string, limit: number): AdapterCandlePoint[];
  getRecentTrades?(symbol: string, limit: number): AdapterTradePoint[];
}
