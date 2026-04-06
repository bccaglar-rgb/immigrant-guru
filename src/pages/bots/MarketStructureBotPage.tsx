import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
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
  { label: "Win Rate", value: "54%", color: "#2bc48a" },
  { label: "Avg RR", value: "1:2.0", color: "#5B8DEF" },
  { label: "Max DD", value: "-7.2%", color: "#f6465d" },
  { label: "Trades", value: "96", color: "#fff" },
  { label: "Performance", value: "+11.8%", color: "#2bc48a" },
];

/* ── Bot thinking conditions ── */
const CONDITIONS = [
  { label: "Structure: HH/HL confirmed", met: true, detail: "Uptrend since 92,100" },
  { label: "BOS confirmed", met: true, detail: "Break above 94,800" },
  { label: "Pullback to HL zone", met: false, detail: "2.1% away from 94,200" },
  { label: "Volume on structure break", met: true, detail: "1.6x average" },
  { label: "ATR filter", met: true, detail: "ATR 320 > min 200" },
];

/* ── Swing points for structure map ── */
const SWING_POINTS = [
  { label: "HH", price: 95800, time: "12:45", active: false },
  { label: "HL", price: 95100, time: "11:30", active: false },
  { label: "HH", price: 94800, time: "09:15", active: true },
  { label: "HL", price: 94200, time: "07:00", active: false },
  { label: "HH", price: 93900, time: "04:30", active: false },
  { label: "HL", price: 93500, time: "02:15", active: false },
];

/* ── Strategy logic conditions ── */
const ENTRY_LONG = [
  { rule: "Higher High + Higher Low confirmed", met: true },
  { rule: "Break of Structure upward", met: true },
  { rule: "Pullback to last Higher Low zone", met: false },
  { rule: "Volume confirmation on break", met: true },
];
const ENTRY_SHORT = [
  { rule: "Lower High + Lower Low confirmed", met: false },
  { rule: "Break of Structure downward", met: false },
  { rule: "Pullback to last Lower High zone", met: false },
  { rule: "Volume confirmation on break", met: false },
];

/* ── Default setup state ── */
const DEFAULT_SETUP = {
  pair: "BTCUSDT",
  tf: "15m",
  swingLookback: 20,
  bosConfirmBars: 3,
  pullbackDepth: 50,
  minSwingSize: 0.3,
  size: 0.025,
  leverage: 3,
  tp: 2.0,
  sl: 1.0,
  maxTrades: 2,
  cooldown: 15,
  timeExit: 30,
  riskProfile: "moderate" as "conservative" | "moderate" | "aggressive",
};

export default function MarketStructureBotPage() {
  const [setup, setSetup] = useState(DEFAULT_SETUP);
  const accent = "#f4906c";
  const currentPrice = 94800;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4">
      {/* ── 1. Exchange Bar ── */}
      <BotExchangeBar botName="Market Structure Engine" accentColor={accent} />

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
              BOS confirmed, waiting for pullback to last Higher Low at 94,200
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-white/30">Confidence</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full" style={{ width: "66%", background: accent }} />
              </div>
              <span className="text-[12px] font-bold" style={{ color: accent }}>66%</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 4. STRUCTURE MAP (unique) ── */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-white/90">Structure Map</h3>
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-[#2bc48a]/15 px-2 py-0.5 text-[10px] font-bold text-[#2bc48a]">
              BULLISH STRUCTURE
            </span>
            <span className="text-[10px] text-white/40">
              BOS Level: <span className="font-mono font-medium text-white/70">94,800</span>
            </span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          {/* Visual swing map */}
          <div className="relative rounded-lg border border-white/[0.06] bg-[#0a0b0d] p-4 font-mono text-[11px]">
            <div className="space-y-0">
              {SWING_POINTS.map((pt, i) => {
                const isHigh = pt.label === "HH" || pt.label === "LH";
                const barColor = isHigh ? "#f6465d" : "#2bc48a";
                const maxPrice = Math.max(...SWING_POINTS.map((p) => p.price));
                const minPrice = Math.min(...SWING_POINTS.map((p) => p.price));
                const range = maxPrice - minPrice;
                const pct = range > 0 ? ((pt.price - minPrice) / range) * 100 : 50;

                return (
                  <div key={`${pt.label}-${pt.price}`} className="flex items-center gap-3 py-1.5">
                    <span
                      className={cn(
                        "w-6 text-right text-[10px] font-bold",
                        isHigh ? "text-[#f6465d]" : "text-[#2bc48a]"
                      )}
                    >
                      {pt.label}
                    </span>
                    <span className="w-16 text-right text-white/70">{fmt(pt.price, 0)}</span>
                    <div className="relative flex-1 h-5">
                      <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                        <div className="h-px w-full bg-white/[0.06]" />
                      </div>
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2"
                        style={{
                          left: `${pct}%`,
                          borderColor: barColor,
                          background: pt.active ? barColor : "transparent",
                          boxShadow: pt.active ? `0 0 8px ${barColor}` : "none",
                        }}
                      />
                      {pt.price === currentPrice && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-white"
                          style={{ left: `${pct}%` }}
                        />
                      )}
                    </div>
                    <span className="w-12 text-[10px] text-white/30">{pt.time}</span>
                    {i < SWING_POINTS.length - 1 && (
                      <div className="absolute left-[calc(6.5rem)] w-px bg-white/[0.04]" style={{ height: "12px", top: `${(i + 1) * 32 - 6}px` }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Current price marker */}
            <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
              <span className="text-[11px] text-white/60">
                Current Price: <span className="font-medium text-white">{fmtUsd(currentPrice)}</span>
              </span>
              <span className="text-[10px] text-white/30 ml-auto">
                Pullback Target: <span className="text-[#2bc48a] font-medium">94,200</span>
              </span>
            </div>
          </div>

          {/* Structure summary */}
          <div className="space-y-2.5">
            {[
              { label: "Current Structure", value: "BULLISH (HH/HL)", color: "#2bc48a" },
              { label: "BOS Level", value: fmtUsd(94800), color: accent },
              { label: "Last HH", value: fmtUsd(95800), color: "#f6465d" },
              { label: "Pullback Target (HL)", value: fmtUsd(94200), color: "#2bc48a" },
              { label: "Distance to HL", value: "2.1%", color: "#F5C542" },
              { label: "Swing Count", value: "6 points", color: "#fff" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2"
              >
                <span className="text-[10px] text-white/40">{item.label}</span>
                <span className="text-[12px] font-semibold" style={{ color: item.color }}>
                  {item.value}
                </span>
              </div>
            ))}

            <div className="rounded-lg border border-[#f4906c]/20 bg-[#f4906c]/5 p-3">
              <p className="text-[10px] uppercase tracking-wider text-[#f4906c]/60">Status</p>
              <p className="mt-1 text-[11px] font-medium text-[#f4906c]">
                WAITING FOR PULLBACK TO HL
              </p>
              <p className="mt-0.5 text-[10px] text-white/40">
                Price needs to retrace 2.1% to reach Higher Low zone at 94,200
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* ── 5. Backtest ── */}
      <BotBacktestPanel strategyName="Market Structure" accentColor={accent} />

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
              <span className="text-[10px] uppercase tracking-wider text-white/30">Swing Lookback</span>
              <input
                type="number"
                value={setup.swingLookback}
                onChange={(e) => setSetup({ ...setup, swingLookback: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">BOS Confirm Bars</span>
              <input
                type="number"
                value={setup.bosConfirmBars}
                onChange={(e) => setSetup({ ...setup, bosConfirmBars: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Pullback Depth (%)</span>
              <input
                type="number"
                value={setup.pullbackDepth}
                onChange={(e) => setSetup({ ...setup, pullbackDepth: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Min Swing Size (%)</span>
              <input
                type="number"
                step="0.1"
                value={setup.minSwingSize}
                onChange={(e) => setSetup({ ...setup, minSwingSize: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
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
              <span className="text-[10px] uppercase tracking-wider text-white/30">Cooldown (min)</span>
              <input
                type="number"
                value={setup.cooldown}
                onChange={(e) => setSetup({ ...setup, cooldown: +e.target.value })}
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
                <span className="rounded-md bg-[#2bc48a]/15 px-2 py-0.5 text-[11px] font-semibold text-[#2bc48a]">
                  BULLISH STRUCTURE
                </span>
                <span className="text-[11px] text-white/40">
                  HH/HL pattern confirmed since <span className="font-medium text-white/70">92,100</span>
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
            <p className="mb-2 text-[11px] font-semibold text-[#2bc48a]">Entry Long (Bullish BOS)</p>
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
            <p className="mb-2 text-[11px] font-semibold text-[#f6465d]">Entry Short (Bearish BOS)</p>
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
              <p>TP: Next structure target level</p>
              <p>SL: Below last swing point</p>
              <p>Invalidation: Structure break opposite direction</p>
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
                  <span className="rounded-md bg-[#f4906c]/15 px-2 py-0.5 text-[11px] font-bold text-[#f4906c]">
                    WAITING PULLBACK
                  </span>
                ),
              },
              {
                label: "Last Trade",
                render: <span className="text-[12px] text-white/60">LONG BTC @ 93,500 &middot; +2.8%</span>,
              },
              {
                label: "Current Position",
                render: <span className="text-[12px] text-white/40">None</span>,
              },
              {
                label: "Structure Bias",
                render: <span className="text-[12px] font-medium text-[#2bc48a]">BULLISH (HH/HL)</span>,
              },
              {
                label: "Next Action",
                render: <span className="text-[12px] text-white/60">Enter long on pullback to 94,200 zone</span>,
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
  );
}
