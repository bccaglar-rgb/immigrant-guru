/**
 * Flow Mode Hub V2 — Orchestrator
 *
 * New 14-step pipeline:
 *   1. extractHubInput()
 *   2. classifyFlowRegime()
 *   3. calcMarketQuality()          - Block A
 *   4. calcDirectionQuality()       - Block B
 *   5. calcExecutionQuality()       - Block C
 *   6. calcEdgeQuality()            - Block D
 *   7. evaluateHardGates()
 *   8. calcPenalties()
 *   9. calcFinalScore()             - 4-block composite x multipliers - penalties -> decision
 *   10. validateSide()              - LONG/SHORT rules (included in finalScore)
 *   11. calcEntryZone()             - if PROBE/CONFIRMED
 *   12. calcTpSl()                  - if PROBE/CONFIRMED
 *   13. calcPositionSize()          - score-tiered
 *   14. publishFlowSnapshot()
 */

import type { FlowHubOutput, FlowDecision } from "./types.ts";
import { loadFlowHubConfig } from "./config.ts";
import { extractHubInput } from "./dataExtractor.ts";
import { calculateMarketQuality } from "./coreScoreCalculator.ts";
import { classifyFlowRegime } from "./regimeClassifier.ts";
import { calculateDirectionQuality } from "./biasEngine.ts";
import { calculateExecutionQuality } from "./executionFeasibility.ts";
import { calculateEdgeQuality } from "./expectedEdge.ts";
import { evaluateHardGates } from "./hardGates.ts";
import { calculatePenalties } from "./penaltyEngine.ts";
import { calculateFinalScore } from "./finalScoreEngine.ts";
import { calculateEntryZone } from "./entryZoneEngine.ts";
import { calculateFlowTpSl } from "./tpSlEngine.ts";
import { calculateFlowPositionSize } from "./positionSizer.ts";
import { publishFlowSnapshot } from "./hubPublisher.ts";
import { createHubTradeIdeas } from "../shared/hubIdeaCreator.ts";

interface HubDeps {
  getMarketData: (symbol: string, timeframe: string) => Promise<Record<string, unknown> | null>;
  getScanCandidates: () => Array<{ symbol: string; timeframe: string; mode: string; scorePct: number; pricePrecision?: number }>;
}

export class FlowModeHub {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSnapshot: FlowHubOutput[] = [];
  private cycleCount = 0;

  constructor(private deps: HubDeps) {}

  start(): void {
    const cfg = loadFlowHubConfig();
    if (!cfg.enabled) {
      console.log("[FlowModeHub] Disabled (FLOW_HUB_ENABLED != true)");
      return;
    }
    this.running = true;
    console.log("[FlowModeHub] V2 Started (4-block architecture)");
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log("[FlowModeHub] Stopped");
  }

  getLastSnapshot(): FlowHubOutput[] {
    return this.lastSnapshot;
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const cfg = loadFlowHubConfig();
    const jitter = Math.floor(Math.random() * 4000);
    this.timer = setTimeout(() => this.runCycle(), cfg.intervalMs + jitter);
  }

  private async runCycle(): Promise<void> {
    if (!this.running) return;
    const cfg = loadFlowHubConfig();
    const cycleId = `fhub_${Date.now()}_${++this.cycleCount}`;
    const startMs = Date.now();

    try {
      // 1. Get FLOW candidates from scanner cache
      const candidates = this.deps.getScanCandidates()
        .filter(c => c.mode === "FLOW")
        .sort((a, b) => b.scorePct - a.scorePct)
        .slice(0, cfg.maxCandidates);

      if (candidates.length === 0) {
        this.scheduleNext();
        return;
      }

      const outputs: FlowHubOutput[] = [];

      // 2. Process each candidate through V2 pipeline
      for (const candidate of candidates) {
        try {
          const apiResponse = await this.deps.getMarketData(candidate.symbol, candidate.timeframe);
          if (!apiResponse) continue;

          const price = Number(apiResponse.price_value ?? 0);
          if (price <= 0) continue;

          const output = this.processSingle(
            candidate.symbol,
            candidate.timeframe,
            price,
            apiResponse,
            cycleId,
            candidate.pricePrecision,
          );
          outputs.push(output);
        } catch (err) {
          console.error(`[FlowModeHub] Error processing ${candidate.symbol}:`, err);
        }
      }

      // 3. Sort by adjusted score descending
      outputs.sort((a, b) => b.adjustedScore - a.adjustedScore);

      // 4. Store snapshot
      this.lastSnapshot = outputs;

      // 5. Publish to Redis + DB
      if (!cfg.dryRun) {
        await publishFlowSnapshot(outputs, cycleId);

        // Create trade ideas for tradeable decisions (PROBE + CONFIRMED)
        const hubIdeasCreated = await createHubTradeIdeas(outputs as any, "FLOW", cycleId);
        if (hubIdeasCreated > 0) {
          console.log(`[FlowModeHub] Created ${hubIdeasCreated} trade idea(s) from cycle ${cycleId}`);
        }
      }

      const elapsed = Date.now() - startMs;
      const actionable = outputs.filter(o => o.decision === "PROBE" || o.decision === "CONFIRMED").length;
      const watchlist = outputs.filter(o => o.decision === "WATCHLIST").length;
      console.log(
        `[FlowModeHub] Cycle ${cycleId}: ${candidates.length} candidates -> ${outputs.length} scored, ${actionable} tradeable, ${watchlist} watchlist (${elapsed}ms)`,
      );
    } catch (err) {
      console.error("[FlowModeHub] Cycle error:", err);
    }

    this.scheduleNext();
  }

  private processSingle(
    symbol: string,
    timeframe: string,
    price: number,
    apiResponse: Record<string, unknown>,
    cycleId: string,
    pricePrecision?: number,
  ): FlowHubOutput {
    // 1. Extract raw data
    const input = extractHubInput(symbol, timeframe, price, apiResponse);

    // 2. Classify regime
    const regimeInfo = classifyFlowRegime(input);

    // 3. Block A: Market Quality
    const marketQuality = calculateMarketQuality(input, regimeInfo.regime);

    // 4. Block B: Direction Quality
    const directionQuality = calculateDirectionQuality(input);

    // 5. Block C: Execution Quality
    const executionQuality = calculateExecutionQuality(input);

    // 6. Block D: Edge Quality
    const edgeQuality = calculateEdgeQuality(input, regimeInfo.multiplier, regimeInfo.regime);

    // 7. Hard Gates
    const gates = evaluateHardGates(input, edgeQuality.realizedEdgeProxy, directionQuality.biasRaw);

    // 8. Penalties
    const penalties = calculatePenalties(input);

    // 9-10. Final Score + Decision + Validation
    const final = calculateFinalScore({
      input,
      marketQuality,
      directionQuality,
      executionQuality,
      edgeQuality,
      penalties,
      gates,
      regime: regimeInfo,
    });

    // 11-12. Entry Zone + TP/SL (only for PROBE/CONFIRMED)
    let tpSl: FlowHubOutput["tpSl"] = null;
    if ((final.decision === "PROBE" || final.decision === "CONFIRMED") && final.direction !== "NONE") {
      const entryZone = calculateEntryZone(input, final.direction);
      tpSl = calculateFlowTpSl(
        input,
        final.direction,
        regimeInfo.regime,
        final.adjustedScore,
        edgeQuality.realizedEdgeProxy,
        entryZone,
        pricePrecision,
      );
    }

    // 13. Position Size
    const positionSize = calculateFlowPositionSize(input, final.adjustedScore, regimeInfo, final.decision);

    // Build backward-compat fields
    const compatOutput: FlowHubOutput = {
      symbol,
      timeframe,
      cycleId,
      processedAt: Date.now(),
      price,
      adjustedScore: final.adjustedScore,
      decision: final.decision,
      direction: final.direction,

      // V2 block results
      marketQuality,
      directionQuality,
      executionQuality,
      edgeQuality,
      penalties,
      multipliers: final.multipliers,
      gates,
      regimeInfo,
      tpSl,
      positionSize,
      reasons: final.reasons,

      // Backward compat for hubPublisher + hubIdeaCreator
      coreScore: { total: marketQuality.total },
      bias: {
        score: directionQuality.biasRaw,
        direction: directionQuality.side,
        confidence: Math.abs(directionQuality.biasRaw),
      },
      edge: {
        expectedEdge: edgeQuality.expectedEdgeR,
        riskAdjustedEdge: edgeQuality.realizedEdgeProxy,
        pWin: input.pWin,
        avgWinR: input.avgWinR,
        costR: input.costR,
      },
      penalty: {
        total: penalties.totalPenalty,
        breakdown: {
          execution: penalties.execution.total,
          positioning: penalties.positioning.total,
          regime: penalties.regime.total,
          conflict: penalties.conflict.total,
        },
      },
      regime: {
        regime: regimeInfo.regime,
        multiplier: regimeInfo.multiplier,
        rawScore: regimeInfo.rawScore,
      },
      execution: {
        score: executionQuality.total,
        blocked: false,
      },
      gates_compat: {
        allPassed: gates.allPassed,
        failedGates: [...gates.failedGates, ...gates.blockedGates],
        maxDecision: gates.hardFail ? "NO_TRADE" : gates.softBlock ? "WATCHLIST" : "CONFIRMED",
      },
    };

    return compatOutput;
  }
}
