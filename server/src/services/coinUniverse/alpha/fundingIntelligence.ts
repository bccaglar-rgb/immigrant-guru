import type { CoinUniverseData } from "../types.ts";
import type { FundingIntelligenceSignals } from "./alphaTypes.ts";

/**
 * M1: Funding Intelligence — extreme detection, crowding, mean reversion signal.
 * Uses: fundingRate (real-time from WS) + per-cycle ring buffer.
 */
export function computeFundingIntelligence(
  coin: CoinUniverseData,
  fundingHistory: number[],
): FundingIntelligenceSignals {
  const fr = coin.fundingRate;
  if (fr == null) {
    return { fundingExtremeScore: 0, fundingCrowdingIndex: 0, fundingMeanReversionSignal: 0, fundingDirection: "NEUTRAL", isExtreme: false };
  }

  const absFr = Math.abs(fr);

  // 1. Funding extreme score
  const fundingExtremeScore =
    absFr > 0.003 ? 100 :
    absFr > 0.001 ? 80 :
    absFr > 0.0005 ? 55 :
    absFr > 0.0002 ? 30 : 5;

  // 2. Crowding index (how consistently funding stays on one side)
  let fundingCrowdingIndex: number;
  if (fundingHistory.length >= 5) {
    const currentSign = fr >= 0 ? 1 : -1;
    const sameSideCount = fundingHistory.filter((h) => (h >= 0 ? 1 : -1) === currentSign).length;
    fundingCrowdingIndex = Math.round((sameSideCount / fundingHistory.length) * 100);
  } else {
    fundingCrowdingIndex = absFr > 0.0003 ? 60 : 20;
  }

  // 3. Mean reversion signal
  let fundingMeanReversionSignal = 0;
  if (absFr > 0.0005) {
    const magnitude = fundingExtremeScore * 0.6 + fundingCrowdingIndex * 0.4;
    fundingMeanReversionSignal = fr > 0 ? magnitude : -magnitude;
  }

  // 4. Direction
  const fundingDirection: FundingIntelligenceSignals["fundingDirection"] =
    fr > 0.0002 ? "BULLISH_CROWD" :
    fr < -0.0002 ? "BEARISH_CROWD" : "NEUTRAL";

  return {
    fundingExtremeScore,
    fundingCrowdingIndex,
    fundingMeanReversionSignal: Math.round(fundingMeanReversionSignal),
    fundingDirection,
    isExtreme: absFr > 0.001,
  };
}
