import { create } from "zustand";

export interface DomLevel {
  price: number;
  qty: number;
}

interface DomSymbolState {
  bids: Map<number, number>;   // price → qty
  asks: Map<number, number>;   // price → qty
  seq: number;
  ready: boolean;
}

interface DomStoreState {
  books: Record<string, DomSymbolState>;

  /** Replace entire orderbook for a symbol (initial snapshot) */
  applySnapshot: (symbol: string, seq: number, bids: Array<[number, number]>, asks: Array<[number, number]>) => void;

  /** Incrementally patch levels: qty=0 removes, otherwise upserts */
  applyDelta: (symbol: string, endSeq: number, bids: Array<[number, number]>, asks: Array<[number, number]>) => void;

  /** Clear DOM data for a symbol or all */
  clear: (symbol?: string) => void;
}

export const useDomStore = create<DomStoreState>((set) => ({
  books: {},

  applySnapshot: (symbol, seq, bids, asks) =>
    set((state) => {
      const bidMap = new Map<number, number>();
      for (const [price, qty] of bids) {
        if (qty > 0) bidMap.set(price, qty);
      }
      const askMap = new Map<number, number>();
      for (const [price, qty] of asks) {
        if (qty > 0) askMap.set(price, qty);
      }
      return {
        books: {
          ...state.books,
          [symbol]: { bids: bidMap, asks: askMap, seq, ready: true },
        },
      };
    }),

  applyDelta: (symbol, endSeq, bidDeltas, askDeltas) =>
    set((state) => {
      const existing = state.books[symbol];
      if (!existing || !existing.ready) return state; // skip deltas before snapshot

      const currentSeq = existing.seq;
      if (endSeq <= currentSeq) return state; // stale delta

      // Clone maps for immutability (delta arrays are typically small: 1-20 entries)
      const bidMap = new Map(existing.bids);
      for (const [price, qty] of bidDeltas) {
        if (qty <= 0) bidMap.delete(price);
        else bidMap.set(price, qty);
      }

      const askMap = new Map(existing.asks);
      for (const [price, qty] of askDeltas) {
        if (qty <= 0) askMap.delete(price);
        else askMap.set(price, qty);
      }

      return {
        books: {
          ...state.books,
          [symbol]: { bids: bidMap, asks: askMap, seq: endSeq, ready: true },
        },
      };
    }),

  clear: (symbol) =>
    set((state) => {
      if (symbol) {
        const next = { ...state.books };
        delete next[symbol];
        return { books: next };
      }
      return { books: {} };
    }),
}));

/** Sorted bid levels (descending by price) — use as a React selector hook */
export const useDomBids = (symbol: string, limit = 20): DomLevel[] => {
  return useDomStore((s) => {
    const book = s.books[symbol];
    if (!book || !book.ready) return [];
    return [...book.bids.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, limit)
      .map(([price, qty]) => ({ price, qty }));
  });
};

/** Sorted ask levels (ascending by price) — use as a React selector hook */
export const useDomAsks = (symbol: string, limit = 20): DomLevel[] => {
  return useDomStore((s) => {
    const book = s.books[symbol];
    if (!book || !book.ready) return [];
    return [...book.asks.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, limit)
      .map(([price, qty]) => ({ price, qty }));
  });
};
