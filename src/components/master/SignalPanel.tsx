interface SignalData {
  trendDirection: "Bullish" | "Bearish" | "Neutral";
  momentumStrength: number;
  volumeStrength: number;
  volatility: "Low" | "Medium" | "High" | "Extreme";
  aiSignalScore: number;
  entryRecommendation: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
  confidence: number;
}

interface SignalPanelProps {
  data: SignalData;
}

const GaugeBar = ({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--textMuted)]">{label}</span>
        <span className="font-mono text-[10px] font-semibold text-[var(--text)]">{value.toFixed(0)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
};

const Badge = ({ text, variant }: { text: string; variant: "green" | "red" | "yellow" | "blue" | "orange" }) => {
  const styles: Record<string, string> = {
    green: "bg-[#2bc48a]/15 text-[#2bc48a] border-[#2bc48a]/20",
    red: "bg-[#f6465d]/15 text-[#f6465d] border-[#f6465d]/20",
    yellow: "bg-[#F5C542]/15 text-[#F5C542] border-[#F5C542]/20",
    blue: "bg-[#5B8DEF]/15 text-[#5B8DEF] border-[#5B8DEF]/20",
    orange: "bg-[#FF9F43]/15 text-[#FF9F43] border-[#FF9F43]/20",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${styles[variant]}`}>
      {text}
    </span>
  );
};

const trendVariant = (d: string): "green" | "red" | "yellow" =>
  d === "Bullish" ? "green" : d === "Bearish" ? "red" : "yellow";

const entryVariant = (r: string): "green" | "red" | "yellow" | "blue" => {
  if (r.includes("Strong Buy")) return "green";
  if (r.includes("Buy")) return "green";
  if (r.includes("Strong Sell")) return "red";
  if (r.includes("Sell")) return "red";
  return "yellow";
};

const volatilityVariant = (v: string): "green" | "yellow" | "orange" | "red" => {
  if (v === "Low") return "green";
  if (v === "Medium") return "yellow";
  if (v === "High") return "orange";
  return "red";
};

export const SignalPanel = ({ data }: SignalPanelProps) => {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[var(--panel)] p-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#F5C542]/10">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#F5C542]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-[var(--text)]">Trading Signals</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2bc48a] animate-pulse" />
          <span className="text-[9px] text-[#2bc48a] font-medium">LIVE</span>
        </div>
      </div>

      {/* Signal Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {/* Trend */}
        <div className="space-y-1">
          <span className="text-[10px] text-[var(--textMuted)]">Trend Direction</span>
          <div><Badge text={data.trendDirection} variant={trendVariant(data.trendDirection)} /></div>
        </div>

        {/* Entry */}
        <div className="space-y-1">
          <span className="text-[10px] text-[var(--textMuted)]">Entry Signal</span>
          <div><Badge text={data.entryRecommendation} variant={entryVariant(data.entryRecommendation)} /></div>
        </div>

        {/* Momentum */}
        <GaugeBar label="Momentum" value={data.momentumStrength} color="#5B8DEF" />

        {/* Volume */}
        <GaugeBar label="Volume Strength" value={data.volumeStrength} color="#2bc48a" />

        {/* AI Score */}
        <GaugeBar label="AI Signal Score" value={data.aiSignalScore} color="#F5C542" />

        {/* Confidence */}
        <GaugeBar label="Confidence" value={data.confidence} color={data.confidence > 70 ? "#2bc48a" : data.confidence > 40 ? "#F5C542" : "#f6465d"} />
      </div>

      {/* Bottom Row */}
      <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--textMuted)]">Volatility</span>
          <Badge text={data.volatility} variant={volatilityVariant(data.volatility)} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--textMuted)]">AI Score</span>
          <span className={`font-mono text-sm font-bold ${data.aiSignalScore > 70 ? "text-[#2bc48a]" : data.aiSignalScore > 40 ? "text-[#F5C542]" : "text-[#f6465d]"}`}>
            {data.aiSignalScore}
          </span>
        </div>
      </div>
    </div>
  );
};
