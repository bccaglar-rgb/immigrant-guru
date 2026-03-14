import { EXCHANGE_CAPABILITIES } from "../capabilities.ts";
import { issue } from "../errors.ts";
import { normalizeSymbol } from "../normalization/symbols.ts";
import type { AutoSettingsResult, DiscoveryResult, ExchangeAdapterContext, ExchangeCredentials, ValidationResult } from "../types.ts";
import { credentialsPresent, fetchJsonWithTimeout, type ExchangeAdapter } from "./BaseAdapter.ts";

const BASE = "https://api.gateio.ws/api/v4";

export class GateAdapter implements ExchangeAdapter {
  id = "gate" as const;
  displayName = "Gate.io";

  async validateCredentials(creds: ExchangeCredentials): Promise<ValidationResult> {
    const base = credentialsPresent(creds);
    if (!base.ok) return base;
    try {
      await fetchJsonWithTimeout(`${BASE}/spot/currencies`, 4000);
      return { ok: true, warnings: [], errors: [] };
    } catch {
      return { ok: true, warnings: ["Gate.io ping failed, continuing"], errors: [] };
    }
  }

  async discover(_ctx: ExchangeAdapterContext): Promise<DiscoveryResult> {
    try {
      const rows = await fetchJsonWithTimeout<Array<{ id: string; trade_status: string }>>(`${BASE}/spot/currency_pairs`, 6000);
      const list = rows.filter((row) => (row.trade_status ?? "tradable").toLowerCase().includes("trad") && row.id.endsWith("_USDT"));
      const symbols = list.map((row) => normalizeSymbol(row.id, "spot"));
      const symbolsIndex = Object.fromEntries(
        symbols.map((s) => [s, { symbol: s, externalSymbol: s.replace("/", "_"), marketType: "spot", base: s.split("/")[0], quote: "USDT" }]),
      );
      return {
        serverTime: new Date().toISOString(),
        marketTypes: EXCHANGE_CAPABILITIES.gate.supportsMarketTypes,
        marketsCount: symbols.length,
        sampleSymbols: symbols.slice(0, 20),
        preferredSymbols: symbols.slice(0, 50),
        symbolsIndex,
        rateLimitNotes: ["Per-IP limits vary by endpoint"],
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
        errors: [issue("EXCHANGE_DOWN", "Could not discover Gate.io markets", true)],
      };
    }
  }

  mapSymbol(externalSymbol: string) {
    return normalizeSymbol(externalSymbol, "spot");
  }

  unmapSymbol(symbol: string) {
    return symbol.replace("/USDT", "_USDT").replace(":USDT", "");
  }

  async applyAutoSettings(_ctx: ExchangeAdapterContext): Promise<AutoSettingsResult> {
    return {
      applied: [{ key: "defaultLeverage", value: 5 }],
      notApplied: [{ key: "positionMode", reason: "Not exposed in unified Gate API" }],
      manualSteps: [
        "Gate.io > Futures > Preferences > Margin mode: Isolated",
        "Gate.io > Futures > Leverage slider: 5x default",
      ],
      warnings: [],
      errors: [],
    };
  }
}
