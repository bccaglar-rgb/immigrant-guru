import { randomUUID } from "node:crypto";
import type { SystemScannerService, SystemScanResult } from "../../services/systemScannerService.ts";
import type { TradeIdeaStore } from "../../services/tradeIdeaStore.ts";
import type { AiProviderStore, AiProviderId } from "../../services/aiProviderStore.ts";
import type { CoinUniverseEngineV2 } from "../../services/coinUniverse/universeEngine.ts";
import type { AiEngineConfig, CycleMetrics, ValidatedResult } from "./types.ts";
import { buildCandidates } from "./candidateBuilder.ts";
import { applyGate } from "./deterministicGate.ts";
import { rankCandidates } from "./candidateRanker.ts";
import { buildEvaluationPrompt, toEvaluationRequest } from "./promptBuilder.ts";
import { callAi } from "./aiEvaluator.ts";
import { parseAiResponse } from "./responseParser.ts";
import { validateOutputs } from "./outputValidator.ts";
import { persistResults } from "./persistence.ts";
import { publishCycleResults } from "./publisher.ts";
import { redis } from "../../db/redis.ts";
import type { AiEngineCandidate, AiEvaluationResponse } from "./types.ts";

const PREFIX = "[AiModuleScheduler]";

// ══════════════════════════════════════════════════════════════════
// DATA-DRIVEN MODULE OPTIMIZATION
// Based on analysis of 133+ resolved trades (hubs + system-scanner):
//
//   Scoring Mode Win Rates (system-scanner, 102 trades):
//     BALANCED:       95.2% (20W / 1L)   ← BEST
//     CAPITAL_GUARD:  86.5% (45W / 7L)
//     FLOW:           83.3% (15W / 3L)
//     AGGRESSIVE:     72.7% (8W  / 3L)
//
//   Symbol Win Rates (hubs, 31 trades):
//     ETH: 100%  TAO: 100%  SOL: 100%  BTC: 100%  ZEC: 100%
//     XAU: 83%   PAXG: 57%  XAG: 40%  ← blacklisted
//
//   Confidence Sweet Spot:
//     Hub trades 80-84: 87.5% win rate
//     Scanner 70-79: 88.9% win rate
//
//   Time-to-Exit:
//     <5 min: 96.9%  6-10 min: 100%  11-15 min: 88.2%
//     16-30 min: 47.4%  30+ min: 41.7%
// ══════════════════════════════════════════════════════════════════

// ── Global symbol blacklist (historically poor performers) ───────
const SYMBOL_BLACKLIST = new Set(["PAXGUSDT", "XAGUSDT"]);

// ── Preferred scoring modes (highest win rates) ─────────────────
const HIGH_WIN_MODES = new Set(["BALANCED", "CAPITAL_GUARD"]);  // 95.2% + 86.5%
const ALL_MODES = new Set(["BALANCED", "CAPITAL_GUARD", "FLOW", "AGGRESSIVE"]);

// ── Per-Module Optimization Profiles ────────────────────────────

interface ModuleProfile {
  preferredModes: Set<string>;   // Which scoring modes to prefer
  minQuantScore: number;         // Pre-AI quant score filter
  minAiConfidence: number;       // Post-AI confidence filter
  temperature: number;           // AI temperature (lower = more consistent)
  minRR: number;                 // Minimum risk/reward ratio
  softDowngradeThreshold: number; // # of soft flags before downgrade
  promptStyle?: "STRUCTURED" | "AXIOM" | "QWEN_FREE" | "PRIME" | "ALPHA" | "CLOUD_FLOW";
}

// Bitrium Prime (CLAUDE) — Strategic evaluator, regime-first, conviction-based
// V3: Raised quality bars significantly based on 7-day data analysis.
//   ai-claude: only 28 ideas, 45% WR — needs much higher conviction.
const PRIME_PROFILE: ModuleProfile = {
  preferredModes: HIGH_WIN_MODES,   // BALANCED + CG only
  minQuantScore: 48,                // V3: raised from 38 — only strong quant setups
  minAiConfidence: 45,              // V3: raised from 28 — Prime must have high conviction
  temperature: 0.05,                // Low — consistent strategic analysis
  minRR: 0.50,                      // V3: raised from 0.10 — reject poor RR setups early
  softDowngradeThreshold: 2,
  promptStyle: "PRIME",
};

// Bitrium Alpha (QWEN2) — Quantitative edge specialist, numbers-first, EV-based
// V3: QWEN2 produced 965 ideas/7d (803 CG!) at 50.9% WR — needs strict filtering.
//   min confidence was 27.4 — tons of garbage getting through.
const ALPHA_PROFILE: ModuleProfile = {
  preferredModes: HIGH_WIN_MODES,   // BALANCED + CG only
  minQuantScore: 48,                // V3: raised from 38 — filter out weak quant
  minAiConfidence: 45,              // V3: raised from 32 — stop the flood of low-conf ideas
  temperature: 0.03,                // Very low — numerical precision
  minRR: 0.50,                      // V3: raised from 0.10
  softDowngradeThreshold: 1,        // 1 soft flag → downgrade
  promptStyle: "ALPHA",
};

// Cloud (QWEN/Claude) — Flow & microstructure specialist
// V3: ai-qwen had 43.1% WR, min confidence 25.6 — too many bad ideas.
const CLOUD_PROFILE: ModuleProfile = {
  preferredModes: ALL_MODES,        // All modes — flow can appear in any regime
  minQuantScore: 42,                // V3: raised from 32 — no more junk candidates
  minAiConfidence: 40,              // V3: raised from 30 — better conviction required
  temperature: 0.08,                // Higher — explore diverse flow patterns
  minRR: 0.45,                      // V3: raised from 0.08
  softDowngradeThreshold: 2,
  promptStyle: "CLOUD_FLOW",
};

// ChatGPT — Structured rules, wide net
// V3: ai-chatgpt had best WR at 57.5% but still produces too many ideas (668/7d).
//   min confidence was 31.6 — still some garbage leaking through.
const CHATGPT_PROFILE: ModuleProfile = {
  preferredModes: ALL_MODES,        // All modes OK
  minQuantScore: 42,                // V3: raised from 32 — consistent quality
  minAiConfidence: 40,              // V3: raised from 30 — higher quality filter
  temperature: 0.08,
  minRR: 0.45,                      // V3: raised from 0.08
  softDowngradeThreshold: 2,
};

// ── Module Definitions ───────────────────────────────────────────
// Equal distribution: 20 coins → 5 per module (round-robin by compositeScore rank).
// Each module has a specialized prompt + different filters → different analysis per coin.
// MAX_CANDIDATES_PER_MODULE=4 limits what goes to AI per module.

interface ModuleSlot {
  providerId: AiProviderId;
  label: string;
  userId: string;
  profile: ModuleProfile;
}

const MODULE_SLOTS: ModuleSlot[] = [
  { providerId: "CLAUDE",  label: "Bitrium Prime", userId: "ai-claude",  profile: PRIME_PROFILE },
  { providerId: "QWEN2",   label: "Bitrium Alpha", userId: "ai-qwen2",  profile: ALPHA_PROFILE },
  { providerId: "QWEN",    label: "Cloud",         userId: "ai-qwen",   profile: CLOUD_PROFILE },
  { providerId: "CHATGPT", label: "ChatGPT",       userId: "ai-chatgpt", profile: CHATGPT_PROFILE },
];

const INTERVAL_MS = 30_000;       // 30s cycle
const INITIAL_DELAY_MS = 120_000; // 2min — wait for scanner + universe to populate
const STALE_CACHE_MS = 120_000;   // skip if scanner cache older than 2 min
const MAX_CANDIDATES_PER_MODULE = 4;
const MAX_UNIVERSE_COINS = 20;    // 4 modules × 5 coins each = 20 total
const REDIS_STATE_KEY = "bitrium:ai-scheduler:state";
const REDIS_STATE_TTL = 120;
const REDIS_SCAN_COUNTER_KEY = "bitrium:ai-scheduler:scan-counts"; // per-module cumulative scan counter

// ── Dependencies ─────────────────────────────────────────────────

interface AiModuleSchedulerDeps {
  systemScanner: SystemScannerService;
  tradeIdeaStore: TradeIdeaStore;
  aiProviderStore: AiProviderStore;
  coinUniverseV2: CoinUniverseEngineV2;
}

// ── Module Run Result ────────────────────────────────────────────

interface ModuleRunResult {
  providerId: AiProviderId;
  label: string;
  symbols: string[];
  candidates: number;
  afterGate: number;
  sentToAi: number;
  aiApproved: number;
  persisted: number;
  durationMs: number;
  error?: string;
}

// ── Scheduler Run Log ────────────────────────────────────────────

interface SchedulerRunLog {
  runId: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  universeTop16: string[];
  assignments: Record<string, string[]>;
  moduleResults: ModuleRunResult[];
  totalPersisted: number;
  errors: string[];
}

/**
 * AiModuleScheduler — Multi-module AI orchestrator (v2 optimized).
 *
 * Every 30s:
 *   1. Read Coin Universe V2 snapshot → sort by compositeScore DESC → top 16
 *   2. ALL modules see ALL 16 coins (no rank partitioning)
 *   3. Per-module filters select best candidates:
 *      - Symbol blacklist (PAXG, XAG removed globally)
 *      - Scoring mode preference (BALANCED/CG highest win rate)
 *      - Quant score threshold (per-module strictness)
 *   4. AI pipeline: Gate → Rank → Prompt → AI Call → Parse → Confidence filter → Validate → Persist
 *   5. All 4 modules run in parallel
 */
export class AiModuleScheduler {
  private deps: AiModuleSchedulerDeps;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;
  private lastRunLog: SchedulerRunLog | null = null;
  private runCount = 0;

  constructor(deps: AiModuleSchedulerDeps) {
    this.deps = deps;
  }

  start(): void {
    const enabled = process.env.AI_MODULE_SCHEDULER_ENABLED !== "false";
    if (!enabled) {
      console.log(`${PREFIX} Disabled (AI_MODULE_SCHEDULER_ENABLED=false)`);
      return;
    }
    if (this.running) return;
    this.running = true;

    console.log(`${PREFIX} Starting v2 | interval=${INTERVAL_MS}ms modules=${MODULE_SLOTS.map(m => m.label).join(",")}`);
    this.timer = setTimeout(() => void this.cycleLoop(), INITIAL_DELAY_MS);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`${PREFIX} Stopped`);
  }

  getLastRun(): SchedulerRunLog | null {
    return this.lastRunLog;
  }

  // ── Main cycle loop ─────────────────────────────────────────────

  private async cycleLoop(): Promise<void> {
    if (!this.running) return;

    try {
      await this.runCycle();
    } catch (err) {
      console.error(`${PREFIX} Cycle error:`, err instanceof Error ? err.message : err);
    }

    if (this.running) {
      this.timer = setTimeout(() => void this.cycleLoop(), INTERVAL_MS);
    }
  }

  private async runCycle(): Promise<void> {
    if (this.processing) {
      console.log(`${PREFIX} Skip: previous cycle still running`);
      return;
    }
    this.processing = true;
    this.runCount++;
    const runId = randomUUID().slice(0, 8);
    const cycleStart = Date.now();
    const errors: string[] = [];

    try {
      // ── Step 1: Read Coin Universe V2 snapshot ──────────────────
      const snapshot = this.deps.coinUniverseV2.getSnapshot();
      const activeCoins = snapshot.activeCoins;

      if (!activeCoins.length) {
        console.log(`${PREFIX} [${runId}] Skip: Coin Universe empty`);
        return;
      }

      // ── Step 2: Sort by compositeScore DESC, take top coins ─────
      const sorted = [...activeCoins].sort((a, b) => b.compositeScore - a.compositeScore);
      const topCoins = sorted.slice(0, MAX_UNIVERSE_COINS);
      const topSymbols = topCoins.map(c => c.symbol);

      // ── Step 3: Get SystemScanner cache ─────────────────────────
      const cache = this.deps.systemScanner.getCache();
      if (!cache.results.length) {
        console.log(`${PREFIX} [${runId}] Skip: SystemScanner cache empty`);
        return;
      }
      if (Date.now() - cache.lastScanAt > STALE_CACHE_MS) {
        console.log(`${PREFIX} [${runId}] Skip: scanner cache stale (${Math.round((Date.now() - cache.lastScanAt) / 1000)}s)`);
        return;
      }

      // Build symbol→result lookup from scanner cache
      const scannerMap = new Map<string, SystemScanResult>();
      for (const r of cache.results) {
        scannerMap.set(r.symbol, r);
      }

      // ── Step 4: Per-module coin distribution ────────────────────
      // Equal distribution: each module gets exactly 5 coins, total 20.
      // Top 20 coins sorted by compositeScore → interleaved round-robin:
      //   #1 → Prime, #2 → Alpha, #3 → Cloud, #4 → ChatGPT,
      //   #5 → Prime, #6 → Alpha, #7 → Cloud, #8 → ChatGPT, ...
      const moduleOrder: AiProviderId[] = ["CLAUDE", "QWEN2", "QWEN", "CHATGPT"];
      const moduleSymbolMap: Record<AiProviderId, string[]> = {
        CLAUDE: [], QWEN2: [], CHATGPT: [], QWEN: [],
      };
      for (let i = 0; i < topSymbols.length; i++) {
        const moduleId = moduleOrder[i % moduleOrder.length];
        moduleSymbolMap[moduleId].push(topSymbols[i]);
      }

      console.log(`${PREFIX} [${runId}] Coin distribution: Prime=${moduleSymbolMap.CLAUDE.length} Alpha=${moduleSymbolMap.QWEN2.length} Cloud=${moduleSymbolMap.QWEN.length} ChatGPT=${moduleSymbolMap.CHATGPT.length} (total=${topSymbols.length})`);

      // Build per-module scan results from scanner cache
      const moduleScanResults: Record<AiProviderId, SystemScanResult[]> = {
        CLAUDE: [], QWEN2: [], CHATGPT: [], QWEN: [],
      };
      for (const [moduleId, symbols] of Object.entries(moduleSymbolMap)) {
        for (const sym of symbols) {
          const scanResult = scannerMap.get(sym);
          if (scanResult) moduleScanResults[moduleId as AiProviderId].push(scanResult);
        }
      }

      // Skip if no scan data at all
      const totalScanResults = Object.values(moduleScanResults).reduce((s, r) => s + r.length, 0);
      if (!totalScanResults) {
        console.log(`${PREFIX} [${runId}] Skip: no scanner data for any module`);
        return;
      }

      // ── Step 5: Run all 4 modules in parallel ──────────────────
      const assignments: Record<string, string[]> = {};
      const modulePromises: Promise<ModuleRunResult>[] = [];

      for (const slot of MODULE_SLOTS) {
        const moduleCoins = moduleSymbolMap[slot.providerId] ?? [];
        const moduleScan = moduleScanResults[slot.providerId] ?? [];
        assignments[slot.providerId] = moduleCoins;
        modulePromises.push(this.runModule(slot, moduleScan, runId));
      }

      const settled = await Promise.allSettled(modulePromises);
      const moduleResults: ModuleRunResult[] = [];

      for (let i = 0; i < settled.length; i++) {
        const result = settled[i];
        if (result.status === "fulfilled") {
          moduleResults.push(result.value);
          if (result.value.error) errors.push(`${MODULE_SLOTS[i].label}: ${result.value.error}`);
        } else {
          const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          errors.push(`${MODULE_SLOTS[i].label}: ${errMsg}`);
          moduleResults.push({
            providerId: MODULE_SLOTS[i].providerId,
            label: MODULE_SLOTS[i].label,
            symbols: topSymbols,
            candidates: 0, afterGate: 0, sentToAi: 0, aiApproved: 0, persisted: 0,
            durationMs: 0,
            error: errMsg,
          });
        }
      }

      // ── Step 6: Build run log ──────────────────────────────────
      const totalPersisted = moduleResults.reduce((s, r) => s + r.persisted, 0);
      const runLog: SchedulerRunLog = {
        runId,
        startedAt: cycleStart,
        completedAt: Date.now(),
        durationMs: Date.now() - cycleStart,
        universeTop16: topSymbols,
        assignments,
        moduleResults,
        totalPersisted,
        errors,
      };
      this.lastRunLog = runLog;

      // ── Step 7: Log summary ────────────────────────────────────
      const moduleSummary = moduleResults
        .map(r => `${r.label}(${r.candidates}c→${r.aiApproved}a→${r.persisted}p)`)
        .join(" | ");
      console.log(
        `${PREFIX} [${runId}] #${this.runCount} done in ${runLog.durationMs}ms | ` +
        `top16=[${topSymbols.slice(0, 4).join(",")},...] | ${moduleSummary} | total=${totalPersisted}` +
        (errors.length ? ` | errors=[${errors.join("; ")}]` : ""),
      );

      // ── Step 8: Publish state to Redis ─────────────────────────
      try {
        await redis.set(REDIS_STATE_KEY, JSON.stringify(runLog), "EX", REDIS_STATE_TTL);
      } catch { /* non-critical */ }

      // ── Step 9: Increment per-module cumulative scan counters ─
      // Used by the AI report endpoint for "Total Scan" column.
      try {
        const pipeline = redis.pipeline();
        for (const r of moduleResults) {
          if (r.candidates > 0) {
            pipeline.hincrby(REDIS_SCAN_COUNTER_KEY, r.providerId, 1);
          }
        }
        await pipeline.exec();
      } catch { /* non-critical */ }

    } finally {
      this.processing = false;
    }
  }

  // ── Single Module Pipeline ──────────────────────────────────────

  private async runModule(
    slot: ModuleSlot,
    allScanResults: SystemScanResult[],
    runId: string,
  ): Promise<ModuleRunResult> {
    const t0 = Date.now();
    const profile = slot.profile;

    try {
      // 1. Build all candidates from scanner results
      let candidates = buildCandidatesRelaxed(allScanResults);

      // ── Per-module data-driven filtering ────────────────────────

      // A) Global symbol blacklist (PAXG: 57% win, XAG: 40% win)
      candidates = candidates.filter(c => !SYMBOL_BLACKLIST.has(c.symbol));

      // B) Scoring mode preference
      //    For strict modules (Prime, Alpha): ONLY preferred modes
      //    For flexible modules (Cloud, ChatGPT): prefer high-win but keep others
      if (profile.preferredModes === HIGH_WIN_MODES) {
        // Strict: only BALANCED + CG
        const preferred = candidates.filter(c => profile.preferredModes.has(c.mode));
        if (preferred.length > 0) {
          candidates = preferred;
        }
        // If no preferred mode candidates, fall back to all (rare — better than empty)
      } else {
        // Flexible: sort by mode preference (BALANCED > CG > FLOW > AGG)
        candidates.sort((a, b) => {
          const aPreferred = HIGH_WIN_MODES.has(a.mode) ? 1 : 0;
          const bPreferred = HIGH_WIN_MODES.has(b.mode) ? 1 : 0;
          if (bPreferred !== aPreferred) return bPreferred - aPreferred;
          return b.quantScore - a.quantScore; // then by quant score
        });
      }

      // C) Quant score threshold
      candidates = candidates.filter(c => c.quantScore >= profile.minQuantScore);

      const symbols = [...new Set(candidates.map(c => c.symbol))];

      if (!candidates.length) {
        return { providerId: slot.providerId, label: slot.label, symbols, candidates: 0, afterGate: 0, sentToAi: 0, aiApproved: 0, persisted: 0, durationMs: Date.now() - t0 };
      }

      // 2. Build module-specific config
      const moduleConfig = buildModuleConfig(slot);

      // 3. Gate
      const gated = applyGate(candidates, moduleConfig);
      const survivors = gated.filter(g => g.verdict !== "VETO");
      if (!survivors.length) {
        return { providerId: slot.providerId, label: slot.label, symbols, candidates: candidates.length, afterGate: 0, sentToAi: 0, aiApproved: 0, persisted: 0, durationMs: Date.now() - t0 };
      }

      // 4. Rank — take top MAX_CANDIDATES_PER_MODULE
      const ranked = rankCandidates(survivors, MAX_CANDIDATES_PER_MODULE);
      if (!ranked.length) {
        return { providerId: slot.providerId, label: slot.label, symbols, candidates: candidates.length, afterGate: survivors.length, sentToAi: 0, aiApproved: 0, persisted: 0, durationMs: Date.now() - t0 };
      }

      // 5. Build prompt (uses promptStyle from config)
      const requests = ranked.map(r => toEvaluationRequest(r));
      const { systemPrompt, userPrompt } = buildEvaluationPrompt(requests, moduleConfig);

      // 6. Call AI
      const aiResult = await callAi(moduleConfig, this.deps.aiProviderStore, systemPrompt, userPrompt);

      // 7. Parse
      const isAxiom = !profile.promptStyle && slot.providerId === "QWEN2"; // Only raw QWEN2 without override
      let aiResponses = aiResult.ok && aiResult.raw
        ? parseAiResponse(aiResult.raw, isAxiom)
        : [];

      // Symbol injection fallback (QWEN_FREE format may omit symbol)
      if (aiResponses.length === 0 && aiResult.ok && aiResult.raw && ranked.length > 0) {
        aiResponses = parseAiResponseWithSymbolFallback(aiResult.raw, ranked.map(r => r.candidate.symbol), isAxiom);
      } else {
        for (let i = 0; i < aiResponses.length; i++) {
          if ((!aiResponses[i].symbol || aiResponses[i].symbol === "UNKNOWN") && i < ranked.length) {
            aiResponses[i] = { ...aiResponses[i], symbol: ranked[i].candidate.symbol };
          }
        }
      }

      // ── DEBUG: Log each AI response verdict + confidence ─────────
      if (aiResponses.length > 0) {
        const debugSummary = aiResponses.map(r =>
          `${r.symbol}:${r.verdict}(c=${r.confidence},d=${r.adjustedDirection})`
        ).join(" | ");
        console.log(`${PREFIX} [${runId}] ${slot.label} AI verdicts: ${debugSummary}`);
      }

      // 8. Post-AI confidence filter (all modules now have this)
      if (profile.minAiConfidence > 0) {
        const beforeFilter = aiResponses.length;
        aiResponses = aiResponses.filter(r => {
          if (r.verdict === "REJECT") return true;
          return r.confidence >= profile.minAiConfidence;
        });
        if (aiResponses.length < beforeFilter) {
          console.log(`${PREFIX} [${runId}] ${slot.label} confidence filter: ${beforeFilter} → ${aiResponses.length} (min ${profile.minAiConfidence})`);
        }
      }

      // 9. Validate
      const validated = validateOutputs(ranked, aiResponses, moduleConfig);

      // ── DEBUG: Log validated results ─────────────────────────────
      if (validated.length > 0) {
        const valSummary = validated.map(v =>
          `${v.candidate.symbol}:${v.finalDecision}(s=${v.finalScore.toFixed(1)},rr=${v.candidate.rrRatio.toFixed(2)})`
        ).join(" | ");
        console.log(`${PREFIX} [${runId}] ${slot.label} validated: ${valSummary}`);
      } else if (aiResponses.filter(r => r.verdict !== "REJECT").length > 0) {
        console.log(`${PREFIX} [${runId}] ${slot.label} all non-REJECT lost in validation`);
      }

      // 10. Persist
      const persisted = await persistResults(validated, this.deps.tradeIdeaStore, moduleConfig);

      const aiApproved = aiResponses.filter(r => r.verdict === "APPROVE").length;
      console.log(
        `${PREFIX} [${runId}] ${slot.label}: ${candidates.length}c → ${survivors.length}g → ${ranked.length}r → ` +
        `${aiResponses.length}ai (${aiApproved}✓) → ${persisted}p [${aiResult.latencyMs ?? 0}ms]`,
      );

      return {
        providerId: slot.providerId, label: slot.label, symbols,
        candidates: candidates.length, afterGate: survivors.length,
        sentToAi: ranked.length, aiApproved, persisted,
        durationMs: Date.now() - t0,
        error: aiResult.ok ? undefined : aiResult.error,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`${PREFIX} [${runId}] ${slot.label} error: ${errMsg}`);
      return {
        providerId: slot.providerId, label: slot.label,
        symbols: allScanResults.map(r => r.symbol),
        candidates: 0, afterGate: 0, sentToAi: 0, aiApproved: 0, persisted: 0,
        durationMs: Date.now() - t0, error: errMsg,
      };
    }
  }
}

// ── Helper: Build module-specific config ─────────────────────────

function buildModuleConfig(slot: ModuleSlot): AiEngineConfig {
  const p = slot.profile;
  return {
    enabled: true,
    intervalMs: INTERVAL_MS,
    maxCandidatesForAi: MAX_CANDIDATES_PER_MODULE,
    aiProvider: slot.providerId,
    promptStyle: p.promptStyle,
    aiModel: slot.providerId === "CLAUDE" ? "claude-sonnet-4-6"
           : slot.providerId === "QWEN" ? "claude-sonnet-4-6"
           : "gpt-4o-mini",
    aiTimeoutMs: 90_000,
    aiTemperature: p.temperature,
    aiMaxTokens: 4000,
    minQuantScore: p.minQuantScore,
    minRR: p.minRR,
    softDowngradeThreshold: p.softDowngradeThreshold,
    staleCacheMaxAgeMs: 120_000,
    userId: slot.userId,
    dryRun: process.env.AI_MODULE_SCHEDULER_DRY_RUN === "true",
  };
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Re-parse AI response with symbol injection for prompts that don't return symbol field.
 */
function parseAiResponseWithSymbolFallback(
  raw: string,
  candidateSymbols: string[],
  isAxiom: boolean,
): AiEvaluationResponse[] {
  const responses = parseAiResponse(raw, isAxiom);
  for (let i = 0; i < responses.length; i++) {
    if ((!responses[i].symbol || responses[i].symbol === "UNKNOWN") && i < candidateSymbols.length) {
      responses[i] = { ...responses[i], symbol: candidateSymbols[i] };
    }
  }
  if (responses.length > 0) return responses;

  const trimmed = raw.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenced) {
      try { parsed = JSON.parse(fenced[1].trim()); } catch { /* continue */ }
    }
    if (!parsed) {
      const first = trimmed.indexOf("{");
      const last = trimmed.lastIndexOf("}");
      if (first >= 0 && last > first) {
        try { parsed = JSON.parse(trimmed.slice(first, last + 1)); } catch { /* give up */ }
      }
    }
  }

  if (!parsed || typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj) && candidateSymbols.length > 0 && !obj.evaluations) {
    obj.symbol = candidateSymbols[0];
    return parseAiResponse(JSON.stringify({ evaluations: [obj] }), isAxiom);
  }

  return [];
}

/**
 * Relaxed candidate builder — no hard RR or score filters.
 * Coin Universe ranking + per-module filters are the gatekeepers.
 */
function buildCandidatesRelaxed(results: SystemScanResult[]): AiEngineCandidate[] {
  const candidates: AiEngineCandidate[] = [];

  for (const r of results) {
    if (!r.entryLow || r.entryLow <= 0 || !r.entryHigh || r.entryHigh <= 0) continue;
    if (!r.slLevels?.length || !r.tpLevels?.length) continue;

    const entryMid = (r.entryLow + r.entryHigh) / 2;
    const sl1 = r.slLevels[0];
    const tp1 = r.tpLevels[0];

    const riskR = Math.abs(entryMid - sl1);
    const rewardR = Math.abs(tp1 - entryMid);
    const rrRatio = riskR > 0 ? rewardR / riskR : 0;

    if (rrRatio <= 0) continue;

    const quantSnapshot = (r as Record<string, unknown>).quantSnapshot as Record<string, unknown> | undefined;
    const flowSignals = (r as Record<string, unknown>).flowSignals as Record<string, unknown> | undefined;

    candidates.push({
      symbol: r.symbol,
      mode: r.mode,
      quantScore: r.scorePct,
      decision: r.decision,
      direction: r.direction,
      tradeValidity: r.tradeValidity,
      entryWindow: r.entryWindow,
      slippageRisk: r.slippageRisk,
      setup: r.setup,
      entryLow: r.entryLow,
      entryHigh: r.entryHigh,
      slLevels: r.slLevels,
      tpLevels: r.tpLevels,
      horizon: r.horizon,
      timeframe: r.timeframe,
      modeScores: r.modeScores,
      pricePrecision: r.pricePrecision ?? 8,
      scannedAt: r.scannedAt,
      quantSnapshot,
      flowSignals,
      entryMid,
      riskR,
      rewardR,
      rrRatio,
    });
  }

  return candidates;
}
