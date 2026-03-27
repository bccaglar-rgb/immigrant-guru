import { TradeIdeaStore } from "../tradeIdeaStore.ts";
import { SCORING_MODES, DETERMINISTIC_SCORING_MODES, type ScoringMode } from "../scoringMode.ts";
import { groupTradesByModeAndSegment, groupTradesByMode } from "./segmentAnalyzer.ts";
import { optimizeModeGlobal, optimizeModeSegments } from "./moduleOptimizer.ts";
import { ccManager } from "./championChallengerManager.ts";
import type { SegmentKey } from "./types.ts";
import { subscribeToTick } from "../tickOrchestrator.ts";

const DAILY_MS = 24 * 60 * 60 * 1000;
const WARMUP_MS = 45_000; // 45s to let DB fully warm up

export class OptimizationScheduler {
  private store = new TradeIdeaStore();
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubTick: (() => void) | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    console.log("[Optimizer] Scheduler started. First run in 45s.");

    setTimeout(() => {
      this.run().catch((err) => console.error("[Optimizer] Warm-up run failed:", err));
    }, WARMUP_MS);

    // Subscribe to Global Tick Orchestrator (tick:24h)
    this.unsubTick = subscribeToTick(["tick:24h"], () => {
      this.run().catch((err) => console.error("[Optimizer] tick:24h run failed:", err));
    });

    // Fallback local timer (safeguard if Redis pub/sub is unavailable)
    this.timer = setInterval(() => {
      this.run().catch((err) => console.error("[Optimizer] Daily run failed:", err));
    }, DAILY_MS);
  }

  stop(): void {
    if (this.unsubTick) { this.unsubTick(); this.unsubTick = null; }
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.started = false;
  }

  async run(): Promise<void> {
    // DISABLED: tracking only — no parameter changes until manual review
    console.log("[Optimizer] DISABLED — tracking only, skipping optimization run");
    return;
    try {
      console.log("[Optimizer] Starting optimization run...");

      const allResolved = await this.store.listIdeas({
        statuses: ["RESOLVED"],
        limit: 10000,
      });

      console.log(`[Optimizer] Loaded ${allResolved.length} resolved trades.`);

      // Group by mode (global)
      const byMode = groupTradesByMode(allResolved);

      // Group by mode + segment (needs DB snapshots)
      const byModeAndSegment = await groupTradesByModeAndSegment(allResolved);

      for (const mode of DETERMINISTIC_SCORING_MODES) {
        const trades = byMode.get(mode) ?? [];
        const modeState = ccManager.getModeState(mode);
        const currentChampion = modeState?.global.champion;

        if (!currentChampion) {
          ccManager.markRun(mode);
          console.log(`[Optimizer] ${mode}: no state — skipping.`);
          continue;
        }

        // ── Global optimization ──
        const globalChallenger = optimizeModeGlobal(trades, currentChampion);
        ccManager.setGlobalChallenger(mode, globalChallenger);

        if (globalChallenger) {
          console.log(
            `[Optimizer] ${mode} global challenger: RR=${globalChallenger.config.rr} ` +
            `slBuf=${globalChallenger.config.slBufferFactor} ` +
            `expectancy=${globalChallenger.metrics.expectancy.toFixed(3)} ` +
            `trades=${globalChallenger.tradeCount}`,
          );
        } else {
          console.log(`[Optimizer] ${mode} global: no improvement (trades=${trades.length})`);
        }

        // ── Segment optimization ──
        const segmentMap = byModeAndSegment.get(mode);
        if (segmentMap && segmentMap.size > 0) {
          // Build trades-only map by segment
          const segTradesMap = new Map<SegmentKey, import("../tradeIdeaTypes.ts").TradeIdeaRecord[]>();
          for (const [seg, items] of segmentMap) {
            segTradesMap.set(seg, items.map((i) => i.trade));
          }

          const currentSegChampions = Object.fromEntries(
            Object.entries(modeState?.segments ?? {}).map(([k, v]) => [k, v.champion]),
          );

          const segChallengerMap = optimizeModeSegments(segTradesMap, currentChampion, currentSegChampions);

          for (const [segment, challenger] of segChallengerMap) {
            ccManager.setSegmentChallenger(mode, segment, challenger);
            if (challenger) {
              console.log(
                `[Optimizer] ${mode}/${segment} challenger: RR=${challenger.config.rr} ` +
                `expectancy=${challenger.metrics.expectancy.toFixed(3)} ` +
                `trades=${challenger.tradeCount}`,
              );
            }
          }
        }

        ccManager.markRun(mode);
      }

      // Evaluate promotions
      const promotions = ccManager.evaluatePromotions();
      for (const p of promotions) {
        if (p.promoted) {
          console.log(`[Optimizer] PROMOTED ${p.mode}: ${p.reason}`);
        }
      }

      console.log("[Optimizer] Run complete.");
    } catch (err) {
      console.error("[Optimizer] Run error:", err);
    }
  }
}

export const optimizationScheduler = new OptimizationScheduler();
