/**
 * KillSwitch — Multi-level emergency stop.
 *
 * Levels (checked in priority order):
 * - GLOBAL: Stop ALL trading across all venues, users, symbols
 * - EXCHANGE: Stop all trading for a specific venue (BINANCE, GATEIO)
 * - USER: Stop all trading for a specific user
 * - SYMBOL: Stop all trading for a specific symbol
 * - AI_ONLY: Stop only AI trading (manual still allowed)
 *
 * State stored in Redis for instant cross-instance propagation.
 * Key pattern: killswitch:{level}:{target}
 */
import { redisControl } from "../../db/redis.ts";
import type { CoreVenue } from "./types.ts";

export type KillSwitchLevel = "GLOBAL" | "EXCHANGE" | "USER" | "SYMBOL" | "AI_ONLY";

export interface KillSwitchState {
  level: KillSwitchLevel;
  target: string;
  active: boolean;
  activatedAt: string;
  activatedBy: string;
  reason: string;
  autoTriggered: boolean;
}

interface BlockResult {
  blocked: boolean;
  level?: KillSwitchLevel;
  reason?: string;
}

const ksKey = (level: KillSwitchLevel, target: string) =>
  `killswitch:${level}:${target}`;

export class KillSwitch {
  /**
   * Check if any kill switch blocks this intent.
   * Checks all levels in priority order.
   */
  async isBlocked(intent: {
    venue: CoreVenue;
    userId: string;
    symbolInternal: string;
    source?: string;
  }): Promise<BlockResult> {
    // 1. Global check
    const global = await this.getState("GLOBAL", "*");
    if (global?.active) {
      return { blocked: true, level: "GLOBAL", reason: global.reason };
    }

    // 2. Exchange check
    const exchange = await this.getState("EXCHANGE", intent.venue);
    if (exchange?.active) {
      return { blocked: true, level: "EXCHANGE", reason: exchange.reason };
    }

    // 3. User check
    const user = await this.getState("USER", intent.userId);
    if (user?.active) {
      return { blocked: true, level: "USER", reason: user.reason };
    }

    // 4. Symbol check
    const symbol = await this.getState("SYMBOL", intent.symbolInternal);
    if (symbol?.active) {
      return { blocked: true, level: "SYMBOL", reason: symbol.reason };
    }

    // 5. AI-only check (blocks AI, allows manual)
    if (intent.source === "AI") {
      const aiOnly = await this.getState("AI_ONLY", "*");
      if (aiOnly?.active) {
        return { blocked: true, level: "AI_ONLY", reason: aiOnly.reason };
      }
    }

    return { blocked: false };
  }

  /** Activate a kill switch level. */
  async activate(
    level: KillSwitchLevel,
    target: string,
    activatedBy: string,
    reason: string,
    autoTriggered = false,
  ): Promise<void> {
    const state: KillSwitchState = {
      level,
      target,
      active: true,
      activatedAt: new Date().toISOString(),
      activatedBy,
      reason,
      autoTriggered,
    };
    const key = ksKey(level, target);
    // No TTL — stays active until manually deactivated
    await redisControl.set(key, JSON.stringify(state));
    console.warn(`[KillSwitch] ACTIVATED: ${level}:${target} by ${activatedBy} — ${reason}`);
  }

  /** Deactivate a kill switch level. */
  async deactivate(
    level: KillSwitchLevel,
    target: string,
    deactivatedBy: string,
  ): Promise<void> {
    const key = ksKey(level, target);
    await redisControl.del(key);
    console.log(`[KillSwitch] DEACTIVATED: ${level}:${target} by ${deactivatedBy}`);
  }

  /** Get all active kill switches. */
  async getActiveStates(): Promise<KillSwitchState[]> {
    const keys = await redisControl.keys("killswitch:*");
    if (!keys.length) return [];

    const pipeline = redisControl.pipeline();
    for (const key of keys) pipeline.get(key);
    const results = await pipeline.exec();

    const states: KillSwitchState[] = [];
    for (const [err, val] of results ?? []) {
      if (err || !val) continue;
      try {
        const state = JSON.parse(val as string) as KillSwitchState;
        if (state.active) states.push(state);
      } catch { /* skip */ }
    }
    return states;
  }

  /** Get state for a specific level + target. */
  private async getState(level: KillSwitchLevel, target: string): Promise<KillSwitchState | null> {
    const key = ksKey(level, target);
    const data = await redisControl.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as KillSwitchState;
    } catch {
      return null;
    }
  }
}
