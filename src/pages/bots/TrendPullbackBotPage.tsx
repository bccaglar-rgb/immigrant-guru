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
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>
    {children}
  </div>
);

/* ── Trust bar stats ── */
const TRUST_STATS = [
  { label: "Win Rate", value: "58%", color: "#2bc48a" },
  { label: "Avg RR", value: "1:1.8", color: "#5B8DEF" },
  { label: "Max DD", value: "-6.5%", color: "#f6465d" },
  { label: "Trades", value: "167", color: "#fff" },
  { label: "Performance", value: "+12.4%", color: "#2bc48a" },
];

/* ── Bot thinking conditions ── */
const CONDITIONS = [
  { label: "EMA20 > EMA50", met: true, detail: "94,200 > 93,800" },
  { label: "ADX > 25", met: true, detail: "32.4" },
  { label: "RSI in pullback zone (35-50)", met: false, detail: "Currently 44" },
  { label: "Price near EMA20", met: true, detail: "0.3% away" },
  { label: "Volume above avg", met: true, detail: "1.2x avg" },
];

/* ── Strategy logic conditions ── */
const ENTRY_LONG = [
  { rule: "EMA20 > EMA50 (uptrend)", met: true },
  { rule: "Price pulls back to EMA20", met: true },
  { rule: "RSI enters 35-50 zone", met: false },
  { rule: "ADX > 25", met: true },
];
const ENTRY_SHORT = [
  { rule: "EMA20 < EMA50 (downtrend)", met: false },
  { rule: "Price pulls back to EMA20", met: false },
  { rule: "RSI enters 50-65 zone", met: false },
  { rule: "ADX > 25", met: true },
];

/* ── Default setup state ── */
const DEFAULT_SETUP = {
  pair: "BTCUSDT",
  tf: "15m",
  ema20: 20,
  ema50: 50,
  rsiPullbackLow: 35,
  rsiPullbackHigh: 50,
  adxThreshold: 25,
  volumeThreshold: 1.0,
  size: 0.03,
  leverage: 5,
  tp: 1.8,
  sl: 0.6,
  maxTrades: 4,
  cooldown: 3,
  riskProfile: "moderate" as "conservative" | "moderate" | "aggressive",
};

export default function TrendPullbackBotPage() {
  const [setup, setSetup] = useState(DEFAULT_SETUP);
  const accent = "#F5C542";

  return (
    <BotProvider>
    <div className="mx-auto max-w-[1400px] space-y-4 p-4">
      {/* ── 1. Exchange Bar ── */}
      <BotExchangeBar botName="Trend Pullback Engine" accentColor={accent} />

      {/* ── 2. Trust Bar ── */}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        {TRUST_STATS.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-white/30">{s.label}</span>
            <span className="text-sm font-bold" style={{ color: s.color }}>
              {s.value}
            </span>
          </div>
        ))}
      </Card>

      {/* ── 3. Chart + Bot Thinking ── */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        {/* Chart */}
        <Card className="overflow-hidden !p-0">
          <BotStrategyChart defaultPair="BTCUSDT" defaultTf="15m" accentColor={accent} />
        </Card>

        {/* Bot Thinking */}
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
              Waiting for RSI pullback to 35-50 zone
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-white/30">Confidence</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full"
                  style={{ width: "68%", background: accent }}
                />
              </div>
              <span className="text-[12px] font-bold" style={{ color: accent }}>
                68%
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 4. Backtest ── */}
      <BotBacktestPanel strategyName="EMA Pullback" accentColor={accent} />

      {/* ── 5. Setup + Risk ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Setup form */}
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold text-white/90">Bot Setup</h3>
          <div className="grid grid-cols-2 gap-3">
            {/* Exchange */}
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                Exchange Account
              </span>
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
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                EMA20 Period
              </span>
              <input
                type="number"
                value={setup.ema20}
                onChange={(e) => setSetup({ ...setup, ema20: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                EMA50 Period
              </span>
              <input
                type="number"
                value={setup.ema50}
                onChange={(e) => setSetup({ ...setup, ema50: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                RSI Pullback Low
              </span>
              <input
                type="number"
                value={setup.rsiPullbackLow}
                onChange={(e) => setSetup({ ...setup, rsiPullbackLow: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                RSI Pullback High
              </span>
              <input
                type="number"
                value={setup.rsiPullbackHigh}
                onChange={(e) => setSetup({ ...setup, rsiPullbackHigh: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                ADX Threshold
              </span>
              <input
                type="number"
                value={setup.adxThreshold}
                onChange={(e) => setSetup({ ...setup, adxThreshold: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                Volume Threshold
              </span>
              <input
                type="number"
                step="0.1"
                value={setup.volumeThreshold}
                onChange={(e) => setSetup({ ...setup, volumeThreshold: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                Size (BTC)
              </span>
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
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                Max Trades
              </span>
              <input
                type="number"
                value={setup.maxTrades}
                onChange={(e) => setSetup({ ...setup, maxTrades: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                Cooldown (min)
              </span>
              <input
                type="number"
                value={setup.cooldown}
                onChange={(e) => setSetup({ ...setup, cooldown: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                Risk Profile
              </span>
              <select
                value={setup.riskProfile}
                onChange={(e) =>
                  setSetup({
                    ...setup,
                    riskProfile: e.target.value as typeof setup.riskProfile,
                  })
                }
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                <option value="conservative">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </label>
          </div>
        </Card>

        {/* Risk panel */}
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold text-white/90">Risk Management</h3>
          <div className="space-y-3">
            {[
              { label: "Risk per Trade", value: `${fmt(setup.sl)}%`, color: "#F5C542" },
              { label: "Max Open Positions", value: String(setup.maxTrades), color: "#fff" },
              {
                label: "Worst Case (all SL hit)",
                value: `${fmt(setup.sl * setup.maxTrades)}%`,
                color: "#f6465d",
              },
              { label: "Position Size", value: `${fmt(setup.size, 4)} BTC`, color: "#fff" },
              { label: "Notional Value", value: `$${fmt(setup.size * 94200 * setup.leverage, 0)}`, color: "#5B8DEF" },
            ].map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5"
              >
                <span className="text-[11px] text-white/50">{r.label}</span>
                <span className="text-[13px] font-semibold" style={{ color: r.color }}>
                  {r.value}
                </span>
              </div>
            ))}

            {/* Market condition */}
            <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/30">Market Condition</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="rounded-md bg-[#2bc48a]/15 px-2 py-0.5 text-[11px] font-semibold text-[#2bc48a]">
                  TREND OK
                </span>
                <span className="text-[11px] text-white/40">
                  Pullback depth: <span className="font-medium text-white/70">0.3% to EMA20</span>
                </span>
              </div>
            </div>

            {/* RSI gauge */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/30">RSI Position</p>
              <div className="mt-2">
                <div className="relative h-2 w-full rounded-full bg-white/[0.06]">
                  {/* Pullback zone highlight */}
                  <div
                    className="absolute h-full rounded-full opacity-20"
                    style={{
                      left: `${setup.rsiPullbackLow}%`,
                      width: `${setup.rsiPullbackHigh - setup.rsiPullbackLow}%`,
                      background: accent,
                    }}
                  />
                  {/* Current RSI marker */}
                  <div
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                    style={{ left: "44%", background: accent }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-white/25">
                  <span>0</span>
                  <span>RSI 44</span>
                  <span>100</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 6. Strategy Logic ── */}
      <Card>
        <h3 className="mb-4 text-[13px] font-semibold text-white/90">Strategy Logic</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Entry Long */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-semibold text-[#2bc48a]">Entry Long (Pullback Buy)</p>
            <div className="space-y-1.5">
              {ENTRY_LONG.map((c) => (
                <div key={c.rule} className="flex items-center gap-2 text-[11px]">
                  <span>{c.met ? "\u2705" : "\u274C"}</span>
                  <span className={c.met ? "text-white/70" : "text-white/40"}>{c.rule}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Entry Short */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-semibold text-[#f6465d]">
              Entry Short (Pullback Sell)
            </p>
            <div className="space-y-1.5">
              {ENTRY_SHORT.map((c) => (
                <div key={c.rule} className="flex items-center gap-2 text-[11px]">
                  <span>{c.met ? "\u2705" : "\u274C"}</span>
                  <span className={c.met ? "text-white/70" : "text-white/40"}>{c.rule}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Exit */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-semibold text-[#5B8DEF]">Exit Logic</p>
            <div className="space-y-1.5 text-[11px] text-white/60">
              <p>TP: 2x ATR from entry</p>
              <p>SL: Below EMA50</p>
              <p>Trailing: ATR-based</p>
            </div>
          </div>
        </div>
      </Card>

      {/* ── 7. Bot State + Log ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Bot State */}
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold text-white/90">Bot State</h3>
          <div className="space-y-3">
            {[
              {
                label: "Status",
                render: (
                  <span className="rounded-md bg-[#F5C542]/15 px-2 py-0.5 text-[11px] font-bold text-[#F5C542]">
                    SCANNING
                  </span>
                ),
              },
              {
                label: "Last Trade",
                render: (
                  <span className="text-[12px] text-white/60">
                    LONG BTC @ 93,950 &middot; +1.2%
                  </span>
                ),
              },
              {
                label: "Current Position",
                render: <span className="text-[12px] text-white/40">None</span>,
              },
              {
                label: "Next Action",
                render: (
                  <span className="text-[12px] text-white/60">
                    Waiting for RSI to enter pullback zone
                  </span>
                ),
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5"
              >
                <span className="text-[11px] text-white/40">{row.label}</span>
                {row.render}
              </div>
            ))}
          </div>
        </Card>

        {/* Execution Log */}
        <BotExecutionLog accentColor={accent} />
      </div>
    </div>
    </BotProvider>
  );
}
