/**
 * Enhanced Coin Scoring
 *
 * Shared utility used by both:
 *  - SystemScannerService (pre-select best coins for scanning)
 *  - /api/market/universe endpoint (display score on Coin Universe page)
 *
 * Weights:
 *  Volume   35%  — Low volume = bad execution (slippage)
 *  Momentum 25%  — Price movement = market interest & opportunity
 *  Funding  15%  — Extreme funding rates = mean-reversion signal
 *  Spread   15%  — Tight spread = better entry/exit quality
 *  Cap rank 10%  — Larger coins have more reliable patterns
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export interface EnhancedScoreInput {
  volume24hUsd: number;
  absChange24hPct: number;
  marketCapRank: number | null;
  fundingRate: number | null;
  spreadBps: number | null;
}

export function computeEnhancedScore(input: EnhancedScoreInput): number {
  // 1. Volume score [0,1] — log10 scale: $1M=0, $1B=1
  const volumeScore = clamp01((Math.log10(Math.max(input.volume24hUsd, 1)) - 6) / 3);

  // 2. Momentum score [0,1] — 8% absolute change = max score
  const momentumScore = clamp01(input.absChange24hPct / 8);

  // 3. Market cap bonus [0,1] — top 10 = full bonus, rank 80+ = 0
  const capBonus =
    input.marketCapRank !== null
      ? clamp01((80 - Math.min(80, Math.max(1, input.marketCapRank))) / 80)
      : 0.1;

  // 4. Funding rate signal [0,1] — extreme |funding| = mean-reversion opportunity
  //    |0.03%| (0.0003) = moderate, |0.1%| (0.001) = strong/max
  const fundingScore =
    input.fundingRate !== null
      ? clamp01(Math.abs(input.fundingRate) / 0.001)
      : 0;

  // 5. Spread quality [0,1] — tighter is better
  //    1 bps = 1.0, 10+ bps = 0.0
  const spreadScore =
    input.spreadBps !== null
      ? clamp01(1 - (input.spreadBps - 1) / 9)
      : 0.3; // neutral default when no data

  const weighted =
    0.35 * volumeScore +
    0.25 * momentumScore +
    0.10 * capBonus +
    0.15 * fundingScore +
    0.15 * spreadScore;

  return Math.round(Math.max(0, Math.min(100, weighted * 100)));
}
