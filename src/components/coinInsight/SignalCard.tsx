import { useEffect, useState } from "react";
import { CoinIcon } from "../CoinIcon";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ConfidenceDriver {
  label: string;
  score: number;
}

export interface GateInfo {
  label: string;
  status: "PASS" | "BLOCK";
}

export interface DetailSignal {
  category: string;
  label: string;
  value: string;
  badge?: "positive" | "negative" | "neutral";
}

export interface SignalCardData {
  id: string;
  symbol: string;
  price: number;
  compositeScore: number;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  decision: string;
  tradeValidity: string;
  bias: string;
  intent: string;
  confidence: number;
  entryLow: number;
  entryHigh: number;
  tp: number[];
  sl: number[];
  risk: "LOW" | "MEDIUM" | "HIGH";
  urgency: string;
  // Key Drivers (Layer 2)
  drivers: ConfidenceDriver[];
  gates: GateInfo[];
  penalties: string[];
  keyReasons: string[];
  // AI Comment
  aiComment: string;
  // Detail signals (Layer 3 — expandable)
  detailSignals: DetailSignal[];
  // Meta
  regime: string;
  trendStrength: string;
  timestamp: number;
  isNew: boolean;
  isUpdate: boolean;
  prevScore: number | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number) => {
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  const d = Math.max(2, Math.abs(Math.floor(Math.log10(Math.abs(n) || 1))) + 2);
  return n.toFixed(Math.min(d, 8));
};

const elapsed = (ts: number) => {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const signalLabel = (d: string, decision: string) => {
  if (decision === "NO_TRADE" || decision === "NO-TRADE") return "NO-TRADE";
  if (decision === "WATCHLIST" || decision === "WATCH") return "WATCH";
  if (d === "LONG") return "BUY";
  if (d === "SHORT") return "SELL";
  return "WATCH";
};

const colorScheme = (d: string, decision: string) => {
  const noTrade = decision === "NO_TRADE" || decision === "NO-TRADE";
  const watch = decision === "WATCHLIST" || decision === "WATCH";
  if (noTrade) return {
    border: "border-zinc-700/60", glow: "", text: "text-zinc-400", bg: "bg-zinc-800/40",
    dot: "bg-zinc-500", scoreBg: "bg-zinc-800", scoreText: "text-zinc-400",
  };
  if (watch || d === "NEUTRAL") return {
    border: "border-[#F5C542]/30", glow: "shadow-[0_0_20px_rgba(245,197,66,0.08)]",
    text: "text-[#F5C542]", bg: "bg-yellow-950/25", dot: "bg-[#F5C542]",
    scoreBg: "bg-yellow-950/40", scoreText: "text-[#F5C542]",
  };
  if (d === "LONG") return {
    border: "border-emerald-500/35", glow: "shadow-[0_0_20px_rgba(34,197,94,0.10)]",
    text: "text-emerald-400", bg: "bg-emerald-950/30", dot: "bg-emerald-400",
    scoreBg: "bg-emerald-950/40", scoreText: "text-emerald-400",
  };
  // SHORT
  return {
    border: "border-red-500/35", glow: "shadow-[0_0_20px_rgba(239,68,68,0.10)]",
    text: "text-red-400", bg: "bg-red-950/30", dot: "bg-red-400",
    scoreBg: "bg-red-950/40", scoreText: "text-red-400",
  };
};

const riskColor = (r: string) =>
  r === "LOW" ? "text-emerald-400" : r === "MEDIUM" ? "text-yellow-400" : "text-red-400";

const badgeClass = (b?: string) =>
  b === "positive" ? "bg-emerald-900/50 text-emerald-400 border-emerald-700/40"
    : b === "negative" ? "bg-red-900/50 text-red-400 border-red-700/40"
      : "bg-zinc-800/60 text-zinc-400 border-zinc-700/40";

const driverBarColor = (score: number) =>
  score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-[#F5C542]" : score >= 30 ? "bg-orange-500" : "bg-red-500";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SignalCard({ data }: { data: SignalCardData }) {
  const [elapsedText, setElapsedText] = useState(elapsed(data.timestamp));
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setElapsedText(elapsed(data.timestamp)), 1000);
    return () => clearInterval(id);
  }, [data.timestamp]);

  const c = colorScheme(data.direction, data.decision);
  const sig = signalLabel(data.direction, data.decision);
  const scoreDisplay = data.compositeScore.toFixed(1);
  const blockedGates = data.gates.filter((g) => g.status === "BLOCK");

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${c.border} border ${c.glow} bg-[#121316] transition-all duration-500 ${
        mounted ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
      }`}
    >
      {/* ════════════════════════════════════════════════════════════ */}
      {/* LAYER 1 — HERO                                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      <div className="p-4 pb-3">
        {/* Header: badges + coin + score */}
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            {data.isNew && (
              <span className="animate-pulse rounded bg-orange-500/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                NEW
              </span>
            )}
            {data.isUpdate && (
              <span className="rounded bg-blue-500/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Update
              </span>
            )}
            <CoinIcon symbol={data.symbol} className="h-7 w-7" />
            <div>
              <div className="text-sm font-semibold text-white">{data.symbol.replace("USDT", "/USDT")}</div>
              <div className="text-[11px] text-zinc-500">{fmt(data.price)}</div>
            </div>
          </div>

          {/* Score — large, eye-catching */}
          <div className={`flex flex-col items-center rounded-lg ${c.scoreBg} px-3 py-1.5`}>
            <span className={`text-2xl font-bold tabular-nums leading-none ${c.scoreText}`}>{scoreDisplay}%</span>
            {data.isUpdate && data.prevScore !== null && (
              <span className={`mt-0.5 text-[10px] tabular-nums ${data.compositeScore > data.prevScore ? "text-emerald-400" : "text-red-400"}`}>
                {data.compositeScore > data.prevScore ? "\u25B2" : "\u25BC"} {data.prevScore.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* Signal + Bias row */}
        <div className={`mb-3 flex items-center justify-between rounded-lg ${c.bg} px-3 py-2`}>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
            <span className={`text-sm font-bold uppercase tracking-wide ${c.text}`}>{sig}</span>
            <span className="text-[11px] text-zinc-500">{"\u00B7"}</span>
            <span className="text-[11px] text-zinc-400">{data.bias}</span>
          </div>
          {data.intent && (
            <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">{data.intent.replace(/_/g, " ")}</span>
          )}
        </div>

        {/* Entry / TP / SL boxes */}
        {data.decision !== "NO_TRADE" && data.decision !== "NO-TRADE" && data.entryLow > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Entry</div>
              <div className="mt-0.5 text-[12px] font-medium text-zinc-200">
                {fmt(data.entryLow)}
                {data.entryHigh !== data.entryLow && <><br />{fmt(data.entryHigh)}</>}
              </div>
            </div>
            {data.tp.length > 0 && (
              <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/20 px-2.5 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">TP</div>
                <div className="mt-0.5 text-[12px] font-medium text-emerald-400">
                  {data.tp.map((t, i) => <div key={i}>{fmt(t)}</div>)}
                </div>
              </div>
            )}
            {data.sl.length > 0 && (
              <div className="rounded-lg border border-red-900/30 bg-red-950/20 px-2.5 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">SL</div>
                <div className="mt-0.5 text-[12px] font-medium text-red-400">
                  {data.sl.map((s, i) => <div key={i}>{fmt(s)}</div>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Confidence + Risk */}
        <div className="mb-3 flex items-center gap-4 text-[12px]">
          <span className="text-zinc-500">Confidence: <span className="font-semibold text-white">{data.confidence}%</span></span>
          <span className="text-zinc-500">Risk: <span className={`font-semibold ${riskColor(data.risk)}`}>{data.risk}</span></span>
          {data.urgency && data.urgency !== "WAIT" && (
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">{data.urgency}</span>
          )}
        </div>

        {/* AI Comment */}
        {data.aiComment && (
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">AI Comment</div>
            <p className="text-[12px] leading-relaxed text-zinc-300">{data.aiComment}</p>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* LAYER 2 — KEY DRIVERS                                       */}
      {/* ════════════════════════════════════════════════════════════ */}
      <div className="border-t border-white/5 px-4 py-3">
        {/* Driver bars */}
        {data.drivers.length > 0 && (
          <div className="mb-2.5">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Key Drivers</div>
            <div className="space-y-1.5">
              {data.drivers.map((d) => (
                <div key={d.label} className="flex items-center gap-2">
                  <span className="w-20 text-[11px] text-zinc-400">{d.label}</span>
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div className={`absolute inset-y-0 left-0 rounded-full ${driverBarColor(d.score)}`} style={{ width: `${d.score}%` }} />
                  </div>
                  <span className="w-7 text-right text-[11px] tabular-nums text-zinc-400">{d.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blockers */}
        {blockedGates.length > 0 && (
          <div className="mb-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Blockers</div>
            <div className="flex flex-wrap gap-1">
              {blockedGates.map((g) => (
                <span key={g.label} className="rounded border border-red-800/40 bg-red-950/30 px-2 py-0.5 text-[10px] font-medium text-red-400">
                  {g.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Penalties */}
        {data.penalties.length > 0 && (
          <div className="mb-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Penalties</div>
            <div className="flex flex-wrap gap-1">
              {data.penalties.map((p) => (
                <span key={p} className="rounded border border-orange-800/30 bg-orange-950/20 px-2 py-0.5 text-[10px] text-orange-400">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Key Reasons */}
        {data.keyReasons.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Why this view</div>
            <ul className="space-y-0.5">
              {data.keyReasons.slice(0, 5).map((r, i) => (
                <li key={i} className="text-[11px] text-zinc-400">
                  <span className="mr-1 text-zinc-600">{"\u2022"}</span>{r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* LAYER 3 — EXPANDABLE DETAILS                                */}
      {/* ════════════════════════════════════════════════════════════ */}
      {data.detailSignals.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-white/5 py-2 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            {expanded ? "Hide Details" : "View Full Analysis"}
            <svg className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 4.5L6 7.5L9 4.5" />
            </svg>
          </button>

          {expanded && (
            <div className="border-t border-white/5 px-4 py-3">
              {/* Group by category */}
              {Object.entries(
                data.detailSignals.reduce<Record<string, DetailSignal[]>>((acc, sig) => {
                  (acc[sig.category] ??= []).push(sig);
                  return acc;
                }, {}),
              ).map(([cat, signals]) => (
                <div key={cat} className="mb-3 last:mb-0">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{cat}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {signals.map((s) => (
                      <span
                        key={`${s.label}-${s.value}`}
                        className={`rounded border px-2 py-0.5 text-[10px] ${badgeClass(s.badge)}`}
                        title={s.label}
                      >
                        {s.label}: {s.value}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between border-t border-white/5 px-4 py-2 text-[10px] text-zinc-600">
        <span>{elapsedText}</span>
        <span>Data Source: Real-time market data</span>
      </div>
    </div>
  );
}
