/**
 * ExecutionStatsTracker — Lightweight in-memory execution metrics collector.
 *
 * Tracks:
 *   - intent submission counts by source/venue
 *   - execution latency percentiles (p50, p95)
 *   - success/failure/rejection rates
 *   - dedup prevention count
 *   - recent error log (capped ring buffer)
 *
 * Used by ExchangeCoreService.getMetrics() and exposed via Mission Control.
 * No I/O — all in-memory with periodic reset (1h rolling window).
 */

import type { ExecutionStats } from "./types.ts";

const MAX_LATENCY_SAMPLES = 2000;
const MAX_RECENT_ERRORS = 50;
const ROLLING_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export class ExecutionStatsTracker {
  private submitted = 0;
  private success = 0;
  private failed = 0;
  private rejected = 0;
  private dedupPrevented = 0;
  private manualCount = 0;
  private aiCount = 0;
  private venueCount = new Map<string, number>();
  private latencySamples: number[] = [];
  private recentErrors: Array<{ ts: string; venue: string; code: string; message: string }> = [];
  private windowStart = Date.now();

  /** Call when an intent is submitted (accepted into queue). */
  recordSubmission(source: "MANUAL" | "AI", venue: string): void {
    this.maybeRollWindow();
    this.submitted++;
    if (source === "MANUAL") this.manualCount++;
    else this.aiCount++;
    this.venueCount.set(venue, (this.venueCount.get(venue) ?? 0) + 1);
  }

  /** Call when an order is successfully sent to exchange. */
  recordSuccess(executionMs: number): void {
    this.success++;
    this.addLatency(executionMs);
  }

  /** Call when exchange rejects or order fails. */
  recordFailure(venue: string, code: string, message: string): void {
    this.failed++;
    this.recentErrors.push({ ts: new Date().toISOString(), venue, code, message });
    if (this.recentErrors.length > MAX_RECENT_ERRORS) {
      this.recentErrors.shift();
    }
  }

  /** Call when intent is rejected by risk/policy/dedup before execution. */
  recordRejection(): void {
    this.rejected++;
  }

  /** Call when dedup prevents a duplicate intent. */
  recordDedupPrevented(): void {
    this.dedupPrevented++;
  }

  /** Get current stats snapshot. */
  getStats(): ExecutionStats {
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const avgMs = sorted.length > 0
      ? Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length)
      : 0;
    const p95Ms = sorted.length > 0
      ? sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1]
      : 0;

    const intentsByVenue: Record<string, number> = {};
    for (const [v, c] of this.venueCount) intentsByVenue[v] = c;

    return {
      totalSubmitted: this.submitted,
      totalSuccess: this.success,
      totalFailed: this.failed,
      totalRejected: this.rejected,
      totalDedupPrevented: this.dedupPrevented,
      avgExecutionMs: avgMs,
      p95ExecutionMs: Math.round(p95Ms),
      intentsBySource: { manual: this.manualCount, ai: this.aiCount },
      intentsByVenue,
      recentErrors: this.recentErrors.slice(-10),
    };
  }

  private addLatency(ms: number): void {
    this.latencySamples.push(ms);
    if (this.latencySamples.length > MAX_LATENCY_SAMPLES) {
      this.latencySamples.splice(0, this.latencySamples.length - MAX_LATENCY_SAMPLES);
    }
  }

  private maybeRollWindow(): void {
    if (Date.now() - this.windowStart > ROLLING_WINDOW_MS) {
      // Soft reset: keep half the recent data for continuity
      this.submitted = Math.floor(this.submitted / 2);
      this.success = Math.floor(this.success / 2);
      this.failed = Math.floor(this.failed / 2);
      this.rejected = Math.floor(this.rejected / 2);
      this.dedupPrevented = Math.floor(this.dedupPrevented / 2);
      this.manualCount = Math.floor(this.manualCount / 2);
      this.aiCount = Math.floor(this.aiCount / 2);
      for (const [k, v] of this.venueCount) this.venueCount.set(k, Math.floor(v / 2));
      this.latencySamples = this.latencySamples.slice(-Math.floor(MAX_LATENCY_SAMPLES / 2));
      this.recentErrors = this.recentErrors.slice(-Math.floor(MAX_RECENT_ERRORS / 2));
      this.windowStart = Date.now();
    }
  }
}
