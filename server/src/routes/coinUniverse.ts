/**
 * Coin Universe API Routes
 *
 * Endpoints:
 *   GET /api/coin-universe/snapshot — Full universe snapshot
 *   GET /api/coin-universe/selected — Only selected coins (top 10%)
 *   GET /api/coin-universe/stats    — Engine statistics
 */

import type { Express } from "express";
import type { CoinUniverseEngineV2 } from "../services/coinUniverse/universeEngine.ts";

export function registerCoinUniverseRoutes(app: Express, engine: CoinUniverseEngineV2): void {
  // Full snapshot — all active, cooldown, and rejected coins
  app.get("/api/coin-universe/snapshot", (_req, res) => {
    const snapshot = engine.getSnapshot();
    res.json({
      ok: true,
      round: snapshot.round,
      refreshedAt: snapshot.refreshedAt,
      stats: snapshot.stats,
      activeCoins: snapshot.activeCoins,
      cooldownCoins: snapshot.cooldownCoins,
      rejectedCount: snapshot.rejectedCoins.length,
    });
  });

  // Only selected coins (top 10% — sent to quant engine)
  app.get("/api/coin-universe/selected", (_req, res) => {
    const snapshot = engine.getSnapshot();
    const selected = snapshot.activeCoins.filter((c) => c.selected);
    res.json({
      ok: true,
      round: snapshot.round,
      refreshedAt: snapshot.refreshedAt,
      count: selected.length,
      coins: selected,
    });
  });

  // Engine statistics
  app.get("/api/coin-universe/stats", (_req, res) => {
    const snapshot = engine.getSnapshot();
    res.json({
      ok: true,
      round: snapshot.round,
      refreshedAt: snapshot.refreshedAt,
      stats: snapshot.stats,
      scoreDistribution: computeScoreDistribution(snapshot.activeCoins),
    });
  });
}

function computeScoreDistribution(coins: Array<{ compositeScore: number }>) {
  const elite = coins.filter((c) => c.compositeScore >= 80).length;
  const strong = coins.filter((c) => c.compositeScore >= 70 && c.compositeScore < 80).length;
  const watchlist = coins.filter((c) => c.compositeScore >= 60 && c.compositeScore < 70).length;
  const below = coins.filter((c) => c.compositeScore < 60).length;
  return { elite, strong, watchlist, below, total: coins.length };
}
