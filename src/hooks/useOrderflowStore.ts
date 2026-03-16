import { create } from "zustand";

export interface OrderflowFrame {
  windowStart: number;   // unix ms
  windowEnd: number;
  delta: number;         // buyVol - sellVol (quote)
  cvd: number;           // cumulative volume delta
  buyVolume: number;
  sellVolume: number;
  buyCount: number;
  sellCount: number;
  totalCount: number;
  avgTradeSize: number;
  maxTradeSize: number;
  vwap: number;
  aggressionScore: number; // -1 to +1
}

interface OrderflowState {
  /** symbol → last N frames (ring buffer, 5 min of 1s frames) */
  frames: Record<string, OrderflowFrame[]>;
  /** symbol → latest CVD value for quick access */
  latestCvd: Record<string, number>;

  /** Append a new 1s orderflow frame */
  ingestFrame: (symbol: string, frame: OrderflowFrame) => void;
  /** Clear frames for a symbol or all */
  clear: (symbol?: string) => void;
}

const FRAME_RING_MAX = 300; // 5 minutes of 1s frames

export const useOrderflowStore = create<OrderflowState>((set) => ({
  frames: {},
  latestCvd: {},

  ingestFrame: (symbol, frame) =>
    set((state) => {
      const existing = state.frames[symbol] ?? [];
      const merged = [...existing, frame];
      return {
        frames: {
          ...state.frames,
          [symbol]: merged.length > FRAME_RING_MAX
            ? merged.slice(merged.length - FRAME_RING_MAX)
            : merged,
        },
        latestCvd: {
          ...state.latestCvd,
          [symbol]: frame.cvd,
        },
      };
    }),

  clear: (symbol) =>
    set((state) => {
      if (symbol) {
        const nextFrames = { ...state.frames };
        const nextCvd = { ...state.latestCvd };
        delete nextFrames[symbol];
        delete nextCvd[symbol];
        return { frames: nextFrames, latestCvd: nextCvd };
      }
      return { frames: {}, latestCvd: {} };
    }),
}));
