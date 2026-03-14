import type { MarketType, NormalizedExchangeId } from "./types.ts";

export interface ExchangeCapabilities {
  supportsMarketTypes: MarketType[];
  supportsPrivateTrading: boolean;
  supportsLeverageApi: boolean;
  supportsMarginModeApi: boolean;
  supportsPositionModeApi: boolean;
  requiresPassphrase?: boolean;
}

export const EXCHANGE_CAPABILITIES: Record<NormalizedExchangeId, ExchangeCapabilities> = {
  binance: {
    supportsMarketTypes: ["spot", "perp"],
    supportsPrivateTrading: true,
    supportsLeverageApi: true,
    supportsMarginModeApi: true,
    supportsPositionModeApi: true,
  },
  gate: {
    supportsMarketTypes: ["spot", "perp"],
    supportsPrivateTrading: true,
    supportsLeverageApi: true,
    supportsMarginModeApi: true,
    supportsPositionModeApi: false,
  },
  bybit: {
    supportsMarketTypes: ["spot", "perp"],
    supportsPrivateTrading: true,
    supportsLeverageApi: true,
    supportsMarginModeApi: true,
    supportsPositionModeApi: true,
  },
  okx: {
    supportsMarketTypes: ["spot", "perp"],
    supportsPrivateTrading: true,
    supportsLeverageApi: true,
    supportsMarginModeApi: true,
    supportsPositionModeApi: true,
    requiresPassphrase: true,
  },
  mock: {
    supportsMarketTypes: ["spot", "perp"],
    supportsPrivateTrading: false,
    supportsLeverageApi: false,
    supportsMarginModeApi: false,
    supportsPositionModeApi: false,
  },
};
