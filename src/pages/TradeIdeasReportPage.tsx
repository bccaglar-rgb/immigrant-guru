import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CoinIcon } from "../components/CoinIcon";
import { useUserSettings } from "../hooks/useUserSettings";
import { SCORING_MODE_OPTIONS, scoringModeLabel } from "../data/scoringEngine";
import { fetchAiTradeIdeasReportStats, type AiProviderId, type AiReportModuleStats } from "../services/adminAiProvidersApi";

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

// No frontend confidence filter — backend already applies IDEA_MIN_SCORE per mode at creation time.
// All ideas returned by the API are valid and should be displayed.

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

// ── PnL Simulation helper ────────────────────────────────────

interface ReportPnLSimulation {
  margin: number;
  leverage: number;
  positionSize: number;
  pnlUsd: number;
  roiPct: number;
}

function calculateReportPnLSimulation(
  direction: "LONG" | "SHORT",
  entryPrice: number,
  exitPrice: number,
  margin = 10,
  leverage = 10,
): ReportPnLSimulation {
  const positionSize = margin * leverage;
  const priceChange =
    direction === "LONG"
      ? (exitPrice - entryPrice) / entryPrice
      : (entryPrice - exitPrice) / entryPrice;
  const pnlUsd = positionSize * priceChange;
  const roiPct = (pnlUsd / margin) * 100;
  return { margin, leverage, positionSize, pnlUsd, roiPct };
}

function getPnlSimulation(idea: ApiTradeIdea): ReportPnLSimulation | null {
  if (!idea.hit_level_price || idea.result === "NONE") return null;
  const entryPrice = (idea.entry_low + idea.entry_high) / 2;
  if (!entryPrice) return null;
  return calculateReportPnLSimulation(idea.direction, entryPrice, idea.hit_level_price);
}

const PnlCell = ({ idea }: { idea: ApiTradeIdea }) => {
  const sim = getPnlSimulation(idea);
  if (!sim) return <span className="text-[#555]">-</span>;
  const pos = sim.pnlUsd >= 0;
  const sign = pos ? "+" : "";
  const color = pos ? "text-[#8fc9ab]" : "text-[#d49f9a]";
  const tooltip = `Hypothetical PnL based on $${sim.margin} margin and ${sim.leverage}x leverage. If this idea had been executed under those conditions, the estimated result would have been ${sign}$${sim.pnlUsd.toFixed(2)} (${sign}${sim.roiPct.toFixed(1)}% ROI). This is a simulation only and does not include fees or slippage.`;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`font-semibold ${color}`}>{sign}${sim.pnlUsd.toFixed(2)}</span>
      <span className={`text-[10px] opacity-75 ${color}`}>({sign}{sim.roiPct.toFixed(1)}%)</span>
      <span
        title={tooltip}
        className="cursor-help rounded-full border border-white/20 bg-[#1a1c22] px-1 text-[9px] text-[#8A8F98] hover:border-white/40 hover:text-white"
      >
        i
      </span>
    </span>
  );
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
    active?: number; entryMissed?: number;
  }>>({});
  const [aiModelFilter, setAiModelFilter] = useState<AiModelFilter>("ALL");
  const [expandedHour, setExpandedHour] = useState<string | null>(null);
  // No confidence filter — all ideas from API are already qualified
  const now = Date.now();

  // AI report: per-module stats from DB
  const [aiStatsByModule, setAiStatsByModule] = useState<Record<string, AiReportModuleStats>>({});
  const [rrConfig, setRrConfig] = useState<Record<string, { currentRR: number; recommendedRR: number; winRate: number; tradeCount: number }>>({});
  const [optPerf, setOptPerf] = useState<Record<string, { champion: { config: { rr: number; slBufferFactor: number; entryZoneFactor: number; minRRFilter: number }; metrics: { winRate: number; tradeCount: number; expectancy: number }; tradeCount: number } | null; challenger: { config: { rr: number }; metrics: { expectancy: number }; tradeCount: number } | null; lastRun: string } | null>>({});

  // ── RR Config Fetch (once on mount) ──
  useEffect(() => {
    if (isAiReport) return;
    fetch("/api/trade-ideas/rr-config")
      .then((r) => r.ok ? r.json() : null)
      .then((body: any) => { if (body?.ok && body.config) setRrConfig(body.config); })
      .catch(() => {});
    fetch("/api/optimizer/mode-performance")
      .then((r) => r.ok ? r.json() : null)
      .then((body: any) => { if (body?.ok && (body.modes || body.performance)) setOptPerf(body.modes ?? body.performance); })
      .catch(() => {});
  }, [isAiReport]);

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

          if (statsData?.ok) {
            setAiStatsByModule(statsData.statsByModule ?? {});
          }

          // Use real DB ideas for the idea table — no confidence filter, all ideas are valid
          const filtered = allAiIdeas
            .filter((i) => !isEntryMissed(i))
            .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
          const missed = allAiIdeas
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
              active?: number; entryMissed?: number;
            }>;
          };
          if (body?.ok && body.statsByMode) {
            setTotalScanByMode(body.statsByMode as Record<string, any>);
          }
        }

        // Split: real ideas vs entry-missed (all ideas shown, no confidence filter)
        const filtered = allRows
          .filter((i) => !isEntryMissed(i))
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        const missed = allRows
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
  }, [isAiReport, scoringMode, windowKey]);

  // AI model filter applied to DB-backed ideas
  const aiFilteredDbIdeas = useMemo(() => {
    if (!isAiReport) return [];
    if (aiModelFilter === "ALL") return apiIdeas;
    const prefix = `ai-${aiModelFilter.toLowerCase()}`;
    return apiIdeas.filter((i) => (i as any).user_id === prefix);
  }, [isAiReport, aiModelFilter, apiIdeas]);

  // ── Stats: use report-stats endpoint data directly (matches main page) ──
  const stats = useMemo(() => {
    if (isAiReport) {
      // Aggregate across all AI modules (or filter by selected model)
      const moduleIds = aiModelFilter === "ALL" ? ["CHATGPT", "CLAUDE", "QWEN", "QWEN2"] : [aiModelFilter];
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
      return { totalScan, total, totalReal, success, failed, successRate, active, entryMissed };
    }
    const modeStats = totalScanByMode[scoringMode];
    if (!modeStats) return { totalScan: 0, total: 0, totalReal: 0, success: 0, failed: 0, successRate: 0, active: 0, entryMissed: 0 };
    return {
      totalScan: modeStats.totalScan,
      total: modeStats.totalIdeas,
      totalReal: modeStats.resolved,
      success: modeStats.success,
      failed: modeStats.failed,
      successRate: modeStats.successRate,
      active: modeStats.active ?? 0,
      entryMissed: modeStats.entryMissed ?? 0,
    };
  }, [isAiReport, aiModelFilter, aiStatsByModule, totalScanByMode, scoringMode]);

  // ── Hourly Breakdown: ALWAYS last 24 hours (same format for AI and Quant) ──
  const grouped = useMemo(() => {
    const threshold24h = 24 * 60 * 60 * 1000;
    const source = isAiReport ? aiFilteredDbIdeas : apiIdeas;
    const map = new Map<string, { total: number; real: number; success: number; failed: number; items: ApiTradeIdea[] }>();
    for (const idea of source) {
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
      .map(([key, v]) => {
        let totalPnlUsd = 0;
        for (const idea of v.items) {
          const sim = getPnlSimulation(idea);
          if (sim) totalPnlUsd += sim.pnlUsd;
        }
        return { key, ...v, rate: v.real ? (v.success / v.real) * 100 : 0, totalPnlUsd };
      })
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [isAiReport, aiFilteredDbIdeas, apiIdeas, now]);

  // Expanded hour items
  const expandedItems = useMemo(() => {
    if (!expandedHour) return [];
    const bucket = grouped.find((g) => g.key === expandedHour);
    return bucket?.items ?? [];
  }, [expandedHour, grouped]);

  // ── Total PnL across all resolved ideas in current view ──
  const totalPnlUsd = useMemo(() => {
    const source = isAiReport ? aiFilteredDbIdeas : apiIdeas;
    return source.reduce((sum, idea) => {
      const sim = getPnlSimulation(idea);
      return sim ? sum + sim.pnlUsd : sum;
    }, 0);
  }, [isAiReport, aiFilteredDbIdeas, apiIdeas]);

  // ── Last 100: NO time window, always latest 100 (same for AI and Quant) ──
  const last100 = useMemo(() => {
    const source = isAiReport ? aiFilteredDbIdeas : apiIdeas;
    return source.slice(0, 100);
  }, [isAiReport, aiFilteredDbIdeas, apiIdeas]);

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        {/* ── Header + Stats ── */}
        <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-white">{isAiReport ? "AI Trade Ideas Report" : "Quant Trade Ideas"}</h1>
              <p className="text-xs text-[#6B6F76]">All qualifying trade ideas</p>
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
                  {(["ALL", "CHATGPT", "CLAUDE", "QWEN2", "QWEN"] as AiModelFilter[]).map((item) => {
                    const active = aiModelFilter === item;
                    const label = item === "ALL" ? "All" : item === "CHATGPT" ? "ChatGPT" : item === "CLAUDE" ? "Bitrium Prime" : item === "QWEN" ? "Cloud" : "Bitrium Alpha";
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
                  {aiModelFilter === "CHATGPT" ? "ChatGPT" : aiModelFilter === "CLAUDE" ? "Bitrium Prime" : aiModelFilter === "QWEN" ? "Cloud" : "Bitrium Alpha"}
                </span>{" "}
                ·{" "}
              </>
            ) : null}
            Window: <span className="font-semibold text-[#BFC2C7]">{windowKey}</span> · Total Scan:{" "}
            <span className="font-semibold text-[#8A8F98]">{stats.totalScan}</span> · Ideas:{" "}
            <span className="font-semibold text-white">{stats.total}</span>{" "}
            <span className="text-[#6B6F76]">({stats.active ?? 0} active + {stats.totalReal} resolved + {stats.entryMissed ?? entryMissedIdeas.length} missed)</span>
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-8">
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Total Scan</p><p className="text-lg font-semibold text-[#8A8F98]">{stats.totalScan}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Total Ideas</p><p className="text-lg font-semibold text-white">{stats.total}</p></div>
            <div className="rounded-lg border border-[#3b82f6]/30 bg-[#0c1222] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Active</p><p className="text-lg font-semibold text-[#60a5fa]">{stats.active ?? 0}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Entry Missed</p><p className="text-lg font-semibold text-[#8A8F98]">{stats.entryMissed ?? entryMissedIdeas.length}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Resolved</p><p className="text-lg font-semibold text-[#BFC2C7]">{stats.totalReal}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Success %</p><p className="text-lg font-semibold text-[#F5C542]">{stats.successRate.toFixed(1)}%</p></div>
            <div className={`rounded-lg border px-3 py-2 ${totalPnlUsd >= 0 ? "border-[#6f8f6d]/40 bg-[#111a10]" : "border-[#a85a52]/40 bg-[#1a100f]"}`}>
              <p className="text-[11px] text-[#6B6F76]">PnL Sim <span className="text-[9px] opacity-60">($10×10x)</span></p>
              <p className={`text-lg font-semibold ${totalPnlUsd >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>
                {totalPnlUsd >= 0 ? "+" : ""}{totalPnlUsd.toFixed(2)}$
              </p>
            </div>
            <div className="rounded-lg border border-white/5 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Breakdown</p><p className="text-[10px] font-medium text-[#6B6F76] mt-1">{stats.success}W / {stats.failed}L</p></div>
          </div>

          {/* ── Adaptive Optimizer Info (Quant only) ── */}
          {!isAiReport && (() => {
            const modePerf = optPerf[scoringMode];
            const champion = modePerf?.champion;
            const challenger = modePerf?.challenger;
            const hasChampion = !!champion;
            const modeRR = rrConfig[scoringMode];
            const tradeCount = champion?.tradeCount ?? modeRR?.tradeCount ?? 0;
            const hasEnough = tradeCount >= 30;
            const hasPendingChallenger = !!challenger;
            const cfg = champion?.config;

            return (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-xs">
                <span className={`text-[#8A8F98] ${hasPendingChallenger ? "text-[#F5C542]" : ""}`}>
                  Adaptive Optimizer
                </span>
                <span className="text-[#6B6F76]">|</span>
                <span>
                  <span className="text-[#8A8F98]">RR: </span>
                  <span className="font-semibold text-[#F5C542]">
                    {hasChampion ? cfg!.rr.toFixed(2) : (modeRR?.currentRR?.toFixed(2) ?? "–")}
                  </span>
                </span>
                {hasChampion && (
                  <>
                    <span className="text-[#6B6F76]">|</span>
                    <span>
                      <span className="text-[#8A8F98]">SL Factor: </span>
                      <span className="font-semibold text-[#BFC2C7]">{cfg!.slBufferFactor.toFixed(2)}</span>
                    </span>
                    <span className="text-[#6B6F76]">|</span>
                    <span>
                      <span className="text-[#8A8F98]">Entry: </span>
                      <span className="font-semibold text-[#BFC2C7]">±{cfg!.entryZoneFactor.toFixed(2)}</span>
                    </span>
                    <span className="text-[#6B6F76]">|</span>
                    <span>
                      <span className="text-[#8A8F98]">Min RR: </span>
                      <span className="font-semibold text-[#BFC2C7]">{cfg!.minRRFilter.toFixed(1)}</span>
                    </span>
                  </>
                )}
                <span className="text-[#6B6F76]">|</span>
                <span>
                  <span className="text-[#8A8F98]">Based on </span>
                  <span className="font-semibold text-white">{tradeCount}</span>
                  <span className="text-[#8A8F98]"> trades</span>
                </span>
                {hasEnough && champion?.metrics && (
                  <>
                    <span className="text-[#6B6F76]">|</span>
                    <span>
                      <span className="text-[#8A8F98]">Win Rate: </span>
                      <span className="font-semibold text-[#BFC2C7]">{(champion.metrics.winRate * 100).toFixed(1)}%</span>
                    </span>
                    <span className="text-[#6B6F76]">|</span>
                    <span>
                      <span className="text-[#8A8F98]">Expectancy: </span>
                      <span className={`font-semibold ${champion.metrics.expectancy >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>
                        {champion.metrics.expectancy.toFixed(3)}R
                      </span>
                    </span>
                  </>
                )}
                {hasPendingChallenger && (
                  <>
                    <span className="text-[#6B6F76]">|</span>
                    <span className="text-[#F5C542]">
                      ⚡ Challenger pending (RR {cfg?.rr.toFixed(2)}→{challenger!.config.rr.toFixed(2)}, E: {challenger!.metrics.expectancy.toFixed(3)}R, {challenger!.tradeCount} trades)
                    </span>
                  </>
                )}
                {!hasEnough && !hasChampion && (
                  <span className="text-[#555] italic">min 30 trades required</span>
                )}
              </div>
            );
          })()}
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
                  <th className="px-2 py-2 text-right">PnL (sim)</th>
                </tr>
              </thead>
              <tbody>
                {grouped.length === 0 && (
                  <tr><td colSpan={7} className="px-2 py-4 text-center text-[#6B6F76]">No data in last 24 hours</td></tr>
                )}
                {grouped.map((g) => {
                  const isExpanded = expandedHour === g.key;
                  const pnlSign = g.totalPnlUsd >= 0 ? "+" : "";
                  const pnlColor = g.totalPnlUsd >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]";
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
                      <td className={`px-2 py-1.5 text-right font-semibold ${g.real > 0 ? pnlColor : "text-[#555]"}`}>
                        {g.real > 0 ? `${pnlSign}$${g.totalPnlUsd.toFixed(2)}` : "-"}
                      </td>
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
                <table className="min-w-[700px] w-full text-xs">
                  <thead className="sticky top-0 bg-[#0F1012] text-[#8A8F98]">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Time</th>
                      <th className="px-2 py-1.5 text-left">Symbol</th>
                      <th className="px-2 py-1.5 text-left">Dir / Score</th>
                      <th className="px-2 py-1.5 text-left">Entry</th>
                      <th className="px-2 py-1.5 text-left">SL</th>
                      <th className="px-2 py-1.5 text-left">TP</th>
                      <th className="px-2 py-1.5 text-left">Result</th>
                      <th className="px-2 py-1.5 text-right">PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expandedItems.map((raw) => {
                      const p = raw as ApiTradeIdea;
                      const aiModule = isAiReport && (p as any).user_id?.startsWith("ai-") ? (p as any).user_id.replace("ai-", "").toUpperCase() : null;
                      const moduleLabel = aiModule === "CHATGPT" ? "ChatGPT" : aiModule === "CLAUDE" ? "Bitrium Prime" : aiModule === "QWEN2" ? "Bitrium Alpha" : aiModule === "QWEN" ? "Cloud" : null;
                      const moduleClass = aiModule === "CHATGPT" ? "border-[#3d5f8f]/70 bg-[#132033] text-[#b8d3ff]" : aiModule === "CLAUDE" ? "border-[#7a6f3d]/70 bg-[#2a2418] text-[#f5e6a8]" : aiModule === "QWEN2" ? "border-[#c4893d]/70 bg-[#2a1f0f] text-[#ffd699]" : "border-[#6b4fa8]/70 bg-[#241a3c] text-[#dbcdfd]";
                      return (
                        <tr key={p.id} className="border-t border-white/10">
                          <td className="px-2 py-1 text-[#BFC2C7]">{fmtDate(p.created_at)}</td>
                          <td className="px-2 py-1">
                            <div className="flex items-center gap-1.5">
                              <CoinIcon symbol={p.symbol} className="h-3.5 w-3.5" />
                              <span className="text-white">{p.symbol}</span>
                              {moduleLabel && <span className={`rounded-full border px-1 py-0.5 text-[9px] font-semibold ${moduleClass}`}>{moduleLabel}</span>}
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
                            <span className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold ${resultStyle(p)}`}>
                              {resultLabel(p)}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-right">
                            <PnlCell idea={p} />
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
            <table className="min-w-[900px] w-full text-xs">
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
                  <th className="px-2 py-2 text-right">PnL</th>
                </tr>
              </thead>
              <tbody>
                {last100.length === 0 && (
                  <tr><td colSpan={9} className="px-2 py-4 text-center text-[#6B6F76]">No trade ideas yet</td></tr>
                )}
                {last100.map((raw) => {
                  // ── DB-backed idea row (same format for Quant and AI) ──
                  const p = raw as ApiTradeIdea & { user_id?: string };
                  const label = resultLabel(p);
                  const entryLevel = `${fmtLevel(Math.min(p.entry_low, p.entry_high))} - ${fmtLevel(Math.max(p.entry_low, p.entry_high))}`;
                  const slWasHit = p.result !== "NONE" && p.hit_level_type === "SL";
                  const tpWasHit = p.result !== "NONE" && p.hit_level_type === "TP";
                  const timeToExit = (() => {
                    if (typeof p.minutes_to_exit === "number") {
                      const m = Math.round(p.minutes_to_exit);
                      return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
                    }
                    if (p.status === "ACTIVE" && p.activated_at) {
                      const elapsed = Math.floor((now - Date.parse(p.activated_at)) / 60000);
                      return elapsed >= 60 ? `${Math.floor(elapsed / 60)}h ${elapsed % 60}m ⏱` : `${elapsed}m ⏱`;
                    }
                    return "-";
                  })();
                  const aiModule = isAiReport && p.user_id?.startsWith("ai-") ? p.user_id.replace("ai-", "").toUpperCase() : null;
                  const aiModuleLabel = aiModule === "CHATGPT" ? "ChatGPT" : aiModule === "CLAUDE" ? "Bitrium Prime" : aiModule === "QWEN2" ? "Bitrium Alpha" : aiModule === "QWEN" ? "Cloud" : null;
                  const aiModuleClass = aiModule === "CHATGPT" ? "border-[#3d5f8f]/70 bg-[#132033] text-[#b8d3ff]" : aiModule === "CLAUDE" ? "border-[#7a6f3d]/70 bg-[#2a2418] text-[#f5e6a8]" : aiModule === "QWEN2" ? "border-[#c4893d]/70 bg-[#2a1f0f] text-[#ffd699]" : "border-[#6b4fa8]/70 bg-[#241a3c] text-[#dbcdfd]";
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
                      <td className={`px-2 py-1.5 text-right ${p.status === "ACTIVE" && p.activated_at ? "text-[#F5C542]" : "text-[#BFC2C7]"}`}>{timeToExit}</td>
                      <td className="px-2 py-1.5">
                        <span className={`whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-semibold ${resultStyle(p)}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <PnlCell idea={p} />
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
