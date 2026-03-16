import { create } from "zustand";

export interface Tick {
  ts: number;        // Binance event timestamp (ms)
  price: number;
  qty: number;
  side: "BUY" | "SELL";
  tradeId?: string;
}

interface TickStoreState {
  /** symbol → ring buffer of recent ticks (max RING_MAX) */
  ticks: Record<string, Tick[]>;
  /** Replace entire tick buffer for a symbol (initial snapshot) */
  ingestSnapshot: (symbol: string, ticks: Tick[]) => void;
  /** Append new ticks (micro-batch) and trim to ring max */
  ingestBatch: (symbol: string, ticks: Tick[]) => void;
  /** Clear ticks for a symbol or all */
  clear: (symbol?: string) => void;
}

const RING_MAX = 500;

export const useTickStore = create<TickStoreState>((set) => ({
  ticks: {},

  ingestSnapshot: (symbol, incoming) =>
    set((state) => ({
      ticks: {
        ...state.ticks,
        [symbol]: incoming.slice(-RING_MAX),
      },
    })),

  ingestBatch: (symbol, incoming) =>
    set((state) => {
      const existing = state.ticks[symbol] ?? [];
      const merged = [...existing, ...incoming];
      return {
        ticks: {
          ...state.ticks,
          [symbol]: merged.length > RING_MAX
            ? merged.slice(merged.length - RING_MAX)
            : merged,
        },
      };
    }),

  clear: (symbol) =>
    set((state) => {
      if (symbol) {
        const next = { ...state.ticks };
        delete next[symbol];
        return { ticks: next };
      }
      return { ticks: {} };
    }),
}));
