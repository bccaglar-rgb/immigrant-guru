import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ChampionState,
  ChallengerState,
  ModeOptimizerState,
  OptimizerConfig,
  SegmentKey,
} from "./types.ts";
import { DEFAULT_MODULE_CONFIG } from "./types.ts";
import { SCORING_MODES, DETERMINISTIC_SCORING_MODES, normalizeScoringMode, type ScoringMode } from "../scoringMode.ts";
import { buildDefaultModeState } from "./moduleOptimizer.ts";

// ── Config path ───────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const DATA_DIR = join(dirname(__filename), "../../../data");
const CONFIG_PATH = join(DATA_DIR, "optimizer_config.json");

// ── Promotion rules ───────────────────────────────────────────
const PROMOTION_RULES = {
  minTradeCount: 30,
  minExpectancyImprovement: 0.05,
  minWinRateForPromotion: 0.30,
  historyLength: 10,
} as const;

export class ChampionChallengerManager {
  private config: OptimizerConfig;

  constructor() {
    this.config = this.load();
  }

  // ── Public API ────────────────────────────────────────────────

  getConfig(): OptimizerConfig {
    return this.config;
  }

  getModeState(mode: string): ModeOptimizerState | null {
    return this.config[mode as keyof OptimizerConfig] ?? null;
  }

  /** Update challenger for a mode's global slot */
  setGlobalChallenger(mode: string, challenger: ChallengerState | null): void {
    this.ensureMode(mode);
    this.config[mode].global.challenger = challenger;
    this.save();
  }

  /** Update challenger for a mode's segment slot */
  setSegmentChallenger(mode: string, segment: SegmentKey, challenger: ChallengerState | null): void {
    this.ensureMode(mode);
    if (!this.config[mode].segments[segment]) {
      this.config[mode].segments[segment] = {
        champion: { ...this.config[mode].global.champion },
        challenger: null,
      };
    }
    this.config[mode].segments[segment].challenger = challenger;
    this.save();
  }

  /** Evaluate and promote challengers that meet criteria */
  evaluatePromotions(): { mode: string; promoted: boolean; reason: string }[] {
    const results: { mode: string; promoted: boolean; reason: string }[] = [];

    for (const mode of DETERMINISTIC_SCORING_MODES) {
      this.ensureMode(mode);
      const state = this.config[mode];

      // Global promotion
      if (state.global.challenger) {
        const result = this.tryPromoteGlobal(mode, state.global.challenger);
        results.push({ mode, ...result });
      }

      // Segment promotions
      for (const [segment, segState] of Object.entries(state.segments)) {
        if (segState.challenger) {
          this.tryPromoteSegment(mode, segment, segState.challenger);
        }
      }
    }

    this.save();
    return results;
  }

  /** Rollback global champion to previous (if history exists) */
  rollback(mode: string): boolean {
    this.ensureMode(mode);
    const history = this.config[mode].global.history;
    if (history.length < 2) return false;
    const prev = history[history.length - 2];
    this.config[mode].global.champion = prev;
    this.config[mode].global.history = history.slice(0, -1);
    this.save();
    return true;
  }

  /** Update lastRun timestamp for a mode */
  markRun(mode: string): void {
    this.ensureMode(mode);
    this.config[mode].lastRun = new Date().toISOString();
    this.save();
  }

  // ── Promotion logic ───────────────────────────────────────────

  private tryPromoteGlobal(
    mode: string,
    challenger: ChallengerState,
  ): { promoted: boolean; reason: string } {
    const state = this.config[mode];
    const m = challenger.metrics;

    if (m.tradeCount < PROMOTION_RULES.minTradeCount) {
      return { promoted: false, reason: `insufficient trades (${m.tradeCount} < ${PROMOTION_RULES.minTradeCount})` };
    }
    if (m.winRate < PROMOTION_RULES.minWinRateForPromotion) {
      return { promoted: false, reason: `win rate too low (${(m.winRate * 100).toFixed(1)}%)` };
    }

    const champExpectancy = state.global.champion.metrics.expectancy;
    const improvement = champExpectancy !== 0
      ? (m.expectancy - champExpectancy) / Math.abs(champExpectancy)
      : m.expectancy > 0 ? 1 : 0;

    if (improvement < PROMOTION_RULES.minExpectancyImprovement) {
      return { promoted: false, reason: `improvement too small (${(improvement * 100).toFixed(1)}%)` };
    }

    // Promote
    const newChampion: ChampionState = {
      config: challenger.config,
      metrics: challenger.metrics,
      promotedAt: new Date().toISOString(),
      tradeCount: challenger.tradeCount,
    };

    const history = [...state.global.history, newChampion].slice(-PROMOTION_RULES.historyLength);
    state.global.champion = newChampion;
    state.global.challenger = null;
    state.global.history = history;

    return { promoted: true, reason: `expectancy improved ${(improvement * 100).toFixed(1)}%` };
  }

  private tryPromoteSegment(
    mode: string,
    segment: SegmentKey,
    challenger: ChallengerState,
  ): void {
    const segState = this.config[mode].segments[segment];
    if (!segState) return;
    const m = challenger.metrics;

    if (m.tradeCount < PROMOTION_RULES.minTradeCount / 2) return;
    if (m.winRate < PROMOTION_RULES.minWinRateForPromotion) return;

    const champExpectancy = segState.champion.metrics.expectancy;
    const improvement = champExpectancy !== 0
      ? (m.expectancy - champExpectancy) / Math.abs(champExpectancy)
      : m.expectancy > 0 ? 1 : 0;

    if (improvement < PROMOTION_RULES.minExpectancyImprovement) return;

    segState.champion = {
      config: challenger.config,
      metrics: challenger.metrics,
      promotedAt: new Date().toISOString(),
      tradeCount: challenger.tradeCount,
    };
    segState.challenger = null;
  }

  // ── Persistence ───────────────────────────────────────────────

  private ensureMode(mode: string): void {
    if (!this.config[mode]) {
      this.config[mode] = buildDefaultModeState(DEFAULT_MODULE_CONFIG);
    }
  }

  private load(): OptimizerConfig {
    try {
      if (!existsSync(CONFIG_PATH)) return this.buildDefault();
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw) as Partial<OptimizerConfig>;
      const result = this.buildDefault();
      for (const mode of DETERMINISTIC_SCORING_MODES) {
        if (parsed[mode]) result[mode] = { ...result[mode], ...parsed[mode] };
      }
      return result;
    } catch {
      return this.buildDefault();
    }
  }

  private save(): void {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (err) {
      console.error("[Optimizer] Failed to save config:", err);
    }
  }

  private buildDefault(): OptimizerConfig {
    const cfg = {} as OptimizerConfig;
    for (const mode of DETERMINISTIC_SCORING_MODES) {
      cfg[mode] = buildDefaultModeState(DEFAULT_MODULE_CONFIG);
    }
    return cfg;
  }
}

// Singleton
export const ccManager = new ChampionChallengerManager();
