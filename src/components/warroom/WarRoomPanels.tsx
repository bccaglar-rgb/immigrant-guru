/* ──────────────────────────────────────────────────────────────
   War Room v2 — Panels
   All panel components for the Money Radar + Opportunity Engine.
   Mock data structured for real API replacement later.
   ────────────────────────────────────────────────────────────── */

/* ================================================================
   1. TopTradesPanel — 3 best trades right now
   ================================================================ */
const topTrades = [
  { rank: 1, coin: "SOL", direction: "LONG", reason: "Pullback + OB + Sweep", confidence: 84, rr: 2.8, entry: "$148.40" },
  { rank: 2, coin: "BTC", direction: "BREAKOUT", reason: "Range break", confidence: 79, rr: 2.2, entry: "$67,200" },
  { rank: 3, coin: "AVAX", direction: "LONG", reason: "Volume surge", confidence: 76, rr: 1.9, entry: "$38.50" },
] as { rank: number; coin: string; direction: "LONG" | "SHORT" | "BREAKOUT"; reason: string; confidence: number; rr: number; entry: string }[];

export const TopTradesPanel = () => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[10px] font-black tracking-widest uppercase text-yellow-400">Top 3 Trades Right Now</span>
    </div>
    <div className="grid grid-cols-3 gap-2">
      {topTrades.map((t) => {
        const isLong = t.direction !== "SHORT";
        const borderColor = t.direction === "BREAKOUT" ? "border-yellow-500/40" : isLong ? "border-emerald-500/40" : "border-red-500/40";
        const badgeColor = t.direction === "BREAKOUT" ? "bg-yellow-500/20 text-yellow-400" : isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400";
        return (
          <div key={t.rank} className={`rounded-lg border ${borderColor} bg-white/[0.02] p-2.5`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black text-white/40">#{t.rank}</span>
                <span className="text-[11px] font-black text-white">{t.coin}</span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${badgeColor}`}>{t.direction}</span>
              </div>
              <span className="text-[9px] text-white/50">RR {t.rr}</span>
            </div>
            <p className="text-[9px] text-white/50 mb-1.5">{t.reason}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-white/30">Conf</span>
                <div className="w-14 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${t.confidence}%` }} />
                </div>
                <span className="text-[8px] font-bold text-emerald-400">{t.confidence}%</span>
              </div>
              <span className="text-[9px] font-mono font-bold text-white">{t.entry}</span>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

/* ================================================================
   2. OpportunityFeed — Scrollable live opportunity feed
   ================================================================ */
const opportunities = [
  { id: 1, type: "LONG" as const, coin: "SOL", reason: "OB retest + volume spike", confidence: 84, rr: 2.8, time: "2s" },
  { id: 2, type: "BREAKOUT" as const, coin: "LINK", reason: "Range break w/ momentum", confidence: 77, rr: 2.1, time: "15s" },
  { id: 3, type: "SHORT" as const, coin: "DOGE", reason: "Rejection at HTF supply", confidence: 72, rr: 1.8, time: "45s" },
  { id: 4, type: "LONG" as const, coin: "BTC", reason: "Demand zone tap + RSI div", confidence: 79, rr: 2.2, time: "1m" },
  { id: 5, type: "BREAKOUT" as const, coin: "AVAX", reason: "Squeeze play detected", confidence: 76, rr: 1.9, time: "2m" },
  { id: 6, type: "LONG" as const, coin: "BNB", reason: "Trend continuation pullback", confidence: 71, rr: 1.7, time: "3m" },
  { id: 7, type: "SHORT" as const, coin: "ARB", reason: "Bearish structure break", confidence: 68, rr: 1.6, time: "5m" },
  { id: 8, type: "LONG" as const, coin: "SUI", reason: "Momentum + OI surge", confidence: 74, rr: 2.0, time: "8m" },
  { id: 9, type: "BREAKOUT" as const, coin: "INJ", reason: "Volatility contraction", confidence: 70, rr: 1.8, time: "12m" },
  { id: 10, type: "SHORT" as const, coin: "ETH", reason: "Distribution top + delta div", confidence: 66, rr: 1.5, time: "15m" },
];

const typeBadge = (type: "LONG" | "SHORT" | "BREAKOUT") => {
  const cls =
    type === "LONG" ? "bg-emerald-500/20 text-emerald-400" :
    type === "SHORT" ? "bg-red-500/20 text-red-400" :
    "bg-yellow-500/20 text-yellow-400";
  return <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{type}</span>;
};

export const OpportunityFeed = () => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] flex flex-col h-full">
    <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
      <span className="text-[10px] font-black tracking-widest uppercase text-orange-400">Live Opportunity Feed</span>
      <div className="flex items-center gap-1">
        <div className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
        <span className="text-[8px] text-white/30">LIVE</span>
      </div>
    </div>
    <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
      {opportunities.map((o) => (
        <div key={o.id} className="flex items-center gap-2 rounded-lg bg-white/[0.02] border border-white/[0.04] px-2.5 py-1.5 hover:bg-white/[0.04] transition-colors">
          {typeBadge(o.type)}
          <span className="text-[10px] font-bold text-white w-8">{o.coin}</span>
          <span className="text-[9px] text-white/50 flex-1 truncate">{o.reason}</span>
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-white/30">Conf</span>
            <span className="text-[9px] font-bold text-emerald-400">{o.confidence}%</span>
          </div>
          <span className="text-[8px] text-white/30">RR {o.rr}</span>
          <span className="text-[8px] text-white/20 w-6 text-right">{o.time}</span>
        </div>
      ))}
    </div>
  </div>
);

/* ================================================================
   3. MarketHeatmap — Trending / Weak / Volume Spike
   ================================================================ */
const heatmapData = {
  trending: [
    { coin: "SOL", val: "+4.2%" },
    { coin: "AVAX", val: "+6.1%" },
    { coin: "BNB", val: "+2.8%" },
    { coin: "SUI", val: "+3.5%" },
  ],
  weak: [
    { coin: "ETH", val: "-2.1%" },
    { coin: "ARB", val: "-3.8%" },
    { coin: "DOGE", val: "-4.2%" },
    { coin: "MATIC", val: "-1.9%" },
  ],
  volumeSpike: [
    { coin: "BTC", val: "+180%" },
    { coin: "SOL", val: "+220%" },
    { coin: "LINK", val: "+150%" },
    { coin: "INJ", val: "+95%" },
  ],
};

export const MarketHeatmap = () => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
    <span className="text-[10px] font-black tracking-widest uppercase text-cyan-400">Market Heatmap</span>
    <div className="grid grid-cols-3 gap-2 mt-2">
      <HeatCol title="Trending" icon="fire" items={heatmapData.trending} positive />
      <HeatCol title="Weak" icon="skull" items={heatmapData.weak} positive={false} />
      <HeatCol title="Vol Spike" icon="money" items={heatmapData.volumeSpike} positive />
    </div>
  </div>
);

const HeatCol = ({ title, items, positive }: { title: string; icon: string; items: { coin: string; val: string }[]; positive: boolean }) => (
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
   4. SectorRotation — Sector strength bars
   ================================================================ */
const sectors = [
  { name: "AI Coins", change: "+5.2%", pct: 85, status: "hot" as const },
  { name: "L1", change: "+3.8%", pct: 72, status: "hot" as const },
  { name: "Meme", change: "+1.2%", pct: 55, status: "neutral" as const },
  { name: "DeFi", change: "-2.1%", pct: 35, status: "cold" as const },
  { name: "Gaming", change: "-3.5%", pct: 22, status: "cold" as const },
];

export const SectorRotation = () => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
    <span className="text-[10px] font-black tracking-widest uppercase text-violet-400">Sector Rotation</span>
    <div className="mt-2 space-y-1.5">
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
   5. BreakoutScanner
   ================================================================ */
const breakouts = [
  { coin: "SOL", status: "Squeeze (imminent)", urgency: "red" as const },
  { coin: "BTC", status: "Range tightening", urgency: "yellow" as const },
  { coin: "LINK", status: "Resistance test", urgency: "yellow" as const },
  { coin: "AVAX", status: "Volume breakout", urgency: "green" as const },
];

export const BreakoutScanner = () => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
    <span className="text-[10px] font-black tracking-widest uppercase text-amber-400">Breakout Scanner</span>
    <div className="mt-2 space-y-1">
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
   6. WhaleActivityBoard
   ================================================================ */
const whaleTransactions = [
  { amount: "$4.2M", coin: "BTC", side: "BUY" as const, exchange: "Binance", time: "2m ago" },
  { amount: "$2.1M", coin: "SOL", side: "BUY" as const, exchange: "Bybit", time: "5m ago" },
  { amount: "$3.8M", coin: "ETH", side: "SELL" as const, exchange: "Coinbase", time: "8m ago" },
  { amount: "$1.5M", coin: "AVAX", side: "BUY" as const, exchange: "OKX", time: "12m ago" },
  { amount: "$2.7M", coin: "BNB", side: "BUY" as const, exchange: "Binance", time: "18m ago" },
];

export const WhaleActivityBoard = () => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
    <span className="text-[10px] font-black tracking-widest uppercase text-blue-400">Whale Activity</span>
    <div className="mt-2 space-y-1">
      {whaleTransactions.map((w, i) => {
        const isBuy = w.side === "BUY";
        return (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${isBuy ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="text-[9px] font-bold text-white">{w.amount}</span>
            <span className="text-[9px] text-white/70">{w.coin}</span>
            <span className={`text-[8px] font-bold ${isBuy ? "text-emerald-400" : "text-red-400"}`}>{w.side}</span>
            <span className="text-[8px] text-white/30 flex-1">({w.exchange})</span>
            <span className="text-[8px] text-white/20">{w.time}</span>
          </div>
        );
      })}
    </div>
    <div className="mt-2 pt-1.5 border-t border-white/[0.06] flex items-center justify-between">
      <span className="text-[8px] text-white/30">Net Flow</span>
      <span className="text-[10px] font-bold text-emerald-400">+$6.3M</span>
    </div>
  </div>
);

/* ================================================================
   7. LongShortPanel — Long vs Short dominance
   ================================================================ */
export const LongShortPanel = () => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
    <span className="text-[10px] font-black tracking-widest uppercase text-purple-400">Long vs Short</span>
    <div className="mt-2">
      {/* Visual bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden mb-1.5">
        <div className="bg-emerald-500" style={{ width: "68%" }} />
        <div className="bg-red-500" style={{ width: "32%" }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold text-emerald-400">Long 68%</span>
        <span className="text-[9px] font-bold text-red-400">Short 32%</span>
      </div>
      <div className="mt-1.5 space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[8px] text-white/30">Funding Rate</span>
          <span className="text-[9px] font-mono font-bold text-emerald-400">+0.012%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[8px] text-white/30">OI Change (24h)</span>
          <span className="text-[9px] font-mono font-bold text-emerald-400">+4.2%</span>
        </div>
      </div>
    </div>
  </div>
);

/* ================================================================
   8. LiquidationMap
   ================================================================ */
const liquidationLevels = [
  { direction: "ABOVE" as const, price: "$150.00", liquidity: "$120M" },
  { direction: "ABOVE" as const, price: "$152.50", liquidity: "$85M" },
  { direction: "BELOW" as const, price: "$145.00", liquidity: "$95M" },
  { direction: "BELOW" as const, price: "$142.00", liquidity: "$68M" },
];

export const LiquidationMap = () => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
    <span className="text-[10px] font-black tracking-widest uppercase text-rose-400">Liquidation Map</span>
    <div className="mt-2 space-y-1">
      {liquidationLevels.map((l, i) => {
        const isAbove = l.direction === "ABOVE";
        return (
          <div key={i} className="flex items-center gap-1.5">
            <span className={`text-[9px] ${isAbove ? "text-emerald-400" : "text-red-400"}`}>{isAbove ? "\u25B2" : "\u25BC"}</span>
            <span className="text-[8px] text-white/30">{l.direction}</span>
            <span className="text-[9px] font-mono font-bold text-white">{l.price}</span>
            <span className="text-[8px] text-white/40 flex-1 text-right">{l.liquidity} liq</span>
          </div>
        );
      })}
    </div>
    <div className="mt-1.5 pt-1.5 border-t border-white/[0.06] flex items-center justify-between">
      <span className="text-[8px] text-white/30">Magnet</span>
      <span className="text-[9px] font-bold text-yellow-400">$150.00 &#x2B06;&#xFE0F;</span>
    </div>
  </div>
);

/* ================================================================
   9. AIGlobalBias
   ================================================================ */
const biasData = [
  { coin: "BTC", bias: "Bullish", pct: 78 },
  { coin: "ETH", bias: "Neutral", pct: 52 },
  { coin: "SOL", bias: "Strong Bull", pct: 84 },
  { coin: "AVAX", bias: "Bullish", pct: 71 },
];

export const AIGlobalBias = () => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
    <span className="text-[10px] font-black tracking-widest uppercase text-sky-400">AI Global Bias</span>
    <div className="mt-2 space-y-1.5">
      {biasData.map((b) => {
        const barColor = b.pct >= 75 ? "bg-emerald-500" : b.pct >= 55 ? "bg-emerald-500/60" : "bg-yellow-500";
        const textColor = b.pct >= 75 ? "text-emerald-400" : b.pct >= 55 ? "text-emerald-400/70" : "text-yellow-400";
        return (
          <div key={b.coin}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9px] font-bold text-white">{b.coin}</span>
              <span className={`text-[8px] font-bold ${textColor}`}>{b.bias} ({b.pct}%)</span>
            </div>
            <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${b.pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
    <div className="mt-2 pt-1.5 border-t border-white/[0.06] flex items-center justify-between">
      <span className="text-[8px] text-white/30">Market Mode</span>
      <span className="text-[10px] font-bold text-emerald-400">Risk-On</span>
    </div>
  </div>
);

/* ================================================================
   10. KeyLevelsDashboard — Bottom strip
   ================================================================ */
const keyLevels = [
  { coin: "BTC", support: "$66,400", resistance: "$68,900" },
  { coin: "ETH", support: "$3,420", resistance: "$3,620" },
  { coin: "SOL", support: "$145.20", resistance: "$152.80" },
];

export const KeyLevelsDashboard = () => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 flex items-center gap-4">
    <span className="text-[10px] font-black tracking-widest uppercase text-teal-400">Key Levels</span>
    <div className="flex items-center gap-4 flex-1">
      {keyLevels.map((k) => (
        <div key={k.coin} className="flex items-center gap-2">
          <span className="text-[9px] font-bold text-white">{k.coin}</span>
          <span className="text-[8px] text-emerald-400">S: {k.support}</span>
          <span className="text-[8px] text-red-400">R: {k.resistance}</span>
        </div>
      ))}
    </div>
  </div>
);

/* ================================================================
   11. NarrativeEngine — Bottom strip
   ================================================================ */
const narratives = [
  "ETF inflow trending up",
  "Fed dovish tilt \u2192 risk-on",
  "SOL ecosystem surging",
  "AI token narrative growing",
  "BTC halving impact fading",
];

export const NarrativeEngine = () => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 flex items-center gap-2">
    <span className="text-[10px] font-black tracking-widest uppercase text-pink-400">Narratives</span>
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
