import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAuthToken } from "../services/authClient";

/* ── Types ── */

interface UniverseCoin {
  symbol: string;
  price: number;
  change24hPct: number;
  compositeScore: number;
  regime: string;
  trendStrength: number;
  volume24hUsd: number;
  fundingRate: number | null;
  spreadBps: number | null;
  rsi14: number | null;
  atrPct: number | null;
  volumeSpike: boolean;
  oiChange: number | null;
  aggressorFlow: string;
  tier: string;
  selected: boolean;
  dataQuality: { hasKlines: boolean; hasOi: boolean; hasFunding: boolean; hasOrderbook: boolean; score: number } | null;
  universeScore: {
    raw: number;
    penalty: number;
    final: number;
    liquidity: { total: number };
    structure: { total: number; regimeScore: number; trendScore: number; srProximity: number };
    momentum: { total: number; priceChange: number; rsiScore: number; volumeSpikeScore: number };
    positioning: { total: number; fundingScore: number; oiScore: number; flowScore: number };
    execution: { total: number; spreadQuality: number; depthQuality: number };
    falsePenalty: { total: number; fakeBreakout: number; signalConflict: number; trapProbability: number };
    alphaBonus: number;
    alphaPenalty: number;
  } | null;
  alpha: {
    funding: { fundingDirection: string; isExtreme: boolean; fundingCrowdingIndex: number } | null;
    oiShock: { shockType: string; oiShockScore: number } | null;
    volatility: { volatilityRegime: string; compressionScore: number; expansionForecast: number } | null;
    delta: { cvdTrend: string; deltaImbalanceScore: number; buySellPressureRatio: number } | null;
    multiTf: { htfTrendBias: string; multiTfAlignmentScore: number; htfTrendStrength: number } | null;
    liquidation: { cascadeScore: number; dominantRisk: string; longSqueezeProb: number; shortSqueezeProb: number } | null;
    timing: { timingGrade: string; momentumIgnitionScore: number; triggerCandleScore: number } | null;
    liquidity: { liquiditySweepProbability: number; liquidityHeatmapScore: number; stopDensityIndex: number } | null;
    marketMaker: { spoofingProbability: number; marketMakerControlScore: number } | null;
    crossMarket: { riskOnOffIndex: number } | null;
    structure: { breakoutQualityScore: number; trendExhaustionProbability: number; orderflowMomentum: number } | null;
    alphaGrade: string;
    alphaBonus: number;
    alphaPenalty: number;
  } | null;
  signalExplanation: {
    summary: string;
    bullish: string[];
    bearish: string[];
    risks: string[];
  } | null;
}

interface SnapshotResponse {
  ok: boolean;
  round: number;
  refreshedAt: string;
  stats: { totalScanned: number; hardFiltered: number; scored: number; selected: number };
  health: { engine: string; mode: string; klinesAvailable: boolean; klinesSource: string; dataQuality: string };
  activeCoins: UniverseCoin[];
}

type SortKey = "compositeScore" | "price" | "change24hPct" | "volume24hUsd" | "trendStrength";
type SortDir = "asc" | "desc";

/* ── Helpers ── */

const authHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const fmtPrice = (p: number) => {
  if (p === 0) return "$0";
  if (p < 0.001) return `$${p.toFixed(6)}`;
  if (p < 1) return `$${p.toFixed(4)}`;
  if (p < 100) return `$${p.toFixed(2)}`;
  return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const fmtVol = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
};

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

const scoreClr = (s: number) =>
  s >= 75 ? "text-[#2cc497]" : s >= 55 ? "text-[#F5C542]" : s >= 40 ? "text-[#e0a040]" : "text-[#f6465d]";

const scoreBg = (s: number) =>
  s >= 75 ? "bg-[#2cc497]/15" : s >= 55 ? "bg-[#F5C542]/15" : s >= 40 ? "bg-[#e0a040]/15" : "bg-[#f6465d]/15";

const tierBadge = (tier: string) => {
  if (tier === "ALPHA") return { bg: "bg-[#F5C542]/15 text-[#F5C542] border-[#F5C542]/30", letter: "A" };
  if (tier === "BETA") return { bg: "bg-[#6B8AFF]/15 text-[#6B8AFF] border-[#6B8AFF]/30", letter: "B" };
  return { bg: "bg-[#555]/15 text-[#888] border-[#555]/30", letter: "G" };
};

const directionFromCoin = (c: UniverseCoin): { label: string; cls: string } => {
  const s = c.compositeScore;
  const regime = c.regime;
  const htf = c.alpha?.multiTf?.htfTrendBias;
  const flow = c.aggressorFlow;
  const change = c.change24hPct;

  // Strong signals
  if (s >= 65 && (htf === "BULLISH" || flow === "BUY") && change > 0)
    return { label: "LONG", cls: "bg-[#2cc497] text-white" };
  if (s >= 65 && (htf === "BEARISH" || flow === "SELL") && change < 0)
    return { label: "SHORT", cls: "bg-[#f6465d] text-white" };
  // Medium signals
  if (s >= 55 && change > 1)
    return { label: "LONG", cls: "bg-[#2cc497] text-white" };
  if (s >= 55 && change < -1)
    return { label: "SHORT", cls: "bg-[#f6465d] text-white" };
  return { label: "WATCH", cls: "bg-[#333] text-[#999]" };
};

const htfBar = (c: UniverseCoin) => {
  const htfStr = c.alpha?.multiTf?.htfTrendStrength ?? c.trendStrength;
  const score = Math.min(20, Math.round(htfStr / 5));
  return score;
};

const structureLabel = (c: UniverseCoin) => {
  const r = c.regime;
  const ts = c.trendStrength;
  if (r === "TREND") return { tag: "TRE", val: Math.round(ts / 6.67), cls: "text-[#2cc497]" };
  if (r === "BREAKOUT") return { tag: "BRK", val: Math.round(ts / 6.67), cls: "text-[#F5C542]" };
  return { tag: "RAN", val: Math.round(ts / 25), cls: "text-[#888]" };
};

const sessionScore = (c: UniverseCoin) => {
  const now = new Date();
  const hour = now.getUTCHours();
  // Approximate session activity
  if (hour >= 13 && hour <= 21) return 10; // US session
  if (hour >= 7 && hour <= 15) return 8;   // EU session
  return 5; // Asia/off hours
};

const checklistDots = (c: UniverseCoin) => {
  let pass = 0;
  let total = 6;
  if (c.compositeScore >= 50) pass++;
  if (c.trendStrength >= 40) pass++;
  if (c.volume24hUsd > 1_000_000) pass++;
  if (c.dataQuality && c.dataQuality.score >= 60) pass++;
  if (!c.alpha?.timing || c.alpha.timing.timingGrade !== "D") pass++;
  if (!c.universeScore?.falsePenalty || c.universeScore.falsePenalty.total < 10) pass++;
  return { pass, total };
};

/* ── Constants ── */
const POLL_INTERVAL = 20_000;
const MIN_SCORE_OPTIONS = [0, 30, 40, 50, 60, 70];

/* ── Sub-components ── */

const BarMini = ({ value, max = 20, color = "#2cc497" }: { value: number; max?: number; color?: string }) => (
  <div className="flex items-center gap-0.5 h-3">
    <div className="w-10 h-2 rounded-full bg-white/5 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }} />
    </div>
    <span className="text-[9px] text-[#888] w-4">{value}</span>
  </div>
);

const DotBar = ({ value, max, size = "sm" }: { value: number; max: number; size?: "sm" | "xs" }) => {
  const colors = ["#2cc497", "#2cc497", "#7dcd85", "#F5C542", "#e0a040", "#f6465d"];
  const dotSize = size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2";
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`${dotSize} rounded-full`}
          style={{ backgroundColor: i < value ? colors[Math.min(i, colors.length - 1)] : "#333" }}
        />
      ))}
      <span className="ml-1 text-[9px] text-[#888]">{value}/{max}</span>
    </div>
  );
};

/* ── Page ── */

export default function SniperPage() {
  const [data, setData] = useState<SnapshotResponse | null>(null);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [minScore, setMinScore] = useState(30);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("compositeScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedCoin, setExpandedCoin] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const roundRef = useRef(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/coin-universe/snapshot", { headers: authHeaders() });
      const body = await res.json().catch(() => null);
      if (body?.ok) {
        setData(body as SnapshotResponse);
        roundRef.current = body.round ?? 0;
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!live) { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } return; }
    fetchData();
    timerRef.current = window.setInterval(fetchData, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [live, fetchData]);

  const filteredCoins = useMemo(() => {
    if (!data) return [];
    let coins = data.activeCoins
      .filter((c) => c.compositeScore >= minScore)
      .filter((c) => !search || c.symbol.toLowerCase().includes(search.toLowerCase()));
    coins.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
    return coins;
  }, [data, minScore, search, sortKey, sortDir]);

  const stats = useMemo(() => {
    if (!data) return { ready: 0, good: 0, forming: 0 };
    const all = data.activeCoins;
    return {
      ready: all.filter((c) => c.compositeScore >= 75).length,
      good: all.filter((c) => c.compositeScore >= 55 && c.compositeScore < 75).length,
      forming: all.filter((c) => c.compositeScore >= 40 && c.compositeScore < 55).length,
    };
  }, [data]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortHeader = ({ label, field, className = "" }: { label: string; field: SortKey; className?: string }) => (
    <th
      className={`px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#555] cursor-pointer hover:text-[#999] select-none ${className}`}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sortKey === field && <span className="text-[#F5C542]">{sortDir === "desc" ? "\u25BC" : "\u25B2"}</span>}
      </span>
    </th>
  );

  const refreshedAt = data?.refreshedAt ? new Date(data.refreshedAt).toLocaleTimeString() : "--";

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-3 text-[#BFC2C7] md:p-4">
      <div className="mx-auto max-w-[1680px]">
        {/* ── Header ── */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">&#x1F3AF;</span>
              <h1 className="text-xl font-bold text-white">Sniper</h1>
            </div>
            <span className="text-[11px] text-[#555]">
              {data ? `${data.activeCoins.length} coins` : "0 coins"}
              {" · "}Round {roundRef.current}
              {" · "}{refreshedAt}
              {" · "}{live ? "Live" : "Paused"}
            </span>
            {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#f6465d] border-t-transparent" />}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLive(!live)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
                live
                  ? "border-[#2cc497]/30 bg-[#2cc497]/10 text-[#2cc497]"
                  : "border-white/10 bg-[#0F1012] text-[#555]"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-[#2cc497]" : "bg-[#555]"}`} />
              {live ? "New York" : "Paused"}
              {live && <span className="ml-1 text-[9px] opacity-60">{POLL_INTERVAL / 1000}/{POLL_INTERVAL / 1000}</span>}
            </button>
          </div>
        </div>

        {/* ── Status Strip ── */}
        <div className="mb-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-[#2cc497]">Ready (75+): <b>{stats.ready}</b></span>
            <span className="text-[#F5C542]">Good (55-74): <b>{stats.good}</b></span>
            <span className="text-[#e0a040]">Forming (40-54): <b>{stats.forming}</b></span>
          </div>
          <span className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#555] mr-1">Min:</span>
            {MIN_SCORE_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setMinScore(s)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                  minScore === s ? "bg-[#F5C542]/15 text-[#F5C542]" : "text-[#555] hover:text-[#999]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="h-4 w-px bg-white/10" />
          <input
            type="text"
            placeholder="Search coin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-white/10 bg-[#0F1012] px-2.5 py-1 text-[11px] text-white outline-none focus:border-[#F5C542]/40 w-32"
          />
        </div>

        {/* ── Source Info ── */}
        <div className="mb-3 flex items-center gap-2 text-[10px]">
          <span className="text-[#555]">SOURCE</span>
          <span className="rounded bg-[#2cc497]/10 px-1.5 py-0.5 text-[#2cc497] font-medium">Binance</span>
          {data?.health?.klinesSource && data.health.klinesSource !== "none" && (
            <span className="rounded bg-[#6B8AFF]/10 px-1.5 py-0.5 text-[#6B8AFF] font-medium">{data.health.klinesSource}</span>
          )}
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[#888]">
            {data?.health?.dataQuality === "full" ? "Full Data" : data?.health?.dataQuality ?? "minimal"}
          </span>
          <span className="text-[#444]">{POLL_INTERVAL / 1000}s cycle</span>
        </div>
        <div className="mb-4 text-[9px] text-[#444] border-b border-white/[0.04] pb-2">Bitrium Quant Engine</div>

        {/* ── Empty State ── */}
        {filteredCoins.length === 0 && !loading && (
          <div className="flex min-h-[40vh] items-center justify-center text-[#555]">
            {data ? "No coins match filters" : "Waiting for first scan..."}
          </div>
        )}

        {/* ── Table ── */}
        {filteredCoins.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="w-8 px-2 py-2 text-[10px] font-semibold text-[#555]">#</th>
                  <th className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase">Coin</th>
                  <SortHeader label="Score" field="compositeScore" className="text-center" />
                  <th className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase text-center">Direction</th>
                  <th className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase text-center">HTF</th>
                  <th className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase text-center">Liq Sweep</th>
                  <SortHeader label="Volume" field="volume24hUsd" className="text-right" />
                  <th className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase text-center">R:R</th>
                  <th className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase text-center">Structure</th>
                  <th className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase text-center">Session</th>
                  <th className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase text-center">BOS</th>
                  <SortHeader label="Price" field="price" className="text-right" />
                  <SortHeader label="24H" field="change24hPct" className="text-right" />
                  <th className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase text-center">Timing</th>
                  <th className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase text-center">Pullback</th>
                  <th className="px-2 py-2 text-[10px] font-semibold text-[#555] uppercase text-center">Checklist</th>
                </tr>
              </thead>
              <tbody>
                {filteredCoins.map((coin, idx) => {
                  const dir = directionFromCoin(coin);
                  const htf = htfBar(coin);
                  const st = structureLabel(coin);
                  const sess = sessionScore(coin);
                  const cl = checklistDots(coin);
                  const liqSweep = coin.alpha?.liquidity?.liquiditySweepProbability ?? 0;
                  const liqVal = Math.round(liqSweep / 10);
                  const timing = coin.alpha?.timing?.timingGrade ?? "D";
                  const pullback = coin.alpha?.multiTf?.ltfPullbackQuality != null ? Math.round(coin.alpha.multiTf.ltfPullbackQuality) : null;
                  const bos = coin.alpha?.structure?.orderflowMomentum ?? null;
                  const tb = tierBadge(coin.tier);
                  const isExpanded = expandedCoin === coin.symbol;
                  const sym = coin.symbol.replace("USDT", "");

                  // Rough R:R from alpha structure
                  const rr = coin.alpha?.structure ? Math.max(1, Math.round(coin.alpha.structure.breakoutQualityScore / 20)) : null;

                  return (
                    <tr
                      key={coin.symbol}
                      className={`border-b border-white/[0.03] transition cursor-pointer ${
                        isExpanded ? "bg-[#15171c]" : "hover:bg-white/[0.02]"
                      }`}
                      onClick={() => setExpandedCoin(isExpanded ? null : coin.symbol)}
                    >
                      {/* # */}
                      <td className="px-2 py-2.5 text-[11px] text-[#555] font-medium">{idx + 1}</td>

                      {/* Coin */}
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[8px] font-bold ${tb.bg}`}>
                            {tb.letter}
                          </span>
                          <span className="text-[12px] font-bold text-white">{sym}</span>
                          <span className="text-[9px] text-[#555]">/USDT</span>
                          <span className={`ml-0.5 text-[8px] font-medium ${coin.tier === "ALPHA" ? "text-[#F5C542]" : "text-[#555]"}`}>{coin.tier.charAt(0).toLowerCase()}</span>
                          {coin.selected && <span className="h-2 w-2 rounded-full bg-[#2cc497]" title="Selected" />}
                        </div>
                      </td>

                      {/* Score */}
                      <td className="px-2 py-2.5 text-center">
                        <span className={`inline-block rounded px-2 py-0.5 text-[12px] font-bold ${scoreBg(coin.compositeScore)} ${scoreClr(coin.compositeScore)}`}>
                          {Math.round(coin.compositeScore)}
                        </span>
                      </td>

                      {/* Direction */}
                      <td className="px-2 py-2.5 text-center">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${dir.cls}`}>
                          {dir.label === "LONG" ? "\u25B2" : dir.label === "SHORT" ? "\u25BC" : "\u25CF"} {dir.label}
                        </span>
                      </td>

                      {/* HTF */}
                      <td className="px-2 py-2.5 text-center">
                        <BarMini value={htf} max={20} color={htf >= 12 ? "#2cc497" : htf >= 8 ? "#F5C542" : "#f6465d"} />
                      </td>

                      {/* Liq Sweep */}
                      <td className="px-2 py-2.5 text-center">
                        <span className="text-[11px] text-[#999]">{liqVal}</span>
                        <span className={`ml-1 h-1.5 w-1.5 rounded-full inline-block ${liqVal >= 7 ? "bg-[#f6465d]" : liqVal >= 4 ? "bg-[#F5C542]" : "bg-[#2cc497]"}`} />
                      </td>

                      {/* Volume */}
                      <td className="px-2 py-2.5 text-right">
                        <span className="text-[11px] text-[#999]">{fmtVol(coin.volume24hUsd)}</span>
                        {coin.volumeSpike && <span className="ml-1 text-[8px] text-[#F5C542]">&#x26A1;</span>}
                      </td>

                      {/* R:R */}
                      <td className="px-2 py-2.5 text-center">
                        <span className="text-[11px] text-[#999]">{rr ?? "-"}</span>
                      </td>

                      {/* Structure */}
                      <td className="px-2 py-2.5 text-center">
                        <span className={`text-[10px] font-semibold ${st.cls}`}>{st.tag}</span>
                        <span className="ml-1 text-[10px] text-[#888]">{st.val}</span>
                      </td>

                      {/* Session */}
                      <td className="px-2 py-2.5 text-center text-[11px] text-[#888]">{sess}</td>

                      {/* BOS */}
                      <td className="px-2 py-2.5 text-center">
                        {bos !== null ? (
                          <span className={`h-2.5 w-2.5 rounded-full inline-block ${bos > 20 ? "bg-[#2cc497]" : bos < -20 ? "bg-[#f6465d]" : "bg-[#555]"}`} />
                        ) : <span className="text-[10px] text-[#333]">-</span>}
                      </td>

                      {/* Price */}
                      <td className="px-2 py-2.5 text-right">
                        <span className="text-[11px] text-[#ddd]">{fmtPrice(coin.price)}</span>
                      </td>

                      {/* 24H */}
                      <td className="px-2 py-2.5 text-right">
                        <span className={`text-[11px] font-medium ${coin.change24hPct >= 0 ? "text-[#2cc497]" : "text-[#f6465d]"}`}>
                          {fmtPct(coin.change24hPct)}
                        </span>
                      </td>

                      {/* Timing */}
                      <td className="px-2 py-2.5 text-center">
                        <span className={`text-[11px] font-bold ${
                          timing === "A" ? "text-[#2cc497]" : timing === "B" ? "text-[#F5C542]" : timing === "C" ? "text-[#e0a040]" : "text-[#f6465d]"
                        }`}>
                          {timing}
                        </span>
                      </td>

                      {/* Pullback */}
                      <td className="px-2 py-2.5 text-center">
                        <span className="text-[11px] text-[#888]">{pullback ?? "-"}</span>
                      </td>

                      {/* Checklist */}
                      <td className="px-2 py-2.5 text-center">
                        <DotBar value={cl.pass} max={cl.total} size="xs" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Expanded Detail Panel ── */}
        {expandedCoin && (() => {
          const coin = filteredCoins.find((c) => c.symbol === expandedCoin);
          if (!coin) return null;
          const us = coin.universeScore;
          const a = coin.alpha;

          const layers = [
            { name: "Structure", score: us?.structure?.total ?? 0, max: 25 },
            { name: "Liquidity", score: us?.liquidity?.total ?? 0, max: 25 },
            { name: "Positioning", score: us?.positioning?.total ?? 0, max: 15 },
            { name: "Execution", score: us?.execution?.total ?? 0, max: 15 },
            { name: "Momentum", score: us?.momentum?.total ?? 0, max: 20 },
          ];

          const categoryCards = [
            {
              title: "Market Regime", score: us?.structure?.total ?? 0, color: "#2cc497",
              rows: [
                ["Market Regime", coin.regime],
                ["Trend Strength", `${Math.round(coin.trendStrength)}`],
                ["HTF Bias", a?.multiTf?.htfTrendBias ?? "N/A"],
                ["MTF Alignment", a?.multiTf?.multiTfAlignmentScore != null ? `${Math.round(a.multiTf.multiTfAlignmentScore)}` : "N/A"],
                ["Exhaustion Prob", a?.structure?.trendExhaustionProbability != null ? `${Math.round(a.structure.trendExhaustionProbability)}%` : "N/A"],
              ],
            },
            {
              title: "Liquidity", score: us?.liquidity?.total ?? 0, color: "#6B8AFF",
              rows: [
                ["Sweep Probability", a?.liquidity?.liquiditySweepProbability != null ? `${Math.round(a.liquidity.liquiditySweepProbability)}%` : "N/A"],
                ["Heatmap Score", a?.liquidity?.liquidityHeatmapScore != null ? `${Math.round(a.liquidity.liquidityHeatmapScore)}` : "N/A"],
                ["Stop Density", a?.liquidity?.stopDensityIndex != null ? `${Math.round(a.liquidity.stopDensityIndex)}` : "N/A"],
                ["Depth Quality", us?.execution?.depthQuality != null ? `${Math.round(us.execution.depthQuality)}` : "N/A"],
                ["Aggressor Flow", coin.aggressorFlow],
              ],
            },
            {
              title: "Positioning", score: us?.positioning?.total ?? 0, color: "#e0a040",
              rows: [
                ["Funding Bias", a?.funding?.fundingDirection ?? "N/A"],
                ["OI Shock Type", a?.oiShock?.shockType ?? "N/A"],
                ["CVD Trend", a?.delta?.cvdTrend ?? "N/A"],
                ["Cascade Risk", a?.liquidation?.dominantRisk ?? "N/A"],
                ["Buy/Sell Pressure", a?.delta?.buySellPressureRatio != null ? `${a.delta.buySellPressureRatio.toFixed(2)}` : "N/A"],
              ],
            },
            {
              title: "Execution Quality", score: us?.execution?.total ?? 0, color: "#f6465d",
              rows: [
                ["Spread", coin.spreadBps != null ? `${coin.spreadBps.toFixed(1)} bps` : "N/A"],
                ["Timing Grade", a?.timing?.timingGrade ?? "N/A"],
                ["Trigger Candle", a?.timing?.triggerCandleScore != null ? `${Math.round(a.timing.triggerCandleScore)}` : "N/A"],
                ["Spoof Probability", a?.marketMaker?.spoofingProbability != null ? `${Math.round(a.marketMaker.spoofingProbability)}%` : "N/A"],
                ["MM Control", a?.marketMaker?.marketMakerControlScore != null ? `${Math.round(a.marketMaker.marketMakerControlScore)}` : "N/A"],
              ],
            },
            {
              title: "Volatility State", score: us?.momentum?.total ?? 0, color: "#9B7DFF",
              rows: [
                ["Vol Regime", a?.volatility?.volatilityRegime ?? "N/A"],
                ["Compression", a?.volatility?.compressionScore != null ? `${Math.round(a.volatility.compressionScore)}` : "N/A"],
                ["Expansion Prob", a?.volatility?.expansionForecast != null ? `${Math.round(a.volatility.expansionForecast)}%` : "N/A"],
                ["ATR%", coin.atrPct != null ? `${coin.atrPct.toFixed(2)}%` : "N/A"],
                ["RSI", coin.rsi14 != null ? `${Math.round(coin.rsi14)}` : "N/A"],
              ],
            },
          ];

          const valBadgeCls = (v: string) => {
            const lower = v.toLowerCase();
            if (["trend", "bullish", "rising", "buy", "pass", "low", "a", "spike"].some((k) => lower.includes(k))) return "bg-[#2cc497]/15 text-[#2cc497]";
            if (["bearish", "sell", "falling", "high", "wide", "panic", "d", "poor", "crowded_short", "spoof", "risk"].some((k) => lower.includes(k))) return "bg-[#f6465d]/15 text-[#f6465d]";
            if (["neutral", "normal", "flat", "range", "balanced", "ok", "c", "compressed", "mean_reverting"].some((k) => lower.includes(k))) return "bg-white/5 text-[#999]";
            return "bg-[#F5C542]/10 text-[#F5C542]";
          };

          return (
            <div className="mt-1 mb-4 rounded-xl border border-white/[0.06] bg-[#0e0f12] p-4">
              {/* Layer Scores Bar */}
              <div className="mb-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-2">Layer Scores</h3>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {layers.map((l) => {
                    const pct = Math.round((l.score / l.max) * 100);
                    return (
                      <div key={l.name} className="flex items-center gap-2 min-w-[180px]">
                        <span className="text-[10px] text-[#888] w-16">{l.name}</span>
                        <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden w-20">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: pct >= 70 ? "#2cc497" : pct >= 50 ? "#F5C542" : pct >= 30 ? "#e0a040" : "#f6465d",
                            }}
                          />
                        </div>
                        <span className={`text-[11px] font-bold w-8 text-right ${scoreClr(pct)}`}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Category Cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {categoryCards.map((card) => (
                  <div key={card.title} className="rounded-lg border border-white/[0.06] bg-[#121316] overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]" style={{ borderLeftColor: card.color, borderLeftWidth: 3 }}>
                      <span className="text-[11px] font-bold text-white">{card.title}</span>
                      <span className={`text-[11px] font-bold ${scoreClr(card.score * 4)}`}>{Math.round(card.score * 4)}%</span>
                    </div>
                    <div className="px-3 py-2 space-y-1.5">
                      {card.rows.map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-[10px] text-[#666]">{label}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${valBadgeCls(value)}`}>
                            {value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Risk & Context Row */}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/[0.06] bg-[#121316] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-[#F5C542]">&#x26A1; Multiplier</span>
                  </div>
                  <div className="space-y-1.5 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-[#666]">Alpha Grade</span>
                      <span className={`rounded px-1.5 py-0.5 font-bold ${valBadgeCls(a?.alphaGrade ?? "N/A")}`}>{a?.alphaGrade ?? "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666]">Alpha Bonus</span>
                      <span className="text-[#2cc497] font-medium">+{a?.alphaBonus ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666]">Alpha Penalty</span>
                      <span className="text-[#f6465d] font-medium">-{a?.alphaPenalty ?? 0}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-[#121316] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-[#e0a040]">&#x26A0; Risk Filters</span>
                  </div>
                  <div className="space-y-1.5 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-[#666]">False Penalty</span>
                      <span className={`rounded px-1.5 py-0.5 font-bold ${(us?.falsePenalty?.total ?? 0) < 10 ? "bg-[#2cc497]/15 text-[#2cc497]" : "bg-[#f6465d]/15 text-[#f6465d]"}`}>
                        {us?.falsePenalty?.total ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666]">Signal Conflict</span>
                      <span className="text-[#999] font-medium">{us?.falsePenalty?.signalConflict ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666]">Trap Probability</span>
                      <span className="text-[#999] font-medium">{us?.falsePenalty?.trapProbability ?? 0}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-[#121316] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-[#6B8AFF]">&#x1F30D; Context</span>
                  </div>
                  <div className="space-y-1.5 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-[#666]">Risk On/Off</span>
                      <span className="text-[#999] font-medium">{a?.crossMarket?.riskOnOffIndex != null ? Math.round(a.crossMarket.riskOnOffIndex) : "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666]">Volume Spike</span>
                      <span className={`rounded px-1.5 py-0.5 font-bold ${coin.volumeSpike ? "bg-[#F5C542]/15 text-[#F5C542]" : "bg-white/5 text-[#555]"}`}>
                        {coin.volumeSpike ? "ON" : "OFF"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666]">Data Quality</span>
                      <span className="text-[#999] font-medium">{coin.dataQuality?.score ?? 0}/100</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </main>
  );
}
