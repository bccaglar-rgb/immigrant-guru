import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";
import BotLivePanel from "../../components/bot/BotLivePanel";
import BotStrategyChart from "../../components/bot/BotStrategyChart";
import BotBacktestPanel from "../../components/bot/BotBacktestPanel";
import SignalsOverview from "../../components/bot/SignalsOverview";

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
  { label: "Win Rate", value: "55%", color: "#2bc48a" },
  { label: "Avg RR", value: "1:2.2", color: "#5B8DEF" },
  { label: "Max DD", value: "-7.8%", color: "#f6465d" },
  { label: "Trades", value: "128", color: "#fff" },
  { label: "Performance", value: "+14.6%", color: "#2bc48a" },
];

/* ── Bot thinking conditions ── */
const CONDITIONS = [
  { label: "Resistance identified", met: true, detail: "95,400" },
  { label: "Price broke above", met: true, detail: "95,620" },
  { label: "Volume spike", met: true, detail: "1.8x avg" },
  { label: "Retest in progress", met: false, detail: "2.4% away" },
  { label: "Confirmation candle", met: false, detail: "Waiting" },
];

/* ── Strategy logic conditions ── */
const ENTRY_LONG = [
  { rule: "Price breaks above resistance", met: true },
  { rule: "Volume > 1.5x avg on break", met: true },
  { rule: "Retest within 2% tolerance", met: false },
  { rule: "Confirmation candle at retest", met: false },
];
const ENTRY_SHORT = [
  { rule: "Price breaks below support", met: false },
  { rule: "Volume > 1.5x avg on break", met: false },
  { rule: "Retest within 2% tolerance", met: false },
  { rule: "Confirmation candle at retest", met: false },
];

/* ── Key levels mock data ── */
const KEY_LEVELS = [
  { level: 95400, type: "Resistance", touches: 4, lastTouch: "2h ago", distance: "+0.2%", strength: 87 },
  { level: 94800, type: "Support", touches: 6, lastTouch: "4h ago", distance: "-0.4%", strength: 92 },
  { level: 96200, type: "Resistance", touches: 2, lastTouch: "12h ago", distance: "+1.1%", strength: 64 },
  { level: 93500, type: "Support", touches: 3, lastTouch: "18h ago", distance: "-1.8%", strength: 71 },
  { level: 97000, type: "Resistance", touches: 5, lastTouch: "1d ago", distance: "+1.9%", strength: 85 },
  { level: 92100, type: "Support", touches: 7, lastTouch: "2d ago", distance: "-3.3%", strength: 95 },
];

/* ── Default setup state ── */
const DEFAULT_SETUP = {
  pair: "BTCUSDT",
  tf: "15m",
  lookbackPeriod: 100,
  volumeMultiplier: 1.5,
  retestTolerance: 2.0,
  breakThreshold: 0.3,
  size: 0.025,
  leverage: 5,
  tp: 2.2,
  sl: 0.8,
  maxTrades: 3,
  cooldown: 10,
  timeExit: 24,
  riskProfile: "moderate" as "conservative" | "moderate" | "aggressive",
};

export default function BreakoutRetestBotPage() {
  const [setup, setSetup] = useState(DEFAULT_SETUP);
  const accent = "#F5C542";

  return (
    <BotProvider>
    <div className="mx-auto max-w-[1400px] space-y-4 p-4">
      {/* ── 1. Exchange Bar ── */}
      <BotExchangeBar botName="Breakout Retest Engine" accentColor={accent} />

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
              Breakout confirmed, waiting for retest at 95,400
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-white/30">Confidence</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full"
                  style={{ width: "72%", background: accent }}
                />
              </div>
              <span className="text-[12px] font-bold" style={{ color: accent }}>
                72%
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 4. Backtest ── */}
      <BotBacktestPanel strategyName="Breakout + Retest" accentColor={accent} />

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
                Lookback Period
              </span>
              <input
                type="number"
                value={setup.lookbackPeriod}
                onChange={(e) => setSetup({ ...setup, lookbackPeriod: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                Volume Multiplier
              </span>
              <input
                type="number"
                step="0.1"
                value={setup.volumeMultiplier}
                onChange={(e) => setSetup({ ...setup, volumeMultiplier: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                Retest Tolerance (%)
              </span>
              <input
                type="number"
                step="0.1"
                value={setup.retestTolerance}
                onChange={(e) => setSetup({ ...setup, retestTolerance: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                Break Threshold (%)
              </span>
              <input
                type="number"
                step="0.1"
                value={setup.breakThreshold}
                onChange={(e) => setSetup({ ...setup, breakThreshold: +e.target.value })}
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

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">
                Time Exit (candles)
              </span>
              <input
                type="number"
                value={setup.timeExit}
                onChange={(e) => setSetup({ ...setup, timeExit: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
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
              { label: "Notional Value", value: `$${fmt(setup.size * 95400 * setup.leverage, 0)}`, color: "#5B8DEF" },
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
                <span className="rounded-md bg-[#F5C542]/15 px-2 py-0.5 text-[11px] font-semibold text-[#F5C542]">
                  BREAKOUT DETECTED
                </span>
                <span className="text-[11px] text-white/40">
                  Awaiting retest at{" "}
                  <span className="font-medium text-white/70">95,400</span>
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 6. Key Levels Table ── */}
      <Card>
        <h3 className="mb-4 text-[13px] font-semibold text-white/90">
          Detected Support / Resistance Levels
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                <th className="pb-2 pr-4 font-medium">Level</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium">Touches</th>
                <th className="pb-2 pr-4 font-medium">Last Touch</th>
                <th className="pb-2 pr-4 font-medium">Distance</th>
                <th className="pb-2 font-medium">Strength</th>
              </tr>
            </thead>
            <tbody>
              {KEY_LEVELS.map((lvl) => (
                <tr
                  key={lvl.level}
                  className="border-b border-white/[0.03] transition hover:bg-white/[0.02]"
                >
                  <td className="py-2.5 pr-4 font-mono font-medium text-white/80">
                    {fmt(lvl.level, 0)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        lvl.type === "Resistance"
                          ? "bg-[#f6465d]/10 text-[#f6465d]"
                          : "bg-[#2bc48a]/10 text-[#2bc48a]"
                      )}
                    >
                      {lvl.type}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-white/60">{lvl.touches}</td>
                  <td className="py-2.5 pr-4 text-white/40">{lvl.lastTouch}</td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={
                        lvl.distance.startsWith("+") ? "text-[#2bc48a]" : "text-[#f6465d]"
                      }
                    >
                      {lvl.distance}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${lvl.strength}%`,
                            background:
                              lvl.strength >= 80
                                ? "#2bc48a"
                                : lvl.strength >= 60
                                  ? "#F5C542"
                                  : "#f6465d",
                          }}
                        />
                      </div>
                      <span className="text-white/50">{lvl.strength}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Signals Overview ── */}
      <SignalsOverview overrides={[
        { id: "trend", status: "Bullish" },
        { id: "market-structure", status: "Triggered" },
        { id: "support-resistance", status: "Triggered" },
        { id: "volume", status: "Bullish" },
        { id: "liquidity", status: "Watching" },
        { id: "imbalance-fvg", status: "Triggered" },
        { id: "open-interest", status: "Bullish" },
      ]} />

      {/* ── 7. Strategy Logic ── */}
      <Card>
        <h3 className="mb-4 text-[13px] font-semibold text-white/90">Strategy Logic</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Entry Long */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-semibold text-[#2bc48a]">Entry Long (Breakout Up)</p>
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
              Entry Short (Breakout Down)
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
              <p>TP: Measured move projection</p>
              <p>SL: Below breakout level</p>
              <p>Time exit: {setup.timeExit} candles max</p>
            </div>
          </div>
        </div>
      </Card>

      {/* ── 8. Bot State + Log ── */}
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
                    WAITING RETEST
                  </span>
                ),
              },
              {
                label: "Last Trade",
                render: (
                  <span className="text-[12px] text-white/60">
                    LONG BTC @ 94,200 &middot; +2.1%
                  </span>
                ),
              },
              {
                label: "Current Position",
                render: <span className="text-[12px] text-white/40">None</span>,
              },
              {
                label: "Breakout Level",
                render: (
                  <span className="text-[12px] font-medium text-white/70">95,400 (resistance)</span>
                ),
              },
              {
                label: "Next Action",
                render: (
                  <span className="text-[12px] text-white/60">
                    Enter on retest confirmation at 95,400
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
        <BotLivePanel botSlug="breakout-retest" botName="Breakout Retest Bot" accentColor="#F5C542" />
        <BotExecutionLog accentColor={accent} />
      </div>
    </div>
    </BotProvider>
  );
}
