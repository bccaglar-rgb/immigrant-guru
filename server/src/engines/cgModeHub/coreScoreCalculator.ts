/**
 * Capital Guard Mode Hub — Core Score Calculator (v4: 5-Block System)
 *
 * 5 blocks: MQ(22%) + DQ(16%) + EQ(24%) + EdgeQ(18%) + CP(20%)
 *
 * Key CG differences from Balanced:
 * - EQ is HIGHEST weight (0.24) — execution quality is paramount for capital preservation
 * - DQ is LOWEST weight (0.16) — direction matters less if stops are solid
 * - CP (Capital Protection) is the 5th block unique to CG
 * - Each sub-score base 50, ± adjustments, clamped 0-100
 */

import type { HubInput, CgBlockScoreResult, CapitalProtectionResult } from "./types.ts";
import { CG_BLOCK_WEIGHTS } from "./config.ts";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * MQ (Market Quality, 0-100) — trend clarity, structure, regime health, HTF alignment
 * CG version: heavier penalty for weak structure, bonus for clear trending regimes
 */
function calcMQ(d: HubInput): number {
  let s = 50;

  // HTF trend alignment
  s += d.htfTrend > 0.6 ? 12 : d.htfTrend > 0.3 ? 6 : -6;

  // EMA alignment
  s += d.emaAlignment > 0.6 ? 10 : d.emaAlignment > 0.3 ? 4 : -6;

  // Trend strength
  s += d.trendStrength > 0.7 ? 10 : d.trendStrength > 0.4 ? 5 : -8;

  // Compression (moderate bonus in CG — potential breakout)
  s += d.compression > 0.6 ? 6 : 0;

  // Level reaction (critical for CG — need clear levels for stops)
  s += d.levelReaction > 0.6 ? 10 : d.levelReaction > 0.3 ? 4 : -3;

  // Negative: structural issues (heavier in CG)
  s -= d.midRangeTrap > 0.5 ? 10 : 0;
  s -= d.trendMaturity > 0.7 ? 6 : 0;
  s -= d.weakAcceptance > 0.5 ? 10 : 0;
  s -= d.chasedEntry > 0.5 ? 8 : 0;

  return clamp(s, 0, 100);
}

/**
 * DQ (Direction Quality, 0-100) — bias strength, confirmations, contradictions
 * CG version: lower weight (0.16) but still important for trade direction
 */
function calcDQ(d: HubInput): number {
  let s = 50;

  // Confirmations (each adds 6-8 in CG)
  s += d.oiConfirm > 0.5 ? 7 : 0;
  s += d.volumeConfirm > 0.5 ? 7 : 0;
  s += d.fundingHealthy > 0.6 ? 6 : 0;
  s += d.crowdingLow > 0.6 ? 6 : 0;

  // Directional strength
  s += Math.abs(d.trendDirBias) > 0.3 ? 8 : 0;
  s += Math.abs(d.vwapBias) > 0.3 ? 5 : 0;

  // Contradictions (heavier in CG)
  s -= d.oiDivergence > 0.5 ? 12 : 0;
  s -= d.crowdingHigh > 0.5 ? 12 : 0;
  s -= d.spotDerivDivergence > 0.5 ? 10 : 0;
  s -= d.weakParticipation > 0.5 ? 8 : 0;

  return clamp(s, 0, 100);
}

/**
 * EQ (Execution Quality, 0-100) — fill probability, slippage, spread, depth, entry window
 * CG version: HIGHEST weight (0.24) — execution quality is paramount
 */
function calcEQ(d: HubInput): number {
  let s = 50;

  // Entry window — v4.1: reduced bonuses to prevent binary 0/100.
  // Old: OPEN+18,CLOSED-25 → stacked to 100/0. New: moderate bonuses for gradient 25-82.
  if (d.entryWindowState === "OPEN") s += 10;
  else if (d.entryWindowState === "NARROW") s += 5;
  else if (d.entryWindowState === "CLOSING") s -= 2;
  else s -= 15; // CLOSED

  // Fill probability (reduced from 15/5/-15)
  s += d.fillProbability > 0.6 ? 6 : d.fillProbability > 0.3 ? 3 : -8;

  // Slippage (reduced from 15/3/-15)
  s += d.slippage === "LOW" ? 6 : d.slippage === "MODERATE" ? 2 : -8;

  // Spread (reduced from 8/3/-5, added negative)
  s += d.spreadScore > 0.6 ? 4 : d.spreadScore > 0.3 ? 2 : -3;

  // Depth (reduced from 8/3/-5, added negative)
  s += d.depthScore > 0.6 ? 4 : d.depthScore < 0.3 ? -3 : 0;

  // Capacity (reduced from 6)
  s += d.capacityScore > 0.6 ? 2 : 0;

  // Spoof detected (reduced from 12)
  s -= d.spoofDetected ? 8 : 0;

  return clamp(s, 0, 100);
}

/**
 * EdgeQ (Edge Quality, 0-100) — pWin, avgWinR, exit reliability, RR quality
 * CG version: focuses more on loss-containment than upside edge
 */
function calcEdgeQ(d: HubInput, edgeNetR: number): number {
  let s = 50;

  // pWin (probability of winning)
  s += d.pWin > 0.60 ? 12 : d.pWin > 0.50 ? 6 : d.pWin < 0.35 ? -15 : 0;

  // avgWinR (expected reward)
  s += d.avgWinR > 2.0 ? 12 : d.avgWinR > 1.5 ? 8 : d.avgWinR > 1.0 ? 4 : d.avgWinR < 0.5 ? -12 : 0;

  // edgeNetR (net risk-adjusted edge)
  s += edgeNetR > 0.30 ? 10 : edgeNetR > 0.20 ? 7 : edgeNetR > 0.10 ? 3 : edgeNetR < 0 ? -18 : 0;

  // Data health (affects edge reliability)
  s += d.dataHealthScore > 0.95 ? 5 : d.dataHealthScore < 0.85 ? -10 : 0;

  // Cost of trade
  s -= d.costR > 0.20 ? 8 : d.costR > 0.15 ? 4 : 0;

  // ATR fit = predictable moves = more reliable edge
  s += d.atrFit > 0.5 ? 5 : 0;

  // Sudden move risk = edge is unreliable in chaotic conditions
  s -= d.suddenMoveRisk > 0.5 ? 10 : 0;

  return clamp(s, 0, 100);
}

/**
 * Calculate all 5 block scores.
 * CP (Capital Protection) comes from capitalProtection.ts separately.
 */
export function calculateCgBlockScores(
  input: HubInput,
  edgeNetR: number,
  cpResult: CapitalProtectionResult,
): CgBlockScoreResult {
  const MQ = calcMQ(input);
  const DQ = calcDQ(input);
  const EQ = calcEQ(input);
  const EdgeQ = calcEdgeQ(input, edgeNetR);
  const CP = cpResult.score;

  const total = Math.round((
    CG_BLOCK_WEIGHTS.MQ * MQ +
    CG_BLOCK_WEIGHTS.DQ * DQ +
    CG_BLOCK_WEIGHTS.EQ * EQ +
    CG_BLOCK_WEIGHTS.EdgeQ * EdgeQ +
    CG_BLOCK_WEIGHTS.CP * CP
  ) * 10) / 10;

  return { MQ, DQ, EQ, EdgeQ, CP, total };
}
