/**
 * Coin Universe V2 API Routes
 *
 * All workers read from Redis — Worker 0 writes, Workers 1-2 read.
 *
 * Endpoints:
 *   GET /api/coin-universe/snapshot — Full universe snapshot
 *   GET /api/coin-universe/selected — Only selected coins (top 10%)
 *   GET /api/coin-universe/stats    — Engine statistics + health + telemetry
 */

import type { Express } from "express";
import type { CoinUniverseEngineV2 } from "../services/coinUniverse/universeEngine.ts";
import type { UniverseSnapshot } from "../services/coinUniverse/types.ts";

async function getSnapshot(engine: CoinUniverseEngineV2): Promise<UniverseSnapshot | null> {
  // Try local memory first (Worker 0)
  const local = engine.getSnapshot();
  if (local.activeCoins.length > 0) return local;
  // Fallback to Redis (Workers 1-2)
  return engine.getSnapshotFromRedis();
}

export function registerCoinUniverseRoutes(app: Express, engine: CoinUniverseEngineV2): void {
  app.get("/api/coin-universe/snapshot", async (_req, res) => {
    const snapshot = await getSnapshot(engine);
    if (!snapshot || (!snapshot.activeCoins.length && snapshot.round === 0)) {
      res.json({ ok: true, round: 0, refreshedAt: "", stats: { totalScanned: 0, hardFiltered: 0, scored: 0, selected: 0, cooldown: 0 }, health: { engine: "v2", mode: "degraded", klinesAvailable: false, klinesSource: "none", dataQuality: "minimal" }, activeCoins: [], cooldownCoins: [], rejectedCount: 0 });
      return;
    }
    res.json({
      ok: true,
      round: snapshot.round,
      refreshedAt: snapshot.refreshedAt,
      stats: snapshot.stats,
      health: snapshot.health,
      activeCoins: snapshot.activeCoins,
      cooldownCoins: snapshot.cooldownCoins,
      rejectedCount: snapshot.rejectedCoins.length,
    });
  });

  app.get("/api/coin-universe/selected", async (_req, res) => {
    const snapshot = await getSnapshot(engine);
    if (!snapshot) { res.json({ ok: true, round: 0, count: 0, coins: [] }); return; }
    const selected = snapshot.activeCoins.filter((c) => c.selected);
    res.json({
      ok: true,
      round: snapshot.round,
      refreshedAt: snapshot.refreshedAt,
      count: selected.length,
      coins: selected,
      health: snapshot.health,
    });
  });

  app.get("/api/coin-universe/stats", async (_req, res) => {
    const snapshot = await getSnapshot(engine);
    if (!snapshot) { res.json({ ok: true, round: 0, stats: {}, health: {}, telemetry: {} }); return; }
    res.json({
      ok: true,
      round: snapshot.round,
      refreshedAt: snapshot.refreshedAt,
      stats: snapshot.stats,
      health: snapshot.health,
      telemetry: snapshot.telemetry,
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
