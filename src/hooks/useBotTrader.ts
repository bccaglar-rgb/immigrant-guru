/**
 * useBotTrader — Full bot lifecycle management hook.
 *
 * Handles: create, start, stop, emergency stop, state polling,
 * active trades, PNL, scan history, positions.
 *
 * Uses real backend API: /api/trader-hub/traders
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { authHeaders } from "../services/exchangeApi";

/* ── Types ── */

export interface BotTraderConfig {
  name: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  scanIntervalSec?: number;
  exchange?: string;
  exchangeAccountId?: string;
  exchangeAccountName?: string;
  aiModule?: string;
}

export interface TraderRecord {
  id: string;
  userId: string;
  name: string;
  status: "RUNNING" | "STOPPED" | "ERROR";
  symbol: string;
  timeframe: string;
  exchange: string;
  strategyId: string;
  strategyName: string;
  scanIntervalSec: number;
  stats: {
    runs: number;
    tradeCount: number;
    watchCount: number;
    noTradeCount: number;
    pnlPct: number;
  };
  lastResult: any | null;
  lastRunAt: string;
  lastError: string;
  failStreak: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScanRecord {
  time: string;
  symbol: string;
  decision: string;
  scorePct: number;
  bias: string;
  execState: string;
  dataStale: boolean;
  pnlPct: number | null;
}

export interface VirtualPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  sl1: number;
  tp1: number;
  openedAt: string;
  scorePct?: number;
  signalLabel?: string;
  confidence?: number;
}

export type BotState = "idle" | "running" | "paused" | "error" | "loading";

interface UseBotTraderResult {
  /* State */
  botState: BotState;
  trader: TraderRecord | null;
  error: string | null;
  loading: boolean;

  /* Data */
  scans: ScanRecord[];
  positions: VirtualPosition[];

  /* Stats */
  totalPnl: number;
  winRate: number;
  totalTrades: number;

  /* Actions */
  startBot: (config: BotTraderConfig) => Promise<void>;
  stopBot: () => Promise<void>;
  emergencyStop: () => Promise<void>;
  refresh: () => Promise<void>;
}

const API = "/api/trader-hub";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API ${res.status}`);
  }
  return res.json();
}

/* ── Hook ── */

export function useBotTrader(botSlug: string): UseBotTraderResult {
  const [trader, setTrader] = useState<TraderRecord | null>(null);
  const [botState, setBotState] = useState<BotState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [positions, setPositions] = useState<VirtualPosition[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Find existing trader for this bot slug ── */
  const findExistingTrader = useCallback(async () => {
    try {
      const data = await apiFetch<{ ok: boolean; items: TraderRecord[] }>("/traders?scope=user");
      if (!data.ok || !data.items) return null;
      return data.items.find(t => t.strategyId === botSlug || t.name.toLowerCase().includes(botSlug.replace(/-/g, " "))) || null;
    } catch {
      return null;
    }
  }, [botSlug]);

  /* ── Load trader state ── */
  const loadTraderState = useCallback(async (traderId: string) => {
    try {
      const [scansRes, posRes] = await Promise.all([
        apiFetch<{ ok: boolean; scans: ScanRecord[] }>(`/traders/${traderId}/scans?limit=50`),
        apiFetch<{ ok: boolean; positions: VirtualPosition[] }>(`/traders/${traderId}/positions`),
      ]);
      if (scansRes.ok) setScans(scansRes.scans || []);
      if (posRes.ok) setPositions(posRes.positions || []);
    } catch (err) {
      console.warn("[useBotTrader] Failed to load state:", err);
    }
  }, []);

  /* ── Initial load ── */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const existing = await findExistingTrader();
      if (!mounted) return;
      if (existing) {
        setTrader(existing);
        setBotState(existing.status === "RUNNING" ? "running" : existing.status === "ERROR" ? "error" : "idle");
        await loadTraderState(existing.id);
      }
    })();
    return () => { mounted = false; };
  }, [findExistingTrader, loadTraderState]);

  /* ── Polling when running ── */
  useEffect(() => {
    if (botState !== "running" || !trader) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const poll = async () => {
      try {
        const data = await apiFetch<{ ok: boolean; items: TraderRecord[] }>("/traders?scope=user");
        const updated = data.items?.find(t => t.id === trader.id);
        if (updated) {
          setTrader(updated);
          if (updated.status === "STOPPED") setBotState("idle");
          else if (updated.status === "ERROR") setBotState("error");
        }
        await loadTraderState(trader.id);
      } catch { /* keep polling */ }
    };
    pollRef.current = setInterval(poll, 5000); // Poll every 5 seconds
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [botState, trader, loadTraderState]);

  /* ── Start Bot ── */
  const startBot = useCallback(async (config: BotTraderConfig) => {
    setLoading(true);
    setError(null);
    try {
      const body = {
        name: config.name,
        aiModule: config.aiModule || "CHATGPT",
        exchange: config.exchange || "AUTO",
        exchangeAccountId: config.exchangeAccountId || "",
        exchangeAccountName: config.exchangeAccountName || "Auto",
        strategyId: config.strategyId || botSlug,
        strategyName: config.strategyName || config.name,
        symbol: config.symbol.replace("/", ""),
        timeframe: config.timeframe,
        scanIntervalSec: config.scanIntervalSec || 180,
      };
      console.info("[useBotTrader] Starting bot:", body);
      const res = await apiFetch<{ ok: boolean; item: TraderRecord }>("/traders", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.ok && res.item) {
        setTrader(res.item);
        setBotState("running");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start bot";
      setError(msg);
      setBotState("error");
      console.error("[useBotTrader] Start failed:", err);
    } finally {
      setLoading(false);
    }
  }, [botSlug]);

  /* ── Stop Bot ── */
  const stopBot = useCallback(async () => {
    if (!trader) return;
    setLoading(true);
    try {
      await apiFetch(`/traders/${trader.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: "STOPPED" }),
      });
      setBotState("idle");
      setTrader(prev => prev ? { ...prev, status: "STOPPED" } : null);
      console.info("[useBotTrader] Bot stopped:", trader.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop");
    } finally {
      setLoading(false);
    }
  }, [trader]);

  /* ── Emergency Stop ── */
  const emergencyStop = useCallback(async () => {
    if (!trader) return;
    setLoading(true);
    try {
      // Stop the bot
      await apiFetch(`/traders/${trader.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: "STOPPED" }),
      });
      // Close all positions
      for (const pos of positions) {
        try {
          await apiFetch(`/traders/${trader.id}/take-profit`, {
            method: "POST",
            body: JSON.stringify({ symbol: pos.symbol }),
          });
        } catch { /* best effort */ }
      }
      setBotState("idle");
      setTrader(prev => prev ? { ...prev, status: "STOPPED" } : null);
      setPositions([]);
      console.warn("[useBotTrader] EMERGENCY STOP executed:", trader.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Emergency stop failed");
    } finally {
      setLoading(false);
    }
  }, [trader, positions]);

  /* ── Refresh ── */
  const refresh = useCallback(async () => {
    if (!trader) return;
    await loadTraderState(trader.id);
  }, [trader, loadTraderState]);

  /* ── Derived stats ── */
  const totalPnl = trader?.stats.pnlPct ?? 0;
  const totalTrades = trader?.stats.tradeCount ?? 0;
  const winRate = totalTrades > 0 && scans.length > 0
    ? (scans.filter(s => (s.pnlPct ?? 0) > 0).length / Math.max(1, scans.filter(s => s.pnlPct !== null).length)) * 100
    : 0;

  return {
    botState, trader, error, loading,
    scans, positions,
    totalPnl, winRate, totalTrades,
    startBot, stopBot, emergencyStop, refresh,
  };
}
