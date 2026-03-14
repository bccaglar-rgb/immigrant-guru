import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CoinIcon } from "../components/CoinIcon";
import { useAdminConfig } from "../hooks/useAdminConfig";
import { useExchangeTerminalStore } from "../hooks/useExchangeTerminalStore";
import { useTradeIdeasStream } from "../hooks/useTradeIdeasStream";
import { useUserSettings } from "../hooks/useUserSettings";
import { SCORING_MODE_OPTIONS, scoringModeLabel } from "../data/scoringEngine";
import type { TradePlan } from "../types";
import { fetchAiTradeIdeasState, type AiProviderId, type AiScanRowDto } from "../services/adminAiProvidersApi";

type WindowKey = "1H" | "24H" | "7D" | "ALL";
type GroupKey = "HOURLY" | "DAILY";

type ReportIdeaRow = {
  created_at: string;
  resolved_at: string | null;
  status: "PENDING" | "ACTIVE" | "RESOLVED" | "CANCELLED" | "EXPIRED";
  result: "SUCCESS" | "FAIL" | "NONE";
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
const REPORT_MIN_CONSENSUS_QUANT = 70;
const REPORT_MIN_CONSENSUS_AI = 60;
const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const normalizeScorePct = (raw: unknown): number => {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return 0;
  const pct = numeric > 1 ? numeric : numeric * 100;
  return clampPercent(pct);
};
const resolveModeScorePct = (plan: TradePlan, mode: TradePlan["scoringMode"]): number => {
  const modeRaw = plan.modeScores?.[mode ?? "BALANCED"];
  if (typeof modeRaw === "number" && Number.isFinite(modeRaw)) {
    return normalizeScorePct(modeRaw);
  }
  const planMode = (plan.scoringMode ?? "BALANCED") as TradePlan["scoringMode"];
  if (planMode === mode) {
    return normalizeScorePct(plan.confidence ?? 0);
  }
  return 0;
};

const windowMs: Record<WindowKey, number> = {
  "1H": 60 * 60 * 1000,
  "24H": 24 * 60 * 60 * 1000,
  "7D": 7 * 24 * 60 * 60 * 1000,
  ALL: Number.POSITIVE_INFINITY,
};

const hasFinalOutcome = (plan: TradePlan) => plan.result === "SUCCESS" || plan.result === "FAIL";

const resultLabelOf = (plan: TradePlan) => {
  if (plan.result === "SUCCESS") return "SUCCESS";
  if (plan.result === "FAIL") return "FAIL";
  return "PENDING";
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
};

const fmtLevel = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

export default function TradeIdeasReportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAiReport = location.pathname.startsWith("/ai-trade-ideas/report");
  const { config } = useAdminConfig();
  const selectedExchange = useExchangeTerminalStore((state) => state.selectedExchange);
  const { scoringMode, setScoringMode, loading: userSettingsLoading } = useUserSettings();
  const { messages } = useTradeIdeasStream(config.tradeIdeas.minConfidence, selectedExchange);
  const [windowKey, setWindowKey] = useState<WindowKey>("24H");
  const [groupKey, setGroupKey] = useState<GroupKey>("HOURLY");
  const [reportRows, setReportRows] = useState<ReportIdeaRow[]>([]);
  const [aiModelFilter, setAiModelFilter] = useState<AiModelFilter>("ALL");
  const [aiReportRows, setAiReportRows] = useState<AiReportIdea[]>([]);
  const reportMinConsensus = isAiReport ? REPORT_MIN_CONSENSUS_AI : REPORT_MIN_CONSENSUS_QUANT;

  const now = Date.now();
  const quantBase = useMemo(
    () =>
      messages
        .filter((m) => {
          if ((m.scoringMode ?? "BALANCED") !== scoringMode) return false;
          return resolveModeScorePct(m, scoringMode) >= reportMinConsensus;
        })
        .slice(0, 100),
    [messages, reportMinConsensus, scoringMode],
  );
  const aiBase = useMemo(
    () =>
      aiReportRows
        .filter((row) => row.confidencePct >= reportMinConsensus)
        .filter((row) => (aiModelFilter === "ALL" ? true : row.module === aiModelFilter))
        .sort((a, b) => Date.parse(b.timestampUtc) - Date.parse(a.timestampUtc))
        .slice(0, 100),
    [aiModelFilter, aiReportRows, reportMinConsensus],
  );

  useEffect(() => {
    let mounted = true;
    let timer: number | null = null;
    const run = async () => {
      try {
        if (isAiReport) {
          const state = await fetchAiTradeIdeasState();
          if (!mounted || !state?.ok) return;
          const rows = (Object.values(state.scansByModule ?? {}) as AiScanRowDto[][])
            .flat()
            .map((row, index) => normalizeAiReportIdea(row, index));
          setAiReportRows(rows);
          return;
        }
        const qs = new URLSearchParams({
          limit: "1000",
        });
        qs.set("scoring_mode", scoringMode);
        const res = await fetch(`/api/trade-ideas?${qs.toString()}`, {
          headers: { "x-user-id": "demo-user" },
        });
        if (!res.ok) return;
        const body = (await res.json()) as { ok?: boolean; items?: ReportIdeaRow[] };
        if (!mounted || !body?.ok || !Array.isArray(body.items)) return;
        setReportRows(body.items);
      } catch {
        // keep stream fallback
      }
    };
    void run();
    timer = window.setInterval(() => void run(), 10_000);
    return () => {
      mounted = false;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [isAiReport, scoringMode]);

  const reportRowsInWindow = useMemo(() => {
    const threshold = windowMs[windowKey];
    if (!reportRows.length) return reportRows;
    return reportRows.filter((row) => {
      if (!Number.isFinite(threshold)) return true;
      const ts = Date.parse(row.created_at);
      return Number.isFinite(ts) && now - ts <= threshold;
    });
  }, [reportRows, now, windowKey]);
  const quantFiltered = useMemo(() => {
    const threshold = windowMs[windowKey];
    return quantBase.filter((m) => {
      if (!Number.isFinite(threshold)) return true;
      const ts = Date.parse(m.timestampUtc || m.createdAt);
      return Number.isFinite(ts) && now - ts <= threshold;
    });
  }, [quantBase, now, windowKey]);
  const aiFiltered = useMemo(() => {
    const threshold = windowMs[windowKey];
    return aiBase.filter((m) => {
      if (!Number.isFinite(threshold)) return true;
      const ts = Date.parse(m.timestampUtc);
      return Number.isFinite(ts) && now - ts <= threshold;
    });
  }, [aiBase, now, windowKey]);
  const filtered = isAiReport ? aiFiltered : quantFiltered;

  const stats = useMemo(() => {
    const inWindow = filtered.length || reportRowsInWindow.length;
    if (isAiReport) {
      return { inWindow, totalReal: 0, success: 0, failed: 0, successRate: 0 };
    }
    const quantRows = filtered as TradePlan[];
    const resolvedRows = quantRows.filter((p) => p.result === "SUCCESS" || p.result === "FAIL");
    const success = resolvedRows.filter((row) => row.result === "SUCCESS").length;
    const failed = resolvedRows.filter((row) => row.result === "FAIL").length;
    const totalReal = success + failed;
    const successRate = totalReal ? (success / totalReal) * 100 : 0;
    return { inWindow, totalReal, success, failed, successRate };
  }, [filtered, isAiReport, reportRowsInWindow]);

  const grouped = useMemo(() => {
    const map = new Map<string, { total: number; real: number; success: number; failed: number }>();
    if (isAiReport) {
      for (const p of filtered as AiReportIdea[]) {
        const d = new Date(p.timestampUtc);
        if (Number.isNaN(d.getTime())) continue;
        const key =
          groupKey === "HOURLY"
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`
            : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const prev = map.get(key) ?? { total: 0, real: 0, success: 0, failed: 0 };
        prev.total += 1;
        map.set(key, prev);
      }
      return Array.from(map.entries())
        .map(([key, v]) => ({ key, ...v, rate: 0 }))
        .sort((a, b) => (a.key < b.key ? 1 : -1));
    }
    for (const p of filtered as TradePlan[]) {
      const d = new Date(p.timestampUtc || p.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key =
        groupKey === "HOURLY"
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const prev = map.get(key) ?? { total: 0, real: 0, success: 0, failed: 0 };
      prev.total += 1;
      if (hasFinalOutcome(p)) {
        prev.real += 1;
        if (p.result === "SUCCESS") prev.success += 1;
        if (p.result === "FAIL") prev.failed += 1;
      }
      map.set(key, prev);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, rate: v.real ? (v.success / v.real) * 100 : 0 }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [filtered, groupKey, isAiReport]);

  const windowLabel = windowKey === "ALL" ? "All Time" : windowKey;

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-white">{isAiReport ? "AI Trade Ideas Report" : "Quant Trade Ideas"}</h1>
              <p className="text-xs text-[#6B6F76]">Fast reporting from last 100 stored ideas</p>
            </div>
            <div className="flex items-center gap-2">
              {(["1H", "24H", "7D", "ALL"] as WindowKey[]).map((w) => (
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
                  {(["ALL", "CHATGPT", "QWEN"] as AiModelFilter[]).map((item) => {
                    const active = aiModelFilter === item;
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
                        {item === "ALL" ? "All" : item === "CHATGPT" ? "ChatGPT" : "Qwen"}
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
              <select
                value={groupKey}
                onChange={(e) => setGroupKey(e.target.value as GroupKey)}
                className="rounded-lg border border-white/15 bg-[#0F1012] px-2 py-1 text-xs text-[#BFC2C7]"
              >
                <option value="HOURLY">Hourly</option>
                <option value="DAILY">Daily</option>
              </select>
              <button
                type="button"
                onClick={() => navigate(isAiReport ? "/ai-trade-ideas" : "/trade-ideas")}
                className="rounded-lg border border-white/15 bg-[#0F1012] px-2 py-1 text-xs text-[#BFC2C7]"
              >
                Back
              </button>
            </div>
          </div>
          <p className="mt-1 text-center text-[11px] text-[#8A8F98]">
            {isAiReport
              ? "AI report tracks only ideas scoring 60% and above."
              : "All Modes report tracks only ideas scoring 70% and above."}
          </p>

          <p className="mt-2 text-xs text-[#8A8F98]">
            {!isAiReport ? (
              <>
                Mode: <span className="font-semibold text-[#F5C542]">{scoringModeLabel(scoringMode)}</span> ·{" "}
              </>
            ) : null}
            {isAiReport ? (
              <>
                AI Model:{" "}
                <span className="font-semibold text-[#F5C542]">
                  {aiModelFilter === "ALL" ? "All" : aiModelFilter === "CHATGPT" ? "ChatGPT" : "Qwen"}
                </span>{" "}
                ·{" "}
              </>
            ) : null}
            Selected window: <span className="font-semibold text-[#BFC2C7]">{windowLabel}</span> · Total Trade Ideas:{" "}
            <span className="font-semibold text-white">{stats.inWindow}</span> · Resolved Total Trades:{" "}
            <span className="font-semibold text-white">{stats.totalReal}</span>
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Total Trade Ideas</p><p className="text-lg font-semibold text-white">{stats.inWindow}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Resolved Total Trades</p><p className="text-lg font-semibold text-[#BFC2C7]">{stats.totalReal}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Success</p><p className="text-lg font-semibold text-[#8fc9ab]">{stats.success}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Failed</p><p className="text-lg font-semibold text-[#d49f9a]">{stats.failed}</p></div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2"><p className="text-[11px] text-[#6B6F76]">Success % (S/F)</p><p className="text-lg font-semibold text-[#F5C542]">{stats.successRate.toFixed(1)}%</p></div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
          <h2 className="mb-2 text-sm font-semibold text-white">{groupKey} breakdown</h2>
          <div className="max-h-48 overflow-auto rounded-lg border border-white/10">
            <table className="min-w-full text-xs">
              <thead className="bg-[#0F1012] text-[#8A8F98]">
                <tr>
                  <th className="px-2 py-2 text-left">Time Bucket</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-right">Real Trades</th>
                  <th className="px-2 py-2 text-right">Success</th>
                  <th className="px-2 py-2 text-right">Failed</th>
                  <th className="px-2 py-2 text-right">Success % (S/F)</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((g) => (
                  <tr key={g.key} className="border-t border-white/10">
                    <td className="px-2 py-1.5">{g.key}</td>
                    <td className="px-2 py-1.5 text-right">{g.total}</td>
                    <td className="px-2 py-1.5 text-right">{g.real}</td>
                    <td className="px-2 py-1.5 text-right text-[#8fc9ab]">{g.success}</td>
                    <td className="px-2 py-1.5 text-right text-[#d49f9a]">{g.failed}</td>
                    <td className="px-2 py-1.5 text-right text-[#F5C542]">{g.rate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
          <h2 className="mb-2 text-sm font-semibold text-white">Last 100 trade ideas</h2>
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
                {filtered.map((raw) => {
                  if (isAiReport) {
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
                                : "border-[#6b4fa8]/70 bg-[#241a3c] text-[#dbcdfd]"
                            }`}>
                              {p.module === "CHATGPT" ? "ChatGPT" : "Qwen"}
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
                                <span
                                  key={`${p.id}-sl-${idx}`}
                                  className="rounded-md border border-[#704844]/70 bg-[#1f1515] px-1.5 py-0.5 text-[11px] font-semibold text-[#e4b4af]"
                                >
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
                                <span
                                  key={`${p.id}-tp-${idx}`}
                                  className="rounded-md border border-[#5c6a56]/70 bg-[#171f16] px-1.5 py-0.5 text-[11px] font-semibold text-[#dce4d0]"
                                >
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
                  const p = raw as TradePlan;
                  const label = resultLabelOf(p);
                  const resolved = label === "SUCCESS" || label === "FAIL";
                  const entryLevel = `${fmtLevel(Math.min(p.entry.low, p.entry.high))} - ${fmtLevel(Math.max(p.entry.low, p.entry.high))}`;
                  const slLevels = p.stops.map((s) => fmtLevel(s.price));
                  const tpLevels = p.targets.map((t) => fmtLevel(t.price));
                  const hitLevel = p.hitLevelType && p.hitLevelIndex ? `${p.hitLevelType}${p.hitLevelIndex}` : null;
                  const timeToExit = typeof p.minutesToExit === "number" ? p.minutesToExit.toFixed(2) : "-";
                  const resultText = resolved && hitLevel ? `${label} • ${hitLevel} HIT` : label;
                  const slWasHit = resolved && p.hitLevelType === "SL";
                  const tpWasHit = resolved && p.hitLevelType === "TP";
                  return (
                    <tr key={p.id} className="border-t border-white/10">
                      <td className="px-2 py-1.5 text-[#BFC2C7]">{fmtDate(p.timestampUtc || p.createdAt)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <CoinIcon symbol={p.symbol} className="h-4 w-4" />
                          <span className="text-white">{p.symbol}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="inline-flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${p.direction === "LONG" ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]" : "border-[#704844] bg-[#271a19] text-[#d6b3af]"}`}>
                            {p.direction}
                          </span>
                          <span className="font-semibold text-[#F5C542]">{(p.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 font-medium text-[#d8decf]">{entryLevel}</td>
                      <td className={`px-2 py-1.5 ${slWasHit ? "bg-[#271a19]/55" : ""}`}>
                        <div className="flex flex-wrap gap-1">
                          {slLevels.length ? (
                            slLevels.map((price, idx) => {
                              const isHit = slWasHit && p.hitLevelIndex === idx + 1;
                              return (
                                <span
                                  key={`${p.id}-sl-${idx}`}
                                  className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
                                    isHit
                                      ? "border-[#a85a52] bg-[#3a1e1d] text-[#ffd6d1] shadow-[0_0_0_1px_rgba(255,140,130,0.2)]"
                                      : "border-[#704844]/70 bg-[#1f1515] text-[#e4b4af]"
                                  }`}
                                >
                                  SL{idx + 1} {price}
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
                          {tpLevels.length ? (
                            tpLevels.map((price, idx) => {
                              const isHit = tpWasHit && p.hitLevelIndex === idx + 1;
                              return (
                                <span
                                  key={`${p.id}-tp-${idx}`}
                                  className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
                                    isHit
                                      ? "border-[#6f8f6d] bg-[#1f2c1d] text-[#dcf2d8] shadow-[0_0_0_1px_rgba(130,255,150,0.18)]"
                                      : "border-[#5c6a56]/70 bg-[#171f16] text-[#dce4d0]"
                                  }`}
                                >
                                  TP{idx + 1} {price}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-[#BFC2C7]">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right text-[#BFC2C7]">{timeToExit}</td>
                      <td
                        className={`px-2 py-1.5 font-semibold ${
                          label === "SUCCESS"
                            ? "text-[#8fc9ab]"
                            : label === "FAIL"
                              ? "text-[#d49f9a]"
                            : "text-[#BFC2C7]"
                        }`}
                      >
                        <span
                          className={`rounded-md border px-2 py-1 ${
                            label === "SUCCESS"
                              ? "border-[#6f8f6d] bg-[#1f2c1d]"
                              : label === "FAIL"
                                ? "border-[#a85a52] bg-[#3a1e1d]"
                                : "border-white/10 bg-[#15171b]"
                          }`}
                        >
                          {resultText}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
