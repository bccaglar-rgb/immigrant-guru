/**
 * ExchangeAdapter Contract — FROZEN
 *
 * This is THE contract every exchange adapter must implement.
 * Hub owns decisions (what to subscribe, when to fallback, which source).
 * Adapter owns execution (how to connect, how to parse, how to sign).
 *
 * Rules:
 *  1. Adapter DOES NOT decide source (WS vs REST vs cache) — Hub decides
 *  2. Adapter DOES NOT manage ref counting — SubscriptionManager does
 *  3. Adapter DOES normalize exchange-specific formats → Bitrium format
 *  4. Adapter DOES manage its own WS connection lifecycle (via BaseAdapter)
 *  5. Adapter DOES report health honestly
 *  6. Adapter DOES implement per-channel subscribe/unsubscribe
 *
 * Backward Compatibility:
 *  - subscribeSymbols() is kept for legacy Hub integration
 *  - Per-channel methods are the NEW way, Hub will migrate to them
 */

import type {
  MarketExchangeId,
  AdapterHealthSnapshot,
  AdapterSymbolSnapshot,
  AdapterCandlePoint,
  AdapterTradePoint,
  NormalizedEvent,
} from "../types.ts";
import type {
  ConnectionState,
  AdapterPolicy,
  OrderbookSnapshot,
} from "./HubModels.ts";

// ─── Main Adapter Interface ───────────────────────────────────────

export interface IExchangeAdapter {
  readonly exchange: MarketExchangeId;
  readonly policy: AdapterPolicy;

  // ── Lifecycle ──────────────────────────────────────────────────
  start(): void;
  stop(): void;

  // ── Per-Channel Subscriptions ─────────────────────────────────
  // Hub (via SubscriptionManager) calls these.
  // Adapter sends WS subscribe/unsubscribe frames.
  subscribeTicker(symbol: string): void;
  subscribeDepth(symbol: string, levels?: number): void;
  subscribeKline(symbol: string, interval: string): void;
  subscribeTrade(symbol: string): void;

  unsubscribeTicker(symbol: string): void;
  unsubscribeDepth(symbol: string): void;
  unsubscribeKline(symbol: string, interval: string): void;
  unsubscribeTrade(symbol: string): void;

  // ── Legacy Bulk Subscribe (bridge for current Hub) ────────────
  subscribeSymbols(symbols: string[]): void;

  // ── In-Memory Data Access ─────────────────────────────────────
  // Hub reads these for cache hits before REST fallback.
  getSnapshot(symbol: string): AdapterSymbolSnapshot | null;
  getCandles(symbol: string, interval: string, limit: number): AdapterCandlePoint[];
  getRecentTrades(symbol: string, limit: number): AdapterTradePoint[];
  getOrderbook(symbol: string): OrderbookSnapshot | null;

  // ── REST Fallback ─────────────────────────────────────────────
  // Hub calls these when WS data is stale/unavailable.
  // RateLimitGuard + RequestDeduplicator wrap these calls.
  fetchDepthSnapshot(symbol: string, levels?: number): Promise<OrderbookSnapshot>;
  fetchKlines(symbol: string, interval: string, limit?: number): Promise<AdapterCandlePoint[]>;
  fetchRecentTrades(symbol: string, limit?: number): Promise<AdapterTradePoint[]>;

  // ── Symbol Normalization ──────────────────────────────────────
  // "BTCUSDT" → exchange native format
  toExchangeSymbol(symbol: string): string;
  // exchange native format → "BTCUSDT"
  toBitriumSymbol(raw: string): string;

  // ── Events ────────────────────────────────────────────────────
  // Adapter emits NormalizedEvents, Hub listens.
  onEvent(cb: (event: NormalizedEvent) => void): () => void;

  // ── Health & Diagnostics ──────────────────────────────────────
  getHealth(): AdapterHealthSnapshot;
  getConnectionState(): ConnectionState;
}

// ─── Adapter Implementation Hooks ─────────────────────────────────
// BaseAdapter calls these abstract methods. Each adapter implements them.

export interface AdapterHooks {
  // WS message → call the right parser
  parseMessage(raw: Buffer | string): void;

  // Build WS subscribe/unsubscribe frames for this exchange
  buildSubscribeFrame(channel: SubscriptionChannel, symbol: string, params?: SubscribeParams): unknown;
  buildUnsubscribeFrame(channel: SubscriptionChannel, symbol: string, params?: SubscribeParams): unknown;

  // Exchange-specific REST endpoints
  getDepthSnapshotUrl(symbol: string, levels: number): string;
  getKlinesUrl(symbol: string, interval: string, limit: number): string;
  getRecentTradesUrl(symbol: string, limit: number): string;

  // Parse REST responses
  parseDepthResponse(data: unknown, symbol: string): OrderbookSnapshot;
  parseKlinesResponse(data: unknown, symbol: string): AdapterCandlePoint[];
  parseTradesResponse(data: unknown, symbol: string): AdapterTradePoint[];

  // WS URL selection
  getWsUrls(): string[];

  // Health score adjustments (exchange-specific penalties)
  adjustHealthScore(baseScore: number): number;
}

// ─── Supporting Types ─────────────────────────────────────────────

export type SubscriptionChannel = "ticker" | "depth" | "kline" | "trade";

export interface SubscribeParams {
  levels?: number;      // depth levels (5, 10, 20, 50)
  interval?: string;    // kline interval (1m, 5m, 15m, 1h, 4h, 1d)
  speed?: string;       // update speed (100ms, 250ms, 500ms)
}
