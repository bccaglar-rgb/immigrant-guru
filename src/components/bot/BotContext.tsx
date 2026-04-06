import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";

/* ── Types ── */

export interface ExchangeAccount {
  id: string;
  exchangeId: string;
  exchangeDisplayName: string;
  accountName: string;
  status: "READY" | "PARTIAL" | "FAILED";
  enabled: boolean;
}

export type TradingMode = "paper" | "live";

export interface BotContextValue {
  /* Exchange */
  accounts: ExchangeAccount[];
  selectedExchangeId: string;
  setSelectedExchangeId: (id: string) => void;
  selectedAccount: ExchangeAccount | undefined;
  hasAccounts: boolean;

  /* Trading */
  mode: TradingMode;
  setMode: (m: TradingMode) => void;
  killSwitch: boolean;
  setKillSwitch: (armed: boolean) => void;

  /* Market */
  pair: string;
  setPair: (p: string) => void;
  timeframe: string;
  setTimeframe: (tf: string) => void;

  /* Connection health */
  dataHealth: "connected" | "degraded" | "disconnected" | "loading";
  latencyMs: number | null;

  /* Data source */
  isLiveData: boolean;
  isMockFallback: boolean;
  setMockFallback: (v: boolean) => void;
}

const BotContext = createContext<BotContextValue | null>(null);

export function useBotContext(): BotContextValue {
  const ctx = useContext(BotContext);
  if (!ctx) throw new Error("useBotContext must be used inside <BotProvider>");
  return ctx;
}

/* ── Provider ── */

interface BotProviderProps {
  children: ReactNode;
  defaultPair?: string;
  defaultTf?: string;
}

export function BotProvider({ children, defaultPair = "BTCUSDT", defaultTf = "15m" }: BotProviderProps) {
  /* Exchange accounts */
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [selectedExchangeId, setSelectedExchangeId] = useState("");

  /* Trading */
  const [mode, setMode] = useState<TradingMode>("paper");
  const [killSwitch, setKillSwitch] = useState(true);

  /* Market */
  const [pair, setPair] = useState(defaultPair);
  const [timeframe, setTimeframe] = useState(defaultTf);

  /* Health */
  const [dataHealth, setDataHealth] = useState<BotContextValue["dataHealth"]>("loading");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  /* Mock fallback tracking */
  const [isMockFallback, setMockFallback] = useState(false);

  /* ── Load exchange accounts ── */
  useEffect(() => {
    const loadLocal = () => {
      try {
        const raw = window.localStorage.getItem("exchange-accounts-v1");
        if (!raw) return;
        const parsed = JSON.parse(raw) as any[];
        if (!Array.isArray(parsed)) return;
        const rows = parsed
          .filter((r: any) => r.enabled !== false && r.status !== "FAILED")
          .map((r: any) => ({
            id: `${r.exchangeId}::${r.accountName ?? "Main"}`,
            exchangeId: r.exchangeId,
            exchangeDisplayName: r.exchangeDisplayName,
            accountName: r.accountName ?? "Main",
            status: (r.status as ExchangeAccount["status"]) ?? "READY",
            enabled: true,
          }));
        setAccounts(rows);
        if (!selectedExchangeId && rows.length > 0) setSelectedExchangeId(rows[0].id);
      } catch { /* noop */ }
    };

    loadLocal();

    // Fetch from backend
    const headers: Record<string, string> = {};
    try {
      const token = window.localStorage.getItem("auth-token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch { /* noop */ }

    fetch("/api/exchanges", { headers })
      .then(r => r.ok ? r.json() : null)
      .then(body => {
        if (!body?.exchanges) return;
        const rows = (body.exchanges as any[])
          .filter((r: any) => r.enabled !== false && r.status !== "FAILED")
          .map((r: any) => ({
            id: `${r.exchangeId}::${r.accountName ?? "Main"}`,
            exchangeId: r.exchangeId,
            exchangeDisplayName: r.exchangeDisplayName,
            accountName: r.accountName ?? "Main",
            status: (r.status as ExchangeAccount["status"]) ?? "READY",
            enabled: true,
          }));
        setAccounts(rows);
        if (!selectedExchangeId && rows.length > 0) setSelectedExchangeId(rows[0].id);
        try { window.localStorage.setItem("exchange-accounts-v1", JSON.stringify(rows)); } catch { /* noop */ }
      })
      .catch(() => { /* keep local */ });

    window.addEventListener("exchange-manager-updated", loadLocal);
    return () => window.removeEventListener("exchange-manager-updated", loadLocal);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Health check ── */
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const start = Date.now();
      try {
        const res = await fetch("/api/market/health", { signal: AbortSignal.timeout(5000) });
        if (!mounted) return;
        const ms = Date.now() - start;
        setLatencyMs(ms);
        if (res.ok) {
          setDataHealth(ms > 2000 ? "degraded" : "connected");
        } else {
          setDataHealth("degraded");
        }
      } catch {
        if (!mounted) return;
        setLatencyMs(null);
        setDataHealth("disconnected");
      }
    };

    check();
    const interval = setInterval(check, 15000); // check every 15s
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  /* ── Derived ── */
  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedExchangeId),
    [accounts, selectedExchangeId],
  );

  const isLiveData = dataHealth === "connected" && !isMockFallback;

  /* ── Kill switch handler with logging ── */
  const handleKillSwitch = useCallback((armed: boolean) => {
    setKillSwitch(armed);
    // Log for telemetry
    console.info(`[BotContext] Kill switch ${armed ? "ARMED" : "DISARMED"}`);
  }, []);

  /* ── Mode handler with logging ── */
  const handleMode = useCallback((m: TradingMode) => {
    setMode(m);
    console.info(`[BotContext] Mode changed to ${m.toUpperCase()}`);
  }, []);

  const value = useMemo<BotContextValue>(() => ({
    accounts,
    selectedExchangeId,
    setSelectedExchangeId,
    selectedAccount,
    hasAccounts: accounts.length > 0,
    mode,
    setMode: handleMode,
    killSwitch,
    setKillSwitch: handleKillSwitch,
    pair,
    setPair,
    timeframe,
    setTimeframe,
    dataHealth,
    latencyMs,
    isLiveData,
    isMockFallback,
    setMockFallback,
  }), [accounts, selectedExchangeId, selectedAccount, mode, handleMode, killSwitch, handleKillSwitch, pair, timeframe, dataHealth, latencyMs, isLiveData, isMockFallback]);

  return <BotContext.Provider value={value}>{children}</BotContext.Provider>;
}
