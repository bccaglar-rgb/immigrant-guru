import { create } from "zustand";

// ═══════════════════════════════════════════════════════════════════
// Canonical price store — single source-of-truth per price type.
//
// Each price type is written by ONE source only:
//   lastTradePrice  ← trade stream (aggTrade / trade WS events)
//   bestBid/bestAsk ← bookTicker or DOM pipeline
//   midPrice        ← derived: (bid+ask)/2
//   markPrice       ← !markPrice@arr@1s stream
//   indexPrice      ← mark price stream (indexPrice field)
//
// Display priority: lastTradePrice ?? midPrice ?? null
// ═══════════════════════════════════════════════════════════════════

export interface LivePrice {
  /** Last trade execution price — THE displayed price */
  price: number;
  ts: number;                  // Binance event timestamp (ms)
  side?: "BUY" | "SELL";
  prevPrice?: number;          // for uptick/downtick flash

  /** Separated price fields — each written by exactly one source */
  bestBid?: number;
  bestAsk?: number;
  midPrice?: number;
  markPrice?: number;
  indexPrice?: number;

  /** Per-source event time guards for out-of-order rejection */
  lastTradeEventTime: number;
  lastBookEventTime: number;
  lastMarkEventTime: number;
}

interface LivePriceState {
  /** symbol → latest price data (all types separated) */
  bySymbol: Record<string, LivePrice>;

  /** Update from trade stream — writes lastTradePrice only */
  setLivePrice: (symbol: string, price: number, ts: number, side?: "BUY" | "SELL") => void;

  /** Update from bookTicker/DOM — writes bid/ask/mid only */
  setBookPrice: (symbol: string, bid: number, ask: number, ts: number) => void;

  /** Update from mark price stream — writes markPrice/indexPrice only */
  setMarkPrice: (symbol: string, markPrice: number, indexPrice: number | null, ts: number) => void;

  /** Clear on reconnect / symbol change */
  clear: (symbol?: string) => void;
}

export const useLivePriceStore = create<LivePriceState>((set) => ({
  bySymbol: {},

  // ── Trade stream → lastTradePrice ──
  setLivePrice: (symbol, price, ts, side) =>
    set((state) => {
      const prev = state.bySymbol[symbol];
      // Out-of-order guard: reject trades older than the current one
      if (prev && prev.lastTradeEventTime > 0 && ts > 0 && ts < prev.lastTradeEventTime) return state;
      return {
        bySymbol: {
          ...state.bySymbol,
          [symbol]: {
            ...(prev ?? { lastTradeEventTime: 0, lastBookEventTime: 0, lastMarkEventTime: 0 }),
            price,
            ts,
            side,
            prevPrice: prev?.price,
            lastTradeEventTime: ts,
          },
        },
      };
    }),

  // ── bookTicker / DOM → bid, ask, mid ──
  setBookPrice: (symbol, bid, ask, ts) =>
    set((state) => {
      const prev = state.bySymbol[symbol];
      if (prev && prev.lastBookEventTime > 0 && ts > 0 && ts < prev.lastBookEventTime) return state;
      const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : undefined;
      return {
        bySymbol: {
          ...state.bySymbol,
          [symbol]: {
            // IMPORTANT: Never initialize `price` to midPrice. The `price` field is ONLY
            // written by setLivePrice (trade stream). If we set price=mid here, useDisplayPrice
            // would return midPrice instead of lastTradePrice, causing ~$0.05-$10 discrepancy.
            ...(prev ?? { price: 0, ts: 0, lastTradeEventTime: 0, lastBookEventTime: 0, lastMarkEventTime: 0 }),
            bestBid: bid,
            bestAsk: ask,
            midPrice: mid,
            lastBookEventTime: ts,
          },
        },
      };
    }),

  // ── markPrice stream → markPrice, indexPrice ──
  setMarkPrice: (symbol, markPrice, indexPrice, ts) =>
    set((state) => {
      const prev = state.bySymbol[symbol];
      if (prev && prev.lastMarkEventTime > 0 && ts > 0 && ts < prev.lastMarkEventTime) return state;
      return {
        bySymbol: {
          ...state.bySymbol,
          [symbol]: {
            ...(prev ?? { price: 0, ts: 0, lastTradeEventTime: 0, lastBookEventTime: 0, lastMarkEventTime: 0 }),
            markPrice,
            indexPrice: indexPrice ?? prev?.indexPrice,
            lastMarkEventTime: ts,
          },
        },
      };
    }),

  clear: (symbol) =>
    set((state) => {
      if (symbol) {
        const next = { ...state.bySymbol };
        delete next[symbol];
        return { bySymbol: next };
      }
      return { bySymbol: {} };
    }),
}));

// ═══════════════════════════════════════════════════════════════════
// Selector hooks — UI reads ONLY from these, never from raw bundles.
//
// Rule: Components call selectDisplayPrice("BTCUSDT") etc.
//       NO component should read chartBundle.lastTradePrice,
//       fallback.close, candle.close, or bookTicker.bid directly.
// ═══════════════════════════════════════════════════════════════════

/** Canonical display price: lastTradePrice > midPrice > null */
export const selectDisplayPrice = (symbol: string): number | null => {
  const lp = useLivePriceStore.getState().bySymbol[symbol];
  if (!lp) return null;
  if (lp.price > 0) return lp.price;
  if (lp.midPrice && lp.midPrice > 0) return lp.midPrice;
  return null;
};

/** Best bid price (from bookTicker/DOM) */
export const selectBestBid = (symbol: string): number | null => {
  const lp = useLivePriceStore.getState().bySymbol[symbol];
  return lp?.bestBid ?? null;
};

/** Best ask price (from bookTicker/DOM) */
export const selectBestAsk = (symbol: string): number | null => {
  const lp = useLivePriceStore.getState().bySymbol[symbol];
  return lp?.bestAsk ?? null;
};

/** Spread in basis points */
export const selectSpread = (symbol: string): number | null => {
  const lp = useLivePriceStore.getState().bySymbol[symbol];
  if (!lp?.bestBid || !lp?.bestAsk || lp.bestBid <= 0) return null;
  return ((lp.bestAsk - lp.bestBid) / lp.bestBid) * 10_000;
};

/** Mark price (from !markPrice@arr@1s stream) */
export const selectMarkPrice = (symbol: string): number | null => {
  const lp = useLivePriceStore.getState().bySymbol[symbol];
  return lp?.markPrice ?? null;
};

/** Is the store fed by live WS data (not just REST bootstrap)? */
export const selectIsLive = (symbol: string): boolean => {
  const lp = useLivePriceStore.getState().bySymbol[symbol];
  if (!lp) return false;
  return lp.lastTradeEventTime > 0;
};

/** Uptick/downtick direction for flash coloring */
export const selectPriceDirection = (symbol: string): "up" | "down" | "neutral" => {
  const lp = useLivePriceStore.getState().bySymbol[symbol];
  if (!lp || !lp.prevPrice || lp.price === lp.prevPrice) return "neutral";
  return lp.price > lp.prevPrice ? "up" : "down";
};

// ── React hook selectors (subscribe to re-renders) ──

/** Hook: subscribe to display price changes */
export const useDisplayPrice = (symbol: string) =>
  useLivePriceStore((s) => {
    const lp = s.bySymbol[symbol];
    if (!lp) return null;
    if (lp.price > 0) return lp.price;
    if (lp.midPrice && lp.midPrice > 0) return lp.midPrice;
    return null;
  });

/** Hook: subscribe to mark price changes */
export const useMarkPrice = (symbol: string) =>
  useLivePriceStore((s) => s.bySymbol[symbol]?.markPrice ?? null);

/** Hook: subscribe to full LivePrice entry */
export const useLivePrice = (symbol: string) =>
  useLivePriceStore((s) => s.bySymbol[symbol] ?? null);
