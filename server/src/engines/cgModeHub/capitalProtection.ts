/**
 * Capital Guard Mode Hub — Capital Protection Score (v4)
 *
 * UNIQUE TO CG MODE — the 5th scoring block.
 *
 * CapitalProtectionScore = weighted composite of 5 sub-scores:
 *   StopIntegrity (0.28)         — How solid the SL level is
 *   DrawdownContainment (0.24)   — How well drawdown is contained before SL
 *   InvalidationClarity (0.18)   — How clear the trade invalidation point is
 *   RegimeSafety (0.14)          — How safe the current regime is for capital
 *   AdverseMoveResilience (0.16) — How resilient the setup is to adverse moves
 *
 * Each sub-score: base 50, ± adjustments, clamped 0-100.
 */

import type { HubInput, CapitalProtectionResult } from "./types.ts";
import { CP_SUB_WEIGHTS } from "./config.ts";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * StopIntegrity (weight 0.28)
 * How solid and meaningful the stop-loss level is.
 * Good: ATR-aligned stops, clear structure levels, tight spreads near stop.
 * Bad: Stops in high-liquidity zones (hunt-able), wide spreads, no clear level.
 */
function calcStopIntegrity(d: HubInput): number {
  let s = 50;

  // ATR-aligned stop = meaningful distance
  s += d.atrFit > 0.6 ? 12 : d.atrFit > 0.4 ? 5 : -8;

  // Spread tightness matters for stop execution
  s += d.spreadTightness > 0.6 ? 10 : d.spreadTightness > 0.3 ? 4 : -10;

  // Strong structure = clear stop levels exist
  s += d.trendStrength > 0.6 ? 8 : d.trendStrength > 0.3 ? 3 : -5;

  // Level reaction = market respects levels (good for stops)
  s += d.levelReaction > 0.6 ? 10 : d.levelReaction > 0.3 ? 4 : -3;

  // High liquidity density near stop = stop-huntable (BAD)
  s -= d.liquidityDensity > 0.7 ? 12 : d.liquidityDensity > 0.5 ? 6 : 0;

  // Depth quality = stop will fill properly
  s += d.depthQuality > 0.6 ? 8 : d.depthQuality > 0.3 ? 3 : -8;

  // Failed sweep = levels get swept but reclaim (stop could trigger falsely)
  s -= d.failedSweep > 0.5 ? 8 : 0;

  // Spoof risk = stop could get hunted by spoof orders
  s -= d.spoofRisk > 0.5 ? 6 : 0;

  return clamp(s, 0, 100);
}

/**
 * DrawdownContainment (weight 0.24)
 * How well the setup contains potential drawdown before the stop is hit.
 * Good: Low volatility, low sudden-move risk, good fill probability.
 * Bad: High ATR, market speed fast, stress environment.
 */
function calcDrawdownContainment(d: HubInput): number {
  let s = 50;

  // Low ATR = smaller adverse excursions
  s += d.atrPct < 0.005 ? 12 : d.atrPct < 0.01 ? 6 : d.atrPct < 0.02 ? 0 : -12;

  // Sudden move risk = potential gap through stop
  s -= d.suddenMoveRisk > 0.6 ? 15 : d.suddenMoveRisk > 0.3 ? 8 : 0;

  // Market speed = faster markets harder to contain
  s += d.speedHealthy > 0.6 ? 8 : d.speedHealthy > 0.3 ? 3 : -8;

  // Fill probability = can exit quickly if needed
  s += d.fillProbability > 0.6 ? 10 : d.fillProbability > 0.3 ? 4 : -10;

  // Stress level = stressed markets have larger drawdowns
  s -= d.riskScore > 0.6 ? 12 : d.riskScore > 0.3 ? 5 : 0;

  // Slippage = adds to realized drawdown
  s += d.slippage === "LOW" ? 8 : d.slippage === "MODERATE" ? 0 : -10;

  // Capacity = can absorb position without moving market
  s += d.capacityScore > 0.6 ? 6 : d.capacityScore > 0.3 ? 2 : -4;

  return clamp(s, 0, 100);
}

/**
 * InvalidationClarity (weight 0.18)
 * How clear and unambiguous the trade invalidation point is.
 * Good: Strong trends, clear levels, good structure.
 * Bad: Range-bound, weak acceptance, mid-range traps, conflicting signals.
 */
function calcInvalidationClarity(d: HubInput): number {
  let s = 50;

  // Strong trend = clear invalidation if trend breaks
  s += d.trendStrength > 0.7 ? 12 : d.trendStrength > 0.4 ? 5 : -8;

  // Level reaction = market has clear levels to invalidate against
  s += d.levelReaction > 0.6 ? 10 : d.levelReaction > 0.3 ? 4 : -6;

  // EMA alignment = clear directional structure
  s += d.emaAlignment > 0.6 ? 8 : d.emaAlignment > 0.3 ? 3 : -5;

  // Weak acceptance = unclear where market "accepts" price (bad)
  s -= d.weakAcceptance > 0.6 ? 12 : d.weakAcceptance > 0.3 ? 6 : 0;

  // Mid-range trap = no clear invalidation in mid-range
  s -= d.midRangeTrap > 0.6 ? 10 : d.midRangeTrap > 0.3 ? 5 : 0;

  // Compression = unclear which way breakout goes
  s -= d.compressionActive ? 6 : 0;

  // OI + volume confirm = clearer invalidation when confirmed
  s += d.oiConfirm > 0.5 ? 5 : 0;
  s += d.volumeConfirm > 0.5 ? 5 : 0;

  return clamp(s, 0, 100);
}

/**
 * RegimeSafety (weight 0.14)
 * How safe the current market regime is for capital deployment.
 * Good: Clean trend, low stress.
 * Bad: High stress, fake breaks, dead volatility.
 */
function calcRegimeSafety(d: HubInput): number {
  let s = 50;

  // Risk score / stress = dangerous environment
  s -= d.riskScore > 0.7 ? 20 : d.riskScore > 0.5 ? 10 : d.riskScore > 0.3 ? 3 : 0;

  // Fake break risk = stops get triggered on fake moves
  s -= d.fakeBreakRisk > 0.6 ? 15 : d.fakeBreakRisk > 0.3 ? 7 : 0;

  // Dead volatility = no movement = capital sits idle (opportunity cost)
  s -= d.deadVolatility > 0.5 ? 8 : 0;

  // Trend strength = trending markets are safest
  s += d.trendStrength > 0.7 ? 12 : d.trendStrength > 0.4 ? 5 : -3;

  // ATR regime fit = normal ATR = predictable behavior
  s += d.atrFit > 0.6 ? 8 : d.atrFit > 0.3 ? 3 : -5;

  // Compression = potential vol expansion (risky)
  s -= d.compressionActive ? 5 : 0;

  // Speed healthy = manageable market conditions
  s += d.speedHealthy > 0.5 ? 6 : -3;

  return clamp(s, 0, 100);
}

/**
 * AdverseMoveResilience (weight 0.16)
 * How resilient the setup is if the market moves against the position.
 * Good: Deep orderbook, stable OB, high capacity, no spoofing.
 * Bad: Thin depth, spoof risk, crowded positioning, divergent spot/deriv.
 */
function calcAdverseMoveResilience(d: HubInput): number {
  let s = 50;

  // Depth quality = thick book absorbs adverse moves
  s += d.depthQuality > 0.6 ? 12 : d.depthQuality > 0.3 ? 5 : -10;

  // OB stability = orderbook doesn't collapse under pressure
  s += d.obStability > 0.6 ? 10 : d.obStability > 0.3 ? 4 : -6;

  // Capacity = can exit on adverse move without extra slippage
  s += d.capacityScore > 0.6 ? 8 : d.capacityScore > 0.3 ? 3 : -5;

  // Spoof risk = fake liquidity disappears on adverse move
  s -= d.spoofRisk > 0.5 ? 10 : 0;

  // Crowding = everyone exits together on adverse move (cascade)
  s -= d.crowdingHigh > 0.5 ? 10 : 0;

  // Spot vs derivatives divergence = fragile positioning
  s -= d.spotDerivDivergence > 0.5 ? 8 : 0;

  // Fill probability = can still exit under stress
  s += d.fillProbability > 0.6 ? 6 : d.fillProbability > 0.3 ? 2 : -6;

  // Funding healthy = no extreme leverage in market
  s += d.fundingHealthy > 0.6 ? 5 : -3;

  return clamp(s, 0, 100);
}

/**
 * Calculate the full Capital Protection Score.
 * Returns composite + all 5 sub-scores for gate checks and display.
 */
export function calculateCapitalProtection(input: HubInput): CapitalProtectionResult {
  const stopIntegrity = calcStopIntegrity(input);
  const drawdownContainment = calcDrawdownContainment(input);
  const invalidationClarity = calcInvalidationClarity(input);
  const regimeSafety = calcRegimeSafety(input);
  const adverseMoveResilience = calcAdverseMoveResilience(input);

  const score = Math.round((
    CP_SUB_WEIGHTS.stopIntegrity * stopIntegrity +
    CP_SUB_WEIGHTS.drawdownContainment * drawdownContainment +
    CP_SUB_WEIGHTS.invalidationClarity * invalidationClarity +
    CP_SUB_WEIGHTS.regimeSafety * regimeSafety +
    CP_SUB_WEIGHTS.adverseMoveResilience * adverseMoveResilience
  ) * 10) / 10;

  return {
    score,
    stopIntegrity,
    drawdownContainment,
    invalidationClarity,
    regimeSafety,
    adverseMoveResilience,
  };
}
