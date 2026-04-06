import { useState, useEffect, useCallback } from "react";
import { authHeaders } from "../../services/exchangeApi";

/* ── Types ── */
type BotStatus = "READY" | "RUNNING" | "PAUSED" | "ERROR";

interface TraderSnapshot {
  id: string;
  status: "RUNNING" | "STOPPED" | "ERROR";
  name: string;
  symbol: string;
  lastRunAt: string;
  lastError: string;
  stats: { runs: number; tradeCount: number; pnlPct: number };
  lastResult: any | null;
}

interface BotStatePanelProps {
  botSlug?: string;
  accentColor?: string;
}

/* ── Status config ── */
const STATUS_MAP: Record<BotStatus, { label: string; color: string; pulse: boolean }> = {
  READY:   { label: "IDLE",    color: "#8e95a1", pulse: false },
  RUNNING: { label: "RUNNING", color: "#2bc48a", pulse: true },
  PAUSED:  { label: "PAUSED",  color: "#F5C542", pulse: false },
  ERROR:   { label: "ERROR",   color: "#f6465d", pulse: false },
};

const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

/* ── Component ── */
export default function BotStatePanel({ botSlug, accentColor: _accentColor = "#2bc48a" }: BotStatePanelProps) {
  const [trader, setTrader] = useState<TraderSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchState = useCallback(async () => {
    if (!botSlug) { setLoading(false); return; }
    try {
      const res = await fetch("/api/trader-hub/traders?scope=user", { headers: { ...authHeaders() } });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const match = (data.items || []).find((t: any) =>
        t.strategyId === botSlug || t.name?.toLowerCase().includes(botSlug.replace(/-/g, " "))
      );
      setTrader(match || null);
    } catch { /* keep null */ }
    setLoading(false);
  }, [botSlug]);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 10000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const uiStatus: BotStatus = !trader ? "READY"
    : trader.status === "RUNNING" ? "RUNNING"
    : trader.status === "ERROR" ? "ERROR"
    : "READY";

  const cfg = STATUS_MAP[uiStatus];

  const lastDecision = trader?.lastResult?.decision;
  const lastBias = trader?.lastResult?.bias;
  const lastScore = trader?.lastResult?.scorePct;
  const pnl = trader?.stats?.pnlPct ?? 0;
  const trades = trader?.stats?.tradeCount ?? 0;
  const runs = trader?.stats?.runs ?? 0;

  const uptime = trader?.lastRunAt
    ? (() => {
        const diff = Date.now() - new Date(trader.lastRunAt).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m`;
        const hrs = Math.floor(mins / 60);
        return `${hrs}h ${mins % 60}m`;
      })()
    : "\u2014";

  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold tracking-wide text-white/70">Bot State</h3>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{ color: cfg.color, background: `${cfg.color}12` }}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${cfg.pulse ? "animate-pulse" : ""}`}
            style={{ background: cfg.color }}
          />
          {cfg.label}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-4 rounded bg-white/[0.03] animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-2.5">
          <Row label="Last Decision" value={
            lastDecision
              ? <span className={lastDecision === "TRADE" ? "text-[#2bc48a]" : lastDecision === "WATCH" ? "text-[#F5C542]" : "text-white/40"}>
                  {lastDecision} {lastBias && `(${lastBias})`} {lastScore != null && <span className="text-white/25">{lastScore}%</span>}
                </span>
              : <span className="text-white/25">Awaiting first scan</span>
          } />
          <Row label="Total PnL" value={
            <span className={pnl >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]"}>
              {pnl >= 0 ? "+" : ""}{fmt(pnl)}%
            </span>
          } />
          <Row label="Trades" value={<span className="text-white/60 font-mono">{trades}</span>} />
          <Row label="Scans" value={<span className="text-white/40 font-mono">{runs}</span>} />
          <Row label="Uptime" value={<span className="text-white/30">{uptime}</span>} />
          {trader?.lastError && (
            <Row label="Error" value={<span className="text-[#f6465d] text-[10px]">{trader.lastError}</span>} />
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[9px] font-medium uppercase tracking-wider text-white/20">{label}</span>
      <span className="text-right text-[11px] font-mono leading-snug">{value}</span>
    </div>
  );
}
