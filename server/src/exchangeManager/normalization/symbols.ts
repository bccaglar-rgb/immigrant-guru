import type { MarketType, NormalizedSymbol } from "../types.ts";

export const normalizeSpotSymbol = (raw: string): NormalizedSymbol => {
  const upper = raw.toUpperCase().replace(/[\-_]/g, "");
  if (upper.endsWith("USDT")) return `${upper.slice(0, -4)}/USDT`;
  return upper;
};

export const normalizePerpSymbol = (raw: string): NormalizedSymbol => {
  const upper = raw.toUpperCase();
  if (upper.includes("-USDT-SWAP")) return `${upper.replace("-USDT-SWAP", "")}/USDT:USDT`;
  if (upper.endsWith("USDT")) return `${upper.slice(0, -4)}/USDT:USDT`;
  return `${upper}:PERP`;
};

export const normalizeSymbol = (raw: string, marketType: MarketType): NormalizedSymbol =>
  marketType === "spot" ? normalizeSpotSymbol(raw) : normalizePerpSymbol(raw);

export const denormalizeSymbolForExchange = (symbol: NormalizedSymbol, exchange: "binance" | "gate" | "bybit" | "okx"): string => {
  const base = symbol.toUpperCase();
  if (exchange === "okx") {
    if (base.includes(":USDT")) return `${base.split("/")[0]}-USDT-SWAP`;
    return `${base.replace("/", "-")}`;
  }
  if (exchange === "gate") {
    if (base.includes(":USDT")) return `${base.split("/")[0]}_USDT`;
    return `${base.replace("/", "_")}`;
  }
  return base.replace("/USDT:USDT", "USDT").replace("/USDT", "USDT");
};
