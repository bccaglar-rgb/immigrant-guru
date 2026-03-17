import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TradeIdeaStore } from "./tradeIdeaStore.ts";
import { SCORING_MODES } from "./scoringMode.ts";
import type { ScoringMode } from "./scoringMode.ts";
import { optimizeRR } from "./rrOptimizer.ts";
import { subscribeToTick } from "./tickOrchestrator.ts";

// ---------------------------------------------------------------------------
// Config path
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
// server/src/services/ → go up 2 levels → server/data/
const DATA_DIR = join(dirname(__filename), "../../data");
const CONFIG_PATH = join(DATA_DIR, "rr_config.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RRModeConfig {
  currentRR: number;
  recommendedRR: number;
  totalR: number;
  winRate: number;
  tradeCount: number;
  updatedAt: string;
}

export type RRConfig = Record<ScoringMode, RRModeConfig>;

const DEFAULT_RR = 2.0;

function defaultConfig(): RRConfig {
  const cfg = {} as RRConfig;
  for (const mode of SCORING_MODES) {
    cfg[mode] = {
      currentRR: DEFAULT_RR,
      recommendedRR: DEFAULT_RR,
      totalR: 0,
      winRate: 0,
      tradeCount: 0,
      updatedAt: new Date().toISOString(),
    };
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// AdaptiveRRService
// ---------------------------------------------------------------------------

export class AdaptiveRRService {
  private config: RRConfig = defaultConfig();
  private store = new TradeIdeaStore();
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubTick: (() => void) | null = null;

  constructor() {
    this.loadConfig();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Returns the current (live) RR multiplier for a given scoring mode. */
  getRR(mode: ScoringMode): number {
    return this.config[mode]?.currentRR ?? DEFAULT_RR;
  }

  /** Returns the full config for API/UI consumption. */
  getConfig(): RRConfig {
    return { ...this.config };
  }

  /** Start the daily optimizer. Call once on server startup (IS_PRIMARY only). */
  start(): void {
    // Warm-up: run after 30s so the DB is fully ready
    setTimeout(() => {
      this.runOptimizer().catch((err) =>
        console.error("[AdaptiveRR] Warm-up optimizer error:", err),
      );
    }, 30_000);

    // Subscribe to Global Tick Orchestrator (tick:24h)
    // Falls back to local setInterval if orchestrator not yet running
    this.unsubTick = subscribeToTick(["tick:24h"], () => {
      this.runOptimizer().catch((err) =>
        console.error("[AdaptiveRR] tick:24h optimizer error:", err),
      );
    });

    // Fallback local timer (safeguard if Redis pub/sub is unavailable)
    this.timer = setInterval(
      () => {
        this.runOptimizer().catch((err) =>
          console.error("[AdaptiveRR] Daily optimizer error:", err),
        );
      },
      24 * 60 * 60 * 1000,
    );
  }

  stop(): void {
    if (this.unsubTick) { this.unsubTick(); this.unsubTick = null; }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ── Optimizer ─────────────────────────────────────────────────────────────

  async runOptimizer(): Promise<void> {
    try {
      console.log("[AdaptiveRR] Running RR optimizer...");

      const allResolved = await this.store.listIdeas({
        statuses: ["RESOLVED"],
        limit: 10000,
      });

      // Group by scoring mode
      const byMode = new Map<ScoringMode, typeof allResolved>();
      for (const mode of SCORING_MODES) byMode.set(mode, []);
      for (const idea of allResolved) {
        byMode.get(idea.scoring_mode)?.push(idea);
      }

      const updated = { ...this.config };

      for (const mode of SCORING_MODES) {
        const trades = byMode.get(mode) ?? [];
        const currentRR = this.config[mode]?.currentRR ?? DEFAULT_RR;
        const result = optimizeRR(trades, currentRR);

        console.log(
          `[AdaptiveRR] ${mode}: trades=${result.tradeCount} bestRR=${result.bestRR} totalR=${result.totalR.toFixed(2)} winRate=${(result.winRate * 100).toFixed(1)}% ${result.changed ? "(UPDATED)" : "(no change)"}`,
        );

        updated[mode] = {
          currentRR: result.bestRR,
          recommendedRR: result.bestRR,
          totalR: result.totalR,
          winRate: result.winRate,
          tradeCount: result.tradeCount,
          updatedAt: new Date().toISOString(),
        };
      }

      this.config = updated;
      this.saveConfig();
      console.log("[AdaptiveRR] Optimizer complete.");
    } catch (err) {
      console.error("[AdaptiveRR] Optimizer failed:", err);
    }
  }

  // ── Config I/O ────────────────────────────────────────────────────────────

  private loadConfig(): void {
    try {
      if (!existsSync(CONFIG_PATH)) {
        this.config = defaultConfig();
        this.saveConfig();
        return;
      }
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw) as Partial<RRConfig>;
      const config = defaultConfig();
      for (const mode of SCORING_MODES) {
        if (parsed[mode]) {
          config[mode] = { ...config[mode], ...parsed[mode] };
        }
      }
      this.config = config;
    } catch {
      this.config = defaultConfig();
    }
  }

  private saveConfig(): void {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (err) {
      console.error("[AdaptiveRR] Failed to save config:", err);
    }
  }
}

// Singleton
export const adaptiveRR = new AdaptiveRRService();
