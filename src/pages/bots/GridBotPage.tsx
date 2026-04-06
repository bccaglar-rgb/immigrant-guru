import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import BotExecutionLog from "../../components/bot/BotExecutionLog";

/* ── Helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => "$" + fmt(n);

/* ── Types ── */
type GridSide = "BUY" | "SELL";
type GridStatus = "Filled" | "Pending" | "Waiting";
type GridMode = "neutral" | "long" | "short";
type Spacing = "arithmetic" | "geometric";

interface GridLevel {
  price: number;
  side: GridSide;
  status: GridStatus;
  size: number;
  profit: number | null;
}

/* ── Mock Data ── */
const CURRENT_PRICE = 94_800;

const GRID_LEVELS: GridLevel[] = [
  { price: 97_000, side: "SELL", status: "Waiting",  size: 0.0105, profit: null },
  { price: 96_500, side: "SELL", status: "Pending",  size: 0.0105, profit: null },
  { price: 96_000, side: "SELL", status: "Pending",  size: 0.0105, profit: null },
  { price: 95_500, side: "SELL", status: "Filled",   size: 0.0105, profit: 18.60 },
  { price: 95_000, side: "SELL", status: "Filled",   size: 0.0105, profit: 12.40 },
  { price: 94_500, side: "BUY",  status: "Filled",   size: 0.0105, profit: 9.80 },
  { price: 94_000, side: "BUY",  status: "Filled",   size: 0.0105, profit: 15.20 },
  { price: 93_500, side: "BUY",  status: "Pending",  size: 0.0105, profit: null },
  { price: 93_000, side: "BUY",  status: "Pending",  size: 0.0105, profit: null },
  { price: 92_500, side: "BUY",  status: "Waiting",  size: 0.0105, profit: null },
];

const PROFIT_HISTORY = [
  { period: "12:00", fills: 2, profit: 22.40 },
  { period: "13:00", fills: 3, profit: 34.10 },
  { period: "14:00", fills: 1, profit: 12.40 },
  { period: "15:00", fills: 4, profit: 48.30 },
  { period: "16:00", fills: 2, profit: 21.80 },
  { period: "17:00", fills: 1, profit: 17.40 },
];

/* ── Sub-components ── */
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>{children}</div>
);

const StatBox = ({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) => (
  <div className="rounded-lg border border-white/[0.06] bg-[#0F1012] p-3 text-center">
    <p className="text-[9px] uppercase tracking-wider text-white/30">{label}</p>
    <p className={cn("mt-1 text-[15px] font-bold", color)}>{value}</p>
    {sub && <p className="mt-0.5 text-[9px] text-white/30">{sub}</p>}
  </div>
);

const StatusBadge = ({ status }: { status: GridStatus }) => {
  const c = status === "Filled"
    ? "bg-[#2bc48a]/10 border-[#2bc48a]/30 text-[#2bc48a]"
    : status === "Pending"
    ? "bg-[#F5C542]/10 border-[#F5C542]/30 text-[#F5C542]"
    : "bg-white/5 border-white/10 text-white/30";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase", c)}>
      {status === "Filled" && <span className="text-[8px]">&#10003;</span>}
      {status}
    </span>
  );
};

/* ── Grid Visual Row ── */
const GridRow = ({ level, maxPrice, minPrice }: { level: GridLevel; maxPrice: number; minPrice: number }) => {
  const range = maxPrice - minPrice;
  const fillPct = range > 0 ? ((level.price - minPrice) / range) * 100 : 50;
  const barColor = level.status === "Filled"
    ? level.side === "SELL" ? "#f6465d" : "#2bc48a"
    : level.side === "SELL" ? "#f6465d33" : "#2bc48a33";

  return (
    <div className="flex items-center gap-2 py-1">
      <span className={cn("w-10 text-[10px] font-bold", level.side === "SELL" ? "text-[#f6465d]" : "text-[#2bc48a]")}>{level.side}</span>
      <span className="w-[72px] text-right font-mono text-[11px] text-white/70">{fmtUsd(level.price)}</span>
      <div className="flex-1 h-4 rounded bg-white/[0.03] overflow-hidden relative">
        <div className="h-full rounded" style={{ width: `${fillPct}%`, background: barColor }} />
        {level.status === "Filled" && (
          <div className="absolute inset-0 h-full rounded" style={{ width: `${fillPct}%`, background: barColor.replace("33", ""), opacity: 0.9 }} />
        )}
      </div>
      <div className="w-16"><StatusBadge status={level.status} /></div>
      <span className="w-16 text-right font-mono text-[10px]">
        {level.profit !== null
          ? <span className="text-[#2bc48a]">+{fmtUsd(level.profit)}</span>
          : <span className="text-white/20">---</span>}
      </span>
    </div>
  );
};

/* ── Main Page ── */
export default function GridBotPage() {
  const [botStatus, setBotStatus] = useState<"RUNNING" | "PAUSED" | "STOPPED">("RUNNING");
  const [gridMode, setGridMode] = useState<GridMode>("neutral");
  const [spacing, setSpacing] = useState<Spacing>("arithmetic");
  const [priceLow, setPriceLow] = useState(92_000);
  const [priceHigh, setPriceHigh] = useState(97_500);
  const [gridCount, setGridCount] = useState(20);
  const [investment, setInvestment] = useState(2_000);

  const filledBuy = GRID_LEVELS.filter(l => l.side === "BUY" && l.status === "Filled").length;
  const filledSell = GRID_LEVELS.filter(l => l.side === "SELL" && l.status === "Filled").length;
  const gridProfit = GRID_LEVELS.reduce((s, l) => s + (l.profit ?? 0), 0);
  const maxPrice = Math.max(...GRID_LEVELS.map(l => l.price));
  const minPrice = Math.min(...GRID_LEVELS.map(l => l.price));
  const inRange = CURRENT_PRICE >= minPrice && CURRENT_PRICE <= maxPrice;
  const gridSpacing = GRID_LEVELS.length > 1 ? GRID_LEVELS[0].price - GRID_LEVELS[1].price : 500;
  const perGrid = investment / gridCount;
  const maxProfitBar = Math.max(...PROFIT_HISTORY.map(p => p.profit));

  const I = "mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-sm text-white outline-none";
  const L = "text-[11px] text-white/40";

  return (
    <div className="flex h-full flex-col overflow-auto bg-[#0B0B0C] text-white">
      <div className="shrink-0 p-4 pb-0">
        <BotExchangeBar botName="Grid Trading Engine" accentColor="#9f8bff" />
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* ── 1. GRID OVERVIEW ── */}
        <Card className="border-[#9f8bff]/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-bold">Grid Overview</h2>
              <span className="rounded-full bg-[#9f8bff]/10 border border-[#9f8bff]/30 px-2 py-0.5 text-[10px] font-bold text-[#9f8bff]">
                {GRID_LEVELS.length} levels
              </span>
              <span className="rounded-full bg-[#2bc48a]/10 border border-[#2bc48a]/30 px-2 py-0.5 text-[10px] font-bold text-[#2bc48a]">
                {filledBuy + filledSell} filled
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/30">Spacing: {fmtUsd(gridSpacing)}</span>
              <span className={cn("h-2 w-2 rounded-full", botStatus === "RUNNING" ? "bg-[#2bc48a] animate-pulse" : "bg-white/20")} />
              <span className="text-[10px] font-semibold text-white/50">{botStatus}</span>
            </div>
          </div>

          {/* Sell levels (high to low) */}
          <div className="space-y-0">
            {GRID_LEVELS.filter(l => l.side === "SELL").map((l, i) => (
              <GridRow key={i} level={l} maxPrice={maxPrice} minPrice={minPrice} />
            ))}
          </div>

          {/* Current price marker */}
          <div className="my-2 flex items-center gap-2">
            <div className="flex-1 border-t border-dashed border-[#9f8bff]/50" />
            <span className="rounded-md bg-[#9f8bff]/20 border border-[#9f8bff]/40 px-3 py-1 text-[12px] font-bold text-[#9f8bff] font-mono">
              PRICE {fmtUsd(CURRENT_PRICE)}
            </span>
            <div className="flex-1 border-t border-dashed border-[#9f8bff]/50" />
          </div>

          {/* Buy levels (high to low) */}
          <div className="space-y-0">
            {GRID_LEVELS.filter(l => l.side === "BUY").map((l, i) => (
              <GridRow key={i} level={l} maxPrice={maxPrice} minPrice={minPrice} />
            ))}
          </div>
        </Card>

        {/* ── 2. GRID STATS ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          <StatBox label="Active Levels" value={String(GRID_LEVELS.length)} color="text-[#9f8bff]" />
          <StatBox label="Filled B/S" value={`${filledBuy}/${filledSell}`} color="text-white" />
          <StatBox label="Grid Profit" value={`+${fmtUsd(gridProfit)}`} color="text-[#2bc48a]" />
          <StatBox label="Est. Daily" value="+$89.20" color="text-[#2bc48a]" sub="projected" />
          <StatBox label="Grid Width" value={`${(minPrice / 1000).toFixed(0)}k-${(maxPrice / 1000).toFixed(0)}k`} color="text-white/70" />
          <StatBox label="Spacing" value={fmtUsd(gridSpacing)} color="text-white/70" />
          <StatBox label="Investment" value={fmtUsd(investment)} color="text-[#5B8DEF]" />
          <StatBox label="Per Grid" value={fmtUsd(perGrid)} color="text-white/70" />
        </div>

        {/* ── 3. GRID SETUP + PROFIT CHART ── */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Left: Grid Setup */}
          <Card>
            <h3 className="text-[13px] font-bold mb-3">Grid Configuration</h3>
            <div className="space-y-3">
              <div>
                <label className={L}>Trading Pair</label>
                <select className={I}><option>BTC / USDT</option><option>ETH / USDT</option><option>SOL / USDT</option></select>
              </div>
              <div>
                <label className={L}>Grid Mode</label>
                <div className="mt-1 flex gap-1">
                  {(["neutral", "long", "short"] as const).map(m => (
                    <button key={m} onClick={() => setGridMode(m)}
                      className={cn("flex-1 rounded-lg border py-2 text-[11px] font-semibold capitalize transition",
                        gridMode === m ? "border-[#9f8bff]/40 bg-[#9f8bff]/10 text-[#9f8bff]" : "border-white/10 text-white/40")}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>Price Low</label>
                  <input type="number" value={priceLow} onChange={e => setPriceLow(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>Price High</label>
                  <input type="number" value={priceHigh} onChange={e => setPriceHigh(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>Grid Count (2-100)</label>
                  <input type="number" min={2} max={100} value={gridCount} onChange={e => setGridCount(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>Investment ($)</label>
                  <input type="number" value={investment} onChange={e => setInvestment(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div>
                <label className={L}>Spacing Type</label>
                <div className="mt-1 flex gap-1">
                  {(["arithmetic", "geometric"] as const).map(s => (
                    <button key={s} onClick={() => setSpacing(s)}
                      className={cn("flex-1 rounded-lg border py-2 text-[11px] font-semibold capitalize transition",
                        spacing === s ? "border-[#9f8bff]/40 bg-[#9f8bff]/10 text-[#9f8bff]" : "border-white/10 text-white/40")}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {/* Live preview of calculated levels */}
              <div className="rounded-lg border border-white/[0.06] bg-[#0F1012] p-3">
                <p className="text-[9px] uppercase tracking-wider text-white/30 mb-2">Calculated Grid Preview</p>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/40">Range</span>
                  <span className="font-mono text-white/60">{fmtUsd(priceLow)} - {fmtUsd(priceHigh)}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/40">Spacing</span>
                  <span className="font-mono text-white/60">{fmtUsd((priceHigh - priceLow) / gridCount)}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/40">Per Grid</span>
                  <span className="font-mono text-white/60">{fmtUsd(investment / gridCount)}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/40">Est. Profit/Grid</span>
                  <span className="font-mono text-[#2bc48a]">~{fmtUsd(((priceHigh - priceLow) / gridCount / CURRENT_PRICE) * (investment / gridCount))}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Right: Profit Visualization */}
          <Card>
            <h3 className="text-[13px] font-bold mb-3">Grid Profit Timeline</h3>
            <div className="space-y-2">
              {PROFIT_HISTORY.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-12 text-[10px] font-mono text-white/40">{p.period}</span>
                  <div className="flex-1 h-5 rounded bg-white/[0.03] overflow-hidden">
                    <div className="h-full rounded bg-[#9f8bff]/60" style={{ width: `${(p.profit / maxProfitBar) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right text-[10px] font-mono text-[#2bc48a]">+{fmt(p.profit)}</span>
                  <span className="w-8 text-right text-[9px] text-white/30">{p.fills}f</span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <StatBox label="Total Fills" value={String(PROFIT_HISTORY.reduce((s, p) => s + p.fills, 0))} color="text-[#9f8bff]" sub="today" />
              <StatBox label="Avg Profit/Fill" value={fmtUsd(gridProfit / Math.max(1, filledBuy + filledSell))} color="text-[#2bc48a]" />
              <StatBox label="Grid Efficiency" value={`${Math.round(((filledBuy + filledSell) / GRID_LEVELS.length) * 100)}%`} color="text-[#F5C542]" sub="filled / total" />
              <StatBox label="ROI (24h)" value="+2.8%" color="text-[#2bc48a]" sub="annualized ~1,022%" />
            </div>
          </Card>
        </div>

        {/* ── 4. GRID MANAGEMENT ── */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-bold">Active Orders</h3>
            <div className="flex items-center gap-1.5">
              <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold border",
                inRange ? "bg-[#2bc48a]/10 border-[#2bc48a]/30 text-[#2bc48a]" : "bg-[#f6465d]/10 border-[#f6465d]/30 text-[#f6465d]")}>
                {inRange ? "Healthy" : "Price out of range"}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead><tr className="border-b border-white/[0.04]">
                {["Level", "Side", "Price", "Size", "Status", "Profit"].map(h => (
                  <th key={h} className="px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-white/30">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {GRID_LEVELS.map((l, i) => (
                  <tr key={i} className="border-b border-white/[0.03]">
                    <td className="px-2 py-1.5 text-[11px] font-mono text-white/50">#{i + 1}</td>
                    <td className={cn("px-2 py-1.5 text-[11px] font-bold", l.side === "BUY" ? "text-[#2bc48a]" : "text-[#f6465d]")}>{l.side}</td>
                    <td className="px-2 py-1.5 text-[11px] font-mono text-white/70">{fmtUsd(l.price)}</td>
                    <td className="px-2 py-1.5 text-[11px] font-mono text-white/50">{l.size.toFixed(4)}</td>
                    <td className="px-2 py-1.5"><StatusBadge status={l.status} /></td>
                    <td className="px-2 py-1.5 text-[11px] font-mono">
                      {l.profit !== null
                        ? <span className="text-[#2bc48a]">+{fmtUsd(l.profit)}</span>
                        : <span className="text-white/20">---</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setBotStatus(s => s === "RUNNING" ? "PAUSED" : "RUNNING")}
              className={cn("flex-1 rounded-lg py-2.5 text-[12px] font-bold transition",
                botStatus === "RUNNING" ? "bg-[#F5C542] text-black hover:bg-[#e0b23a]" : "bg-[#9f8bff] text-white hover:bg-[#8a76e8]")}>
              {botStatus === "RUNNING" ? "Pause Grid" : "Start Grid"}
            </button>
            <button className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[11px] font-semibold text-white/60">Reset</button>
            <button className="rounded-lg border border-[#f6465d]/30 bg-[#f6465d]/10 px-4 py-2.5 text-[11px] font-semibold text-[#f6465d]">Close All</button>
            <button className="rounded-lg border border-[#5B8DEF]/30 bg-[#5B8DEF]/10 px-4 py-2.5 text-[11px] font-semibold text-[#5B8DEF]">Rebalance</button>
          </div>
        </Card>

        {/* ── 5. BOT THINKING + RISK ── */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Bot Thinking */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[13px] font-bold">Bot Thinking</h3>
              <span className="ml-auto h-2 w-2 rounded-full bg-[#2bc48a] animate-pulse" />
            </div>
            <div className="space-y-2">
              {[
                { label: "Price in grid range", value: inRange ? `Yes (${fmtUsd(CURRENT_PRICE)})` : `No (${fmtUsd(CURRENT_PRICE)})`, met: inRange },
                { label: "Market condition", value: "Ranging (ideal)", met: true },
                { label: "ADX < 25", value: "ADX 18 (confirmed ranging)", met: true },
                { label: "Spread acceptable", value: "3 bps (< 5 bps limit)", met: true },
                { label: "Volume sufficient", value: "$2.4M / 24h", met: true },
                { label: "Grid utilization", value: `${filledBuy + filledSell}/${GRID_LEVELS.length} levels active`, met: (filledBuy + filledSell) > 0 },
              ].map((c, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-[#0F1012] px-3 py-2">
                  <span className={c.met ? "text-[#2bc48a]" : "text-[#f6465d]"}>{c.met ? "\u2713" : "\u2717"}</span>
                  <span className="text-[11px] text-white/60">{c.label}</span>
                  <span className="ml-auto text-[11px] font-mono text-white/40">{c.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-[#0F1012] p-3 text-center">
              <p className="text-[9px] uppercase tracking-wider text-white/30">Next Action</p>
              <p className="mt-1 text-[13px] font-bold text-[#9f8bff]">Buy order at $94,000 pending fill</p>
            </div>
          </Card>

          {/* Risk Panel */}
          <Card>
            <h3 className="text-[13px] font-bold mb-3">Risk Assessment</h3>
            <div className="space-y-2">
              {[
                { label: "Max Investment at Risk", value: fmtUsd(investment), severity: "low" as const },
                { label: "Price Out of Range Risk", value: inRange ? "Low" : "HIGH", severity: inRange ? "low" as const : "high" as const },
                { label: "Impermanent Loss Est.", value: "-$12.80 (0.64%)", severity: "low" as const },
                { label: "Grid Efficiency", value: `${Math.round(((filledBuy + filledSell) / GRID_LEVELS.length) * 100)}%`, severity: "low" as const },
                { label: "Unrealized Inventory", value: `${filledBuy} BUY / ${filledSell} SELL`, severity: "medium" as const },
                { label: "Max Single Loss", value: fmtUsd(perGrid * 0.05), severity: "low" as const },
              ].map((r, i) => {
                const c = r.severity === "high" ? "border-[#f6465d]/20 text-[#f6465d]" : r.severity === "medium" ? "border-[#F5C542]/20 text-[#F5C542]" : "border-[#2bc48a]/20 text-[#2bc48a]";
                return (
                  <div key={i} className={cn("flex items-center justify-between rounded-lg border bg-[#0F1012] px-3 py-2.5", c.split(" ")[0])}>
                    <span className="text-[11px] text-white/60">{r.label}</span>
                    <span className={cn("text-[11px] font-mono font-semibold", c.split(" ").slice(1).join(" "))}>{r.value}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 rounded-lg border border-[#2bc48a]/20 bg-[#2bc48a]/5 p-2.5 text-center">
              <p className="text-[10px] text-white/40">Overall Risk</p>
              <p className="text-[14px] font-bold text-[#2bc48a]">LOW - Grid Operating Normally</p>
            </div>
          </Card>
        </div>

        {/* ── 6. EXECUTION LOG ── */}
        <BotExecutionLog accentColor="#9f8bff" />
      </div>
    </div>
  );
}
