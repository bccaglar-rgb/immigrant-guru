import { create } from "zustand";

export interface LivePrice {
  price: number;
  ts: number;        // Binance event timestamp (ms)
  side?: "BUY" | "SELL";
  prevPrice?: number; // for uptick/downtick flash
}

interface LivePriceState {
  /** symbol → latest tick-derived micro price */
  bySymbol: Record<string, LivePrice>;
  /** Update live price from latest tick — does NOT touch candle data */
  setLivePrice: (symbol: string, price: number, ts: number, side?: "BUY" | "SELL") => void;
  /** Clear on reconnect / symbol change */
  clear: (symbol?: string) => void;
}

export const useLivePriceStore = create<LivePriceState>((set) => ({
  bySymbol: {},

  setLivePrice: (symbol, price, ts, side) =>
    set((state) => {
      const prev = state.bySymbol[symbol];
      return {
        bySymbol: {
          ...state.bySymbol,
          [symbol]: {
            price,
            ts,
            side,
            prevPrice: prev?.price,
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
