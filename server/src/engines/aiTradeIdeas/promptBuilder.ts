import type { AiEvaluationRequest, AiEngineConfig, RankedCandidate, AiEngineCandidate } from "./types.ts";
import { AXIOM_SYSTEM_PROMPT, buildAxiomBatchUserPrompt } from "./axiomPrompt.ts";
import { buildAxiomEdgeLayerInput, buildFlowEdgeInput } from "../../services/axiomEdgeLayerBuilder.ts";
import { STRUCTURED_SYSTEM_PROMPT, ALPHA_SYSTEM_PROMPT } from "./structuredSystemPrompt.ts";
import { QWEN_FREE_SYSTEM_PROMPT } from "./qwenFreeSystemPrompt.ts";
import { PRIME_SYSTEM_PROMPT } from "./primeSystemPrompt.ts";
import { CLOUD_FLOW_SYSTEM_PROMPT } from "./cloudFlowPrompt.ts";
import { buildStructuredPayload } from "./structuredPayloadBuilder.ts";

/**
 * Builds system + user prompts for AI evaluation of trade candidates.
 * One batch call per cycle (all candidates in one prompt).
 *
 * Specialized prompt styles:
 * - PRIME: Strategic evaluator (regime-first, conviction-based) — for Bitrium Prime (CLAUDE)
 * - ALPHA: Quantitative edge specialist (EV calculation, data quality) — for Bitrium Alpha (QWEN2)
 * - CLOUD_FLOW: Flow & microstructure specialist (orderbook, funding, OI) — for Cloud (QWEN)
 * - STRUCTURED: Elite trader with strategy rules (v2) — for ChatGPT
 * - QWEN_FREE: Free evaluation without rules — legacy
 * - AXIOM: Full Axiom master prompt with 5-layer edge data — legacy
 */
export function buildEvaluationPrompt(
  candidates: AiEvaluationRequest[],
  config?: AiEngineConfig,
): { systemPrompt: string; userPrompt: string } {
  // ── promptStyle override takes priority over aiProvider ─────
  // Allows decoupling prompt format from API endpoint
  if (config?.promptStyle === "PRIME") {
    return buildPrimeEvaluationPrompt(candidates);
  }
  if (config?.promptStyle === "ALPHA") {
    return buildAlphaEvaluationPrompt(candidates);
  }
  if (config?.promptStyle === "CLOUD_FLOW") {
    return buildCloudFlowEvaluationPrompt(candidates);
  }
  if (config?.promptStyle === "STRUCTURED") {
    return buildStructuredEvaluationPrompt(candidates);
  }
  if (config?.promptStyle === "AXIOM") {
    return buildAxiomEvaluationPrompt(candidates);
  }
  if (config?.promptStyle === "QWEN_FREE") {
    return buildQwenFreeEvaluationPrompt(candidates);
  }

  // ── Default: derive prompt style from aiProvider ────────────
  // Use Axiom prompt for QWEN2 provider
  if (config?.aiProvider === "QWEN2") {
    return buildAxiomEvaluationPrompt(candidates);
  }

  // QWEN: same structured data, but free evaluation (no rules imposed)
  if (config?.aiProvider === "QWEN") {
    return buildQwenFreeEvaluationPrompt(candidates);
  }

  // CLAUDE (Bitrium Prime): same structured prompt as ChatGPT — premium evaluator
  // ChatGPT: structured 3-layer payload with strategy rules
  return buildStructuredEvaluationPrompt(candidates);
}

/**
 * Builds structured 3-layer prompt for ChatGPT / Qwen providers.
 * Each candidate gets a full structured JSON payload with:
 *   Layer 1: Decision summary + trade plan + core metrics
 *   Layer 2: Group scores + penalty groups + model agreement
 *   Layer 3: Raw signals + contradictions + data health + strategy rules
 */
function buildStructuredEvaluationPrompt(
  candidates: AiEvaluationRequest[],
): { systemPrompt: string; userPrompt: string } {
  const blocks = candidates.map((c, i) => {
    // Reconstruct a minimal AiEngineCandidate for the payload builder
    const candidate: AiEngineCandidate = {
      symbol: c.symbol,
      mode: c.mode,
      quantScore: c.quantScore,
      decision: c.quantScore >= 70 ? "TRADE" : c.quantScore >= 50 ? "WATCH" : "NO_TRADE",
      direction: c.direction,
      tradeValidity: c.tradeValidity,
      entryWindow: c.entryWindow,
      slippageRisk: c.slippageRisk,
      setup: c.setup,
      entryLow: c.entryLow,
      entryHigh: c.entryHigh,
      slLevels: c.slLevels,
      tpLevels: c.tpLevels,
      horizon: c.horizon,
      timeframe: c.timeframe,
      modeScores: {},
      pricePrecision: getPrecision(c),
      scannedAt: Date.now(),
      quantSnapshot: (c as Record<string, unknown>).quantSnapshot as Record<string, unknown> | undefined,
      entryMid: (c.entryLow + c.entryHigh) / 2,
      riskR: Math.abs((c.entryLow + c.entryHigh) / 2 - c.slLevels[0]),
      rewardR: Math.abs(c.tpLevels[0] - (c.entryLow + c.entryHigh) / 2),
      rrRatio: c.rrRatio,
    };

    const payload = buildStructuredPayload(candidate, c.softFlags);
    return `--- Candidate ${i + 1}/${candidates.length}: ${c.symbol} ---\n${JSON.stringify(payload, null, 2)}`;
  });

  const userPrompt = [
    `Here are ${candidates.length} pre-filtered trade candidate(s) — the TOP ${candidates.length} from 16 coins after 6-layer quant gate.`,
    ``,
    `Your DEFAULT is APPROVE. For EACH candidate:`,
    `1. CONFIRM the directional thesis — does the data support the trade?`,
    `2. CHECK SL is reasonable (near a level, not random)`,
    `3. VERIFY RR >= 1.2 (1.5+ preferred, but 1.2 is acceptable in crypto)`,
    `4. ADJUST SL/TP levels if you see better structural points (within 5%)`,
    `5. COMMENT in Turkish — explain like a trader to a trader`,
    ``,
    `REMEMBER: These passed strict quant filtering. APPROVE unless genuinely broken.`,
    `Return evaluations in JSON format as specified in the system prompt.`,
    ``,
    ...blocks,
  ].join("\n");

  return { systemPrompt: STRUCTURED_SYSTEM_PROMPT, userPrompt };
}

/**
 * Builds Qwen free evaluation prompt — same structured data as ChatGPT
 * but WITHOUT mandatory rules. Qwen gets 100% of the data and makes
 * its own independent decision. Pay attention to entry/SL/TP levels.
 */
function buildQwenFreeEvaluationPrompt(
  candidates: AiEvaluationRequest[],
): { systemPrompt: string; userPrompt: string } {
  const blocks = candidates.map((c, i) => {
    const candidate: AiEngineCandidate = {
      symbol: c.symbol,
      mode: c.mode,
      quantScore: c.quantScore,
      decision: c.quantScore >= 70 ? "TRADE" : c.quantScore >= 50 ? "WATCH" : "NO_TRADE",
      direction: c.direction,
      tradeValidity: c.tradeValidity,
      entryWindow: c.entryWindow,
      slippageRisk: c.slippageRisk,
      setup: c.setup,
      entryLow: c.entryLow,
      entryHigh: c.entryHigh,
      slLevels: c.slLevels,
      tpLevels: c.tpLevels,
      horizon: c.horizon,
      timeframe: c.timeframe,
      modeScores: {},
      pricePrecision: getPrecision(c),
      scannedAt: Date.now(),
      quantSnapshot: (c as Record<string, unknown>).quantSnapshot as Record<string, unknown> | undefined,
      entryMid: (c.entryLow + c.entryHigh) / 2,
      riskR: Math.abs((c.entryLow + c.entryHigh) / 2 - c.slLevels[0]),
      rewardR: Math.abs(c.tpLevels[0] - (c.entryLow + c.entryHigh) / 2),
      rrRatio: c.rrRatio,
    };

    const payload = buildStructuredPayload(candidate, c.softFlags);
    return `--- Candidate ${i + 1}/${candidates.length}: ${c.symbol} ---\n${JSON.stringify(payload, null, 2)}`;
  });

  const userPrompt = [
    `Evaluate the following ${candidates.length} trade candidate(s) independently.`,
    ``,
    `You have complete structured market data below. Make your OWN decision.`,
    `The engine has provided its preliminary analysis — use it as input but form your own opinion.`,
    ``,
    `Pay special attention to:`,
    `- Entry levels: Are these good prices to open a position?`,
    `- Stop loss levels: Are they at structural invalidation points?`,
    `- Take profit targets: Are they realistic and achievable?`,
    `- If you APPROVE, provide YOUR recommended entry/SL/TP levels.`,
    ``,
    `Return one evaluation per candidate in JSON format as specified in the system prompt.`,
    ``,
    ...blocks,
  ].join("\n");

  return { systemPrompt: QWEN_FREE_SYSTEM_PROMPT, userPrompt };
}

/**
 * Builds Axiom-specific batch prompt with FLOW GOLD SETUP signals.
 * Uses pre-computed flow_signals from the market API (same data as computeFlowGoldSetup).
 * Falls back to old 5-layer edge data if flow_signals unavailable.
 */
function buildAxiomEvaluationPrompt(
  candidates: AiEvaluationRequest[],
): { systemPrompt: string; userPrompt: string } {
  const edgeCandidates = candidates.map((c) => {
    const flowSignals = (c as Record<string, unknown>).flowSignals as Record<string, unknown> | undefined;

    // Prefer FLOW signals (new path) — falls back to old edge layer if unavailable
    if (flowSignals && Object.keys(flowSignals).length > 5) {
      const flowEdge = buildFlowEdgeInput(
        c.symbol,
        (c.entryLow + c.entryHigh) / 2,
        c.timeframe,
        c.direction,
        c.quantScore,
        c.rrRatio,
        flowSignals,
      );
      return {
        symbol: c.symbol,
        edgeLayerJson: JSON.stringify(flowEdge, null, 2),
      };
    }

    // Fallback: old 5-layer edge data from quant snapshot
    const snapshot = (c as Record<string, unknown>).quantSnapshot as Record<string, unknown> | undefined;
    const alpha = (c as Record<string, unknown>).alpha as Record<string, unknown> | undefined;
    const edgeLayer = buildAxiomEdgeLayerInput(
      c.symbol,
      (c.entryLow + c.entryHigh) / 2,
      c.timeframe,
      snapshot,
      alpha ?? null,
    );
    return {
      symbol: c.symbol,
      edgeLayerJson: JSON.stringify(edgeLayer, null, 2),
    };
  });

  return {
    systemPrompt: AXIOM_SYSTEM_PROMPT,
    userPrompt: buildAxiomBatchUserPrompt(edgeCandidates),
  };
}

// ── Scoring Mode Context (shared by all new prompts) ──────────────

const SCORING_MODE_CONTEXT = `
=== SCORING MODE CONTEXT ===
Each candidate was evaluated using a specific scoring mode. Understanding the mode helps you interpret the data:
- BALANCED: All-purpose scoring. Equal weights across all signal groups. 95.2% historical win rate. The safest mode.
- FLOW: Momentum & trend focus. Breakout signals weighted 1.2x. Best for strong directional moves and trend continuations.
- CAPITAL_GUARD: Mean-reversion & range focus. Range signals weighted 1.4x. Conservative SL placement. 86.5% win rate.
- AGGRESSIVE: Fast entries, early signals. Higher risk tolerance. Lower win rate (72.7%) but larger potential moves.
`;

function buildScoringModeBlock(candidates: AiEvaluationRequest[]): string {
  const modes = [...new Set(candidates.map(c => c.mode))];
  return SCORING_MODE_CONTEXT + `Active mode(s) in this batch: ${modes.join(", ")}\n`;
}

// ── Helper: Build candidate data block with structured payload ────

function buildCandidateBlock(c: AiEvaluationRequest, index: number, total: number): string {
  // Use per-mode TRADE thresholds matching market.ts makeModeBreakdown — NOT the old hardcoded 70/50.
  // Old thresholds (70/50) told AI "NO_TRADE" for every candidate since quant scores are 25-55%,
  // causing AI to follow suit with low confidence REJECT verdicts.
  const MODE_TRADE_THRESHOLDS: Record<string, number> = {
    FLOW: 28, AGGRESSIVE: 25, BALANCED: 35, CAPITAL_GUARD: 35,
  };
  const tradeThreshold = MODE_TRADE_THRESHOLDS[c.mode] ?? 35;
  const watchThreshold = Math.round(tradeThreshold * 0.75);

  const candidate: AiEngineCandidate = {
    symbol: c.symbol,
    mode: c.mode,
    quantScore: c.quantScore,
    decision: c.quantScore >= tradeThreshold ? "TRADE" : c.quantScore >= watchThreshold ? "WATCH" : "NO_TRADE",
    direction: c.direction,
    tradeValidity: c.tradeValidity,
    entryWindow: c.entryWindow,
    slippageRisk: c.slippageRisk,
    setup: c.setup,
    entryLow: c.entryLow,
    entryHigh: c.entryHigh,
    slLevels: c.slLevels,
    tpLevels: c.tpLevels,
    horizon: c.horizon,
    timeframe: c.timeframe,
    modeScores: {},
    pricePrecision: getPrecision(c),
    scannedAt: Date.now(),
    quantSnapshot: (c as Record<string, unknown>).quantSnapshot as Record<string, unknown> | undefined,
    entryMid: (c.entryLow + c.entryHigh) / 2,
    riskR: Math.abs((c.entryLow + c.entryHigh) / 2 - c.slLevels[0]),
    rewardR: Math.abs(c.tpLevels[0] - (c.entryLow + c.entryHigh) / 2),
    rrRatio: c.rrRatio,
  };

  const payload = buildStructuredPayload(candidate, c.softFlags);
  return `--- Candidate ${index + 1}/${total}: ${c.symbol} (mode: ${c.mode}) ---\n${JSON.stringify(payload, null, 2)}`;
}

// ── PRIME: Strategic Evaluator Prompt Builder ─────────────────────

function buildPrimeEvaluationPrompt(
  candidates: AiEvaluationRequest[],
): { systemPrompt: string; userPrompt: string } {
  const blocks = candidates.map((c, i) => buildCandidateBlock(c, i, candidates.length));

  const userPrompt = [
    `Evaluate ${candidates.length} pre-filtered trade candidate(s) using STRATEGIC ANALYSIS.`,
    `These are the TOP opportunities from the Coin Universe after 6-layer quant gate.`,
    ``,
    buildScoringModeBlock(candidates),
    `For EACH candidate:`,
    `1. CLASSIFY the market regime (TREND/RANGE/BREAKOUT/UNKNOWN)`,
    `2. COUNT directional conviction factors (0-9 aligned signals)`,
    `3. ASSESS entry quality (near structural level?)`,
    `4. EVALUATE risk architecture (cascade, trap, spread, SL placement)`,
    `5. PRODUCE final conviction score and decision`,
    ``,
    `Your DEFAULT is TRADE. These are pre-filtered top candidates. Confirm through structural analysis.`,
    `Return evaluations in JSON format as specified in the system prompt.`,
    ``,
    ...blocks,
  ].join("\n");

  return { systemPrompt: PRIME_SYSTEM_PROMPT, userPrompt };
}

// ── ALPHA: Quantitative Edge Prompt Builder ───────────────────────

function buildAlphaEvaluationPrompt(
  candidates: AiEvaluationRequest[],
): { systemPrompt: string; userPrompt: string } {
  const blocks = candidates.map((c, i) => {
    const baseBlock = buildCandidateBlock(c, i, candidates.length);

    // Add data completeness summary for Alpha
    const snapshot = (c as Record<string, unknown>).quantSnapshot as Record<string, unknown> | undefined;
    let completenessNote = "";
    if (snapshot) {
      const keys = Object.keys(snapshot);
      const nonNull = keys.filter(k => snapshot[k] != null && snapshot[k] !== "").length;
      const completeness = Math.round((nonNull / Math.max(keys.length, 1)) * 100);
      completenessNote = `\n[Data Completeness: ${completeness}% — ${nonNull}/${keys.length} fields present]`;
    }

    return baseBlock + completenessNote;
  });

  const userPrompt = [
    `Evaluate ${candidates.length} pre-filtered trade candidate(s) using QUANTITATIVE EDGE ANALYSIS.`,
    `These are the TOP opportunities from the Coin Universe after 6-layer quant gate.`,
    ``,
    buildScoringModeBlock(candidates),
    `For EACH candidate:`,
    `1. CHECK data integrity — completeness, missing signals, inflation risk`,
    `2. CALCULATE independent expected value: EV = (pWin × avgReward) - ((1-pWin) × avgRisk)`,
    `3. MEASURE signal agreement — how many of 8 groups agree (score > 50)?`,
    `4. VERIFY SL/TP are at structural levels (not random numbers)`,
    `5. PRODUCE edge verdict — APPROVE only if +EV and data is clean`,
    ``,
    `Your DEFAULT is APPROVE. Trust the math. If EV is positive, APPROVE.`,
    `Return evaluations in JSON format as specified in the system prompt.`,
    ``,
    ...blocks,
  ].join("\n");

  return { systemPrompt: ALPHA_SYSTEM_PROMPT, userPrompt };
}

// ── CLOUD_FLOW: Flow & Microstructure Prompt Builder ──────────────

function buildCloudFlowEvaluationPrompt(
  candidates: AiEvaluationRequest[],
): { systemPrompt: string; userPrompt: string } {
  const blocks = candidates.map((c, i) => {
    const baseBlock = buildCandidateBlock(c, i, candidates.length);

    // Add flow signals enrichment if available
    const flowSignals = (c as Record<string, unknown>).flowSignals as Record<string, unknown> | undefined;
    let flowBlock = "";
    if (flowSignals && Object.keys(flowSignals).length > 3) {
      flowBlock = `\n[FLOW SIGNAL ENRICHMENT]\n${JSON.stringify(flowSignals, null, 2)}`;
    }

    return baseBlock + flowBlock;
  });

  const userPrompt = [
    `Evaluate ${candidates.length} pre-filtered trade candidate(s) using FLOW & MICROSTRUCTURE ANALYSIS.`,
    `These are the TOP opportunities from the Coin Universe after 6-layer quant gate.`,
    ``,
    buildScoringModeBlock(candidates),
    `For EACH candidate:`,
    `1. ASSESS flow state — orderbook imbalance, aggressor flow, depth quality`,
    `2. EVALUATE positioning — OI change, funding bias, move participation`,
    `3. GRADE momentum — real momentum, compression, expansion probability`,
    `4. CHECK execution window — spread regime, entry timing, fill quality`,
    `5. PRODUCE flow edge score and decision`,
    ``,
    `Your DEFAULT is TRADE. When flow confirms direction, TRADE IT. Structure is secondary.`,
    `Return evaluations in JSON format as specified in the system prompt.`,
    ``,
    ...blocks,
  ].join("\n");

  return { systemPrompt: CLOUD_FLOW_SYSTEM_PROMPT, userPrompt };
}

/** Helper to convert RankedCandidate to AiEvaluationRequest */
export function toEvaluationRequest(ranked: RankedCandidate): AiEvaluationRequest {
  const c = ranked.candidate;
  const req: AiEvaluationRequest = {
    symbol: c.symbol,
    direction: c.direction,
    quantScore: c.quantScore,
    mode: c.mode,
    entryLow: c.entryLow,
    entryHigh: c.entryHigh,
    slLevels: c.slLevels,
    tpLevels: c.tpLevels,
    rrRatio: c.rrRatio,
    horizon: c.horizon,
    timeframe: c.timeframe,
    setup: c.setup,
    tradeValidity: c.tradeValidity,
    entryWindow: c.entryWindow,
    slippageRisk: c.slippageRisk,
    softFlags: ranked.softFlags,
  };
  // Carry through quantSnapshot, alpha, and flowSignals for Axiom prompt builder
  if (c.quantSnapshot) {
    (req as Record<string, unknown>).quantSnapshot = c.quantSnapshot;
    const alpha = (c.quantSnapshot as Record<string, unknown>).alpha;
    if (alpha) (req as Record<string, unknown>).alpha = alpha;
  }
  if (c.flowSignals) {
    (req as Record<string, unknown>).flowSignals = c.flowSignals;
  }
  return req;
}

function getPrecision(c: { entryLow: number }): number {
  const price = c.entryLow;
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 6;
  return 8;
}

/** Build alpha signal context lines for the AI prompt (if available). */
function buildAlphaLines(c: AiEvaluationRequest): (string | null)[] {
  // Alpha signals are passed via quantSnapshot in the ranked candidate
  // For now we access via the softFlags which carry alpha grade info
  // In production, alpha data will be available through the enriched candidate pipeline
  const alpha = (c as Record<string, unknown>).alpha as Record<string, unknown> | undefined;
  if (!alpha) return [];

  const lines: (string | null)[] = [];
  lines.push(`  alpha_grade: ${alpha.alphaGrade ?? "?"} | bonus: +${alpha.alphaBonus ?? 0} | penalty: -${alpha.alphaPenalty ?? 0}`);

  const funding = alpha.funding as Record<string, unknown> | null;
  if (funding) {
    lines.push(`  funding: ${funding.fundingDirection} extreme=${funding.isExtreme} crowding=${funding.fundingCrowdingIndex}`);
  }

  const multiTf = alpha.multiTf as Record<string, unknown> | null;
  if (multiTf) {
    lines.push(`  mtf_align: ${multiTf.multiTfAlignmentScore}% htf=${multiTf.htfTrendBias} strength=${multiTf.htfTrendStrength}`);
  }

  const liquidation = alpha.liquidation as Record<string, unknown> | null;
  if (liquidation && (liquidation.cascadeScore as number) > 30) {
    lines.push(`  liq_risk: ${liquidation.cascadeScore} dominant=${liquidation.dominantRisk}`);
  }

  const timing = alpha.timing as Record<string, unknown> | null;
  if (timing) {
    lines.push(`  timing: grade=${timing.timingGrade} ignition=${timing.momentumIgnitionScore}`);
  }

  const vol = alpha.volatility as Record<string, unknown> | null;
  if (vol) {
    lines.push(`  volatility: regime=${vol.volatilityRegime} compression=${vol.compressionScore} expansion=${vol.expansionForecast}`);
  }

  return lines;
}
