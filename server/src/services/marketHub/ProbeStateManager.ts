/**
 * ProbeStateManager — Shared Redis-backed probe state for exchange REST health
 *
 * Solves 6 architectural requirements:
 *   1. Shared state  — probe mode, cooldown, failure streak stored in Redis (not process-local)
 *   2. Source pref    — backend publishes preferred source per symbol for frontend stability
 *   3. Configurable   — all thresholds stored in config (not hardcoded)
 *   4. Multi-stage    — recovery goes: /time → light snapshot → full active
 *   5. Recovery storm — batch re-enqueue with jitter + priority ordering
 *   6. Metrics        — probe entry/exit counts, durations, source switches all tracked
 *
 * Redis keys (all under `probe:{exchange}:` prefix):
 *   probe:{exchange}:mode            — "ACTIVE" | "PROBING" | "RECOVERING"  (TTL 5min)
 *   probe:{exchange}:failures        — consecutive REST failure count        (TTL 5min)
 *   probe:{exchange}:entered_at      — timestamp when probe mode started     (TTL 30min)
 *   probe:{exchange}:last_probe      — last probe timestamp                  (TTL 5min)
 *   probe:{exchange}:last_weight     — last known weight from probe          (TTL 5min)
 *   probe:{exchange}:metrics         — HASH of counters                      (TTL 24h)
 *   probe:{exchange}:source:{symbol} — preferred source exchange             (TTL 60s)
 */

import { redis } from "../../db/redis.ts";

// ═══════════════════════════════════════════════════════════════
// CONFIGURABLE THRESHOLDS
// ═══════════════════════════════════════════════════════════════

export interface ProbeConfig {
  /** Consecutive REST failures before entering probe mode */
  failureThreshold: number;
  /** HTTP status codes that immediately trigger probe mode */
  immediateProbeStatuses: number[];
  /** Probe interval in ms (check if exchange REST is back) */
  probeIntervalMs: number;
  /** Weight must be below this to start recovery */
  recoveryWeightThreshold: number;
  /** Stage 2: weight must still be below this after light snapshot */
  recoveryConfirmThreshold: number;
  /** Max symbols to re-enqueue per batch during recovery */
  recoveryBatchSize: number;
  /** Jitter range in ms between recovery batches */
  recoveryJitterMs: number;
  /** Seconds before stale probe state auto-expires in Redis */
  stateExpirySec: number;
}

const DEFAULT_CONFIGS: Record<string, ProbeConfig> = {
  binance: {
    failureThreshold: 5,
    immediateProbeStatuses: [429, 418, 403],
    probeIntervalMs: 30_000,
    recoveryWeightThreshold: 800,
    recoveryConfirmThreshold: 900,
    recoveryBatchSize: 3,
    recoveryJitterMs: 2_000,
    stateExpirySec: 300,   // 5 min
  },
  bybit: {
    failureThreshold: 5,
    immediateProbeStatuses: [429, 403],
    probeIntervalMs: 30_000,
    recoveryWeightThreshold: 400,
    recoveryConfirmThreshold: 450,
    recoveryBatchSize: 3,
    recoveryJitterMs: 2_000,
    stateExpirySec: 300,
  },
  okx: {
    failureThreshold: 5,
    immediateProbeStatuses: [429, 403],
    probeIntervalMs: 30_000,
    recoveryWeightThreshold: 400,
    recoveryConfirmThreshold: 450,
    recoveryBatchSize: 3,
    recoveryJitterMs: 2_000,
    stateExpirySec: 300,
  },
  gateio: {
    failureThreshold: 5,
    immediateProbeStatuses: [429, 403],
    probeIntervalMs: 30_000,
    recoveryWeightThreshold: 600,
    recoveryConfirmThreshold: 700,
    recoveryBatchSize: 3,
    recoveryJitterMs: 2_000,
    stateExpirySec: 300,
  },
};

export function getProbeConfig(exchange: string): ProbeConfig {
  return DEFAULT_CONFIGS[exchange.toLowerCase()] ?? DEFAULT_CONFIGS.binance!;
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ProbeMode = "ACTIVE" | "PROBING" | "RECOVERING";

export interface ProbeState {
  mode: ProbeMode;
  failures: number;
  enteredAt: number | null;   // when probe mode started
  lastProbeAt: number | null;
  lastWeight: number | null;
}

export interface ProbeMetrics {
  probeEntryCount: number;
  probeDurationTotalMs: number;
  restoreSuccessCount: number;
  restoreFailCount: number;
  snapshotPauseDurationMs: number;
  sourceSwapCount: number;
  stickyLabelSuppressCount: number;
}

// ═══════════════════════════════════════════════════════════════
// REDIS KEY HELPERS
// ═══════════════════════════════════════════════════════════════

const pk = (exchange: string, suffix: string) => `probe:${exchange.toLowerCase()}:${suffix}`;

// ═══════════════════════════════════════════════════════════════
// READ STATE (used by all workers)
// ═══════════════════════════════════════════════════════════════

export async function getProbeState(exchange: string): Promise<ProbeState> {
  try {
    const pipe = redis.pipeline();
    pipe.get(pk(exchange, "mode"));
    pipe.get(pk(exchange, "failures"));
    pipe.get(pk(exchange, "entered_at"));
    pipe.get(pk(exchange, "last_probe"));
    pipe.get(pk(exchange, "last_weight"));
    const results = await pipe.exec();
    if (!results) return { mode: "ACTIVE", failures: 0, enteredAt: null, lastProbeAt: null, lastWeight: null };

    const mode = (results[0]?.[1] as string) ?? "ACTIVE";
    const failures = parseInt(results[1]?.[1] as string) || 0;
    const enteredAt = parseInt(results[2]?.[1] as string) || null;
    const lastProbeAt = parseInt(results[3]?.[1] as string) || null;
    const lastWeight = parseInt(results[4]?.[1] as string) || null;

    return {
      mode: (mode === "PROBING" || mode === "RECOVERING") ? mode : "ACTIVE",
      failures,
      enteredAt,
      lastProbeAt,
      lastWeight,
    };
  } catch {
    return { mode: "ACTIVE", failures: 0, enteredAt: null, lastProbeAt: null, lastWeight: null };
  }
}

// ═══════════════════════════════════════════════════════════════
// WRITE STATE (atomic operations)
// ═══════════════════════════════════════════════════════════════

export async function enterProbeMode(exchange: string, reason: string): Promise<void> {
  const config = getProbeConfig(exchange);
  const now = Date.now();
  const ex = config.stateExpirySec;

  try {
    const pipe = redis.pipeline();
    pipe.set(pk(exchange, "mode"), "PROBING", "EX", ex);
    pipe.set(pk(exchange, "entered_at"), String(now), "EX", ex * 6); // 30 min for duration tracking
    pipe.set(pk(exchange, "last_probe"), String(now), "EX", ex);
    pipe.hincrby(pk(exchange, "metrics"), "probe_entry_count", 1);
    pipe.expire(pk(exchange, "metrics"), 86400); // 24h
    await pipe.exec();

    console.log(`[ProbeState:${exchange}] ⚠ PROBE MODE — ${reason}. Shared state written to Redis.`);
  } catch (err) {
    console.error(`[ProbeState:${exchange}] Redis write failed:`, (err as Error).message);
  }
}

export async function enterRecoveryMode(exchange: string, weight: number): Promise<void> {
  const config = getProbeConfig(exchange);
  try {
    const pipe = redis.pipeline();
    pipe.set(pk(exchange, "mode"), "RECOVERING", "EX", config.stateExpirySec);
    pipe.set(pk(exchange, "last_weight"), String(weight), "EX", config.stateExpirySec);
    pipe.set(pk(exchange, "last_probe"), String(Date.now()), "EX", config.stateExpirySec);
    await pipe.exec();

    console.log(`[ProbeState:${exchange}] 🔄 RECOVERING — weight=${weight}, starting staged re-entry.`);
  } catch (err) {
    console.error(`[ProbeState:${exchange}] Redis write failed:`, (err as Error).message);
  }
}

export async function exitProbeMode(exchange: string, weight: number): Promise<void> {
  const now = Date.now();
  try {
    // Read entered_at for duration metric
    const enteredAtStr = await redis.get(pk(exchange, "entered_at"));
    const enteredAt = enteredAtStr ? parseInt(enteredAtStr) : null;
    const duration = enteredAt ? now - enteredAt : 0;

    const pipe = redis.pipeline();
    pipe.set(pk(exchange, "mode"), "ACTIVE", "EX", 60); // short TTL — ACTIVE is the default
    pipe.set(pk(exchange, "failures"), "0", "EX", 60);
    pipe.set(pk(exchange, "last_weight"), String(weight), "EX", 300);
    pipe.del(pk(exchange, "entered_at"));
    pipe.hincrby(pk(exchange, "metrics"), "restore_success_count", 1);
    if (duration > 0) {
      pipe.hincrby(pk(exchange, "metrics"), "probe_duration_total_ms", duration);
      pipe.hincrby(pk(exchange, "metrics"), "snapshot_pause_duration_ms", duration);
    }
    pipe.expire(pk(exchange, "metrics"), 86400);
    await pipe.exec();

    console.log(`[ProbeState:${exchange}] ✓ ACTIVE MODE — REST recovered (weight=${weight}, paused ${Math.round(duration / 1000)}s).`);
  } catch (err) {
    console.error(`[ProbeState:${exchange}] Redis write failed:`, (err as Error).message);
  }
}

export async function recordRestFailure(exchange: string): Promise<number> {
  try {
    const config = getProbeConfig(exchange);
    const newCount = await redis.incr(pk(exchange, "failures"));
    await redis.expire(pk(exchange, "failures"), config.stateExpirySec);
    return newCount;
  } catch {
    return 0;
  }
}

export async function resetRestFailures(exchange: string): Promise<void> {
  try {
    await redis.set(pk(exchange, "failures"), "0", "EX", 60);
  } catch { /* ignore */ }
}

export async function recordProbeAttempt(exchange: string, weight: number | null): Promise<void> {
  const config = getProbeConfig(exchange);
  try {
    const pipe = redis.pipeline();
    pipe.set(pk(exchange, "last_probe"), String(Date.now()), "EX", config.stateExpirySec);
    if (weight !== null) pipe.set(pk(exchange, "last_weight"), String(weight), "EX", config.stateExpirySec);
    await pipe.exec();
  } catch { /* ignore */ }
}

export async function recordRestoreFailure(exchange: string): Promise<void> {
  try {
    await redis.hincrby(pk(exchange, "metrics"), "restore_fail_count", 1);
    await redis.expire(pk(exchange, "metrics"), 86400);
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════
// PREFERRED SOURCE (backend decides, frontend displays)
// ═══════════════════════════════════════════════════════════════

export async function setPreferredSource(exchange: string, symbol: string, source: string): Promise<void> {
  try {
    const prev = await redis.get(pk(exchange, `source:${symbol}`));
    await redis.set(pk(exchange, `source:${symbol}`), source, "EX", 60);
    if (prev && prev !== source) {
      await redis.hincrby(pk(exchange, "metrics"), "source_swap_count", 1);
    }
  } catch { /* ignore */ }
}

export async function getPreferredSource(exchange: string, symbol: string): Promise<string | null> {
  try {
    return await redis.get(pk(exchange, `source:${symbol}`));
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// METRICS (read-only for admin API)
// ═══════════════════════════════════════════════════════════════

export async function getProbeMetrics(exchange: string): Promise<ProbeMetrics> {
  try {
    const raw = await redis.hgetall(pk(exchange, "metrics"));
    return {
      probeEntryCount: parseInt(raw.probe_entry_count ?? "0"),
      probeDurationTotalMs: parseInt(raw.probe_duration_total_ms ?? "0"),
      restoreSuccessCount: parseInt(raw.restore_success_count ?? "0"),
      restoreFailCount: parseInt(raw.restore_fail_count ?? "0"),
      snapshotPauseDurationMs: parseInt(raw.snapshot_pause_duration_ms ?? "0"),
      sourceSwapCount: parseInt(raw.source_swap_count ?? "0"),
      stickyLabelSuppressCount: parseInt(raw.sticky_label_suppress_count ?? "0"),
    };
  } catch {
    return {
      probeEntryCount: 0, probeDurationTotalMs: 0,
      restoreSuccessCount: 0, restoreFailCount: 0,
      snapshotPauseDurationMs: 0, sourceSwapCount: 0,
      stickyLabelSuppressCount: 0,
    };
  }
}

export async function incrMetric(exchange: string, field: string, amount = 1): Promise<void> {
  try {
    await redis.hincrby(pk(exchange, "metrics"), field, amount);
    await redis.expire(pk(exchange, "metrics"), 86400);
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════
// RECOVERY STORM PROTECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Returns symbols in priority-ordered batches with jitter.
 * Priority symbols (BTC, ETH, SOL, BNB, XRP) go first.
 * Each batch is `batchSize` symbols; caller should await jitter between batches.
 */
export function buildRecoveryBatches(
  symbols: string[],
  prioritySymbols: string[],
  batchSize: number,
): string[][] {
  // Priority symbols first, then the rest
  const prioritySet = new Set(prioritySymbols.map(s => s.toUpperCase()));
  const prio: string[] = [];
  const rest: string[] = [];
  for (const s of symbols) {
    if (prioritySet.has(s.toUpperCase())) prio.push(s);
    else rest.push(s);
  }
  const ordered = [...prio, ...rest];
  const batches: string[][] = [];
  for (let i = 0; i < ordered.length; i += batchSize) {
    batches.push(ordered.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Random jitter in [0, maxMs) — used between recovery batches.
 */
export function recoveryJitter(maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * maxMs);
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ═══════════════════════════════════════════════════════════════
// ADMIN API SNAPSHOT (all-in-one status)
// ═══════════════════════════════════════════════════════════════

export async function getProbeStatus(exchange: string): Promise<{
  state: ProbeState;
  config: ProbeConfig;
  metrics: ProbeMetrics;
}> {
  const [state, metrics] = await Promise.all([
    getProbeState(exchange),
    getProbeMetrics(exchange),
  ]);
  return {
    state,
    config: getProbeConfig(exchange),
    metrics,
  };
}
