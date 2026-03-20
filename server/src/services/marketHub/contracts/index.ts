/**
 * contracts/ barrel export
 *
 * Import from here:
 *   import type { IExchangeAdapter, AdapterPolicy } from "./contracts/index.ts";
 */

// Adapter contract
export type {
  IExchangeAdapter,
  AdapterHooks,
  SubscriptionChannel,
  SubscribeParams,
} from "./ExchangeAdapter.ts";

// Hub module contracts
export type {
  // Connection
  ConnectionStatus,
  ConnectionState,
  IConnectionManager,
  // Adapter policy
  AdapterPolicy,
  // Orderbook
  OrderbookLevel,
  OrderbookSnapshot,
  // Subscription
  SubscriptionKey,
  SubscriptionState,
  SubscriptionChangeEvent,
  ISubscriptionManager,
  // Market state
  MarketStateStats,
  IMarketStateStore,
  // Cache
  CacheTier,
  CacheStats,
  ICacheLayer,
  // Rate limit
  RateLimitUsage,
  IRateLimitGuard,
  // Request dedup
  IRequestDeduplicator,
  // Fallback
  DataSource,
  FallbackDecision,
  IFallbackResolver,
  // Fanout
  FanoutStats,
  IFanoutManager,
  // Health
  ExchangeHealthReport,
  IHealthMonitor,
} from "./HubModels.ts";

// Hub events
export type {
  HubEventType,
  HubEventBase,
  HubStartedEvent,
  HubStoppedEvent,
  AdapterRegisteredEvent,
  AdapterRemovedEvent,
  ConnectionStateChangedEvent,
  ConnectionReconnectingEvent,
  ConnectionErrorEvent,
  SubscriptionFirstEvent,
  SubscriptionLastEvent,
  SubscriptionStaleEvent,
  FallbackTriggeredEvent,
  FallbackRecoveredEvent,
  RateLimitWarningEvent,
  RateLimitBlockedEvent,
  HealthDegradedEvent,
  HealthRecoveredEvent,
  HealthExchangeDownEvent,
  HubEvent,
  IHubEventEmitter,
} from "./HubEvents.ts";
