/**
 * HealthMonitor — per-exchange health aggregation + circuit breaker.
 *
 * Aggregates adapter health, connection state, rate limits, stale symbols
 * into a single ExchangeHealthReport per exchange.
 */

import type { MarketExchangeId, AdapterHealthSnapshot } from "../types.ts";
import type {
  IHealthMonitor,
  ExchangeHealthReport,
  ConnectionState,
  RateLimitUsage,
} from "../contracts/HubModels.ts";
import type { IExchangeMarketAdapter } from "../adapter.ts";
import type { RateLimitGuard } from "./RateLimitGuard.ts";

export class HealthMonitor implements IHealthMonitor {
  private readonly adapters: Map<MarketExchangeId, IExchangeMarketAdapter>;
  private readonly rateLimitGuard: RateLimitGuard | null;
  private readonly listeners = new Set<(exchange: MarketExchangeId, report: ExchangeHealthReport) => void>();
  private readonly startedAt = new Map<MarketExchangeId, number>();

  constructor(
    adapters: Map<MarketExchangeId, IExchangeMarketAdapter>,
    rateLimitGuard?: RateLimitGuard,
  ) {
    this.adapters = adapters;
    this.rateLimitGuard = rateLimitGuard ?? null;
  }

  getExchangeHealth(exchange: MarketExchangeId): ExchangeHealthReport {
    const adapter = this.adapters.get(exchange);
    if (!adapter) {
      return this.emptyReport(exchange);
    }

    const health = adapter.getHealth();
    const now = Date.now();
    const startedAt = this.startedAt.get(exchange) ?? now;

    const connection: ConnectionState = {
      status: health.connected ? "connected" : "disconnected",
      url: null,
      connectedAt: health.connected ? (health.lastMessageAt ?? null) : null,
      reconnectAttempts: health.reconnects,
      lastError: health.reasons.find((r) => r.includes("error")) ?? null,
      latencyMs: health.latencyMs,
    };

    const rateLimitUsage: RateLimitUsage = this.rateLimitGuard
      ? this.rateLimitGuard.getUsage(exchange)
      : { exchange, usedWeight: 0, maxWeight: 0, resetAtMs: 0, isBlocked: false, blockedUntilMs: null };

    return {
      exchange,
      overallScore: health.score,
      state: health.state,
      connection,
      activeSubscriptions: 0, // Would come from SubscriptionManager
      staleSymbolCount: health.reasons.filter((r) => r.includes("stale")).length,
      rateLimitUsage,
      circuitBreakerOpen: health.score < 30,
      lastIncident: health.reasons.length > 0 ? health.reasons[health.reasons.length - 1]! : null,
      uptimeMs: now - startedAt,
    };
  }

  getAllHealth(): Map<MarketExchangeId, ExchangeHealthReport> {
    const result = new Map<MarketExchangeId, ExchangeHealthReport>();
    for (const exchange of this.adapters.keys()) {
      result.set(exchange, this.getExchangeHealth(exchange));
    }
    return result;
  }

  markStarted(exchange: MarketExchangeId): void {
    this.startedAt.set(exchange, Date.now());
  }

  onHealthChange(cb: (exchange: MarketExchangeId, report: ExchangeHealthReport) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emptyReport(exchange: MarketExchangeId): ExchangeHealthReport {
    return {
      exchange,
      overallScore: 0,
      state: "down",
      connection: { status: "disconnected", url: null, connectedAt: null, reconnectAttempts: 0, lastError: null, latencyMs: null },
      activeSubscriptions: 0,
      staleSymbolCount: 0,
      rateLimitUsage: { exchange, usedWeight: 0, maxWeight: 0, resetAtMs: 0, isBlocked: false, blockedUntilMs: null },
      circuitBreakerOpen: true,
      lastIncident: null,
      uptimeMs: 0,
    };
  }
}
