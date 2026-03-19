/**
 * RiskGate — Pre-trade risk validation layer.
 *
 * Checks before any order reaches the exchange:
 * - Max notional per order
 * - Max leverage cap
 * - Daily order count limit
 * - Per-symbol cooldown (prevent rapid-fire on same symbol)
 * - Max open orders
 *
 * Uses Redis for counters and cooldown tracking.
 */
import { pool } from "../../db/pool.ts";
import { redis } from "../../db/redis.ts";
import type { CoreIntentRecord } from "./types.ts";

export interface RiskLimits {
  maxNotionalPerOrder: number;
  maxPositionNotional: number;
  maxLeverage: number;
  maxOpenOrders: number;
  maxDailyOrders: number;
  cooldownMs: number;
}

export interface RiskCheckResult {
  allowed: boolean;
  code?: string;
  reason?: string;
  warnings: string[];
}

const DEFAULT_LIMITS: RiskLimits = {
  maxNotionalPerOrder: 10_000,
  maxPositionNotional: 50_000,
  maxLeverage: 20,
  maxOpenOrders: 50,
  maxDailyOrders: 500,
  cooldownMs: 1_000,
};

const dailyCountKey = (userId: string): string => {
  const date = new Date().toISOString().slice(0, 10);
  return `risk:daily:${userId}:${date}`;
};

const cooldownKey = (userId: string, symbol: string): string =>
  `risk:cooldown:${userId}:${symbol}`;

export class RiskGate {
  private readonly defaultLimits: RiskLimits;

  constructor(defaults?: Partial<RiskLimits>) {
    this.defaultLimits = { ...DEFAULT_LIMITS, ...defaults };
  }

  async check(intent: CoreIntentRecord): Promise<RiskCheckResult> {
    const warnings: string[] = [];
    const limits = await this.getLimits(intent.userId);

    // 1. Notional check
    const notional = intent.notionalUsdt ?? 0;
    if (notional > limits.maxNotionalPerOrder) {
      return {
        allowed: false,
        code: "RISK_MAX_NOTIONAL",
        reason: `Order notional ${notional} USDT exceeds limit of ${limits.maxNotionalPerOrder} USDT`,
        warnings,
      };
    }

    // 2. Leverage cap
    const leverage = intent.leverage ?? 1;
    if (leverage > limits.maxLeverage) {
      return {
        allowed: false,
        code: "RISK_MAX_LEVERAGE",
        reason: `Leverage ${leverage}x exceeds limit of ${limits.maxLeverage}x`,
        warnings,
      };
    }

    // 3. Daily order count (Redis counter with 24h TTL)
    const dailyKey = dailyCountKey(intent.userId);
    const dailyCount = Number(await redis.get(dailyKey) ?? "0");
    if (dailyCount >= limits.maxDailyOrders) {
      return {
        allowed: false,
        code: "RISK_DAILY_LIMIT",
        reason: `Daily order count ${dailyCount} reached limit of ${limits.maxDailyOrders}`,
        warnings,
      };
    }

    // 4. Per-symbol cooldown
    const cdKey = cooldownKey(intent.userId, intent.symbolInternal);
    const lastOrderAt = await redis.get(cdKey);
    if (lastOrderAt) {
      const elapsed = Date.now() - Number(lastOrderAt);
      if (elapsed < limits.cooldownMs) {
        return {
          allowed: false,
          code: "RISK_COOLDOWN",
          reason: `Cooldown active for ${intent.symbolInternal}: ${limits.cooldownMs - elapsed}ms remaining`,
          warnings,
        };
      }
    }

    // 5. Open orders count (DB check)
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM order_intents
         WHERE user_id = $1 AND state IN ('ACCEPTED', 'QUEUED', 'SENT')`,
        [intent.userId],
      );
      const openCount = rows[0]?.cnt ?? 0;
      if (openCount >= limits.maxOpenOrders) {
        return {
          allowed: false,
          code: "RISK_MAX_OPEN_ORDERS",
          reason: `Open orders count ${openCount} reached limit of ${limits.maxOpenOrders}`,
          warnings,
        };
      }
    } catch {
      warnings.push("Could not verify open orders count");
    }

    // Warnings for approaching limits
    if (notional > limits.maxNotionalPerOrder * 0.8) {
      warnings.push(`Notional ${notional} USDT is above 80% of limit`);
    }
    if (dailyCount > limits.maxDailyOrders * 0.9) {
      warnings.push(`Daily order count ${dailyCount} is above 90% of limit`);
    }

    // Record this order in counters
    await this.recordOrder(intent.userId, intent.symbolInternal, limits.cooldownMs);

    return { allowed: true, warnings };
  }

  private async recordOrder(userId: string, symbol: string, cooldownMs: number): Promise<void> {
    const pipeline = redis.pipeline();

    // Increment daily counter
    const dailyKey = dailyCountKey(userId);
    pipeline.incr(dailyKey);
    pipeline.expire(dailyKey, 86400); // 24h TTL

    // Set cooldown marker
    const cdKey = cooldownKey(userId, symbol);
    pipeline.set(cdKey, String(Date.now()), "PX", cooldownMs);

    await pipeline.exec();
  }

  private async getLimits(userId: string): Promise<RiskLimits> {
    try {
      const { rows } = await pool.query(
        `SELECT max_notional_per_order, max_position_notional, max_leverage,
                max_open_orders, max_daily_orders, cooldown_ms
         FROM user_risk_limits WHERE user_id = $1`,
        [userId],
      );
      if (!rows[0]) return this.defaultLimits;
      const r = rows[0];
      return {
        maxNotionalPerOrder: Number(r.max_notional_per_order ?? this.defaultLimits.maxNotionalPerOrder),
        maxPositionNotional: Number(r.max_position_notional ?? this.defaultLimits.maxPositionNotional),
        maxLeverage: Number(r.max_leverage ?? this.defaultLimits.maxLeverage),
        maxOpenOrders: Number(r.max_open_orders ?? this.defaultLimits.maxOpenOrders),
        maxDailyOrders: Number(r.max_daily_orders ?? this.defaultLimits.maxDailyOrders),
        cooldownMs: Number(r.cooldown_ms ?? this.defaultLimits.cooldownMs),
      };
    } catch {
      return this.defaultLimits;
    }
  }
}
