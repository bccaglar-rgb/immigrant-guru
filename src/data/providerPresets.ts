import type { ProviderConfig } from "../types";

const nowIso = () => new Date().toISOString();

const preset = (
  input: Omit<ProviderConfig, "id" | "enabled" | "lastTestStatus" | "lastTestAt"> & { presetKey: string },
): ProviderConfig => ({
  id: input.presetKey,
  enabled: true,
  lastTestStatus: "UNKNOWN",
  lastTestAt: nowIso(),
  ...input,
});

export const REQUESTED_PROVIDER_PRESETS: ProviderConfig[] = [
  preset({
    presetKey: "coinglass-rest",
    providerGroup: "OUTSOURCE",
    name: "Coinglass API",
    type: "REST",
    baseUrl: "https://open-api-v4.coinglass.com",
    discoveryEndpoint: "/api/futures/liquidation/history",
    notes: "Outsource derivatives/liquidation feed",
    extraPaths: ["/api/futures/liquidation/history?exchange=Binance&symbol=BTCUSDT&interval=1h&limit=1"],
  }),
  preset({
    presetKey: "coinmarketcap-rest",
    providerGroup: "OUTSOURCE",
    name: "CoinMarketCap API",
    type: "REST",
    baseUrl: "https://pro-api.coinmarketcap.com",
    discoveryEndpoint: "/v1/cryptocurrency/listings/latest",
    notes: "Outsource market-cap and ranking feed",
    extraPaths: ["/v1/cryptocurrency/listings/latest"],
  }),
  preset({
    presetKey: "binance-spot-rest",
    providerGroup: "EXCHANGE",
    exchangeName: "Binance",
    defaultPrimary: false,
    fallbackPriority: 1,
    name: "Binance Spot REST",
    type: "REST",
    baseUrl: "https://api.binance.com",
    discoveryEndpoint: "/api/v3/exchangeInfo",
    notes: "Default primary source",
    extraPaths: ["/api/v3/exchangeInfo"],
  }),
  preset({
    presetKey: "bitrium-labs-fallback",
    providerGroup: "OUTSOURCE",
    fallbackPriority: 2,
    name: "Bitrium Labs API",
    type: "REST",
    baseUrl: "https://labs.bitrium.ai",
    notes: "Fallback source (if exchange stream fails)",
  }),
  preset({
    presetKey: "gate-rest",
    providerGroup: "EXCHANGE",
    exchangeName: "Gate.io",
    fallbackPriority: 3,
    name: "Gate.io REST",
    type: "REST",
    baseUrl: "https://api.gateio.ws/api/v4",
    discoveryEndpoint: "/spot/currency_pairs",
    notes: "Exchange fallback list",
    extraPaths: ["/spot/currency_pairs", "/spot/tickers"],
  }),
  preset({
    presetKey: "binance-spot-ws-9443",
    providerGroup: "EXCHANGE",
    exchangeName: "Binance",
    name: "Binance Spot WS 9443",
    type: "WS",
    baseUrl: "wss://stream.binance.com:9443",
    wsUrl: "wss://stream.binance.com:9443",
    notes: "Raw: /ws/<stream> | Combined: /stream?streams=...",
    extraPaths: ["/ws/<stream>", "/stream?streams=..."],
  }),
  preset({
    presetKey: "binance-spot-ws-443",
    providerGroup: "EXCHANGE",
    exchangeName: "Binance",
    name: "Binance Spot WS 443",
    type: "WS",
    baseUrl: "wss://stream.binance.com:443",
    wsUrl: "wss://stream.binance.com:443",
    notes: "Alternative public stream endpoint",
    extraPaths: ["/ws/<stream>", "/stream?streams=..."],
  }),
  preset({
    presetKey: "binance-futures-rest",
    providerGroup: "EXCHANGE",
    exchangeName: "Binance Futures",
    name: "Binance USDT-M Futures REST",
    type: "REST",
    baseUrl: "https://fapi.binance.com",
    notes: "USDT-M futures market data",
  }),
  preset({
    presetKey: "binance-futures-ws",
    providerGroup: "EXCHANGE",
    exchangeName: "Binance Futures",
    name: "Binance Futures WS Market",
    type: "WS",
    baseUrl: "wss://fstream.binance.com",
    wsUrl: "wss://fstream.binance.com",
  }),
  preset({
    presetKey: "binance-futures-ws-api",
    providerGroup: "EXCHANGE",
    exchangeName: "Binance Futures",
    defaultPrimary: true,
    name: "Binance Futures WS API",
    type: "WS",
    baseUrl: "wss://ws-fapi.binance.com/ws-fapi/v1",
    wsUrl: "wss://ws-fapi.binance.com/ws-fapi/v1",
  }),
  preset({
    presetKey: "bybit-v5-rest",
    providerGroup: "EXCHANGE",
    exchangeName: "Bybit",
    fallbackPriority: 4,
    name: "Bybit V5 REST",
    type: "REST",
    baseUrl: "https://api.bybit.com",
    discoveryEndpoint: "/v5/market/instruments-info",
    extraPaths: ["/v5/market/instruments-info", "/v5/market/tickers"],
  }),
  preset({
    presetKey: "bybit-alt-rest",
    providerGroup: "EXCHANGE",
    exchangeName: "Bybit",
    name: "Bybit Alt REST",
    type: "REST",
    baseUrl: "https://api.bytick.com",
  }),
  preset({
    presetKey: "okx-rest",
    providerGroup: "EXCHANGE",
    exchangeName: "OKX",
    fallbackPriority: 5,
    name: "OKX API v5 REST",
    type: "REST",
    baseUrl: "https://www.okx.com/api/v5",
    discoveryEndpoint: "/public/instruments",
    extraPaths: ["/public/instruments?instType=SPOT"],
  }),
  preset({
    presetKey: "okx-public-ws",
    providerGroup: "EXCHANGE",
    exchangeName: "OKX",
    name: "OKX Public WS",
    type: "WS",
    baseUrl: "wss://ws.okx.com:8443/ws/v5/public",
    wsUrl: "wss://ws.okx.com:8443/ws/v5/public",
  }),
  preset({
    presetKey: "kraken-rest",
    providerGroup: "EXCHANGE",
    exchangeName: "Kraken",
    fallbackPriority: 6,
    name: "Kraken Spot REST",
    type: "REST",
    baseUrl: "https://api.kraken.com/0/public/Ticker",
  }),
  preset({
    presetKey: "kraken-ws-public",
    providerGroup: "EXCHANGE",
    exchangeName: "Kraken",
    name: "Kraken WS Public",
    type: "WS",
    baseUrl: "wss://ws.kraken.com/",
    wsUrl: "wss://ws.kraken.com/",
  }),
  preset({
    presetKey: "kraken-ws-auth",
    providerGroup: "EXCHANGE",
    exchangeName: "Kraken",
    name: "Kraken WS Auth",
    type: "WS",
    baseUrl: "wss://ws-auth.kraken.com/",
    wsUrl: "wss://ws-auth.kraken.com/",
  }),
  preset({
    presetKey: "coinbase-advanced-ws",
    providerGroup: "EXCHANGE",
    exchangeName: "Coinbase",
    fallbackPriority: 7,
    name: "Coinbase Advanced WS",
    type: "WS",
    baseUrl: "wss://advanced-trade-ws.coinbase.com",
    wsUrl: "wss://advanced-trade-ws.coinbase.com",
  }),
];

export const mergeProviderPresets = (providers: ProviderConfig[]): ProviderConfig[] => {
  const existingByPreset = new Map(
    providers
      .filter((p) => p.presetKey)
      .map((p) => [String(p.presetKey), p] as const),
  );
  const manual = providers.filter((p) => !p.presetKey);
  const merged = REQUESTED_PROVIDER_PRESETS.map((presetRow) => {
    const existing = existingByPreset.get(String(presetRow.presetKey));
    if (!existing) return presetRow;
    return {
      ...presetRow,
      ...existing,
      id: existing.id || presetRow.id,
      presetKey: presetRow.presetKey,
    };
  });
  return [...manual, ...merged];
};

export const providerFallbackLabel = "Binance (default) -> Bitrium Labs API -> Gate.io -> Bybit -> OKX -> Kraken -> Coinbase";
