/**
 * Bitrium Prime AI Hub — Degradation Handler
 *
 * Detects missing/stale data and applies penalties.
 * These flags are used by code enforcement to cap block scores
 * and add penalties — they do NOT rely on AI compliance.
 *
 * Missing orderbook → EQ max 60, penalty +10
 * Missing funding → positioning bias = 0, DQ penalty +8
 * Missing edge model → EdgeQ max 30, bias toward NO_TRADE
 * Missing HTF data → MQ penalty +10
 * Stale data (>60s old) → penalty proportional to staleness
 */

import type { HubInput } from "../balancedModeHub/types.ts";
import { DEGRADATION } from "./config.ts";

export interface DegradationFlags {
  missingOrderbook: boolean;
  missingFunding: boolean;
  missingEdge: boolean;
  missingHtf: boolean;
  staleData: boolean;
  stalenessMinutes: number;
  degradedFeeds: string[];

  /** Additional penalty points from degradation */
  penaltyPoints: number;

  /** Block score caps (undefined = no cap) */
  eqCap?: number;
  edgeQCap?: number;
}

/**
 * Detect degradation from HubInput and compute flags + penalties.
 */
export function applyDegradation(input: HubInput): DegradationFlags {
  const flags: DegradationFlags = {
    missingOrderbook: false,
    missingFunding: false,
    missingEdge: false,
    missingHtf: false,
    staleData: false,
    stalenessMinutes: 0,
    degradedFeeds: [],
    penaltyPoints: 0,
  };

  // ── Missing Orderbook ──
  // Detected when depth and spread scores are at default/zero
  if (input.depthScore <= 0.05 && input.spreadScore <= 0.05) {
    flags.missingOrderbook = true;
    flags.degradedFeeds.push("orderbook");
    flags.eqCap = DEGRADATION.missingOrderbook.eqMax;
    flags.penaltyPoints += DEGRADATION.missingOrderbook.penalty;
  }

  // ── Missing Funding Data ──
  // Detected when funding-related scores are all at neutral/default
  if (input.fundingHealthy === 0.5 && input.crowdingLow === 0.5 && input.oiDivergence === 0) {
    flags.missingFunding = true;
    flags.degradedFeeds.push("funding");
    flags.penaltyPoints += DEGRADATION.missingFunding.penalty;
  }

  // ── Missing Edge Model ──
  // Detected when pWin and avgWinR are at defaults
  if (input.pWin <= 0.01 || input.avgWinR <= 0.01) {
    flags.missingEdge = true;
    flags.degradedFeeds.push("edge_model");
    flags.edgeQCap = DEGRADATION.missingEdge.edgeQMax;
    flags.penaltyPoints += 15; // Heavy penalty for no edge
  }

  // ── Missing HTF Data ──
  // Detected when htfTrend and htfLevel are at defaults
  if (input.htfTrend <= 0.01 && input.htfLevel <= 0) {
    flags.missingHtf = true;
    flags.degradedFeeds.push("htf");
    flags.penaltyPoints += DEGRADATION.missingHtf.penalty;
  }

  // ── Stale Data ──
  // DataHealthScore below threshold suggests staleness
  if (input.dataHealthScore < 0.80) {
    flags.staleData = true;
    flags.degradedFeeds.push("stale_feed");
    // Estimate staleness from health score (lower = more stale)
    flags.stalenessMinutes = Math.max(1, Math.round((1 - input.dataHealthScore) * 10));
    flags.penaltyPoints += Math.min(10, flags.stalenessMinutes * DEGRADATION.staleFeedPenaltyPerMinute);
  }

  return flags;
}

/**
 * Cap a block score if degradation requires it.
 */
export function capScore(score: number, cap: number | undefined): number {
  if (cap === undefined) return score;
  return Math.min(score, cap);
}
