import { create } from "zustand";
import type { FuturesMarketRow } from "../types";

/**
 * Pipeline 6: Market List Store
 *
 * Holds full Binance Futures universe (300+ symbols) with real-time dirty patches.
 * Designed for CryptoMarketPage — lightweight, no per-symbol deep data.
 *
 * Data flow:
 *   WS "market_snapshot" → ingestSnapshot() → full Map replace
 *   WS "market_patch"    → ingestPatch()    → in-place field merge + new Map ref
 */

interface MarketListState {
  /** Full universe: symbol → row */
  rows: Map<string, FuturesMarketRow>;
  /** Sorted symbol list (computed on snapshot) */
  symbolList: string[];
  /** Whether initial snapshot has been received */
  snapshotReceived: boolean;
  /** Timestamp of last patch */
  lastPatchAt: number;

  /** Ingest full snapshot (replaces all rows) */
  ingestSnapshot: (incoming: FuturesMarketRow[]) => void;
  /** Ingest dirty patch (merge changed fields only) */
  ingestPatch: (patch: Record<string, Record<string, number | null>>, ts: number) => void;
  /** Reset state */
  clear: () => void;
}

export const useMarketListStore = create<MarketListState>((set, get) => ({
  rows: new Map(),
  symbolList: [],
  snapshotReceived: false,
  lastPatchAt: 0,

  ingestSnapshot: (incoming) => {
    const map = new Map<string, FuturesMarketRow>();
    for (const row of incoming) {
      if (!row.symbol) continue;
      map.set(row.symbol, { ...row });
    }
    const symbolList = [...map.keys()].sort();
    set({ rows: map, symbolList, snapshotReceived: true, lastPatchAt: Date.now() });
  },

  ingestPatch: (patch, ts) => {
    const current = get().rows;
    if (!current.size) return; // No snapshot yet — ignore patches

    let changed = false;
    for (const [symbol, fields] of Object.entries(patch)) {
      const row = current.get(symbol);
      if (!row) continue; // Unknown symbol — skip
      for (const [key, value] of Object.entries(fields)) {
        if ((row as unknown as Record<string, unknown>)[key] !== value) {
          (row as unknown as Record<string, unknown>)[key] = value;
          changed = true;
        }
      }
    }

    if (changed) {
      // New Map reference triggers re-render
      set({ rows: new Map(current), lastPatchAt: ts });
    }
  },

  clear: () => set({ rows: new Map(), symbolList: [], snapshotReceived: false, lastPatchAt: 0 }),
}));

// ── Selector hooks ──

/** Get a single row by symbol. */
export const useMarketRow = (symbol: string): FuturesMarketRow | undefined =>
  useMarketListStore((state) => state.rows.get(symbol));

/** Get all rows as an array (for table rendering). */
export const useMarketRows = (): FuturesMarketRow[] =>
  useMarketListStore((state) => [...state.rows.values()]);

/** Check if snapshot is received. */
export const useMarketListReady = (): boolean =>
  useMarketListStore((state) => state.snapshotReceived);
