import type { AutoSettingsResult, DiscoveryResult, ExchangeAdapterContext, ExchangeCredentials, ValidationResult } from "../types.ts";
import { type ExchangeAdapter } from "./BaseAdapter.ts";

export class MockAdapter implements ExchangeAdapter {
  id = "mock" as const;
  displayName = "Mock";

  async validateCredentials(_creds: ExchangeCredentials): Promise<ValidationResult> {
    return { ok: true, warnings: [], errors: [] };
  }

  async discover(_ctx: ExchangeAdapterContext): Promise<DiscoveryResult> {
    const symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];
    return {
      serverTime: new Date().toISOString(),
      marketTypes: ["spot", "perp"],
      marketsCount: symbols.length,
      sampleSymbols: symbols,
      preferredSymbols: symbols,
      symbolsIndex: {
        "BTC/USDT": { symbol: "BTC/USDT", externalSymbol: "BTCUSDT", marketType: "spot", base: "BTC", quote: "USDT" },
        "ETH/USDT": { symbol: "ETH/USDT", externalSymbol: "ETHUSDT", marketType: "spot", base: "ETH", quote: "USDT" },
        "SOL/USDT": { symbol: "SOL/USDT", externalSymbol: "SOLUSDT", marketType: "spot", base: "SOL", quote: "USDT" },
      },
      rateLimitNotes: [],
      warnings: [],
      errors: [],
    };
  }

  mapSymbol(externalSymbol: string) {
    return externalSymbol;
  }

  unmapSymbol(symbol: string) {
    return symbol;
  }

  async applyAutoSettings(_ctx: ExchangeAdapterContext): Promise<AutoSettingsResult> {
    return {
      applied: [],
      notApplied: [],
      manualSteps: [],
      warnings: [],
      errors: [],
    };
  }
}
