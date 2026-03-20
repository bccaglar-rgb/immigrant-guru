/**
 * RequestDeduplicator — collapses concurrent identical REST calls into one.
 *
 * When 50 clients request BTCUSDT depth snapshot simultaneously,
 * only 1 REST call is made. All 50 get the same result.
 *
 * Usage:
 *   const dedup = new RequestDeduplicator();
 *   const snapshot = await dedup.dedupe("depth:BINANCE:BTCUSDT", () => adapter.fetchDepthSnapshot("BTCUSDT"));
 */

import type { IRequestDeduplicator } from "../contracts/HubModels.ts";

export class RequestDeduplicator implements IRequestDeduplicator {
  private readonly inflight = new Map<string, Promise<unknown>>();

  /**
   * If `key` is already in-flight, returns the same promise.
   * Otherwise, calls `fetcher()` and shares the result with all callers.
   */
  async dedupe<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = fetcher().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  getPendingCount(): number {
    return this.inflight.size;
  }
}
