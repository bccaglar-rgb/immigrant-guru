/**
 * Balanced Mode Hub — Block Score Calculator (v4: 4-Block System)
 *
 * 4-block weighted score: MQ(26%) + DQ(24%) + EQ(22%) + EdgeQ(28%)
 * Each block: base 50, add/subtract sub-metrics, clamped 0-100.
 *
 * MQ  = Market Quality:    trend clarity, structure, regime health, HTF alignment
 * DQ  = Direction Quality:  bias strength, confirmation count, contradiction count
 * EQ  = Execution Quality:  fill probability, slippage, spread, depth, entry window
 * EdgeQ = Edge Quality:     pWin, avgWinR, exit reliability, RR quality
 */

import type { HubInput, BlockScoreResult } from "./types.ts";
import { BLOCK_WEIGHTS } from "./config.ts";

function clamp(v: number, lo = 0, hi = 100): number { return Math.max(lo, Math.min(hi, v)); }

/* ── MQ: Market Quality (26%) ────────────────────────────────── */
function calcMQ(d: HubInput): number {
  let s = 50;

  // HTF trend
  if (d.htfTrend > 0.6) s += 15;
  else if (d.htfTrend > 0.3) s += 8;
  else s -= 5;

  // EMA alignment
  if (d.emaAlignment > 0.6) s += 10;
  else if (d.emaAlignment > 0.3) s += 5;
  else s -= 5;

  // Trend strength
  if (d.trendStrength > 0.7) s += 10;
  else if (d.trendStrength > 0.4) s += 5;
  else s -= 8;

  // Compression (breakout potential)
  if (d.compression > 0.6) s += 8;

  // Level reaction (key level bounce/rejection)
  if (d.levelReaction > 0.6) s += 8;

  // ── Negatives ──
  // Mid-range trap
  if (d.midRangeTrap > 0.5) s -= 8;

  // Trend maturity (exhaustion risk)
  if (d.trendMaturity > 0.7) s -= 5;

  // Weak acceptance
  if (d.weakAcceptance > 0.5) s -= 8;

  // Regime penalties
  if (d.regime === "HIGH_STRESS") s -= 10;
  else if (d.regime === "FAKE_BREAK_RISK") s -= 6;

  return clamp(s);
}

/* ── DQ: Direction Quality (24%) ─────────────────────────────── */
function calcDQ(d: HubInput): number {
  let s = 50;

  // ── Confirmations (each adds score) ──
  // OI confirms direction
  if (d.oiConfirm > 0.5) s += 8;

  // Volume confirms direction
  if (d.volumeConfirm > 0.5) s += 8;

  // Funding healthy (not overcrowded)
  if (d.fundingHealthy > 0.6) s += 8;

  // Crowding low
  if (d.crowdingLow > 0.6) s += 8;

  // Trend directional bias strength
  if (Math.abs(d.trendDirBias) > 0.3) s += 10;
  else if (Math.abs(d.trendDirBias) > 0.15) s += 5;

  // VWAP directional bias
  if (Math.abs(d.vwapBias) > 0.3) s += 6;

  // Liquidity bias fit
  if (d.liqBiasFit > 0.5) s += 5;

  // ── Contradictions (each subtracts score) ──
  // OI divergence (OI going opposite to price)
  if (d.oiDivergence > 0.5) s -= 10;

  // Crowding high
  if (d.crowdingHigh > 0.5) s -= 12;

  // Spot vs derivatives divergence
  if (d.spotDerivDivergence > 0.5) s -= 8;

  // Weak participation
  if (d.weakParticipation > 0.5) s -= 8;

  return clamp(s);
}

/* ── EQ: Execution Quality (22%) ─────────────────────────────── */
// v4.1: Reduced bonus magnitudes to prevent binary 3/100 outcome.
// Old: OPEN+20, fill+15, slip+15 → stacked to 100 when all good, 3 when bad.
// New: Moderate bonuses give gradient 35-80 range instead of binary.
function calcEQ(d: HubInput): number {
  let s = 50;

  // V4.1: Further reduced to prevent binary 3/94 clustering
  // Max possible: 50+8+5+5+3+3+2 = 76, Min: 50-15-6-6-3-3-8 = 9
  if (d.entryWindowState === "OPEN") s += 8;
  else if (d.entryWindowState === "NARROW") s += 4;
  else if (d.entryWindowState === "CLOSING") s += 1;
  else s -= 15; // CLOSED

  if (d.fillProbability > 0.6) s += 5;
  else if (d.fillProbability > 0.3) s += 2;
  else s -= 6;

  if (d.slippage === "LOW") s += 5;
  else if (d.slippage === "MODERATE") s += 2;
  else s -= 6; // HIGH

  if (d.spreadScore > 0.6) s += 3;
  else if (d.spreadScore > 0.3) s += 1;
  else s -= 3;

  if (d.depthScore > 0.6) s += 3;
  else if (d.depthScore < 0.3) s -= 3;

  if (d.capacityScore > 0.6) s += 2;

  if (d.spoofDetected) s -= 8;

  return clamp(s);
}

/* ── EdgeQ: Edge Quality (28%) ───────────────────────────────── */
// v4.1: Recalibrated for realistic edge values.
// With pWin capped at 0.58, edgeNetR typically 0.05-0.25 (not 0.70-0.85).
// Thresholds adjusted so EdgeQ spreads across 35-75 range.
function calcEdgeQ(d: HubInput, edgeNetR: number): number {
  let s = 50;

  // Win probability (adjusted for capped 0.58 max)
  if (d.pWin > 0.55) s += 10;
  else if (d.pWin > 0.45) s += 5;
  else if (d.pWin < 0.30) s -= 15;

  // Average win R (moderate bonuses)
  if (d.avgWinR > 2.0) s += 12;
  else if (d.avgWinR > 1.5) s += 8;
  else if (d.avgWinR > 1.0) s += 4;
  else if (d.avgWinR < 0.5) s -= 12;

  // Edge net R — recalibrated for realistic 0.05-0.30 range
  if (edgeNetR > 0.25) s += 10;
  else if (edgeNetR > 0.15) s += 6;
  else if (edgeNetR > 0.08) s += 3;
  else if (edgeNetR > 0) s += 0; // Slight positive edge = neutral
  else s -= 15; // Negative edge = heavy penalty

  // Data health
  if (d.dataHealthScore > 0.95) s += 4;
  else if (d.dataHealthScore < 0.85) s -= 8;

  // Cost drag
  if (d.costR > 0.20) s -= 8;
  else if (d.costR > 0.15) s -= 4;

  // ATR fit
  if (d.atrFit > 0.5) s += 4;

  // Sudden move risk
  if (d.suddenMoveRisk > 0.5) s -= 8;

  return clamp(s);
}

/* ── Main Export ── */
export function calculateBlockScores(input: HubInput, edgeNetR: number): BlockScoreResult {
  const MQ = calcMQ(input);
  const DQ = calcDQ(input);
  const EQ = calcEQ(input);
  const EdgeQ = calcEdgeQ(input, edgeNetR);

  const total =
    BLOCK_WEIGHTS.MQ * MQ +
    BLOCK_WEIGHTS.DQ * DQ +
    BLOCK_WEIGHTS.EQ * EQ +
    BLOCK_WEIGHTS.EdgeQ * EdgeQ;

  return { MQ, DQ, EQ, EdgeQ, total: Math.round(total * 100) / 100 };
}
