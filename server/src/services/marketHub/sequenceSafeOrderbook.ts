export type SequenceApplyResult =
  | { ok: true; applied: boolean; stale: boolean; gap: false }
  | { ok: false; applied: false; stale: false; gap: true };

type BookSideMap = Map<number, number>;

interface SymbolBookState {
  ready: boolean;
  lastSeq: number;
  bids: BookSideMap;
  asks: BookSideMap;
}

export interface TopOfBookSnapshot {
  topBid: number | null;
  topAsk: number | null;
  bidQty: number | null;
  askQty: number | null;
  spreadBps: number | null;
  depthUsd: number | null;
  imbalance: number | null;
  midPrice: number | null;
}

export class SequenceSafeOrderbookStore {
  private readonly books = new Map<string, SymbolBookState>();

  private ensure(symbol: string): SymbolBookState {
    const key = symbol.toUpperCase();
    const existing = this.books.get(key);
    if (existing) return existing;
    const next: SymbolBookState = {
      ready: false,
      lastSeq: 0,
      bids: new Map<number, number>(),
      asks: new Map<number, number>(),
    };
    this.books.set(key, next);
    return next;
  }

  reset(symbol: string): void {
    const state = this.ensure(symbol);
    state.ready = false;
    state.lastSeq = 0;
    state.bids.clear();
    state.asks.clear();
  }

  applySnapshot(
    symbol: string,
    seq: number,
    bids: Array<[number, number]>,
    asks: Array<[number, number]>,
  ): void {
    const state = this.ensure(symbol);
    state.bids.clear();
    state.asks.clear();
    for (const [price, qty] of bids) {
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) continue;
      state.bids.set(price, qty);
    }
    for (const [price, qty] of asks) {
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) continue;
      state.asks.set(price, qty);
    }
    state.lastSeq = Number.isFinite(seq) ? Math.max(0, Math.floor(seq)) : 0;
    state.ready = true;
  }

  applyDelta(
    symbol: string,
    startSeq: number,
    endSeq: number,
    bids: Array<[number, number]>,
    asks: Array<[number, number]>,
  ): SequenceApplyResult {
    const state = this.ensure(symbol);
    if (!state.ready) {
      return { ok: true, applied: false, stale: false, gap: false };
    }
    if (!Number.isFinite(startSeq) || !Number.isFinite(endSeq) || endSeq <= 0) {
      return { ok: false, applied: false, stale: false, gap: true };
    }
    const lastSeq = state.lastSeq;
    if (endSeq <= lastSeq) {
      return { ok: true, applied: false, stale: true, gap: false };
    }
    const expected = lastSeq + 1;
    const coversExpected = startSeq <= expected && expected <= endSeq;
    if (!coversExpected) {
      return { ok: false, applied: false, stale: false, gap: true };
    }

    for (const [price, qty] of bids) {
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty)) continue;
      if (qty <= 0) state.bids.delete(price);
      else state.bids.set(price, qty);
    }
    for (const [price, qty] of asks) {
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty)) continue;
      if (qty <= 0) state.asks.delete(price);
      else state.asks.set(price, qty);
    }
    state.lastSeq = Math.max(lastSeq, Math.floor(endSeq));
    return { ok: true, applied: true, stale: false, gap: false };
  }

  getLastSeq(symbol: string): number {
    return this.ensure(symbol).lastSeq;
  }

  isReady(symbol: string): boolean {
    return this.ensure(symbol).ready;
  }

  /**
   * Return sorted depth levels (up to `limit` per side) from the in-memory orderbook.
   * Bids sorted descending, asks sorted ascending — ready for API/cache use.
   * Returns null if the book isn't ready or both sides are empty.
   */
  getDepthLevels(symbol: string, limit = 20): { bids: Array<[number, number]>; asks: Array<[number, number]> } | null {
    const state = this.ensure(symbol);
    if (!state.ready || (!state.bids.size && !state.asks.size)) return null;
    const bids = [...state.bids.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, limit);
    const asks = [...state.asks.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, limit);
    if (bids.length === 0 && asks.length === 0) return null;
    return { bids, asks };
  }

  getTopOfBook(symbol: string): TopOfBookSnapshot {
    const state = this.ensure(symbol);
    if (!state.ready || (!state.bids.size && !state.asks.size)) {
      return {
        topBid: null,
        topAsk: null,
        bidQty: null,
        askQty: null,
        spreadBps: null,
        depthUsd: null,
        imbalance: null,
        midPrice: null,
      };
    }

    let topBid = -Infinity;
    let bidQty = 0;
    for (const [price, qty] of state.bids) {
      if (price > topBid) {
        topBid = price;
        bidQty = qty;
      }
    }

    let topAsk = Infinity;
    let askQty = 0;
    for (const [price, qty] of state.asks) {
      if (price < topAsk) {
        topAsk = price;
        askQty = qty;
      }
    }

    if (!Number.isFinite(topBid) || !Number.isFinite(topAsk) || topBid <= 0 || topAsk <= 0) {
      return {
        topBid: null,
        topAsk: null,
        bidQty: null,
        askQty: null,
        spreadBps: null,
        depthUsd: null,
        imbalance: null,
        midPrice: null,
      };
    }

    let bidDepthUsd = 0;
    for (const [price, qty] of state.bids) {
      bidDepthUsd += Math.max(0, price * qty);
    }

    let askDepthUsd = 0;
    for (const [price, qty] of state.asks) {
      askDepthUsd += Math.max(0, price * qty);
    }

    const depthUsd = bidDepthUsd + askDepthUsd;
    const imbalance = depthUsd > 0 ? (bidDepthUsd - askDepthUsd) / depthUsd : 0;
    const midPrice = (topBid + topAsk) / 2;
    const spreadBps = midPrice > 0 ? ((topAsk - topBid) / midPrice) * 10_000 : null;
    return {
      topBid,
      topAsk,
      bidQty: bidQty > 0 ? bidQty : null,
      askQty: askQty > 0 ? askQty : null,
      spreadBps: Number.isFinite(spreadBps ?? Number.NaN) ? spreadBps : null,
      depthUsd: Number.isFinite(depthUsd) ? depthUsd : null,
      imbalance: Number.isFinite(imbalance) ? imbalance : null,
      midPrice: Number.isFinite(midPrice) ? midPrice : null,
    };
  }
}

