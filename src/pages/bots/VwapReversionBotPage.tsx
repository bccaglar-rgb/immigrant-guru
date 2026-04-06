import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";
import BotStrategyChart from "../../components/bot/BotStrategyChart";
import BotBacktestPanel from "../../components/bot/BotBacktestPanel";
import SignalsOverview from "../../components/bot/SignalsOverview";

/* ── Helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => "$" + fmt(n);
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>{children}</div>
);

/* ── VWAP Deviation Meter ── */
const VwapDeviationMeter = ({
  vwap, price, threshold,
}: { vwap: number; price: number; threshold: number }) => {
  const deviation = ((price - vwap) / vwap) * 100;
  const absDeviation = Math.abs(deviation);
  const direction = deviation < 0 ? "below" : "above";
  const isTriggered = absDeviation >= threshold;
  const fillPct = Math.min((absDeviation / (threshold * 2)) * 100, 100);
  const thresholdPct = (threshold / (threshold * 2)) * 100;
  const status = isTriggered ? "READY" : "WAITING";
  const statusColor = isTriggered ? "#2bc48a" : "#F5C542";

  return (
    <div className="space-y-3">
      {/* Price vs VWAP */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-[#0F1012] border border-white/[0.06] p-3">
          <p className="text-[9px] uppercase tracking-wider text-white/30">VWAP</p>
          <p className="mt-1 text-[16px] font-black font-mono text-[#5B8DEF]">{fmtUsd(vwap)}</p>
        </div>
        <div className="rounded-lg bg-[#0F1012] border border-white/[0.06] p-3">
          <p className="text-[9px] uppercase tracking-wider text-white/30">Current Price</p>
          <p className="mt-1 text-[16px] font-black font-mono text-white">{fmtUsd(price)}</p>
          <p className="text-[10px] font-mono" style={{ color: deviation < 0 ? "#f6465d" : "#2bc48a" }}>
            {deviation < 0 ? "" : "+"}{fmt(deviation, 1)}% {direction}
          </p>
        </div>
      </div>

      {/* Deviation meter */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-white/40">Deviation</span>
          <span className="text-[10px] font-mono text-white/50">{fmt(absDeviation, 1)}% / {fmt(threshold, 1)}% threshold</span>
        </div>
        <div className="relative h-6 rounded-lg overflow-hidden bg-[#0F1012] border border-white/[0.06]">
          {/* Fill bar */}
          <div className="absolute top-0 left-0 h-full rounded-lg transition-all duration-500"
            style={{
              width: `${fillPct}%`,
              background: isTriggered
                ? "linear-gradient(90deg, rgba(43,196,138,0.4), rgba(43,196,138,0.7))"
                : "linear-gradient(90deg, rgba(245,197,66,0.3), rgba(245,197,66,0.5))",
            }} />
          {/* Threshold marker */}
          <div className="absolute top-0 h-full w-0.5 bg-[#f6465d]/70" style={{ left: `${thresholdPct}%` }} />
          <div className="absolute top-0 text-[7px] font-bold text-[#f6465d]/80" style={{ left: `calc(${thresholdPct}% + 3px)` }}>
            TRIGGER
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-white/50">Status:</span>
        <span className="rounded-full border px-3 py-1 text-[11px] font-bold"
          style={{ borderColor: statusColor + "40", background: statusColor + "15", color: statusColor }}>
          {status} {isTriggered ? "\u2713" : ""} (need &gt; {fmt(threshold, 1)}% deviation)
        </span>
      </div>
    </div>
  );
};

/* ── Imbalance Indicator ── */
const ImbalanceIndicator = ({ value }: { value: number }) => {
  const pct = ((value + 1) / 2) * 100; // normalize -1..1 to 0..100
  const color = value > 0 ? "#2bc48a" : value < 0 ? "#f6465d" : "#ffffff";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-[#f6465d]/60">Sell pressure</span>
        <span className="text-[#2bc48a]/60">Buy pressure</span>
      </div>
      <div className="relative h-4 rounded bg-[#0F1012] border border-white/[0.06] overflow-hidden">
        <div className="absolute top-0 h-full w-px bg-white/20" style={{ left: "50%" }} />
        <div className="absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full"
          style={{ left: `calc(${pct}% - 5px)`, background: color, boxShadow: `0 0 8px ${color}60` }} />
      </div>
      <div className="text-center">
        <span className="text-[10px] font-mono font-bold" style={{ color }}>
          {value > 0 ? "+" : ""}{fmt(value, 2)}
        </span>
      </div>
    </div>
  );
};

/* ── Mock State ── */
const VWAP_PRICE = 94_200;
const CURRENT_PRICE = 93_150;
const DEV_THRESHOLD = 2.0;
const IMBALANCE = 0.15;
const VOLUME_RATIO = 1.4;

const CONDITIONS = [
  { label: "VWAP deviation > 2%", met: false, current: "1.1% below", target: "> 2.0%" },
  { label: "Volume ratio", met: true, current: `${VOLUME_RATIO}x`, target: "> 1.2x" },
  { label: "Imbalance direction", met: true, current: `+${fmt(IMBALANCE)}`, target: "Aligned" },
  { label: "Not exhausted move", met: true, current: "RSI 42", target: "20 < RSI < 80" },
];

/* ── Main Page ── */
export default function VwapReversionBotPage() {
  const [botState, setBotState] = useState<"MONITORING" | "DEVIATION_ALERT" | "IN_TRADE" | "COOLDOWN">("MONITORING");
  const [devThreshold, setDevThreshold] = useState(2.0);
  const [volumeFilter, setVolumeFilter] = useState(1.2);
  const [imbalanceThresh, setImbalanceThresh] = useState(0.1);
  const [timeExit, setTimeExit] = useState(30);
  const [riskPct, setRiskPct] = useState(1.0);
  const [leverage, setLeverage] = useState(3);
  const [maxTrades, setMaxTrades] = useState(5);
  const [cooldownMin, setCooldownMin] = useState(10);

  const metCount = CONDITIONS.filter(c => c.met).length;
  const I = "mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-sm text-white outline-none";
  const L = "text-[11px] text-white/40";

  return (
    <BotProvider>
    <div className="flex h-full flex-col overflow-auto bg-[#0B0B0C] text-white">
      {/* 1. EXCHANGE BAR */}
      <div className="shrink-0 p-4 pb-0">
        <BotExchangeBar botName="VWAP Reversion Engine" accentColor="#9f8bff" />
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* 2. TRUST BAR */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "Win Rate", value: "58%", color: "text-[#2bc48a]" },
            { label: "Avg RR", value: "1:1.5", color: "text-white" },
            { label: "Max Drawdown", value: "-5.2%", color: "text-[#f6465d]" },
            { label: "Profit Factor", value: "1.58", color: "text-white" },
            { label: "Sharpe", value: "1.26", color: "text-white" },
            { label: "Today PnL", value: "+$38.60", color: "text-[#2bc48a]" },
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
            <BotStrategyChart defaultPair="BTCUSDT" defaultTf="5m" accentColor="#9f8bff" />
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
              <p className="mt-0.5 text-[12px] font-bold text-[#9f8bff]">Monitoring deviation -- need &gt; 2%</p>
            </div>
          </Card>
        </div>

        {/* 4. VWAP STATUS PANEL (unique) */}
        <Card className="border-[#9f8bff]/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-bold">VWAP Indicator Status</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/30">Session VWAP</span>
              <span className="rounded-full border border-[#5B8DEF]/30 bg-[#5B8DEF]/10 px-2 py-0.5 text-[10px] font-bold text-[#5B8DEF]">
                Intraday
              </span>
            </div>
          </div>
          <VwapDeviationMeter vwap={VWAP_PRICE} price={CURRENT_PRICE} threshold={DEV_THRESHOLD} />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <h4 className="text-[11px] font-semibold text-white/50 mb-2">Order Imbalance</h4>
              <ImbalanceIndicator value={IMBALANCE} />
            </div>
            <div>
              <h4 className="text-[11px] font-semibold text-white/50 mb-2">Volume Ratio History</h4>
              <div className="space-y-1">
                {[0.8, 1.1, 1.3, 1.4, 1.6, 1.4].map((v, i) => {
                  const w = Math.min((v / 2) * 100, 100);
                  const pass = v >= volumeFilter;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 rounded bg-white/[0.03] overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${w}%`, background: pass ? "#9f8bff" : "#ffffff15" }} />
                      </div>
                      <span className={cn("text-[9px] font-mono w-8 text-right", pass ? "text-[#9f8bff]" : "text-white/20")}>
                        {fmt(v, 1)}x
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* Signals Overview */}
        <SignalsOverview overrides={[
          { id: "vwap", status: "Triggered" },
          { id: "anchored-vwap", status: "Bullish" },
          { id: "volume", status: "Watching" },
          { id: "delta-volume", status: "Neutral" },
          { id: "trend", status: "Neutral" },
          { id: "imbalance-fvg", status: "Watching" },
        ]} />

        {/* 5. BACKTEST PANEL */}
        <BotBacktestPanel strategyName="VWAP Mean Reversion" accentColor="#9f8bff" />

        {/* 6. SETUP + RISK (2 cols) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-[13px] font-bold mb-3">Strategy Setup</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>VWAP Deviation (%)</label>
                  <input type="number" step={0.1} min={0.5} max={5} value={devThreshold} onChange={e => setDevThreshold(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>Volume Filter (x avg)</label>
                  <input type="number" step={0.1} min={0.5} max={3} value={volumeFilter} onChange={e => setVolumeFilter(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>Imbalance Threshold</label>
                  <input type="number" step={0.01} min={0.01} max={1} value={imbalanceThresh} onChange={e => setImbalanceThresh(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>Time Exit (candles)</label>
                  <input type="number" min={5} max={100} value={timeExit} onChange={e => setTimeExit(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-[#0F1012] p-3">
                <p className="text-[9px] uppercase tracking-wider text-white/30 mb-2">VWAP Anchoring</p>
                <p className="text-[11px] text-white/60">Session-based VWAP resets at 00:00 UTC. Deviation calculated from rolling intraday volume-weighted average.</p>
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
                  <label className={L}>Max Trades / Session</label>
                  <input type="number" min={1} max={20} value={maxTrades} onChange={e => setMaxTrades(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>Cooldown (min)</label>
                  <input type="number" min={1} max={60} value={cooldownMin} onChange={e => setCooldownMin(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-[#0F1012] p-3">
                <p className="text-[9px] uppercase tracking-wider text-white/30 mb-2">Session Limits</p>
                <div className="flex justify-between text-[10px]">
                  <span className="text-white/40">Trades remaining</span>
                  <span className="font-mono text-white/60">{maxTrades - 2} / {maxTrades}</span>
                </div>
                <div className="flex justify-between text-[10px] mt-1">
                  <span className="text-white/40">Max session loss</span>
                  <span className="font-mono text-[#f6465d]">-${fmt(riskPct * 20 * maxTrades)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* 7. STRATEGY LOGIC (interactive) */}
        <Card>
          <h3 className="text-[13px] font-bold mb-3">Strategy Logic</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-[#2bc48a]/20 bg-[#2bc48a]/5 p-3">
              <span className="text-[10px] font-bold text-[#2bc48a] uppercase tracking-wider">Long Entry</span>
              <div className="mt-2 space-y-1.5">
                {[
                  { rule: `Price > ${fmt(devThreshold, 1)}% below VWAP`, met: false, value: "1.1% below" },
                  { rule: `Volume ratio > ${fmt(volumeFilter, 1)}x`, met: VOLUME_RATIO >= volumeFilter, value: `${VOLUME_RATIO}x` },
                  { rule: `Imbalance > +${fmt(imbalanceThresh)}`, met: IMBALANCE > imbalanceThresh, value: `+${fmt(IMBALANCE)}` },
                  { rule: "RSI not exhausted (20-80)", met: true, value: "RSI 42" },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className={r.met ? "text-[#2bc48a]" : "text-[#f6465d]"}>{r.met ? "\u2705" : "\u274C"}</span>
                    <span className="text-white/60 flex-1">{r.rule}</span>
                    <span className="font-mono text-[10px] text-white/30">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-[#f6465d]/20 bg-[#f6465d]/5 p-3">
              <span className="text-[10px] font-bold text-[#f6465d] uppercase tracking-wider">Short Entry</span>
              <div className="mt-2 space-y-1.5">
                {[
                  { rule: `Price > ${fmt(devThreshold, 1)}% above VWAP`, met: false, value: "1.1% below" },
                  { rule: `Volume ratio > ${fmt(volumeFilter, 1)}x`, met: VOLUME_RATIO >= volumeFilter, value: `${VOLUME_RATIO}x` },
                  { rule: `Imbalance < -${fmt(imbalanceThresh)}`, met: false, value: `+${fmt(IMBALANCE)}` },
                  { rule: "RSI not exhausted (20-80)", met: true, value: "RSI 42" },
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
              {(["MONITORING", "DEVIATION_ALERT", "IN_TRADE", "COOLDOWN"] as const).map(s => (
                <button key={s} onClick={() => setBotState(s)}
                  className={cn("w-full rounded-lg border px-3 py-2 text-left text-[11px] font-semibold transition",
                    botState === s ? "border-[#9f8bff]/40 bg-[#9f8bff]/15 text-[#9f8bff]" : "border-white/[0.06] text-white/30 hover:text-white/50")}>
                  <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-2",
                    botState === s ? "bg-[#9f8bff]" : "bg-white/20")} />
                  {s.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-[#0F1012] border border-white/[0.06] p-3 text-center">
              <p className="text-[9px] uppercase tracking-wider text-white/30">Session Reset</p>
              <p className="mt-1 text-[14px] font-bold text-[#5B8DEF] font-mono">10:18 remaining</p>
            </div>
          </Card>
          <BotExecutionLog accentColor="#9f8bff" />
        </div>

      </div>
    </div>
    </BotProvider>
  );
}
