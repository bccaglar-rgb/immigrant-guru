import type {
  AiEngineConfig,
  AiEvaluationResponse,
  RankedCandidate,
  ValidatedResult,
} from "./types.ts";

const PREFIX = "[AIEngineV2:Validator]";
const MAX_LEVEL_DEVIATION = 0.05; // 5% — give AI room to adjust levels based on context
const MIN_ENTRY_ZONE_PCT = 0.008; // 0.8% — minimum zone width to avoid ENTRY_MISSED

/**
 * Validates AI output against deterministic inputs.
 * Rejects contradictory, hallucinated, or invalid outputs.
 * Produces final decision + blended score.
 */
export function validateOutputs(
  ranked: RankedCandidate[],
  aiResponses: AiEvaluationResponse[],
  config: AiEngineConfig,
): ValidatedResult[] {
  const results: ValidatedResult[] = [];

  // Build AI response lookup by symbol
  const responseMap = new Map<string, AiEvaluationResponse>();
  for (const r of aiResponses) {
    responseMap.set(r.symbol.toUpperCase(), r);
  }

  for (const r of ranked) {
    const c = r.candidate;
    const ai = responseMap.get(c.symbol.toUpperCase());

    // No AI response for this candidate — use deterministic fallback
    if (!ai) {
      const fallback = deterministicFallback(r, config);
      if (fallback) results.push(fallback);
      continue;
    }

    // Skip rejected
    if (ai.verdict === "REJECT") continue;

    // Validate direction immutability
    const inputDir = c.direction.toUpperCase();
    if (inputDir === "LONG" && ai.adjustedDirection !== "LONG") {
      console.warn(`${PREFIX} ${c.symbol}: AI flipped direction LONG→${ai.adjustedDirection}, rejecting`);
      continue;
    }
    if (inputDir === "SHORT" && ai.adjustedDirection !== "SHORT") {
      console.warn(`${PREFIX} ${c.symbol}: AI flipped direction SHORT→${ai.adjustedDirection}, rejecting`);
      continue;
    }

    // Validate level bounds (entry, SL, TP within 2%)
    const entryLow = ai.adjustedEntryLow > 0 ? ai.adjustedEntryLow : c.entryLow;
    const entryHigh = ai.adjustedEntryHigh > 0 ? ai.adjustedEntryHigh : c.entryHigh;
    const slLevels = ai.adjustedSlLevels.length > 0 ? ai.adjustedSlLevels : c.slLevels;
    const tpLevels = ai.adjustedTpLevels.length > 0 ? ai.adjustedTpLevels : c.tpLevels;

    if (!withinBounds(entryLow, c.entryLow) || !withinBounds(entryHigh, c.entryHigh)) {
      console.warn(`${PREFIX} ${c.symbol}: AI entry out of bounds, using original`);
    }

    // Use original if AI levels deviate too much
    let finalEntryLow = withinBounds(entryLow, c.entryLow) ? entryLow : c.entryLow;
    let finalEntryHigh = withinBounds(entryHigh, c.entryHigh) ? entryHigh : c.entryHigh;
    let finalSl = slLevels.every((sl, i) => i < c.slLevels.length && withinBounds(sl, c.slLevels[i]))
      ? slLevels : c.slLevels;
    let finalTp = tpLevels.every((tp, i) => i < c.tpLevels.length && withinBounds(tp, c.tpLevels[i]))
      ? tpLevels : c.tpLevels;

    // ── Enforce per-mode TP margin bounds ─────────────────────────────
    // V9: Mode-specific ranges — lower TP max for achievability, wider SL for noise room
    // $100 position @ 10x leverage: margin $5 = 0.5% price move
    const TP_MARGIN_RANGES: Record<string, [number, number]> = {
      FLOW:          [3, 10],   // $3-$10 win (0.3-1.0% move)
      AGGRESSIVE:    [8, 15],   // $8-$15 win (0.8-1.5% move) — confidence-scaled, each win > each loss
      BALANCED:      [5, 8],    // $5-$8 win (0.5-0.8% move) — moderate TP, proven 53% WR sweet spot
      CAPITAL_GUARD: [4, 7],    // $4-$7 win — capital protection + profitable asymmetry
    };
    // ── Enforce per-mode SL margin bounds ─────────────────────────────
    // V9: SL widened to give price room to breathe — tight SL = noise stops
    const SL_MARGIN_RANGES: Record<string, [number, number]> = {
      FLOW:          [3, 10],   // $3-$10 loss — wider SL for flow/momentum
      AGGRESSIVE:    [3, 5],    // $3-$5 loss — tight SL, each win must exceed each loss
      BALANCED:      [3, 5],    // $3-$5 loss — controlled losses, TP > SL for +EV
      CAPITAL_GUARD: [3, 4],    // $3-$4 loss — TIGHT SL = capital protection priority
    };
    const CLAMP_LEVERAGE = 10;
    const refMid = (finalEntryLow + finalEntryHigh) / 2;
    const dir = c.direction.toUpperCase();

    // ── SL clamp ────────────────────────────────────────────────────
    const slRange = SL_MARGIN_RANGES[c.mode] ?? [2, 10];
    if (finalSl.length > 0 && refMid > 0) {
      const slPriceDist = Math.abs(finalSl[0] - refMid) / refMid;
      const slMarginPct = slPriceDist * 100 * CLAMP_LEVERAGE;
      const [slMinM, slMaxM] = slRange;
      if (slMarginPct < slMinM || slMarginPct > slMaxM) {
        const clampedSlMargin = Math.min(Math.max(slMarginPct, slMinM), slMaxM);
        const clampedSlPP = clampedSlMargin / 100 / CLAMP_LEVERAGE;
        const clampedSlVal = dir === "LONG" ? refMid * (1 - clampedSlPP) : refMid * (1 + clampedSlPP);
        finalSl = [Number(clampedSlVal.toFixed(c.pricePrecision))];
      } else {
        finalSl = [finalSl[0]];
      }
    }

    // ── TP clamp ────────────────────────────────────────────────────
    const tpRange = TP_MARGIN_RANGES[c.mode] ?? [3, 20];
    if (finalTp.length > 0 && refMid > 0) {
      const tpPriceDist = Math.abs(finalTp[0] - refMid) / refMid;
      const currentMarginPct = tpPriceDist * 100 * CLAMP_LEVERAGE;
      const [minM, maxM] = tpRange;
      if (currentMarginPct < minM || currentMarginPct > maxM) {
        const clampedMargin = Math.min(Math.max(currentMarginPct, minM), maxM);
        const clampedPP = clampedMargin / 100 / CLAMP_LEVERAGE;
        const clampedTpVal = dir === "LONG" ? refMid * (1 + clampedPP) : refMid * (1 - clampedPP);
        finalTp = [Number(clampedTpVal.toFixed(c.pricePrecision))];
      } else {
        // Ensure single TP level
        finalTp = [finalTp[0]];
      }
    }

    // ── AGGRESSIVE mode: confidence-scaled single TP, SL = 55% of TP distance ──
    // $100 × 10x = $1000 position. Fee ≈ $0.80/trade.
    // TP targets $8-$15, SL = 55% of TP → $4.4-$8.25
    // At 50% WR: EV = 0.5×$8 − 0.5×$4.4 − $0.80 = +$1.00/trade
    // At 55% WR: EV = 0.55×$10 − 0.45×$5.5 − $0.80 = +$1.45/trade
    if (c.mode === "AGGRESSIVE" && refMid > 0 && ai) {
      const conf = ai.confidence;
      // Confidence → TP margin: 50→$8, 60→$10.33, 70→$12.67, 80+→$15
      const confClamped = Math.min(Math.max(conf, 50), 80);
      const tpMarginTarget = 8 + (confClamped - 50) * (15 - 8) / 30;
      const tpPricePct = tpMarginTarget / (100 * CLAMP_LEVERAGE);
      const aggTpVal = dir === "LONG" ? refMid * (1 + tpPricePct) : refMid * (1 - tpPricePct);
      finalTp = [Number(aggTpVal.toFixed(c.pricePrecision))];

      // SL = 55% of TP distance → each win > each loss after fees
      const aggTpDist = Math.abs(finalTp[0] - refMid);
      const aggSlDist = aggTpDist * 0.55;
      const aggSlVal = dir === "LONG" ? refMid - aggSlDist : refMid + aggSlDist;
      finalSl = [Number(aggSlVal.toFixed(c.pricePrecision))];
    }

    // ── BALANCED mode: confidence-scaled single TP, SL = 65% of TP distance ──
    // Data: TP 5-6 bucket had 53.6% WR (best), TP>=5+SL<4 had best EV (-$0.29)
    // TP targets $5-$8, SL = 65% of TP → $3.25-$5.20
    // At 48% WR: EV = 0.48×$6 − 0.52×$3.9 − $0.80 = +$0.09/trade
    // At 50% WR: EV = 0.50×$6 − 0.50×$3.9 − $0.80 = +$0.25/trade
    if (c.mode === "BALANCED" && refMid > 0 && ai) {
      const conf = ai.confidence;
      // Confidence → TP margin: 40→$5, 50→$6, 60→$7, 70+→$8
      const confClamped = Math.min(Math.max(conf, 40), 70);
      const balTpMarginTarget = 5 + (confClamped - 40) * (8 - 5) / 30;
      const balTpPricePct = balTpMarginTarget / (100 * CLAMP_LEVERAGE);
      const balTpVal = dir === "LONG" ? refMid * (1 + balTpPricePct) : refMid * (1 - balTpPricePct);
      finalTp = [Number(balTpVal.toFixed(c.pricePrecision))];

      // SL = 65% of TP distance → moderate asymmetry, controlled losses
      const balTpDist = Math.abs(finalTp[0] - refMid);
      const balSlDist = balTpDist * 0.65;
      const balSlVal = dir === "LONG" ? refMid - balSlDist : refMid + balSlDist;
      finalSl = [Number(balSlVal.toFixed(c.pricePrecision))];
    }

    // ── CAPITAL_GUARD mode: confidence-scaled single TP, SL = 70% of TP distance ──
    // Data: Avg loss $7.91 ≈ Avg win $7.58 → symmetric = negative EV after fees
    // Fix: Tight SL ($3-$4) for capital protection, TP ($4-$7) > SL
    // At 50% WR: EV = 0.50×$5.5 − 0.50×$3.5 − $0.80 = +$0.20/trade
    if (c.mode === "CAPITAL_GUARD" && refMid > 0 && ai) {
      const conf = ai.confidence;
      // Confidence → TP margin: 65→$4, 70→$5, 75→$6, 80+→$7
      const confClamped = Math.min(Math.max(conf, 65), 80);
      const cgTpMarginTarget = 4 + (confClamped - 65) * (7 - 4) / 15;
      const cgTpPricePct = cgTpMarginTarget / (100 * CLAMP_LEVERAGE);
      const cgTpVal = dir === "LONG" ? refMid * (1 + cgTpPricePct) : refMid * (1 - cgTpPricePct);
      finalTp = [Number(cgTpVal.toFixed(c.pricePrecision))];

      // SL = 70% of TP distance → tight losses, capital protection
      const cgTpDist = Math.abs(finalTp[0] - refMid);
      const cgSlDist = cgTpDist * 0.70;
      const cgSlVal = dir === "LONG" ? refMid - cgSlDist : refMid + cgSlDist;
      finalSl = [Number(cgSlVal.toFixed(c.pricePrecision))];
    }

    // ── Minimum RR enforcement (per-mode) ──────────────────────────────
    // V9: FLATTENED — old curve (1.80→5.00) tightened SL so much it always got hit.
    // High RR = tight SL = low P(TP). At RR=5.0, P(TP)=17% under random walk!
    // Geometry (SL/TP ratio) is now enforced in persistence.ts MODE_MIN_SL_TP_RATIO.
    // This floor only prevents truly absurd setups (TP < 0.5x SL in dollar terms).
    const MIN_RR_FLOOR = 0.50;
    if (finalSl.length > 0 && finalTp.length > 0 && refMid > 0) {
      const tpDist = Math.abs(finalTp[0] - refMid);
      const slDist = Math.abs(finalSl[0] - refMid);
      const currentRR = slDist > 0 ? tpDist / slDist : 0;
      if (currentRR < MIN_RR_FLOOR && tpDist > 0) {
        // Tighten SL to achieve MIN_RR_FLOOR
        const targetSlDist = tpDist / MIN_RR_FLOOR;
        const targetSlVal = dir === "LONG" ? refMid - targetSlDist : refMid + targetSlDist;
        finalSl = [Number(targetSlVal.toFixed(c.pricePrecision))];
      }
    }

    // ── Widen narrow entry zones to prevent ENTRY_MISSED ──────────
    // Average zone was 0.38% — price often skips past. Enforce minimum 0.8% zone width.
    const zoneMid = (finalEntryLow + finalEntryHigh) / 2;
    const zoneWidth = (finalEntryHigh - finalEntryLow) / zoneMid;
    if (zoneWidth < MIN_ENTRY_ZONE_PCT && zoneMid > 0) {
      const halfWidth = (MIN_ENTRY_ZONE_PCT / 2) * zoneMid;
      finalEntryLow = zoneMid - halfWidth;
      finalEntryHigh = zoneMid + halfWidth;
    }

    // Check RR after adjustment
    const entryMid = (finalEntryLow + finalEntryHigh) / 2;
    const riskR = Math.abs(entryMid - finalSl[0]);
    const rewardR = Math.abs(finalTp[0] - entryMid);
    const adjustedRR = riskR > 0 ? rewardR / riskR : 0;

    if (adjustedRR < config.minRR && ai.verdict === "APPROVE") {
      console.warn(`${PREFIX} ${c.symbol}: adjusted RR ${adjustedRR.toFixed(2)} < ${config.minRR}, low RR`);
    }

    // ── Score blending (v3 — trade-biased) ────────────────────────────
    // No confidence deflation — AI already passed per-module confidence filter.
    // RR bonus starts from 0.2 — even low RR gets some credit (historical 85%+ win rate makes it profitable)
    // Score blending: quant 35% + AI 40% + gate 10% + RR bonus 15%
    // Increased quant+AI weight, reduced RR dependence — RR is already checked in final decision.
    const gateAdjustment = r.adjustedScore - c.quantScore;
    const rrBonus = clamp((adjustedRR - 0.2) * 25, 0, 40);
    const blendedScore = clamp(
      c.quantScore * 0.35 + ai.confidence * 0.40 + gateAdjustment * 0.10 + rrBonus * 0.15,
      0, 100,
    );

    // Final decision — V12: Significantly tightened thresholds
    // DATA (7-day, 3396 ideas): ai-chatgpt 57.5% WR, ai-qwen2 50.9%, system-scanner 34.9%
    //   Ideas with blendedScore <45 had <40% WR — net losers after fees.
    //   CAPITAL_GUARD produced 2136 ideas in 48h, 300 with conf <40 — pure noise.
    // FIX: Raise all bars dramatically. Only high-conviction AI signals become TRADE.
    //
    // TRADE: (AI APPROVE + blended >= 48 + RR >= 0.50 + confidence >= 40)
    //     OR (AI DOWNGRADE + blended >= 55 + RR >= 0.55 + confidence >= 45) — very strict
    // WATCH: AI APPROVE with blended >= 35 (was 22)
    let finalDecision: "TRADE" | "WATCH" | "NO_TRADE";
    if (ai.verdict === "APPROVE" && blendedScore >= 48 && adjustedRR >= 0.50 && ai.confidence >= 40) {
      finalDecision = "TRADE";
    } else if (ai.verdict === "DOWNGRADE" && blendedScore >= 55 && adjustedRR >= 0.55 && ai.confidence >= 45) {
      // Only promote DOWNGRADEs with very high scores
      finalDecision = "TRADE";
    } else if (ai.verdict === "APPROVE" && blendedScore >= 35) {
      finalDecision = "WATCH";
    } else if (ai.verdict === "DOWNGRADE" && blendedScore >= 35) {
      finalDecision = "WATCH";
    } else {
      finalDecision = "NO_TRADE";
    }

    // ── V12: Per-mode confidence gates (raised significantly) ──
    // DATA: Low-confidence ideas across all modes had terrible win rates.
    // AGGRESSIVE mode confidence gates:
    // ≥60% → TRADE, 48-59% → WATCH, <48% → NO_TRADE
    if (c.mode === "AGGRESSIVE") {
      if (finalDecision === "TRADE" && ai.confidence < 60) {
        finalDecision = ai.confidence >= 48 ? "WATCH" : "NO_TRADE";
      } else if (finalDecision === "WATCH" && ai.confidence < 48) {
        finalDecision = "NO_TRADE";
      }
    }
    // BALANCED mode confidence gates:
    // ≥65% → TRADE, 50-64% → WATCH, <50% → NO_TRADE
    if (c.mode === "BALANCED") {
      if (finalDecision === "TRADE" && ai.confidence < 65) {
        finalDecision = ai.confidence >= 50 ? "WATCH" : "NO_TRADE";
      } else if (finalDecision === "WATCH" && ai.confidence < 50) {
        finalDecision = "NO_TRADE";
      }
    }
    // FLOW mode confidence gates:
    // ≥60% → TRADE, 48-59% → WATCH, <48% → NO_TRADE
    if (c.mode === "FLOW") {
      if (finalDecision === "TRADE" && ai.confidence < 60) {
        finalDecision = ai.confidence >= 48 ? "WATCH" : "NO_TRADE";
      } else if (finalDecision === "WATCH" && ai.confidence < 48) {
        finalDecision = "NO_TRADE";
      }
    }
    // CAPITAL_GUARD mode confidence gates:
    // ≥72% → TRADE, 55-71% → WATCH, <55% → NO_TRADE
    if (c.mode === "CAPITAL_GUARD") {
      if (finalDecision === "TRADE" && ai.confidence < 72) {
        finalDecision = ai.confidence >= 55 ? "WATCH" : "NO_TRADE";
      } else if (finalDecision === "WATCH" && ai.confidence < 55) {
        finalDecision = "NO_TRADE";
      }
    }

    results.push({
      candidate: c,
      aiResponse: ai,
      finalScore: Math.round(blendedScore * 100) / 100,
      finalDecision,
      finalDirection: ai.adjustedDirection,
      entryLow: finalEntryLow,
      entryHigh: finalEntryHigh,
      slLevels: finalSl,
      tpLevels: finalTp,
      // Carry through Axiom analysis from AI response
      axiomAnalysis: ai.axiomAnalysis,
    });
  }

  return results;
}

// ── Helpers ────────────────────────────────────────────────────

function withinBounds(adjusted: number, original: number): boolean {
  if (original === 0) return true;
  return Math.abs(adjusted - original) / original <= MAX_LEVEL_DEVIATION;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Deterministic fallback when AI doesn't respond for a candidate.
 * Very conservative: only produces NO_TRADE — without AI confirmation, skip.
 * Previously produced WATCH which polluted the pipeline with unverified ideas.
 */
function deterministicFallback(
  _r: RankedCandidate,
  _config: AiEngineConfig,
): ValidatedResult | null {
  // No AI response = no trade. We don't trust deterministic-only decisions.
  return null;
}
