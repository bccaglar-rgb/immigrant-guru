/**
 * Optimizer Stats API — P1 through P10
 */
import type { Express } from "express";
import type { ModePerformanceTracker } from "../services/optimizer/modePerformanceTracker.ts";
import type { TradeOutcomeAttributor } from "../services/optimizer/tradeOutcomeAttributor.ts";
import type { DynamicSlTpOptimizer } from "../services/optimizer/dynamicSlTpOptimizer.ts";
import type { RegimeParameterEngine } from "../services/optimizer/regimeParameterEngine.ts";
import type { ConfidenceCalibrator } from "../services/optimizer/confidenceCalibrator.ts";
import type { SelfThrottleEngine } from "../services/optimizer/selfThrottleEngine.ts";
import type { FeatureWeightTuner } from "../services/optimizer/featureWeightTuner.ts";

export function registerOptimizerStatsRoutes(
  app: Express, mt: ModePerformanceTracker, at: TradeOutcomeAttributor,
  sl: DynamicSlTpOptimizer, re: RegimeParameterEngine,
  cc: ConfidenceCalibrator, th: SelfThrottleEngine, fw: FeatureWeightTuner,
): void {
  const ts = () => new Date().toISOString();
  app.get("/api/optimizer/mode-performance", (_r, s) => s.json({ ok: true, modes: mt.getAllStats(), ts: ts() }));
  app.get("/api/optimizer/attribution-summary", async (r, s) => { const h = Math.min(168, Math.max(1, Number(r.query.hours ?? 24))); s.json({ ok: true, ...await at.getRecentStats(h), hours: h, ts: ts() }); });
  app.get("/api/optimizer/sl-tp-params", (_r, s) => s.json({ ok: true, params: sl.getAllParams(), lastOptimized: sl.getLastOptimized(), ts: ts() }));
  app.get("/api/optimizer/regime", (_r, s) => s.json({ ok: true, ...re.getSummary(), ts: ts() }));
  app.get("/api/optimizer/calibration", (_r, s) => s.json({ ok: true, bands: cc.getBands(), wellCalibrated: cc.isWellCalibrated(), lastCalibrated: cc.getLastCalibrated(), ts: ts() }));
  app.get("/api/optimizer/throttle", (_r, s) => s.json({ ok: true, ...th.getState(), ts: ts() }));
  app.get("/api/optimizer/feature-weights", (_r, s) => s.json({ ok: true, weights: fw.getAllWeights(), lastTuned: fw.getLastTuned(), ts: ts() }));
  app.get("/api/optimizer/health", async (r, s) => {
    const h = Math.min(168, Math.max(1, Number(r.query.hours ?? 24)));
    const a = await at.getRecentStats(h); const t = th.getState();
    s.json({ ok: true, modules: {
      p1: { active: true, throttled: mt.getAllStats().filter((m) => m.throttled).map((m) => m.mode) },
      p2: { active: true, trades: a.total, wins: a.wins, losses: a.losses },
      p3: { active: true, lastOpt: sl.getLastOptimized(), params: sl.getAllParams().length },
      p4: { active: true, regime: re.getSummary().currentRegime, memory: re.getSummary().memorySize },
      p5: { active: true }, p6: { active: true, calibrated: cc.isWellCalibrated() },
      p7: { active: true, throttle: t.globalThrottle, boost: t.scoreBoost, disabled: t.disabledModes },
      p9: { active: true, weights: fw.getAllWeights().length, lastTuned: fw.getLastTuned() },
      p10: { active: true },
    }, ts: ts() });
  });
}
