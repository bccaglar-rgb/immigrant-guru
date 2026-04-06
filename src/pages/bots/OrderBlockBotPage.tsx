import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";
import BotStrategyChart from "../../components/bot/BotStrategyChart";
import BotBacktestPanel from "../../components/bot/BotBacktestPanel";

/* ── Shared helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => "$" + fmt(n);
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>
    {children}
  </div>
);

/* ── Trust bar stats ── */
const TRUST_STATS = [
  { label: "Win Rate", value: "53%", color: "#2bc48a" },
  { label: "Avg RR", value: "1:2.2", color: "#5B8DEF" },
  { label: "Max DD", value: "-7.8%", color: "#f6465d" },
  { label: "Trades", value: "84", color: "#fff" },
  { label: "Performance", value: "+10.6%", color: "#2bc48a" },
];

/* ── Bot thinking conditions ── */
const CONDITIONS = [
  { label: "Order Block identified", met: true, detail: "Demand OB at 92,800-93,100" },
  { label: "FVG present", met: true, detail: "Gap at 93,800-93,950" },
  { label: "Price in OB zone", met: false, detail: "1.2% away from demand OB" },
  { label: "Volume spike at OB", met: false, detail: "Waiting for entry" },
  { label: "Trend alignment", met: true, detail: "HTF bullish bias" },
];

/* ── Order block zones ── */
const OB_ZONES = [
  {
    type: "supply" as const,
    priceHigh: 95500,
    priceLow: 95200,
    candles: 3,
    age: "6h",
    tested: false,
    strength: 78,
  },
  {
    type: "supply" as const,
    priceHigh: 96800,
    priceLow: 96400,
    candles: 4,
    age: "1d",
    tested: true,
    strength: 62,
  },
  {
    type: "demand" as const,
    priceHigh: 93100,
    priceLow: 92800,
    candles: 2,
    age: "8h",
    tested: false,
    strength: 85,
  },
  {
    type: "demand" as const,
    priceHigh: 91500,
    priceLow: 91100,
    candles: 5,
    age: "2d",
    tested: true,
    strength: 71,
  },
];

/* ── FVG zones ── */
const FVG_ZONES = [
  { high: 95200, low: 95050, type: "bearish" as const, filled: false },
  { high: 93950, low: 93800, type: "bullish" as const, filled: false },
  { high: 91800, low: 91650, type: "bullish" as const, filled: true },
];

/* ── Strategy logic conditions ── */
const ENTRY_LONG = [
  { rule: "Demand OB identified (unfilled)", met: true },
  { rule: "FVG overlaps or is near OB", met: true },
  { rule: "Price enters demand OB zone", met: false },
  { rule: "Volume spike on entry candle", met: false },
];
const ENTRY_SHORT = [
  { rule: "Supply OB identified (unfilled)", met: true },
  { rule: "FVG overlaps or is near OB", met: true },
  { rule: "Price enters supply OB zone", met: false },
  { rule: "Volume spike on entry candle", met: false },
];

/* ── Default setup state ── */
const DEFAULT_SETUP = {
  pair: "BTCUSDT",
  tf: "15m",
  obDetectionPeriod: 100,
  fvgMinGap: 0.1,
  zoneTolerance: 0.2,
  onlyWithTrend: true,
  size: 0.02,
  leverage: 4,
  tp: 2.2,
  sl: 1.0,
  maxTrades: 2,
  cooldown: 15,
  timeExit: 30,
  riskProfile: "moderate" as "conservative" | "moderate" | "aggressive",
};

export default function OrderBlockBotPage() {
  const [setup, setSetup] = useState(DEFAULT_SETUP);
  const accent = "#f4906c";
  const currentPrice = 94800;

  return (
    <BotProvider>
    <div className="mx-auto max-w-[1400px] space-y-4 p-4">
      {/* ── 1. Exchange Bar ── */}
      <BotExchangeBar botName="Order Block Engine" accentColor={accent} />

      {/* ── 2. Trust Bar ── */}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        {TRUST_STATS.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-white/30">{s.label}</span>
            <span className="text-sm font-bold" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </Card>

      {/* ── 3. Chart + Bot Thinking ── */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden !p-0">
          <BotStrategyChart defaultPair="BTCUSDT" defaultTf="15m" accentColor={accent} />
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full animate-pulse"
              style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
            />
            <h3 className="text-[13px] font-semibold text-white/90">Bot Thinking</h3>
          </div>

          <div className="space-y-2.5">
            {CONDITIONS.map((c) => (
              <div key={c.label} className="flex items-start gap-2">
                <span className="mt-0.5 text-sm">{c.met ? "\u2705" : "\u274C"}</span>
                <div className="flex-1">
                  <p className="text-[12px] font-medium text-white/80">{c.label}</p>
                  <p className="text-[11px] text-white/40">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Action</p>
            <p className="mt-1 text-[12px] font-medium text-white/70">
              Price approaching demand OB at $92,800-$93,100
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-white/30">Confidence</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full" style={{ width: "58%", background: accent }} />
              </div>
              <span className="text-[12px] font-bold" style={{ color: accent }}>58%</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 4. ORDER BLOCK MAP (unique) ── */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-white/90">Order Block Map</h3>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-white/40">
              {OB_ZONES.length} OBs detected &middot; {FVG_ZONES.filter((f) => !f.filled).length} open FVGs
            </span>
            <span className="text-[10px] text-white/40">
              Price: <span className="font-mono font-medium text-white/70">{fmtUsd(currentPrice)}</span>
            </span>
          </div>
        </div>

        <div className="relative rounded-lg border border-white/[0.06] bg-[#0a0b0d] p-4 font-mono text-[11px]">
          {/* Supply OBs (above price) */}
          {OB_ZONES.filter((z) => z.type === "supply")
            .sort((a, b) => b.priceHigh - a.priceHigh)
            .map((ob) => (
              <div key={`ob-${ob.priceLow}`} className="mb-2">
                <div className="flex items-center gap-3">
                  <span className="rounded bg-[#f6465d]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#f6465d] w-20 text-center">
                    SUPPLY OB
                  </span>
                  <span className="text-[#f6465d] font-medium w-36">
                    {fmtUsd(ob.priceLow)} - {fmtUsd(ob.priceHigh)}
                  </span>
                  <div className="flex-1 relative h-5">
                    <div
                      className={cn(
                        "absolute inset-0 rounded border",
                        ob.tested
                          ? "bg-[#f6465d]/[0.04] border-[#f6465d]/10 border-dashed"
                          : "bg-[#f6465d]/[0.08] border-[#f6465d]/20"
                      )}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-[#f6465d]/15"
                      style={{ width: `${ob.strength}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white/40">
                      {ob.candles} candle cluster &middot; {ob.age}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 w-24">
                    <div className="h-1 w-10 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-[#f6465d]"
                        style={{ width: `${ob.strength}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-white/40">{ob.strength}%</span>
                  </div>
                  {ob.tested && (
                    <span className="rounded bg-white/[0.05] px-1 py-0.5 text-[8px] text-white/30">TESTED</span>
                  )}
                </div>
              </div>
            ))}

          {/* FVGs above price */}
          {FVG_ZONES.filter((f) => f.low > currentPrice && !f.filled).map((fvg) => (
            <div key={`fvg-${fvg.low}`} className="mb-2 ml-24">
              <div className="flex items-center gap-3">
                <span className="rounded bg-[#5B8DEF]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#5B8DEF]">
                  FVG
                </span>
                <span className="text-[#5B8DEF]/70 w-36">
                  {fmtUsd(fvg.low)} - {fmtUsd(fvg.high)}
                </span>
                <span className="text-[9px] text-white/30">
                  {fvg.type} gap &middot; unfilled
                </span>
              </div>
            </div>
          ))}

          {/* Current price */}
          <div className="flex items-center gap-3 my-3 py-2 rounded-lg bg-white/[0.04] px-2">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            <span className="text-white font-medium">Price: {fmtUsd(currentPrice)}</span>
            <div className="flex-1 border-t border-white/10" />
            <span className="text-[10px] text-white/40">
              1.2% above nearest demand OB
            </span>
          </div>

          {/* FVGs below price */}
          {FVG_ZONES.filter((f) => f.high < currentPrice && !f.filled).map((fvg) => (
            <div key={`fvg-${fvg.low}`} className="mb-2 ml-24">
              <div className="flex items-center gap-3">
                <span className="rounded bg-[#5B8DEF]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#5B8DEF]">
                  FVG
                </span>
                <span className="text-[#5B8DEF]/70 w-36">
                  {fmtUsd(fvg.low)} - {fmtUsd(fvg.high)}
                </span>
                <span className="text-[9px] text-white/30">
                  {fvg.type} gap &middot; unfilled
                </span>
              </div>
            </div>
          ))}

          {/* Demand OBs (below price) */}
          {OB_ZONES.filter((z) => z.type === "demand")
            .sort((a, b) => b.priceHigh - a.priceHigh)
            .map((ob) => (
              <div key={`ob-${ob.priceLow}`} className="mt-2">
                <div className="flex items-center gap-3">
                  <span className="rounded bg-[#2bc48a]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#2bc48a] w-20 text-center">
                    DEMAND OB
                  </span>
                  <span className="text-[#2bc48a] font-medium w-36">
                    {fmtUsd(ob.priceLow)} - {fmtUsd(ob.priceHigh)}
                  </span>
                  <div className="flex-1 relative h-5">
                    <div
                      className={cn(
                        "absolute inset-0 rounded border",
                        ob.tested
                          ? "bg-[#2bc48a]/[0.04] border-[#2bc48a]/10 border-dashed"
                          : "bg-[#2bc48a]/[0.08] border-[#2bc48a]/20"
                      )}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-[#2bc48a]/15"
                      style={{ width: `${ob.strength}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white/40">
                      {ob.candles} candle cluster &middot; {ob.age}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 w-24">
                    <div className="h-1 w-10 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-[#2bc48a]"
                        style={{ width: `${ob.strength}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-white/40">{ob.strength}%</span>
                  </div>
                  {ob.tested && (
                    <span className="rounded bg-white/[0.05] px-1 py-0.5 text-[8px] text-white/30">TESTED</span>
                  )}
                </div>
              </div>
            ))}

          {/* Status */}
          <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3">
            <span className="rounded-md bg-[#f4906c]/15 px-2 py-0.5 text-[10px] font-bold text-[#f4906c]">
              STATUS
            </span>
            <span className="text-[11px] text-white/60">
              Price approaching <span className="font-medium text-[#2bc48a]">DEMAND OB</span> at{" "}
              <span className="text-[#2bc48a]">{fmtUsd(92800)}-{fmtUsd(93100)}</span>
            </span>
            <span className="ml-auto text-[10px] text-white/30">
              FVG confluence at {fmtUsd(93800)}
            </span>
          </div>
        </div>
      </Card>

      {/* ── 5. Backtest ── */}
      <BotBacktestPanel strategyName="Order Block + FVG" accentColor={accent} />

      {/* ── 6. Setup + Risk ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold text-white/90">Bot Setup</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Exchange Account</span>
              <select className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none">
                <option>Auto (from Exchange Bar)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Pair</span>
              <select
                value={setup.pair}
                onChange={(e) => setSetup({ ...setup, pair: e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Timeframe</span>
              <select
                value={setup.tf}
                onChange={(e) => setSetup({ ...setup, tf: e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                {["1m", "5m", "15m", "1h", "4h"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">OB Detection Period</span>
              <input
                type="number"
                value={setup.obDetectionPeriod}
                onChange={(e) => setSetup({ ...setup, obDetectionPeriod: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">FVG Min Gap (%)</span>
              <input
                type="number"
                step="0.05"
                value={setup.fvgMinGap}
                onChange={(e) => setSetup({ ...setup, fvgMinGap: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Zone Tolerance (%)</span>
              <input
                type="number"
                step="0.1"
                value={setup.zoneTolerance}
                onChange={(e) => setSetup({ ...setup, zoneTolerance: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Only With Trend</span>
              <div className="flex items-center gap-2 py-1.5">
                <button
                  onClick={() => setSetup({ ...setup, onlyWithTrend: !setup.onlyWithTrend })}
                  className={cn(
                    "relative h-5 w-9 rounded-full transition",
                    setup.onlyWithTrend ? "bg-[#2bc48a]" : "bg-white/10"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                      setup.onlyWithTrend ? "translate-x-4" : "translate-x-0.5"
                    )}
                  />
                </button>
                <span className="text-[10px] text-white/50">
                  {setup.onlyWithTrend ? "Enabled" : "Disabled"}
                </span>
              </div>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Size (BTC)</span>
              <input
                type="number"
                step="0.001"
                value={setup.size}
                onChange={(e) => setSetup({ ...setup, size: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Leverage</span>
              <input
                type="number"
                value={setup.leverage}
                onChange={(e) => setSetup({ ...setup, leverage: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">TP (%)</span>
              <input
                type="number"
                step="0.1"
                value={setup.tp}
                onChange={(e) => setSetup({ ...setup, tp: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">SL (%)</span>
              <input
                type="number"
                step="0.1"
                value={setup.sl}
                onChange={(e) => setSetup({ ...setup, sl: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Max Trades</span>
              <input
                type="number"
                value={setup.maxTrades}
                onChange={(e) => setSetup({ ...setup, maxTrades: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Risk Profile</span>
              <select
                value={setup.riskProfile}
                onChange={(e) => setSetup({ ...setup, riskProfile: e.target.value as typeof setup.riskProfile })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                <option value="conservative">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </label>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-[13px] font-semibold text-white/90">Risk Management</h3>
          <div className="space-y-3">
            {[
              { label: "Risk per Trade", value: `${fmt(setup.sl)}%`, color: accent },
              { label: "Max Open Positions", value: String(setup.maxTrades), color: "#fff" },
              { label: "Worst Case (all SL hit)", value: `${fmt(setup.sl * setup.maxTrades)}%`, color: "#f6465d" },
              { label: "Position Size", value: `${fmt(setup.size, 4)} BTC`, color: "#fff" },
              { label: "Notional Value", value: fmtUsd(setup.size * currentPrice * setup.leverage), color: "#5B8DEF" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5">
                <span className="text-[11px] text-white/50">{r.label}</span>
                <span className="text-[13px] font-semibold" style={{ color: r.color }}>{r.value}</span>
              </div>
            ))}

            <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/30">Market Condition</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="rounded-md bg-[#5B8DEF]/15 px-2 py-0.5 text-[11px] font-semibold text-[#5B8DEF]">
                  OB + FVG CONFLUENCE
                </span>
                <span className="text-[11px] text-white/40">
                  Demand zone <span className="font-medium text-white/70">92,800-93,100</span> with FVG
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 7. Strategy Logic ── */}
      <Card>
        <h3 className="mb-4 text-[13px] font-semibold text-white/90">Strategy Logic</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-semibold text-[#2bc48a]">Long (Demand OB Entry)</p>
            <div className="space-y-1.5">
              {ENTRY_LONG.map((c) => (
                <div key={c.rule} className="flex items-center gap-2 text-[11px]">
                  <span>{c.met ? "\u2705" : "\u274C"}</span>
                  <span className={c.met ? "text-white/70" : "text-white/40"}>{c.rule}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-semibold text-[#f6465d]">Short (Supply OB Entry)</p>
            <div className="space-y-1.5">
              {ENTRY_SHORT.map((c) => (
                <div key={c.rule} className="flex items-center gap-2 text-[11px]">
                  <span>{c.met ? "\u2705" : "\u274C"}</span>
                  <span className={c.met ? "text-white/70" : "text-white/40"}>{c.rule}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-semibold text-[#5B8DEF]">Exit Logic</p>
            <div className="space-y-1.5 text-[11px] text-white/60">
              <p>TP: Opposite OB zone or FVG fill</p>
              <p>SL: Beyond OB zone + tolerance</p>
              <p>FVG confluence adds +10% TP target</p>
              <p>Trend filter: {setup.onlyWithTrend ? "Active" : "Inactive"}</p>
              <p>Time exit: {setup.timeExit} candles max</p>
            </div>
          </div>
        </div>
      </Card>

      {/* ── 8. Bot State + Log ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold text-white/90">Bot State</h3>
          <div className="space-y-3">
            {[
              {
                label: "Status",
                render: (
                  <span className="rounded-md bg-[#5B8DEF]/15 px-2 py-0.5 text-[11px] font-bold text-[#5B8DEF]">
                    APPROACHING OB
                  </span>
                ),
              },
              {
                label: "Last Trade",
                render: <span className="text-[12px] text-white/60">LONG BTC @ 91,200 &middot; +3.4%</span>,
              },
              {
                label: "Current Position",
                render: <span className="text-[12px] text-white/40">None</span>,
              },
              {
                label: "Target OB",
                render: (
                  <span className="text-[12px] font-medium text-[#2bc48a]">
                    Demand: $92,800-$93,100 (85% strength)
                  </span>
                ),
              },
              {
                label: "FVG Confluence",
                render: <span className="text-[12px] font-medium text-[#5B8DEF]">Bullish FVG at $93,800-$93,950</span>,
              },
              {
                label: "Next Action",
                render: <span className="text-[12px] text-white/60">Enter long when price reaches demand OB zone</span>,
              },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5">
                <span className="text-[11px] text-white/40">{row.label}</span>
                {row.render}
              </div>
            ))}
          </div>
        </Card>

        <BotExecutionLog accentColor={accent} />
      </div>
    </div>
    </BotProvider>
  );
}
