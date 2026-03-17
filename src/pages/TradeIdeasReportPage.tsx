import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CoinIcon } from "../components/CoinIcon";
import { useUserSettings } from "../hooks/useUserSettings";
import { SCORING_MODE_OPTIONS, scoringModeLabel } from "../data/scoringEngine";
import { fetchAiTradeIdeasState, fetchAiTradeIdeasReportStats, type AiProviderId, type AiScanRowDto, type AiReportModuleStats } from "../services/adminAiProvidersApi";

type WindowKey = "1H" | "4H" | "24H";

/** Full type matching server's TradeIdeaRecord */
type ApiTradeIdea = {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence_pct: number;
  scoring_mode: string;
  approved_modes?: string[];
  mode_scores?: Record<string, number>;
  status: string;
  result: string;
  created_at: string;
  resolved_at: string | null;
  activated_at: string | null;
  entry_low: number;
  entry_high: number;
  sl_levels: number[];
  tp_levels: number[];
  hit_level_type: string | null;
  hit_level_index: number | null;
  hit_level_price: number | null;
  minutes_to_entry: number | null;
  minutes_to_exit: number | null;
  minutes_total: number | null;
  horizon: string;
  timeframe: string;
  trade_validity?: string;
};

type AiModelFilter = "ALL" | AiProviderId;
type AiReportIdea = {
  id: string;
  module: AiProviderId;
  symbol: string;
  direction: "LONG" | "SHORT";
  confidencePct: number;
  timestampUtc: string;
  entryLow: number | null;
  entryHigh: number | null;
  stops: number[];
  targets: number[];
  decision: string;
};

// Per-mode min score thresholds — must match server's REPORT_MIN_SCORE
const REPORT_MIN_SCORE_QUANT: Record<string, number> = {
  FLOW: 55,
  AGGRESSIVE: 60,
  BALANCED: 65,
  CAPITAL_GUARD: 68,
};
const REPORT_MIN_CONSENSUS_AI = 60;
const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

// windowMs removed — stats now fetched via API with range param

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
};

const fmtLevel = (value: number) => {
  const abs = Math.abs(value || 0);
  if (!abs) return "0.00";
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  });
};

const normalizeAiReportIdea = (row: AiScanRowDto, index: number): AiReportIdea => {
  const side = String(row.side ?? "").toUpperCase();
  const direction: "LONG" | "SHORT" = side === "SHORT" ? "SHORT" : "LONG";
  const zone = Array.isArray(row.entry?.zone) ? row.entry?.zone.filter((v) => Number.isFinite(Number(v))).map(Number) : [];
  const zoneLow = zone.length ? Math.min(...zone) : null;
  const zoneHigh = zone.length ? Math.max(...zone) : null;
  const sls = Array.isArray(row.entry?.sl)
    ? row.entry.sl.map((v) => Number(v)).filter((v) => Number.isFinite(v))
    : Number.isFinite(Number(row.entry?.stop))
      ? [Number(row.entry?.stop)]
      : [];
  const tps = Array.isArray(row.entry?.tp)
    ? row.entry.tp.map((v) => Number(v)).filter((v) => Number.isFinite(v))
    : [];
  return {
    id: `${row.module}-${row.symbol}-${row.scannedAt}-${index}`,
    module: row.module,
    symbol: String(row.symbol ?? "").toUpperCase(),
    direction,
    confidencePct: clampPercent(Number(row.scorePct ?? 0)),
    timestampUtc: String(row.scannedAt ?? new Date().toISOString()),
    entryLow: zoneLow,
    entryHigh: zoneHigh,
    stops: sls,
    targets: tps,
    decision: String(row.decision ?? "NO_TRADE").toUpperCase(),
  };
};

/** Entry-missed ideas are NOT real trades — filter them out */
const isEntryMissed = (idea: ApiTradeIdea): boolean =>
  idea.result === "FAIL" && !idea.activated_at && !idea.hit_level_type;

/** Result label for quant ideas */
const resultLabel = (idea: ApiTradeIdea): string => {
  if (idea.result === "SUCCESS") {
    const hit = idea.hit_level_type && idea.hit_level_index ? `${idea.hit_level_type}${idea.hit_level_index} HIT` : "";
    return hit ? `SUCCESS \u2022 ${hit}` : "SUCCESS";
  }
  if (idea.result === "FAIL") {
    if (idea.hit_level_type && idea.hit_level_index) return `FAIL \u2022 ${idea.hit_level_type}${idea.hit_level_index} HIT`;
    return "FAIL";
  }
  return "ACTIVE";
};

const resultStyle = (idea: ApiTradeIdea): string => {
  if (idea.result === "SUCCESS") return "border-[#6f8f6d] bg-[#1f2c1d] text-[#8fc9ab]";
  if (idea.result === "FAIL") return "border-[#a85a52] bg-[#3a1e1d] text-[#d49f9a]";
  return "border-[#7a6840] bg-[#2a2418] text-[#F5C542]";
};

export default function TradeIdeasReportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAiReport = location.pathname.startsWith("/ai-trade-ideas/report");
  const { scoringMode, setScoringMode, loading: userSettingsLoading } = useUserSettings();
  const [windowKey, setWindowKey] = useState<WindowKey>("24H");
  const [apiIdeas, setApiIdeas] = useState<ApiTradeIdea[]>([]);
  const [entryMissedIdeas, setEntryMissedIdeas] = useState<ApiTradeIdea[]>([]);
  const [totalScanByMode, setTotalScanByMode] = useState<Record<string, {
    totalScan: number; totalIdeas: number; resolved: number;
    success: number; failed: number; successRate: number;
  }>>({});
  const [aiModelFilter, setAiModelFilter] = useState<AiModelFilter>("ALL");
  const [aiReportRows, setAiReportRows] = useState<AiReportIdea[]>([]);
  const [expandedHour, setExpandedHour] = useState<string | null>(null);
  const reportMinConsensus = isAiReport ? REPORT_MIN_CONSENSUS_AI : (REPORT_MIN_SCORE_QUANT[scoringMode] ?? 70);
  const now = Date.now();

  // AI report: per-module stats from DB
  const [aiStatsByModule, setAiStatsByModule] = useState<Record<string, AiReportModuleStats>>({});

  // ── Data Fetch (every 10s) ──
  useEffect(() => {
    let mounted = true;
    let timer: number | null = null;
    const run = async () => {
      try {
        if (isAiReport) {
          // Fetch real DB-backed trade ideas for AI modules
          const aiUserIds = ["ai-chatgpt", "ai-qwen", "ai-qwen2"];
          const [ideasRes, statsData] = await Promise.all([
            Promise.all(aiUserIds.map((uid) =>
              fetch(`/api/trade-ideas?limit=500`, { headers: { "x-user-id": uid } })
                .then((r) => r.ok ? r.json() : null)
                .then((body: any) => (body?.ok && Array.isArray(body.items) ? body.items as ApiTradeIdea[] : []))
                .catch(() => [] as ApiTradeIdea[])
            )),
            fetchAiTradeIdeasReportStats(windowKey === "1H" ? "1h" : windowKey === "4H" ? "4h" : "24h"),
          ]);
          if (!mounted) return;

          const allAiIdeas = ideasRes.flat();
          // Also fetch scan rows for display in hourly breakdown
          const state = await fetchAiTradeIdeasState();
          if (!mounted) return;
          if (state?.ok) {
            const rows = (Object.values(state.scansByModule ?? {}) as AiScanRowDto[][])
              .flat()
              .map((row, index) => normalizeAiReportIdea(row, index));
            setAiReportRows(rows);
          }

          if (statsData?.ok) {
            setAiStatsByModule(statsData.statsByModule ?? {});
          }

          // Use real DB ideas for the idea table
          const qualified = allAiIdeas.filter((i) => i.confidence_pct >= reportMinConsensus);
          const filtered = qualified
            .filter((i) => !isEntryMissed(i))
            .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
          const missed = qualified
            .filter((i) => isEntryMissed(i))
            .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
          setApiIdeas(filtered);
          setEntryMissedIdeas(missed);
          return;
        }
        // Quant report: fetch system-scanner ideas only (matches report-stats)
        const qs = new URLSearchParams({ limit: "1000", scoring_mode: scoringMode });
        const [ideasRes, statsRes] = await Promise.all([
          fetch(`/api/trade-ideas?${qs.toString()}`, { headers: { "x-user-id": "system-scanner" } }),
          fetch("/api/trade-ideas/report-stats"),
        ]);
        if (!mounted) return;

        const allRows: ApiTradeIdea[] = [];
        if (ideasRes.ok) {
          const body = (await ideasRes.json()) as { ok?: boolean; items?: ApiTradeIdea[] };
          if (body?.ok && Array.isArray(body.items)) {
            allRows.push(...body.items);
          }
        }
        if (statsRes.ok) {
          const body = (await statsRes.json()) as {
            ok?: boolean;
            statsByMode?: Record<string, {
              totalScan: number; totalIdeas: number; resolved: number;
              success: number; failed: number; successRate: number;
            }>;
          };
          if (body?.ok && body.statsByMode) {
            setTotalScanByMode(body.statsByMode as Record<string, any>);
          }
        }

        // Split: real ideas vs entry-missed (70%+ confidence, sorted newest first)
        const qualified = allRows.filter((i) => i.confidence_pct >= reportMinConsensus);
        const filtered = qualified
          .filter((i) => !isEntryMissed(i))
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        const missed = qualified
          .filter((i) => isEntryMissed(i))
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        setApiIdeas(filtered);
        setEntryMissedIdeas(missed);
      } catch {
        // keep existing data
      }
    };
    void run();
    timer = window.setInterval(() => void run(), 10_000);
    return () => {
      mounted = false;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [isAiReport, scoringMode, reportMinConsensus, windowKey]);

  // ── AI report computed data (unchanged) ──
  const aiBase = useMemo(
    () =>
      aiReportRows
        .filter((row) => row.confidencePct >= reportMinConsensus)
        .filter((row) => (aiModelFilter === "ALL" ? true : row.module === aiModelFilter))
        .sort((a, b) => Date.parse(b.timestampUtc) - Date.parse(a.timestampUtc))
        .slice(0, 100),
    [aiModelFilter, aiReportRows, reportMinConsensus],
  );
  // aiFiltered removed — stats now come from DB via fetchAiTradeIdeasReportStats

  // ── Stats: use report-stats endpoint data directly (matches main page) ──
  const stats = useMemo(() => {
    if (isAiReport) {
      // Aggregate across all AI modules (or filter by selected model)
      const moduleIds = aiModelFilter === "ALL" ? ["CHATGPT", "QWEN", "QWEN2"] : [aiModelFilter];
      let totalScan = 0, total = 0, active = 0, totalReal = 0, success = 0, failed = 0, entryMissed = 0;
      for (const mid of moduleIds) {
        const s = aiStatsByModule[mid];
        if (!s) continue;
        totalScan += s.totalScan;
        total += s.totalIdeas;
        active += s.active;
        totalReal += s.resolved;
        success += s.success;
        failed += s.failed;
        entryMissed += s.entryMissed;
      }
      const successRate = totalReal > 0 ? (success / totalReal) * 100 : 0;
      return { totalScan, total, totalReal, success, failed, successRate };
    }
    const modeStats = totalScanByMode[scoringMode];
    if (!modeStats) return { totalScan: 0, total: 0, totalReal: 0, success: 0, failed: 0, successRate: 0 };
    return {
      totalScan: modeStats.totalScan,
      total: modeStats.totalIdeas,
      totalReal: modeStats.resolved,
      success: modeStats.success,
      failed: modeStats.failed,
      successRate: modeStats.successRate,
    };
  }, [isAiReport, aiModelFilter, aiStatsByModule, totalScanByMode, scoringMode]);

  // ── Hourly Breakdown: ALWAYS last 24 hours ──
  const grouped = useMemo(() => {
    const threshold24h = 24 * 60 * 60 * 1000;

    if (isAiReport) {
      const map = new Map<string, { total: number; real: number; success: number; failed: number; items: AiReportIdea[] }>();
      for (const p of aiBase) {
        const d = new Date(p.timestampUtc);
        const ts = d.getTime();
        if (Number.isNaN(ts) || now - ts > threshold24h) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`;
        const prev = map.get(key) ?? { total: 0, real: 0, success: 0, failed: 0, items: [] };
        prev.total += 1;
        prev.items.push(p);
        map.set(key, prev);
      }
      return Array.from(map.entries())
        .map(([key, v]) => ({ key, ...v, rate: 0 }))
        .sort((a, b) => (a.key < b.key ? 1 : -1));
    }

    // Quant: always 24H
    const map = new Map<string, { total: number; real: number; success: number; failed: number; items: ApiTradeIdea[] }>();
    for (const idea of apiIdeas) {
      const d = new Date(idea.created_at);
      const ts = d.getTime();
      if (Number.isNaN(ts) || now - ts > threshold24h) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`;
      const prev = map.get(key) ?? { total: 0, real: 0, success: 0, failed: 0, items: [] };
      prev.total += 1;
      prev.items.push(idea);
      if (idea.result === "SUCCESS" || idea.result === "FAIL") {
        prev.real += 1;
        if (idea.result === "SUCCESS") prev.success += 1;
        if (idea.result === "FAIL") prev.failed += 1;
      }
      map.set(key, prev);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, rate: v.real ? (v.success / v.real) * 100 : 0 }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [isAiReport, aiBase, apiIdeas, now]);

  // Expanded hour items
  const expandedItems = useMemo(() => {
    if (!expandedHour) return [];
    const bucket = grouped.find((g) => g.key === expandedHour);
    return bucket?.items ?? [];
  }, [expandedHour, grouped]);

  // ── Last 100: NO time window, always latest 100 ──
  const last100 = useMemo(() => {
    if (isAiReport) {
      // Use real DB-backed ideas when available, fall back to scan rows
      if (apiIdeas.length > 0) return apiIdeas.slice(0, 100);
      return aiBase.slice(0, 100);
    }
    return apiIdeas.slice(0, 100);
  }, [isAiReport, aiBase, apiIdeas]);

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        {/* ── Header + Stats ── */}
        <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-white">{isAiReport ? "AI Trade Ideas Report" : "Quant Trade Ideas"}</h1>
              <p className="text-xs text-[#6B6F76]">Ideas scoring {reportMinConsensus}%+</p>
            </div>
            <div className="flex items-center gap-2">
              {(["1H", "4H", "24H"] as WindowKey[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWindowKey(w)}
                  className={`rounded-lg border px-2 py-1 text-xs ${windowKey === w ? "border-[#F5C542]/70 bg-[#2b2417] text-[#F5C542]" : "border-white/10 bg-[#0F1012] text-[#BFC2C7]"}`}
                >
                  {w}
                </button>
              ))}
              {isAiReport ? (
                <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#0F1012] px-2 py-1">
                  <span className="text-[11px] text-[#8A8F98]">AI</span>
                  {(["ALL", "CHATGPT", "QWEN", "QWEN2"] as AiModelFilter[]).map((item) => {
                    const active = aiModelFilter === item;
                    const label = item === "ALL" ? "All" : item === "CHATGPT" ? "ChatGPT" : item === "QWEN" ? "Qwen" : "Qwen-2";
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setAiModelFilter(item)}
                        className={`rounded px-2 py-1 text-xs font-semibold transition ${
                          active
                            ? "border border-[#F5C542]/60 bg-[#2b2417] text-[#F5C542]"
                            : "border border-white/10 bg-[#121316] text-[#BFC2C7] hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {!isAiReport ? (
                <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#0F1012] px-1 py-1">
                  <span className="px-1 text-[11px] text-[#8A8F98]">Mode</span>
                  {SCORING_MODE_OPTIONS.map((modeOption) => {
                    const active = scoringMode === modeOption.id;
                    return (
                      <button
                        key={modeOption.id}
                        type="button"
                        disabled={userSettingsLoading}
                        onClick={() => setScoringMode(modeOption.id)}
                        className={`rounded px-2 py-1 text-xs font-semibold transition ${
                          active
                            ? "border border-[#F5C542]/60 bg-[#2b2417] text-[#F5C542]"
                            : "border border-white/10 bg-[#121316] text-[#BFC2C7] hover:text-white"
                        }`}
                      >
                        {scoringModeLabel(modeOption.id)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => navigate(isAiReport ? "/ai-trade-ideas" : "/quant-trade-ideas")}
                className="rounded-lg border border-white/15 bg-[#0F1012] px-2 py-1 text-xs text-[#BFC2C7]"
              >
                Back
              </button>
            </div>
          </div>

          <p className="mt-2 text-xs text-[#8A8F98]">
            {!isAiReport ? (
              <>
                Mode: <span className="font-semibold text-[#F5C542]">{scoringModeLabel(scoringMode)}</span> ·{" "}
              </>
            ) : null}
            {isAiReport && aiModelFilter !== "ALL" ? (
              <>
                AI Model:{" "}
                <span className="font-semibold text-[#F5C542]">
                  {aiModelFilter === "CHATGPT" ? "ChatGPT" : aiModelFilter === "QWEN" ? "Qwen" : "Qwen-2"}
                </span>{" "}
                ·{" "}
              </>
            ) : null}
            Window: <span className="font-semibold text-[#BFC2C7]">{windowKey}</span> · Total Scan:{" "}
            <span className="font-semibold text-[#8A8F98]">{stats.totalScan}</span> · Ideas:{" "}
            <span className="font-semibold text-white">{stats.total}</span> · Resolved:{" "}
            <span className="font-semibold text-white">{stats.totalReal}</span>
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-7">
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Total Scan</p><p className="text-lg font-semibold text-[#8A8F98]">{stats.totalScan}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Total Trade Ideas</p><p className="text-lg font-semibold text-white">{stats.total}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Entry Missed</p><p className="text-lg font-semibold text-[#8A8F98]">{entryMissedIdeas.length}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Resolved Total Ideas</p><p className="text-lg font-semibold text-[#BFC2C7]">{stats.totalReal}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Success</p><p className="text-lg font-semibold text-[#8fc9ab]">{stats.success}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Failed</p><p className="text-lg font-semibold text-[#d49f9a]">{stats.failed}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Success %</p><p className="text-lg font-semibold text-[#F5C542]">{stats.successRate.toFixed(1)}%</p></div>
          </div>
        </section>

        {/* ── Hourly Breakdown (always last 24H) ── */}
        <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
          <h2 className="mb-2 text-sm font-semibold text-white">HOURLY breakdown <span className="text-[11px] font-normal text-[#6B6F76]">(last 24 hours)</span></h2>
          <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-[#0F1012] text-[#8A8F98]">
                <tr>
                  <th className="px-2 py-2 text-left">Time Bucket</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-right">Resolved</th>
                  <th className="px-2 py-2 text-right">Success</th>
                  <th className="px-2 py-2 text-right">Failed</th>
                  <th className="px-2 py-2 text-right">Success %</th>
                </tr>
              </thead>
              <tbody>
                {grouped.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-4 text-center text-[#6B6F76]">No data in last 24 hours</td></tr>
                )}
                {grouped.map((g) => {
                  const isExpanded = expandedHour === g.key;
                  return (
                    <tr
                      key={g.key}
                      onClick={() => setExpandedHour(isExpanded ? null : g.key)}
                      className={`cursor-pointer border-t border-white/10 transition-colors ${isExpanded ? "bg-[#1a1c20]" : "hover:bg-[#15171b]"}`}
                    >
                      <td className="px-2 py-1.5">
                        <span className="mr-1.5 inline-block w-3 text-center text-[10px] text-[#8A8F98]">{isExpanded ? "\u25BC" : "\u25B6"}</span>
                        {g.key}
                      </td>
                      <td className="px-2 py-1.5 text-right">{g.total}</td>
                      <td className="px-2 py-1.5 text-right">{g.real}</td>
                      <td className="px-2 py-1.5 text-right text-[#8fc9ab]">{g.success}</td>
                      <td className="px-2 py-1.5 text-right text-[#d49f9a]">{g.failed}</td>
                      <td className="px-2 py-1.5 text-right text-[#F5C542]">{g.rate.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Expanded Hour Detail ── */}
          {expandedHour && expandedItems.length > 0 && (
            <div className="mt-2 rounded-lg border border-[#F5C542]/20 bg-[#15171b] p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#F5C542]">{expandedHour} — {expandedItems.length} ideas</h3>
                <button type="button" onClick={() => setExpandedHour(null)} className="text-[10px] text-[#8A8F98] hover:text-white">Close ✕</button>
              </div>
              <div className="max-h-60 overflow-auto rounded-lg border border-white/10">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-[#0F1012] text-[#8A8F98]">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Time</th>
                      <th className="px-2 py-1.5 text-left">Symbol</th>
                      <th className="px-2 py-1.5 text-left">Dir / Score</th>
                      <th className="px-2 py-1.5 text-left">Entry</th>
                      <th className="px-2 py-1.5 text-left">SL</th>
                      <th className="px-2 py-1.5 text-left">TP</th>
                      <th className="px-2 py-1.5 text-left">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expandedItems.map((raw) => {
                      if (isAiReport) {
                        const p = raw as AiReportIdea;
                        return (
                          <tr key={p.id} className="border-t border-white/10">
                            <td className="px-2 py-1 text-[#BFC2C7]">{fmtDate(p.timestampUtc)}</td>
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-1.5">
                                <CoinIcon symbol={p.symbol} className="h-3.5 w-3.5" />
                                <span className="text-white">{p.symbol}</span>
                              </div>
                            </td>
                            <td className="px-2 py-1">
                              <span className={`mr-1 text-[10px] font-semibold ${p.direction === "LONG" ? "text-[#d8decf]" : "text-[#d6b3af]"}`}>{p.direction}</span>
                              <span className="font-semibold text-[#F5C542]">{p.confidencePct}%</span>
                            </td>
                            <td className="px-2 py-1 text-[#d8decf]">{p.entryLow != null && p.entryHigh != null ? `${fmtLevel(p.entryLow)} - ${fmtLevel(p.entryHigh)}` : "-"}</td>
                            <td className="px-2 py-1 text-[#e4b4af]">{p.stops.length ? p.stops.map((s) => fmtLevel(s)).join(", ") : "-"}</td>
                            <td className="px-2 py-1 text-[#dce4d0]">{p.targets.length ? p.targets.map((t) => fmtLevel(t)).join(", ") : "-"}</td>
                            <td className="px-2 py-1 font-semibold text-[#BFC2C7]">{p.decision}</td>
                          </tr>
                        );
                      }
                      const p = raw as ApiTradeIdea;
                      return (
                        <tr key={p.id} className="border-t border-white/10">
                          <td className="px-2 py-1 text-[#BFC2C7]">{fmtDate(p.created_at)}</td>
                          <td className="px-2 py-1">
                            <div className="flex items-center gap-1.5">
                              <CoinIcon symbol={p.symbol} className="h-3.5 w-3.5" />
                              <span className="text-white">{p.symbol}</span>
                            </div>
                          </td>
                          <td className="px-2 py-1">
                            <span className={`mr-1 text-[10px] font-semibold ${p.direction === "LONG" ? "text-[#d8decf]" : "text-[#d6b3af]"}`}>{p.direction}</span>
                            <span className="font-semibold text-[#F5C542]">{p.confidence_pct}%</span>
                          </td>
                          <td className="px-2 py-1 text-[#d8decf]">{fmtLevel(Math.min(p.entry_low, p.entry_high))} - {fmtLevel(Math.max(p.entry_low, p.entry_high))}</td>
                          <td className="px-2 py-1 text-[#e4b4af]">{p.sl_levels.length ? p.sl_levels.map((s) => fmtLevel(s)).join(", ") : "-"}</td>
                          <td className="px-2 py-1 text-[#dce4d0]">{p.tp_levels.length ? p.tp_levels.map((t) => fmtLevel(t)).join(", ") : "-"}</td>
                          <td className="px-2 py-1">
                            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${resultStyle(p)}`}>
                              {resultLabel(p)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ── Last 100 Trade Ideas (no time window, always latest) ── */}
        <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
          <h2 className="mb-2 text-sm font-semibold text-white">Last 100 trade ideas <span className="text-[11px] font-normal text-[#6B6F76]">(auto-refreshing)</span></h2>
          <div className="max-h-[52vh] overflow-auto rounded-lg border border-white/10">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-[#0F1012] text-[#8A8F98]">
                <tr>
                  <th className="px-2 py-2 text-left">Time</th>
                  <th className="px-2 py-2 text-left">Symbol</th>
                  <th className="px-2 py-2 text-left">Direction / Confidence</th>
                  <th className="px-2 py-2 text-left">Entry Level</th>
                  <th className="px-2 py-2 text-left">SL Level</th>
                  <th className="px-2 py-2 text-left">TP Level</th>
                  <th className="px-2 py-2 text-right">Time to Exit (min)</th>
                  <th className="px-2 py-2 text-left">Result</th>
                </tr>
              </thead>
              <tbody>
                {last100.length === 0 && (
                  <tr><td colSpan={8} className="px-2 py-4 text-center text-[#6B6F76]">No trade ideas yet</td></tr>
                )}
                {last100.map((raw) => {
                  // Check if this is a DB-backed idea (ApiTradeIdea) or scan-row (AiReportIdea)
                  const isDbIdea = "created_at" in (raw as any) && "entry_low" in (raw as any);

                  if (isAiReport && !isDbIdea) {
                    const p = raw as AiReportIdea;
                    const entryLevel =
                      Number.isFinite(Number(p.entryLow)) && Number.isFinite(Number(p.entryHigh))
                        ? `${fmtLevel(Number(p.entryLow))} - ${fmtLevel(Number(p.entryHigh))}`
                        : "-";
                    const slLevels = p.stops.map((value) => fmtLevel(value));
                    const tpLevels = p.targets.map((value) => fmtLevel(value));
                    const aiResultText = p.decision || "PENDING";
                    return (
                      <tr key={p.id} className="border-t border-white/10">
                        <td className="px-2 py-1.5 text-[#BFC2C7]">{fmtDate(p.timestampUtc)}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <CoinIcon symbol={p.symbol} className="h-4 w-4" />
                            <span className="text-white">{p.symbol}</span>
                            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                              p.module === "CHATGPT"
                                ? "border-[#3d5f8f]/70 bg-[#132033] text-[#b8d3ff]"
                                : p.module === "QWEN2"
                                  ? "border-[#8b4fa8]/70 bg-[#2e1a3c] text-[#e8cdfd]"
                                  : "border-[#6b4fa8]/70 bg-[#241a3c] text-[#dbcdfd]"
                            }`}>
                              {p.module === "CHATGPT" ? "ChatGPT" : p.module === "QWEN2" ? "Qwen-2" : "Qwen"}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="inline-flex items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${p.direction === "LONG" ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]" : "border-[#704844] bg-[#271a19] text-[#d6b3af]"}`}>
                              {p.direction}
                            </span>
                            <span className="font-semibold text-[#F5C542]">{p.confidencePct}%</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 font-medium text-[#d8decf]">{entryLevel}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-wrap gap-1">
                            {slLevels.length ? (
                              slLevels.map((price, idx) => (
                                <span key={`${p.id}-sl-${idx}`} className="rounded-md border border-[#704844]/70 bg-[#1f1515] px-1.5 py-0.5 text-[11px] font-semibold text-[#e4b4af]">
                                  SL{idx + 1} {price}
                                </span>
                              ))
                            ) : (
                              <span className="text-[#BFC2C7]">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-wrap gap-1">
                            {tpLevels.length ? (
                              tpLevels.map((price, idx) => (
                                <span key={`${p.id}-tp-${idx}`} className="rounded-md border border-[#5c6a56]/70 bg-[#171f16] px-1.5 py-0.5 text-[11px] font-semibold text-[#dce4d0]">
                                  TP{idx + 1} {price}
                                </span>
                              ))
                            ) : (
                              <span className="text-[#BFC2C7]">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#BFC2C7]">-</td>
                        <td className="px-2 py-1.5 font-semibold text-[#BFC2C7]">
                          <span className={`rounded-md border px-2 py-1 ${
                            aiResultText === "TRADE"
                              ? "border-[#6f8f6d] bg-[#1f2c1d] text-[#8fc9ab]"
                              : aiResultText === "WATCH" || aiResultText === "WAIT"
                                ? "border-[#7a6840] bg-[#2a2418] text-[#F5C542]"
                                : "border-[#a85a52] bg-[#3a1e1d] text-[#d49f9a]"
                          }`}>
                            {aiResultText}
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  // ── DB-backed idea row (Quant or AI with real tracking) ──
                  const p = raw as ApiTradeIdea & { user_id?: string };
                  const label = resultLabel(p);
                  const entryLevel = `${fmtLevel(Math.min(p.entry_low, p.entry_high))} - ${fmtLevel(Math.max(p.entry_low, p.entry_high))}`;
                  const slWasHit = p.result !== "NONE" && p.hit_level_type === "SL";
                  const tpWasHit = p.result !== "NONE" && p.hit_level_type === "TP";
                  const timeToExit = typeof p.minutes_to_exit === "number" ? p.minutes_to_exit.toFixed(2) : "-";
                  const aiModule = isAiReport && p.user_id?.startsWith("ai-") ? p.user_id.replace("ai-", "").toUpperCase() : null;
                  const aiModuleLabel = aiModule === "CHATGPT" ? "ChatGPT" : aiModule === "QWEN2" ? "Qwen-2" : aiModule === "QWEN" ? "Qwen" : null;
                  const aiModuleClass = aiModule === "CHATGPT" ? "border-[#3d5f8f]/70 bg-[#132033] text-[#b8d3ff]" : aiModule === "QWEN2" ? "border-[#8b4fa8]/70 bg-[#2e1a3c] text-[#e8cdfd]" : "border-[#6b4fa8]/70 bg-[#241a3c] text-[#dbcdfd]";
                  return (
                    <tr key={p.id} className="border-t border-white/10">
                      <td className="px-2 py-1.5 text-[#BFC2C7]">{fmtDate(p.created_at)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <CoinIcon symbol={p.symbol} className="h-4 w-4" />
                          <span className="text-white">{p.symbol}</span>
                          {aiModuleLabel && (
                            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${aiModuleClass}`}>
                              {aiModuleLabel}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="inline-flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${p.direction === "LONG" ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]" : "border-[#704844] bg-[#271a19] text-[#d6b3af]"}`}>
                            {p.direction}
                          </span>
                          <span className="font-semibold text-[#F5C542]">{p.confidence_pct}%</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 font-medium text-[#d8decf]">{entryLevel}</td>
                      <td className={`px-2 py-1.5 ${slWasHit ? "bg-[#271a19]/55" : ""}`}>
                        <div className="flex flex-wrap gap-1">
                          {p.sl_levels.length ? (
                            p.sl_levels.map((price, idx) => {
                              const isHit = slWasHit && p.hit_level_index === idx + 1;
                              return (
                                <span
                                  key={`${p.id}-sl-${idx}`}
                                  className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
                                    isHit
                                      ? "border-[#a85a52] bg-[#3a1e1d] text-[#ffd6d1] shadow-[0_0_0_1px_rgba(255,140,130,0.2)]"
                                      : "border-[#704844]/70 bg-[#1f1515] text-[#e4b4af]"
                                  }`}
                                >
                                  SL{idx + 1} {fmtLevel(price)}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-[#BFC2C7]">-</span>
                          )}
                        </div>
                      </td>
                      <td className={`px-2 py-1.5 ${tpWasHit ? "bg-[#1f251b]/55" : ""}`}>
                        <div className="flex flex-wrap gap-1">
                          {p.tp_levels.length ? (
                            p.tp_levels.map((price, idx) => {
                              const isHit = tpWasHit && p.hit_level_index === idx + 1;
                              return (
                                <span
                                  key={`${p.id}-tp-${idx}`}
                                  className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
                                    isHit
                                      ? "border-[#6f8f6d] bg-[#1f2c1d] text-[#dcf2d8] shadow-[0_0_0_1px_rgba(130,255,150,0.18)]"
                                      : "border-[#5c6a56]/70 bg-[#171f16] text-[#dce4d0]"
                                  }`}
                                >
                                  TP{idx + 1} {fmtLevel(price)}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-[#BFC2C7]">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right text-[#BFC2C7]">{timeToExit}</td>
                      <td className="px-2 py-1.5">
                        <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${resultStyle(p)}`}>
                          {label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        {/* ── Entry Level Missed ── */}
        {entryMissedIdeas.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
            <h2 className="mb-2 text-sm font-semibold text-[#8A8F98]">
              Entry Level Missed{" "}
              <span className="text-[11px] font-normal text-[#6B6F76]">
                ({entryMissedIdeas.length} ideas — price never reached the entry zone)
              </span>
            </h2>
            <div className="max-h-[40vh] overflow-auto rounded-lg border border-white/10">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-[#0F1012] text-[#8A8F98]">
                  <tr>
                    <th className="px-2 py-2 text-left">Time</th>
                    <th className="px-2 py-2 text-left">Symbol</th>
                    <th className="px-2 py-2 text-left">Direction / Confidence</th>
                    <th className="px-2 py-2 text-left">Entry Level</th>
                    <th className="px-2 py-2 text-left">SL Level</th>
                    <th className="px-2 py-2 text-left">TP Level</th>
                    <th className="px-2 py-2 text-left">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {entryMissedIdeas.map((p) => (
                    <tr key={p.id} className="border-t border-white/10">
                      <td className="px-2 py-1.5 text-[#6B6F76]">{fmtDate(p.created_at)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <CoinIcon symbol={p.symbol} className="h-4 w-4 opacity-50" />
                          <span className="text-[#8A8F98]">{p.symbol}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="inline-flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold opacity-60 ${p.direction === "LONG" ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]" : "border-[#704844] bg-[#271a19] text-[#d6b3af]"}`}>
                            {p.direction}
                          </span>
                          <span className="font-semibold text-[#8A8F98]">{p.confidence_pct}%</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 font-medium text-[#8A8F98]">
                        {fmtLevel(Math.min(p.entry_low, p.entry_high))} - {fmtLevel(Math.max(p.entry_low, p.entry_high))}
                      </td>
                      <td className="px-2 py-1.5 text-[#8A8F98]">
                        {p.sl_levels.length ? p.sl_levels.map((s) => fmtLevel(s)).join(", ") : "-"}
                      </td>
                      <td className="px-2 py-1.5 text-[#8A8F98]">
                        {p.tp_levels.length ? p.tp_levels.map((t) => fmtLevel(t)).join(", ") : "-"}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="rounded-md border border-[#555]/60 bg-[#1a1a1a] px-2 py-1 text-[11px] font-semibold text-[#6B6F76]">
                          ENTRY MISSED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
