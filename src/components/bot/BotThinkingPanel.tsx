import { useMemo } from "react";

/* ── Types ── */

interface Condition {
  label: string;
  description?: string;
  met: boolean;
  currentValue?: string;
  targetValue?: string;
}

interface BotThinkingPanelProps {
  conditions: Condition[];
  action: string;
  confidence: number;
  symbol?: string;
  accentColor?: string;
}

/* ── Mock default data ── */

const DEFAULT_CONDITIONS: Condition[] = [
  { label: "EMA20 > EMA50", met: true, currentValue: "68,420", targetValue: "> 67,800" },
  { label: "RSI < 40", met: false, currentValue: "44", targetValue: "< 40" },
  { label: "Volume spike", met: true, currentValue: "2.4x avg", targetValue: "> 1.5x" },
  { label: "MACD crossover", met: true, currentValue: "Bullish", targetValue: "Bullish" },
  { label: "Support hold", met: false, currentValue: "67,200", targetValue: "> 67,500" },
  { label: "Funding rate", met: true, currentValue: "0.008%", targetValue: "< 0.02%" },
];

// Market state now derived from conditions — no hardcoded values
const deriveMarketState = (conditions: Condition[]) => {
  const trendCond = conditions.find(c => c.label.toLowerCase().includes("ema") || c.label.toLowerCase().includes("trend"));
  const rsiCond = conditions.find(c => c.label.toLowerCase().includes("rsi"));
  const volCond = conditions.find(c => c.label.toLowerCase().includes("volume") || c.label.toLowerCase().includes("vol"));
  const metCount = conditions.filter(c => c.met).length;
  const totalCount = conditions.length;

  return [
    { label: "Trend", value: trendCond?.met ? "Favorable" : "Unfavorable", color: trendCond?.met ? "#2cc497" : "#f6465d" },
    { label: "Conditions", value: `${metCount}/${totalCount}`, color: metCount > totalCount / 2 ? "#2cc497" : "#F5C542" },
    { label: "Volume", value: volCond?.met ? "Confirmed" : "Weak", color: volCond?.met ? "#2cc497" : "#FF9F43" },
    { label: "RSI", value: rsiCond?.currentValue ?? "—", color: rsiCond?.met ? "#2cc497" : "#FF9F43" },
  ];
};

/* ---- Icons ---- */

const BrainIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
    <path d="M9 21h6" />
    <path d="M12 2v4" />
    <path d="M8 8h8" />
    <path d="M10 12h4" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="7" fill="#2cc497" fillOpacity="0.15" />
    <path d="M4 7l2 2 4-4" stroke="#2cc497" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CrossIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="7" fill="#f6465d" fillOpacity="0.15" />
    <path d="M5 5l4 4M9 5l-4 4" stroke="#f6465d" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* ── Confidence bar color ── */

function confidenceGradient(pct: number): string {
  if (pct >= 70) return "linear-gradient(90deg, #2cc497, #2cc497)";
  if (pct >= 40) return `linear-gradient(90deg, #F5C542, #FF9F43)`;
  return "linear-gradient(90deg, #f6465d, #FF9F43)";
}

function confidenceLabel(pct: number): string {
  if (pct >= 80) return "Very High";
  if (pct >= 60) return "High";
  if (pct >= 40) return "Moderate";
  if (pct >= 20) return "Low";
  return "Very Low";
}

/* ── Component ── */

export const BotThinkingPanel = ({
  conditions = DEFAULT_CONDITIONS,
  action = "Waiting for pullback",
  confidence = 62,
  symbol = "BTC/USDT",
  accentColor: _accentColor,
}: BotThinkingPanelProps) => {
  const metCount = useMemo(() => conditions.filter((c) => c.met).length, [conditions]);

  return (
    <div className="w-[320px] max-w-full rounded-xl border border-white/[0.04] bg-white/[0.015]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-white">
          <BrainIcon />
          <span className="text-sm font-semibold">Bot Thinking</span>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">
          {symbol}
        </span>
      </div>

      {/* Action */}
      <div className="border-b border-white/[0.06] px-4 py-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">
          Current Action
        </p>
        <p className="mt-1 text-sm font-semibold text-white">{action}</p>
      </div>

      {/* Conditions */}
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">
            Conditions
          </p>
          <span className="text-[10px] text-white/40">
            {metCount}/{conditions.length} met
          </span>
        </div>
        <div className="space-y-1.5">
          {conditions.map((cond, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition"
              style={{ background: cond.met ? "rgba(44,196,151,0.04)" : "rgba(246,70,93,0.04)" }}
            >
              <div className="mt-0.5 flex-shrink-0">
                {cond.met ? <CheckIcon /> : <CrossIcon />}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-xs font-medium"
                  style={{ color: cond.met ? "#2cc497" : "#f6465d" }}
                >
                  {cond.label}
                </p>
                {(cond.currentValue || cond.targetValue) && (
                  <p className="mt-0.5 text-[10px] text-white/40">
                    {cond.currentValue && <span>{cond.currentValue}</span>}
                    {cond.targetValue && (
                      <span className="text-white/25"> (target: {cond.targetValue})</span>
                    )}
                  </p>
                )}
                {cond.description && (
                  <p className="mt-0.5 text-[10px] text-white/25">{cond.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current Market State */}
      <div className="border-b border-white/[0.06] px-4 py-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">
          Current Market State
        </p>
        <div className="grid grid-cols-2 gap-2">
          {deriveMarketState(conditions).map((item) => (
            <div key={item.label} className="rounded-lg bg-white/[0.03] px-2.5 py-2">
              <p className="text-[10px] text-white/30">{item.label}</p>
              <p className="text-xs font-semibold" style={{ color: item.color }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Confidence */}
      <div className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">
            Confidence
          </p>
          <span className="text-xs font-semibold text-white/70">
            {confidence}% - {confidenceLabel(confidence)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, confidence))}%`,
              background: confidenceGradient(confidence),
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default BotThinkingPanel;
