/**
 * Balanced Mode Hub — Orchestrator (v4: 4-Block Pipeline)
 *
 * Main engine: runs 13-layer pipeline on 30s cycle.
 * Reads BALANCED scan results from SystemScannerService cache + market API.
 *
 * Pipeline:
 *   1. extractHubInput()           — flat API → typed HubInput
 *   2. classifyRegime()            — 5 regime types
 *   3. calculateBias()             — directional bias (-1 to +1)
 *   4. calculateExecutionFeasibility() — execution feasibility check
 *   5. calculateExpectedEdge()     — edge + edgeNetR
 *   6. calculateBlockScores()      — 4-block (MQ/DQ/EQ/EdgeQ)
 *   7. checkHardGates()            — hard decision caps
 *   8. checkSoftBlocks()           — contextual caps
 *   9. calculatePenaltyGroups()    — 4 penalty groups
 *  10. calculateFinalScore()       — multi-multiplier + edge-conditional
 *  11. calculateEntryZone()        — code-computed entry zone
 *  12. calculateTpSl()             — structural stop + margin clamp
 *  13. calculatePositionSize()     — score-tiered sizing
 */

import type { HubOutput } from "./types.ts";
import { loadHubConfig } from "./config.ts";
import { extractHubInput } from "./dataExtractor.ts";
import { classifyRegime } from "./regimeClassifier.ts";
import { calculateBias } from "./biasEngine.ts";
import { calculateExecutionFeasibility } from "./executionFeasibility.ts";
import { calculateExpectedEdge } from "./expectedEdge.ts";
import { calculateBlockScores } from "./coreScoreCalculator.ts";
import { checkHardGates, checkSoftBlocks, checkDirectionAlignment } from "./hardGates.ts";
import { calculatePenaltyGroups } from "./penaltyEngine.ts";
import { calculateFinalScore, detectSession } from "./finalScoreEngine.ts";
import { calculateEntryZone } from "./entryZoneEngine.ts";
import { calculateTpSl } from "./tpSlEngine.ts";
import { calculatePositionSize } from "./positionSizer.ts";
import { publishSnapshot } from "./hubPublisher.ts";
import { createHubTradeIdeas } from "../shared/hubIdeaCreator.ts";

interface HubDeps {
  getMarketData: (symbol: string, timeframe: string) => Promise<Record<string, unknown> | null>;
  getScanCandidates: () => Array<{ symbol: string; timeframe: string; mode: string; scorePct: number; pricePrecision?: number }>;
}

export class BalancedModeHub {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSnapshot: HubOutput[] = [];
  private cycleCount = 0;

  private deps: HubDeps;
  constructor(deps: HubDeps) { this.deps = deps; }

  start(): void {
    const cfg = loadHubConfig();
    if (!cfg.enabled) {
      console.log("[BalancedModeHub] Disabled (BALANCED_HUB_ENABLED != true)");
      return;
    }
    this.running = true;
    console.log(`[BalancedModeHub] V4 Started (4-block scoring, interval=${cfg.intervalMs}ms, maxCandidates=${cfg.maxCandidates}, dryRun=${cfg.dryRun})`);
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log("[BalancedModeHub] Stopped");
  }

  getLastSnapshot(): HubOutput[] {
    return this.lastSnapshot;
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const cfg = loadHubConfig();
    const jitter = Math.floor(Math.random() * 5000);
    this.timer = setTimeout(() => this.runCycle(), cfg.intervalMs + jitter);
  }

  private async runCycle(): Promise<void> {
    if (!this.running) return;
    const cfg = loadHubConfig();
    const cycleId = `bhub_${Date.now()}_${++this.cycleCount}`;
    const startMs = Date.now();

    try {
      // 1. Get BALANCED candidates from scanner cache
      const candidates = this.deps.getScanCandidates()
        .filter(c => c.mode === "BALANCED")
        .sort((a, b) => b.scorePct - a.scorePct)
        .slice(0, cfg.maxCandidates);

      if (candidates.length === 0) {
        this.scheduleNext();
        return;
      }

      const outputs: HubOutput[] = [];
      const session = detectSession();

      // 2. Process each candidate through 13-layer pipeline
      for (const candidate of candidates) {
        try {
          const apiResponse = await this.deps.getMarketData(candidate.symbol, candidate.timeframe);
          if (!apiResponse) {
            console.log(`[BalancedModeHub] No data for ${candidate.symbol}`);
            continue;
          }

          const price = Number(apiResponse.price_value ?? 0);
          if (price <= 0) {
            console.log(`[BalancedModeHub] No price for ${candidate.symbol}: price_value=${apiResponse.price_value}`);
            continue;
          }

          const output = this.processSingle(
            candidate.symbol,
            candidate.timeframe,
            price,
            apiResponse,
            cycleId,
            session,
            candidate.pricePrecision,
          );
          outputs.push(output);
        } catch (err) {
          console.error(`[BalancedModeHub] Error processing ${candidate.symbol}:`, err);
        }
      }

      // 3. Sort by adjusted score descending
      outputs.sort((a, b) => b.adjustedScore - a.adjustedScore);

      // 4. Store snapshot
      this.lastSnapshot = outputs;

      // 5. Publish to Redis + DB
      if (!cfg.dryRun) {
        await publishSnapshot(outputs, cycleId);

        // Create trade ideas for tradeable hub decisions (CONFIRMED + PROBE)
        const hubIdeasCreated = await createHubTradeIdeas(outputs as any, "BALANCED", cycleId);
        if (hubIdeasCreated > 0) {
          console.log(`[BalancedModeHub] Created ${hubIdeasCreated} trade idea(s) from cycle ${cycleId}`);
        }
      }

      const elapsed = Date.now() - startMs;
      const confirmed = outputs.filter(o => o.decision === "CONFIRMED").length;
      const probes = outputs.filter(o => o.decision === "PROBE").length;
      const watches = outputs.filter(o => o.decision === "WATCHLIST").length;
      const noTrades = outputs.filter(o => o.decision === "NO_TRADE").length;
      console.log(
        `[BalancedModeHub] Cycle ${cycleId}: ${candidates.length} candidates → ${confirmed} confirmed, ${probes} probe, ${watches} watch, ${noTrades} no_trade (${elapsed}ms) [session=${session}]`,
      );
    } catch (err) {
      console.error("[BalancedModeHub] Cycle error:", err);
    }

    this.scheduleNext();
  }

  /** Process a single symbol through the full 13-layer pipeline */
  private processSingle(
    symbol: string,
    timeframe: string,
    price: number,
    apiResponse: Record<string, unknown>,
    cycleId: string,
    session: string,
    pricePrecision?: number,
  ): HubOutput {
    // Layer 1: Extract data from flat API response
    const input = extractHubInput(symbol, timeframe, price, apiResponse);

    // Layer 2: Regime Classification
    const regime = classifyRegime(input);

    // Layer 3: Bias/Direction
    const bias = calculateBias(input);

    // Layer 4: Execution Feasibility
    const execution = calculateExecutionFeasibility(input);

    // Layer 5: Expected Edge (returns edgeNetR for decision gating)
    const edge = calculateExpectedEdge(input, regime.multiplier);

    // Layer 6: 4-Block Scores (MQ/DQ/EQ/EdgeQ)
    const blockScores = calculateBlockScores(input, edge.edgeNetR);

    // Layer 7: Hard Gates
    const gates = checkHardGates(input, edge);

    // Layer 8: Soft Blocks
    const softBlocks = checkSoftBlocks(input);

    // Layer 8b: Direction Alignment Gate — dont trade against HTF trend
    const dirGate = checkDirectionAlignment(input, bias.direction);
    if (dirGate.triggered) {
      softBlocks.triggered = true;
      softBlocks.reasons.push(...dirGate.reasons);
      const DORDER = ["NO_TRADE", "WATCHLIST", "PROBE", "CONFIRMED"];
      const curIdx = DORDER.indexOf(softBlocks.maxDecision);
      const gateIdx = DORDER.indexOf(dirGate.maxDecision);
      if (gateIdx < curIdx) softBlocks.maxDecision = dirGate.maxDecision as any;
    }

    // Layer 9: 4 Penalty Groups
    const penalty = calculatePenaltyGroups(input, bias);

    // Layer 10: Final Score + Decision
    const final = calculateFinalScore({
      input, blockScores, regime, bias, edge, gates, softBlocks, penalty, session,
    });

    // Layer 11: Code-computed Entry Zone
    const entryZone = final.direction !== "NONE"
      ? calculateEntryZone(input, final.direction, pricePrecision)
      : input.entryZone;

    // Layer 12: TP/SL (structural stop + margin clamp)
    const tpSl = final.direction !== "NONE"
      ? calculateTpSl(input, final.direction, regime.regime, final.adjustedScore, entryZone, pricePrecision)
      : null;

    // Layer 13: Position Sizing (score-tiered)
    const positionSize = calculatePositionSize(input, final.adjustedScore, final.decision);

    return {
      symbol,
      timeframe,
      mode: "BALANCED",
      price,
      blockScores,
      regime,
      bias,
      execution,
      edge,
      gates,
      softBlocks,
      penalty,
      adjustedScore: final.adjustedScore,
      decision: final.decision,
      direction: final.direction,
      tpSl,
      positionSize,
      reasons: final.reasons,
      processedAt: Date.now(),
      cycleId,
      // Backward compat for hubIdeaCreator
      coreScore: { total: blockScores.total },
    };
  }
}
