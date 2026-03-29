/**
 * Aggressive Mode Hub V2 — Orchestrator
 * Same 14-step pipeline as FLOW, uses AGG types and 3 TP levels
 */

import type { AggHubOutput, AggDecision } from "./types.ts";
import { loadAggHubConfig } from "./config.ts";
import { extractHubInput } from "./dataExtractor.ts";
import { calculateMarketQuality } from "./coreScoreCalculator.ts";
import { classifyAggRegime } from "./regimeClassifier.ts";
import { calculateDirectionQuality } from "./biasEngine.ts";
import { calculateExecutionQuality } from "./executionFeasibility.ts";
import { calculateEdgeQuality } from "./expectedEdge.ts";
import { evaluateHardGates } from "./hardGates.ts";
import { calculatePenalties } from "./penaltyEngine.ts";
import { calculateFinalScore } from "./finalScoreEngine.ts";
import { calculateEntryZone } from "./entryZoneEngine.ts";
import { calculateAggTpSl } from "./tpSlEngine.ts";
import { calculateAggPositionSize } from "./positionSizer.ts";
import { publishAggSnapshot } from "./hubPublisher.ts";
import { createHubTradeIdeas } from "../shared/hubIdeaCreator.ts";

interface HubDeps {
  getMarketData: (symbol: string, timeframe: string) => Promise<Record<string, unknown> | null>;
  getScanCandidates: () => Array<{ symbol: string; timeframe: string; mode: string; scorePct: number; pricePrecision?: number }>;
}

export class AggModeHub {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSnapshot: AggHubOutput[] = [];
  private cycleCount = 0;

  private deps: HubDeps;
  constructor(deps: HubDeps) { this.deps = deps; }

  start(): void {
    const cfg = loadAggHubConfig();
    if (!cfg.enabled) {
      console.log("[AggModeHub] Disabled (AGG_HUB_ENABLED !== true)");
      return;
    }
    this.running = true;
    console.log("[AggModeHub] V2 Started (4-block architecture, 3 TP levels)");
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    console.log("[AggModeHub] Stopped");
  }

  getLastSnapshot(): AggHubOutput[] {
    return this.lastSnapshot;
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const cfg = loadAggHubConfig();
    const jitter = Math.floor(Math.random() * 3000);
    this.timer = setTimeout(() => this.runCycle(), cfg.intervalMs + jitter);
  }

  private async runCycle(): Promise<void> {
    if (!this.running) return;
    const cfg = loadAggHubConfig();
    const cycleId = `ahub_${Date.now()}_${++this.cycleCount}`;
    const startMs = Date.now();

    try {
      const candidates = this.deps.getScanCandidates()
        .filter(c => c.mode === "AGGRESSIVE")
        .sort((a, b) => b.scorePct - a.scorePct)
        .slice(0, cfg.maxCandidates);

      if (candidates.length === 0) { this.scheduleNext(); return; }

      const outputs: AggHubOutput[] = [];

      for (const candidate of candidates) {
        try {
          const apiResponse = await this.deps.getMarketData(candidate.symbol, candidate.timeframe);
          if (!apiResponse) continue;
          const price = Number(apiResponse.price_value ?? 0);
          if (price <= 0) continue;

          const output = this.processSingle(
            candidate.symbol, candidate.timeframe, price,
            apiResponse, cycleId, candidate.pricePrecision,
          );
          outputs.push(output);
        } catch (err) {
          console.error(`[AggModeHub] Error processing ${candidate.symbol}:`, err);
        }
      }

      outputs.sort((a, b) => b.adjustedScore - a.adjustedScore);
      this.lastSnapshot = outputs;

      if (!cfg.dryRun) {
        await publishAggSnapshot(outputs, cycleId);
        const hubIdeasCreated = await createHubTradeIdeas(outputs as any, "AGGRESSIVE", cycleId);
        if (hubIdeasCreated > 0) {
          console.log(`[AggModeHub] Created ${hubIdeasCreated} trade idea(s) from cycle ${cycleId}`);
        }
      }

      const elapsed = Date.now() - startMs;
      const actionable = outputs.filter(o => o.decision === "PROBE" || o.decision === "CONFIRMED").length;
      const watchlist = outputs.filter(o => o.decision === "WATCHLIST").length;
      console.log(
        `[AggModeHub] Cycle ${cycleId}: ${candidates.length} candidates -> ${outputs.length} scored, ${actionable} tradeable, ${watchlist} watchlist (${elapsed}ms)`,
      );
    } catch (err) {
      console.error("[AggModeHub] Cycle error:", err);
    }

    this.scheduleNext();
  }

  private processSingle(
    symbol: string, timeframe: string, price: number,
    apiResponse: Record<string, unknown>, cycleId: string, pricePrecision?: number,
  ): AggHubOutput {
    const input = extractHubInput(symbol, timeframe, price, apiResponse);
    const regimeInfo = classifyAggRegime(input);
    const marketQuality = calculateMarketQuality(input, regimeInfo.regime);
    const directionQuality = calculateDirectionQuality(input);
    const executionQuality = calculateExecutionQuality(input);
    const edgeQuality = calculateEdgeQuality(input, regimeInfo.multiplier, regimeInfo.regime);
    const gates = evaluateHardGates(input, edgeQuality.realizedEdgeProxy, directionQuality.biasRaw);
    const penalties = calculatePenalties(input);

    const final = calculateFinalScore({
      input, marketQuality, directionQuality, executionQuality, edgeQuality,
      penalties, gates, regime: regimeInfo,
    });

    let tpSl: AggHubOutput["tpSl"] = null;
    if ((final.decision === "PROBE" || final.decision === "CONFIRMED") && final.direction !== "NONE") {
      const entryZone = calculateEntryZone(input, final.direction);
      tpSl = calculateAggTpSl(
        input, final.direction, regimeInfo.regime, final.adjustedScore,
        edgeQuality.realizedEdgeProxy, entryZone, pricePrecision,
      );
    }

    const positionSize = calculateAggPositionSize(input, final.adjustedScore, regimeInfo, final.decision);

    return {
      symbol, timeframe, cycleId, processedAt: Date.now(), price,
      adjustedScore: final.adjustedScore, decision: final.decision, direction: final.direction,
      marketQuality, directionQuality, executionQuality, edgeQuality,
      penalties, multipliers: final.multipliers, gates, regimeInfo, tpSl, positionSize,
      reasons: final.reasons,
      // Backward compat
      coreScore: { total: marketQuality.total },
      bias: { score: directionQuality.biasRaw, direction: directionQuality.side, confidence: Math.abs(directionQuality.biasRaw) },
      edge: { expectedEdge: edgeQuality.expectedEdgeR, riskAdjustedEdge: edgeQuality.realizedEdgeProxy, pWin: input.pWin, avgWinR: input.avgWinR, costR: input.costR },
      penalty: { total: penalties.totalPenalty, breakdown: { execution: penalties.execution.total, positioning: penalties.positioning.total, regime: penalties.regime.total, conflict: penalties.conflict.total } },
      regime: { regime: regimeInfo.regime, multiplier: regimeInfo.multiplier, rawScore: regimeInfo.rawScore },
      execution: { score: executionQuality.total, blocked: false },
      gates_compat: { allPassed: gates.allPassed, failedGates: [...gates.failedGates, ...gates.blockedGates], maxDecision: gates.hardFail ? "NO_TRADE" : gates.softBlock ? "WATCHLIST" : "CONFIRMED" },
    };
  }
}
