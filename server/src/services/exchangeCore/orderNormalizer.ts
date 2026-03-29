/**
 * OrderNormalizer — Converts internal order model to exchange-valid parameters.
 *
 * Responsibilities:
 * - Round qty to stepSize
 * - Round price to tickSize
 * - Compute qty from notional + current price
 * - Validate minQty, maxQty, minNotional
 * - Convert symbol format for each venue
 */
import type { CoreIntentRecord, CoreVenue } from "./types.ts";
import { SymbolRegistry, type SymbolInfo } from "./symbolRegistry.ts";
import { exchangeFetch, isExchangeAvailable } from "../binanceRateLimiter.ts";

export interface NormalizationResult {
  symbolVenue: string;
  qty: number;
  price: number | null;
  contractSize: number | null;
  warnings: string[];
}

export interface NormalizationError {
  code: string;
  reason: string;
}

const roundToStep = (value: number, step: number): number => {
  if (step <= 0) return value;
  return Math.floor(value / step) * step;
};

const roundToTick = (value: number, tick: number): number => {
  if (tick <= 0) return value;
  return Math.round(value / tick) * tick;
};

const toGateSymbol = (symbol: string): string => {
  const upper = symbol.toUpperCase().replace(/[-_/]/g, "");
  if (upper.endsWith("USDT")) return `${upper.slice(0, -4)}_USDT`;
  return upper;
};

const toOkxSymbol = (symbol: string): string => {
  const upper = symbol.toUpperCase().replace(/[-_/]/g, "");
  if (upper.endsWith("USDT")) return `${upper.slice(0, -4)}-USDT-SWAP`;
  if (upper.endsWith("USDC")) return `${upper.slice(0, -4)}-USDC-SWAP`;
  return upper;
};

const toVenueSymbol = (symbol: string, venue: CoreVenue): string => {
  if (venue === "GATEIO") return toGateSymbol(symbol);
  if (venue === "OKX") return toOkxSymbol(symbol);
  // Binance & Bybit: BTCUSDT format
  return symbol.toUpperCase().replace(/[-_/]/g, "");
};

export class OrderNormalizer {
  private readonly registry: SymbolRegistry;

  constructor(registry: SymbolRegistry) {
    this.registry = registry;
  }

  async normalize(intent: CoreIntentRecord): Promise<
    { ok: true; result: NormalizationResult } | { ok: false; error: NormalizationError }
  > {
    const warnings: string[] = [];
    const venue = intent.venue;

    // 1. Fetch symbol info
    const info = await this.registry.getSymbolInfo(venue, intent.symbolInternal);
    if (!info) {
      // If no info available, do minimal normalization (best-effort)
      return {
        ok: true,
        result: {
          symbolVenue: toVenueSymbol(intent.symbolInternal, venue),
          qty: intent.qty ?? 0,
          price: intent.price,
          contractSize: null,
          warnings: ["Symbol info not available — using raw values"],
        },
      };
    }

    // 2. Convert symbol to venue format
    const symbolVenue = toVenueSymbol(intent.symbolInternal, venue);

    // 3. Compute qty
    let qty = intent.qty ?? 0;

    if (qty <= 0 && intent.notionalUsdt != null && intent.notionalUsdt > 0) {
      // Need current price to compute qty from notional
      const price = await this.fetchCurrentPrice(venue, symbolVenue);
      if (!price || price <= 0) {
        return {
          ok: false,
          error: { code: "NORM_PRICE_UNAVAILABLE", reason: "Cannot compute qty — current price unavailable" },
        };
      }

      const effectiveLeverage = intent.leverage ?? 1;
      if ((venue === "GATEIO" || venue === "OKX") && info.contractSize && info.contractSize > 0) {
        // Gate.io / OKX SWAP: qty = (notional * leverage) / (price * contractSize)
        qty = Math.floor((intent.notionalUsdt * effectiveLeverage) / (price * info.contractSize));
      } else {
        // Binance / Bybit: qty = (notional * leverage) / price
        qty = (intent.notionalUsdt * effectiveLeverage) / price;
      }
    }

    // 4. Round qty to stepSize
    qty = roundToStep(qty, info.stepSize);

    // 5. Validate qty bounds
    if (qty < info.minQty) {
      return {
        ok: false,
        error: {
          code: "NORM_QTY_TOO_SMALL",
          reason: `Qty ${qty} below minimum ${info.minQty} for ${intent.symbolInternal} on ${venue}`,
        },
      };
    }
    if (qty > info.maxQty) {
      return {
        ok: false,
        error: {
          code: "NORM_QTY_TOO_LARGE",
          reason: `Qty ${qty} exceeds maximum ${info.maxQty} for ${intent.symbolInternal} on ${venue}`,
        },
      };
    }

    // 6. Round price to tickSize (for limit orders)
    let price: number | null = intent.price;
    if (price != null && price > 0) {
      price = roundToTick(price, info.tickSize);
      // Clamp to precision
      const factor = Math.pow(10, info.pricePrecision);
      price = Math.round(price * factor) / factor;
    }

    // 7. Min notional check
    if (intent.orderType !== "MARKET") {
      // For limit orders, check if price * qty >= minNotional
      if (price != null && price > 0) {
        const orderNotional = price * qty * (info.contractSize ?? 1);
        if (orderNotional < info.minNotional) {
          return {
            ok: false,
            error: {
              code: "NORM_MIN_NOTIONAL",
              reason: `Order notional ${orderNotional.toFixed(2)} USDT below minimum ${info.minNotional} for ${intent.symbolInternal}`,
            },
          };
        }
      }
    }

    // Clamp qty to precision
    const qtyFactor = Math.pow(10, info.qtyPrecision);
    qty = Math.floor(qty * qtyFactor) / qtyFactor;

    return {
      ok: true,
      result: {
        symbolVenue,
        qty,
        price,
        contractSize: info.contractSize,
        warnings,
      },
    };
  }

  private async fetchCurrentPrice(venue: CoreVenue, symbolVenue: string): Promise<number | null> {
    try {
      // Cache-first: try Redis ticker cache before REST (zero weight cost)
      try {
        const { redisControl } = await import("../../db/redis.ts");
        const cached = await redisControl.get(`mdc:ticker:${symbolVenue}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          const price = Number(parsed.lastPrice ?? parsed.price ?? 0);
          if (price > 0) return price;
        }
      } catch { /* cache miss — fall through to REST */ }

      const venueKey = venue.toLowerCase().replace(/[.\-_\s]/g, "");
      if (!isExchangeAvailable(venueKey)) return null;

      if (venue === "BINANCE") {
        const res = await exchangeFetch({
          url: `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbolVenue}`,
          exchange: "binance", priority: "normal", weight: 1,
          dedupKey: `price:${symbolVenue}`,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { price: string };
        return Number(data.price) || null;
      }
      if (venue === "GATEIO") {
        const res = await exchangeFetch({
          url: `https://fx-api.gateio.ws/api/v4/futures/usdt/contracts/${symbolVenue}`,
          exchange: "gateio", priority: "normal", weight: 1,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { mark_price: string; last_price: string };
        return Number(data.last_price || data.mark_price) || null;
      }
      if (venue === "BYBIT") {
        const res = await exchangeFetch({
          url: `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbolVenue}`,
          exchange: "bybit", priority: "normal", weight: 10,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { result: { list: Array<{ lastPrice: string }> } };
        return Number(data.result?.list?.[0]?.lastPrice) || null;
      }
      if (venue === "OKX") {
        const res = await exchangeFetch({
          url: `https://www.okx.com/api/v5/market/ticker?instId=${symbolVenue}`,
          exchange: "okx", priority: "normal", weight: 10,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { data: Array<{ last: string }> };
        return Number(data.data?.[0]?.last) || null;
      }
      return null;
    } catch {
      return null;
    }
  }
}
