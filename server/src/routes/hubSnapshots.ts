/**
 * Hub Snapshot API Routes
 *
 * Serves Balanced/Flow/Aggressive/Capital Guard hub snapshots to the frontend.
 * Data sources (in priority order):
 *   1. Dedicated Hub engines (Balanced/CG) → Redis snapshots
 *   2. SystemScanner scan cache → transformed to Hub format
 *
 * Endpoints:
 *   GET /api/balanced-hub/snapshot
 *   GET /api/balanced-hub/health
 *   GET /api/flow-hub/snapshot
 *   GET /api/flow-hub/health
 *   GET /api/agg-hub/snapshot
 *   GET /api/agg-hub/health
 *   GET /api/cg-hub/snapshot
 *   GET /api/cg-hub/health
 */

import type { Express } from "express";
import type { SystemScannerService } from "../services/systemScannerService.ts";

/* ── Mode → Hub mapping ─────────────────────────────────── */

const MODE_CONFIG: Record<
  string,
  {
    scanMode: string;
    decisionMap: Record<string, string>;
    highDecision: string;
  }
> = {
  flow: {
    scanMode: "FLOW",
    decisionMap: { TRADE: "APPROVED", WATCH: "WATCHLIST", NO_TRADE: "NO_TRADE" },
    highDecision: "STRONG_FLOW",
  },
  agg: {
    scanMode: "AGGRESSIVE",
    decisionMap: { TRADE: "APPROVED", WATCH: "WATCHLIST", NO_TRADE: "NO_TRADE" },
    highDecision: "STRONG_MOMENTUM",
  },
  balanced: {
    scanMode: "BALANCED",
    decisionMap: { TRADE: "APPROVED", WATCH: "WATCHLIST", NO_TRADE: "NO_TRADE" },
    highDecision: "HIGH_QUALITY",
  },
  cg: {
    scanMode: "CAPITAL_GUARD",
    decisionMap: { TRADE: "APPROVED", WATCH: "WATCHLIST", NO_TRADE: "NO_TRADE" },
    highDecision: "VERIFIED_SAFE",
  },
};

/* ── Transform scan result → Hub snapshot item ──────────── */

interface ScanResult {
  symbol: string;
  mode: string;
  scorePct: number;
  decision: string;
  direction: string;
  scannedAt: number;
  modeScores?: Record<string, number>;
  entryLow?: number;
  entryHigh?: number;
  slLevels?: number[];
  tpLevels?: number[];
  horizon?: string;
  timeframe?: string;
  quantSnapshot?: {
    regime?: string;
    pWin?: number;
    expectedRR?: number;
    edgeNetR?: number;
    finalScore?: number;
    liquidityDensity?: string;
    spreadRegime?: string;
    marketStress?: string;
    trendStrength?: string;
    trendDirection?: string;
    marketBias?: string;
  };
  flowSignals?: {
    regime?: string;
    liquidityScore?: number;
    riskAdjEdgeR?: number;
    pWin?: number;
    expectedRR?: number;
    pFill?: number;
    slippageLevel?: string;
    entryQuality?: string;
    spreadRegime?: string;
    stressLevel?: string;
    trendStrength?: string;
    emaAlignment?: string;
    compression?: string;
    liquidityDensity?: string;
    depthQuality?: string;
    spoofRisk?: string;
    orderbookImbalance?: string;
    fundingBias?: string;
    volumeSpike?: string;
    vwapPosition?: string;
  };
}

function transformToHubItem(
  result: ScanResult,
  config: (typeof MODE_CONFIG)[string],
  cycleId: string,
) {
  const qs = result.quantSnapshot ?? {};
  const fs = result.flowSignals ?? {};

  // Determine decision
  const baseDecision = config.decisionMap[result.decision] ?? "NO_TRADE";
  const decision =
    baseDecision === "APPROVED" && result.scorePct >= 60
      ? config.highDecision
      : baseDecision;

  // Regime
  const regime = (qs.regime ?? fs.regime ?? "RANGE") as string;

  // Edge
  const edgeR = qs.edgeNetR ?? fs.riskAdjEdgeR ?? 0;

  // Core breakdown from flow signals
  const structure = fs.liquidityScore ?? qs.finalScore ?? 0;
  const liquidity = fs.liquidityScore ?? 30;
  const positioning = 40;
  const volatility = 35;
  const execution = fs.pFill ? Math.round(fs.pFill * 100) : 30;
  const total = Math.round((structure + liquidity + positioning + volatility + execution) / 5);

  // TP/SL
  const entryLow = result.entryLow ?? 0;
  const entryHigh = result.entryHigh ?? 0;
  const sl = result.slLevels?.[0] ?? 0;
  const tp1 = result.tpLevels?.[0] ?? 0;
  const tp2 = result.tpLevels?.[1] ?? tp1;
  const tp3 = result.tpLevels?.[2] ?? tp2;
  const rr = sl && entryLow && tp1
    ? Math.abs(tp1 - entryLow) / Math.abs(entryLow - sl)
    : 0;

  return {
    symbol: result.symbol,
    cycleId,
    adjustedScore: result.scorePct,
    decision,
    direction: result.direction ?? "NONE",
    regime,
    biasScore: (result.modeScores?.[config.scanMode] ?? result.scorePct / 100) * 100,
    coreScore: total,
    edgeR: Math.round(edgeR * 1000) / 1000,
    penalty: 0,
    gatesPassed: result.decision === "TRADE",
    failedGates: result.decision !== "TRADE" ? ["score_threshold"] : [],
    payload: {
      coreBreakdown: { structure, liquidity, positioning, volatility, execution, total },
      regimeMultiplier: 1.0,
      executionScore: execution,
      executionBlocked: false,
      fillProbability: fs.pFill ?? 0.5,
      slippage: fs.slippageLevel ?? "MEDIUM",
      expectedEdge: qs.edgeNetR ?? 0,
      riskAdjustedEdge: fs.riskAdjEdgeR ?? qs.edgeNetR ?? 0,
      pWin: qs.pWin ?? fs.pWin ?? 0.5,
      avgWinR: qs.expectedRR ?? fs.expectedRR ?? 1.0,
      costR: 0,
      penalties: {},
      penaltyTotal: 0,
      dataHealth: 80,
      riskScore: qs.marketStress === "HIGH" ? 70 : qs.marketStress === "LOW" ? 30 : 50,
      tpSl: entryLow && sl && tp1
        ? {
            entryZone: [entryLow, entryHigh] as [number, number],
            stopLoss: sl,
            tp1: { price: tp1, allocation: 0.5 },
            tp2: { price: tp2, allocation: 0.3 },
            tp3: { price: tp3, allocation: 0.2 },
            riskRewardRatio: Math.round(rr * 100) / 100,
          }
        : null,
      positionSize: null,
      reasons: [
        `${result.horizon ?? "SCALP"} ${result.timeframe ?? "15m"}`,
        `Regime: ${regime}`,
        `Setup: ${(result as any).setup ?? "—"}`,
        `Trend: ${qs.trendDirection ?? "—"} ${qs.trendStrength ?? ""}`,
      ],
    },
    createdAt: new Date(result.scannedAt).toISOString(),
  };
}

/* ── Route registration ─────────────────────────────────── */

export function registerHubSnapshotRoutes(
  app: Express,
  systemScanner?: SystemScannerService,
) {
  // Helper: get scan cache (from local scanner or Redis)
  async function getScanCache() {
    let cache = systemScanner ? systemScanner.getCache() : null;
    if (!cache || !cache.results.length) {
      const { SystemScannerService: SSS } = await import(
        "../services/systemScannerService.ts"
      );
      cache = await SSS.readScanCacheFromRedis();
    }
    return cache;
  }

  // Generic snapshot builder from scan cache
  async function buildSnapshot(mode: string) {
    const config = MODE_CONFIG[mode];
    if (!config) return null;

    const cache = await getScanCache();
    if (!cache) return null;

    const modeResults = cache.results.filter(
      (r: any) => r.mode === config.scanMode,
    );
    const cycleId = `scan-${cache.scanRound ?? 0}`;

    const outputs = modeResults.map((r: any) =>
      transformToHubItem(r as ScanResult, config, cycleId),
    );

    return {
      cycleId,
      publishedAt: cache.lastScanAt ?? Date.now(),
      count: outputs.length,
      outputs,
    };
  }

  // Generic health builder
  async function buildHealth(mode: string) {
    const config = MODE_CONFIG[mode];
    if (!config) return null;

    const cache = await getScanCache();
    const modeCount = cache
      ? cache.results.filter((r: any) => r.mode === config.scanMode).length
      : 0;

    return {
      status: cache && modeCount > 0 ? "healthy" : "no_data",
      lastSnapshotSize: modeCount,
      lastProcessedAt: cache?.lastScanAt ?? null,
      lastCycleId: cache ? `scan-${cache.scanRound ?? 0}` : null,
    };
  }

  /* ── Balanced Hub ─────────────────────────────────────── */
  app.get("/api/balanced-hub/snapshot", async (_req, res) => {
    try {
      // Try dedicated Balanced Hub engine first
      const { readSnapshot } = await import(
        "../engines/balancedModeHub/hubPublisher.ts"
      );
      const dedicated = await readSnapshot();
      if (dedicated && dedicated.outputs.length > 0) {
        return res.json(dedicated);
      }
    } catch {
      /* engine not running or Redis empty — fall through */
    }

    // Fallback: scan cache
    const snapshot = await buildSnapshot("balanced");
    if (!snapshot) {
      return res.json({ cycleId: "", publishedAt: 0, count: 0, outputs: [] });
    }
    res.json(snapshot);
  });

  app.get("/api/balanced-hub/health", async (_req, res) => {
    const health = await buildHealth("balanced");
    res.json(health ?? { status: "no_data", lastSnapshotSize: 0, lastProcessedAt: null, lastCycleId: null });
  });

  /* ── Flow Hub ─────────────────────────────────────────── */
  app.get("/api/flow-hub/snapshot", async (_req, res) => {
    const snapshot = await buildSnapshot("flow");
    if (!snapshot) {
      return res.json({ cycleId: "", publishedAt: 0, count: 0, outputs: [] });
    }
    res.json(snapshot);
  });

  app.get("/api/flow-hub/health", async (_req, res) => {
    const health = await buildHealth("flow");
    res.json(health ?? { status: "no_data", lastSnapshotSize: 0, lastProcessedAt: null, lastCycleId: null });
  });

  /* ── Aggressive Hub ───────────────────────────────────── */
  app.get("/api/agg-hub/snapshot", async (_req, res) => {
    const snapshot = await buildSnapshot("agg");
    if (!snapshot) {
      return res.json({ cycleId: "", publishedAt: 0, count: 0, outputs: [] });
    }
    res.json(snapshot);
  });

  app.get("/api/agg-hub/health", async (_req, res) => {
    const health = await buildHealth("agg");
    res.json(health ?? { status: "no_data", lastSnapshotSize: 0, lastProcessedAt: null, lastCycleId: null });
  });

  /* ── Capital Guard Hub ────────────────────────────────── */
  app.get("/api/cg-hub/snapshot", async (_req, res) => {
    try {
      // Try dedicated CG Hub engine first
      const { readCgSnapshot } = await import(
        "../engines/cgModeHub/hubPublisher.ts"
      );
      const dedicated = await readCgSnapshot();
      if (dedicated && dedicated.outputs.length > 0) {
        return res.json(dedicated);
      }
    } catch {
      /* engine not running or Redis empty — fall through */
    }

    // Fallback: scan cache
    const snapshot = await buildSnapshot("cg");
    if (!snapshot) {
      return res.json({ cycleId: "", publishedAt: 0, count: 0, outputs: [] });
    }
    res.json(snapshot);
  });

  app.get("/api/cg-hub/health", async (_req, res) => {
    const health = await buildHealth("cg");
    res.json(health ?? { status: "no_data", lastSnapshotSize: 0, lastProcessedAt: null, lastCycleId: null });
  });

  console.log("[HubSnapshots] Registered 8 hub snapshot + health routes");
}
