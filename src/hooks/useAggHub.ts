/**
 * useAggHub — Polling hook for Aggressive Mode Hub snapshots
 */
import { useEffect, useRef, useState } from "react";

/* ── Hub types (mirrored from backend) ─────────────────── */
export type AggDecision = "NO_TRADE" | "WATCHLIST" | "SCOUT" | "APPROVED" | "STRONG_MOMENTUM";
export type BiasDirection = "LONG" | "SHORT" | "NONE";
export type RegimeType = "TREND" | "RANGE" | "BREAKOUT_SETUP" | "FAKE_BREAK_RISK" | "HIGH_STRESS";

export interface AggSnapshotItem {
  symbol: string;
  cycleId: string;
  adjustedScore: number;
  decision: AggDecision;
  direction: BiasDirection;
  regime: RegimeType;
  biasScore: number;
  coreScore: number;
  edgeR: number;
  penalty: number;
  gatesPassed: boolean;
  failedGates: string[];
  payload: {
    coreBreakdown?: { structure: number; liquidity: number; positioning: number; volatility: number; execution: number; total: number };
    regimeMultiplier?: number;
    executionScore?: number;
    executionBlocked?: boolean;
    fillProbability?: number;
    slippage?: string;
    expectedEdge?: number;
    riskAdjustedEdge?: number;
    pWin?: number;
    avgWinR?: number;
    costR?: number;
    penalties?: Record<string, number>;
    penaltyTotal?: number;
    dataHealth?: number;
    riskScore?: number;
    tpSl?: {
      entryZone: [number, number];
      stopLoss: number;
      tp1: { price: number; allocation: number };
      tp2: { price: number; allocation: number };
      tp3: { price: number; allocation: number };
      riskRewardRatio: number;
    } | null;
    positionSize?: {
      sizeMultiplier: number;
      confidenceTier: string;
      riskPct: number;
      reasons: string[];
    } | null;
    reasons?: string[];
  };
  createdAt: string;
}

export interface AggSnapshot {
  cycleId: string;
  publishedAt: number;
  count: number;
  outputs: AggSnapshotItem[];
}

export interface AggHealth {
  status: string;
  lastSnapshotSize: number;
  lastProcessedAt: number | null;
  lastCycleId: string | null;
}

/* ── Hook ──────────────────────────────────────────────── */
interface UseAggHubOpts {
  enabled?: boolean;
  intervalMs?: number;
}

export function useAggHub(opts: UseAggHubOpts = {}) {
  const { enabled = true, intervalMs = 10_000 } = opts;
  const [snapshot, setSnapshot] = useState<AggSnapshot | null>(null);
  const [health, setHealth] = useState<AggHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    const fetchData = async () => {
      try {
        const [snapRes, healthRes] = await Promise.all([
          fetch("/api/agg-hub/snapshot"),
          fetch("/api/agg-hub/health"),
        ]);
        if (!mountedRef.current) return;
        if (snapRes.ok) {
          const data = await snapRes.json();
          setSnapshot(data);
        }
        if (healthRes.ok) {
          const hData = await healthRes.json();
          setHealth(hData);
        }
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : "Agg Hub fetch failed");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    void fetchData();
    const timer = window.setInterval(() => void fetchData(), intervalMs);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs]);

  const sortedOutputs = (snapshot?.outputs ?? []).slice().sort((a, b) => b.adjustedScore - a.adjustedScore);

  return { snapshot, health, loading, error, sortedOutputs };
}
