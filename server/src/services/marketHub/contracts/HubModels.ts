/**
 * Hub Module Contracts — FROZEN
 *
 * Interfaces for every module inside ExchangeHubEngine.
 * Each module is a separate file but lives under the same bounded system.
 *
 * Hub Module Map:
 *  ExchangeHubEngine
 *   ├── ConnectionManager    — WS lifecycle per exchange
 *   ├── SubscriptionManager  — ref counting, sub/unsub orchestration
 *   ├── MarketStateStore     — L1 RAM snapshot per exchange/symbol
 *   ├── CacheLayer           — L1 memory + L2 Redis
 *   ├── RateLimitGuard       — per-exchange REST weight tracking
 *   ├── RequestDeduplicator  — collapse concurrent identical REST calls
 *   ├── FallbackResolver     — WS → cache → REST → limited decision chain
 *   ├── FanoutManager        — throttled broadcast to N consumers
 *   └── HealthMonitor        — per-exchange health + circuit breaker
 */

import type {
  MarketExchangeId,
  AdapterHealthSnapshot,
  AdapterSymbolSnapshot,
  NormalizedEvent,
} from "../types.ts";
import type { SubscriptionChannel } from "./ExchangeAdapter.ts";

// ═══════════════════════════════════════════════════════════════════
// CONNECTION
// ═══════════════════════════════════════════════════════════════════

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface ConnectionState {
  status: ConnectionStatus;
  url: string | null;
  connectedAt: number | null;
  reconnectAttempts: number;
  lastError: string | null;
  latencyMs: number | null;
}

export interface IConnectionManager {
  connect(exchange: MarketExchangeId): void;
  disconnect(exchange: MarketExchangeId): void;
  reconnect(exchange: MarketExchangeId): void;
  getState(exchange: MarketExchangeId): ConnectionState;
  getAllStates(): Map<MarketExchangeId, ConnectionState>;
  isConnected(exchange: MarketExchangeId): boolean;
  onStateChange(
    cb: (exchange: MarketExchangeId, state: ConnectionState) => void,
  ): () => void;
}

// ═══════════════════════════════════════════════════════════════════
// ADAPTER POLICY
// ═══════════════════════════════════════════════════════════════════

export interface AdapterPolicy {
  exchange: MarketExchangeId;

  // WS config
  wsUrls: string[];
  heartbeatIntervalMs: number;
  watchdogStaleMs: number;

  // Reconnect config
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  reconnectJitterMs: number;

  // Rate limits (REST)
  restWeightPerMinute: number;
  wsSubscriptionsMax: number;

  // Capabilities — what this exchange supports
  hasAggregateStream: boolean;    // all symbols on one stream (Binance !ticker@arr)
  hasPerSymbolDepth: boolean;
  hasPerSymbolKline: boolean;
  hasPerSymbolTrade: boolean;
  hasBookTicker: boolean;

  // Concurrency limits
  maxDepthSymbols: number;        // concurrent depth WS streams
  maxKlineSymbols: number;

  // Snapshot config
  snapshotSanityIntervalMs: number;
  snapshotRefreshMinMs: number;
  snapshotSanityBatch: number;

  // Symbol format
  symbolSeparator: string;        // "" = BTCUSDT, "_" = BTC_USDT, "-" = BTC-USDT
  symbolSuffix: string;           // "" for spot/linear, "-SWAP" for OKX perp
}

// ═══════════════════════════════════════════════════════════════════
// ORDERBOOK
// ═══════════════════════════════════════════════════════════════════

export interface OrderbookLevel {
  price: number;
  qty: number;
}

export interface OrderbookSnapshot {
  exchange: MarketExchangeId;
  symbol: string;
  seq: number;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  ts: number;
}

// ═══════════════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGER
// ═══════════════════════════════════════════════════════════════════

export interface SubscriptionKey {
  exchange: MarketExchangeId;
  symbol: string;
  channel: SubscriptionChannel;
  interval?: string;              // kline interval
  levels?: number;                // depth levels
}

export interface SubscriptionState {
  key: SubscriptionKey;
  refCount: number;
  subscribedAt: number;
  lastDataAt: number | null;
  stale: boolean;
}

export interface SubscriptionChangeEvent {
  type: "subscribed" | "unsubscribed";
  key: SubscriptionKey;
  refCount: number;
  isFirst: boolean;               // first subscriber → adapter.subscribe()
  isLast: boolean;                // last removed → adapter.unsubscribe()
}

export interface ISubscriptionManager {
  subscribe(key: SubscriptionKey, consumerId: string): void;
  unsubscribe(key: SubscriptionKey, consumerId: string): void;
  unsubscribeAll(consumerId: string): void;

  getActiveSubscriptions(): SubscriptionState[];
  getSubscriptionsBySymbol(symbol: string): SubscriptionState[];
  getSubscriptionsByExchange(exchange: MarketExchangeId): SubscriptionState[];
  getRefCount(key: SubscriptionKey): number;
  isSubscribed(key: SubscriptionKey): boolean;

  onSubscriptionChange(
    cb: (event: SubscriptionChangeEvent) => void,
  ): () => void;
}

// ═══════════════════════════════════════════════════════════════════
// MARKET STATE STORE
// ═══════════════════════════════════════════════════════════════════

export interface MarketStateStats {
  totalSymbols: number;
  symbolsByExchange: Record<string, number>;
  staleCount: number;
  lastUpdateAt: number;
}

export interface IMarketStateStore {
  // L1: RAM — primary read/write
  getSnapshot(
    exchange: MarketExchangeId,
    symbol: string,
  ): AdapterSymbolSnapshot | null;
  setSnapshot(
    exchange: MarketExchangeId,
    symbol: string,
    snapshot: AdapterSymbolSnapshot,
  ): void;
  patchSnapshot(
    exchange: MarketExchangeId,
    symbol: string,
    patch: Partial<AdapterSymbolSnapshot>,
  ): void;

  // Best across exchanges (Hub routing decides which)
  getBestSnapshot(symbol: string): AdapterSymbolSnapshot | null;

  // Staleness
  isStale(exchange: MarketExchangeId, symbol: string, maxAgeMs: number): boolean;
  getDataAge(exchange: MarketExchangeId, symbol: string): number;

  // Bulk
  getAllSymbols(): string[];
  getSymbolsByExchange(exchange: MarketExchangeId): string[];

  getStats(): MarketStateStats;
}

// ═══════════════════════════════════════════════════════════════════
// CACHE LAYER
// ═══════════════════════════════════════════════════════════════════

export type CacheTier = "memory" | "redis";

export interface CacheStats {
  memoryEntries: number;
  memoryHitRate: number;
  redisEntries: number;
  redisHitRate: number;
}

export interface ICacheLayer {
  get<T>(tier: CacheTier, key: string): T | null;
  set<T>(tier: CacheTier, key: string, value: T, ttlMs: number): void;
  has(tier: CacheTier, key: string): boolean;
  invalidate(tier: CacheTier, key: string): void;
  invalidatePattern(tier: CacheTier, pattern: string): void;

  // Fetch-through: check L1 → L2 → call fetcher → store
  getOrFetch<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
  ): Promise<T>;

  getStats(): CacheStats;
}

// ═══════════════════════════════════════════════════════════════════
// RATE LIMIT GUARD
// ═══════════════════════════════════════════════════════════════════

export interface RateLimitUsage {
  exchange: MarketExchangeId;
  usedWeight: number;
  maxWeight: number;
  resetAtMs: number;
  isBlocked: boolean;
  blockedUntilMs: number | null;
}

export interface IRateLimitGuard {
  // Async — waits if near limit
  acquire(exchange: MarketExchangeId, weight?: number): Promise<boolean>;
  // Sync — returns false if would exceed
  tryAcquire(exchange: MarketExchangeId, weight?: number): boolean;
  // External signal (429/418 from exchange)
  reportLimitHit(exchange: MarketExchangeId, retryAfterMs?: number): void;
  getUsage(exchange: MarketExchangeId): RateLimitUsage;
  onLimitHit(
    cb: (exchange: MarketExchangeId, usage: RateLimitUsage) => void,
  ): () => void;
}

// ═══════════════════════════════════════════════════════════════════
// REQUEST DEDUPLICATOR
// ═══════════════════════════════════════════════════════════════════

export interface IRequestDeduplicator {
  // If key is already in-flight, returns same promise. No duplicate REST call.
  dedupe<T>(key: string, fetcher: () => Promise<T>): Promise<T>;
  getPendingCount(): number;
}

// ═══════════════════════════════════════════════════════════════════
// FALLBACK RESOLVER
// ═══════════════════════════════════════════════════════════════════

export type DataSource = "ws" | "cache" | "rest" | "limited";

export interface FallbackDecision {
  source: DataSource;
  exchange: MarketExchangeId;
  reason: string;
  freshnessMs: number;
}

export interface IFallbackResolver {
  // Hub calls this to decide: where do I get data for this symbol?
  // Chain: WS live → cache fresh → REST fallback → limited/empty
  resolve(
    symbol: string,
    channel: SubscriptionChannel,
    preferredExchange?: MarketExchangeId,
  ): FallbackDecision;
}

// ═══════════════════════════════════════════════════════════════════
// FANOUT MANAGER
// ═══════════════════════════════════════════════════════════════════

export interface FanoutStats {
  consumerCount: number;
  eventsPerSecond: number;
  droppedPerSecond: number;
  broadcastLatencyMs: number;
}

export interface IFanoutManager {
  // Upstream: adapter event → fanout to all consumers
  broadcast(event: NormalizedEvent): void;
  // Consumer registration
  addConsumer(
    consumerId: string,
    cb: (event: NormalizedEvent) => void,
  ): () => void;
  removeConsumer(consumerId: string): void;
  // Per-channel throttle (e.g. depth → 100ms, ticker → 200ms)
  setThrottle(channel: SubscriptionChannel, intervalMs: number): void;
  getConsumerCount(): number;
  getStats(): FanoutStats;
}

// ═══════════════════════════════════════════════════════════════════
// HEALTH MONITOR
// ═══════════════════════════════════════════════════════════════════

export interface ExchangeHealthReport {
  exchange: MarketExchangeId;
  overallScore: number;
  state: "healthy" | "degraded" | "down";
  connection: ConnectionState;
  activeSubscriptions: number;
  staleSymbolCount: number;
  rateLimitUsage: RateLimitUsage;
  circuitBreakerOpen: boolean;
  lastIncident: string | null;
  uptimeMs: number;
}

export interface IHealthMonitor {
  getExchangeHealth(exchange: MarketExchangeId): ExchangeHealthReport;
  getAllHealth(): Map<MarketExchangeId, ExchangeHealthReport>;
  onHealthChange(
    cb: (exchange: MarketExchangeId, report: ExchangeHealthReport) => void,
  ): () => void;
}
