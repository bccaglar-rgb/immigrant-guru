interface InsightBlock {
  title: string;
  content: string;
  sentiment: "bullish" | "bearish" | "neutral";
  timestamp: string;
}

interface KeyLevel {
  type: "support" | "resistance";
  price: number;
  strength: "strong" | "moderate" | "weak";
}

interface MarketInsightData {
  btcTrend: "Bullish" | "Bearish" | "Neutral";
  macroDirection: string;
  fearGreedIndex: number;
  fearGreedLabel: string;
  keyLevels: KeyLevel[];
  insights: InsightBlock[];
  aiCommentary: string;
}

interface MarketInsightPanelProps {
  data: MarketInsightData;
}

const FearGreedGauge = ({ value, label }: { value: number; label: string }) => {
  const angle = (value / 100) * 180 - 90;
  const color =
    value <= 25 ? "#f6465d" : value <= 45 ? "#FF9F43" : value <= 55 ? "#F5C542" : value <= 75 ? "#8fc9ab" : "#2bc48a";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-14 w-28 overflow-hidden">
        {/* Arc background */}
        <svg viewBox="0 0 120 60" className="absolute inset-0 h-full w-full">
          <path d="M 10 55 A 50 50 0 0 1 110 55" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" strokeLinecap="round" />
          <path
            d="M 10 55 A 50 50 0 0 1 110 55"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * 157} 157`}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        {/* Needle */}
        <div className="absolute bottom-0 left-1/2 h-10 w-0.5 origin-bottom transition-transform duration-1000 ease-out" style={{ transform: `translateX(-50%) rotate(${angle}deg)`, background: color }} />
        <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full" style={{ background: color }} />
      </div>
      <span className="font-mono text-lg font-bold" style={{ color }}>{value}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
    </div>
  );
};

const LevelRow = ({ level }: { level: KeyLevel }) => {
  const isSupport = level.type === "support";
  const color = isSupport ? "#2bc48a" : "#f6465d";
  const strengthDots = level.strength === "strong" ? 3 : level.strength === "moderate" ? 2 : 1;

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium" style={{ color }}>
          {isSupport ? "S" : "R"}
        </span>
        <span className="font-mono text-[11px] text-[var(--text)]">
          ${level.price.toLocaleString()}
        </span>
      </div>
      <div className="flex gap-0.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-1.5 w-1.5 rounded-full ${i < strengthDots ? "" : "opacity-20"}`} style={{ background: color }} />
        ))}
      </div>
    </div>
  );
};

const InsightCard = ({ insight }: { insight: InsightBlock }) => {
  const borderColor =
    insight.sentiment === "bullish" ? "#2bc48a" : insight.sentiment === "bearish" ? "#f6465d" : "#F5C542";

  return (
    <div className="rounded-xl border-l-2 bg-white/[0.02] px-3 py-2" style={{ borderColor }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[var(--text)]">{insight.title}</span>
        <span className="text-[8px] text-[var(--textSubtle)]">{insight.timestamp}</span>
      </div>
      <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--textMuted)]">{insight.content}</p>
    </div>
  );
};

export const MarketInsightPanel = ({ data }: MarketInsightPanelProps) => {
  const trendColor = data.btcTrend === "Bullish" ? "#2bc48a" : data.btcTrend === "Bearish" ? "#f6465d" : "#F5C542";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[var(--panel)] p-3.5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#FF9F43]/10">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#FF9F43]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-[var(--text)]">Market Intelligence</span>
      </div>

      {/* BTC Trend */}
      <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
        <span className="text-[10px] text-[var(--textMuted)]">BTC Trend</span>
        <span className="text-[11px] font-bold" style={{ color: trendColor }}>{data.btcTrend}</span>
      </div>

      {/* Macro */}
      <div className="rounded-xl bg-white/[0.03] px-3 py-2">
        <span className="text-[10px] text-[var(--textMuted)]">Macro Direction</span>
        <p className="mt-0.5 text-[11px] text-[var(--text)]">{data.macroDirection}</p>
      </div>

      {/* Fear & Greed */}
      <div className="flex justify-center rounded-xl bg-white/[0.03] px-3 py-3">
        <FearGreedGauge value={data.fearGreedIndex} label={data.fearGreedLabel} />
      </div>

      {/* Key Levels */}
      <div className="space-y-0.5">
        <span className="text-[10px] font-semibold text-[var(--textMuted)]">Key Levels</span>
        {data.keyLevels.map((level, i) => (
          <LevelRow key={i} level={level} />
        ))}
      </div>

      {/* AI Commentary */}
      <div className="rounded-xl bg-[#F5C542]/[0.04] border border-[#F5C542]/10 px-3 py-2">
        <div className="flex items-center gap-1.5 mb-1">
          <svg viewBox="0 0 24 24" className="h-3 w-3 text-[#F5C542]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" /><path d="M10 21h4" /></svg>
          <span className="text-[10px] font-semibold text-[#F5C542]">AI Analysis</span>
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--textMuted)]">{data.aiCommentary}</p>
      </div>

      {/* Insights */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-semibold text-[var(--textMuted)]">Latest Insights</span>
        {data.insights.map((ins, i) => (
          <InsightCard key={i} insight={ins} />
        ))}
      </div>
    </div>
  );
};
