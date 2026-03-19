import { useEffect, useState } from "react";
import {
  fetchMetrics,
  fetchAiEngineHealth,
  fetchExchangeCoreState,
  fetchTradeIntents,
  fetchTradeEvents,
  type ParsedMetric,
  type AiEngineHealthResponse,
  type ExchangeCoreStateResponse,
  type ExchangeCoreItemsResponse,
} from "../services/systemApi";

const panel = "rounded-2xl border border-white/10 bg-[#121316] p-4";
const statBox = "rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2";
const labelCls = "text-[10px] uppercase tracking-wider text-[#6B6F76]";
const valCls = "text-sm font-semibold text-white";

function fmtBytes(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

function fmtUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getMetric(metrics: ParsedMetric[], name: string, labels?: Record<string, string>): number | null {
  for (const m of metrics) {
    if (m.name !== name) continue;
    if (labels) {
      const match = Object.entries(labels).every(([k, v]) => m.labels[k] === v);
      if (!match) continue;
    }
    return m.value;
  }
  return null;
}

function getMetricsWithLabel(metrics: ParsedMetric[], namePrefix: string): Array<{ labels: Record<string, string>; value: number; name: string }> {
  return metrics.filter((m) => m.name.startsWith(namePrefix));
}

export default function SystemMonitorPage() {
  const [metrics, setMetrics] = useState<ParsedMetric[]>([]);
  const [aiHealth, setAiHealth] = useState<AiEngineHealthResponse | null>(null);
  const [coreState, setCoreState] = useState<ExchangeCoreStateResponse | null>(null);
  const [intents, setIntents] = useState<ExchangeCoreItemsResponse | null>(null);
  const [events, setEvents] = useState<ExchangeCoreItemsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAll = async () => {
    try {
      const [m, ai, cs, ti, te] = await Promise.allSettled([
        fetchMetrics(),
        fetchAiEngineHealth(),
        fetchExchangeCoreState(),
        fetchTradeIntents(),
        fetchTradeEvents(),
      ]);
      if (m.status === "fulfilled") setMetrics(m.value);
      if (ai.status === "fulfilled") setAiHealth(ai.value);
      if (cs.status === "fulfilled") setCoreState(cs.value);
      if (ti.status === "fulfilled") setIntents(ti.value);
      if (te.status === "fulfilled") setEvents(te.value);
      setError("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load system data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    const timer = setInterval(loadAll, 15_000);
    return () => clearInterval(timer);
  }, []);

  if (loading && !metrics.length) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--textMuted)] md:p-6">
        <div className="mx-auto max-w-[1560px] flex items-center justify-center min-h-[60vh]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#F5C542] border-t-transparent" />
        </div>
      </main>
    );
  }

  const heapUsed = getMetric(metrics, "bitrium_process_heap_used_bytes");
  const heapTotal = getMetric(metrics, "bitrium_process_heap_total_bytes");
  const rss = getMetric(metrics, "bitrium_process_rss_bytes");
  const eventLoopLag = getMetric(metrics, "bitrium_event_loop_lag_ms");
  const uptime = getMetric(metrics, "bitrium_uptime_seconds");

  const rlMetrics = getMetricsWithLabel(metrics, "bitrium_exchange_rl_");
  const cbMetrics = getMetricsWithLabel(metrics, "bitrium_circuit_breaker_");
  const botQueueMetrics = getMetricsWithLabel(metrics, "bitrium_bot_queue_");
  const botBreakerMetrics = getMetricsWithLabel(metrics, "bitrium_bot_breaker_");
  const batchWriter = getMetric(metrics, "bitrium_batch_writer_pending");

  // Group rate limiters by venue
  const rlByVenue = new Map<string, { usage: number; max: number; ratio: number }>();
  for (const m of rlMetrics) {
    const venue = m.labels.venue ?? "unknown";
    if (!rlByVenue.has(venue)) rlByVenue.set(venue, { usage: 0, max: 0, ratio: 0 });
    const entry = rlByVenue.get(venue)!;
    if (m.name.endsWith("_usage")) entry.usage = m.value;
    if (m.name.endsWith("_max")) entry.max = m.value;
    if (m.name.endsWith("_ratio")) entry.ratio = m.value;
  }

  // Group circuit breakers by venue
  const cbByVenue = new Map<string, { state: number; failures: number }>();
  for (const m of cbMetrics) {
    const venue = m.labels.venue ?? "unknown";
    if (!cbByVenue.has(venue)) cbByVenue.set(venue, { state: 0, failures: 0 });
    const entry = cbByVenue.get(venue)!;
    if (m.name.endsWith("_state")) entry.state = m.value;
    if (m.name.endsWith("_failures")) entry.failures = m.value;
  }

  const cbStateLabel = (v: number) => v === 0 ? "CLOSED" : v === 1 ? "HALF_OPEN" : "OPEN";
  const cbStateColor = (v: number) => v === 0 ? "text-[#4ade80]" : v === 1 ? "text-[#F5C542]" : "text-[#fb7185]";

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--textMuted)] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        {/* Header */}
        <section className={panel}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-white">System Monitor</h1>
              <p className="text-xs text-[#6B6F76]">Process metrics, AI engine, exchange core &middot; Auto-refresh 15s</p>
            </div>
            <button type="button" onClick={() => void loadAll()} className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7] hover:bg-[#17191d]">
              Refresh
            </button>
          </div>
        </section>

        {error && <div className="rounded-xl border border-[#704844] bg-[#271a19] p-3 text-sm text-[#d6b3af]">{error}</div>}

        {/* 1. Process Metrics */}
        <section className={panel}>
          <h2 className="text-sm font-semibold text-white mb-3">Process Metrics</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className={statBox}>
              <span className={labelCls}>Heap Used</span>
              <p className={valCls}>{heapUsed != null ? fmtBytes(heapUsed) : "—"}</p>
              {heapTotal != null && <p className="text-[10px] text-[#6B6F76]">of {fmtBytes(heapTotal)}</p>}
            </div>
            <div className={statBox}>
              <span className={labelCls}>RSS Memory</span>
              <p className={valCls}>{rss != null ? fmtBytes(rss) : "—"}</p>
            </div>
            <div className={statBox}>
              <span className={labelCls}>Event Loop Lag</span>
              <p className={`text-sm font-semibold ${eventLoopLag != null && eventLoopLag > 50 ? "text-[#fb7185]" : eventLoopLag != null && eventLoopLag > 10 ? "text-[#F5C542]" : "text-[#4ade80]"}`}>
                {eventLoopLag != null ? `${eventLoopLag}ms` : "—"}
              </p>
            </div>
            <div className={statBox}>
              <span className={labelCls}>Uptime</span>
              <p className={valCls}>{uptime != null ? fmtUptime(uptime) : "—"}</p>
            </div>
            <div className={statBox}>
              <span className={labelCls}>Batch Writer</span>
              <p className={valCls}>{batchWriter ?? 0} pending</p>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 2. AI Engine V2 */}
          <section className={panel}>
            <h2 className="text-sm font-semibold text-white mb-3">AI Engine V2</h2>
            {aiHealth ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${aiHealth.enabled ? "bg-[#4ade80]" : "bg-[#fb7185]"}`} />
                  <span className="text-sm text-white font-medium">{aiHealth.enabled ? "Enabled" : "Disabled"}</span>
                </div>
                {aiHealth.lastCycle && (
                  <div className={statBox}>
                    <span className={labelCls}>Last Cycle</span>
                    <div className="mt-1 space-y-0.5 text-[11px]">
                      {Object.entries(aiHealth.lastCycle).slice(0, 8).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-[#6B6F76]">{k}</span>
                          <span className="text-white font-medium">{typeof v === "number" ? v.toFixed(2) : String(v ?? "—")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {aiHealth.state && Object.keys(aiHealth.state).length > 0 && (
                  <div className={statBox}>
                    <span className={labelCls}>Engine State</span>
                    <div className="mt-1 space-y-0.5 text-[11px]">
                      {Object.entries(aiHealth.state).slice(0, 6).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-[#6B6F76]">{k}</span>
                          <span className="text-white font-medium">{typeof v === "number" ? v.toFixed(2) : String(v ?? "—")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#6B6F76]">Unable to fetch AI engine status.</p>
            )}
          </section>

          {/* 3. Exchange Core */}
          <section className={panel}>
            <h2 className="text-sm font-semibold text-white mb-3">Exchange Core</h2>

            {/* Rate Limiters */}
            {rlByVenue.size > 0 && (
              <div className="mb-3">
                <span className={`${labelCls} block mb-2`}>Rate Limiters</span>
                <div className="space-y-1.5">
                  {[...rlByVenue.entries()].map(([venue, data]) => (
                    <div key={venue} className="flex items-center gap-2 rounded border border-white/5 bg-[#0F1012] px-2.5 py-1.5">
                      <span className="text-[11px] text-[#BFC2C7] w-20">{venue}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${data.ratio > 0.8 ? "bg-[#fb7185]" : data.ratio > 0.5 ? "bg-[#F5C542]" : "bg-[#4ade80]"}`}
                          style={{ width: `${Math.min(100, data.ratio * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[#6B6F76] w-16 text-right">{data.usage}/{data.max}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Circuit Breakers */}
            {cbByVenue.size > 0 && (
              <div className="mb-3">
                <span className={`${labelCls} block mb-2`}>Circuit Breakers</span>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {[...cbByVenue.entries()].map(([venue, data]) => (
                    <div key={venue} className="flex items-center justify-between rounded border border-white/5 bg-[#0F1012] px-2.5 py-1.5">
                      <span className="text-[11px] text-[#BFC2C7]">{venue}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold ${cbStateColor(data.state)}`}>{cbStateLabel(data.state)}</span>
                        {data.failures > 0 && <span className="text-[9px] text-[#fb7185]">{data.failures}F</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Core metrics JSON */}
            {coreState?.metrics && (
              <div className={statBox}>
                <span className={labelCls}>Core Metrics</span>
                <div className="mt-1 space-y-0.5 text-[11px]">
                  {Object.entries(coreState.metrics).slice(0, 8).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-[#6B6F76]">{k}</span>
                      <span className="text-white font-medium">{typeof v === "number" ? v.toLocaleString() : String(v ?? "—")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* 4. Bot Infrastructure */}
        <section className={panel}>
          <h2 className="text-sm font-semibold text-white mb-3">Bot Infrastructure</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {botQueueMetrics.map((m) => {
              const shortName = m.name.replace("bitrium_bot_queue_", "").replace(/_/g, " ");
              return (
                <div key={m.name} className={statBox}>
                  <span className={labelCls}>{shortName}</span>
                  <p className={valCls}>{m.value}</p>
                </div>
              );
            })}
            {botBreakerMetrics.map((m) => {
              const shortName = m.name.replace("bitrium_bot_breaker_", "").replace(/_/g, " ");
              const hasSymbol = m.labels.symbol;
              return (
                <div key={`${m.name}-${m.labels.symbol ?? ""}`} className={statBox}>
                  <span className={labelCls}>{shortName}{hasSymbol ? ` (${m.labels.symbol})` : ""}</span>
                  <p className={valCls}>{m.value}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Trade Intents & Events */}
        <div className="grid gap-4 lg:grid-cols-2">
          {intents && intents.items.length > 0 && (
            <section className={panel}>
              <h2 className="text-sm font-semibold text-white mb-3">Trade Intents <span className="text-[#6B6F76] font-normal">({intents.items.length})</span></h2>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {intents.items.slice(0, 20).map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded border border-white/5 bg-[#0F1012] px-2.5 py-1.5 text-[11px]">
                    <span className="text-white">{String(item.symbol ?? item.id ?? `#${i + 1}`)}</span>
                    <span className="text-[#6B6F76]">{String(item.status ?? item.type ?? "—")}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {events && events.items.length > 0 && (
            <section className={panel}>
              <h2 className="text-sm font-semibold text-white mb-3">Trade Events <span className="text-[#6B6F76] font-normal">({events.items.length})</span></h2>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {events.items.slice(0, 20).map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded border border-white/5 bg-[#0F1012] px-2.5 py-1.5 text-[11px]">
                    <span className="text-white">{String(item.symbol ?? item.type ?? `#${i + 1}`)}</span>
                    <span className="text-[#6B6F76]">{String(item.event ?? item.status ?? "—")}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
