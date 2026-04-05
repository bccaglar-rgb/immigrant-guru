import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAuthToken } from "../services/authClient";
import { placeExchangeOrder } from "../services/exchangeApi";

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
    multiTf: { htfTrendBias: string; multiTfAlignmentScore: number; htfTrendStrength: number; ltfPullbackQuality?: number } | null;
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
  const htf = c.alpha?.multiTf?.htfTrendBias;
  const flow = c.aggressorFlow;
  const change = c.change24hPct;
  if (s >= 65 && (htf === "BULLISH" || flow === "BUY") && change > 0) return { label: "LONG", cls: "bg-[#2cc497] text-white" };
  if (s >= 65 && (htf === "BEARISH" || flow === "SELL") && change < 0) return { label: "SHORT", cls: "bg-[#f6465d] text-white" };
  if (s >= 55 && change > 1) return { label: "LONG", cls: "bg-[#2cc497] text-white" };
  if (s >= 55 && change < -1) return { label: "SHORT", cls: "bg-[#f6465d] text-white" };
  return { label: "WATCH", cls: "bg-[#333] text-[#999]" };
};

const htfBar = (c: UniverseCoin) => {
  const htfStr = c.alpha?.multiTf?.htfTrendStrength ?? c.trendStrength;
  return Math.min(20, Math.round(htfStr / 5));
};

const structureLabel = (c: UniverseCoin) => {
  const r = c.regime;
  const ts = c.trendStrength;
  if (r === "TREND") return { tag: "TRE", val: Math.round(ts / 6.67), cls: "text-[#2cc497]" };
  if (r === "BREAKOUT") return { tag: "BRK", val: Math.round(ts / 6.67), cls: "text-[#F5C542]" };
  return { tag: "RAN", val: Math.round(ts / 25), cls: "text-[#888]" };
};

const sessionScore = () => {
  const hour = new Date().getUTCHours();
  if (hour >= 13 && hour <= 21) return 10;
  if (hour >= 7 && hour <= 15) return 8;
  return 5;
};

const checklistDots = (c: UniverseCoin) => {
  let pass = 0;
  const total = 6;
  if (c.compositeScore >= 50) pass++;
  if (c.trendStrength >= 40) pass++;
  if (c.volume24hUsd > 1_000_000) pass++;
  if (c.dataQuality && c.dataQuality.score >= 60) pass++;
  if (!c.alpha?.timing || c.alpha.timing.timingGrade !== "D") pass++;
  if (!c.universeScore?.falsePenalty || c.universeScore.falsePenalty.total < 10) pass++;
  return { pass, total };
};

/** Derive signal tags from coin data */
const deriveSignalTags = (c: UniverseCoin): { label: string; cls: string }[] => {
  const tags: { label: string; cls: string }[] = [];
  // Regime
  if (c.regime === "TREND") tags.push({ label: "Trending", cls: "bg-[#2cc497]/15 text-[#2cc497] border-[#2cc497]/30" });
  if (c.regime === "BREAKOUT") tags.push({ label: "Breakout", cls: "bg-[#F5C542]/15 text-[#F5C542] border-[#F5C542]/30" });
  // Liquidity sweep
  if (c.alpha?.liquidity && c.alpha.liquidity.liquiditySweepProbability > 40)
    tags.push({ label: "Liquidity Sweep", cls: "bg-[#6B8AFF]/15 text-[#6B8AFF] border-[#6B8AFF]/30" });
  // Confidence
  const conf = Math.round(c.compositeScore);
  tags.push({ label: `Confidence ${conf}%`, cls: conf >= 65 ? "bg-[#2cc497]/15 text-[#2cc497] border-[#2cc497]/30" : "bg-[#F5C542]/15 text-[#F5C542] border-[#F5C542]/30" });
  // Timing
  const tg = c.alpha?.timing?.timingGrade;
  if (tg === "A" || tg === "B") tags.push({ label: `Entry: 15-30 min`, cls: "bg-[#2cc497]/15 text-[#2cc497] border-[#2cc497]/30" });
  else if (tg === "C") tags.push({ label: `Entry: 30-60 min`, cls: "bg-[#e0a040]/15 text-[#e0a040] border-[#e0a040]/30" });
  // Trap
  const trap = c.universeScore?.falsePenalty?.trapProbability ?? 0;
  if (trap > 0) tags.push({ label: `Trap ${trap > 30 ? "HIGH" : "LOW"}`, cls: trap > 30 ? "bg-[#f6465d]/15 text-[#f6465d] border-[#f6465d]/30" : "bg-[#e0a040]/15 text-[#e0a040] border-[#e0a040]/30" });
  // Aggressor
  if (c.aggressorFlow === "SELL") tags.push({ label: "Sell Aggression", cls: "bg-[#f6465d]/15 text-[#f6465d] border-[#f6465d]/30" });
  if (c.aggressorFlow === "BUY") tags.push({ label: "Buy Aggression", cls: "bg-[#2cc497]/15 text-[#2cc497] border-[#2cc497]/30" });
  // Volume spike
  if (c.volumeSpike) tags.push({ label: "Volume Spike", cls: "bg-[#F5C542]/15 text-[#F5C542] border-[#F5C542]/30" });
  // Late entry risk
  if (c.alpha?.structure && c.alpha.structure.trendExhaustionProbability > 50)
    tags.push({ label: "Late entry risk", cls: "bg-[#f6465d]/15 text-[#f6465d] border-[#f6465d]/30" });
  return tags;
};

/** Derive trade entry/SL/TP from coin data */
const deriveTradeInfo = (c: UniverseCoin) => {
  const dir = directionFromCoin(c);
  const entry = c.price;
  const atr = c.atrPct ? c.price * (c.atrPct / 100) : c.price * 0.02;
  const isLong = dir.label === "LONG";
  const sl = isLong ? entry - atr * 1.5 : entry + atr * 1.5;
  const tp1 = isLong ? entry + atr * 1.0 : entry - atr * 1.0;
  const tp2 = isLong ? entry + atr * 2.0 : entry - atr * 2.0;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp1 - entry);
  const rr = risk > 0 ? (reward / risk).toFixed(1) : "0";
  const rrQuality = parseFloat(rr) >= 2 ? "Good" : parseFloat(rr) >= 1 ? "Fair" : "Poor";
  const strength = c.trendStrength >= 60 ? "STRONG" : c.trendStrength >= 40 ? "MODERATE" : "WEAK";
  const action = c.alpha?.structure?.trendExhaustionProbability && c.alpha.structure.trendExhaustionProbability > 50
    ? "Wait for reclaim" : "Entry ready";
  return { dir, entry, sl, tp1, tp2, rr, rrQuality, strength, action, isLong };
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
        <span key={i} className={`${dotSize} rounded-full`} style={{ backgroundColor: i < value ? colors[Math.min(i, colors.length - 1)] : "#333" }} />
      ))}
      <span className="ml-1 text-[9px] text-[#888]">{value}/{max}</span>
    </div>
  );
};

/* ── Inline Quick Trade Panel ── */
const InlineTradePanel = ({ coin }: { coin: UniverseCoin }) => {
  const [tab, setTab] = useState<"Open" | "Close">("Open");
  const [marginMode, setMarginMode] = useState<"Isolated" | "Cross">("Isolated");
  const [leverage, setLeverage] = useState(5);
  const [showLevDropdown, setShowLevDropdown] = useState(false);
  const [price, setPrice] = useState(String(coin.price));
  const [amount, setAmount] = useState("50");
  const [tpSlEnabled, setTpSlEnabled] = useState(false);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const sym = coin.symbol.replace("USDT", "");

  const submitOrder = async (side: "BUY" | "SELL") => {
    const numPrice = parseFloat(price);
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) { setOrderStatus("Invalid amount"); return; }
    try {
      setOrderStatus("Submitting...");
      await placeExchangeOrder({
        exchange: "binance",
        symbol: coin.symbol,
        side,
        orderType: "Market",
        amount: numAmount,
        price: numPrice || undefined,
        accountMode: "Futures",
        leverage,
        marginMode: marginMode === "Cross" ? "Cross" : "Isolated",
        positionAction: tab,
        tpSl: { enabled: tpSlEnabled },
      });
      setOrderStatus(`${side} order placed!`);
      setTimeout(() => setOrderStatus(null), 3000);
    } catch (e: any) {
      setOrderStatus(`Error: ${e?.message ?? "Failed"}`);
      setTimeout(() => setOrderStatus(null), 5000);
    }
  };

  return (
    <div className="flex items-center justify-between text-[11px]">
      {/* Left side: API, margin, leverage, open/close */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[#555]">API</span>
        <span className="rounded bg-[#F5C542]/10 px-1.5 py-0.5 text-[10px] text-[#F5C542] font-medium">Binance</span>

        <button onClick={() => setMarginMode(m => m === "Isolated" ? "Cross" : "Isolated")} className="rounded bg-white/5 px-2 py-1 text-[10px] text-[#ccc] hover:bg-white/10">
          {marginMode} &#9662;
        </button>

        <div className="relative">
          <button onClick={() => setShowLevDropdown(!showLevDropdown)} className="rounded bg-white/5 px-2 py-1 text-[10px] text-[#F5C542] font-bold hover:bg-white/10">
            {leverage}x
          </button>
          {showLevDropdown && (
            <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border border-white/10 bg-[#1a1c22] p-1 grid grid-cols-5 gap-1 min-w-[160px]">
              {[1, 2, 3, 5, 10, 15, 20, 25, 50, 75, 100, 125].map((l) => (
                <button key={l} onClick={() => { setLeverage(l); setShowLevDropdown(false); }}
                  className={`rounded px-2 py-1 text-[10px] font-medium ${leverage === l ? "bg-[#F5C542]/20 text-[#F5C542]" : "text-[#888] hover:bg-white/5"}`}>
                  {l}x
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex rounded bg-white/5 overflow-hidden">
          <button onClick={() => setTab("Open")} className={`px-3 py-1 text-[10px] font-semibold transition ${tab === "Open" ? "bg-[#2cc497]/20 text-[#2cc497]" : "text-[#666] hover:text-[#999]"}`}>Open</button>
          <button onClick={() => setTab("Close")} className={`px-3 py-1 text-[10px] font-semibold transition ${tab === "Close" ? "bg-[#f6465d]/20 text-[#f6465d]" : "text-[#666] hover:text-[#999]"}`}>Close</button>
        </div>

        {orderStatus && <span className="text-[10px] text-[#F5C542] animate-pulse ml-1">{orderStatus}</span>}
      </div>

      {/* Right side: price, amount, TP/SL, buttons, exchange */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[#555]">PRICE</span>
        <input value={price} onChange={(e) => setPrice(e.target.value)}
          className="w-24 rounded border border-white/10 bg-[#0B0B0C] px-2 py-1 text-[11px] text-white outline-none focus:border-[#F5C542]/40" />

        <span className="text-[10px] text-[#555]">AMOUNT</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-16 rounded border border-white/10 bg-[#0B0B0C] px-2 py-1 text-[11px] text-white outline-none focus:border-[#F5C542]/40" />
        <span className="text-[10px] text-[#888]">USDT</span>

        <button onClick={() => setTpSlEnabled(!tpSlEnabled)}
          className={`rounded px-2 py-1 text-[10px] font-medium ${tpSlEnabled ? "bg-[#F5C542]/15 text-[#F5C542]" : "bg-white/5 text-[#666]"}`}>
          TP/SL
        </button>

        <button onClick={() => submitOrder("BUY")} className="rounded bg-[#2cc497] px-3 py-1 text-[10px] font-bold text-white hover:bg-[#25b088] transition">
          Open Long
        </button>
        <button onClick={() => submitOrder("SELL")} className="rounded bg-[#f6465d] px-3 py-1 text-[10px] font-bold text-white hover:bg-[#d93b4f] transition">
          Open Short
        </button>

        <a href={`https://www.binance.com/en/futures/${sym}USDT`} target="_blank" rel="noreferrer"
          className="rounded bg-[#F5C542]/15 px-3 py-1 text-[10px] font-bold text-[#F5C542] hover:bg-[#F5C542]/25 transition flex items-center gap-1">
          Exchange <span className="text-[8px]">&#x2197;</span>
        </a>
      </div>
    </div>
  );
};

/* ── Expanded Detail Panel ── */
const ExpandedPanel = ({ coin, onClose }: { coin: UniverseCoin; onClose: () => void }) => {
  const [signalsOpen, setSignalsOpen] = useState(true);
  const us = coin.universeScore;
  const a = coin.alpha;
  const sym = coin.symbol.replace("USDT", "");
  const tags = deriveSignalTags(coin);
  const trade = deriveTradeInfo(coin);

  const layers = [
    { name: "Structure", score: us?.structure?.total ?? 0, max: 25 },
    { name: "Liquidity", score: us?.liquidity?.total ?? 0, max: 25 },
    { name: "Position", score: us?.positioning?.total ?? 0, max: 15 },
    { name: "Execution", score: us?.execution?.total ?? 0, max: 15 },
    { name: "Momentum", score: us?.momentum?.total ?? 0, max: 20 },
  ];

  // Add Volatility & Risk & On-Chain to layer scores
  const volPct = a?.volatility ? Math.round((a.volatility.compressionScore + a.volatility.expansionForecast) / 2) : 0;
  const riskPct = us?.falsePenalty ? Math.round(100 - us.falsePenalty.total) : 50;
  const onChainPct = coin.dataQuality ? Math.round(coin.dataQuality.score * 0.46) : 0;
  const allLayers = [
    ...layers,
    { name: "Volatility", score: volPct, max: 100 },
    { name: "Risk", score: riskPct, max: 100 },
    { name: "On-Chain", score: onChainPct, max: 100 },
  ];

  const categoryCards = [
    {
      num: 1, title: "Market Regime", score: us?.structure?.total ?? 0, maxScore: 25, color: "#2cc497",
      rows: [
        ["Market Regime", coin.regime],
        ["Trend Direction", trade.isLong ? "UP" : coin.change24hPct < 0 ? "DOWN" : "NEUTRAL"],
        ["Trend Strength", `${Math.round(coin.trendStrength)}`],
        ["Trend Phase", a?.structure?.trendExhaustionProbability != null ? (a.structure.trendExhaustionProbability > 50 ? "EXHAUSTION" : "IMPULSE") : "N/A"],
        ["Structure Age", coin.regime === "TREND" ? "MATURE" : coin.regime === "BREAKOUT" ? "YOUNG" : "N/A"],
        ["Market Intent", coin.regime === "TREND" ? "TREND_CONTINUATION" : coin.regime === "BREAKOUT" ? "BREAKOUT_PLAY" : "RANGE_BOUND"],
      ],
    },
    {
      num: 2, title: "Liquidity", score: us?.liquidity?.total ?? 0, maxScore: 25, color: "#6B8AFF",
      rows: [
        ["Liquidity Cluster Nearby", a?.liquidity?.liquidityHeatmapScore != null ? (a.liquidity.liquidityHeatmapScore > 50 ? "YES" : "N/A") : "N/A"],
        ["Orderbook Imbalance", coin.aggressorFlow === "BUY" ? "BUY" : coin.aggressorFlow === "SELL" ? "SELL" : "NEUTRAL"],
        ["Liquidity Density", a?.liquidity?.stopDensityIndex != null ? (a.liquidity.stopDensityIndex > 50 ? "HIGH" : "LOW") : "N/A"],
        ["Stop Cluster Probability", a?.liquidity?.stopDensityIndex != null ? `${Math.round(a.liquidity.stopDensityIndex)}%` : "N/A"],
        ["Depth Quality", us?.execution?.depthQuality != null ? (us.execution.depthQuality > 50 ? "GOOD" : "POOR") : "N/A"],
        ["Aggressor Flow", coin.aggressorFlow || "N/A"],
        ["Liquidity Refill Behaviour", "N/A"],
      ],
    },
    {
      num: 3, title: "Positioning", score: us?.positioning?.total ?? 0, maxScore: 15, color: "#e0a040",
      rows: [
        ["Funding Bias", a?.funding?.fundingDirection ?? "N/A"],
        ["Liquidations Bias", a?.liquidation?.dominantRisk ?? "BALANCED"],
        ["OI Change (1h)", a?.oiShock?.shockType ?? "N/A"],
        ["Buy/Sell Imbalance", a?.delta?.buySellPressureRatio != null ? (a.delta.buySellPressureRatio > 1.2 ? "BUY_HEAVY" : a.delta.buySellPressureRatio < 0.8 ? "SELL_HEAVY" : "NEUTRAL") : "N/A"],
        ["Spot vs Derivatives Pressure", a?.delta?.cvdTrend ? (a.delta.cvdTrend === "RISING" ? "SPOT_LED" : "DERIV_LED") : "N/A"],
        ["Real Momentum Score", a?.delta?.deltaImbalanceScore != null ? `${Math.round(a.delta.deltaImbalanceScore)}` : "N/A"],
      ],
    },
    {
      num: 4, title: "Execution Quality", score: us?.execution?.total ?? 0, maxScore: 15, color: "#f6465d",
      rows: [
        ["Spread Regime", coin.spreadBps != null ? (coin.spreadBps > 10 ? "WIDE" : coin.spreadBps > 5 ? "NORMAL" : "TIGHT") : "N/A"],
        ["Entry Quality Score", us?.execution?.spreadQuality != null ? (us.execution.spreadQuality > 50 ? "GOOD" : "OK") : "N/A"],
        ["Slippage Risk", coin.spreadBps != null ? (coin.spreadBps > 15 ? "HIGH" : "LOW") : "N/A"],
        ["Entry Timing Window", a?.timing?.timingGrade === "A" ? "OPEN" : a?.timing?.timingGrade === "D" ? "CLOSED" : "NARROWING"],
        ["Orderbook Stability", a?.marketMaker?.spoofingProbability != null ? (a.marketMaker.spoofingProbability > 30 ? "SPOOF_RISK" : "STABLE") : "N/A"],
        ["Reaction Sensitivity", "N/A"],
      ],
    },
    {
      num: 5, title: "Volatility State", score: volPct, maxScore: 100, color: "#9B7DFF",
      rows: [
        ["Compression", a?.volatility?.compressionScore != null ? (a.volatility.compressionScore > 50 ? "ON" : "OFF") : "N/A"],
        ["Expansion Probability", a?.volatility?.expansionForecast != null ? (a.volatility.expansionForecast > 50 ? "HIGH" : "LOW") : "N/A"],
        ["Market Speed", a?.volatility?.volatilityRegime === "HIGH" ? "FAST" : a?.volatility?.volatilityRegime === "LOW" ? "SLOW" : "MODERATE"],
        ["ATR Regime", coin.atrPct != null ? (coin.atrPct > 5 ? "HIGH" : coin.atrPct > 2 ? "MODERATE" : "LOW") : "N/A"],
        ["Sudden Move Risk", a?.volatility?.expansionForecast != null ? (a.volatility.expansionForecast > 70 ? "HIGH" : "LOW") : "N/A"],
        ["Breakout Risk", a?.structure?.breakoutQualityScore != null ? (a.structure.breakoutQualityScore > 50 ? "HIGH" : "LOW") : "N/A"],
      ],
    },
  ];

  const valBadgeCls = (v: string) => {
    const lower = v.toLowerCase();
    if (["trend", "bullish", "rising", "buy", "pass", "low", "a", "spike", "up", "good", "open", "tight", "spot_led", "stable", "on", "impulse", "young", "off"].some((k) => lower === k || lower.includes(k)))
      return "bg-[#2cc497]/15 text-[#2cc497]";
    if (["bearish", "sell", "falling", "high", "wide", "panic", "d", "poor", "crowded_short", "spoof", "risk", "down", "closed", "exhaustion", "fast", "deriv_led", "buy_heavy", "sell_heavy"].some((k) => lower === k || lower.includes(k)))
      return "bg-[#f6465d]/15 text-[#f6465d]";
    if (["neutral", "normal", "flat", "range", "balanced", "ok", "c", "compressed", "mean_reverting", "moderate", "narrowing", "slow", "n/a"].some((k) => lower === k || lower.includes(k)))
      return "bg-white/5 text-[#999]";
    return "bg-[#F5C542]/10 text-[#F5C542]";
  };

  // Metric count for display
  const metricCount = categoryCards.reduce((sum, c) => sum + c.rows.length, 0) + allLayers.length + 9; // +9 for bottom cards

  return (
    <td colSpan={16} className="p-0">
      <div className="bg-[#0e0f12] border-t border-white/[0.04]">

        {/* ── TradingView Chart ── */}
        <div className="relative" style={{ height: 420 }}>
          <iframe
            src={`https://s.tradingview.com/widgetembed/?frameElementId=tv_chart&symbol=BINANCE:${sym}USDT.P&interval=15&hidesidetoolbar=0&symboledit=0&saveimage=0&toolbarbg=0B0B0C&studies=[]&theme=dark&style=1&timezone=exchange&withdateranges=1&hide_top_toolbar=0&hide_legend=0&allow_symbol_change=1&details=0&calendar=0&hotlist=0&show_popup_button=0&locale=en&utm_source=bitrium`}
            className="w-full h-full border-0"
            allow="encrypted-media"
          />
          {/* Indicators badge & close button overlay */}
          <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
            <span className="rounded bg-[#1a1c22]/90 px-2 py-1 text-[10px] text-[#888]">Indicators <b className="text-white">{3}</b></span>
            <button onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="rounded bg-[#1a1c22]/90 px-2 py-1 text-[12px] text-[#888] hover:text-white transition">✕</button>
          </div>
        </div>

        {/* ── Signal Tags ── */}
        <div className="px-4 py-2 flex flex-wrap items-center gap-1.5 border-b border-white/[0.04]">
          {tags.map((t, i) => (
            <span key={i} className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${t.cls}`}>{t.label}</span>
          ))}
          {/* Invalid above/below level */}
          {trade.sl && (
            <span className="rounded-full border border-[#f6465d]/30 bg-[#f6465d]/10 px-2.5 py-0.5 text-[10px] font-medium text-[#f6465d]">
              ✕ Invalid {trade.isLong ? "Below" : "Above"} {fmtPrice(trade.sl)}
            </span>
          )}
        </div>

        {/* ── Trade Info Bar ── */}
        <div className="px-4 py-2 flex flex-wrap items-center gap-3 border-b border-white/[0.04] text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="h-4 w-4 rounded bg-white/5 flex items-center justify-center text-[9px]">&#x1F4CB;</span>
            <span className="text-[#888]">{trade.action}</span>
          </span>
          <span className={`rounded px-2 py-0.5 font-bold text-[10px] ${trade.dir.cls}`}>
            {trade.dir.label === "LONG" ? "\u25BC" : "\u25B2"} {trade.dir.label}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${trade.strength === "STRONG" ? "bg-[#2cc497]/15 text-[#2cc497]" : trade.strength === "MODERATE" ? "bg-[#F5C542]/15 text-[#F5C542]" : "bg-white/5 text-[#888]"}`}>
            {trade.strength}
          </span>

          <span className="text-[#555]">ENTRY</span>
          <span className="text-white font-medium">{fmtPrice(trade.entry)}</span>

          <span className="text-[#f6465d]">SL</span>
          <span className="text-[#f6465d] font-medium">{fmtPrice(trade.sl)}</span>
          <span className="text-[9px] text-[#f6465d]/60">{fmtPct(((trade.sl - trade.entry) / trade.entry) * 100)}</span>

          <span className="text-[#2cc497]">TP1</span>
          <span className="text-[#2cc497] font-medium">{fmtPrice(trade.tp1)}</span>
          <span className="text-[9px] text-[#2cc497]/60">{fmtPct(((trade.tp1 - trade.entry) / trade.entry) * 100)}</span>

          <span className="text-[#2cc497]">TP2</span>
          <span className="text-[#2cc497] font-medium">{fmtPrice(trade.tp2)}</span>
          <span className="text-[9px] text-[#2cc497]/60">{fmtPct(((trade.tp2 - trade.entry) / trade.entry) * 100)}</span>

          <span className={`font-bold ${parseFloat(trade.rr) >= 1.5 ? "text-[#2cc497]" : parseFloat(trade.rr) >= 1 ? "text-[#F5C542]" : "text-[#f6465d]"}`}>
            R:R 1:{trade.rr}
          </span>
          <span className={`text-[10px] ${trade.rrQuality === "Good" ? "text-[#2cc497]" : trade.rrQuality === "Fair" ? "text-[#F5C542]" : "text-[#f6465d]"}`}>
            {trade.rrQuality}
          </span>
        </div>

        {/* ── Quick Trade Panel ── */}
        <div className="px-4 py-2 border-b border-white/[0.04]">
          <InlineTradePanel coin={coin} />
        </div>

        {/* ── SIGNALS Section ── */}
        <div className="px-4 py-2">
          <button onClick={() => setSignalsOpen(!signalsOpen)} className="flex items-center gap-2 text-[11px] font-bold text-[#F5C542] mb-2">
            <span className={`transition-transform ${signalsOpen ? "" : "-rotate-90"}`}>{signalsOpen ? "\u25BC" : "\u25B6"}</span>
            SIGNALS
            <span className="text-[#555] font-normal ml-1">{signalsOpen ? "click to collapse" : "click to expand"}</span>
            <span className="ml-auto text-[10px] text-[#555] font-normal">{metricCount} METRICS</span>
          </button>

          {signalsOpen && (
            <>
              {/* Layer Scores */}
              <div className="mb-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-2">LAYER SCORES</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5">
                  {allLayers.map((l) => {
                    const pct = l.max === 100 ? l.score : Math.round((l.score / l.max) * 100);
                    return (
                      <div key={l.name} className="flex items-center gap-2">
                        <span className="text-[10px] text-[#888] w-16">{l.name}</span>
                        <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${pct}%`,
                            backgroundColor: pct >= 70 ? "#2cc497" : pct >= 50 ? "#F5C542" : pct >= 30 ? "#e0a040" : "#f6465d",
                          }} />
                        </div>
                        <span className={`text-[11px] font-bold w-8 text-right ${scoreClr(pct)}`}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Category Cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-3">
                {categoryCards.map((card) => {
                  const pct = card.maxScore === 100 ? card.score : Math.round((card.score / card.maxScore) * 100);
                  return (
                    <div key={card.title} className="rounded-lg border border-white/[0.06] bg-[#121316] overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]" style={{ borderLeftColor: card.color, borderLeftWidth: 3 }}>
                        <span className="text-[11px] text-white">
                          <span className="text-[#555] mr-1">{card.num}</span>
                          <b>{card.title}</b>
                        </span>
                        <span className={`text-[11px] font-bold ${scoreClr(pct)}`}>{pct}%</span>
                      </div>
                      <div className="px-3 py-2 space-y-1.5">
                        {card.rows.map(([label, value]) => (
                          <div key={label} className="flex items-center justify-between">
                            <span className="text-[10px] text-[#666]">{label}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${valBadgeCls(value)}`}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Multiplier, Risk Filters, Context */}
              <div className="grid gap-3 sm:grid-cols-3">
                {/* Multiplier */}
                <div className="rounded-lg border border-white/[0.06] bg-[#121316] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
                    <span className="text-[10px] font-bold text-[#F5C542]">&#x26A1; Multiplier</span>
                    <span className="text-[9px] text-[#555] cursor-pointer hover:text-[#888]">Kazanc Carpani</span>
                  </div>
                  <div className="px-3 py-2 space-y-1.5 text-[10px]">
                    <div className="flex justify-between"><span className="text-[#666]">RR Potential</span><span className={`rounded px-1.5 py-0.5 font-bold ${valBadgeCls(trade.rrQuality === "Good" ? "HIGH" : "NORMAL")}`}>{trade.rrQuality === "Good" ? "HIGH" : "NORMAL"}</span></div>
                    <div className="flex justify-between"><span className="text-[#666]">Asymmetry Score</span><span className={`rounded px-1.5 py-0.5 font-bold ${valBadgeCls(a?.alphaGrade === "A" ? "ALPHA_DOMINANT" : "RISK_DOMINANT")}`}>{a?.alphaGrade === "A" ? "ALPHA_DOMINANT" : "RISK_DOMINANT"}</span></div>
                    <div className="flex justify-between"><span className="text-[#666]">Alpha Grade</span><span className={`rounded px-1.5 py-0.5 font-bold ${valBadgeCls(a?.alphaGrade ?? "N/A")}`}>{a?.alphaGrade ?? "N/A"}</span></div>
                    <div className="flex justify-between"><span className="text-[#666]">Alpha Bonus</span><span className="text-[#2cc497] font-medium">+{a?.alphaBonus ?? 0}</span></div>
                    <div className="flex justify-between"><span className="text-[#666]">Alpha Penalty</span><span className="text-[#f6465d] font-medium">-{a?.alphaPenalty ?? 0}</span></div>
                  </div>
                </div>

                {/* Risk Filters */}
                <div className="rounded-lg border border-white/[0.06] bg-[#121316] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
                    <span className="text-[10px] font-bold text-[#e0a040]">&#x26A0; Risk Filters</span>
                    <span className="text-[9px] text-[#555] cursor-pointer hover:text-[#888]">Risk Filtreleri</span>
                  </div>
                  <div className="px-3 py-2 space-y-1.5 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-[#666]">Risk Gate</span>
                      <span className={`rounded px-1.5 py-0.5 font-bold ${(us?.falsePenalty?.total ?? 0) < 15 ? "bg-[#2cc497]/15 text-[#2cc497]" : "bg-[#f6465d]/15 text-[#f6465d]"}`}>
                        {(us?.falsePenalty?.total ?? 0) < 15 ? "PASS" : "FAIL"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666]">Signal Conflict Level</span>
                      <span className={`rounded px-1.5 py-0.5 font-bold ${(us?.falsePenalty?.signalConflict ?? 0) < 10 ? "bg-[#2cc497]/15 text-[#2cc497]" : "bg-[#f6465d]/15 text-[#f6465d]"}`}>
                        {(us?.falsePenalty?.signalConflict ?? 0) < 10 ? "LOW" : "HIGH"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666]">False Penalty</span>
                      <span className="text-[#999] font-medium">{us?.falsePenalty?.total ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666]">Trap Probability</span>
                      <span className="text-[#999] font-medium">{us?.falsePenalty?.trapProbability ?? 0}</span>
                    </div>
                  </div>
                </div>

                {/* Context */}
                <div className="rounded-lg border border-white/[0.06] bg-[#121316] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
                    <span className="text-[10px] font-bold text-[#6B8AFF]">&#x1F30D; Context</span>
                    <span className="text-[9px] text-[#555] cursor-pointer hover:text-[#888]">Yeri Onemli</span>
                  </div>
                  <div className="px-3 py-2 space-y-1.5 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-[#666]">EMA Alignment</span>
                      <span className={`rounded px-1.5 py-0.5 font-bold ${valBadgeCls(coin.change24hPct > 0 ? "BULL" : "BEAR")}`}>
                        {coin.change24hPct > 0 ? "BULL" : "BEAR"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666]">VWAP Position</span>
                      <span className="text-[#999] font-medium">{coin.change24hPct > 0 ? "ABOVE" : "BELOW"}</span>
                    </div>
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
            </>
          )}
        </div>
      </div>
    </td>
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
                live ? "border-[#2cc497]/30 bg-[#2cc497]/10 text-[#2cc497]" : "border-white/10 bg-[#0F1012] text-[#555]"
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
                  const sess = sessionScore();
                  const cl = checklistDots(coin);
                  const liqSweep = coin.alpha?.liquidity?.liquiditySweepProbability ?? 0;
                  const liqVal = Math.round(liqSweep / 10);
                  const timing = coin.alpha?.timing?.timingGrade ?? "D";
                  const pullback = coin.alpha?.multiTf?.ltfPullbackQuality != null ? Math.round(coin.alpha.multiTf.ltfPullbackQuality) : null;
                  const bos = coin.alpha?.structure?.orderflowMomentum ?? null;
                  const tb = tierBadge(coin.tier);
                  const isExpanded = expandedCoin === coin.symbol;
                  const sym = coin.symbol.replace("USDT", "");
                  const rr = coin.alpha?.structure ? Math.max(1, Math.round(coin.alpha.structure.breakoutQualityScore / 20)) : null;

                  return (
                    <>
                      {/* Coin Row */}
                      <tr
                        key={coin.symbol}
                        className={`border-b border-white/[0.03] transition cursor-pointer ${
                          isExpanded ? "bg-[#15171c]" : "hover:bg-white/[0.02]"
                        }`}
                        onClick={() => setExpandedCoin(isExpanded ? null : coin.symbol)}
                      >
                        <td className="px-2 py-2.5 text-[11px] text-[#555] font-medium">{idx + 1}</td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[8px] font-bold ${tb.bg}`}>{tb.letter}</span>
                            <span className="text-[12px] font-bold text-white">{sym}</span>
                            <span className="text-[9px] text-[#555]">/USDT</span>
                            <span className={`ml-0.5 text-[8px] font-medium ${coin.tier === "ALPHA" ? "text-[#F5C542]" : "text-[#555]"}`}>{coin.tier.charAt(0).toLowerCase()}</span>
                            {coin.selected && <span className="h-2 w-2 rounded-full bg-[#2cc497]" title="Selected" />}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className={`inline-block rounded px-2 py-0.5 text-[12px] font-bold ${scoreBg(coin.compositeScore)} ${scoreClr(coin.compositeScore)}`}>
                            {Math.round(coin.compositeScore)}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${dir.cls}`}>
                            {dir.label === "LONG" ? "\u25B2" : dir.label === "SHORT" ? "\u25BC" : "\u25CF"} {dir.label}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <BarMini value={htf} max={20} color={htf >= 12 ? "#2cc497" : htf >= 8 ? "#F5C542" : "#f6465d"} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className="text-[11px] text-[#999]">{liqVal}</span>
                          <span className={`ml-1 h-1.5 w-1.5 rounded-full inline-block ${liqVal >= 7 ? "bg-[#f6465d]" : liqVal >= 4 ? "bg-[#F5C542]" : "bg-[#2cc497]"}`} />
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <span className="text-[11px] text-[#999]">{fmtVol(coin.volume24hUsd)}</span>
                          {coin.volumeSpike && <span className="ml-1 text-[8px] text-[#F5C542]">&#x26A1;</span>}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className="text-[11px] text-[#999]">{rr ?? "-"}</span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className={`text-[10px] font-semibold ${st.cls}`}>{st.tag}</span>
                          <span className="ml-1 text-[10px] text-[#888]">{st.val}</span>
                        </td>
                        <td className="px-2 py-2.5 text-center text-[11px] text-[#888]">{sess}</td>
                        <td className="px-2 py-2.5 text-center">
                          {bos !== null ? (
                            <span className={`h-2.5 w-2.5 rounded-full inline-block ${bos > 20 ? "bg-[#2cc497]" : bos < -20 ? "bg-[#f6465d]" : "bg-[#555]"}`} />
                          ) : <span className="text-[10px] text-[#333]">-</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <span className="text-[11px] text-[#ddd]">{fmtPrice(coin.price)}</span>
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <span className={`text-[11px] font-medium ${coin.change24hPct >= 0 ? "text-[#2cc497]" : "text-[#f6465d]"}`}>
                            {fmtPct(coin.change24hPct)}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className={`text-[11px] font-bold ${
                            timing === "A" ? "text-[#2cc497]" : timing === "B" ? "text-[#F5C542]" : timing === "C" ? "text-[#e0a040]" : "text-[#f6465d]"
                          }`}>{timing}</span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className="text-[11px] text-[#888]">{pullback ?? "-"}</span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <DotBar value={cl.pass} max={cl.total} size="xs" />
                        </td>
                        <td className="px-1 py-2.5 text-center">
                          <span className="text-[12px] text-[#555] group-hover:text-[#F5C542] transition-colors">{isExpanded ? "\u25BC" : "\u25B6"}</span>
                        </td>
                      </tr>

                      {/* Expanded Detail Panel - inline below the row */}
                      {isExpanded && (
                        <tr key={`${coin.symbol}-expanded`} className="bg-[#0e0f12]">
                          <ExpandedPanel coin={coin} onClose={() => setExpandedCoin(null)} />
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
