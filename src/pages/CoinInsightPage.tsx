import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SignalCard, { type SignalCardData, type ConfidenceDriver, type GateInfo, type DetailSignal } from "../components/coinInsight/SignalCard";
import { getAuthToken } from "../services/authClient";

/* ------------------------------------------------------------------ */
/*  API helpers                                                        */
/* ------------------------------------------------------------------ */

const authHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

interface UniverseCoin {
  symbol: string;
  price: number;
  compositeScore: number;
  regime: string;
  trendStrength: number;
  volumeSpike: boolean;
  fundingRate: number | null;
  rsi14: number | null;
  aggressorFlow: string;
  change24hPct: number;
  oiChange: number | null;
  atrPct: number | null;
  spreadBps: number | null;
  universeScore: {
    final: number;
    liquidity: { total: number };
    structure: { total: number };
    momentum: { total: number };
    positioning: { total: number };
    execution: { total: number };
  };
  alpha?: {
    alphaGrade: string;
    funding?: { fundingDirection: string } | null;
    volatility?: { volatilityRegime: string; compressionScore: number } | null;
    delta?: { cvdTrend: string } | null;
    multiTf?: { htfTrendBias: string; multiTfAlignmentScore: number } | null;
  } | null;
  signalExplanation?: {
    summary: string;
    gradeReason: string;
    bullish: string[];
    bearish: string[];
    risks: string[];
    dataNote: string | null;
    regimeContext: string;
  } | null;
  dataQuality?: { score: number; hasKlines: boolean; hasOi: boolean; hasFunding: boolean; hasOrderbook: boolean };
  tier: string;
  status: string;
}

interface ScanResult {
  symbol: string;
  mode: string;
  scorePct: number;
  decision: string;
  direction: string;
  tradeValidity: string;
  entryWindow: string;
  slippageRisk: string;
  setup: string;
  scannedAt: number;
  entryLow: number;
  entryHigh: number;
  slLevels: number[];
  tpLevels: number[];
  horizon: string;
  timeframe: string;
}

/* ------------------------------------------------------------------ */
/*  Merge universe coin + scan result → SignalCardData                 */
/* ------------------------------------------------------------------ */

const buildCardData = (
  coin: UniverseCoin,
  scan: ScanResult | null,
  prevMap: Map<string, number>,
): SignalCardData => {
  const score = scan?.scorePct ?? coin.compositeScore;
  const direction: "LONG" | "SHORT" | "NEUTRAL" =
    scan?.direction === "LONG" ? "LONG"
      : scan?.direction === "SHORT" ? "SHORT"
        : coin.aggressorFlow === "BUY" ? "LONG"
          : coin.aggressorFlow === "SELL" ? "SHORT"
            : "NEUTRAL";

  const decision = scan?.decision ?? "NO_TRADE";
  const tradeValidity = scan?.tradeValidity ?? "NO-TRADE";
  const bias = direction === "LONG" ? "LONG" : direction === "SHORT" ? "SHORT" : "NEUTRAL";

  // Determine risk
  const risk: "LOW" | "MEDIUM" | "HIGH" =
    (scan?.slippageRisk === "HIGH" || coin.spreadBps !== null && coin.spreadBps > 20) ? "HIGH"
      : (scan?.slippageRisk === "LOW") ? "LOW"
        : "MEDIUM";

  // Build drivers from universe score
  const us = coin.universeScore;
  const drivers: ConfidenceDriver[] = [
    { label: "Structure", score: Math.round(us.structure.total) },
    { label: "Liquidity", score: Math.round(us.liquidity.total) },
    { label: "Positioning", score: Math.round(us.positioning.total) },
    { label: "Execution", score: Math.round(us.execution.total) },
    { label: "Momentum", score: Math.round(us.momentum.total) },
  ].sort((a, b) => b.score - a.score);

  // Build gates
  const gates: GateInfo[] = [];
  if (scan) {
    if (scan.entryWindow === "CLOSED") gates.push({ label: "Entry Closed", status: "BLOCK" });
    if (scan.slippageRisk === "HIGH") gates.push({ label: "High Slippage", status: "BLOCK" });
    if (scan.tradeValidity === "NO-TRADE") gates.push({ label: "Trade Validity", status: "BLOCK" });
    if (gates.length === 0 && scan.decision !== "NO_TRADE") gates.push({ label: "All Clear", status: "PASS" });
  }

  // Penalties
  const penalties: string[] = [];
  if (scan?.slippageRisk === "HIGH") penalties.push("Slippage High");
  if (scan?.entryWindow === "CLOSED") penalties.push("Entry Closed");
  if (coin.volumeSpike) penalties.push("Volume Spike Active");

  // Key reasons
  const keyReasons: string[] = [];
  if (coin.regime === "TREND") keyReasons.push(`Trend regime (strength ${coin.trendStrength})`);
  if (coin.regime === "RANGE") keyReasons.push("Range-bound market");
  if (coin.regime === "BREAKOUT") keyReasons.push("Breakout detected");
  if (coin.rsi14 !== null) {
    if (coin.rsi14 > 70) keyReasons.push(`RSI overbought (${coin.rsi14.toFixed(0)})`);
    else if (coin.rsi14 < 30) keyReasons.push(`RSI oversold (${coin.rsi14.toFixed(0)})`);
  }
  if (coin.aggressorFlow === "BUY") keyReasons.push("Buy-side aggressor flow");
  if (coin.aggressorFlow === "SELL") keyReasons.push("Sell-side aggressor flow");
  if (coin.fundingRate !== null && Math.abs(coin.fundingRate) > 0.05)
    keyReasons.push(`Extreme funding (${coin.fundingRate.toFixed(3)}%)`);
  if (coin.oiChange !== null && Math.abs(coin.oiChange) > 3)
    keyReasons.push(`OI change ${coin.oiChange > 0 ? "+" : ""}${coin.oiChange.toFixed(1)}%`);
  if (scan?.setup) keyReasons.push(scan.setup);

  // AI Comment — use signal explanation if available, fallback to generated
  const explanation = coin.signalExplanation;
  const aiComment = explanation
    ? [
        explanation.summary,
        explanation.gradeReason,
        ...(explanation.bullish.length > 0 ? [`Bullish: ${explanation.bullish.slice(0, 2).join("; ")}`] : []),
        ...(explanation.bearish.length > 0 ? [`Bearish: ${explanation.bearish.slice(0, 2).join("; ")}`] : []),
        ...(explanation.risks.length > 0 ? [`Risk: ${explanation.risks[0]}`] : []),
        ...(explanation.dataNote ? [`⚠ ${explanation.dataNote}`] : []),
      ].join("\n")
    : generateAiComment(coin, scan, direction, decision, score);

  // Enrich key reasons with explanation bullish/bearish if available
  if (explanation) {
    for (const b of explanation.bullish.slice(0, 2)) {
      if (!keyReasons.some(r => r.includes(b.slice(0, 20)))) keyReasons.push(b);
    }
    for (const b of explanation.bearish.slice(0, 1)) {
      if (!keyReasons.some(r => r.includes(b.slice(0, 20)))) keyReasons.push(b);
    }
  }

  // Intent
  const intent = coin.regime === "TREND"
    ? "TREND_CONTINUATION"
    : coin.regime === "RANGE"
      ? "RANGE_ROTATION"
      : coin.regime === "BREAKOUT"
        ? "BREAKOUT_TRADE"
        : "WAIT";

  const urgency =
    decision === "NO_TRADE" || decision === "NO-TRADE" ? "WAIT"
      : scan?.entryWindow === "OPEN" && scan.slippageRisk === "LOW" ? "ACT"
        : scan?.entryWindow === "NARROW" ? "PREPARE"
          : "WATCH";

  // Detail signals for expanded view
  const detailSignals: DetailSignal[] = buildDetailSignals(coin, scan);

  // Update tracking
  const prevScore = prevMap.get(coin.symbol) ?? null;
  const isUpdate = prevScore !== null && prevScore !== score;

  return {
    id: `${coin.symbol}-${scan?.mode ?? "base"}-${Date.now()}`,
    symbol: coin.symbol,
    price: coin.price,
    compositeScore: score,
    direction,
    decision,
    tradeValidity,
    bias,
    intent,
    confidence: Math.round(score),
    entryLow: scan?.entryLow ?? 0,
    entryHigh: scan?.entryHigh ?? 0,
    tp: scan?.tpLevels ?? [],
    sl: scan?.slLevels ?? [],
    risk,
    urgency,
    drivers,
    gates,
    penalties,
    keyReasons,
    aiComment,
    detailSignals,
    regime: coin.regime,
    trendStrength: String(coin.trendStrength),
    timestamp: scan?.scannedAt ?? Date.now(),
    isNew: true,
    isUpdate,
    prevScore,
  };
};

const generateAiComment = (
  coin: UniverseCoin,
  scan: ScanResult | null,
  direction: string,
  decision: string,
  score: number,
): string => {
  const parts: string[] = [];
  const sym = coin.symbol.replace("USDT", "");

  if (decision === "NO_TRADE" || decision === "NO-TRADE") {
    parts.push(`${sym} shows a ${direction.toLowerCase()} bias`);
    if (scan?.entryWindow === "CLOSED") parts.push("but entry window is currently closed");
    else if (scan?.slippageRisk === "HIGH") parts.push("but execution conditions are poor");
    else parts.push("but overall setup quality is insufficient");
    parts.push(". Wait for improved conditions before considering a position.");
  } else if (score >= 70) {
    parts.push(`Strong ${direction.toLowerCase()} setup on ${sym}.`);
    if (coin.regime === "TREND") parts.push(` Trend continuation pattern with ${coin.trendStrength > 70 ? "strong" : "moderate"} momentum.`);
    if (coin.volumeSpike) parts.push(" Volume confirms the move.");
    parts.push(" Execution conditions are favorable.");
  } else {
    parts.push(`${sym} presents a ${direction.toLowerCase()} opportunity`);
    if (score >= 50) parts.push(" with moderate conviction.");
    else parts.push(" but conviction is low.");
    if (scan?.entryWindow === "NARROW") parts.push(" Entry window is narrowing — act quickly if taking the trade.");
  }

  return parts.join("");
};

const buildDetailSignals = (coin: UniverseCoin, scan: ScanResult | null): DetailSignal[] => {
  const signals: DetailSignal[] = [];

  // Structure
  signals.push({ category: "Structure", label: "Regime", value: coin.regime, badge: coin.regime === "TREND" ? "positive" : "neutral" });
  signals.push({ category: "Structure", label: "Trend", value: String(coin.trendStrength), badge: coin.trendStrength > 60 ? "positive" : coin.trendStrength < 30 ? "negative" : "neutral" });
  if (coin.alpha?.multiTf?.htfTrendBias) signals.push({ category: "Structure", label: "HTF Bias", value: coin.alpha.multiTf.htfTrendBias, badge: "neutral" });
  if (coin.alpha?.multiTf?.multiTfAlignmentScore !== undefined) signals.push({ category: "Structure", label: "MTF Alignment", value: String(Math.round(coin.alpha.multiTf.multiTfAlignmentScore)), badge: coin.alpha.multiTf.multiTfAlignmentScore > 60 ? "positive" : "neutral" });

  // Execution
  if (scan) {
    signals.push({ category: "Execution", label: "Entry Window", value: scan.entryWindow, badge: scan.entryWindow === "OPEN" ? "positive" : scan.entryWindow === "CLOSED" ? "negative" : "neutral" });
    signals.push({ category: "Execution", label: "Slippage", value: scan.slippageRisk, badge: scan.slippageRisk === "LOW" ? "positive" : scan.slippageRisk === "HIGH" ? "negative" : "neutral" });
    signals.push({ category: "Execution", label: "Trade Validity", value: scan.tradeValidity, badge: scan.tradeValidity === "VALID" ? "positive" : "negative" });
  }
  if (coin.spreadBps !== null) signals.push({ category: "Execution", label: "Spread", value: `${coin.spreadBps.toFixed(1)} bps`, badge: coin.spreadBps < 5 ? "positive" : coin.spreadBps > 15 ? "negative" : "neutral" });

  // Positioning
  if (coin.fundingRate !== null) signals.push({ category: "Positioning", label: "Funding", value: `${coin.fundingRate.toFixed(4)}%`, badge: Math.abs(coin.fundingRate) > 0.05 ? "negative" : "neutral" });
  if (coin.oiChange !== null) signals.push({ category: "Positioning", label: "OI Change", value: `${coin.oiChange > 0 ? "+" : ""}${coin.oiChange.toFixed(1)}%`, badge: Math.abs(coin.oiChange) > 5 ? "positive" : "neutral" });
  signals.push({ category: "Positioning", label: "Flow", value: coin.aggressorFlow, badge: coin.aggressorFlow !== "NEUTRAL" ? "positive" : "neutral" });
  if (coin.alpha?.delta?.cvdTrend) signals.push({ category: "Positioning", label: "CVD Trend", value: coin.alpha.delta.cvdTrend, badge: "neutral" });

  // Volatility
  if (coin.rsi14 !== null) signals.push({ category: "Volatility", label: "RSI", value: coin.rsi14.toFixed(0), badge: coin.rsi14 > 70 || coin.rsi14 < 30 ? "negative" : "neutral" });
  if (coin.atrPct !== null) signals.push({ category: "Volatility", label: "ATR%", value: `${coin.atrPct.toFixed(2)}%`, badge: "neutral" });
  signals.push({ category: "Volatility", label: "Volume Spike", value: coin.volumeSpike ? "ON" : "OFF", badge: coin.volumeSpike ? "positive" : "neutral" });
  if (coin.alpha?.volatility?.volatilityRegime) signals.push({ category: "Volatility", label: "Vol Regime", value: coin.alpha.volatility.volatilityRegime, badge: "neutral" });
  if (coin.alpha?.volatility?.compressionScore !== undefined) signals.push({ category: "Volatility", label: "Compression", value: String(Math.round(coin.alpha.volatility.compressionScore)), badge: "neutral" });

  // Risk
  if (coin.alpha?.alphaGrade) signals.push({ category: "Risk", label: "Alpha Grade", value: coin.alpha.alphaGrade, badge: coin.alpha.alphaGrade === "S" || coin.alpha.alphaGrade === "A" ? "positive" : coin.alpha.alphaGrade === "D" ? "negative" : "neutral" });
  signals.push({ category: "Risk", label: "24h Change", value: `${coin.change24hPct >= 0 ? "+" : ""}${coin.change24hPct.toFixed(2)}%`, badge: Math.abs(coin.change24hPct) > 5 ? "negative" : "neutral" });
  signals.push({ category: "Risk", label: "Tier", value: coin.tier, badge: coin.tier === "ALPHA" ? "positive" : coin.tier === "GAMMA" ? "negative" : "neutral" });

  // Data Quality
  if (coin.dataQuality) {
    const dq = coin.dataQuality;
    signals.push({ category: "Data Quality", label: "Score", value: `${dq.score}/100`, badge: dq.score >= 80 ? "positive" : dq.score >= 50 ? "neutral" : "negative" });
    signals.push({ category: "Data Quality", label: "Klines", value: dq.hasKlines ? "YES" : "NO", badge: dq.hasKlines ? "positive" : "negative" });
    signals.push({ category: "Data Quality", label: "Funding", value: dq.hasFunding ? "YES" : "NO", badge: dq.hasFunding ? "positive" : "negative" });
    signals.push({ category: "Data Quality", label: "Orderbook", value: dq.hasOrderbook ? "YES" : "NO", badge: dq.hasOrderbook ? "positive" : "negative" });
  }

  return signals;
};

/* ------------------------------------------------------------------ */
/*  Filter types                                                       */
/* ------------------------------------------------------------------ */

type DirectionFilter = "ALL" | "BUY" | "SELL";
type MinScoreFilter = 0 | 50 | 60 | 70 | 80;

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

const POLL_INTERVAL = 30_000;
const MAX_CARDS = 100;
const NEW_THRESHOLD = 30_000;

export default function CoinInsightPage() {
  const [cards, setCards] = useState<SignalCardData[]>([]);
  const [live, setLive] = useState(true);
  const [dirFilter, setDirFilter] = useState<DirectionFilter>("ALL");
  const [minScore, setMinScore] = useState<MinScoreFilter>(0);
  const [loading, setLoading] = useState(false);
  const [coinCount, setCoinCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const prevScoreMapRef = useRef(new Map<string, number>());
  const timerRef = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [universeRes, scanRes] = await Promise.all([
        fetch("/api/coin-universe/snapshot", { headers: authHeaders() }),
        fetch("/api/trade-ideas/system-scan", { headers: authHeaders() }),
      ]);

      const universeBody = await universeRes.json().catch(() => null);
      const scanBody = await scanRes.json().catch(() => null);

      const coins: UniverseCoin[] = universeBody?.activeCoins ?? universeBody?.items ?? [];
      const scans: ScanResult[] = scanBody?.results ?? [];
      const scanMap = new Map<string, ScanResult>();
      for (const s of scans) {
        // Keep highest-confidence scan per symbol
        const existing = scanMap.get(s.symbol);
        if (!existing || s.scorePct > existing.scorePct) scanMap.set(s.symbol, s);
      }

      setCoinCount(coins.length);

      // Build new cards
      const newCards: SignalCardData[] = [];
      const prevMap = prevScoreMapRef.current;

      for (const coin of coins) {
        if (coin.status === "REJECTED") continue;
        const scan = scanMap.get(coin.symbol) ?? null;
        const card = buildCardData(coin, scan, prevMap);
        newCards.push(card);
        // Track score for next update
        prevMap.set(coin.symbol, card.compositeScore);
      }

      // Sort by composite score descending
      newCards.sort((a, b) => b.compositeScore - a.compositeScore);

      setCards((prev) => {
        // Merge: new cards go to top, keep old ones below, max 100
        const oldSymbols = new Set(newCards.map((c) => c.symbol));
        const kept = prev.filter((c) => !oldSymbols.has(c.symbol)).map((c) => ({ ...c, isNew: false }));
        return [...newCards, ...kept].slice(0, MAX_CARDS);
      });

      setLastUpdate(Date.now());
    } catch {
      // Silent fail — retry next cycle
    } finally {
      setLoading(false);
    }
  }, []);

  // Polling
  useEffect(() => {
    if (!live) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    fetchData();
    timerRef.current = window.setInterval(fetchData, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [live, fetchData]);

  // Clear NEW badges after threshold
  useEffect(() => {
    const id = setInterval(() => {
      setCards((prev) => {
        const now = Date.now();
        let changed = false;
        const next = prev.map((c) => {
          if (c.isNew && now - c.timestamp > NEW_THRESHOLD) {
            changed = true;
            return { ...c, isNew: false };
          }
          return c;
        });
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Filtered cards
  const filtered = useMemo(() => {
    let list = cards;
    if (dirFilter === "BUY") list = list.filter((c) => c.direction === "LONG");
    if (dirFilter === "SELL") list = list.filter((c) => c.direction === "SHORT");
    if (minScore > 0) list = list.filter((c) => c.compositeScore >= minScore);
    return list;
  }, [cards, dirFilter, minScore]);

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px]">
        {/* ── Header Bar ── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">Coin Insight</h1>
            <span className="rounded-md bg-[#F5C542]/10 px-2 py-0.5 text-[11px] font-medium text-[#F5C542]">
              Signal Stream
            </span>
            <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400">
              {coinCount} coins
            </span>
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#F5C542] border-t-transparent" />
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Direction Filter */}
            {(["ALL", "BUY", "SELL"] as DirectionFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setDirFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  dirFilter === f
                    ? f === "BUY" ? "bg-emerald-900/40 text-emerald-400"
                      : f === "SELL" ? "bg-red-900/40 text-red-400"
                        : "bg-white/10 text-white"
                    : "bg-white/5 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {f}
              </button>
            ))}

            {/* Min Score */}
            <select
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value) as MinScoreFilter)}
              className="rounded-lg border border-white/10 bg-[#121316] px-2 py-1.5 text-[11px] text-zinc-300 outline-none"
            >
              <option value={0}>All Scores</option>
              <option value={50}>Score 50+</option>
              <option value={60}>Score 60+</option>
              <option value={70}>Score 70+</option>
              <option value={80}>Score 80+</option>
            </select>

            {/* Live Toggle */}
            <button
              onClick={() => setLive(!live)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
                live ? "bg-emerald-900/30 text-emerald-400" : "bg-zinc-800 text-zinc-500"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-emerald-400" : "bg-zinc-600"}`} />
              {live ? "LIVE" : "PAUSED"}
            </button>
          </div>
        </div>

        {/* ── Last Update ── */}
        {lastUpdate && (
          <div className="mb-4 text-[11px] text-zinc-600">
            Source: Coin Universe + AI Scoring Engine
            <span className="ml-2">{"\u00B7"}</span>
            <span className="ml-2">Refreshes every 30s</span>
            <span className="ml-2">{"\u00B7"}</span>
            <span className="ml-2">{filtered.length} signals</span>
          </div>
        )}

        {/* ── Card Grid ── */}
        {filtered.length === 0 && !loading && (
          <div className="flex min-h-[40vh] items-center justify-center text-zinc-600">
            {cards.length === 0 ? "Waiting for first scan..." : "No signals match current filters."}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((card) => (
            <SignalCard key={card.id} data={card} />
          ))}
        </div>
      </div>
    </main>
  );
}
