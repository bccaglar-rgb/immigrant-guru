/**
 * P7: Self-Throttle / Self-Disable Engine
 *
 * Professional safety layer:
 *   - Last 10 trades expectancy drops → reduce trades
 *   - Mode drawdown exceeds limit → disable mode
 *   - Fake breakout rate rises → raise threshold
 *   - System-wide throttle if multiple modes degraded
 */

import { redis } from "../../db/redis.ts";
import type { ModePerformanceTracker } from "./modePerformanceTracker.ts";

const REDIS_KEY = "optimizer:throttle_state";

export interface ThrottleState {
  globalThrottle: boolean;
  globalReason: string | null;
  scoreBoost: number;            // added to min score threshold (0 = normal, +10 = cautious)
  maxTradesPerCycle: number;     // default 28, reduced when throttled
  disabledModes: string[];
  lastChecked: string;
}

export class SelfThrottleEngine {
  private state: ThrottleState = {
    globalThrottle: false,
    globalReason: null,
    scoreBoost: 0,
    maxTradesPerCycle: 28,
    disabledModes: [],
    lastChecked: "",
  };

  constructor(private modeTracker: ModePerformanceTracker) {}

  /** Evaluate system health and apply throttle if needed */
  evaluate(): ThrottleState {
    // DISABLED: tracking only — no throttling until manual review
    this.state.globalThrottle = false;
    this.state.globalReason = null;
    this.state.scoreBoost = 0;
    this.state.maxTradesPerCycle = 999;
    this.state.disabledModes = [];
    return this.state;
    const modes = this.modeTracker.getAllStats();
    const throttledCount = modes.filter((m) => m.throttled).length;
    const totalTrades = modes.reduce((s, m) => s + m.tradeCount, 0);

    this.state.disabledModes = [];
    this.state.globalThrottle = false;
    this.state.globalReason = null;
    this.state.scoreBoost = 0;
    this.state.maxTradesPerCycle = 28;

    if (totalTrades < 20) {
      // Not enough data — no throttle
      this.state.lastChecked = new Date().toISOString();
      return this.state;
    }

    // Check: multiple modes throttled
    if (throttledCount >= 3) {
      this.state.globalThrottle = true;
      this.state.globalReason = `${throttledCount}/4_modes_throttled`;
      this.state.scoreBoost = 15;
      this.state.maxTradesPerCycle = 10;
    } else if (throttledCount >= 2) {
      this.state.scoreBoost = 8;
      this.state.maxTradesPerCycle = 18;
    }

    // Check: severe drawdown in any mode
    for (const m of modes) {
      if (m.currentDrawdown < -8) {
        this.state.disabledModes.push(m.mode);
        this.state.globalThrottle = true;
        this.state.globalReason = `${m.mode}_severe_drawdown_${m.currentDrawdown.toFixed(1)}R`;
      }
    }

    // Check: overall system expectancy
    const totalR = modes.reduce((s, m) => s + m.totalR, 0);
    const avgR = totalTrades > 0 ? totalR / totalTrades : 0;
    if (avgR < -0.5 && totalTrades >= 30) {
      this.state.globalThrottle = true;
      this.state.globalReason = `system_negative_expectancy_${avgR.toFixed(2)}R`;
      this.state.scoreBoost = 12;
      this.state.maxTradesPerCycle = 14;
    }

    this.state.lastChecked = new Date().toISOString();
    this.persistToRedis().catch(() => {});
    return this.state;
  }

  getState(): ThrottleState { return this.state; }

  isModeDisabled(mode: string): boolean {
    return this.state.disabledModes.includes(mode.toUpperCase());
  }

  getScoreBoost(): number { return this.state.scoreBoost; }

  async loadFromRedis(): Promise<void> {
    try {
      const raw = await redis.get(REDIS_KEY);
      if (raw) this.state = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  private async persistToRedis(): Promise<void> {
    try { await redis.set(REDIS_KEY, JSON.stringify(this.state), "EX", 86400); } catch { /* ignore */ }
  }
}
