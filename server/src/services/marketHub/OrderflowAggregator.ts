import type { NormalizedTradeEvent } from "./types.ts";

export interface OrderflowFrame {
  symbol: string;
  windowStart: number;   // unix ms, start of 1s window
  windowEnd: number;     // unix ms
  delta: number;         // buyVolume - sellVolume (quote currency)
  cvd: number;           // cumulative volume delta since start
  buyVolume: number;     // total buy volume (quote) in window
  sellVolume: number;    // total sell volume (quote) in window
  buyCount: number;
  sellCount: number;
  totalCount: number;
  avgTradeSize: number;  // average trade notional in window
  maxTradeSize: number;  // largest single trade notional
  vwap: number;          // volume-weighted average price
  aggressionScore: number; // -1 to +1, positive = buy aggression
}

interface WindowState {
  start: number;
  buyVol: number;
  sellVol: number;
  buyCount: number;
  sellCount: number;
  maxSize: number;
  sumPriceQty: number;  // for VWAP: sum(price * qty)
  sumQty: number;       // for VWAP: sum(qty)
}

type FrameListener = (frame: OrderflowFrame) => void;

export class OrderflowAggregator {
  private readonly windows = new Map<string, WindowState>();
  private readonly cvdBySymbol = new Map<string, number>();
  private readonly listeners = new Set<FrameListener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onFrame(cb: FrameListener): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  ingestTrade(event: NormalizedTradeEvent): void {
    const symbol = event.symbol;
    const notional = event.price * event.qty;
    const currentWindowStart = Math.floor(Date.now() / 1000) * 1000;

    let window = this.windows.get(symbol);
    if (!window) {
      window = this.emptyWindow(currentWindowStart);
      this.windows.set(symbol, window);
    }

    // If we moved to a new second, flush the old window first
    if (window.start !== currentWindowStart) {
      this.flushSymbol(symbol, window);
      // Reset for current window
      window.start = currentWindowStart;
      window.buyVol = 0;
      window.sellVol = 0;
      window.buyCount = 0;
      window.sellCount = 0;
      window.maxSize = 0;
      window.sumPriceQty = 0;
      window.sumQty = 0;
    }

    if (event.side === "BUY") {
      window.buyVol += notional;
      window.buyCount += 1;
    } else {
      window.sellVol += notional;
      window.sellCount += 1;
    }
    window.maxSize = Math.max(window.maxSize, notional);
    window.sumPriceQty += event.price * event.qty;
    window.sumQty += event.qty;
  }

  private flush(): void {
    const currentWindowStart = Math.floor(Date.now() / 1000) * 1000;
    for (const [symbol, window] of this.windows.entries()) {
      // Only flush completed windows (previous second)
      if (window.start < currentWindowStart && (window.buyCount + window.sellCount) > 0) {
        this.flushSymbol(symbol, window);
        // Reset for current window
        window.start = currentWindowStart;
        window.buyVol = 0;
        window.sellVol = 0;
        window.buyCount = 0;
        window.sellCount = 0;
        window.maxSize = 0;
        window.sumPriceQty = 0;
        window.sumQty = 0;
      }
    }
  }

  private flushSymbol(symbol: string, w: WindowState): void {
    const totalCount = w.buyCount + w.sellCount;
    if (totalCount === 0) return;

    const delta = w.buyVol - w.sellVol;
    const prevCvd = this.cvdBySymbol.get(symbol) ?? 0;
    const cvd = prevCvd + delta;
    this.cvdBySymbol.set(symbol, cvd);

    const totalVol = w.buyVol + w.sellVol;
    const frame: OrderflowFrame = {
      symbol,
      windowStart: w.start,
      windowEnd: w.start + 1000,
      delta,
      cvd,
      buyVolume: w.buyVol,
      sellVolume: w.sellVol,
      buyCount: w.buyCount,
      sellCount: w.sellCount,
      totalCount,
      avgTradeSize: totalVol / totalCount,
      maxTradeSize: w.maxSize,
      vwap: w.sumQty > 0 ? w.sumPriceQty / w.sumQty : 0,
      aggressionScore: totalVol > 0 ? (w.buyVol - w.sellVol) / totalVol : 0,
    };

    for (const cb of this.listeners) {
      try { cb(frame); } catch { /* noop */ }
    }
  }

  private emptyWindow(start: number): WindowState {
    return {
      start,
      buyVol: 0,
      sellVol: 0,
      buyCount: 0,
      sellCount: 0,
      maxSize: 0,
      sumPriceQty: 0,
      sumQty: 0,
    };
  }
}
