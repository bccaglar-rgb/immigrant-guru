/**
 * SubscriptionManager — ref counting for market data subscriptions.
 *
 * First subscriber → adapter.subscribe()
 * Last unsubscriber → adapter.unsubscribe()
 * 1000 users watching BTCUSDT → 1 upstream subscription
 *
 * Key for 100K user scaling.
 */

import type { MarketExchangeId } from "../types.ts";
import type {
  ISubscriptionManager,
  SubscriptionKey,
  SubscriptionState,
  SubscriptionChangeEvent,
} from "../contracts/HubModels.ts";
import type { SubscriptionChannel } from "../contracts/ExchangeAdapter.ts";

function keyToString(key: SubscriptionKey): string {
  const parts = [key.exchange, key.symbol, key.channel];
  if (key.interval) parts.push(key.interval);
  if (key.levels !== undefined) parts.push(String(key.levels));
  return parts.join(":");
}

interface SubEntry {
  key: SubscriptionKey;
  consumers: Set<string>;
  subscribedAt: number;
  lastDataAt: number | null;
}

export class SubscriptionManager implements ISubscriptionManager {
  private readonly subs = new Map<string, SubEntry>();
  private readonly changeListeners = new Set<(event: SubscriptionChangeEvent) => void>();

  subscribe(key: SubscriptionKey, consumerId: string): void {
    const id = keyToString(key);
    let entry = this.subs.get(id);
    const isFirst = !entry;

    if (!entry) {
      entry = {
        key,
        consumers: new Set(),
        subscribedAt: Date.now(),
        lastDataAt: null,
      };
      this.subs.set(id, entry);
    }

    entry.consumers.add(consumerId);

    if (isFirst) {
      this.emitChange({
        type: "subscribed",
        key,
        refCount: entry.consumers.size,
        isFirst: true,
        isLast: false,
      });
    }
  }

  unsubscribe(key: SubscriptionKey, consumerId: string): void {
    const id = keyToString(key);
    const entry = this.subs.get(id);
    if (!entry) return;

    entry.consumers.delete(consumerId);
    const isLast = entry.consumers.size === 0;

    if (isLast) {
      this.subs.delete(id);
    }

    this.emitChange({
      type: "unsubscribed",
      key,
      refCount: entry.consumers.size,
      isFirst: false,
      isLast,
    });
  }

  unsubscribeAll(consumerId: string): void {
    for (const [id, entry] of this.subs) {
      if (!entry.consumers.has(consumerId)) continue;
      entry.consumers.delete(consumerId);
      const isLast = entry.consumers.size === 0;
      if (isLast) this.subs.delete(id);

      this.emitChange({
        type: "unsubscribed",
        key: entry.key,
        refCount: entry.consumers.size,
        isFirst: false,
        isLast,
      });
    }
  }

  getActiveSubscriptions(): SubscriptionState[] {
    return [...this.subs.values()].map((e) => ({
      key: e.key,
      refCount: e.consumers.size,
      subscribedAt: e.subscribedAt,
      lastDataAt: e.lastDataAt,
      stale: false,
    }));
  }

  getSubscriptionsBySymbol(symbol: string): SubscriptionState[] {
    return this.getActiveSubscriptions().filter((s) => s.key.symbol === symbol);
  }

  getSubscriptionsByExchange(exchange: MarketExchangeId): SubscriptionState[] {
    return this.getActiveSubscriptions().filter((s) => s.key.exchange === exchange);
  }

  getRefCount(key: SubscriptionKey): number {
    return this.subs.get(keyToString(key))?.consumers.size ?? 0;
  }

  isSubscribed(key: SubscriptionKey): boolean {
    return this.subs.has(keyToString(key));
  }

  /** Mark data received for a subscription (for staleness tracking) */
  markDataReceived(exchange: MarketExchangeId, symbol: string, channel: SubscriptionChannel): void {
    const now = Date.now();
    for (const entry of this.subs.values()) {
      if (entry.key.exchange === exchange && entry.key.symbol === symbol && entry.key.channel === channel) {
        entry.lastDataAt = now;
      }
    }
  }

  onSubscriptionChange(cb: (event: SubscriptionChangeEvent) => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  private emitChange(event: SubscriptionChangeEvent): void {
    for (const cb of this.changeListeners) cb(event);
  }
}
