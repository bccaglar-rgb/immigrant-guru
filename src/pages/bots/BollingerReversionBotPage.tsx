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
const fmtUsd = (n: number) => "$" + fmt(n);
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>{children}</div>
);

/* ── BB Band Visual ── */
const BbBandVisual = ({ upper, lower, price, squeeze }: { upper: number; lower: number; price: number; squeeze: boolean }) => {
  const range = upper - lower;
  const position = range > 0 ? ((price - lower) / range) * 100 : 50;
  const width = range > 0 ? ((range / ((upper + lower) / 2)) * 100) : 0;
  const midPrice = (upper + lower) / 2;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-bold text-white/80">BB(20, 2.0):</span>
        {squeeze && (
          <span className="rounded-full border border-[#F5C542]/40 bg-[#F5C542]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#F5C542] animate-pulse">
            SQUEEZE DETECTED
          </span>
        )}
      </div>

      {/* Band visualization */}
      <div className="relative">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="font-mono text-[#2bc48a]/70">Lower: {fmtUsd(lower)}</span>
          <span className="font-mono text-white/30">Mid: {fmtUsd(midPrice)}</span>
          <span className="font-mono text-[#f6465d]/70">Upper: {fmtUsd(upper)}</span>
        </div>
        <div className="relative h-8 rounded-lg overflow-hidden bg-[#0F1012] border border-white/[0.06]">
          {/* Band gradient */}
          <div className="absolute inset-0"
            style={{ background: "linear-gradient(90deg, rgba(43,196,138,0.15) 0%, rgba(255,255,255,0.03) 30%, rgba(255,255,255,0.03) 70%, rgba(246,70,93,0.15) 100%)" }} />
          {/* Center line */}
          <div className="absolute top-0 h-full w-px bg-white/10" style={{ left: "50%" }} />
          {/* Price dot */}
          <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2"
            style={{
              left: `calc(${Math.max(2, Math.min(98, position))}% - 6px)`,
              background: "#9f8bff",
              borderColor: "#9f8bff",
              boxShadow: "0 0 10px rgba(159,139,255,0.6)",
            }} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[#0F1012] border border-white/[0.06] p-2 text-center">
          <p className="text-[8px] uppercase tracking-wider text-white/30">Width</p>
          <p className="text-[13px] font-bold text-white font-mono">{fmt(width, 1)}%</p>
        </div>
        <div className="rounded-lg bg-[#0F1012] border border-white/[0.06] p-2 text-center">
          <p className="text-[8px] uppercase tracking-wider text-white/30">Position</p>
          <p className="text-[13px] font-bold font-mono" style={{ color: position < 35 ? "#2bc48a" : position > 65 ? "#f6465d" : "white" }}>
            {fmt(position, 0)}%
          </p>
        </div>
        <div className="rounded-lg bg-[#0F1012] border border-white/[0.06] p-2 text-center">
          <p className="text-[8px] uppercase tracking-wider text-white/30">Half</p>
          <p className="text-[13px] font-bold text-white/60">{position > 50 ? "Upper" : "Lower"}</p>
        </div>
      </div>
    </div>
  );
};

/* ── Squeeze History ── */
const SqueezeBar = ({ width, threshold }: { width: number; threshold: number }) => {
  const isSqueeze = width < threshold;
  const fillPct = Math.min((width / (threshold * 3)) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-white/30 w-12">{fmt(width, 1)}%</span>
      <div className="flex-1 h-3 rounded bg-white/[0.03] overflow-hidden relative">
        <div className="h-full rounded" style={{ width: `${fillPct}%`, background: isSqueeze ? "#F5C542" : "#9f8bff40" }} />
        {/* Threshold line */}
        <div className="absolute top-0 h-full w-px bg-[#f6465d]/50" style={{ left: `${(threshold / (threshold * 3)) * 100}%` }} />
      </div>
      {isSqueeze && <span className="text-[9px] font-bold text-[#F5C542]">SQZ</span>}
    </div>
  );
};

/* ── Mock State ── */
const BB_UPPER = 95_800;
const BB_LOWER = 93_200;
const CURRENT_PRICE = 94_500;
const BB_SQUEEZE = true;
const RSI_VALUE = 41;

const CONDITIONS = [
  { label: "BB squeeze active", met: true, current: "Width 1.2%", target: "< 2.0%" },
  { label: "Price at lower band", met: false, current: "1.5% away", target: "< 0.3%" },
  { label: "RSI < 35", met: false, current: `RSI ${RSI_VALUE}`, target: "< 35" },
  { label: "Volume confirmation", met: true, current: "1.1x avg", target: "> 1.0x" },
];

/* ── Main Page ── */
export default function BollingerReversionBotPage() {
  const [botState, setBotState] = useState<"SCANNING" | "ARMED" | "IN_TRADE" | "COOLDOWN">("SCANNING");
  const [bbPeriod, setBbPeriod] = useState(20);
  const [stdDev, setStdDev] = useState(2.0);
  const [rsiThreshold, setRsiThreshold] = useState(35);
  const [squeezeDetect, setSqueezeDetect] = useState(true);
  const [squeezeWidth, setSqueezeWidth] = useState(2.0);
  const [riskPct, setRiskPct] = useState(1.0);
  const [leverage, setLeverage] = useState(5);
  const [tpTarget, setTpTarget] = useState<"middle" | "opposite">("middle");
  const [slBeyond, setSlBeyond] = useState(0.5);

  const metCount = CONDITIONS.filter(c => c.met).length;
  const I = "mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-sm text-white outline-none";
  const L = "text-[11px] text-white/40";

  return (
    <BotProvider>
    <div className="flex h-full flex-col overflow-auto bg-[#0B0B0C] text-white">
      {/* 1. EXCHANGE BAR */}
      <div className="shrink-0 p-4 pb-0">
        <BotExchangeBar botName="Bollinger Reversion Engine" accentColor="#9f8bff" />
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* 2. TRUST BAR */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "Win Rate", value: "59%", color: "text-[#2bc48a]" },
            { label: "Avg RR", value: "1:1.4", color: "text-white" },
            { label: "Max Drawdown", value: "-4.9%", color: "text-[#f6465d]" },
            { label: "Profit Factor", value: "1.61", color: "text-white" },
            { label: "Sharpe", value: "1.34", color: "text-white" },
            { label: "Today PnL", value: "+$67.40", color: "text-[#2bc48a]" },
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
              <p className="mt-0.5 text-[12px] font-bold text-[#9f8bff]">Squeeze detected, waiting for band touch</p>
            </div>
          </Card>
        </div>

        {/* 4. BB STATUS PANEL (unique) */}
        <Card className="border-[#9f8bff]/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-bold">Bollinger Band Status</h3>
            <span className="text-[10px] font-mono text-white/30">Current: {fmtUsd(CURRENT_PRICE)}</span>
          </div>
          <BbBandVisual upper={BB_UPPER} lower={BB_LOWER} price={CURRENT_PRICE} squeeze={BB_SQUEEZE} />
          <div className="mt-4">
            <h4 className="text-[11px] font-semibold text-white/50 mb-2">Squeeze History (last 6 bars)</h4>
            <div className="space-y-1">
              {[2.8, 2.3, 1.9, 1.5, 1.2, 1.1].map((w, i) => (
                <SqueezeBar key={i} width={w} threshold={squeezeWidth} />
              ))}
            </div>
          </div>
        </Card>

        {/* Signals Overview */}
        <SignalsOverview overrides={[
          { id: "trend", status: "Neutral" },
          { id: "support-resistance", status: "Bullish" },
          { id: "volume", status: "Watching" },
          { id: "rsi-divergence", status: "Bullish" },
          { id: "vwap", status: "Bullish" },
          { id: "imbalance-fvg", status: "Neutral" },
        ]} />

        {/* 5. BACKTEST PANEL */}
        <BotBacktestPanel strategyName="BB Reversion" accentColor="#9f8bff" />

        {/* 6. SETUP + RISK (2 cols) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-[13px] font-bold mb-3">Strategy Setup</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>BB Period</label>
                  <input type="number" min={5} max={50} value={bbPeriod} onChange={e => setBbPeriod(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>Std Dev Multiplier</label>
                  <input type="number" step={0.1} min={1} max={4} value={stdDev} onChange={e => setStdDev(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>RSI Threshold</label>
                  <input type="number" min={20} max={45} value={rsiThreshold} onChange={e => setRsiThreshold(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>Squeeze Width (%)</label>
                  <input type="number" step={0.1} min={0.5} max={5} value={squeezeWidth} onChange={e => setSqueezeWidth(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#0F1012] px-3 py-2.5">
                <span className="text-[11px] text-white/60">Squeeze Detection</span>
                <button onClick={() => setSqueezeDetect(v => !v)}
                  className={cn("rounded-full px-3 py-1 text-[10px] font-bold border transition",
                    squeezeDetect ? "border-[#2bc48a]/30 bg-[#2bc48a]/10 text-[#2bc48a]" : "border-white/10 text-white/30")}>
                  {squeezeDetect ? "ON" : "OFF"}
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
              <div>
                <label className={L}>Take Profit Target</label>
                <div className="mt-1 flex gap-1">
                  {(["middle", "opposite"] as const).map(t => (
                    <button key={t} onClick={() => setTpTarget(t)}
                      className={cn("flex-1 rounded-lg border py-2 text-[11px] font-semibold capitalize transition",
                        tpTarget === t ? "border-[#9f8bff]/40 bg-[#9f8bff]/10 text-[#9f8bff]" : "border-white/10 text-white/40")}>
                      {t === "middle" ? "BB Middle" : "Opposite Band"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={L}>SL Beyond Band (%)</label>
                <input type="number" step={0.1} min={0.1} max={3} value={slBeyond} onChange={e => setSlBeyond(Number(e.target.value))} className={I} />
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-[#0F1012] p-3">
                <p className="text-[9px] uppercase tracking-wider text-white/30 mb-2">Current Trade Calc</p>
                <div className="flex justify-between text-[10px]">
                  <span className="text-white/40">TP target</span>
                  <span className="font-mono text-[#2bc48a]">{fmtUsd(tpTarget === "middle" ? (BB_UPPER + BB_LOWER) / 2 : BB_UPPER)}</span>
                </div>
                <div className="flex justify-between text-[10px] mt-1">
                  <span className="text-white/40">SL level</span>
                  <span className="font-mono text-[#f6465d]">{fmtUsd(BB_LOWER * (1 - slBeyond / 100))}</span>
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
                  { rule: "Price at BB lower band", met: false, value: "1.5% away" },
                  { rule: `RSI < ${rsiThreshold}`, met: RSI_VALUE < rsiThreshold, value: `RSI = ${RSI_VALUE}` },
                  { rule: "BB squeeze active", met: BB_SQUEEZE, value: "Width 1.2%" },
                  { rule: "Volume > avg", met: true, value: "1.1x" },
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
                  { rule: "Price at BB upper band", met: false, value: "1.4% away" },
                  { rule: `RSI > ${100 - rsiThreshold}`, met: RSI_VALUE > (100 - rsiThreshold), value: `RSI = ${RSI_VALUE}` },
                  { rule: "BB squeeze active", met: BB_SQUEEZE, value: "Width 1.2%" },
                  { rule: "Volume > avg", met: true, value: "1.1x" },
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
              <p className="text-[9px] uppercase tracking-wider text-white/30">Trades Today</p>
              <p className="mt-1 text-[14px] font-bold text-[#2bc48a] font-mono">4 wins / 2 losses</p>
            </div>
          </Card>
          <BotLivePanel botSlug="bollinger-reversion" botName="Bollinger Reversion Bot" accentColor="#9f8bff" />
          <BotExecutionLog accentColor="#9f8bff" />
        </div>

      </div>
    </div>
    </BotProvider>
  );
}
