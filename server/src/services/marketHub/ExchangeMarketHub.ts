import type { IExchangeMarketAdapter } from "./adapter.ts";
import { BinanceFuturesMarketAdapter } from "./BinanceFuturesMarketAdapter.ts";
import { GateFuturesMarketAdapter } from "./GateFuturesMarketAdapter.ts";
import { BybitFuturesMarketAdapter } from "./BybitFuturesMarketAdapter.ts";
import { OkxFuturesMarketAdapter } from "./OkxFuturesMarketAdapter.ts";
import { HealthScoreRouter } from "./HealthScoreRouter.ts";
import type {
  AdapterCandlePoint,
  AdapterHealthSnapshot,
  AdapterTradePoint,
  LiveHubRow,
  MarketExchangeId,
  NormalizedEvent,
} from "./types.ts";

const normalizeSymbol = (raw: string): string => {
  const symbol = String(raw ?? "").toUpperCase().replace(/[-_/]/g, "").trim();
  if (!symbol) return "";
  return symbol.endsWith("USDT") ? symbol : `${symbol}USDT`;
};

const toExchangeId = (value: string | undefined | null): MarketExchangeId => {
  const raw = String(value ?? "").toUpperCase();
  if (raw.includes("BYBIT")) return "BYBIT";
  if (raw.includes("OKX")) return "OKX";
  if (raw.includes("GATE")) return "GATEIO";
  return "BINANCE";
};

const EXCHANGE_NAMES: Record<MarketExchangeId, string> = {
  BINANCE: "Binance",
  GATEIO: "Gate.io",
  BYBIT: "Bybit",
  OKX: "OKX",
};

const toExchangeName = (exchange: MarketExchangeId): string =>
  EXCHANGE_NAMES[exchange] ?? "Binance";

export interface ExchangeMarketHubStatus {
  started: boolean;
  adapters: Record<MarketExchangeId, AdapterHealthSnapshot>;
  symbolsTracked: number;
  defaultPrimary: MarketExchangeId;
}

export class ExchangeMarketHub {
  private readonly adapters = new Map<MarketExchangeId, IExchangeMarketAdapter>();
  private readonly router: HealthScoreRouter;
  private readonly listeners = new Set<(event: NormalizedEvent) => void>();
  private readonly ensuredAt = new Map<string, number>();
  private started = false;

  constructor() {
    const binance = new BinanceFuturesMarketAdapter();
    const gate = new GateFuturesMarketAdapter();
    const bybit = new BybitFuturesMarketAdapter();
    const okx = new OkxFuturesMarketAdapter();
    this.registerAdapter(binance);
    this.registerAdapter(gate);
    this.registerAdapter(bybit);
    this.registerAdapter(okx);
    this.router = new HealthScoreRouter(this.adapters, {
      order: ["BINANCE", "BYBIT", "GATEIO", "OKX"],
      degradeHoldMs: 7_000,
      switchCooldownMs: 26_000,
      switchInMinScore: 60,
      stayMinScore: 55,
      minAdvantageScore: 8,
      switchBackStableMs: 18_000,
    });
  }

  /** Register an exchange adapter as a market data provider. */
  registerAdapter(adapter: IExchangeMarketAdapter): void {
    this.adapters.set(adapter.exchange, adapter);
    adapter.onEvent((event) => {
      for (const listener of this.listeners) listener(event);
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    for (const adapter of this.adapters.values()) adapter.start();
  }

  stop(): void {
    this.started = false;
    for (const adapter of this.adapters.values()) adapter.stop();
  }

  onEvent(cb: (event: NormalizedEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  ensureSymbol(symbol: string): void {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) return;
    const now = Date.now();
    const last = this.ensuredAt.get(normalized) ?? 0;
    if (now - last < 8_000) return;
    this.ensuredAt.set(normalized, now);
    for (const adapter of this.adapters.values()) {
      adapter.subscribeSymbols([normalized]);
    }
  }

  getLiveRow(symbol: string, preferredExchange?: string): LiveHubRow {
    const normalized = normalizeSymbol(symbol);
    const preferred = toExchangeId(preferredExchange);
    this.ensureSymbol(normalized);
    const activeExchange = this.router.getActiveExchange(normalized, preferred);
    const activeAdapter = this.adapters.get(activeExchange);
    const activeRow = activeAdapter?.getSnapshot(normalized) ?? null;
    if (activeRow) {
      const ageMs = Math.max(0, Date.now() - activeRow.updatedAt);
      return {
        exchangeUsed: activeExchange,
        preferredExchange: preferred,
        symbol: normalized,
        stale: ageMs > 16_000,
        dataAgeMs: ageMs,
        row: activeRow,
      };
    }

    const candidates = [...this.adapters.entries()]
      .map(([exchange, adapter]) => ({ exchange, health: adapter.getHealth(), row: adapter.getSnapshot(normalized) }))
      .filter((item) => item.row !== null)
      .sort((a, b) => b.health.score - a.health.score);
    if (candidates.length > 0) {
      const candidate = candidates[0]!;
      const row = candidate.row!;
      const ageMs = Math.max(0, Date.now() - row.updatedAt);
      return {
        exchangeUsed: candidate.exchange,
        preferredExchange: preferred,
        symbol: normalized,
        stale: ageMs > 16_000,
        dataAgeMs: ageMs,
        row,
      };
    }

    return {
      exchangeUsed: activeExchange,
      preferredExchange: preferred,
      symbol: normalized,
      stale: true,
      dataAgeMs: 99_999_999,
      row: null,
    };
  }

  getExchangeRow(symbol: string, exchangeHint: string | undefined): LiveHubRow {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) {
      return {
        exchangeUsed: "BINANCE",
        preferredExchange: "BINANCE",
        symbol: "",
        stale: true,
        dataAgeMs: 99_999_999,
        row: null,
      };
    }
    this.ensureSymbol(normalized);
    const exchange = toExchangeId(exchangeHint);
    const adapter = this.adapters.get(exchange);
    const row = adapter?.getSnapshot(normalized) ?? null;
    const ageMs = row ? Math.max(0, Date.now() - row.updatedAt) : 99_999_999;
    return {
      exchangeUsed: exchange,
      preferredExchange: exchange,
      symbol: normalized,
      stale: !row || ageMs > 16_000,
      dataAgeMs: ageMs,
      row,
    };
  }

  getCandles(symbol: string, preferredExchange: string | undefined, interval: string, limit: number): AdapterCandlePoint[] {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) return [];
    this.ensureSymbol(normalized);
    const preferred = toExchangeId(preferredExchange);
    const activeExchange = this.router.getActiveExchange(normalized, preferred);
    const activeAdapter = this.adapters.get(activeExchange);
    const primary = activeAdapter?.getCandles?.(normalized, interval, limit) ?? [];
    if (primary.length) return primary;
    for (const [exchange, adapter] of this.adapters.entries()) {
      if (exchange === activeExchange) continue;
      const alt = adapter.getCandles?.(normalized, interval, limit) ?? [];
      if (alt.length) return alt;
    }
    return [];
  }

  getCandlesFromExchange(symbol: string, exchangeHint: string | undefined, interval: string, limit: number): AdapterCandlePoint[] {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) return [];
    this.ensureSymbol(normalized);
    const exchange = toExchangeId(exchangeHint);
    const adapter = this.adapters.get(exchange);
    return adapter?.getCandles?.(normalized, interval, limit) ?? [];
  }

  getRecentTrades(symbol: string, preferredExchange: string | undefined, limit: number): AdapterTradePoint[] {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) return [];
    this.ensureSymbol(normalized);
    const preferred = toExchangeId(preferredExchange);
    const activeExchange = this.router.getActiveExchange(normalized, preferred);
    const activeAdapter = this.adapters.get(activeExchange);
    const primary = activeAdapter?.getRecentTrades?.(normalized, limit) ?? [];
    if (primary.length) return primary;
    for (const [exchange, adapter] of this.adapters.entries()) {
      if (exchange === activeExchange) continue;
      const alt = adapter.getRecentTrades?.(normalized, limit) ?? [];
      if (alt.length) return alt;
    }
    return [];
  }

  getRecentTradesFromExchange(symbol: string, exchangeHint: string | undefined, limit: number): AdapterTradePoint[] {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) return [];
    this.ensureSymbol(normalized);
    const exchange = toExchangeId(exchangeHint);
    const adapter = this.adapters.get(exchange);
    return adapter?.getRecentTrades?.(normalized, limit) ?? [];
  }

  getHealthByExchange(): Record<MarketExchangeId, AdapterHealthSnapshot> {
    const out = {} as Record<MarketExchangeId, AdapterHealthSnapshot>;
    for (const [exchange, adapter] of this.adapters.entries()) {
      out[exchange] = adapter.getHealth();
    }
    return out;
  }

  getStatus(): ExchangeMarketHubStatus {
    const tracked = this.ensuredAt.size;
    return {
      started: this.started,
      adapters: this.getHealthByExchange(),
      symbolsTracked: tracked,
      defaultPrimary: "BINANCE",
    };
  }

  static exchangeIdToName(exchange: MarketExchangeId): string {
    return toExchangeName(exchange);
  }
}
