/**
 * Hub Lifecycle Events — FROZEN
 *
 * Internal events for Hub observability and module coordination.
 * NOT market data events (those are NormalizedEvent in types.ts).
 *
 * These events flow through IHubEventEmitter.
 * Observability module listens and logs/metrics.
 * HealthMonitor listens to update exchange health.
 */

import type { MarketExchangeId } from "../types.ts";
import type {
  ConnectionState,
  SubscriptionKey,
  DataSource,
  RateLimitUsage,
} from "./HubModels.ts";

// ─── Event Type Registry ──────────────────────────────────────────

export type HubEventType =
  // Hub lifecycle
  | "hub:started"
  | "hub:stopped"
  | "hub:adapter_registered"
  | "hub:adapter_removed"
  // Connection
  | "connection:state_changed"
  | "connection:reconnecting"
  | "connection:error"
  // Subscription
  | "subscription:first_subscribe"
  | "subscription:last_unsubscribe"
  | "subscription:stale"
  // Fallback
  | "fallback:triggered"
  | "fallback:recovered"
  // Rate limit
  | "rate_limit:warning"
  | "rate_limit:blocked"
  // Health
  | "health:degraded"
  | "health:recovered"
  | "health:exchange_down";

// ─── Event Definitions ────────────────────────────────────────────

export interface HubEventBase {
  type: HubEventType;
  ts: number;
  exchange?: MarketExchangeId;
}

// Hub lifecycle

export interface HubStartedEvent extends HubEventBase {
  type: "hub:started";
  adapterCount: number;
}

export interface HubStoppedEvent extends HubEventBase {
  type: "hub:stopped";
}

export interface AdapterRegisteredEvent extends HubEventBase {
  type: "hub:adapter_registered";
  exchange: MarketExchangeId;
}

export interface AdapterRemovedEvent extends HubEventBase {
  type: "hub:adapter_removed";
  exchange: MarketExchangeId;
}

// Connection

export interface ConnectionStateChangedEvent extends HubEventBase {
  type: "connection:state_changed";
  exchange: MarketExchangeId;
  previous: ConnectionState;
  current: ConnectionState;
}

export interface ConnectionReconnectingEvent extends HubEventBase {
  type: "connection:reconnecting";
  exchange: MarketExchangeId;
  attempt: number;
  backoffMs: number;
}

export interface ConnectionErrorEvent extends HubEventBase {
  type: "connection:error";
  exchange: MarketExchangeId;
  error: string;
}

// Subscription

export interface SubscriptionFirstEvent extends HubEventBase {
  type: "subscription:first_subscribe";
  exchange: MarketExchangeId;
  key: SubscriptionKey;
}

export interface SubscriptionLastEvent extends HubEventBase {
  type: "subscription:last_unsubscribe";
  exchange: MarketExchangeId;
  key: SubscriptionKey;
}

export interface SubscriptionStaleEvent extends HubEventBase {
  type: "subscription:stale";
  exchange: MarketExchangeId;
  symbol: string;
  ageMs: number;
}

// Fallback

export interface FallbackTriggeredEvent extends HubEventBase {
  type: "fallback:triggered";
  exchange: MarketExchangeId;
  symbol: string;
  from: DataSource;
  to: DataSource;
  reason: string;
}

export interface FallbackRecoveredEvent extends HubEventBase {
  type: "fallback:recovered";
  exchange: MarketExchangeId;
  symbol: string;
  source: DataSource;
}

// Rate limit

export interface RateLimitWarningEvent extends HubEventBase {
  type: "rate_limit:warning";
  exchange: MarketExchangeId;
  usage: RateLimitUsage;
}

export interface RateLimitBlockedEvent extends HubEventBase {
  type: "rate_limit:blocked";
  exchange: MarketExchangeId;
  usage: RateLimitUsage;
  blockedForMs: number;
}

// Health

export interface HealthDegradedEvent extends HubEventBase {
  type: "health:degraded";
  exchange: MarketExchangeId;
  score: number;
  reasons: string[];
}

export interface HealthRecoveredEvent extends HubEventBase {
  type: "health:recovered";
  exchange: MarketExchangeId;
  score: number;
}

export interface HealthExchangeDownEvent extends HubEventBase {
  type: "health:exchange_down";
  exchange: MarketExchangeId;
  reason: string;
  downSinceMs: number;
}

// ─── Union Type ───────────────────────────────────────────────────

export type HubEvent =
  | HubStartedEvent
  | HubStoppedEvent
  | AdapterRegisteredEvent
  | AdapterRemovedEvent
  | ConnectionStateChangedEvent
  | ConnectionReconnectingEvent
  | ConnectionErrorEvent
  | SubscriptionFirstEvent
  | SubscriptionLastEvent
  | SubscriptionStaleEvent
  | FallbackTriggeredEvent
  | FallbackRecoveredEvent
  | RateLimitWarningEvent
  | RateLimitBlockedEvent
  | HealthDegradedEvent
  | HealthRecoveredEvent
  | HealthExchangeDownEvent;

// ─── Hub Event Emitter Contract ───────────────────────────────────

export interface IHubEventEmitter {
  emit(event: HubEvent): void;
  on(type: HubEventType, cb: (event: HubEvent) => void): () => void;
  onAny(cb: (event: HubEvent) => void): () => void;
}
