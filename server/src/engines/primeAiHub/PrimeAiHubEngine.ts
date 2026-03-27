/**
 * Bitrium Prime AI Hub — Main Orchestrator
 *
 * Self-scheduling engine that runs the 16-step pipeline:
 *
 *   1. Get TRADE candidates from SystemScanner
 *   2. For each: fetch market data via loopback API
 *   3. Extract HubInput via balanced hub dataExtractor
 *   4. Build PrimeAiCoinInput[] from HubInputs
 *   5. Pre-flight code gate: skip coins with missing critical data
 *   6. Build system prompt (cached, immutable)
 *   7. Build runtime prompt with coin JSON payload
 *   8. Call Claude API
 *   9. Parse strict JSON response
 *   10. Code enforcement per coin (hard gates, score verify, decision override, TP/SL clamp)
 *   11. Cooldown/daily limits check
 *   12. Entry zone calculation (code, NOT AI)
 *   13. Position sizing (code, NOT AI)
 *   14. Persist snapshots to DB
 *   15. Create trade ideas via hubIdeaCreator
 *   16. Publish to Redis + log metrics
 */

import { loadPrimeAiConfig } from "./config.ts";
import { extractHubInput } from "../balancedModeHub/dataExtractor.ts";
import { buildAllCoinInputs } from "./inputBuilder.ts";
import { getSystemPrompt } from "./systemPrompt.ts";
import { buildRuntimePrompt } from "./runtimePrompt.ts";
import { callClaude } from "./llmCaller.ts";
import { parseAiResponse } from "./responseParser.ts";
import { enforceAll } from "./codeEnforcement.ts";
import { checkLimits, recordDecision, checkRevengeBlock } from "./cooldownManager.ts";
import { calculateEntryZone } from "./entryCalculator.ts";
import { calculatePositionSize } from "./positionSizer.ts";
import { publishCycle } from "./hubPublisher.ts";
import { buildCycleMetrics, logCycleMetrics, logStartup, logEnforcement } from "./metrics.ts";
import type { PrimeAiCycleMetrics, HubInput } from "./types.ts";

const PREFIX = "[PrimeAI]";

interface HubDeps {
  getMarketData: (symbol: string, timeframe: string) => Promise<Record<string, unknown> | null>;
  getScanCandidates: () => Array<{
    symbol: string;
    timeframe: string;
    mode: string;
    scorePct: number;
    pricePrecision?: number;
  }>;
}

export class PrimeAiHubEngine {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cycleCount = 0;
  private lastMetrics: PrimeAiCycleMetrics | null = null;

  constructor(private deps: HubDeps) {}

  start(): void {
    const cfg = loadPrimeAiConfig();
    if (!cfg.enabled) {
      console.log(`${PREFIX} Disabled (PRIME_AI_HUB_ENABLED != true)`);
      return;
    }
    if (!cfg.apiKey) {
      console.error(`${PREFIX} Cannot start: CLAUDE_API_KEY not set`);
      return;
    }
    this.running = true;
    logStartup(cfg.model, cfg.intervalMs);
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`${PREFIX} Stopped`);
  }

  getLastMetrics(): PrimeAiCycleMetrics | null {
    return this.lastMetrics;
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const cfg = loadPrimeAiConfig();
    const jitter = Math.floor(Math.random() * 5000);
    this.timer = setTimeout(() => this.runCycle(), cfg.intervalMs + jitter);
  }

  private async runCycle(): Promise<void> {
    if (!this.running) return;

    const cfg = loadPrimeAiConfig();
    const cycleId = `prime_${Date.now()}_${++this.cycleCount}`;
    const startMs = Date.now();
    const errors: string[] = [];
    let llmLatencyMs = 0;

    try {
      // ──────────────────────────────────────────────────
      // Step 1: Get TRADE candidates from SystemScanner
      // ──────────────────────────────────────────────────
      const allCandidates = this.deps.getScanCandidates();

      // Take ALL modes (not just one) — Prime AI evaluates cross-mode
      const candidates = allCandidates
        .sort((a, b) => b.scorePct - a.scorePct)
        .slice(0, cfg.maxCoins);

      if (candidates.length === 0) {
        this.scheduleNext();
        return;
      }

      // ──────────────────────────────────────────────────
      // Steps 2-3: Fetch market data + extract HubInput
      // ──────────────────────────────────────────────────
      const hubInputs: HubInput[] = [];

      for (const candidate of candidates) {
        try {
          const apiResponse = await this.deps.getMarketData(candidate.symbol, candidate.timeframe);
          if (!apiResponse) continue;

          const price = Number(apiResponse.price_value ?? 0);
          if (price <= 0) continue;

          const hubInput = extractHubInput(
            candidate.symbol,
            candidate.timeframe,
            price,
            apiResponse as Record<string, unknown>,
          );
          hubInputs.push(hubInput);
        } catch (err) {
          errors.push(`data_fetch:${candidate.symbol}:${(err as Error).message}`);
        }
      }

      if (hubInputs.length === 0) {
        this.scheduleNext();
        return;
      }

      // ──────────────────────────────────────────────────
      // Steps 4-5: Build coin inputs + pre-flight gate
      // ──────────────────────────────────────────────────
      const coinInputPairs = buildAllCoinInputs(hubInputs);

      if (coinInputPairs.length === 0) {
        this.scheduleNext();
        return;
      }

      // ──────────────────────────────────────────────────
      // Steps 6-7: Build prompts
      // ──────────────────────────────────────────────────
      const systemPrompt = getSystemPrompt();
      const runtimePrompt = buildRuntimePrompt(coinInputPairs.map(p => p.coinInput));

      // ──────────────────────────────────────────────────
      // Step 8: Call Claude API
      // ──────────────────────────────────────────────────
      const llmResult = await callClaude(cfg, systemPrompt, runtimePrompt);
      llmLatencyMs = llmResult.latencyMs;

      if (!llmResult.ok || !llmResult.raw) {
        errors.push(`llm_call:${llmResult.error}`);
        console.error(`${PREFIX} Claude call failed: ${llmResult.error}`);
        this.scheduleNext();
        return;
      }

      // ──────────────────────────────────────────────────
      // Step 9: Parse response
      // ──────────────────────────────────────────────────
      const parsed = parseAiResponse(llmResult.raw);
      if (!parsed) {
        errors.push("response_parse_failed");
        console.error(`${PREFIX} Failed to parse AI response`);
        this.scheduleNext();
        return;
      }

      // ──────────────────────────────────────────────────
      // Step 10: Code enforcement
      // ──────────────────────────────────────────────────
      // Match AI evaluations to coin inputs by symbol
      const enforcementPairs = coinInputPairs
        .map(pair => {
          const aiOutput = parsed.evaluations.find(
            e => e.symbol.toUpperCase() === pair.coinInput.symbol.toUpperCase(),
          );
          if (!aiOutput) return null;
          return {
            coin: pair.coinInput,
            aiOutput,
            hubInput: pair.hubInput,
            degradation: pair.degradation,
          };
        })
        .filter(Boolean) as Array<{
          coin: (typeof coinInputPairs)[0]["coinInput"];
          aiOutput: (typeof parsed.evaluations)[0];
          hubInput: HubInput;
          degradation: (typeof coinInputPairs)[0]["degradation"];
        }>;

      const enforcedResults = enforceAll(enforcementPairs, cfg);

      // Log enforcement details
      for (const result of enforcedResults) {
        logEnforcement(result);
      }

      // ──────────────────────────────────────────────────
      // Step 11: Cooldown/daily limits
      // ──────────────────────────────────────────────────
      let cooldownBlocked = 0;

      for (const result of enforcedResults) {
        // Check revenge block first
        await checkRevengeBlock(result.coin.symbol, cfg);

        const cooldownCheck = await checkLimits(result, cfg);
        if (!cooldownCheck.allowed) {
          cooldownBlocked++;
          // Downgrade to WATCHLIST
          if (result.enforced.decision === "CONFIRMED" || result.enforced.decision === "PROBE") {
            result.enforced.overrides.push({
              field: "decision",
              from: result.enforced.decision,
              to: "WATCHLIST",
              reason: `cooldown:${cooldownCheck.reason}`,
            });
            result.enforced.decision = "WATCHLIST";
          }
        }
      }

      // ──────────────────────────────────────────────────
      // Steps 12-13: Entry zone + position sizing
      // ──────────────────────────────────────────────────
      const publishInputs = enforcedResults.map((result, idx) => {
        const hubInput = enforcementPairs[idx].hubInput;
        const entryZone = calculateEntryZone(result.coin, hubInput, result.enforced.side);
        const positionSize = calculatePositionSize(result.coin, result);
        return { result, entryZone, positionSize };
      });

      // ──────────────────────────────────────────────────
      // Steps 14-16: Publish (Redis + DB + trade ideas) + log metrics
      // ──────────────────────────────────────────────────
      let ideasCreated = 0;
      if (!cfg.dryRun) {
        ideasCreated = await publishCycle(cycleId, publishInputs);

        // Record decisions for cooldown tracking
        for (const { result } of publishInputs) {
          if (result.enforced.decision === "CONFIRMED" || result.enforced.decision === "PROBE") {
            await recordDecision(result, cfg);
          }
        }

        if (ideasCreated > 0) {
          console.log(`${PREFIX} Created ${ideasCreated} trade idea(s) from cycle ${cycleId}`);
        }
      }

      // Build and log metrics
      const metrics = buildCycleMetrics(
        cycleId, startMs, llmLatencyMs,
        enforcedResults, ideasCreated, cooldownBlocked, errors,
      );
      this.lastMetrics = metrics;
      logCycleMetrics(metrics);

    } catch (err) {
      console.error(`${PREFIX} Cycle ${cycleId} error:`, err);
    }

    this.scheduleNext();
  }
}
