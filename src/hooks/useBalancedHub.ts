/**
 * useBalancedHub — Polling hook for Balanced Mode Hub snapshots
 */
import { useEffect, useRef, useState } from "react";

/* ── Hub types (mirrored from backend) ─────────────────── */
export type HubDecision = "NO_TRADE" | "WATCHLIST" | "PROBE" | "APPROVED" | "HIGH_QUALITY";
export type BiasDirection = "LONG" | "SHORT" | "NONE";
export type RegimeType = "TREND" | "RANGE" | "BREAKOUT_SETUP" | "FAKE_BREAK_RISK" | "HIGH_STRESS";

export interface HubSnapshotItem {
  symbol: string;
  cycleId: string;
  adjustedScore: number;
  decision: HubDecision;
  direction: BiasDirection;
  regime: RegimeType;
  biasScore: number;
  coreScore: number;
  edgeR: number;
  penalty: number;
  gatesPassed: boolean;
  failedGates: string[];
  /* full pipeline payload */
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

export interface HubSnapshot {
  cycleId: string;
  publishedAt: number;
  count: number;
  outputs: HubSnapshotItem[];
}

export interface HubHealth {
  status: string;
  lastSnapshotSize: number;
  lastProcessedAt: number | null;
  lastCycleId: string | null;
}

/* ── Hook ──────────────────────────────────────────────── */
interface UseBalancedHubOpts {
  enabled?: boolean;
  intervalMs?: number;
}

export function useBalancedHub(opts: UseBalancedHubOpts = {}) {
  const { enabled = true, intervalMs = 15_000 } = opts;
  const [snapshot, setSnapshot] = useState<HubSnapshot | null>(null);
  const [health, setHealth] = useState<HubHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    const fetchData = async () => {
      try {
        const [snapRes, healthRes] = await Promise.all([
          fetch("/api/balanced-hub/snapshot"),
          fetch("/api/balanced-hub/health"),
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
        setError(err instanceof Error ? err.message : "Hub fetch failed");
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

  /* Sorted by adjustedScore descending */
  const sortedOutputs = (snapshot?.outputs ?? []).slice().sort((a, b) => b.adjustedScore - a.adjustedScore);

  return { snapshot, health, loading, error, sortedOutputs };
}
