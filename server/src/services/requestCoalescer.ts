/**
 * Request Coalescer — Batch REST requests within a time window
 *
 * When multiple components request the same data (e.g., depth for BTCUSDT)
 * within a short window, the coalescer combines them into a single request.
 *
 * This works alongside the existing dedup system:
 *   1. Per-worker in-flight dedup (binanceRateLimiter: inFlight Map) — instant
 *   2. Cross-worker Redis dedup (binanceRateLimiter: Redis cache) — 3s TTL
 *   3. Request coalescer (this module) — batches within 50ms window
 *
 * Use cases:
 *   - Multiple clients viewing same symbol → one depth fetch
 *   - CoinUniverseEngine + UI both requesting same klines → one fetch
 *   - Multiple adapter init calls requesting exchangeInfo → one fetch
 *
 * Usage:
 *   const depth = coalescer.coalesce(
 *     `depth:${symbol}:${limit}`,
 *     () => exchangeFetch({ url, ... }),
 *     50  // batch window ms
 *   );
 */

// ═══════════════════════════════════════════════════════════════════
// COALESCER
// ═══════════════════════════════════════════════════════════════════

interface PendingRequest<T> {
  promise: Promise<T>;
  resolvers: Array<{ resolve: (v: T) => void; reject: (e: unknown) => void }>;
  timer: ReturnType<typeof setTimeout>;
  executor: () => Promise<T>;
  createdAt: number;
}

export class RequestCoalescer {
  private pending = new Map<string, PendingRequest<unknown>>();
  private readonly DEFAULT_WINDOW_MS = 50;
  private metrics = {
    totalRequests: 0,
    totalCoalesced: 0,
    totalExecuted: 0,
  };

  /**
   * Coalesce requests with the same key within a time window.
   *
   * @param key - Unique identifier for the request (e.g., "depth:BTCUSDT:20")
   * @param executor - The function to execute (only called once per window)
   * @param windowMs - Time window to collect requests (default: 50ms)
   */
  coalesce<T>(key: string, executor: () => Promise<T>, windowMs?: number): Promise<T> {
    this.metrics.totalRequests++;
    const window = windowMs ?? this.DEFAULT_WINDOW_MS;

    const existing = this.pending.get(key) as PendingRequest<T> | undefined;
    if (existing) {
      // Another request with the same key is already pending — join it
      this.metrics.totalCoalesced++;
      return new Promise<T>((resolve, reject) => {
        existing.resolvers.push({ resolve: resolve as (v: unknown) => void, reject } as unknown as { resolve: (v: T) => void; reject: (e: unknown) => void });
      });
    }

    // First request with this key — set up a new pending entry
    let resolveOuter!: (v: T) => void;
    let rejectOuter!: (e: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => {
      resolveOuter = resolve;
      rejectOuter = reject;
    });

    const entry: PendingRequest<T> = {
      promise,
      resolvers: [{ resolve: resolveOuter, reject: rejectOuter }],
      executor,
      createdAt: Date.now(),
      timer: setTimeout(() => {
        this.executeRequest(key);
      }, window),
    };

    this.pending.set(key, entry as PendingRequest<unknown>);
    return promise;
  }

  /** Get coalescer metrics */
  getMetrics() {
    return {
      ...this.metrics,
      pendingCount: this.pending.size,
      coalescingRatio: this.metrics.totalRequests > 0
        ? Math.round((this.metrics.totalCoalesced / this.metrics.totalRequests) * 100)
        : 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════

  private async executeRequest(key: string): Promise<void> {
    const entry = this.pending.get(key);
    if (!entry) return;
    this.pending.delete(key);
    this.metrics.totalExecuted++;

    try {
      const result = await entry.executor();
      for (const { resolve } of entry.resolvers) {
        try { resolve(result); } catch {}
      }
    } catch (err) {
      for (const { reject } of entry.resolvers) {
        try { reject(err); } catch {}
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════

let instance: RequestCoalescer | null = null;

export function getRequestCoalescer(): RequestCoalescer {
  if (!instance) {
    instance = new RequestCoalescer();
  }
  return instance;
}
