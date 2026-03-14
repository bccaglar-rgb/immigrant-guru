import { issue } from "../errors.ts";
import type {
  AutoSettingsResult,
  DiscoveryResult,
  ExchangeAdapterContext,
  ExchangeCredentials,
  MarketType,
  NormalizedExchangeId,
  NormalizedOrderBookTop,
  NormalizedOrderRequest,
  NormalizedOrderResponse,
  NormalizedSymbol,
  ValidationResult,
} from "../types.ts";

export interface ExchangeAdapter {
  id: NormalizedExchangeId;
  displayName: string;
  validateCredentials(creds: ExchangeCredentials): Promise<ValidationResult>;
  discover(ctx: ExchangeAdapterContext): Promise<DiscoveryResult>;
  mapSymbol(externalSymbol: string, marketType: MarketType): NormalizedSymbol;
  unmapSymbol(symbol: NormalizedSymbol): string;
  fetchMarkets?(marketType?: MarketType): Promise<NormalizedSymbol[]>;
  fetchTicker?(symbol: NormalizedSymbol): Promise<{ price: number; change24hPct: number }>;
  fetchTopOfBook?(symbol: NormalizedSymbol): Promise<NormalizedOrderBookTop>;
  fetchBalances?(ctx: ExchangeAdapterContext): Promise<Array<{ asset: string; available: number; total: number }>>;
  fetchPositions?(ctx: ExchangeAdapterContext): Promise<Array<{ symbol: NormalizedSymbol; size: number }>>;
  placeOrder?(ctx: ExchangeAdapterContext, request: NormalizedOrderRequest): Promise<NormalizedOrderResponse>;
  cancelOrder?(ctx: ExchangeAdapterContext, orderId: string): Promise<{ ok: boolean }>;
  fetchOpenOrders?(ctx: ExchangeAdapterContext): Promise<Array<{ id: string; symbol: NormalizedSymbol }>>;
  applyAutoSettings(ctx: ExchangeAdapterContext): Promise<AutoSettingsResult>;
}

export const fetchJsonWithTimeout = async <T>(url: string, timeoutMs = 5000): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      if (res.status === 429) throw issue("RATE_LIMIT", `Rate limit on ${url}`, true, { status: 429 }, 800);
      if (res.status === 401 || res.status === 403) throw issue("AUTH_FAILED", `Auth failed on ${url}`, false, { status: res.status });
      throw issue("EXCHANGE_DOWN", `HTTP ${res.status} on ${url}`, true, { status: res.status });
    }
    return (await res.json()) as T;
  } catch (err) {
    if (typeof err === "object" && err && "code" in err) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw issue("NETWORK_TIMEOUT", `Timeout on ${url}`, true, { timeoutMs }, 1200);
    }
    throw issue("EXCHANGE_DOWN", `Network error on ${url}`, true);
  } finally {
    clearTimeout(timer);
  }
};

export const credentialsPresent = (creds: ExchangeCredentials): ValidationResult => {
  if (!creds.apiKey || !creds.apiSecret) {
    return {
      ok: false,
      warnings: [],
      errors: [issue("INVALID_INPUT", "API key/secret is required", false)],
    };
  }
  return { ok: true, warnings: [], errors: [] };
};
