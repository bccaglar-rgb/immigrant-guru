import { SectionHead } from "./MultiTimeframePanel";

interface Props { data: typeof import("./mockData").signals }

const sc = (v: number, inv = false) => { const s = inv ? 100 - v : v; return s >= 70 ? "#2bc48a" : s >= 50 ? "#F5C542" : s >= 30 ? "#FF9F43" : "#f6465d"; };

export const SignalIntelligencePanel = ({ data }: Props) => {
  const rows = [
    { l: "Trend Direction", v: data.trendDirection, c: data.trendDirection === "Bullish" ? "#2bc48a" : "#f6465d", bar: false },
    { l: "Market Regime", v: data.regime, c: data.regime === "Trending" ? "#2bc48a" : "#F5C542", bar: false },
    { l: "Momentum", v: data.momentumScore, c: sc(data.momentumScore), bar: true },
    { l: "Volume Expansion", v: data.volumeExpansion, c: sc(data.volumeExpansion), bar: true },
    { l: "Volatility", v: data.volatilityScore, c: sc(data.volatilityScore), bar: true },
    { l: "Breakout Prob.", v: data.breakoutProb, c: sc(data.breakoutProb), bar: true },
    { l: "Mean Rev. Prob.", v: data.meanRevProb, c: sc(data.meanRevProb, true), bar: true },
    { l: "Order Flow Bias", v: data.orderFlowBias, c: sc(data.orderFlowBias), bar: true },
    { l: "AI Conviction", v: data.aiConviction, c: sc(data.aiConviction), bar: true },
    { l: "Setup Quality", v: data.setupQuality, c: sc(data.setupQuality), bar: true },
    { l: "Liquidity Sweep", v: data.liquiditySweep ? "Detected" : "None", c: data.liquiditySweep ? "#FF9F43" : "#8A8F98", bar: false },
    { l: "Structure Break", v: data.structureBreak ? "Yes" : "No", c: data.structureBreak ? "#f6465d" : "#2bc48a", bar: false },
    { l: "Trade Readiness", v: data.tradeReadiness, c: data.tradeReadiness === "Ready" ? "#2bc48a" : "#F5C542", bar: false },
  ];

  return (
    <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-2.5 space-y-2">
      <SectionHead icon={<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>} label="Signal Intelligence" color="#F5C542" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {rows.map((r) => (
          <div key={r.l} className="space-y-px">
            <div className="flex items-center justify-between">
              <span className="text-[8px] text-[var(--textMuted)]">{r.l}</span>
              <span className="font-mono text-[8px] font-bold" style={{ color: r.c }}>{typeof r.v === "number" ? r.v : r.v}</span>
            </div>
            {r.bar && typeof r.v === "number" && (
              <div className="h-[3px] w-full rounded-full bg-white/[0.05]">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, r.v)}%`, background: r.c }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
