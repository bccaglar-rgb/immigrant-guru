/* ──────────────────────────────────────────────────────────────
   War Room v3 — Dense Battle Station Panels
   All panel components for the Alpha War Room.
   Mock data structured for real API replacement later.
   ────────────────────────────────────────────────────────────── */

import { useState } from "react";

const card = "rounded-lg border border-white/[0.06] bg-white/[0.02] p-2";
const header = "text-[10px] font-black tracking-widest uppercase";

/* ================================================================
   1. TopTradesPanel — 3 best trades right now (compact + TRADE btn)
   ================================================================ */
const topTrades = [
  { rank: 1, coin: "SOL", direction: "LONG", reason: "Pullback + OB + Sweep", confidence: 84, rr: 2.8, entry: "$148.40" },
  { rank: 2, coin: "BTC", direction: "BREAKOUT", reason: "Range break", confidence: 79, rr: 2.2, entry: "$67,200" },
  { rank: 3, coin: "AVAX", direction: "LONG", reason: "Volume surge", confidence: 76, rr: 1.9, entry: "$38.50" },
] as { rank: number; coin: string; direction: "LONG" | "SHORT" | "BREAKOUT"; reason: string; confidence: number; rr: number; entry: string }[];

export const TopTradesPanel = () => (
  <div className={card}>
    <div className="flex items-center gap-2 mb-1.5">
      <span className={`${header} text-yellow-400`}>Top 3 Trades Right Now</span>
    </div>
    <div className="grid grid-cols-3 gap-1.5">
      {topTrades.map((t) => {
        const isLong = t.direction !== "SHORT";
        const borderColor = t.direction === "BREAKOUT" ? "border-yellow-500/40" : isLong ? "border-emerald-500/40" : "border-red-500/40";
        const badgeColor = t.direction === "BREAKOUT" ? "bg-yellow-500/20 text-yellow-400" : isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400";
        return (
          <div key={t.rank} className={`rounded-lg border ${borderColor} bg-white/[0.02] p-2`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-black text-white/40">#{t.rank}</span>
                <span className="text-[10px] font-black text-white">{t.coin}</span>
                <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${badgeColor}`}>{t.direction}</span>
              </div>
              <span className="text-[8px] font-mono text-white/50">RR {t.rr}</span>
            </div>
            <p className="text-[8px] text-white/50 mb-1">{t.reason}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className="w-12 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${t.confidence}%` }} />
                </div>
                <span className="text-[8px] font-bold font-mono text-emerald-400">{t.confidence}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-mono font-bold text-white">{t.entry}</span>
                <button className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors">TRADE</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

/* ================================================================
   2. MarketHeatmap
   ================================================================ */
const heatmapData = {
  trending: [
    { coin: "SOL", val: "+4.2%" }, { coin: "AVAX", val: "+6.1%" },
    { coin: "BNB", val: "+2.8%" }, { coin: "SUI", val: "+3.5%" },
  ],
  weak: [
    { coin: "ETH", val: "-2.1%" }, { coin: "ARB", val: "-3.8%" },
    { coin: "DOGE", val: "-4.2%" }, { coin: "MATIC", val: "-1.9%" },
  ],
  volumeSpike: [
    { coin: "BTC", val: "+180%" }, { coin: "SOL", val: "+220%" },
    { coin: "LINK", val: "+150%" }, { coin: "INJ", val: "+95%" },
  ],
};

export const MarketHeatmap = () => (
  <div className={card}>
    <span className={`${header} text-cyan-400`}>Market Heatmap</span>
    <div className="grid grid-cols-3 gap-2 mt-1.5">
      <HeatCol title="Trending" items={heatmapData.trending} positive />
      <HeatCol title="Weak" items={heatmapData.weak} positive={false} />
      <HeatCol title="Vol Spike" items={heatmapData.volumeSpike} positive />
    </div>
  </div>
);

const HeatCol = ({ title, items, positive }: { title: string; items: { coin: string; val: string }[]; positive: boolean }) => (
  <div>
    <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider">{title}</span>
    <div className="mt-1 space-y-0.5">
      {items.map((i) => (
        <div key={i.coin} className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-white">{i.coin}</span>
          <span className={`text-[9px] font-mono font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}>{i.val}</span>
        </div>
      ))}
    </div>
  </div>
);

/* ================================================================
   3. SectorRotation
   ================================================================ */
const sectors = [
  { name: "AI Coins", change: "+5.2%", pct: 85, status: "hot" as const },
  { name: "L1", change: "+3.8%", pct: 72, status: "hot" as const },
  { name: "Meme", change: "+1.2%", pct: 55, status: "neutral" as const },
  { name: "DeFi", change: "-2.1%", pct: 35, status: "cold" as const },
  { name: "Gaming", change: "-3.5%", pct: 22, status: "cold" as const },
];

export const SectorRotation = () => (
  <div className={card}>
    <span className={`${header} text-violet-400`}>Sector Rotation</span>
    <div className="mt-1.5 space-y-1">
      {sectors.map((s) => {
        const barColor = s.status === "hot" ? "bg-emerald-500" : s.status === "neutral" ? "bg-yellow-500" : "bg-red-500";
        const textColor = s.status === "hot" ? "text-emerald-400" : s.status === "neutral" ? "text-yellow-400" : "text-red-400";
        const icon = s.status === "hot" ? "\u2191" : s.status === "neutral" ? "\u2192" : "\u2193";
        return (
          <div key={s.name}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9px] text-white/70">{icon} {s.name}</span>
              <span className={`text-[9px] font-mono font-bold ${textColor}`}>{s.change}</span>
            </div>
            <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${s.pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

/* ================================================================
   4. BreakoutScanner
   ================================================================ */
const breakouts = [
  { coin: "SOL", status: "Squeeze (imminent)", urgency: "red" as const },
  { coin: "BTC", status: "Range tightening", urgency: "yellow" as const },
  { coin: "LINK", status: "Resistance test", urgency: "yellow" as const },
  { coin: "AVAX", status: "Volume breakout", urgency: "green" as const },
];

export const BreakoutScanner = () => (
  <div className={card}>
    <span className={`${header} text-amber-400`}>Breakout Scanner</span>
    <div className="mt-1.5 space-y-1">
      {breakouts.map((b) => {
        const dot = b.urgency === "red" ? "bg-red-500" : b.urgency === "yellow" ? "bg-yellow-500" : "bg-emerald-500";
        return (
          <div key={b.coin} className="flex items-center gap-2">
            <span className="text-[9px] text-yellow-400/70">&#9889;</span>
            <span className="text-[9px] font-bold text-white w-8">{b.coin}</span>
            <span className="text-[9px] text-white/50 flex-1">{b.status}</span>
            <div className={`h-2 w-2 rounded-full ${dot}`} />
          </div>
        );
      })}
    </div>
  </div>
);

/* ================================================================
   5. SmartSignalGrid — LONG | SHORT | BREAKOUT | SCALP
   ================================================================ */
const longSetups = [
  { coin: "SOL", signal: "OB + Sweep", conf: 84, rr: 2.8 },
  { coin: "AVAX", signal: "Pullback", conf: 79, rr: 2.2 },
  { coin: "BNB", signal: "Support bounce", conf: 74, rr: 1.9 },
];
const shortSetups = [
  { coin: "ETH", signal: "Resistance + OB", conf: 76, rr: 2.4 },
  { coin: "ARB", signal: "Breakdown", conf: 71, rr: 2.0 },
];
const breakoutSetups = [
  { coin: "BTC", signal: "Range break", conf: 79 },
  { coin: "LINK", signal: "Squeeze", conf: 75 },
  { coin: "SOL", signal: "Triangle", conf: 82 },
];
const scalpSetups = [
  { coin: "BTC", signal: "Mom spike", window: "1-3min" },
  { coin: "ETH", signal: "Liq sweep", window: "2-5min" },
  { coin: "SOL", signal: "VWAP reclaim", window: "1-2min" },
];

const SignalItem = ({ coin, text, borderColor }: { coin: string; text: string; borderColor: string }) => (
  <div className={`flex items-center gap-1.5 border-l-2 ${borderColor} pl-1.5 py-0.5`}>
    <span className="text-[9px] font-bold text-white">{coin}</span>
    <span className="text-[8px] text-white/40">{text}</span>
  </div>
);

export const SmartSignalGrid = () => (
  <div className="grid grid-cols-4 gap-1.5">
    {/* LONGS */}
    <div className={card}>
      <span className={`${header} text-emerald-400`}>Long Setups</span>
      <div className="mt-1.5 space-y-0.5">
        {longSetups.map((s) => (
          <SignalItem key={s.coin} coin={s.coin} text={`${s.signal} | ${s.conf}% | RR ${s.rr}`} borderColor="border-emerald-500" />
        ))}
      </div>
    </div>
    {/* SHORTS */}
    <div className={card}>
      <span className={`${header} text-red-400`}>Short Setups</span>
      <div className="mt-1.5 space-y-0.5">
        {shortSetups.map((s) => (
          <SignalItem key={s.coin} coin={s.coin} text={`${s.signal} | ${s.conf}% | RR ${s.rr}`} borderColor="border-red-500" />
        ))}
      </div>
    </div>
    {/* BREAKOUTS */}
    <div className={card}>
      <span className={`${header} text-yellow-400`}>Breakouts</span>
      <div className="mt-1.5 space-y-0.5">
        {breakoutSetups.map((s) => (
          <SignalItem key={s.coin} coin={s.coin} text={`${s.signal} | ${s.conf}%`} borderColor="border-yellow-500" />
        ))}
      </div>
    </div>
    {/* SCALPS */}
    <div className={card}>
      <div className="flex items-center gap-1">
        <span className={`${header} text-blue-400`}>Scalps</span>
        <span className="text-[9px]">&#9889;</span>
      </div>
      <div className="mt-1.5 space-y-0.5">
        {scalpSetups.map((s) => (
          <SignalItem key={s.coin} coin={s.coin} text={`${s.signal} | ${s.window}`} borderColor="border-blue-500" />
        ))}
      </div>
    </div>
  </div>
);

/* ================================================================
   6. OpportunityFeed — with expandable WHY
   ================================================================ */
const opportunities = [
  { id: 1, type: "LONG" as const, coin: "SOL", reason: "OB retest + volume spike", confidence: 84, rr: 2.8, time: "2s", why: ["HH/HL intact", "Liq swept", "Vol spike", "OB support"], score: 8.5 },
  { id: 2, type: "BREAKOUT" as const, coin: "LINK", reason: "Range break w/ momentum", confidence: 77, rr: 2.1, time: "15s", why: ["Tight range 5D", "Vol expanding", "OI rising", "Above VWAP"], score: 7.8 },
  { id: 3, type: "SHORT" as const, coin: "DOGE", reason: "Rejection at HTF supply", confidence: 72, rr: 1.8, time: "45s", why: ["LH forming", "Supply zone", "Delta divergence"], score: 7.2 },
  { id: 4, type: "LONG" as const, coin: "BTC", reason: "Demand zone tap + RSI div", confidence: 79, rr: 2.2, time: "1m", why: ["RSI divergence", "Demand zone", "Funding reset", "OI drop"], score: 8.0 },
  { id: 5, type: "BREAKOUT" as const, coin: "AVAX", reason: "Squeeze play detected", confidence: 76, rr: 1.9, time: "2m", why: ["BB squeeze", "Vol contraction", "Momentum building"], score: 7.6 },
  { id: 6, type: "LONG" as const, coin: "BNB", reason: "Trend continuation pullback", confidence: 71, rr: 1.7, time: "3m", why: ["Uptrend intact", "50EMA bounce", "Vol support"], score: 7.1 },
  { id: 7, type: "SHORT" as const, coin: "ARB", reason: "Bearish structure break", confidence: 68, rr: 1.6, time: "5m", why: ["Structure break", "Below VWAP", "Sell volume"], score: 6.8 },
  { id: 8, type: "LONG" as const, coin: "SUI", reason: "Momentum + OI surge", confidence: 74, rr: 2.0, time: "8m", why: ["OI surge", "Momentum", "Trend aligned"], score: 7.4 },
];

const typeBadge = (type: "LONG" | "SHORT" | "BREAKOUT") => {
  const cls =
    type === "LONG" ? "bg-emerald-500/20 text-emerald-400" :
    type === "SHORT" ? "bg-red-500/20 text-red-400" :
    "bg-yellow-500/20 text-yellow-400";
  return <span className={`text-[7px] font-bold px-1 py-0.5 rounded ${cls}`}>{type}</span>;
};

const OpportunityRow = ({ o }: { o: typeof opportunities[0] }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] px-2 py-1 hover:bg-white/[0.04] transition-colors cursor-pointer" onClick={() => setOpen(!open)}>
        {typeBadge(o.type)}
        <span className="text-[9px] font-bold text-white w-7">{o.coin}</span>
        <span className="text-[8px] text-white/50 flex-1 truncate">{o.reason}</span>
        <span className="text-[8px] font-bold font-mono text-emerald-400">{o.confidence}%</span>
        <span className="text-[7px] font-mono text-white/30">RR {o.rr}</span>
        <span className="text-[7px] text-white/20 w-5 text-right">{o.time}</span>
        <span className="text-[8px] text-white/30">{open ? "\u25B2" : "WHY?"}</span>
      </div>
      {open && (
        <div className="ml-4 mt-0.5 mb-1 px-2 py-1 rounded bg-white/[0.02] border border-white/[0.04]">
          <span className="text-[8px] font-bold text-white/60">WHY {o.coin} {o.type}?</span>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
            {o.why.map((w, i) => (
              <span key={i} className="text-[8px] text-emerald-400/80">{"\u2713"} {w}</span>
            ))}
          </div>
          <span className="text-[8px] font-mono font-bold text-yellow-400 mt-0.5 block">Score: {o.score}/10</span>
        </div>
      )}
    </div>
  );
};

export const OpportunityFeed = () => (
  <div className={card}>
    <div className="flex items-center justify-between mb-1">
      <span className={`${header} text-orange-400`}>Live Opportunity Feed</span>
      <div className="flex items-center gap-1">
        <div className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
        <span className="text-[7px] text-white/30">LIVE</span>
      </div>
    </div>
    <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
      {opportunities.map((o) => <OpportunityRow key={o.id} o={o} />)}
    </div>
  </div>
);

/* ================================================================
   7. MoneyFlowPanel
   ================================================================ */
const flows = [
  { coin: "BTC", direction: "OUT", strength: 1 },
  { coin: "ETH", direction: "IN", strength: 1 },
  { coin: "SOL", direction: "IN", strength: 2 },
  { coin: "AVAX", direction: "IN", strength: 1 },
  { coin: "BNB", direction: "OUT", strength: 1 },
];

export const MoneyFlowPanel = () => (
  <div className={card}>
    <span className={`${header} text-emerald-400`}>Money Flow</span>
    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
      {flows.map((f) => {
        const isIn = f.direction === "IN";
        const dots = isIn ? "\uD83D\uDFE2".repeat(f.strength) : "\uD83D\uDD34".repeat(f.strength);
        return (
          <span key={f.coin} className="text-[9px] text-white/70">
            <span className="font-bold">{f.coin}</span>
            <span className="text-white/30"> {"\u2192"} </span>
            <span className={`font-bold ${isIn ? "text-emerald-400" : "text-red-400"}`}>{f.direction}</span>
            <span className="ml-0.5">{dots}</span>
          </span>
        );
      })}
    </div>
    <div className="mt-1 pt-1 border-t border-white/[0.06] flex items-center justify-between">
      <span className="text-[8px] text-white/30">Net</span>
      <span className="text-[9px] font-bold font-mono text-emerald-400">+$480M</span>
    </div>
  </div>
);

/* ================================================================
   8. LiveTape — Scrolling ticker
   ================================================================ */
const tapeData = [
  { amount: "$1.2M", side: "BUY" as const, coin: "BTC" },
  { amount: "$800K", side: "SELL" as const, coin: "ETH" },
  { amount: "$2.1M", side: "BUY" as const, coin: "SOL" },
  { amount: "$500K", side: "BUY" as const, coin: "AVAX" },
  { amount: "$1.8M", side: "SELL" as const, coin: "BTC" },
  { amount: "$650K", side: "BUY" as const, coin: "LINK" },
  { amount: "$1.4M", side: "SELL" as const, coin: "ETH" },
  { amount: "$900K", side: "BUY" as const, coin: "BNB" },
  { amount: "$3.2M", side: "BUY" as const, coin: "BTC" },
  { amount: "$720K", side: "SELL" as const, coin: "SOL" },
];

export const LiveTape = () => (
  <div className={card}>
    <div className="flex items-center gap-2 mb-1">
      <span className={`${header} text-cyan-400`}>Live Tape</span>
      <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
    </div>
    <div className="overflow-x-auto">
      <div className="flex items-center gap-2 whitespace-nowrap animate-[tape_30s_linear_infinite]">
        {[...tapeData, ...tapeData].map((t, i) => {
          const isBuy = t.side === "BUY";
          return (
            <span key={i} className="text-[9px] font-mono">
              <span className={`font-bold ${isBuy ? "text-emerald-400" : "text-red-400"}`}>{t.amount}</span>
              <span className={`font-bold ml-0.5 ${isBuy ? "text-emerald-400" : "text-red-400"}`}>{t.side}</span>
              <span className="text-white/50 ml-0.5">{t.coin}</span>
              <span className={`ml-0.5 ${isBuy ? "text-emerald-400" : "text-red-400"}`}>{isBuy ? "\uD83D\uDFE2" : "\uD83D\uDD34"}</span>
              {i < tapeData.length * 2 - 1 && <span className="text-white/10 ml-2">|</span>}
            </span>
          );
        })}
      </div>
    </div>
    <style>{`@keyframes tape { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
  </div>
);

/* ================================================================
   9. BuySellPressure
   ================================================================ */
export const BuySellPressure = () => {
  const buyPct = 72;
  const sellPct = 100 - buyPct;
  return (
    <div className={card}>
      <span className={`${header} text-purple-400`}>Buy/Sell Pressure</span>
      <div className="mt-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono font-bold text-emerald-400">BUY {buyPct}%</span>
          <div className="flex-1 flex h-2.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500" style={{ width: `${buyPct}%` }} />
            <div className="bg-red-500" style={{ width: `${sellPct}%` }} />
          </div>
          <span className="text-[9px] font-mono font-bold text-red-400">SELL {sellPct}%</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[8px] text-white/30">Aggression</span>
          <span className="text-[9px] font-bold text-orange-400">HIGH &#x1F525;</span>
        </div>
      </div>
    </div>
  );
};

/* ================================================================
   10. WhaleActivityBoard (font-mono on amounts)
   ================================================================ */
const whaleTransactions = [
  { amount: "$4.2M", coin: "BTC", side: "BUY" as const, exchange: "Binance", time: "2m" },
  { amount: "$2.1M", coin: "SOL", side: "BUY" as const, exchange: "Bybit", time: "5m" },
  { amount: "$3.8M", coin: "ETH", side: "SELL" as const, exchange: "Coinbase", time: "8m" },
  { amount: "$1.5M", coin: "AVAX", side: "BUY" as const, exchange: "OKX", time: "12m" },
  { amount: "$2.7M", coin: "BNB", side: "BUY" as const, exchange: "Binance", time: "18m" },
];

export const WhaleActivityBoard = () => (
  <div className={card}>
    <span className={`${header} text-blue-400`}>Whale Activity</span>
    <div className="mt-1.5 space-y-0.5">
      {whaleTransactions.map((w, i) => {
        const isBuy = w.side === "BUY";
        return (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${isBuy ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="text-[9px] font-bold font-mono text-white">{w.amount}</span>
            <span className="text-[9px] text-white/70">{w.coin}</span>
            <span className={`text-[8px] font-bold ${isBuy ? "text-emerald-400" : "text-red-400"}`}>{w.side}</span>
            <span className="text-[7px] text-white/30 flex-1">({w.exchange})</span>
            <span className="text-[7px] font-mono text-white/20">{w.time}</span>
          </div>
        );
      })}
    </div>
    <div className="mt-1.5 pt-1 border-t border-white/[0.06] flex items-center justify-between">
      <span className="text-[8px] text-white/30">Net Flow</span>
      <span className="text-[9px] font-bold font-mono text-emerald-400">+$6.3M</span>
    </div>
  </div>
);

/* ================================================================
   11. LiquidationMap
   ================================================================ */
const liquidationLevels = [
  { direction: "ABOVE" as const, price: "$150.00", liquidity: "$120M" },
  { direction: "ABOVE" as const, price: "$152.50", liquidity: "$85M" },
  { direction: "BELOW" as const, price: "$145.00", liquidity: "$95M" },
  { direction: "BELOW" as const, price: "$142.00", liquidity: "$68M" },
];

export const LiquidationMap = () => (
  <div className={card}>
    <span className={`${header} text-rose-400`}>Liquidation Map</span>
    <div className="mt-1.5 space-y-0.5">
      {liquidationLevels.map((l, i) => {
        const isAbove = l.direction === "ABOVE";
        return (
          <div key={i} className="flex items-center gap-1.5">
            <span className={`text-[9px] ${isAbove ? "text-emerald-400" : "text-red-400"}`}>{isAbove ? "\u25B2" : "\u25BC"}</span>
            <span className="text-[8px] text-white/30">{l.direction}</span>
            <span className="text-[9px] font-mono font-bold text-white">{l.price}</span>
            <span className="text-[7px] font-mono text-white/40 flex-1 text-right">{l.liquidity} liq</span>
          </div>
        );
      })}
    </div>
    <div className="mt-1 pt-1 border-t border-white/[0.06] flex items-center justify-between">
      <span className="text-[8px] text-white/30">Magnet</span>
      <span className="text-[9px] font-bold font-mono text-yellow-400">$150.00 &#x2191;</span>
    </div>
  </div>
);

/* ================================================================
   12. AIGlobalBias
   ================================================================ */
const biasData = [
  { coin: "BTC", bias: "Bullish", pct: 78 },
  { coin: "ETH", bias: "Neutral", pct: 52 },
  { coin: "SOL", bias: "Strong Bull", pct: 84 },
  { coin: "AVAX", bias: "Bullish", pct: 71 },
];

export const AIGlobalBias = () => (
  <div className={card}>
    <span className={`${header} text-sky-400`}>AI Global Bias</span>
    <div className="mt-1.5 space-y-1">
      {biasData.map((b) => {
        const barColor = b.pct >= 75 ? "bg-emerald-500" : b.pct >= 55 ? "bg-emerald-500/60" : "bg-yellow-500";
        const textColor = b.pct >= 75 ? "text-emerald-400" : b.pct >= 55 ? "text-emerald-400/70" : "text-yellow-400";
        return (
          <div key={b.coin}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9px] font-bold text-white">{b.coin}</span>
              <span className={`text-[8px] font-bold font-mono ${textColor}`}>{b.bias} ({b.pct}%)</span>
            </div>
            <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${b.pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
    <div className="mt-1.5 pt-1 border-t border-white/[0.06] flex items-center justify-between">
      <span className="text-[8px] text-white/30">Market Mode</span>
      <span className="text-[9px] font-bold text-emerald-400">Risk-On</span>
    </div>
  </div>
);

/* ================================================================
   13. CorrelationPanel
   ================================================================ */
const correlations = [
  { pair: "BTC\u2194ETH", value: 0.92, label: "high" },
  { pair: "BTC\u2194SOL", value: 0.78, label: "med" },
  { pair: "BTC\u2194AVAX", value: 0.65, label: "med" },
];

export const CorrelationPanel = () => (
  <div className={card}>
    <span className={`${header} text-indigo-400`}>Correlation</span>
    <div className="mt-1.5 space-y-0.5">
      {correlations.map((c) => (
        <div key={c.pair} className="flex items-center justify-between">
          <span className="text-[9px] text-white/70">{c.pair}</span>
          <span className="text-[9px] font-mono font-bold text-white">{c.value.toFixed(2)} <span className="text-white/40">({c.label})</span></span>
        </div>
      ))}
    </div>
    <div className="mt-1 pt-1 border-t border-white/[0.06]">
      <span className="text-[8px] text-yellow-400">Divergence: SOL leading {"\u2191"}</span>
    </div>
  </div>
);

/* ================================================================
   14. DangerZone — Red-tinted
   ================================================================ */
const dangers = [
  "Funding overheated",
  "Long crowd heavy (72%)",
  "Liquidity clustered above",
];

export const DangerZone = () => (
  <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-2">
    <div className="flex items-center gap-1">
      <span className={`${header} text-red-400 animate-pulse`}>Danger Zone</span>
      <span className="text-[9px] animate-pulse">&#9888;&#65039;</span>
    </div>
    <div className="mt-1.5 space-y-0.5">
      {dangers.map((d, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-[8px] text-red-400">{"\u2022"}</span>
          <span className="text-[9px] text-red-300/80">{d}</span>
        </div>
      ))}
    </div>
    <div className="mt-1 pt-1 border-t border-red-500/10">
      <span className="text-[8px] text-red-400 font-bold">{"\u2192"} Possible flush within 2-4H</span>
    </div>
  </div>
);

/* ================================================================
   15. MarketCondition
   ================================================================ */
export const MarketCondition = () => (
  <div className={card}>
    <span className={`${header} text-teal-400`}>Market State</span>
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[8px] text-white/40">Trend</span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-bold text-emerald-400">Strong</span>
          <div className="flex gap-px">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-sm bg-emerald-500" />)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[8px] text-white/40">Volatility</span>
        <span className="text-[9px] font-bold text-yellow-400">Expanding {"\u2191"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[8px] text-white/40">Liquidity</span>
        <span className="text-[9px] font-bold text-white/70">High</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[8px] text-white/40">Mode</span>
        <span className="text-[9px] font-bold text-emerald-400">Expansion Phase {"\uD83D\uDFE2"}</span>
      </div>
    </div>
  </div>
);

/* ================================================================
   16. KeyLevelsDashboard — Bottom strip
   ================================================================ */
const keyLevels = [
  { coin: "BTC", support: "$66,400", resistance: "$68,900" },
  { coin: "ETH", support: "$3,420", resistance: "$3,620" },
  { coin: "SOL", support: "$145.20", resistance: "$152.80" },
];

export const KeyLevelsDashboard = () => (
  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 flex items-center gap-3">
    <span className={`${header} text-teal-400`}>Key Levels</span>
    <div className="flex items-center gap-3 flex-1">
      {keyLevels.map((k) => (
        <div key={k.coin} className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-white">{k.coin}</span>
          <span className="text-[8px] font-mono text-emerald-400">S: {k.support}</span>
          <span className="text-[8px] font-mono text-red-400">R: {k.resistance}</span>
        </div>
      ))}
    </div>
  </div>
);

/* ================================================================
   17. NarrativeEngine — Bottom strip
   ================================================================ */
const narratives = [
  "ETF inflow trending up",
  "Fed dovish tilt \u2192 risk-on",
  "SOL ecosystem surging",
  "AI token narrative growing",
  "BTC halving impact fading",
];

export const NarrativeEngine = () => (
  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 flex items-center gap-2">
    <span className={`${header} text-pink-400`}>Narratives</span>
    <div className="flex items-center gap-2 flex-1 overflow-hidden">
      {narratives.map((n, i) => (
        <span key={i} className="text-[9px] text-white/50 whitespace-nowrap">
          {i > 0 && <span className="text-white/10 mx-1">|</span>}
          {n}
        </span>
      ))}
    </div>
  </div>
);
