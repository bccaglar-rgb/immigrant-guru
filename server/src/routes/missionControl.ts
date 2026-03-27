/**
 * Mission Control — Aggregated Platform Health Endpoint
 *
 * Single admin-only endpoint that collects health data from all subsystems
 * using Promise.allSettled (any failing subsystem won't break the dashboard).
 *
 * V2: Extended with 7 new collectors for full operations center:
 *   - DB Pool stats, Redis health, Circuit breakers, Private streams,
 *   - Trading stats, Data freshness, Bot scheduler detail
 *
 * GET /api/admin/mission-control
 */
import type { Express } from "express";
import type { AuthService } from "../payments/authService.ts";
import { requireAdmin } from "../middleware/authMiddleware.ts";
import type { ExchangeCoreService } from "../services/exchangeCore/exchangeCoreService.ts";
import type { AITradeIdeaEngine } from "../engines/aiTradeIdeas/AITradeIdeaEngine.ts";
import type { AiModuleScheduler } from "../engines/aiTradeIdeas/AiModuleScheduler.ts";
import type { TraderHubEngine } from "../services/traderHub/traderHubEngine.ts";

/* ── Dependency bag passed from index.ts ─────────────────── */

export interface MissionControlDeps {
  authService: AuthService;
  exchangeCore: ExchangeCoreService;
  aiTradeIdeaEngine: AITradeIdeaEngine;
  aiModuleScheduler: AiModuleScheduler;
  traderHubEngine: TraderHubEngine;
  // Optimizer modules (loose-typed — we call .getSummary?.() on each)
  systemScanner?: { getStatus?: () => unknown };
  modePerformanceTracker?: { getSummary?: () => unknown };
  tradeOutcomeAttributor?: { getSummary?: () => unknown };
  dynamicSlTpOptimizer?: { getSummary?: () => unknown };
  regimeParameterEngine?: { getSummary?: () => unknown };
  confidenceCalibrator?: { getSummary?: () => unknown };
  selfThrottleEngine?: { getSummary?: () => unknown };
  featureWeightTuner?: { getSummary?: () => unknown };
}

/* ── Helper: safe async/sync call ────────────────────────── */

const safe = async <T>(fn: () => T | Promise<T>, label: string): Promise<T | null> => {
  try {
    return await fn();
  } catch (err) {
    console.error(`[MissionControl] ${label} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
};

/* ── Route Registration ──────────────────────────────────── */

export function registerMissionControlRoute(app: Express, deps: MissionControlDeps) {
  const adminMw = requireAdmin(deps.authService);

  app.get("/api/admin/mission-control", adminMw, async (_req, res) => {
    const ts = Date.now();

    // Collect all subsystem data in parallel — any failure returns null
    const [
      rateLimiterResult,
      probeStatesResult,
      marketCacheResult,
      marketHealthResult,
      killSwitchResult,
      egressResult,
      exchangeCoreResult,
      aiEngineResult,
      aiEngineStateResult,
      aiSchedulerResult,
      traderHubResult,
      wsStatsResult,
      processResult,
      optimizerResult,
      // ── V2: New collectors ──
      dbPoolResult,
      redisHealthResult,
      circuitBreakersResult,
      privateStreamsResult,
      tradingStatsResult,
      dataFreshnessResult,
      botSchedulerDetailResult,
    ] = await Promise.allSettled([
      // 0: Rate Limiter
      safe(async () => {
        const { getFullMetrics } = await import("../services/binanceRateLimiter.ts");
        return getFullMetrics();
      }, "rateLimiter"),

      // 1: Probe States (all exchanges)
      safe(async () => {
        const { getProbeStatus } = await import("../services/marketHub/ProbeStateManager.ts");
        const exchanges = ["binance", "bybit", "okx", "gateio"];
        const results: Record<string, unknown> = {};
        const probes = await Promise.allSettled(
          exchanges.map(async (ex) => ({ exchange: ex, status: await getProbeStatus(ex) })),
        );
        for (const p of probes) {
          if (p.status === "fulfilled") {
            results[p.value.exchange] = p.value.status;
          }
        }
        return results;
      }, "probeStates"),

      // 2: Market Cache
      safe(async () => {
        const { getCacheStats, getActiveDepthSymbols, getLockStats } = await import("../services/marketDataCache.ts");
        const [stats, symbols, locks] = await Promise.all([
          getCacheStats(),
          getActiveDepthSymbols(),
          Promise.resolve(getLockStats()),
        ]);
        return { ...stats, locks, activeSymbolCount: symbols.size };
      }, "marketCache"),

      // 3: Market Health
      safe(async () => {
        const { marketHealth } = await import("../services/marketHealth.ts");
        const aggregate = marketHealth.getAggregateStats();
        const all = marketHealth.getAllHealth();
        // Summarize — don't send full per-symbol data (too large)
        const stale = all.filter((h) => h.status === "stale").length;
        const degraded = all.filter((h) => h.status === "degraded").length;
        const healthy = all.filter((h) => h.status === "healthy").length;
        const seqOutOfSync = all.filter((h) => !h.seqSynced).length;
        const wsDisconnected = all.filter((h) => !h.wsConnected).length;
        return { aggregate, summary: { total: all.length, healthy, degraded, stale, seqOutOfSync, wsDisconnected } };
      }, "marketHealth"),

      // 4: Kill Switch
      safe(async () => {
        const { KillSwitch } = await import("../services/exchangeCore/killSwitch.ts");
        const ks = new KillSwitch();
        return await ks.getActiveStates();
      }, "killSwitch"),

      // 5: Egress
      safe(async () => {
        const { getEgressController } = await import("../services/egress/index.ts");
        const ctrl = getEgressController();
        return ctrl?.getStatus() ?? null;
      }, "egress"),

      // 6: Exchange Core
      safe(() => deps.exchangeCore.getMetrics(), "exchangeCore"),

      // 7: AI Trade Idea Engine
      safe(() => ({
        enabled: deps.aiTradeIdeaEngine.isEnabled(),
        metrics: deps.aiTradeIdeaEngine.getMetrics(),
      }), "aiEngine"),

      // 8: AI Engine State (Redis)
      safe(async () => {
        const { readEngineState } = await import("../engines/aiTradeIdeas/publisher.ts");
        return await readEngineState();
      }, "aiEngineState"),

      // 9: AI Module Scheduler
      safe(() => deps.aiModuleScheduler.getLastRun(), "aiScheduler"),

      // 10: Trader Hub
      safe(async () => await deps.traderHubEngine.getMetrics(), "traderHub"),

      // 11: WS Gateway Stats
      safe(() => {
        const g = globalThis as Record<string, unknown>;
        const getDrops = g.__gwBackpressureDrops as (() => number) | undefined;
        const getClients = g.__gwClientCount as (() => number) | undefined;
        const getSubs = g.__gwSubscriptionCount as (() => number) | undefined;
        const getChannels = g.__gwChannelStats as (() => Array<{ symbol: string; subscribers: number }>) | undefined;
        const pipelines = g.__gwPipelineStats ?? {};
        return {
          clients: getClients?.() ?? 0,
          subscriptions: getSubs?.() ?? 0,
          backpressureDrops: getDrops?.() ?? 0,
          pipelines,
          topChannels: getChannels?.() ?? [],
        };
      }, "wsGateway"),

      // 12: Process
      safe(() => {
        const mem = process.memoryUsage();
        return {
          uptimeSec: process.uptime(),
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
          rssMb: Math.round(mem.rss / 1024 / 1024),
          externalMb: Math.round(mem.external / 1024 / 1024),
          pid: process.pid,
          workerId: Number(process.env.NODE_APP_INSTANCE ?? "0"),
        };
      }, "process"),

      // 13: Optimizer Modules
      safe(() => {
        const modules: Record<string, unknown> = {};
        const optModules: Array<[string, { getSummary?: () => unknown } | undefined]> = [
          ["systemScanner", deps.systemScanner],
          ["modePerformanceTracker", deps.modePerformanceTracker],
          ["tradeOutcomeAttributor", deps.tradeOutcomeAttributor],
          ["dynamicSlTpOptimizer", deps.dynamicSlTpOptimizer],
          ["regimeParameterEngine", deps.regimeParameterEngine],
          ["confidenceCalibrator", deps.confidenceCalibrator],
          ["selfThrottleEngine", deps.selfThrottleEngine],
          ["featureWeightTuner", deps.featureWeightTuner],
        ];
        for (const [name, mod] of optModules) {
          try {
            modules[name] = mod?.getSummary?.() ?? { active: !!mod };
          } catch {
            modules[name] = { active: false, error: "getSummary failed" };
          }
        }
        return modules;
      }, "optimizer"),

      // ════════════════════════════════════════════════════════
      // V2: NEW COLLECTORS (14-20)
      // ════════════════════════════════════════════════════════

      // 14: DB Pool Stats
      safe(async () => {
        const { pool } = await import("../db/pool.ts");
        return {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
          max: 20,
        };
      }, "dbPool"),

      // 15: Redis Health (ping all 3 logical connections)
      safe(async () => {
        const { redis, redisQueue, redisControl } = await import("../db/redis.ts");
        const extractPing = (r: PromiseSettledResult<unknown>) =>
          r.status === "fulfilled" ? r.value : null;
        const [cacheR, queueR, controlR] = await Promise.allSettled([
          redis.ping().then(() => ({ connected: true, db: 0, role: "cache" as const })),
          redisQueue.ping().then(() => ({ connected: true, db: 1, role: "queue" as const })),
          redisControl.ping().then(() => ({ connected: true, db: 2, role: "control" as const })),
        ]);
        return {
          cache: extractPing(cacheR) ?? { connected: false, db: 0, role: "cache" },
          queue: extractPing(queueR) ?? { connected: false, db: 1, role: "queue" },
          control: extractPing(controlR) ?? { connected: false, db: 2, role: "control" },
        };
      }, "redisHealth"),

      // 16: Circuit Breakers (all exchanges)
      safe(async () => {
        const { getAllCircuitStatus } = await import("../services/exchangeCore/circuitBreaker.ts");
        return await getAllCircuitStatus();
      }, "circuitBreakers"),

      // 17: Private Stream Status
      safe(() => {
        const g = globalThis as Record<string, unknown>;
        const getStreamStats = g.__privateStreamStats as (() => unknown) | undefined;
        return getStreamStats?.() ?? {
          activeStreams: 0, totalUsers: 0, byVenue: {},
          staleCount: 0, reconnectingCount: 0,
        };
      }, "privateStreams"),

      // 18: Trading Stats (fills from DB)
      safe(async () => {
        const { pool } = await import("../db/pool.ts");
        const [fillResult] = await Promise.allSettled([
          pool.query(
            "SELECT COUNT(*) as cnt FROM exchange_fills WHERE filled_at > NOW() - INTERVAL '1 hour'",
          ),
        ]);
        return {
          fillsLastHour: fillResult.status === "fulfilled"
            ? Number(fillResult.value.rows[0]?.cnt ?? 0) : 0,
        };
      }, "tradingStats"),

      // 19: Data Freshness (feature snapshots + candles)
      safe(async () => {
        const { pool } = await import("../db/pool.ts");
        const r = await pool.query(`
          SELECT
            (SELECT MAX("time") FROM feature_snapshots) AS last_feature,
            (SELECT MAX("time") FROM candles_1m) AS last_candle,
            (SELECT COUNT(DISTINCT symbol) FROM feature_snapshots
             WHERE "time" > NOW() - INTERVAL '10 minutes') AS fresh_features
        `);
        const row = r.rows[0];
        return {
          lastFeatureAt: row?.last_feature ?? null,
          lastCandleAt: row?.last_candle ?? null,
          freshFeatureSymbols: Number(row?.fresh_features ?? 0),
        };
      }, "dataFreshness"),

      // 20: Bot Scheduler Detail (DLQ, priority split)
      safe(async () => {
        return await deps.traderHubEngine.getSchedulerMetrics();
      }, "botSchedulerDetail"),
    ]);

    // Extract values from allSettled results
    const extract = <T>(r: PromiseSettledResult<T>): T | null =>
      r.status === "fulfilled" ? r.value : null;

    const payload = {
      ok: true,
      collectedAt: new Date(ts).toISOString(),
      durationMs: Date.now() - ts,
      // ── Original collectors ──
      rateLimiter: extract(rateLimiterResult),
      probeStates: extract(probeStatesResult),
      marketCache: extract(marketCacheResult),
      marketHealth: extract(marketHealthResult),
      killSwitch: extract(killSwitchResult),
      egress: extract(egressResult),
      exchangeCore: extract(exchangeCoreResult),
      aiEngine: extract(aiEngineResult),
      aiEngineState: extract(aiEngineStateResult),
      aiScheduler: extract(aiSchedulerResult),
      traderHub: extract(traderHubResult),
      wsGateway: extract(wsStatsResult),
      process: extract(processResult),
      optimizer: extract(optimizerResult),
      // ── V2: New collectors ──
      dbPool: extract(dbPoolResult),
      redisHealth: extract(redisHealthResult),
      circuitBreakers: extract(circuitBreakersResult),
      privateStreams: extract(privateStreamsResult),
      tradingStats: extract(tradingStatsResult),
      dataFreshness: extract(dataFreshnessResult),
      botSchedulerDetail: extract(botSchedulerDetailResult),
    };

    res.set("Cache-Control", "private, max-age=5");
    return res.json(payload);
  });
}
