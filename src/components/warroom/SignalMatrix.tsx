interface Props {
  data: {
    trendStrength: number; momentumScore: number; volatilityScore: number;
    liquidityActivity: number; breakoutProbability: number; fakeoutProbability: number;
    meanReversionProb: number; orderFlowBias: number; regimeClassification: string;
    aiConfidence: number; tradeQuality: number;
  };
}

const scoreColor = (v: number, invert = false) => {
  const s = invert ? 100 - v : v;
  if (s >= 70) return "#2bc48a";
  if (s >= 50) return "#F5C542";
  if (s >= 30) return "#FF9F43";
  return "#f6465d";
};

const regimeColor = (r: string) => r === "Trending" ? "#2bc48a" : r === "Ranging" ? "#F5C542" : r === "Volatile" ? "#FF9F43" : "#8A8F98";

const Bar = ({ value, color }: { value: number; color: string }) => (
  <div className="h-1 w-full rounded-full bg-white/[0.06]">
    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, value)}%`, background: color }} />
  </div>
);

export const SignalMatrix = ({ data }: Props) => {
  const signals = [
    { label: "Trend Strength", value: data.trendStrength, rank: 1 },
    { label: "Liquidity Activity", value: data.liquidityActivity, rank: 2 },
    { label: "AI Confidence", value: data.aiConfidence, rank: 3 },
    { label: "Momentum Score", value: data.momentumScore, rank: 4 },
    { label: "Order Flow Bias", value: data.orderFlowBias, rank: 5 },
    { label: "Trade Quality", value: data.tradeQuality, rank: 6 },
    { label: "Breakout Prob.", value: data.breakoutProbability, rank: 7 },
    { label: "Volatility", value: data.volatilityScore, rank: 8 },
    { label: "Fakeout Prob.", value: data.fakeoutProbability, rank: 9, invert: true },
    { label: "Mean Rev. Prob.", value: data.meanReversionProb, rank: 10, invert: true },
  ];

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#F5C542]" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
          <span className="text-[10px] font-bold tracking-wider text-[#F5C542] uppercase">Signal Matrix</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-[var(--textSubtle)]">Regime:</span>
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ color: regimeColor(data.regimeClassification), background: `${regimeColor(data.regimeClassification)}15` }}>
            {data.regimeClassification}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {signals.map((s) => {
          const color = scoreColor(s.value, s.invert);
          return (
            <div key={s.label} className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-[var(--textMuted)]">{s.label}</span>
                <span className="font-mono text-[9px] font-bold" style={{ color }}>{s.value}</span>
              </div>
              <Bar value={s.value} color={color} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
