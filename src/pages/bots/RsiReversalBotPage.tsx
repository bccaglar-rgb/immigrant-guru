import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";
import BotLivePanel from "../../components/bot/BotLivePanel";
import BotStrategyChart from "../../components/bot/BotStrategyChart";
import BotBacktestPanel from "../../components/bot/BotBacktestPanel";
import SignalsOverview from "../../components/bot/SignalsOverview";

/* ── Helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>{children}</div>
);

/* ── RSI Gauge Component ── */
const RsiGauge = ({ value }: { value: number }) => {
  const pct = Math.max(0, Math.min(100, value));
  const zone = pct < 30 ? "OVERSOLD" : pct > 70 ? "OVERBOUGHT" : "NEUTRAL";
  const zoneColor = pct < 30 ? "#2bc48a" : pct > 70 ? "#f6465d" : "#F5C542";
  const segments = 40;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-bold text-white/80">RSI(14):</span>
        <span className="text-[18px] font-black font-mono" style={{ color: zoneColor }}>{value}</span>
        <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-bold"
          style={{ borderColor: zoneColor + "60", background: zoneColor + "15", color: zoneColor }}>
          {zone} {pct < 30 || pct > 70 ? "\u2713" : ""}
        </span>
      </div>
      {/* Visual gauge */}
      <div className="relative h-6 rounded-md overflow-hidden bg-[#0F1012] border border-white/[0.06]">
        <div className="absolute inset-0 flex">
          {Array.from({ length: segments }).map((_, i) => {
            const segPct = ((i + 0.5) / segments) * 100;
            const isOversold = segPct < 30;
            const isOverbought = segPct > 70;
            const bg = isOversold ? "#2bc48a" : isOverbought ? "#f6465d" : "#ffffff";
            const opacity = isOversold || isOverbought ? 0.25 : 0.06;
            return (
              <div key={i} className="flex-1 mx-px rounded-sm" style={{ background: bg, opacity }} />
            );
          })}
        </div>
        {/* Needle */}
        <div className="absolute top-0 h-full w-0.5" style={{ left: `${pct}%`, background: zoneColor, boxShadow: `0 0 8px ${zoneColor}` }} />
        <div className="absolute -top-0.5 h-2 w-2 rounded-full" style={{ left: `calc(${pct}% - 4px)`, background: zoneColor, boxShadow: `0 0 6px ${zoneColor}` }} />
      </div>
      {/* Scale labels */}
      <div className="flex justify-between text-[9px] font-mono text-white/30 px-0.5">
        <span>0</span>
        <span className="text-[#2bc48a]/60">30</span>
        <span className="text-white/20">50</span>
        <span className="text-[#f6465d]/60">70</span>
        <span>100</span>
      </div>
    </div>
  );
};

/* ── Market Type Detector ── */
const MarketBadge = ({ adx }: { adx: number }) => {
  const ranging = adx < 25;
  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold",
      ranging ? "border-[#2bc48a]/30 bg-[#2bc48a]/10 text-[#2bc48a]" : "border-[#F5C542]/30 bg-[#F5C542]/10 text-[#F5C542]")}>
      {ranging ? "\u2713" : "\u26A0"} {ranging ? "RANGE OK" : "TRENDING (warning)"}
      <span className="text-[9px] font-normal opacity-60">ADX {adx}</span>
    </div>
  );
};

/* ── Mock State ── */
const RSI_VALUE = 24;
const ADX_VALUE = 21;
const CONDITIONS = [
  { label: "RSI extreme", met: false, current: "44", target: "< 30 or > 70" },
  { label: "Near S/R level", met: true, current: "0.8% from support", target: "< 1.5%" },
  { label: "Volume spike", met: false, current: "0.9x avg", target: "> 1.5x" },
  { label: "Reversal candle", met: false, current: "Waiting", target: "Hammer / Engulfing" },
];

/* ── Main Page ── */
export default function RsiReversalBotPage() {
  const [botState, setBotState] = useState<"SCANNING" | "ARMED" | "IN_TRADE" | "COOLDOWN">("SCANNING");
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [obLevel, setObLevel] = useState(70);
  const [osLevel, setOsLevel] = useState(30);
  const [volumeConfirm, setVolumeConfirm] = useState(true);
  const [srProximity, setSrProximity] = useState(1.5);
  const [riskPct, setRiskPct] = useState(1.0);
  const [leverage, setLeverage] = useState(5);
  const [tpMultiple, setTpMultiple] = useState(1.6);
  const [slAtr, setSlAtr] = useState(1.5);

  const metCount = CONDITIONS.filter(c => c.met).length;
  const I = "mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-sm text-white outline-none";
  const L = "text-[11px] text-white/40";

  return (
    <BotProvider>
    <div className="flex h-full flex-col overflow-auto bg-[#0B0B0C] text-white">
      {/* 1. EXCHANGE BAR */}
      <div className="shrink-0 p-4 pb-0">
        <BotExchangeBar botName="RSI Reversal Engine" accentColor="#9f8bff" />
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* 2. TRUST BAR */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "Win Rate", value: "56%", color: "text-[#2bc48a]" },
            { label: "Avg RR", value: "1:1.6", color: "text-white" },
            { label: "Max Drawdown", value: "-5.8%", color: "text-[#f6465d]" },
            { label: "Profit Factor", value: "1.52", color: "text-white" },
            { label: "Sharpe", value: "1.18", color: "text-white" },
            { label: "Today PnL", value: "+$42.80", color: "text-[#2bc48a]" },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-white/[0.06] bg-[#0F1012] p-3 text-center">
              <p className="text-[9px] uppercase tracking-wider text-white/30">{s.label}</p>
              <p className={cn("mt-1 text-[15px] font-bold", s.color)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* 3. CHART + BOT THINKING (2 cols) */}
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Card className="p-0 overflow-hidden">
            <BotStrategyChart defaultPair="BTCUSDT" defaultTf="15m" accentColor="#9f8bff" />
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[13px] font-bold">Bot Thinking</h3>
              <span className="ml-auto h-2 w-2 rounded-full bg-[#9f8bff] animate-pulse" />
            </div>
            <div className="space-y-2">
              {CONDITIONS.map((c, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-[#0F1012] px-3 py-2">
                  <span className={c.met ? "text-[#2bc48a]" : "text-[#f6465d]"}>{c.met ? "\u2713" : "\u2717"}</span>
                  <span className="text-[11px] text-white/60 flex-1">{c.label}</span>
                  <span className="text-[10px] font-mono text-white/40">{c.current}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-white/[0.06] bg-[#0F1012] p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30 mb-1">Confidence</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-[#9f8bff]" style={{ width: `${metCount * 25}%` }} />
                </div>
                <span className="text-[11px] font-bold text-[#9f8bff]">{metCount}/4</span>
              </div>
            </div>
            <div className="mt-3 rounded-lg bg-[#9f8bff]/10 border border-[#9f8bff]/20 p-3 text-center">
              <p className="text-[10px] text-white/40">Current Action</p>
              <p className="mt-0.5 text-[12px] font-bold text-[#9f8bff]">Waiting for RSI &lt; 30 at support</p>
            </div>
          </Card>
        </div>

        {/* 4. RSI STATUS PANEL (unique) */}
        <Card className="border-[#9f8bff]/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-bold">RSI Indicator Status</h3>
            <MarketBadge adx={ADX_VALUE} />
          </div>
          <RsiGauge value={RSI_VALUE} />
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg bg-[#0F1012] border border-white/[0.06] p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30">RSI Period</p>
              <p className="mt-1 text-[14px] font-bold text-white">14</p>
            </div>
            <div className="rounded-lg bg-[#0F1012] border border-white/[0.06] p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30">Oversold Zone</p>
              <p className="mt-1 text-[14px] font-bold text-[#2bc48a]">&lt; 30</p>
            </div>
            <div className="rounded-lg bg-[#0F1012] border border-white/[0.06] p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30">Overbought Zone</p>
              <p className="mt-1 text-[14px] font-bold text-[#f6465d]">&gt; 70</p>
            </div>
            <div className="rounded-lg bg-[#0F1012] border border-white/[0.06] p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30">S/R Distance</p>
              <p className="mt-1 text-[14px] font-bold text-[#2bc48a]">0.8%</p>
            </div>
          </div>
        </Card>

        {/* Signals Overview */}
        <SignalsOverview overrides={[
          { id: "rsi-divergence", status: "Triggered" },
          { id: "support-resistance", status: "Bullish" },
          { id: "volume", status: "Watching" },
          { id: "trend", status: "Bearish" },
          { id: "market-structure", status: "Neutral" },
          { id: "liquidity", status: "Watching" },
          { id: "squeeze", status: "Watching" },
        ]} />

        {/* 5. BACKTEST PANEL */}
        <BotBacktestPanel strategyName="RSI Reversal" accentColor="#9f8bff" />

        {/* 6. SETUP + RISK (2 cols) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-[13px] font-bold mb-3">Strategy Setup</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>RSI Period</label>
                  <input type="number" min={2} max={50} value={rsiPeriod} onChange={e => setRsiPeriod(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>S/R Proximity (%)</label>
                  <input type="number" step={0.1} min={0.1} max={5} value={srProximity} onChange={e => setSrProximity(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>Overbought Level</label>
                  <input type="number" min={50} max={95} value={obLevel} onChange={e => setObLevel(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>Oversold Level</label>
                  <input type="number" min={5} max={50} value={osLevel} onChange={e => setOsLevel(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#0F1012] px-3 py-2.5">
                <span className="text-[11px] text-white/60">Volume Confirmation</span>
                <button onClick={() => setVolumeConfirm(v => !v)}
                  className={cn("rounded-full px-3 py-1 text-[10px] font-bold border transition",
                    volumeConfirm ? "border-[#2bc48a]/30 bg-[#2bc48a]/10 text-[#2bc48a]" : "border-white/10 text-white/30")}>
                  {volumeConfirm ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-[13px] font-bold mb-3">Risk Management</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>Risk per Trade (%)</label>
                  <input type="number" step={0.1} min={0.1} max={5} value={riskPct} onChange={e => setRiskPct(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>Leverage</label>
                  <input type="number" min={1} max={20} value={leverage} onChange={e => setLeverage(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>TP Multiple (RR)</label>
                  <input type="number" step={0.1} min={0.5} max={5} value={tpMultiple} onChange={e => setTpMultiple(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>SL (ATR multiple)</label>
                  <input type="number" step={0.1} min={0.5} max={5} value={slAtr} onChange={e => setSlAtr(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-[#0F1012] p-3">
                <p className="text-[9px] uppercase tracking-wider text-white/30 mb-2">Calculated Risk</p>
                <div className="flex justify-between text-[10px]">
                  <span className="text-white/40">Max loss per trade</span>
                  <span className="font-mono text-[#f6465d]">-${fmt(riskPct * 20)}</span>
                </div>
                <div className="flex justify-between text-[10px] mt-1">
                  <span className="text-white/40">Expected win</span>
                  <span className="font-mono text-[#2bc48a]">+${fmt(riskPct * 20 * tpMultiple)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* 7. STRATEGY LOGIC (interactive with live checks) */}
        <Card>
          <h3 className="text-[13px] font-bold mb-3">Strategy Logic</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {/* LONG entry */}
            <div className="rounded-lg border border-[#2bc48a]/20 bg-[#2bc48a]/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-[#2bc48a] uppercase tracking-wider">Long Entry</span>
              </div>
              <div className="space-y-1.5">
                {[
                  { rule: `RSI < ${osLevel}`, met: RSI_VALUE < osLevel, value: `RSI = ${RSI_VALUE}` },
                  { rule: "Near support level", met: true, value: "0.8% away" },
                  { rule: "Volume spike > 1.5x", met: false, value: "0.9x" },
                  { rule: "Bullish reversal candle", met: false, value: "Waiting" },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className={r.met ? "text-[#2bc48a]" : "text-[#f6465d]"}>{r.met ? "\u2705" : "\u274C"}</span>
                    <span className="text-white/60 flex-1">{r.rule}</span>
                    <span className="font-mono text-[10px] text-white/30">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* SHORT entry */}
            <div className="rounded-lg border border-[#f6465d]/20 bg-[#f6465d]/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-[#f6465d] uppercase tracking-wider">Short Entry</span>
              </div>
              <div className="space-y-1.5">
                {[
                  { rule: `RSI > ${obLevel}`, met: RSI_VALUE > obLevel, value: `RSI = ${RSI_VALUE}` },
                  { rule: "Near resistance level", met: false, value: "2.1% away" },
                  { rule: "Volume spike > 1.5x", met: false, value: "0.9x" },
                  { rule: "Bearish reversal candle", met: false, value: "Waiting" },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className={r.met ? "text-[#2bc48a]" : "text-[#f6465d]"}>{r.met ? "\u2705" : "\u274C"}</span>
                    <span className="text-white/60 flex-1">{r.rule}</span>
                    <span className="font-mono text-[10px] text-white/30">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* 8. BOT STATE + EXECUTION LOG */}
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card>
            <h3 className="text-[13px] font-bold mb-3">Bot State</h3>
            <div className="space-y-2">
              {(["SCANNING", "ARMED", "IN_TRADE", "COOLDOWN"] as const).map(s => (
                <button key={s} onClick={() => setBotState(s)}
                  className={cn("w-full rounded-lg border px-3 py-2 text-left text-[11px] font-semibold transition",
                    botState === s ? "border-[#9f8bff]/40 bg-[#9f8bff]/15 text-[#9f8bff]" : "border-white/[0.06] text-white/30 hover:text-white/50")}>
                  <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-2",
                    botState === s ? "bg-[#9f8bff]" : "bg-white/20")} />
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-[#0F1012] border border-white/[0.06] p-3 text-center">
              <p className="text-[9px] uppercase tracking-wider text-white/30">Uptime</p>
              <p className="mt-1 text-[14px] font-bold text-white font-mono">04:32:18</p>
            </div>
          </Card>
          <BotLivePanel botSlug="rsi-reversal" botName="RSI Reversal Bot" accentColor="#9f8bff" />
          <BotExecutionLog accentColor="#9f8bff" />
        </div>

      </div>
    </div>
    </BotProvider>
  );
}
