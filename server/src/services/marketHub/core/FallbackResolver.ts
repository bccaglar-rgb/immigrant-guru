/**
 * FallbackResolver — WS → cache → REST → limited decision chain.
 *
 * Hub calls this to decide: where do I get data for this symbol?
 * Single source of truth for fallback logic — no more scattered if/else.
 */

import type { MarketExchangeId } from "../types.ts";
import type {
  IFallbackResolver,
  DataSource,
  FallbackDecision,
} from "../contracts/HubModels.ts";
import type { SubscriptionChannel } from "../contracts/ExchangeAdapter.ts";
import type { MarketStateStore } from "./MarketStateStore.ts";

const WS_FRESH_THRESHOLD_MS = 16_000;     // data < 16s → considered fresh from WS
const CACHE_FRESH_THRESHOLD_MS = 45_000;   // data < 45s → cache still usable

export class FallbackResolver implements IFallbackResolver {
  constructor(
    private readonly stateStore: MarketStateStore,
    private readonly exchangePriority: MarketExchangeId[] = ["BINANCE", "BYBIT", "GATEIO", "OKX"],
  ) {}

  resolve(
    symbol: string,
    _channel: SubscriptionChannel,
    preferredExchange?: MarketExchangeId,
  ): FallbackDecision {
    // 1. Check preferred exchange first
    if (preferredExchange) {
      const age = this.stateStore.getDataAge(preferredExchange, symbol);
      if (age < WS_FRESH_THRESHOLD_MS) {
        return { source: "ws", exchange: preferredExchange, reason: "ws_live", freshnessMs: age };
      }
      if (age < CACHE_FRESH_THRESHOLD_MS) {
        return { source: "cache", exchange: preferredExchange, reason: "cache_fresh", freshnessMs: age };
      }
    }

    // 2. Try other exchanges in priority order
    for (const exchange of this.exchangePriority) {
      if (exchange === preferredExchange) continue;
      const age = this.stateStore.getDataAge(exchange, symbol);
      if (age < WS_FRESH_THRESHOLD_MS) {
        return { source: "ws", exchange, reason: "ws_fallback", freshnessMs: age };
      }
    }

    // 3. Any cached data from any exchange
    for (const exchange of this.exchangePriority) {
      const age = this.stateStore.getDataAge(exchange, symbol);
      if (age < CACHE_FRESH_THRESHOLD_MS) {
        return { source: "cache", exchange, reason: "cache_fallback", freshnessMs: age };
      }
    }

    // 4. REST fallback needed
    const fallbackExchange = preferredExchange ?? this.exchangePriority[0] ?? "BINANCE";
    return { source: "rest", exchange: fallbackExchange, reason: "no_live_data", freshnessMs: Infinity };
  }
}
