interface BotRiskPanelProps {
  riskPerTrade?: number;
  maxOpenTrades?: number;
  leverage?: number;
  accentColor?: string;
}

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

function getLiquidationRisk(leverage: number): RiskLevel {
  if (leverage <= 2) return "LOW";
  if (leverage <= 5) return "MEDIUM";
  return "HIGH";
}

function getOverallRisk(
  riskPerTrade: number,
  maxOpenTrades: number,
  leverage: number
): { label: string; color: string; position: number } {
  const score = riskPerTrade * 2 + maxOpenTrades + leverage * 0.8;
  if (score <= 6) return { label: "Conservative", color: "text-emerald-400", position: 20 };
  if (score <= 12) return { label: "Balanced", color: "text-yellow-400", position: 50 };
  return { label: "Aggressive", color: "text-red-400", position: 85 };
}

const RISK_LEVEL_COLOR: Record<RiskLevel, string> = {
  LOW: "text-emerald-400",
  MEDIUM: "text-yellow-400",
  HIGH: "text-red-400",
};

const MARKET_CONDITIONS = [
  { label: "TREND OK", color: "text-emerald-400" },
  { label: "RANGING", color: "text-yellow-400" },
  { label: "CHOPPY", color: "text-red-400" },
] as const;

function getRiskColor(value: number): string {
  if (value <= 1) return "text-emerald-400";
  if (value <= 2) return "text-yellow-400";
  return "text-red-400";
}

export default function BotRiskPanel({
  riskPerTrade = 1,
  maxOpenTrades = 3,
  leverage = 3,
}: BotRiskPanelProps) {
  const worstCase = -(riskPerTrade * maxOpenTrades);
  const liqRisk = getLiquidationRisk(leverage);
  const overall = getOverallRisk(riskPerTrade, maxOpenTrades, leverage);
  const marketCondition = MARKET_CONDITIONS[0]; // mock: TREND OK

  const metrics = [
    {
      label: "Max Risk per Trade",
      value: `${riskPerTrade}%`,
      color: getRiskColor(riskPerTrade),
    },
    {
      label: "Max Open Trades",
      value: `${maxOpenTrades}`,
      color: "text-white",
    },
    {
      label: "Worst Case Loss",
      value: `${worstCase}%`,
      color: "text-red-400",
    },
    {
      label: "Liquidation Risk",
      value: liqRisk,
      color: RISK_LEVEL_COLOR[liqRisk],
    },
    {
      label: "Volatility Risk",
      value: "MEDIUM",
      color: "text-yellow-400",
    },
    {
      label: "Market Condition",
      value: marketCondition.label,
      color: marketCondition.color,
    },
  ];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <svg
          className="h-4 w-4 text-white/40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <h3 className="text-sm font-medium text-white">Risk Overview</h3>
      </div>

      {/* Metrics Grid */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-md bg-white/[0.02] px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wider text-white/20">{m.label}</p>
            <p className={`mt-0.5 text-[13px] font-semibold font-mono ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Risk Level Bar */}
      <div className="mb-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] text-white/30">Overall Risk Level</span>
          <span className={`text-xs font-semibold ${overall.color}`}>{overall.label}</span>
        </div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "linear-gradient(to right, #10B981, #FBBF24, #EF4444)",
            }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0B0B0C] bg-white shadow"
            style={{ left: `${overall.position}%` }}
          />
        </div>
      </div>
    </div>
  );
}
