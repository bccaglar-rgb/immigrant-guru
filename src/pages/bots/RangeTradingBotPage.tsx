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

/* ── Range Position Visual ── */
const RangePositionVisual = ({
  upper, lower, price, adx, bbWidth,
}: { upper: number; lower: number; price: number; adx: number; bbWidth: number }) => {
  const range = upper - lower;
  const position = range > 0 ? ((price - lower) / range) * 100 : 50;
  const isRanging = adx < 25;
  const inLowerHalf = position < 50;
  const nearLower = position < 25;
  const nearUpper = position > 75;
  const posColor = nearLower ? "#2bc48a" : nearUpper ? "#f6465d" : "#9f8bff";

  return (
    <div className="space-y-4">
      {/* Range bounds */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-white/30">BB Lower</p>
          <p className="text-[15px] font-black font-mono text-[#2bc48a]">{fmtUsd(lower)}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-wider text-white/30">Current Price</p>
          <p className="text-[15px] font-black font-mono text-white">{fmtUsd(price)}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-wider text-white/30">BB Upper</p>
          <p className="text-[15px] font-black font-mono text-[#f6465d]">{fmtUsd(upper)}</p>
        </div>
      </div>

      {/* Price position bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-white/40">Price Position</span>
          <span className="text-[10px] font-mono" style={{ color: posColor }}>
            {fmt(position, 0)}% ({inLowerHalf ? "lower half" : "upper half"})
          </span>
        </div>
        <div className="relative h-8 rounded-lg overflow-hidden bg-[#0F1012] border border-white/[0.06]">
          {/* Zone gradient: green at left, neutral center, red at right */}
          <div className="absolute inset-0"
            style={{ background: "linear-gradient(90deg, rgba(43,196,138,0.2) 0%, rgba(43,196,138,0.05) 25%, rgba(255,255,255,0.02) 50%, rgba(246,70,93,0.05) 75%, rgba(246,70,93,0.2) 100%)" }} />
          {/* Buy zone marker */}
          <div className="absolute top-0 h-full border-r border-dashed border-[#2bc48a]/30" style={{ left: "25%" }} />
          {/* Sell zone marker */}
          <div className="absolute top-0 h-full border-l border-dashed border-[#f6465d]/30" style={{ left: "75%" }} />
          {/* Center line */}
          <div className="absolute top-0 h-full w-px bg-white/10" style={{ left: "50%" }} />
          {/* Price indicator */}
          <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-sm border-2 rotate-45"
            style={{
              left: `calc(${Math.max(3, Math.min(97, position))}% - 8px)`,
              borderColor: posColor,
              background: posColor + "40",
              boxShadow: `0 0 12px ${posColor}50`,
            }} />
        </div>
        <div className="flex justify-between text-[8px] text-white/20 mt-0.5">
          <span className="text-[#2bc48a]/50">BUY ZONE</span>
          <span>NEUTRAL</span>
          <span className="text-[#f6465d]/50">SELL ZONE</span>
        </div>
      </div>

      {/* ADX + BB Width */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "ADX", val: adx, max: 50, ok: isRanging, tag: isRanging ? "RANGING" : "TRENDING",
            color: isRanging ? "#2bc48a" : "#f6465d", unit: "" },
          { label: "BB Width", val: bbWidth, max: 8, ok: bbWidth < 4, tag: bbWidth < 4 ? "NORMAL" : "WIDE",
            color: "#9f8bff", unit: "%" },
        ].map((m, i) => (
          <div key={i} className="rounded-lg bg-[#0F1012] border border-white/[0.06] p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] uppercase tracking-wider text-white/30">{m.label}</p>
              <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold border",
                m.ok ? "border-[#2bc48a]/30 bg-[#2bc48a]/10 text-[#2bc48a]" : "border-[#f6465d]/30 bg-[#f6465d]/10 text-[#f6465d]")}>
                {m.tag} {m.ok ? "\u2713" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[20px] font-black font-mono" style={{ color: m.color }}>{m.val}{m.unit}</p>
              <div className="flex-1 h-3 rounded bg-white/[0.04] overflow-hidden">
                <div className="h-full rounded" style={{ width: `${Math.min((m.val / m.max) * 100, 100)}%`, background: m.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Mock State ── */
const BB_UPPER = 95_800;
const BB_LOWER = 93_200;
const CURRENT_PRICE = 94_110;
const ADX_VALUE = 19;
const BB_WIDTH = 2.1;
const RSI_VALUE = 42;

const CONDITIONS = [
  { label: "ADX < 25 (ranging)", met: true, current: `ADX ${ADX_VALUE}`, target: "< 25" },
  { label: "Near BB lower band", met: false, current: "1.8% away", target: "< 0.5%" },
  { label: "RSI < 35", met: false, current: `RSI ${RSI_VALUE}`, target: "< 35" },
  { label: "BB width normal", met: true, current: `${BB_WIDTH}%`, target: "< 4%" },
];

/* ── Main Page ── */
export default function RangeTradingBotPage() {
  const [botState, setBotState] = useState<"RANGING" | "NEAR_BOUND" | "IN_TRADE" | "BREAKOUT_PAUSE">("RANGING");
  const [bbPeriod, setBbPeriod] = useState(20);
  const [bbMult, setBbMult] = useState(2.0);
  const [adxMax, setAdxMax] = useState(25);
  const [rsiOversold, setRsiOversold] = useState(35);
  const [rsiOverbought, setRsiOverbought] = useState(65);
  const [positionSize, setPositionSize] = useState(100);
  const [riskPct, setRiskPct] = useState(1.0);
  const [leverage, setLeverage] = useState(3);
  const [timeExit, setTimeExit] = useState(12);

  const metCount = CONDITIONS.filter(c => c.met).length;
  const I = "mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-sm text-white outline-none";
  const L = "text-[11px] text-white/40";

  return (
    <BotProvider>
    <div className="flex h-full flex-col overflow-auto bg-[#0B0B0C] text-white">
      {/* 1. EXCHANGE BAR */}
      <div className="shrink-0 p-4 pb-0">
        <BotExchangeBar botName="Range Trading Engine" accentColor="#9f8bff" />
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* 2. TRUST BAR */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "Win Rate", value: "60%", color: "text-[#2bc48a]" },
            { label: "Avg RR", value: "1:1.3", color: "text-white" },
            { label: "Max Drawdown", value: "-4.5%", color: "text-[#f6465d]" },
            { label: "Profit Factor", value: "1.71", color: "text-white" },
            { label: "Sharpe", value: "1.45", color: "text-white" },
            { label: "Today PnL", value: "+$54.20", color: "text-[#2bc48a]" },
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
              <p className="mt-0.5 text-[12px] font-bold text-[#9f8bff]">Ranging market, waiting for BB lower</p>
            </div>
          </Card>
        </div>

        {/* 4. RANGE STATUS PANEL (unique) */}
        <Card className="border-[#9f8bff]/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-bold">Range Status</h3>
            <div className="flex items-center gap-2">
              <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold",
                ADX_VALUE < 25 ? "border-[#2bc48a]/30 bg-[#2bc48a]/10 text-[#2bc48a]" : "border-[#f6465d]/30 bg-[#f6465d]/10 text-[#f6465d]")}>
                {ADX_VALUE < 25 ? "RANGE CONFIRMED" : "TRENDING - PAUSED"}
              </span>
            </div>
          </div>
          <RangePositionVisual upper={BB_UPPER} lower={BB_LOWER} price={CURRENT_PRICE} adx={ADX_VALUE} bbWidth={BB_WIDTH} />
        </Card>

        {/* Signals Overview */}
        <SignalsOverview overrides={[
          { id: "trend", status: "Neutral" },
          { id: "support-resistance", status: "Triggered" },
          { id: "volume", status: "Neutral" },
          { id: "rsi-divergence", status: "Watching" },
          { id: "vwap", status: "Neutral" },
          { id: "liquidity", status: "Watching" },
          { id: "market-structure", status: "Neutral" },
        ]} />

        {/* 5. BACKTEST PANEL */}
        <BotBacktestPanel strategyName="Range Trading" accentColor="#9f8bff" />

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
                  <label className={L}>BB Multiplier</label>
                  <input type="number" step={0.1} min={1} max={4} value={bbMult} onChange={e => setBbMult(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={L}>ADX Max</label>
                  <input type="number" min={15} max={40} value={adxMax} onChange={e => setAdxMax(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>RSI Oversold</label>
                  <input type="number" min={15} max={45} value={rsiOversold} onChange={e => setRsiOversold(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>RSI Overbought</label>
                  <input type="number" min={55} max={85} value={rsiOverbought} onChange={e => setRsiOverbought(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>Position Size ($)</label>
                  <input type="number" min={10} max={10000} value={positionSize} onChange={e => setPositionSize(Number(e.target.value))} className={I} />
                </div>
                <div>
                  <label className={L}>Time Exit (candles)</label>
                  <input type="number" min={3} max={50} value={timeExit} onChange={e => setTimeExit(Number(e.target.value))} className={I} />
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-[#0F1012] p-3">
                <p className="text-[9px] uppercase tracking-wider text-white/30 mb-2">Range Metrics</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-white/40">BB Range</span>
                    <span className="font-mono text-white/60">{fmtUsd(BB_LOWER)} - {fmtUsd(BB_UPPER)}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-white/40">Range Width</span>
                    <span className="font-mono text-white/60">{fmtUsd(BB_UPPER - BB_LOWER)} ({BB_WIDTH}%)</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-white/40">Profit per cycle</span>
                    <span className="font-mono text-[#2bc48a]">~{fmtUsd((BB_UPPER - BB_LOWER) * 0.5 * (positionSize / CURRENT_PRICE))}</span>
                  </div>
                </div>
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
              {/* Range-specific risk metrics */}
              <div className="space-y-2">
                {[
                  { label: "Breakout risk", value: "LOW", ok: true },
                  { label: "BB expansion risk", value: "LOW", ok: true },
                  { label: "Max loss / trade", value: `-$${fmt(riskPct * positionSize / 100)}`, ok: false },
                  { label: "Time decay risk", value: "MODERATE", ok: false },
                ].map((r, i) => (
                  <div key={i} className={cn("flex items-center justify-between rounded-lg border bg-[#0F1012] px-3 py-2", r.ok ? "border-[#2bc48a]/20" : "border-[#F5C542]/20")}>
                    <span className="text-[11px] text-white/60">{r.label}</span>
                    <span className={cn("text-[11px] font-mono font-semibold", r.ok ? "text-[#2bc48a]" : "text-[#F5C542]")}>{r.value}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-[#2bc48a]/20 bg-[#2bc48a]/5 p-2.5 text-center">
                <p className="text-[10px] text-white/40">Overall Risk</p>
                <p className="text-[14px] font-bold text-[#2bc48a]">LOW - Range Intact</p>
              </div>
            </div>
          </Card>
        </div>

        {/* 7. STRATEGY LOGIC (interactive) */}
        <Card>
          <h3 className="text-[13px] font-bold mb-3">Strategy Logic</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-[#2bc48a]/20 bg-[#2bc48a]/5 p-3">
              <span className="text-[10px] font-bold text-[#2bc48a] uppercase tracking-wider">Long Entry (Buy at Bottom)</span>
              <div className="mt-2 space-y-1.5">
                {[
                  { rule: `ADX < ${adxMax} (ranging)`, met: ADX_VALUE < adxMax, value: `ADX = ${ADX_VALUE}` },
                  { rule: "Price near BB lower band", met: false, value: "1.8% away" },
                  { rule: `RSI < ${rsiOversold}`, met: RSI_VALUE < rsiOversold, value: `RSI = ${RSI_VALUE}` },
                  { rule: `BB width < 4% (normal)`, met: BB_WIDTH < 4, value: `${BB_WIDTH}%` },
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
              <span className="text-[10px] font-bold text-[#f6465d] uppercase tracking-wider">Short Entry (Sell at Top)</span>
              <div className="mt-2 space-y-1.5">
                {[
                  { rule: `ADX < ${adxMax} (ranging)`, met: ADX_VALUE < adxMax, value: `ADX = ${ADX_VALUE}` },
                  { rule: "Price near BB upper band", met: false, value: "1.8% away" },
                  { rule: `RSI > ${rsiOverbought}`, met: RSI_VALUE > rsiOverbought, value: `RSI = ${RSI_VALUE}` },
                  { rule: `BB width < 4% (normal)`, met: BB_WIDTH < 4, value: `${BB_WIDTH}%` },
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
              {(["RANGING", "NEAR_BOUND", "IN_TRADE", "BREAKOUT_PAUSE"] as const).map(s => (
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
              <p className="text-[9px] uppercase tracking-wider text-white/30">Range Cycles Today</p>
              <p className="mt-1 text-[14px] font-bold text-[#9f8bff] font-mono">3 complete</p>
            </div>
          </Card>
          <BotLivePanel botSlug="range-trading" botName="Range Trading Bot" accentColor="#9f8bff" />
          <BotExecutionLog accentColor="#9f8bff" />
        </div>

      </div>
    </div>
    </BotProvider>
  );
}
