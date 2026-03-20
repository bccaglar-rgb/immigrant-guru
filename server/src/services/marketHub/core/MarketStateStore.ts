/**
 * MarketStateStore — L1 RAM snapshot store per exchange/symbol.
 *
 * Centralized market state. All adapter snapshots flow here.
 * Hub reads from here instead of directly from adapters.
 *
 * L1 = in-memory (primary, fast)
 * L2 = Redis (optional, handled by HubEventBridge — not here)
 */

import type { MarketExchangeId, AdapterSymbolSnapshot } from "../types.ts";
import type { IMarketStateStore, MarketStateStats } from "../contracts/HubModels.ts";

export class MarketStateStore implements IMarketStateStore {
  // Key: "BINANCE:BTCUSDT" → snapshot
  private readonly store = new Map<string, AdapterSymbolSnapshot>();
  private lastUpdateAt = 0;

  private key(exchange: MarketExchangeId, symbol: string): string {
    return `${exchange}:${symbol}`;
  }

  getSnapshot(exchange: MarketExchangeId, symbol: string): AdapterSymbolSnapshot | null {
    return this.store.get(this.key(exchange, symbol)) ?? null;
  }

  setSnapshot(exchange: MarketExchangeId, symbol: string, snapshot: AdapterSymbolSnapshot): void {
    this.store.set(this.key(exchange, symbol), snapshot);
    this.lastUpdateAt = Date.now();
  }

  patchSnapshot(exchange: MarketExchangeId, symbol: string, patch: Partial<AdapterSymbolSnapshot>): void {
    const k = this.key(exchange, symbol);
    const existing = this.store.get(k);
    if (existing) {
      Object.assign(existing, patch, { updatedAt: Date.now() });
    } else {
      this.store.set(k, {
        exchange, symbol,
        price: null, change24hPct: null, volume24hUsd: null,
        topBid: null, topAsk: null, bidQty: null, askQty: null,
        spreadBps: null, depthUsd: null, imbalance: null,
        markPrice: null, fundingRate: null, nextFundingTime: null,
        lastTradePrice: null, lastTradeQty: null, lastTradeSide: null,
        sourceTs: null, updatedAt: Date.now(),
        ...patch,
      });
    }
    this.lastUpdateAt = Date.now();
  }

  getBestSnapshot(symbol: string): AdapterSymbolSnapshot | null {
    let best: AdapterSymbolSnapshot | null = null;
    let bestAge = Infinity;
    for (const [k, snap] of this.store) {
      if (!k.endsWith(`:${symbol}`)) continue;
      const age = Date.now() - snap.updatedAt;
      if (age < bestAge && snap.price !== null) {
        best = snap;
        bestAge = age;
      }
    }
    return best;
  }

  isStale(exchange: MarketExchangeId, symbol: string, maxAgeMs: number): boolean {
    const snap = this.store.get(this.key(exchange, symbol));
    if (!snap) return true;
    return Date.now() - snap.updatedAt > maxAgeMs;
  }

  getDataAge(exchange: MarketExchangeId, symbol: string): number {
    const snap = this.store.get(this.key(exchange, symbol));
    if (!snap) return Infinity;
    return Date.now() - snap.updatedAt;
  }

  getAllSymbols(): string[] {
    const symbols = new Set<string>();
    for (const k of this.store.keys()) {
      const symbol = k.split(":")[1];
      if (symbol) symbols.add(symbol);
    }
    return [...symbols];
  }

  getSymbolsByExchange(exchange: MarketExchangeId): string[] {
    const prefix = `${exchange}:`;
    const symbols: string[] = [];
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) {
        const symbol = k.slice(prefix.length);
        if (symbol) symbols.add(symbol);
      }
    }
    return symbols;
  }

  getStats(): MarketStateStats {
    const byExchange: Record<string, number> = {};
    const allSymbols = new Set<string>();
    let staleCount = 0;
    const now = Date.now();

    for (const [k, snap] of this.store) {
      const [exchange, symbol] = k.split(":");
      if (!exchange || !symbol) continue;
      allSymbols.add(symbol);
      byExchange[exchange] = (byExchange[exchange] ?? 0) + 1;
      if (now - snap.updatedAt > 16_000) staleCount += 1;
    }

    return {
      totalSymbols: allSymbols.size,
      symbolsByExchange: byExchange,
      staleCount,
      lastUpdateAt: this.lastUpdateAt,
    };
  }
}
