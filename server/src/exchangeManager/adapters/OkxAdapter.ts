import { EXCHANGE_CAPABILITIES } from "../capabilities.ts";
import { issue } from "../errors.ts";
import { normalizeSymbol } from "../normalization/symbols.ts";
import type { AutoSettingsResult, DiscoveryResult, ExchangeAdapterContext, ExchangeCredentials, ValidationResult } from "../types.ts";
import { credentialsPresent, fetchJsonWithTimeout, type ExchangeAdapter } from "./BaseAdapter.ts";

const BASE = "https://www.okx.com";

export class OkxAdapter implements ExchangeAdapter {
  id = "okx" as const;
  displayName = "OKX";

  async validateCredentials(creds: ExchangeCredentials): Promise<ValidationResult> {
    const base = credentialsPresent(creds);
    if (!base.ok) return base;
    const warnings: string[] = [];
    if (!creds.passphrase) warnings.push("OKX usually requires passphrase for private endpoints");
    try {
      await fetchJsonWithTimeout(`${BASE}/api/v5/public/time`, 4000);
      return { ok: true, warnings, errors: [] };
    } catch {
      return { ok: true, warnings: [...warnings, "OKX ping failed, continuing"], errors: [] };
    }
  }

  async discover(_ctx: ExchangeAdapterContext): Promise<DiscoveryResult> {
    try {
      const spot = await fetchJsonWithTimeout<{ data?: Array<{ instId: string; state: string }> }>(
        `${BASE}/api/v5/public/instruments?instType=SPOT`,
      );
      const list = (spot.data ?? []).filter((row) => (row.state ?? "live").toLowerCase() === "live");
      const symbols = list.map((row) => normalizeSymbol(row.instId, "spot"));
      const symbolsIndex = Object.fromEntries(
        symbols.map((s) => [s, { symbol: s, externalSymbol: s.replace("/USDT", "-USDT"), marketType: "spot", base: s.split("/")[0], quote: "USDT" }]),
      );
      return {
        serverTime: new Date().toISOString(),
        marketTypes: EXCHANGE_CAPABILITIES.okx.supportsMarketTypes,
        marketsCount: symbols.length,
        sampleSymbols: symbols.slice(0, 20),
        preferredSymbols: symbols.slice(0, 50),
        symbolsIndex,
        rateLimitNotes: ["instType and endpoint-level limits apply"],
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
        errors: [issue("EXCHANGE_DOWN", "Could not discover OKX markets", true)],
      };
    }
  }

  mapSymbol(externalSymbol: string) {
    return normalizeSymbol(externalSymbol, "spot");
  }

  unmapSymbol(symbol: string) {
    return symbol.replace("/USDT", "-USDT").replace(":USDT", "-SWAP");
  }

  async applyAutoSettings(_ctx: ExchangeAdapterContext): Promise<AutoSettingsResult> {
    return {
      applied: [{ key: "defaultLeverage", value: 5 }],
      notApplied: [{ key: "positionMode", reason: "Requires explicit user confirmation in some accounts" }],
      manualSteps: [
        "OKX > Trade > Settings > Position mode: Net mode",
        "OKX > Trade > Margin mode: Isolated",
      ],
      warnings: [],
      errors: [],
    };
  }
}
