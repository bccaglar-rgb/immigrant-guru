/**
 * Capital Guard Mode Hub — Orchestrator (v4: 5-Block Pipeline)
 *
 * Main engine: runs 14-layer pipeline on 45s cycle.
 * Reads CAPITAL_GUARD scan results from SystemScannerService cache + market API.
 *
 * Pipeline:
 *   1. extractHubInput()                — flat API → typed HubInput
 *   2. classifyCgRegime()               — 5 regime types
 *   3. calculateCgBias()                — directional bias (-1 to +1), threshold 0.26
 *   4. calculateCgExecutionFeasibility() — execution feasibility check
 *   5. calculateExpectedEdge()          — edge + edgeNetR
 *   6. calculateCapitalProtection()     — CP score (CG exclusive 5th block)
 *   7. calculateCgBlockScores()         — 5-block (MQ/DQ/EQ/EdgeQ/CP)
 *   8. checkCgHardGates()               — hard decision caps (uses CP)
 *   9. checkCgSoftBlocks()              — contextual caps
 *  10. calculateCgPenaltyGroups()       — 5 penalty groups
 *  11. calculateCgFinalScore()          — multi-multiplier + edge+CP conditional
 *  12. calculateCgEntryZone()           — narrower code-computed entry zone
 *  13. calculateCgTpSl()                — structural stop + narrow margin clamp
 *  14. calculateCgPositionSize()        — score-tiered sizing (most conservative)
 */

import type { CgHubOutput, CgHubDecision } from "./types.ts";
import { loadCgHubConfig } from "./config.ts";
import { extractHubInput } from "./dataExtractor.ts";
import { classifyCgRegime } from "./regimeClassifier.ts";
import { calculateCgBias } from "./biasEngine.ts";
import { calculateCgExecutionFeasibility } from "./executionFeasibility.ts";
import { calculateExpectedEdge } from "./expectedEdge.ts";
import { calculateCapitalProtection } from "./capitalProtection.ts";
import { calculateCgBlockScores } from "./coreScoreCalculator.ts";
import { checkCgHardGates, checkCgSoftBlocks, checkCgDirectionAlignment } from "./hardGates.ts";
import { calculateCgPenaltyGroups } from "./penaltyEngine.ts";
import { calculateCgFinalScore, detectSession } from "./finalScoreEngine.ts";
import { calculateCgEntryZone } from "./entryZoneEngine.ts";
import { calculateCgTpSl } from "./tpSlEngine.ts";
import { calculateCgPositionSize } from "./positionSizer.ts";
import { publishCgSnapshot } from "./hubPublisher.ts";
import { createHubTradeIdeas } from "../shared/hubIdeaCreator.ts";

interface HubDeps {
  getMarketData: (symbol: string, timeframe: string) => Promise<Record<string, unknown> | null>;
  getScanCandidates: () => Array<{ symbol: string; timeframe: string; mode: string; scorePct: number; pricePrecision?: number }>;
}

export class CgModeHub {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSnapshot: CgHubOutput[] = [];
  private cycleCount = 0;

  private deps: HubDeps;
  constructor(deps: HubDeps) { this.deps = deps; }

  start(): void {
    const cfg = loadCgHubConfig();
    if (!cfg.enabled) {
      console.log("[CgModeHub] Disabled (CG_HUB_ENABLED != true)");
      return;
    }
    this.running = true;
    console.log(
      `[CgModeHub] V4 Started (5-block scoring, interval=${cfg.intervalMs}ms, maxCandidates=${cfg.maxCandidates}, dryRun=${cfg.dryRun})`,
    );
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log("[CgModeHub] Stopped");
  }

  getLastSnapshot(): CgHubOutput[] {
    return this.lastSnapshot;
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const cfg = loadCgHubConfig();
    const jitter = Math.floor(Math.random() * 5000);
    this.timer = setTimeout(() => this.runCycle(), cfg.intervalMs + jitter);
  }

  private async runCycle(): Promise<void> {
    if (!this.running) return;
    const cfg = loadCgHubConfig();
    const cycleId = `chub_${Date.now()}_${++this.cycleCount}`;
    const startMs = Date.now();

    try {
      // 1. Get CAPITAL_GUARD candidates from scanner cache
      const candidates = this.deps.getScanCandidates()
        .filter(c => c.mode === "CAPITAL_GUARD")
        .sort((a, b) => b.scorePct - a.scorePct)
        .slice(0, cfg.maxCandidates);

      if (candidates.length === 0) {
        this.scheduleNext();
        return;
      }

      const outputs: CgHubOutput[] = [];
      const session = detectSession();

      // 2. Process each candidate through 14-layer pipeline
      for (const candidate of candidates) {
        try {
          const apiResponse = await this.deps.getMarketData(candidate.symbol, candidate.timeframe);
          if (!apiResponse) {
            console.log(`[CgModeHub] No data for ${candidate.symbol}`);
            continue;
          }

          const price = Number(apiResponse.price_value ?? 0);
          if (price <= 0) {
            console.log(`[CgModeHub] No price for ${candidate.symbol}: price_value=${apiResponse.price_value}`);
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
          console.error(`[CgModeHub] Error processing ${candidate.symbol}:`, err);
        }
      }

      // 3. Sort by adjusted score descending
      outputs.sort((a, b) => b.adjustedScore - a.adjustedScore);

      // 4. Store snapshot
      this.lastSnapshot = outputs;

      // 5. Publish to Redis + DB
      if (!cfg.dryRun) {
        await publishCgSnapshot(outputs, cycleId);

        // Create trade ideas for tradeable CG decisions (CONFIRMED + PROBE)
        const hubIdeasCreated = await createHubTradeIdeas(outputs as any, "CAPITAL_GUARD", cycleId);
        if (hubIdeasCreated > 0) {
          console.log(`[CgModeHub] Created ${hubIdeasCreated} trade idea(s) from cycle ${cycleId}`);
        }
      }

      const elapsed = Date.now() - startMs;
      const confirmed = outputs.filter(o => o.decision === "CONFIRMED").length;
      const probes = outputs.filter(o => o.decision === "PROBE").length;
      const watches = outputs.filter(o => o.decision === "WATCHLIST").length;
      const noTrades = outputs.filter(o => o.decision === "NO_TRADE").length;
      console.log(
        `[CgModeHub] Cycle ${cycleId}: ${candidates.length} candidates → ${confirmed} confirmed, ${probes} probe, ${watches} watch, ${noTrades} no_trade (${elapsed}ms) [session=${session}]`,
      );
    } catch (err) {
      console.error("[CgModeHub] Cycle error:", err);
    }

    this.scheduleNext();
  }

  /** Process a single symbol through the full 14-layer pipeline */
  private processSingle(
    symbol: string,
    timeframe: string,
    price: number,
    apiResponse: Record<string, unknown>,
    cycleId: string,
    session: string,
    pricePrecision?: number,
  ): CgHubOutput {
    // Layer 1: Extract data from flat API response
    const input = extractHubInput(symbol, timeframe, price, apiResponse);

    // Layer 2: Regime Classification (harsh multipliers)
    const regime = classifyCgRegime(input);

    // Layer 3: Bias/Direction (threshold 0.26)
    const bias = calculateCgBias(input);

    // Layer 4: Execution Feasibility (threshold 0.28)
    const execution = calculateCgExecutionFeasibility(input);

    // Layer 5: Expected Edge (returns edgeNetR for decision gating)
    const edge = calculateExpectedEdge(input, regime.multiplier);

    // Layer 6: Capital Protection Score (CG exclusive 5th block)
    const capitalProtection = calculateCapitalProtection(input);

    // Layer 7: 5-Block Scores (MQ/DQ/EQ/EdgeQ/CP)
    const blockScores = calculateCgBlockScores(input, edge.edgeNetR, capitalProtection);

    // Layer 8: Hard Gates (uses CP for CG-specific gates)
    const gates = checkCgHardGates(input, edge, capitalProtection);

    // Layer 9: Soft Blocks
    const softBlocks = checkCgSoftBlocks(input);

    // Layer 9b: Direction Alignment Gate (CG exclusive — never trade against HTF trend)
    const directionGate = checkCgDirectionAlignment(input, bias.direction);
    // Merge direction gate into soft blocks
    if (directionGate.triggered) {
      softBlocks.triggered = true;
      softBlocks.reasons.push(...directionGate.reasons);
      const DORDER: CgHubDecision[] = ["NO_TRADE", "WATCHLIST", "PROBE", "CONFIRMED"];
      const curIdx = DORDER.indexOf(softBlocks.maxDecision);
      const gateIdx = DORDER.indexOf(directionGate.maxDecision);
      if (gateIdx < curIdx) softBlocks.maxDecision = directionGate.maxDecision;
    }

    // Layer 10: 5 Penalty Groups (includes CapitalPreservation)
    const penalty = calculateCgPenaltyGroups(input, bias);

    // Layer 11: Final Score + Decision (edge + CP conditional)
    const final = calculateCgFinalScore({
      input, blockScores, capitalProtection, regime, bias, edge, gates, softBlocks, penalty, session,
    });

    // Layer 12: Code-computed Entry Zone (narrower than balanced)
    const entryZone = final.direction !== "NONE"
      ? calculateCgEntryZone(input, final.direction, pricePrecision)
      : input.entryZone;

    // Layer 13: TP/SL (structural stop + narrow margin clamp: SL 1.5-5%, TP 3-12%)
    const tpSl = final.direction !== "NONE"
      ? calculateCgTpSl(input, final.direction, regime.regime, final.adjustedScore, entryZone, pricePrecision)
      : null;

    // Layer 14: Position Sizing (score-tiered, most conservative)
    const positionSize = calculateCgPositionSize(input, final.adjustedScore, final.decision, capitalProtection);

    return {
      symbol,
      timeframe,
      mode: "CAPITAL_GUARD",
      price,
      blockScores,
      capitalProtection,
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
