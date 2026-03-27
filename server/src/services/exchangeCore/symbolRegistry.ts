/**
 * SymbolRegistry — Exchange symbol metadata cache.
 *
 * Caches lot size (stepSize), tick size, min notional, precision per venue+symbol.
 * Primary store: Redis (5-min TTL). Fallback: DB table exchange_symbol_info.
 * Fetched from exchange REST API on cache miss.
 */
import { redis } from "../../db/redis.ts";
import { pool } from "../../db/pool.ts";
import type { CoreVenue } from "./types.ts";
import { exchangeFetch, isExchangeAvailable } from "../binanceRateLimiter.ts";

const CACHE_TTL_S = 300; // 5 minutes

export interface SymbolInfo {
  symbol: string;
  venue: CoreVenue;
  minQty: number;
  maxQty: number;
  stepSize: number;
  tickSize: number;
  minNotional: number;
  pricePrecision: number;
  qtyPrecision: number;
  contractSize: number | null;
}

const cacheKey = (venue: CoreVenue, symbol: string): string =>
  `syminfo:${venue}:${symbol}`;

const countDecimals = (num: number): number => {
  if (Number.isInteger(num)) return 0;
  const str = num.toExponential();
  const parts = str.split("e-");
  if (parts.length === 2) return Number(parts[1]) + (parts[0].split(".")[1]?.length ?? 0);
  const decPart = String(num).split(".")[1];
  return decPart?.length ?? 0;
};

export class SymbolRegistry {
  /** Get symbol info with Redis cache → DB fallback → exchange API fetch. */
  async getSymbolInfo(venue: CoreVenue, symbol: string): Promise<SymbolInfo | null> {
    // 1. Redis cache
    const key = cacheKey(venue, symbol);
    const cached = await redis.get(key);
    if (cached) {
      try { return JSON.parse(cached) as SymbolInfo; } catch { /* parse error, refetch */ }
    }

    // 2. DB fallback
    const dbInfo = await this.loadFromDb(venue, symbol);
    if (dbInfo) {
      await redis.set(key, JSON.stringify(dbInfo), "EX", CACHE_TTL_S);
      return dbInfo;
    }

    // 3. Fetch from exchange
    const fetched = await this.fetchFromExchange(venue, symbol);
    if (fetched) {
      await this.persistToDb(fetched);
      await redis.set(key, JSON.stringify(fetched), "EX", CACHE_TTL_S);
      return fetched;
    }

    return null;
  }

  /** Refresh all symbols for a venue from exchange API. */
  async refreshAll(venue: CoreVenue): Promise<number> {
    const symbols = await this.fetchAllFromExchange(venue);
    let count = 0;
    for (const info of symbols) {
      await this.persistToDb(info);
      await redis.set(cacheKey(venue, info.symbol), JSON.stringify(info), "EX", CACHE_TTL_S);
      count++;
    }
    return count;
  }

  // ── DB ────────────────────────────────────────────────────────

  private async loadFromDb(venue: CoreVenue, symbol: string): Promise<SymbolInfo | null> {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM exchange_symbol_info WHERE venue = $1 AND symbol = $2`,
        [venue, symbol],
      );
      if (!rows[0]) return null;
      const r = rows[0];
      return {
        symbol: String(r.symbol),
        venue: String(r.venue) as CoreVenue,
        minQty: Number(r.min_qty ?? 0),
        maxQty: Number(r.max_qty ?? 999999),
        stepSize: Number(r.step_size ?? 0.001),
        tickSize: Number(r.tick_size ?? 0.01),
        minNotional: Number(r.min_notional ?? 5),
        pricePrecision: Number(r.price_precision ?? 2),
        qtyPrecision: Number(r.qty_precision ?? 3),
        contractSize: r.contract_size != null ? Number(r.contract_size) : null,
      };
    } catch {
      return null;
    }
  }

  private async persistToDb(info: SymbolInfo): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO exchange_symbol_info
           (venue, symbol, min_qty, max_qty, step_size, tick_size, min_notional,
            price_precision, qty_precision, contract_size, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT (venue, symbol) DO UPDATE SET
           min_qty = EXCLUDED.min_qty, max_qty = EXCLUDED.max_qty,
           step_size = EXCLUDED.step_size, tick_size = EXCLUDED.tick_size,
           min_notional = EXCLUDED.min_notional,
           price_precision = EXCLUDED.price_precision, qty_precision = EXCLUDED.qty_precision,
           contract_size = EXCLUDED.contract_size, updated_at = NOW()`,
        [
          info.venue, info.symbol, info.minQty, info.maxQty,
          info.stepSize, info.tickSize, info.minNotional,
          info.pricePrecision, info.qtyPrecision, info.contractSize,
        ],
      );
    } catch (err: any) {
      console.error(`[SymbolRegistry] DB persist failed for ${info.venue}:${info.symbol}:`, err?.message);
    }
  }

  // ── Exchange API Fetch ────────────────────────────────────────

  private async fetchFromExchange(venue: CoreVenue, symbol: string): Promise<SymbolInfo | null> {
    const all = await this.fetchAllFromExchange(venue);
    return all.find((s) => s.symbol === symbol) ?? null;
  }

  private async fetchAllFromExchange(venue: CoreVenue): Promise<SymbolInfo[]> {
    try {
      if (venue === "BINANCE") return await this.fetchBinanceSymbols();
      if (venue === "GATEIO") return await this.fetchGateSymbols();
      if (venue === "BYBIT") return await this.fetchBybitSymbols();
      if (venue === "OKX") return await this.fetchOkxSymbols();
      return [];
    } catch (err: any) {
      console.error(`[SymbolRegistry] Exchange fetch failed for ${venue}:`, err?.message);
      return [];
    }
  }

  private async fetchBinanceSymbols(): Promise<SymbolInfo[]> {
    if (!isExchangeAvailable("binance")) return [];
    const res = await exchangeFetch({
      url: "https://fapi.binance.com/fapi/v1/exchangeInfo",
      exchange: "binance",
      priority: "normal",
      weight: 10,
      dedupKey: "symreg-exchangeInfo",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { symbols: Array<Record<string, any>> };
    const results: SymbolInfo[] = [];

    for (const sym of data.symbols ?? []) {
      if (sym.status !== "TRADING") continue;
      const filters = sym.filters as Array<Record<string, any>> ?? [];

      const lotFilter = filters.find((f) => f.filterType === "LOT_SIZE");
      const priceFilter = filters.find((f) => f.filterType === "PRICE_FILTER");
      const notionalFilter = filters.find((f) => f.filterType === "MIN_NOTIONAL");

      const stepSize = Number(lotFilter?.stepSize ?? "0.001");
      const tickSize = Number(priceFilter?.tickSize ?? "0.01");

      results.push({
        symbol: String(sym.symbol),
        venue: "BINANCE",
        minQty: Number(lotFilter?.minQty ?? "0.001"),
        maxQty: Number(lotFilter?.maxQty ?? "999999"),
        stepSize,
        tickSize,
        minNotional: Number(notionalFilter?.notional ?? notionalFilter?.minNotional ?? "5"),
        pricePrecision: Number(sym.pricePrecision ?? countDecimals(tickSize)),
        qtyPrecision: Number(sym.quantityPrecision ?? countDecimals(stepSize)),
        contractSize: null,
      });
    }
    return results;
  }

  private async fetchGateSymbols(): Promise<SymbolInfo[]> {
    if (!isExchangeAvailable("gateio")) return [];
    const res = await exchangeFetch({
      url: "https://fx-api.gateio.ws/api/v4/futures/usdt/contracts",
      exchange: "gateio", priority: "low", weight: 5, dedupKey: "symreg-gate-contracts",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<Record<string, any>>;
    const results: SymbolInfo[] = [];

    for (const contract of data) {
      if (!contract.in_delisting) {
        const quantoMultiplier = Number(contract.quanto_multiplier ?? "1");
        const orderSizeMin = Number(contract.order_size_min ?? 1);
        const orderSizeMax = Number(contract.order_size_max ?? 1000000);
        const markPricePrecision = Number(contract.mark_price_round ?? "0.01");

        // Gate.io symbol format: BTC_USDT → BTCUSDT for internal
        const rawName = String(contract.name ?? "");
        const internalSymbol = rawName.replace(/_/g, "");

        results.push({
          symbol: internalSymbol,
          venue: "GATEIO",
          minQty: orderSizeMin,
          maxQty: orderSizeMax,
          stepSize: 1, // Gate.io futures use integer contract sizes
          tickSize: markPricePrecision,
          minNotional: 1,
          pricePrecision: countDecimals(markPricePrecision),
          qtyPrecision: 0, // integer contracts
          contractSize: quantoMultiplier,
        });
      }
    }
    return results;
  }

  // ── Bybit V5 Linear ──────────────────────────────────────────

  private async fetchBybitSymbols(): Promise<SymbolInfo[]> {
    if (!isExchangeAvailable("bybit")) return [];
    const res = await exchangeFetch({
      url: "https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000",
      exchange: "bybit", priority: "low", weight: 10, dedupKey: "symreg-bybit-instruments",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { result: { list: Array<Record<string, any>> } };
    const results: SymbolInfo[] = [];

    for (const inst of data.result?.list ?? []) {
      if (inst.status !== "Trading") continue;
      const lotFilter = inst.lotSizeFilter ?? {};
      const priceFilter = inst.priceFilter ?? {};

      const stepSize = Number(lotFilter.qtyStep ?? "0.001");
      const tickSize = Number(priceFilter.tickSize ?? "0.01");

      results.push({
        symbol: String(inst.symbol),
        venue: "BYBIT",
        minQty: Number(lotFilter.minOrderQty ?? "0.001"),
        maxQty: Number(lotFilter.maxOrderQty ?? "999999"),
        stepSize,
        tickSize,
        minNotional: Number(lotFilter.minNotionalValue ?? "5"),
        pricePrecision: countDecimals(tickSize),
        qtyPrecision: countDecimals(stepSize),
        contractSize: null, // Bybit linear uses coin qty, not contracts
      });
    }
    return results;
  }

  // ── OKX V5 SWAP ──────────────────────────────────────────────

  private async fetchOkxSymbols(): Promise<SymbolInfo[]> {
    if (!isExchangeAvailable("okx")) return [];
    const res = await exchangeFetch({
      url: "https://www.okx.com/api/v5/public/instruments?instType=SWAP",
      exchange: "okx", priority: "low", weight: 10, dedupKey: "symreg-okx-instruments",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data: Array<Record<string, any>> };
    const results: SymbolInfo[] = [];

    for (const inst of data.data ?? []) {
      if (inst.state !== "live") continue;
      const instId = String(inst.instId ?? "");
      // Convert OKX instId (BTC-USDT-SWAP) → internal (BTCUSDT)
      const internalSymbol = instId.replace(/-SWAP$/, "").replace(/-/g, "");

      const lotSz = Number(inst.lotSz ?? "1");
      const tickSz = Number(inst.tickSz ?? "0.01");
      const minSz = Number(inst.minSz ?? "1");
      const ctVal = Number(inst.ctVal ?? "0.01"); // contract value in coin

      results.push({
        symbol: internalSymbol,
        venue: "OKX",
        minQty: minSz,
        maxQty: Number(inst.maxLmtSz ?? "999999"),
        stepSize: lotSz,
        tickSize: tickSz,
        minNotional: 1,
        pricePrecision: countDecimals(tickSz),
        qtyPrecision: countDecimals(lotSz),
        contractSize: ctVal,
      });
    }
    return results;
  }
}
