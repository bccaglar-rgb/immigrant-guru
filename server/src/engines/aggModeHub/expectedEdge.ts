/**
 * Aggressive Mode Hub V2 — Edge Quality Score
 * Same formula as FLOW, uses AGG config weights
 */

import type { HubInput, EdgeQualityResult } from "./types.ts";
import { EDGE_WEIGHTS } from "./config.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function mapEdgeValue(edge: number): number {
  if (edge <= 0) return 0;
  if (edge < 0.10) return 35;
  if (edge < 0.20) return 55;
  if (edge < 0.35) return 72;
  if (edge < 0.50) return 85;
  return 95;
}

function mapRRQuality(rr: number): number {
  if (rr <= 0) return 0;
  if (rr < 0.5) return 25;
  if (rr < 1.0) return 45;
  if (rr < 1.5) return 60;
  if (rr < 2.0) return 75;
  if (rr < 3.0) return 85;
  return 95;
}

function getRegimeEdgeMult(regime: string): number {
  switch (regime) {
    case "TREND": return 1.0;
    case "RANGE": return 0.85;
    case "BREAKOUT_SETUP": return 0.95;
    case "FAKE_BREAK_RISK": return 0.70;
    case "HIGH_STRESS": return 0.65;
    default: return 0.80;
  }
}

export function calculateEdgeQuality(
  input: HubInput,
  regimeMultiplier: number,
  regime: string,
): EdgeQualityResult {
  const expectedEdgeR = (input.pWin * input.avgWinR) - ((1 - input.pWin) * 1.0) - input.costR;

  const exitReliabilityRaw = (
    0.40 * clamp(input.obStability, 0, 1) +
    0.30 * clamp(input.depthQuality, 0, 1) +
    0.30 * (1 - clamp(input.riskScore, 0, 1))
  );
  const exitReliability = clamp(exitReliabilityRaw * 100, 0, 100);

  const regimeEdgeMult = getRegimeEdgeMult(regime);
  const realizedEdgeProxy = expectedEdgeR *
    Math.max(input.fillProbability, 0.1) *
    (exitReliabilityRaw || 0.5) *
    regimeEdgeMult;

  const edgeValue = mapEdgeValue(realizedEdgeProxy);
  const rrQuality = mapRRQuality(input.avgWinR);

  const biasSignals = [
    input.trendDirBias, input.vwapBias, input.emaBias,
    input.levelReactionBias, input.orderflowBias, input.positioningBias,
  ];
  const avgBiasDir = biasSignals.reduce((a, b) => a + b, 0) / biasSignals.length;
  const agreementCount = biasSignals.filter(b =>
    (avgBiasDir > 0 && b > 0.1) || (avgBiasDir < 0 && b < -0.1)
  ).length;
  const winModelAgreement = clamp((agreementCount / 6) * 100, 0, 100);

  const total = Math.round((
    EDGE_WEIGHTS.edgeValue * edgeValue +
    EDGE_WEIGHTS.rrQuality * rrQuality +
    EDGE_WEIGHTS.winModelAgreement * winModelAgreement +
    EDGE_WEIGHTS.exitReliability * exitReliability
  ) * 10) / 10;

  return {
    expectedEdgeR: Math.round(expectedEdgeR * 10000) / 10000,
    realizedEdgeProxy: Math.round(realizedEdgeProxy * 10000) / 10000,
    edgeValue, rrQuality,
    winModelAgreement: Math.round(winModelAgreement * 10) / 10,
    exitReliability: Math.round(exitReliability * 10) / 10,
    total,
  };
}
