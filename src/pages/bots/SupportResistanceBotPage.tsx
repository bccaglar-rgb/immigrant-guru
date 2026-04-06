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
  { label: "Win Rate", value: "57%", color: "#2bc48a" },
  { label: "Avg RR", value: "1:1.8", color: "#5B8DEF" },
  { label: "Max DD", value: "-5.5%", color: "#f6465d" },
  { label: "Trades", value: "142", color: "#fff" },
  { label: "Performance", value: "+16.2%", color: "#2bc48a" },
];

/* ── Bot thinking conditions ── */
const CONDITIONS = [
  { label: "Near key level", met: true, detail: "0.4% from 94,800 support" },
  { label: "Rejection candle forming", met: false, detail: "Waiting for wick" },
  { label: "Volume at level", met: true, detail: "1.4x average" },
  { label: "RSI supports bounce", met: true, detail: "RSI 38.2 (oversold zone)" },
  { label: "Multiple touches", met: true, detail: "6 touches on 94,800" },
];

/* ── Key levels table data ── */
const KEY_LEVELS = [
  { level: 97000, type: "Resistance" as const, touches: 5, strength: 85, distance: "+2.3%", lastTest: "1d ago", signal: "Strong" as const },
  { level: 96200, type: "Resistance" as const, touches: 2, strength: 64, distance: "+1.5%", lastTest: "12h ago", signal: "Weak" as const },
  { level: 95400, type: "Resistance" as const, touches: 4, strength: 87, distance: "+0.6%", lastTest: "2h ago", signal: "Strong" as const },
  { level: 94800, type: "Support" as const, touches: 6, strength: 92, distance: "-0.0%", lastTest: "Now", signal: "Active" as const },
  { level: 93500, type: "Support" as const, touches: 3, strength: 71, distance: "-1.4%", lastTest: "18h ago", signal: "Moderate" as const },
  { level: 92100, type: "Support" as const, touches: 7, strength: 95, distance: "-2.8%", lastTest: "2d ago", signal: "Strong" as const },
  { level: 91200, type: "Support" as const, touches: 2, strength: 58, distance: "-3.8%", lastTest: "3d ago", signal: "Weak" as const },
  { level: 98500, type: "Resistance" as const, touches: 3, strength: 76, distance: "+3.9%", lastTest: "4d ago", signal: "Moderate" as const },
];

/* ── Strategy logic conditions ── */
const ENTRY_LONG = [
  { rule: "Price near support level (within tolerance)", met: true },
  { rule: "Rejection candle / wick at level", met: false },
  { rule: "Volume confirmation", met: true },
  { rule: "RSI in oversold zone", met: true },
];
const ENTRY_SHORT = [
  { rule: "Price near resistance level (within tolerance)", met: false },
  { rule: "Rejection candle / wick at level", met: false },
  { rule: "Volume confirmation", met: false },
  { rule: "RSI in overbought zone", met: false },
];
const ENTRY_BREAK = [
  { rule: "Price breaks key level with volume", met: false },
  { rule: "Break volume > threshold multiplier", met: false },
  { rule: "Retest confirmation", met: false },
  { rule: "Momentum aligned", met: false },
];

/* ── Default setup state ── */
const DEFAULT_SETUP = {
  pair: "BTCUSDT",
  tf: "15m",
  detectionPeriod: 200,
  bounceTolerance: 0.3,
  breakVolumeThreshold: 2.0,
  mode: "bounce" as "bounce" | "break",
  size: 0.025,
  leverage: 3,
  tp: 1.8,
  sl: 0.8,
  maxTrades: 3,
  cooldown: 10,
  timeExit: 20,
  riskProfile: "moderate" as "conservative" | "moderate" | "aggressive",
};

export default function SupportResistanceBotPage() {
  const [setup, setSetup] = useState(DEFAULT_SETUP);
  const accent = "#f4906c";
  const currentPrice = 94800;

  const strongest = KEY_LEVELS.reduce((a, b) => (b.strength > a.strength ? b : a));

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4">
      {/* ── 1. Exchange Bar ── */}
      <BotExchangeBar botName="S/R Engine" accentColor={accent} />

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
              At support 94,800 ({setup.mode} mode) — waiting for rejection candle
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-white/30">Confidence</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full" style={{ width: "71%", background: accent }} />
              </div>
              <span className="text-[12px] font-bold" style={{ color: accent }}>71%</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 4. KEY LEVELS TABLE (unique) ── */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-white/90">Key Levels</h3>
          <div className="flex items-center gap-3">
            {/* Mode toggle */}
            <div className="flex rounded-md border border-white/10 bg-[#0F1012] p-0.5">
              <button
                onClick={() => setSetup({ ...setup, mode: "bounce" })}
                className={cn(
                  "rounded px-2.5 py-0.5 text-[10px] font-semibold transition",
                  setup.mode === "bounce"
                    ? "bg-[#2bc48a]/20 text-[#2bc48a]"
                    : "text-white/40 hover:text-white/60"
                )}
              >
                Bounce
              </button>
              <button
                onClick={() => setSetup({ ...setup, mode: "break" })}
                className={cn(
                  "rounded px-2.5 py-0.5 text-[10px] font-semibold transition",
                  setup.mode === "break"
                    ? "bg-[#5B8DEF]/20 text-[#5B8DEF]"
                    : "text-white/40 hover:text-white/60"
                )}
              >
                Break
              </button>
            </div>
            <span className="text-[10px] text-white/40">
              Price: <span className="font-mono font-medium text-white/70">{fmtUsd(currentPrice)}</span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                <th className="pb-2 pr-4 font-medium">Level</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium">Touches</th>
                <th className="pb-2 pr-4 font-medium">Strength</th>
                <th className="pb-2 pr-4 font-medium">Distance</th>
                <th className="pb-2 pr-4 font-medium">Last Test</th>
                <th className="pb-2 font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {KEY_LEVELS.sort((a, b) => b.level - a.level).map((lvl) => {
                const isStrongest = lvl.level === strongest.level;
                return (
                  <tr
                    key={lvl.level}
                    className={cn(
                      "border-b border-white/[0.03] transition",
                      isStrongest
                        ? "bg-[#f4906c]/[0.04] hover:bg-[#f4906c]/[0.08]"
                        : "hover:bg-white/[0.02]"
                    )}
                  >
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-white/80">{fmt(lvl.level, 0)}</span>
                        {isStrongest && (
                          <span className="rounded bg-[#f4906c]/20 px-1 py-0.5 text-[8px] font-bold text-[#f4906c]">
                            STRONGEST
                          </span>
                        )}
                      </div>
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
                    <td className="py-2.5 pr-4">
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
                    <td className="py-2.5 pr-4">
                      <span className={lvl.distance.startsWith("+") ? "text-[#2bc48a]" : lvl.distance === "-0.0%" ? "text-[#F5C542]" : "text-[#f6465d]"}>
                        {lvl.distance}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-white/40">{lvl.lastTest}</td>
                    <td className="py-2.5">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                          lvl.signal === "Active"
                            ? "bg-[#F5C542]/15 text-[#F5C542]"
                            : lvl.signal === "Strong"
                              ? "bg-[#2bc48a]/10 text-[#2bc48a]"
                              : lvl.signal === "Moderate"
                                ? "bg-[#5B8DEF]/10 text-[#5B8DEF]"
                                : "bg-white/[0.05] text-white/40"
                        )}
                      >
                        {lvl.signal}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Price position indicator */}
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span className="text-[11px] text-white/60">
            Price <span className="font-mono font-medium text-white">{fmtUsd(currentPrice)}</span> is sitting on
          </span>
          <span className="rounded-md bg-[#2bc48a]/15 px-2 py-0.5 text-[10px] font-bold text-[#2bc48a]">
            SUPPORT 94,800
          </span>
          <span className="text-[10px] text-white/40">
            Next resistance at <span className="font-medium text-white/60">95,400</span> (+0.6%)
          </span>
        </div>
      </Card>

      {/* ── 5. Backtest ── */}
      <BotBacktestPanel strategyName="S/R Bounce + Break" accentColor={accent} />

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
              <span className="text-[10px] uppercase tracking-wider text-white/30">Detection Period</span>
              <input
                type="number"
                value={setup.detectionPeriod}
                onChange={(e) => setSetup({ ...setup, detectionPeriod: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Bounce Tolerance (%)</span>
              <input
                type="number"
                step="0.1"
                value={setup.bounceTolerance}
                onChange={(e) => setSetup({ ...setup, bounceTolerance: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Break Vol Threshold</span>
              <input
                type="number"
                step="0.1"
                value={setup.breakVolumeThreshold}
                onChange={(e) => setSetup({ ...setup, breakVolumeThreshold: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Mode</span>
              <select
                value={setup.mode}
                onChange={(e) => setSetup({ ...setup, mode: e.target.value as typeof setup.mode })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                <option value="bounce">Bounce</option>
                <option value="break">Break</option>
              </select>
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
                <span className="rounded-md bg-[#2bc48a]/15 px-2 py-0.5 text-[11px] font-semibold text-[#2bc48a]">
                  AT KEY SUPPORT
                </span>
                <span className="text-[11px] text-white/40">
                  Testing <span className="font-medium text-white/70">94,800</span> support (6 touches)
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
            <p className="mb-2 text-[11px] font-semibold text-[#2bc48a]">Long (Bounce at Support)</p>
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
            <p className="mb-2 text-[11px] font-semibold text-[#f6465d]">Short (Bounce at Resistance)</p>
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
            <p className="mb-2 text-[11px] font-semibold text-[#5B8DEF]">Break Mode / Exit</p>
            <div className="space-y-1.5">
              {ENTRY_BREAK.map((c) => (
                <div key={c.rule} className="flex items-center gap-2 text-[11px]">
                  <span>{c.met ? "\u2705" : "\u274C"}</span>
                  <span className={c.met ? "text-white/70" : "text-white/40"}>{c.rule}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 border-t border-white/[0.06] pt-2 space-y-1 text-[11px] text-white/50">
              <p>TP: Next S/R level</p>
              <p>SL: Beyond level + tolerance</p>
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
                  <span className="rounded-md bg-[#F5C542]/15 px-2 py-0.5 text-[11px] font-bold text-[#F5C542]">
                    WATCHING BOUNCE
                  </span>
                ),
              },
              {
                label: "Mode",
                render: (
                  <span className="text-[12px] font-medium text-[#2bc48a]">
                    {setup.mode === "bounce" ? "BOUNCE" : "BREAK"} MODE
                  </span>
                ),
              },
              {
                label: "Last Trade",
                render: <span className="text-[12px] text-white/60">LONG BTC @ 93,500 &middot; +1.9%</span>,
              },
              {
                label: "Current Position",
                render: <span className="text-[12px] text-white/40">None</span>,
              },
              {
                label: "Nearest Level",
                render: <span className="text-[12px] font-medium text-white/70">94,800 (support, 92% strength)</span>,
              },
              {
                label: "Next Action",
                render: <span className="text-[12px] text-white/60">Enter long on rejection candle at 94,800</span>,
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
