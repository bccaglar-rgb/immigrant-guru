import type { TerminologyMap, NormalizedExchangeId } from "../types.ts";

export const buildTerminologyMap = (exchangeId: NormalizedExchangeId): TerminologyMap => {
  if (exchangeId === "okx") {
    return {
      symbolFormat: "BTC-USDT / BTC-USDT-SWAP",
      marketTypeMap: { SPOT: "spot", SWAP: "perp", FUTURES: "futures" },
      orderTypeMap: { market: "market", limit: "limit", post_only: "limit(postOnly)", ioc: "IOC", fok: "FOK" },
      sideMap: { buy: "buy", sell: "sell" },
      positionModeMap: { net: "one-way", long_short: "hedge" },
      marginModeMap: { cross: "cross", isolated: "isolated" },
    };
  }
  if (exchangeId === "gate") {
    return {
      symbolFormat: "BTC_USDT",
      marketTypeMap: { spot: "spot", futures: "perp" },
      orderTypeMap: { market: "market", limit: "limit", post_only: "limit(postOnly)", ioc: "IOC", fok: "FOK" },
      sideMap: { buy: "buy", sell: "sell" },
      positionModeMap: { single: "one-way" },
      marginModeMap: { cross: "cross", isolated: "isolated" },
    };
  }
  if (exchangeId === "bybit") {
    return {
      symbolFormat: "BTCUSDT (category=spot|linear)",
      marketTypeMap: { spot: "spot", linear: "perp", inverse: "futures" },
      orderTypeMap: { Market: "market", Limit: "limit", PostOnly: "limit(postOnly)", IOC: "IOC", FOK: "FOK" },
      sideMap: { Buy: "buy", Sell: "sell" },
      positionModeMap: { MergedSingle: "one-way", BothSide: "hedge" },
      marginModeMap: { REGULAR_MARGIN: "cross", ISOLATED_MARGIN: "isolated" },
    };
  }
  return {
    symbolFormat: "BTCUSDT",
    marketTypeMap: { SPOT: "spot", FUTURES: "perp" },
    orderTypeMap: { MARKET: "market", LIMIT: "limit", LIMIT_MAKER: "limit(postOnly)", IOC: "IOC", FOK: "FOK" },
    sideMap: { BUY: "buy", SELL: "sell" },
    positionModeMap: { "true": "hedge", "false": "one-way" },
    marginModeMap: { CROSSED: "cross", ISOLATED: "isolated" },
  };
};
