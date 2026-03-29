import { useEffect, useState, useCallback, useMemo } from "react";
import { getAuthToken } from "../services/authClient";

// ── Styles ──────────────────────────────────────────────────────
const panel = "rounded-2xl border border-white/[0.08] bg-[#0D0E11] p-5";
const card = "rounded-xl border border-white/[0.06] bg-[#121316] p-4";
const statBox = "rounded-lg border border-white/[0.06] bg-[#0F1012] px-3 py-2.5 flex flex-col gap-0.5";
const labelCls = "text-[10px] uppercase tracking-wider text-[#6B6F76] font-medium";
const badgeCls = "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

// ── Types ───────────────────────────────────────────────────────

interface MCData {
  ok: boolean;
  collectedAt: string;
  durationMs: number;
  rateLimiter: any;
  probeStates: Record<string, any> | null;
  marketCache: any;
  marketHealth: any;
  killSwitch: any;
  egress: any;
  exchangeCore: any;
  aiEngine: any;
  aiEngineState: any;
  aiScheduler: any;
  traderHub: any;
  wsGateway: any;
  process: any;
  optimizer: any;
  dbPool: any;
  redisHealth: any;
  circuitBreakers: any[] | null;
  privateStreams: any;
  tradingStats: any;
  dataFreshness: any;
  botSchedulerDetail: any;
}

// ── Helpers ──────────────────────────────────────────────────────

const authHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const fetchMC = async (): Promise<MCData> => {
  const res = await fetch("/api/admin/mission-control", { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

function fmtMs(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}


function fmtUptime(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(ts: number | string | null | undefined): string {
  if (!ts) return "—";
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const ago = Date.now() - t;
  if (ago < 60_000) return `${Math.round(ago / 1000)}s ago`;
  if (ago < 3_600_000) return `${Math.round(ago / 60_000)}m ago`;
  return `${Math.round(ago / 3_600_000)}h ago`;
}

// ── Status Badge ────────────────────────────────────────────────

type StatusLevel = "healthy" | "degraded" | "probe" | "critical" | "offline" | "warm";

const statusColors: Record<StatusLevel, string> = {
  healthy: "bg-emerald-500/20 text-emerald-400",
  degraded: "bg-amber-500/20 text-amber-400",
  probe: "bg-violet-500/20 text-violet-400",
  critical: "bg-red-500/20 text-red-400",
  offline: "bg-zinc-600/30 text-zinc-500",
  warm: "bg-blue-500/20 text-blue-400",
};

const StatusBadge = ({ level, label }: { level: StatusLevel; label: string }) => (
  <span className={`${badgeCls} ${statusColors[level]}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${
      level === "healthy" ? "bg-emerald-400" :
      level === "degraded" ? "bg-amber-400" :
      level === "probe" ? "bg-violet-400" :
      level === "critical" ? "bg-red-400" :
      level === "warm" ? "bg-blue-400" :
      "bg-zinc-500"
    }`} />
    {label}
  </span>
);

// ── Progress Bar ────────────────────────────────────────────────

const MiniBar = ({ value, max = 100, color = "emerald" }: { value: number; max?: number; color?: string }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          color === "emerald" ? "bg-emerald-500/70" :
          color === "amber" ? "bg-amber-500/70" :
          color === "red" ? "bg-red-500/70" :
          "bg-blue-500/70"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════

export default function MissionControlPage() {
  const [data, setData] = useState<MCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(0);
  const [events, setEvents] = useState<Array<{ ts: number; text: string; level: StatusLevel }>>([]);

  const load = useCallback(async () => {
    try {
      const d = await fetchMC();
      setData(d);
      setLastRefresh(Date.now());
      setError("");

      // Build event feed from data
      const newEvents: typeof events = [];
      if (d.circuitBreakers) {
        for (const cb of d.circuitBreakers) {
          if (cb.state === "OPEN") {
            newEvents.push({ ts: Date.now(), text: `${cb.venue} circuit breaker OPEN (${cb.failures} failures)`, level: "critical" });
          } else if (cb.state === "HALF_OPEN") {
            newEvents.push({ ts: Date.now(), text: `${cb.venue} circuit breaker recovering (HALF_OPEN)`, level: "probe" });
          }
        }
      }
      if (d.marketHealth?.summary) {
        const mh = d.marketHealth.summary;
        if (mh.stale > 0) newEvents.push({ ts: Date.now(), text: `${mh.stale} symbols stale — data may be outdated`, level: "degraded" });
        if (mh.seqOutOfSync > 0) newEvents.push({ ts: Date.now(), text: `${mh.seqOutOfSync} symbols with sequence gaps — resync pending`, level: "degraded" });
      }
      if (d.aiScheduler?.errors?.length) {
        for (const err of d.aiScheduler.errors.slice(0, 3)) {
          newEvents.push({ ts: Date.now(), text: `AI: ${err}`, level: "critical" });
        }
      }
      if (d.rateLimiter?.cooldownActive) {
        newEvents.push({ ts: Date.now(), text: `Rate limiter cooldown active: ${d.rateLimiter.cooldownReason}`, level: "critical" });
      }
      if (newEvents.length === 0) {
        newEvents.push({ ts: Date.now(), text: "All systems operating normally", level: "healthy" });
      }
      setEvents(newEvents);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  // ── Global Status Computation ─────────────────────────────────
  const globalStatus = useMemo(() => {
    if (!data) return { level: "offline" as StatusLevel, text: "Loading..." };
    const mh = data.marketHealth?.summary;
    const hasCircuitOpen = data.circuitBreakers?.some((cb: any) => cb.state === "OPEN");
    const hasRLCooldown = data.rateLimiter?.cooldownActive;
    const hasStale = mh && mh.stale > 2;
    const aiErrors = data.aiScheduler?.errors?.length ?? 0;

    if (hasCircuitOpen || hasRLCooldown) return { level: "critical" as StatusLevel, text: "Incident Active — Exchange connectivity issues detected" };
    if (hasStale || aiErrors > 2) return { level: "degraded" as StatusLevel, text: "Degraded — Some subsystems require attention" };
    if (mh && mh.degraded > 3) return { level: "degraded" as StatusLevel, text: "Degraded — Elevated stale/degraded symbol count" };
    return { level: "healthy" as StatusLevel, text: "Operational — All critical systems healthy" };
  }, [data]);

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-[#0A0B0D] p-4 md:p-6">
        <div className="mx-auto max-w-[1600px] flex items-center justify-center min-h-[60vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#F5C542] border-t-transparent" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0A0B0D] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-5">

        {/* ═══ SECTION 1: Global Status Header ═══ */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Bitrium Mission Control</h1>
            <p className="text-xs text-[#6B6F76] mt-0.5">Live Exchange, AI Model, and Infrastructure Health</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge level={globalStatus.level} label={globalStatus.text} />
            <span className="text-[10px] text-[#6B6F76]">
              {lastRefresh > 0 ? `Updated ${timeAgo(lastRefresh)}` : "—"} | 10s auto-refresh
            </span>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</div>
        )}

        {/* ═══ KPI Strip ═══ */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KPICard label="Exchanges Healthy" value={
            data?.circuitBreakers
              ? `${data.circuitBreakers.filter((cb: any) => cb.state === "CLOSED").length}/${data.circuitBreakers.length}`
              : "—"
          } color={data?.circuitBreakers?.every((cb: any) => cb.state === "CLOSED") ? "emerald" : "amber"} />
          <KPICard label="AI Models" value={
            data?.aiScheduler?.moduleResults
              ? `${data.aiScheduler.moduleResults.filter((m: any) => !m.error || m.error === "provider_cooldown").length}/${data.aiScheduler.moduleResults.length}`
              : data?.aiEngine?.enabled ? "Active" : "Off"
          } color={data?.aiEngine?.enabled ? "emerald" : "amber"} />
          <KPICard label="WS Clients" value={String(data?.wsGateway?.clients ?? 0)} color="blue" />
          <KPICard label="Market Health" value={
            data?.marketHealth?.summary
              ? `${data.marketHealth.summary.healthy}/${data.marketHealth.summary.total}`
              : "—"
          } color={
            data?.marketHealth?.summary?.stale > 2 ? "red" :
            data?.marketHealth?.summary?.degraded > 5 ? "amber" : "emerald"
          } />
          <KPICard label="Inference Queue" value={fmtMs(data?.aiScheduler?.durationMs)} color={
            (data?.aiScheduler?.durationMs ?? 0) > 30_000 ? "red" :
            (data?.aiScheduler?.durationMs ?? 0) > 15_000 ? "amber" : "emerald"
          } />
          <KPICard label="Infra Load" value={
            data?.process
              ? `${Math.round((data.process.heapUsedMb / data.process.heapTotalMb) * 100)}%`
              : "—"
          } color={
            data?.process && (data.process.heapUsedMb / data.process.heapTotalMb) > 0.85 ? "red" :
            data?.process && (data.process.heapUsedMb / data.process.heapTotalMb) > 0.7 ? "amber" : "emerald"
          } />
        </div>

        {/* ═══ Confidence Strip ═══ */}
        <div className="flex flex-wrap gap-4 text-[11px]">
          <ConfidenceChip label="Market Data" level={
            (data?.marketHealth?.summary?.healthy ?? 0) > (data?.marketHealth?.summary?.total ?? 1) * 0.8 ? "high" :
            (data?.marketHealth?.summary?.healthy ?? 0) > (data?.marketHealth?.summary?.total ?? 1) * 0.5 ? "medium" : "low"
          } />
          <ConfidenceChip label="AI Inference" level={
            data?.aiEngine?.enabled && (data?.aiScheduler?.errors?.length ?? 0) === 0 ? "high" :
            data?.aiEngine?.enabled ? "medium" : "low"
          } />
          <ConfidenceChip label="Execution Readiness" level={
            data?.exchangeCore?.started && data?.circuitBreakers?.every((cb: any) => cb.state === "CLOSED") ? "high" :
            data?.exchangeCore?.started ? "medium" : "low"
          } />
        </div>

        {/* ═══ ROW: Exchange Health + Event Feed ═══ */}
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          {/* Exchange Health Grid */}
          <section className={panel}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#6B6F76]">Exchange Health</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {(data?.circuitBreakers ?? []).map((cb: any) => (
                <ExchangeCard key={cb.venue} cb={cb} probeState={data?.probeStates?.[cb.venue?.toLowerCase()]} rateLimiter={data?.rateLimiter} />
              ))}
              {(!data?.circuitBreakers || data.circuitBreakers.length === 0) && (
                <div className="col-span-2 text-center text-sm text-[#6B6F76] py-8">No exchange data available</div>
              )}
            </div>
          </section>

          {/* Event Timeline */}
          <section className={panel}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#6B6F76]">Event Feed</h2>
            <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
              {events.map((evt, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                    evt.level === "healthy" ? "bg-emerald-400" :
                    evt.level === "degraded" ? "bg-amber-400" :
                    evt.level === "critical" ? "bg-red-400" :
                    evt.level === "probe" ? "bg-violet-400" :
                    "bg-zinc-500"
                  }`} />
                  <div>
                    <span className="text-[#6B6F76]">{new Date(evt.ts).toLocaleTimeString()}</span>
                    <span className="ml-2 text-white/80">{evt.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ═══ ROW: AI Models + Risk Panel ═══ */}
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          {/* AI Models Grid */}
          <section className={panel}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#6B6F76]">AI Models Health</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {(data?.aiScheduler?.moduleResults ?? []).map((mod: any) => (
                <AIModelCard key={mod.providerId} mod={mod} />
              ))}
              {(!data?.aiScheduler?.moduleResults || data.aiScheduler.moduleResults.length === 0) && (
                <div className="col-span-2 text-center text-sm text-[#6B6F76] py-8">
                  {data?.aiEngine?.enabled ? "No recent AI cycle data" : "AI Engine is disabled"}
                </div>
              )}
            </div>
            {data?.aiScheduler && (
              <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-[#6B6F76]">
                <span>Cycle: {data.aiScheduler.runId?.slice(0, 8) ?? "—"}</span>
                <span>Duration: {fmtMs(data.aiScheduler.durationMs)}</span>
                <span>Persisted: {data.aiScheduler.totalPersisted ?? 0}</span>
                <span>Last: {timeAgo(data.aiScheduler.completedAt)}</span>
              </div>
            )}
          </section>

          {/* Risk & Recovery Panel */}
          <section className={panel}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#6B6F76]">Risk & Recovery</h2>
            <RiskPanel data={data} />
          </section>
        </div>

        {/* ═══ SECTION: Core Infrastructure ═══ */}
        <section className={panel}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#6B6F76]">Core Infrastructure</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Process */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-white">Server Process</span>
                <StatusBadge level={data?.process ? "healthy" : "offline"} label={data?.process ? "Online" : "N/A"} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatMini label="Heap" value={data?.process ? `${data.process.heapUsedMb?.toFixed(0) ?? "—"}MB` : "—"} />
                <StatMini label="RSS" value={data?.process ? `${data.process.rssMb?.toFixed(0) ?? "—"}MB` : "—"} />
                <StatMini label="Uptime" value={fmtUptime(data?.process?.uptimeSec)} />
                <StatMini label="Worker" value={`#${data?.process?.workerId ?? "?"}`} />
              </div>
              {data?.process && (
                <div className="mt-2">
                  <MiniBar value={data.process.heapUsedMb} max={data.process.heapTotalMb} color={
                    (data.process.heapUsedMb / data.process.heapTotalMb) > 0.85 ? "red" :
                    (data.process.heapUsedMb / data.process.heapTotalMb) > 0.7 ? "amber" : "emerald"
                  } />
                </div>
              )}
            </div>

            {/* Redis */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-white">Redis Cluster</span>
                <StatusBadge level={
                  data?.redisHealth && Object.values(data.redisHealth).every((r: any) => r?.connected)
                    ? "healthy" : "critical"
                } label={
                  data?.redisHealth && Object.values(data.redisHealth).every((r: any) => r?.connected)
                    ? "Connected" : "Issues"
                } />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {data?.redisHealth && Object.entries(data.redisHealth).map(([key, val]: [string, any]) => (
                  <StatMini key={key} label={key} value={val?.connected ? "OK" : "DOWN"} />
                ))}
              </div>
            </div>

            {/* Database */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-white">Database Pool</span>
                <StatusBadge level={
                  data?.dbPool && data.dbPool.waitingCount === 0 ? "healthy" :
                  data?.dbPool ? "degraded" : "offline"
                } label={data?.dbPool ? `${data.dbPool.totalCount}/${data.dbPool.max}` : "N/A"} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatMini label="Active" value={String(data?.dbPool?.totalCount ?? "—")} />
                <StatMini label="Idle" value={String(data?.dbPool?.idleCount ?? "—")} />
                <StatMini label="Waiting" value={String(data?.dbPool?.waitingCount ?? "—")} />
                <StatMini label="Max" value={String(data?.dbPool?.max ?? "—")} />
              </div>
            </div>

            {/* WS Gateway */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-white">WS Gateway</span>
                <StatusBadge level={
                  (data?.wsGateway?.clients ?? 0) > 0 ? "healthy" : "warm"
                } label={`${data?.wsGateway?.clients ?? 0} clients`} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatMini label="Subs" value={String(data?.wsGateway?.subscriptions ?? 0)} />
                <StatMini label="Drops" value={String(data?.wsGateway?.backpressureDrops ?? 0)} />
              </div>
              {(data?.wsGateway?.topChannels?.length ?? 0) > 0 && (
                <div className="mt-2 text-[10px] text-[#6B6F76]">
                  Top: {data!.wsGateway.topChannels.slice(0, 3).map((c: any) => `${c.symbol}(${c.subscribers})`).join(", ")}
                </div>
              )}
            </div>
          </div>

          {/* Second row: Signal Engine + Exchange Core + Trader Hub + Data Freshness */}
          <div className="grid gap-3 mt-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Signal Engine */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-white">Signal Engine</span>
                <StatusBadge level={
                  data?.marketHealth?.aggregate?.healthy > 0 ? "healthy" : "degraded"
                } label={data?.marketHealth?.aggregate ? "Active" : "N/A"} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatMini label="Healthy" value={String(data?.marketHealth?.aggregate?.healthy ?? 0)} />
                <StatMini label="Degraded" value={String(data?.marketHealth?.aggregate?.degraded ?? 0)} />
                <StatMini label="Stale" value={String(data?.marketHealth?.aggregate?.stale ?? 0)} />
                <StatMini label="Avg Depth" value={fmtMs(data?.marketHealth?.aggregate?.avgDepthAgeMs)} />
              </div>
            </div>

            {/* Exchange Core */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-white">Exchange Core</span>
                <StatusBadge level={data?.exchangeCore?.started ? "healthy" : "offline"} label={data?.exchangeCore?.started ? "Running" : "Stopped"} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatMini label="In-Flight" value={String(data?.exchangeCore?.inFlight ?? 0)} />
                <StatMini label="Queue" value={String((data?.exchangeCore?.queueInteractive ?? 0) + (data?.exchangeCore?.queueBatch ?? 0))} />
                <StatMini label="Intents" value={String(data?.exchangeCore?.intentsTotal ?? 0)} />
                <StatMini label="Events" value={String(data?.exchangeCore?.eventsTotal ?? 0)} />
              </div>
            </div>

            {/* Trader Hub */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-white">Trader Hub</span>
                <StatusBadge level={data?.traderHub?.started ? "healthy" : "offline"} label={data?.traderHub?.started ? "Active" : "N/A"} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatMini label="Traders" value={String(data?.traderHub?.totalTraders ?? 0)} />
                <StatMini label="Running" value={String(data?.traderHub?.runningTraders ?? 0)} />
                <StatMini label="Errors" value={String(data?.traderHub?.errorTraders ?? 0)} />
                <StatMini label="Jobs" value={String(data?.traderHub?.inFlightJobs ?? 0)} />
              </div>
            </div>

            {/* Data Freshness */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-white">Data Freshness</span>
                <StatusBadge level={data?.dataFreshness?.freshFeatureSymbols > 0 ? "healthy" : "degraded"} label="Pipeline" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatMini label="Features" value={timeAgo(data?.dataFreshness?.lastFeatureAt)} />
                <StatMini label="Candles" value={timeAgo(data?.dataFreshness?.lastCandleAt)} />
                <StatMini label="Fresh Syms" value={String(data?.dataFreshness?.freshFeatureSymbols ?? 0)} />
                <StatMini label="Fills/hr" value={String(data?.tradingStats?.fillsLastHour ?? 0)} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

// ═════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════

function KPICard({ label, value, color }: { label: string; value: string; color: string }) {
  const borderColor = color === "emerald" ? "border-emerald-500/20" : color === "amber" ? "border-amber-500/20" : color === "red" ? "border-red-500/20" : "border-blue-500/20";
  const textColor = color === "emerald" ? "text-emerald-400" : color === "amber" ? "text-amber-400" : color === "red" ? "text-red-400" : "text-blue-400";
  return (
    <div className={`${statBox} ${borderColor} border`}>
      <span className={labelCls}>{label}</span>
      <span className={`text-lg font-bold ${textColor}`}>{value}</span>
    </div>
  );
}

function ConfidenceChip({ label, level }: { label: string; level: "high" | "medium" | "low" }) {
  const color = level === "high" ? "text-emerald-400" : level === "medium" ? "text-amber-400" : "text-red-400";
  return (
    <span className="flex items-center gap-1.5 text-[#6B6F76]">
      {label}:
      <span className={`font-semibold uppercase ${color}`}>{level}</span>
    </span>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className={labelCls}>{label}</div>
      <div className="text-xs font-medium text-white">{value}</div>
    </div>
  );
}

// ── Exchange Card ───────────────────────────────────────────────

function ExchangeCard({ cb, probeState, rateLimiter }: { cb: any; probeState: any; rateLimiter: any }) {
  const venue: string = cb.venue ?? "UNKNOWN";
  const cbState: string = cb.state ?? "UNKNOWN";

  const level: StatusLevel =
    cbState === "OPEN" ? "critical" :
    cbState === "HALF_OPEN" ? "probe" :
    "healthy";

  // Get exchange-specific RL data
  const rl = rateLimiter?.exchanges?.[venue.toLowerCase()] ?? rateLimiter?.exchanges?.[venue] ?? null;
  const probeHealth = probeState?.metrics;

  return (
    <div className={`${card} border-l-2 ${
      level === "healthy" ? "border-l-emerald-500/50" :
      level === "probe" ? "border-l-violet-500/50" :
      "border-l-red-500/50"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">{venue}</span>
        <StatusBadge level={level} label={
          cbState === "CLOSED" ? "Healthy" :
          cbState === "HALF_OPEN" ? "Recovering" :
          "Down"
        } />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-[#6B6F76]">Circuit</span>
          <span className={`font-medium ${cbState === "CLOSED" ? "text-emerald-400" : cbState === "HALF_OPEN" ? "text-violet-400" : "text-red-400"}`}>
            {cbState}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B6F76]">Failures</span>
          <span className="text-white">{cb.failures ?? 0}</span>
        </div>

        {rl && (
          <>
            <div className="flex justify-between">
              <span className="text-[#6B6F76]">Weight</span>
              <span className="text-white">{rl.localWeight ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B6F76]">Requests</span>
              <span className="text-white">{rl.requests ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B6F76]">Latency</span>
              <span className="text-white">{fmtMs(rl.avgLatencyMs)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B6F76]">429s</span>
              <span className={`${(rl.total429 ?? 0) > 0 ? "text-red-400" : "text-white"}`}>{rl.total429 ?? 0}</span>
            </div>
          </>
        )}

        {probeHealth && (
          <>
            <div className="flex justify-between">
              <span className="text-[#6B6F76]">Probes OK</span>
              <span className="text-white">{probeHealth.healthyProbes}/{probeHealth.totalProbes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B6F76]">Fail Rate</span>
              <span className={`${probeHealth.failureRate > 0.2 ? "text-red-400" : "text-white"}`}>
                {(probeHealth.failureRate * 100).toFixed(0)}%
              </span>
            </div>
          </>
        )}
      </div>

      {/* Mini status tags */}
      <div className="mt-3 flex flex-wrap gap-1">
        {cbState === "CLOSED" && <MiniTag text="Live" color="emerald" />}
        {cbState === "HALF_OPEN" && <MiniTag text="Probe Mode" color="violet" />}
        {cbState === "OPEN" && <MiniTag text="Circuit Open" color="red" />}
        {rl?.cooldownActive && <MiniTag text="Rate Cooldown" color="amber" />}
        {(rl?.total418 ?? 0) > 0 && <MiniTag text={`418s: ${rl.total418}`} color="red" />}
      </div>
    </div>
  );
}

function MiniTag({ text, color }: { text: string; color: string }) {
  const cls = color === "emerald" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" :
    color === "amber" ? "bg-amber-500/15 text-amber-400 border-amber-500/20" :
    color === "red" ? "bg-red-500/15 text-red-400 border-red-500/20" :
    color === "violet" ? "bg-violet-500/15 text-violet-400 border-violet-500/20" :
    "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  return <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${cls}`}>{text}</span>;
}

// ── AI Model Card ───────────────────────────────────────────────

function AIModelCard({ mod }: { mod: any }) {
  const hasError = mod.error && mod.error !== "provider_cooldown";
  const isCooldown = mod.error === "provider_cooldown";

  const level: StatusLevel =
    hasError ? "critical" :
    isCooldown ? "warm" :
    mod.persisted > 0 ? "healthy" : "degraded";

  return (
    <div className={`${card} border-l-2 ${
      level === "healthy" ? "border-l-emerald-500/50" :
      level === "warm" ? "border-l-blue-500/50" :
      level === "critical" ? "border-l-red-500/50" :
      "border-l-amber-500/50"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-semibold text-white">{mod.label || mod.providerId}</span>
          <span className="ml-2 text-[10px] text-[#6B6F76]">{mod.providerId}</span>
        </div>
        <StatusBadge level={level} label={
          hasError ? "Error" :
          isCooldown ? "Cooldown" :
          mod.persisted > 0 ? "Healthy" : "Idle"
        } />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-[#6B6F76]">Candidates</span>
          <span className="text-white">{mod.candidates ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B6F76]">After Gate</span>
          <span className="text-white">{mod.afterGate ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B6F76]">Sent to AI</span>
          <span className="text-white">{mod.sentToAi ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B6F76]">Approved</span>
          <span className={`font-medium ${(mod.aiApproved ?? 0) > 0 ? "text-emerald-400" : "text-white"}`}>{mod.aiApproved ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B6F76]">Persisted</span>
          <span className={`font-medium ${(mod.persisted ?? 0) > 0 ? "text-emerald-400" : "text-white"}`}>{mod.persisted ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#6B6F76]">Duration</span>
          <span className="text-white">{fmtMs(mod.durationMs)}</span>
        </div>
      </div>

      {mod.error && (
        <div className={`mt-2 rounded px-2 py-1 text-[10px] ${
          isCooldown ? "bg-blue-500/10 text-blue-400" : "bg-red-500/10 text-red-400"
        }`}>
          {mod.error}
        </div>
      )}

      {/* AI Pipeline Chain */}
      <div className="mt-3 flex items-center gap-1 text-[9px]">
        <PipelineStep label="Candidates" ok={mod.candidates > 0} />
        <PipelineArrow />
        <PipelineStep label="Gate" ok={mod.afterGate > 0} />
        <PipelineArrow />
        <PipelineStep label="Inference" ok={mod.sentToAi > 0} />
        <PipelineArrow />
        <PipelineStep label="Output" ok={mod.persisted > 0} />
      </div>
    </div>
  );
}

function PipelineStep({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`rounded px-1.5 py-0.5 border ${
      ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-zinc-600/30 bg-zinc-800/50 text-zinc-500"
    }`}>
      {label}
    </span>
  );
}

function PipelineArrow() {
  return <span className="text-[#6B6F76]">&rarr;</span>;
}

// ── Risk & Recovery Panel ───────────────────────────────────────

function RiskPanel({ data }: { data: MCData | null }) {
  if (!data) return <div className="text-sm text-[#6B6F76]">Loading...</div>;

  const risks: Array<{ text: string; level: StatusLevel }> = [];
  const actions: string[] = [];
  const recommendations: string[] = [];

  // Detect risks
  if (data.circuitBreakers?.some((cb: any) => cb.state === "OPEN")) {
    risks.push({ text: "Exchange circuit breaker OPEN", level: "critical" });
    actions.push("Circuit breaker triggered — exchange requests paused");
  }
  if (data.rateLimiter?.cooldownActive) {
    risks.push({ text: "Rate limiter cooldown active", level: "critical" });
    actions.push("Request throttling active");
  }
  if ((data.marketHealth?.summary?.stale ?? 0) > 2) {
    risks.push({ text: `${data.marketHealth.summary.stale} stale symbols`, level: "degraded" });
  }
  if ((data.marketHealth?.summary?.seqOutOfSync ?? 0) > 0) {
    risks.push({ text: `${data.marketHealth.summary.seqOutOfSync} sequence gaps`, level: "degraded" });
    actions.push("Orderbook resync queued for affected symbols");
  }
  if ((data.aiScheduler?.errors?.length ?? 0) > 0) {
    risks.push({ text: "AI inference errors detected", level: "degraded" });
  }
  if (data.process && (data.process.heapUsedMb / data.process.heapTotalMb) > 0.85) {
    risks.push({ text: "Memory pressure elevated", level: "degraded" });
    recommendations.push("Consider increasing heap limit or restarting workers");
  }

  // Recommendations
  if (risks.length === 0) {
    recommendations.push("No action required — all systems nominal");
  } else if (risks.some(r => r.level === "critical")) {
    recommendations.push("Monitor recovery — avoid manual intervention unless circuit stays OPEN > 5min");
  } else {
    recommendations.push("Watch trending metrics — current degradation may self-resolve");
  }

  return (
    <div className="space-y-4">
      {/* Top Risks */}
      <div>
        <h3 className="text-[10px] uppercase tracking-wider text-[#6B6F76] mb-2">Active Risks</h3>
        {risks.length === 0 ? (
          <div className="text-xs text-emerald-400/80">No active risks</div>
        ) : (
          <div className="space-y-1.5">
            {risks.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`h-1.5 w-1.5 rounded-full ${
                  r.level === "critical" ? "bg-red-400" : r.level === "degraded" ? "bg-amber-400" : "bg-zinc-500"
                }`} />
                <span className="text-white/80">{r.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recovery Actions */}
      {actions.length > 0 && (
        <div>
          <h3 className="text-[10px] uppercase tracking-wider text-[#6B6F76] mb-2">Recovery Actions</h3>
          <div className="space-y-1">
            {actions.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-violet-400/80">
                <span className="text-[#6B6F76]">&bull;</span> {a}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div>
        <h3 className="text-[10px] uppercase tracking-wider text-[#6B6F76] mb-2">Recommendations</h3>
        <div className="space-y-1">
          {recommendations.map((r, i) => (
            <div key={i} className="text-xs text-white/60">{r}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
