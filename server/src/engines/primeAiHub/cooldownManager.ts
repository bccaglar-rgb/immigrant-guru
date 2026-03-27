/**
 * Bitrium Prime AI Hub — Cooldown Manager
 *
 * Redis-based rate limiting:
 *   - Max 2 CONFIRMED per day
 *   - Max 3 PROBE per day
 *   - 90min cooldown per symbol after trade
 *   - 120min revenge re-entry block after SL hit
 *   - 5min duplicate filter (same symbol+side+timeframe)
 *
 * All keys have TTL — auto-cleanup, no cron needed.
 */

import type { EnforcedResult, CooldownCheckResult } from "./types.ts";
import { redis } from "../../db/redis.ts";
import { pool } from "../../db/pool.ts";
import { REDIS_KEYS, LOG_PREFIX } from "./config.ts";
import type { PrimeAiConfig } from "./types.ts";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Check all limits for a single enforced result.
 * Returns { allowed, reason } — if not allowed, the result should be downgraded.
 */
export async function checkLimits(
  result: EnforcedResult,
  config: PrimeAiConfig,
): Promise<CooldownCheckResult> {
  const { enforced, coin } = result;
  const { symbol } = coin;
  const { decision, side } = enforced;

  // Only check limits for tradeable decisions
  if (decision !== "CONFIRMED" && decision !== "PROBE") {
    return { allowed: true };
  }

  try {
    const day = todayKey();

    // 1. Daily limits
    if (decision === "CONFIRMED") {
      const count = await redis.get(REDIS_KEYS.dailyConfirmed(day));
      if (Number(count || 0) >= config.limits.maxConfirmedPerDay) {
        return { allowed: false, reason: `daily_confirmed_limit(${config.limits.maxConfirmedPerDay})` };
      }
    }
    if (decision === "PROBE") {
      const count = await redis.get(REDIS_KEYS.dailyProbe(day));
      if (Number(count || 0) >= config.limits.maxProbePerDay) {
        return { allowed: false, reason: `daily_probe_limit(${config.limits.maxProbePerDay})` };
      }
    }

    // 2. Symbol cooldown (90min)
    const cooldownKey = REDIS_KEYS.cooldown(symbol);
    const cooldownExists = await redis.exists(cooldownKey);
    if (cooldownExists) {
      return { allowed: false, reason: `symbol_cooldown(${config.limits.cooldownMinutes}min)` };
    }

    // 3. Revenge block (120min after SL hit)
    const revengeKey = REDIS_KEYS.revenge(symbol);
    const revengeExists = await redis.exists(revengeKey);
    if (revengeExists) {
      return { allowed: false, reason: `revenge_block(${config.limits.revengeBlockMinutes}min)` };
    }

    // 4. Duplicate filter (5min same symbol+side+tf)
    const dedupKey = REDIS_KEYS.dedup(symbol, side, coin.timeframe);
    const dedupExists = await redis.exists(dedupKey);
    if (dedupExists) {
      return { allowed: false, reason: `duplicate_filter(${config.limits.duplicateFilterMinutes}min)` };
    }

    return { allowed: true };
  } catch (err) {
    console.error(`${LOG_PREFIX} Cooldown check error for ${symbol}:`, (err as Error).message);
    // Fail open — allow the trade but log the error
    return { allowed: true };
  }
}

/**
 * Record a decision: increment daily counters, set cooldown keys.
 */
export async function recordDecision(
  result: EnforcedResult,
  config: PrimeAiConfig,
): Promise<void> {
  const { enforced, coin } = result;
  const { decision, side } = enforced;
  const { symbol } = coin;

  if (decision !== "CONFIRMED" && decision !== "PROBE") return;

  try {
    const day = todayKey();
    const dayTtl = 86400; // 24h

    // Increment daily counters
    if (decision === "CONFIRMED") {
      const key = REDIS_KEYS.dailyConfirmed(day);
      await redis.incr(key);
      await redis.expire(key, dayTtl);
    } else {
      const key = REDIS_KEYS.dailyProbe(day);
      await redis.incr(key);
      await redis.expire(key, dayTtl);
    }

    // Set symbol cooldown
    const cooldownTtl = config.limits.cooldownMinutes * 60;
    await redis.set(REDIS_KEYS.cooldown(symbol), "1", "EX", cooldownTtl);

    // Set dedup filter
    const dedupTtl = config.limits.duplicateFilterMinutes * 60;
    await redis.set(REDIS_KEYS.dedup(symbol, side, coin.timeframe), "1", "EX", dedupTtl);
  } catch (err) {
    console.error(`${LOG_PREFIX} Record decision error for ${symbol}:`, (err as Error).message);
  }
}

/**
 * Check for recent SL hits on a symbol and set revenge block if found.
 * Called during cycle to proactively block revenge re-entries.
 */
export async function checkRevengeBlock(
  symbol: string,
  config: PrimeAiConfig,
): Promise<boolean> {
  try {
    // Check if revenge block already exists
    const exists = await redis.exists(REDIS_KEYS.revenge(symbol));
    if (exists) return true;

    // Query recent SL hits from trade_idea_events
    const blockWindow = config.limits.revengeBlockMinutes;
    const result = await pool.query(
      `SELECT COUNT(*) as cnt FROM trade_idea_events e
       JOIN trade_ideas i ON e.idea_id = i.id
       WHERE i.symbol = $1
         AND e.event_type IN ('TP_SL_HIT', 'SL_HIT', 'STOPPED_OUT')
         AND e.ts > NOW() - INTERVAL '${blockWindow} minutes'
         AND i.scoring_mode = 'PRIME_AI'`,
      [symbol],
    );

    if (Number(result.rows[0]?.cnt || 0) > 0) {
      // Set revenge block
      const revengeTtl = config.limits.revengeBlockMinutes * 60;
      await redis.set(REDIS_KEYS.revenge(symbol), "1", "EX", revengeTtl);
      return true;
    }

    return false;
  } catch {
    // Fail open
    return false;
  }
}
