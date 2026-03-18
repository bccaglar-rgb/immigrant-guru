import type { CoinUniverseData } from "../types.ts";
import type { OiShockSignals } from "./alphaTypes.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * M2: OI Shock Detection — spike/collapse patterns, OI/price divergence.
 * Uses: oiChange proxy (from klines), change24hPct, volumeSpike, atrPct.
 */
export function computeOiShock(coin: CoinUniverseData): OiShockSignals {
  const oi = coin.oiChange;
  if (oi == null) {
    return { oiShockScore: 0, oiPriceDivergence: 0, leverageBuildupIndicator: 0, shockType: "NORMAL" };
  }

  const absOi = Math.abs(oi);

  // 1. OI shock score
  let oiShockScore =
    absOi > 15 ? 100 :
    absOi > 10 ? 80 :
    absOi > 5 ? 55 :
    absOi > 2 ? 30 : 5;
  if (coin.volumeSpike && absOi > 5) oiShockScore = Math.min(100, oiShockScore + 15);

  // 2. OI/Price divergence
  const pNorm = clamp(coin.change24hPct / 10, -1, 1);
  const oNorm = clamp(oi / 10, -1, 1);
  const oiPriceDivergence = Math.round((oNorm - pNorm) * 50);

  // 3. Leverage buildup (OI increasing + tight range)
  let leverageBuildupIndicator = 0;
  if (oi > 0 && coin.atrPct != null) {
    const oiMag = clamp(oi / 10, 0, 1) * 60;
    const rangeComp = clamp((2.0 - coin.atrPct) / 2.0, 0, 1) * 40;
    leverageBuildupIndicator = Math.round(oiMag + rangeComp);
  }

  // 4. Shock type
  const shockType: OiShockSignals["shockType"] =
    oi > 5 && Math.abs(oiPriceDivergence) < 20 ? "SPIKE" :
    oi < -5 ? "COLLAPSE" :
    Math.abs(oiPriceDivergence) > 40 ? "DIVERGENT" : "NORMAL";

  return { oiShockScore, oiPriceDivergence, leverageBuildupIndicator, shockType };
}
