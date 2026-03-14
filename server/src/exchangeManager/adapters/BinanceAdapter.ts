import { EXCHANGE_CAPABILITIES } from "../capabilities.ts";
import { issue } from "../errors.ts";
import { normalizeSymbol } from "../normalization/symbols.ts";
import type { AutoSettingsResult, DiscoveryResult, ExchangeAdapterContext, ExchangeCredentials, ValidationResult } from "../types.ts";
import { credentialsPresent, fetchJsonWithTimeout, type ExchangeAdapter } from "./BaseAdapter.ts";

const BASE = "https://api.binance.com";

export class BinanceAdapter implements ExchangeAdapter {
  id = "binance" as const;
  displayName = "Binance";

  async validateCredentials(creds: ExchangeCredentials): Promise<ValidationResult> {
    const base = credentialsPresent(creds);
    if (!base.ok) return base;
    const started = Date.now();
    try {
      await fetchJsonWithTimeout<{ timezone: string }>(`${BASE}/api/v3/time`, 4000);
      return { ok: true, warnings: [], errors: [], latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: true, warnings: ["Public ping failed, continuing with discovery"], errors: [], latencyMs: Date.now() - started };
    }
  }

  async discover(_ctx: ExchangeAdapterContext): Promise<DiscoveryResult> {
    try {
      const info = await fetchJsonWithTimeout<{ serverTime?: number; symbols?: Array<{ symbol: string; status: string; quoteAsset: string; baseAsset: string; quotePrecision?: number; baseAssetPrecision?: number }> }>(
        `${BASE}/api/v3/exchangeInfo`,
        6000,
      );
      const tradable = (info.symbols ?? []).filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT");
      const sample = tradable.slice(0, 20).map((s) => normalizeSymbol(s.symbol, "spot"));
      const preferred = tradable.slice(0, 50).map((s) => normalizeSymbol(s.symbol, "spot"));
      const symbolsIndex = Object.fromEntries(
        tradable.map((s) => {
          const normalized = normalizeSymbol(s.symbol, "spot");
          return [normalized, {
            symbol: normalized,
            externalSymbol: s.symbol,
            marketType: "spot",
            base: s.baseAsset,
            quote: s.quoteAsset,
            minQty: undefined,
            qtyPrecision: s.baseAssetPrecision,
            pricePrecision: s.quotePrecision,
          }];
        }),
      );
      return {
        serverTime: info.serverTime ? new Date(info.serverTime).toISOString() : new Date().toISOString(),
        marketTypes: EXCHANGE_CAPABILITIES.binance.supportsMarketTypes,
        marketsCount: tradable.length,
        sampleSymbols: sample,
        preferredSymbols: preferred,
        symbolsIndex,
        rateLimitNotes: ["Use websocket for high-frequency market data", "REST bursts can hit weight limits"],
        warnings: [],
        errors: [],
      };
    } catch {
      return {
        serverTime: new Date().toISOString(),
        marketTypes: ["spot"],
        marketsCount: 0,
        sampleSymbols: [],
        preferredSymbols: [],
        symbolsIndex: {},
        rateLimitNotes: [],
        warnings: [],
        errors: [issue("EXCHANGE_DOWN", "Could not discover Binance markets", true)],
      };
    }
  }

  mapSymbol(externalSymbol: string) {
    return normalizeSymbol(externalSymbol, "spot");
  }

  unmapSymbol(symbol: string) {
    return symbol.replace("/USDT", "USDT").replace(":USDT", "");
  }

  async applyAutoSettings(ctx: ExchangeAdapterContext): Promise<AutoSettingsResult> {
    const leverage = ctx.options.defaultLeverage ?? 5;
    return {
      applied: [
        { key: "recvWindow", value: 5000 },
        { key: "defaultLeverage", value: leverage },
      ],
      notApplied: [],
      manualSteps: [
        "Binance > Futures > Preferences > Position Mode: One-way",
        "Binance > Futures > Symbol settings > Margin Mode: Isolated",
      ],
      warnings: [],
      errors: [],
    };
  }
}
