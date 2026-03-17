/**
 * Bot Breaker — Three-layer fault isolation for AI trader bots.
 *
 * Market Breaker:   If >MAX_MARKET_TRADES bots try to trade same symbol within 60s,
 *                   downgrade excess to WATCH (prevents liquidity-chasing / slippage cascade).
 *
 * Strategy Breaker: If a strategy has >MAX_STRATEGY_FAILS consecutive failures,
 *                   all bots using that strategy are paused until manual reset or
 *                   streak clears after SUCCESS_STREAK successes.
 *
 * User Breaker:     If a user's bots accumulate >MAX_USER_FAILS exchange errors
 *                   within 1 hour, all bots for that user are throttled.
 *
 * All state is in Redis → shared across all PM2 workers.
 */
import { redis } from "../../db/redis.ts";

// ── Thresholds (tunable via env) ─────────────────────────────────────────────
const MAX_MARKET_TRADES   = Number(process.env.BB_MAX_MARKET_TRADES   ?? 50);
const MARKET_WINDOW_SEC   = Number(process.env.BB_MARKET_WINDOW_SEC   ?? 60);
const MAX_STRATEGY_FAILS  = Number(process.env.BB_MAX_STRATEGY_FAILS  ?? 10);
const STRATEGY_SUCCESS_RESET = Number(process.env.BB_STRATEGY_SUCCESS ?? 3);
const MAX_USER_FAILS      = Number(process.env.BB_MAX_USER_FAILS      ?? 5);
const USER_WINDOW_SEC     = Number(process.env.BB_USER_WINDOW_SEC     ?? 3600);

// ── Redis key helpers ─────────────────────────────────────────────────────────
const keyMarket   = (symbol: string)     => `bb:market:${symbol}`;
const keyStrategy = (strategyId: string) => `bb:strategy:${strategyId}:fails`;
const keyStratOK  = (strategyId: string) => `bb:strategy:${strategyId}:ok`;
const keyUser     = (userId: string)     => `bb:user:${userId}:fails`;

// ── BotBreaker ────────────────────────────────────────────────────────────────

export class BotBreaker {
  /**
   * Returns { allowed: true } if the bot is permitted to execute a TRADE.
   * Call before submitting to exchange.
   * If a TRADE is allowed, increments the market trades counter.
   */
  async canExecute(
    symbol: string,
    strategyId: string,
    userId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // ── Strategy Breaker ────────────────────────────────────────────────
    try {
      const fails = await redis.get(keyStrategy(strategyId));
      if (Number(fails ?? 0) >= MAX_STRATEGY_FAILS) {
        return { allowed: false, reason: `strategy_breaker:${strategyId}` };
      }
    } catch { /* fail-open */ }

    // ── User Breaker ────────────────────────────────────────────────────
    try {
      const fails = await redis.get(keyUser(userId));
      if (Number(fails ?? 0) >= MAX_USER_FAILS) {
        return { allowed: false, reason: `user_breaker:${userId}` };
      }
    } catch { /* fail-open */ }

    // ── Market Breaker ──────────────────────────────────────────────────
    // Atomically check + increment trades counter
    try {
      const count = await redis.incr(keyMarket(symbol));
      if (count <= 1) {
        await redis.expire(keyMarket(symbol), MARKET_WINDOW_SEC);
      }
      if (count > MAX_MARKET_TRADES) {
        return { allowed: false, reason: `market_breaker:${symbol}` };
      }
    } catch { /* fail-open */ }

    return { allowed: true };
  }

  /** Record a successful bot execution (resets strategy/user fail streaks). */
  async recordSuccess(strategyId: string, userId: string): Promise<void> {
    try {
      const p = redis.pipeline();
      // Strategy: accumulate successes, once enough → reset fails
      const ok = await redis.incr(keyStratOK(strategyId));
      if (ok >= STRATEGY_SUCCESS_RESET) {
        p.del(keyStrategy(strategyId));
        p.del(keyStratOK(strategyId));
      }
      // User: decrement fail counter on success (floor 0)
      p.eval(
        `local v = redis.call('GET', KEYS[1]); if v and tonumber(v) > 0 then redis.call('DECR', KEYS[1]) end`,
        1,
        keyUser(userId),
      );
      await p.exec();
    } catch { /* best-effort */ }
  }

  /** Record a failed exchange call (increments strategy/user fail counters). */
  async recordFailure(strategyId: string, userId: string): Promise<void> {
    try {
      const p = redis.pipeline();

      // Strategy: increment consecutive fail counter
      const fails = await redis.incr(keyStrategy(strategyId));
      if (fails <= 1) {
        p.del(keyStratOK(strategyId)); // reset success counter on first fail
      }
      if (fails >= MAX_STRATEGY_FAILS) {
        console.warn(`[BotBreaker] Strategy ${strategyId} breaker OPEN (${fails} fails)`);
      }

      // User: increment windowed fail counter
      const userFails = await redis.incr(keyUser(userId));
      if (userFails <= 1) {
        p.expire(keyUser(userId), USER_WINDOW_SEC);
      }
      if (userFails >= MAX_USER_FAILS) {
        console.warn(`[BotBreaker] User ${userId} breaker OPEN (${userFails} fails in ${USER_WINDOW_SEC}s)`);
      }

      await p.exec();
    } catch { /* best-effort */ }
  }

  /** Get current breaker status for monitoring. */
  async getStatus(): Promise<{
    marketBreakers: Array<{ symbol: string; count: number; open: boolean }>;
    strategyBreakers: Array<{ strategyId: string; fails: number; open: boolean }>;
    userBreakers: Array<{ userId: string; fails: number; open: boolean }>;
  }> {
    // Light implementation: scan Redis for active breaker keys
    try {
      const [marketKeys, strategyKeys, userKeys] = await Promise.all([
        redis.keys("bb:market:*"),
        redis.keys("bb:strategy:*:fails"),
        redis.keys("bb:user:*:fails"),
      ]);

      const [marketVals, stratVals, userVals] = await Promise.all([
        marketKeys.length ? redis.mget(...marketKeys) : Promise.resolve([]),
        strategyKeys.length ? redis.mget(...strategyKeys) : Promise.resolve([]),
        userKeys.length ? redis.mget(...userKeys) : Promise.resolve([]),
      ]);

      return {
        marketBreakers: marketKeys.map((k, i) => ({
          symbol: k.replace("bb:market:", ""),
          count: Number(marketVals[i] ?? 0),
          open: Number(marketVals[i] ?? 0) > MAX_MARKET_TRADES,
        })),
        strategyBreakers: strategyKeys.map((k, i) => ({
          strategyId: k.replace("bb:strategy:", "").replace(":fails", ""),
          fails: Number(stratVals[i] ?? 0),
          open: Number(stratVals[i] ?? 0) >= MAX_STRATEGY_FAILS,
        })),
        userBreakers: userKeys.map((k, i) => ({
          userId: k.replace("bb:user:", "").replace(":fails", ""),
          fails: Number(userVals[i] ?? 0),
          open: Number(userVals[i] ?? 0) >= MAX_USER_FAILS,
        })),
      };
    } catch {
      return { marketBreakers: [], strategyBreakers: [], userBreakers: [] };
    }
  }

  /** Admin: reset all breakers for a given strategy or user (manual recovery). */
  async resetStrategy(strategyId: string): Promise<void> {
    await Promise.all([
      redis.del(keyStrategy(strategyId)),
      redis.del(keyStratOK(strategyId)),
    ]);
    console.log(`[BotBreaker] Strategy ${strategyId} breaker reset`);
  }

  async resetUser(userId: string): Promise<void> {
    await redis.del(keyUser(userId));
    console.log(`[BotBreaker] User ${userId} breaker reset`);
  }
}

export const botBreaker = new BotBreaker();
