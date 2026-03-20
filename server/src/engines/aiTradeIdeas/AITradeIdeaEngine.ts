import { randomUUID } from "node:crypto";
import type { SystemScannerService } from "../../services/systemScannerService.ts";
import type { TradeIdeaStore } from "../../services/tradeIdeaStore.ts";
import type { AiProviderStore } from "../../services/aiProviderStore.ts";
import type { AiEngineConfig, CycleMetrics } from "./types.ts";
import { loadConfig } from "./config.ts";
import { buildCandidates } from "./candidateBuilder.ts";
import { applyGate } from "./deterministicGate.ts";
import { rankCandidates } from "./candidateRanker.ts";
import { buildEvaluationPrompt, toEvaluationRequest } from "./promptBuilder.ts";
import { callAi } from "./aiEvaluator.ts";
import { parseAiResponse } from "./responseParser.ts";
import { validateOutputs } from "./outputValidator.ts";
import { persistResults } from "./persistence.ts";
import { publishCycleResults } from "./publisher.ts";
import { logCycle, logGateStats, logAiStats } from "./metrics.ts";

const PREFIX = "[AIEngineV2]";

interface AITradeIdeaEngineDeps {
  systemScanner: SystemScannerService;
  tradeIdeaStore: TradeIdeaStore;
  aiProviderStore: AiProviderStore;
}

/**
 * AITradeIdeaEngine V2 — Main orchestrator.
 *
 * Pipeline: Quant candidates → Gate → Rank → AI Evaluate → Validate → Persist
 *
 * Feature-flagged via AI_TRADE_IDEA_ENGINE_V2_ENABLED env var.
 * Runs on Worker 0 (IS_PRIMARY) only.
 */
export class AITradeIdeaEngine {
  private deps: AITradeIdeaEngineDeps;
  private config: AiEngineConfig;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastCycleMetrics: CycleMetrics | null = null;
  private processing = false;

  constructor(deps: AITradeIdeaEngineDeps) {
    this.deps = deps;
    this.config = loadConfig();
  }

  /** Start the engine with initial delay (waits for quant scanner to populate cache). */
  start(): void {
    if (!this.config.enabled) {
      console.log(`${PREFIX} Disabled (AI_TRADE_IDEA_ENGINE_V2_ENABLED != true)`);
      return;
    }
    if (this.running) return;
    this.running = true;

    const dryLabel = this.config.dryRun ? " [DRY RUN]" : "";
    console.log(`${PREFIX} Starting${dryLabel} | interval=${this.config.intervalMs}ms max_candidates=${this.config.maxCandidatesForAi} provider=${this.config.aiProvider}`);

    // Initial delay: 90s for quant scanner to complete 3-4 cycles
    this.timer = setTimeout(() => void this.cycleLoop(), 90_000);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`${PREFIX} Stopped`);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getMetrics(): CycleMetrics | null {
    return this.lastCycleMetrics;
  }

  // ── Cycle loop ────────────────────────────────────────────────

  private async cycleLoop(): Promise<void> {
    if (!this.running) return;

    try {
      await this.runCycle();
    } catch (err) {
      console.error(`${PREFIX} Cycle error:`, err instanceof Error ? err.message : err);
    }

    if (this.running) {
      this.timer = setTimeout(() => void this.cycleLoop(), this.config.intervalMs);
    }
  }

  private async runCycle(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    const cycleStart = Date.now();
    const errors: string[] = [];

    try {
      // 1. Read quant candidates
      const cache = this.deps.systemScanner.getCache();
      if (!cache.results.length) {
        console.log(`${PREFIX} Skip: quant cache empty`);
        return;
      }
      if (Date.now() - cache.lastScanAt > this.config.staleCacheMaxAgeMs) {
        console.log(`${PREFIX} Skip: quant cache stale (${Math.round((Date.now() - cache.lastScanAt) / 1000)}s old)`);
        return;
      }

      // 2. Build normalized candidates
      const candidates = buildCandidates(cache.results);
      if (!candidates.length) {
        console.log(`${PREFIX} Skip: no valid candidates after build`);
        return;
      }

      // 3. Deterministic gate
      const gated = applyGate(candidates, this.config);
      logGateStats(gated);

      const survivors = gated.filter((g) => g.verdict !== "VETO");
      if (!survivors.length) {
        console.log(`${PREFIX} All candidates vetoed by gate`);
        return;
      }

      // 4. Rank and select top N
      const ranked = rankCandidates(survivors, this.config.maxCandidatesForAi);
      if (!ranked.length) return;

      // 5. Build AI prompt (passes config so Axiom/QWEN2 gets its own prompt)
      const requests = ranked.map((r) => toEvaluationRequest(r));
      const { systemPrompt, userPrompt } = buildEvaluationPrompt(requests, this.config);

      // 6. Call AI
      const aiResult = await callAi(
        this.config, this.deps.aiProviderStore,
        systemPrompt, userPrompt,
      );

      // 7. Parse response (Axiom format when provider=QWEN2)
      const isAxiom = this.config.aiProvider === "QWEN2";
      const aiResponses = aiResult.ok && aiResult.raw
        ? parseAiResponse(aiResult.raw, isAxiom)
        : [];

      if (!aiResult.ok) {
        errors.push(aiResult.error ?? "unknown_ai_error");
      }

      logAiStats(aiResponses, aiResult.latencyMs);

      // 8. Validate outputs
      const validated = validateOutputs(ranked, aiResponses, this.config);

      // 9. Persist
      let persisted = 0;
      if (!this.config.dryRun) {
        persisted = await persistResults(validated, this.deps.tradeIdeaStore, this.config);
      } else {
        // Dry run: log what would be persisted
        for (const v of validated) {
          if (v.finalDecision !== "NO_TRADE") {
            console.log(`${PREFIX} [DRY] Would persist: ${v.candidate.symbol} ${v.finalDecision} ${v.finalDirection} score=${v.finalScore.toFixed(1)}`);
          }
        }
      }

      // 10. Publish & log
      const metrics: CycleMetrics = {
        cycleId: randomUUID(),
        startedAt: cycleStart,
        completedAt: Date.now(),
        durationMs: Date.now() - cycleStart,
        quantCandidates: candidates.length,
        afterGate: survivors.length,
        sentToAi: ranked.length,
        aiApproved: aiResponses.filter((r) => r.verdict === "APPROVE").length,
        aiDowngraded: aiResponses.filter((r) => r.verdict === "DOWNGRADE").length,
        aiRejected: aiResponses.filter((r) => r.verdict === "REJECT").length,
        persisted,
        errors,
      };

      this.lastCycleMetrics = metrics;
      logCycle(metrics);
      await publishCycleResults(metrics, validated);
    } finally {
      this.processing = false;
    }
  }
}
