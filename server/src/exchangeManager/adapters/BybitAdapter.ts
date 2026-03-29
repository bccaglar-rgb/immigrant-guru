import { EXCHANGE_CAPABILITIES } from "../capabilities.ts";
import { issue } from "../errors.ts";
import { normalizeSymbol } from "../normalization/symbols.ts";
import type { AutoSettingsResult, DiscoveryResult, ExchangeAdapterContext, ExchangeCredentials, ValidationResult } from "../types.ts";
import { credentialsPresent, fetchJsonWithTimeout, type ExchangeAdapter } from "./BaseAdapter.ts";

const BASE = "https://api.bybit.com";

export class BybitAdapter implements ExchangeAdapter {
  id = "bybit" as const;
  displayName = "Bybit";

  async validateCredentials(creds: ExchangeCredentials): Promise<ValidationResult> {
    const base = credentialsPresent(creds);
    if (!base.ok) return base;
    try {
      await fetchJsonWithTimeout(`${BASE}/v5/market/time`, 6000);
      return { ok: true, warnings: [], errors: [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      return { ok: false, warnings: [], errors: [issue("NETWORK_TIMEOUT", `Bybit API unreachable: ${msg}`, true)] };
    }
  }

  async discover(_ctx: ExchangeAdapterContext): Promise<DiscoveryResult> {
    try {
      const spot = await fetchJsonWithTimeout<{ result?: { list?: Array<{ symbol: string; status: string }> } }>(
        `${BASE}/v5/market/instruments-info?category=spot&limit=1000`,
      );
      const list = (spot.result?.list ?? []).filter((s) => (s.status ?? "Trading").toLowerCase().includes("trad"));
      const symbols = list.map((s) => normalizeSymbol(s.symbol, "spot"));
      const symbolsIndex = Object.fromEntries(
        symbols.map((s) => [s, { symbol: s, externalSymbol: s.replace("/USDT", "USDT"), marketType: "spot", base: s.split("/")[0], quote: "USDT" }]),
      );
      return {
        serverTime: new Date().toISOString(),
        marketTypes: EXCHANGE_CAPABILITIES.bybit.supportsMarketTypes,
        marketsCount: symbols.length,
        sampleSymbols: symbols.slice(0, 20),
        preferredSymbols: symbols.slice(0, 50),
        symbolsIndex,
        rateLimitNotes: ["Category-based rate limits apply"],
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
        errors: [issue("EXCHANGE_DOWN", "Could not discover Bybit markets", true)],
      };
    }
  }

  mapSymbol(externalSymbol: string) {
    return normalizeSymbol(externalSymbol, "spot");
  }

  unmapSymbol(symbol: string) {
    return symbol.replace("/USDT", "USDT").replace(":USDT", "");
  }

  async applyAutoSettings(_ctx: ExchangeAdapterContext): Promise<AutoSettingsResult> {
    return {
      applied: [{ key: "defaultLeverage", value: 5 }],
      notApplied: [],
      manualSteps: [
        "Bybit > Derivatives > Preferences > Position Mode: One-way",
        "Bybit > Symbol > Margin Mode: Isolated",
      ],
      warnings: [],
      errors: [],
    };
  }
}
