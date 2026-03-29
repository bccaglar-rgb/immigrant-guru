import { EXCHANGE_CAPABILITIES } from "../capabilities.ts";
import { issue } from "../errors.ts";
import { normalizeSymbol } from "../normalization/symbols.ts";
import type { AutoSettingsResult, DiscoveryResult, ExchangeAdapterContext, ExchangeCredentials, ValidationResult } from "../types.ts";
import { credentialsPresent, fetchJsonWithTimeout, type ExchangeAdapter } from "./BaseAdapter.ts";

const MAINNET_BASE = "https://api.gateio.ws/api/v4";
const TESTNET_BASE = "https://fx-api-testnet.gateio.ws/api/v4";

const getBase = (ctx?: ExchangeAdapterContext): string =>
  ctx?.options?.environment === "testnet" ? TESTNET_BASE : MAINNET_BASE;

export class GateAdapter implements ExchangeAdapter {
  id = "gate" as const;
  displayName = "Gate.io";

  async validateCredentials(creds: ExchangeCredentials): Promise<ValidationResult> {
    const base = credentialsPresent(creds);
    if (!base.ok) return base;
    try {
      await fetchJsonWithTimeout(`${MAINNET_BASE}/spot/time`, 6000);
      return { ok: true, warnings: [], errors: [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      return { ok: false, warnings: [], errors: [issue("NETWORK_TIMEOUT", `Gate.io API unreachable: ${msg}`, true)] };
    }
  }

  async discover(ctx: ExchangeAdapterContext): Promise<DiscoveryResult> {
    const apiBase = getBase(ctx);
    const isTestnet = apiBase.includes("testnet");
    try {
      if (isTestnet) {
        // Gate.io testnet only supports futures — fetch contracts
        const rows = await fetchJsonWithTimeout<Array<{ name?: string; trade_id?: number }>>(
          `${apiBase}/futures/usdt/contracts`, 6000,
        );
        const list = Array.isArray(rows) ? rows : [];
        const symbols = list
          .filter((row) => row.name && row.name.endsWith("_USDT"))
          .map((row) => normalizeSymbol(row.name!, "futures"));
        const symbolsIndex = Object.fromEntries(
          symbols.map((s) => [s, {
            symbol: s,
            externalSymbol: s.replace("/", "_").replace(":USDT", "_USDT"),
            marketType: "futures",
            base: s.split("/")[0],
            quote: "USDT",
          }]),
        );
        return {
          serverTime: new Date().toISOString(),
          marketTypes: ["futures"],
          marketsCount: symbols.length,
          sampleSymbols: symbols.slice(0, 20),
          preferredSymbols: symbols.slice(0, 50),
          symbolsIndex,
          rateLimitNotes: ["Testnet rate limits may differ"],
          warnings: isTestnet ? ["Using Gate.io testnet/sandbox environment"] : [],
          errors: [],
        };
      }

      // Mainnet: spot currency pairs
      const rows = await fetchJsonWithTimeout<Array<{ id: string; trade_status: string }>>(
        `${apiBase}/spot/currency_pairs`, 6000,
      );
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
    } catch (err) {
      return {
        serverTime: new Date().toISOString(),
        marketTypes: isTestnet ? ["futures"] : ["spot"],
        marketsCount: 0,
        sampleSymbols: [],
        preferredSymbols: [],
        symbolsIndex: {},
        rateLimitNotes: [],
        warnings: [],
        errors: [issue("EXCHANGE_DOWN", `Could not discover Gate.io ${isTestnet ? "testnet " : ""}markets: ${err instanceof Error ? err.message : "unknown"}`, true)],
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
