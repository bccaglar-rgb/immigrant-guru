import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface BotBacktestPanelProps {
  strategyName: string;
  accentColor?: string;
}

type Period = "7D" | "30D" | "90D" | "1Y" | "All";

const PERIODS: Period[] = ["7D", "30D", "90D", "1Y", "All"];

const PERIOD_POINTS: Record<Period, number> = {
  "7D": 14,
  "30D": 30,
  "90D": 90,
  "1Y": 200,
  All: 200,
};

function generateEquityCurve(points: number): { date: string; return: number }[] {
  const data: { date: string; return: number }[] = [];
  let cumulative = 0;
  const baseDate = new Date(2025, 0, 1);

  for (let i = 0; i < points; i++) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + i);

    const drift = 0.05;
    const volatility = 0.6;
    const change = drift + volatility * (Math.random() - 0.45);

    // Simulate occasional drawdowns
    const drawdown = Math.random() < 0.08 ? -(Math.random() * 2.5) : 0;
    cumulative += change + drawdown;

    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      return: parseFloat(cumulative.toFixed(2)),
    });
  }

  return data;
}

const STATS = [
  { label: "Win Rate", value: "61.2%", color: "text-emerald-400" },
  { label: "Total Trades", value: "184", color: "text-white" },
  { label: "Avg RR", value: "1:1.8", color: "text-white" },
  { label: "Max Drawdown", value: "-6.2%", color: "text-red-400" },
  { label: "Sharpe Ratio", value: "1.42", color: "text-white" },
  { label: "Profit Factor", value: "1.85", color: "text-white" },
  { label: "Avg Trade", value: "+0.34%", color: "text-emerald-400" },
  { label: "Best Trade", value: "+4.2%", color: "text-emerald-400" },
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const isPositive = val >= 0;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#161618] px-3 py-2 shadow-xl">
      <p className="text-xs text-white/40">{label}</p>
      <p
        className={`text-sm font-semibold ${
          isPositive ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isPositive ? "+" : ""}
        {val.toFixed(2)}%
      </p>
    </div>
  );
}

export default function BotBacktestPanel({
  strategyName,
  accentColor: _accentColor = "#10B981",
}: BotBacktestPanelProps) {
  const [period, setPeriod] = useState<Period>("1Y");

  const data = useMemo(() => generateEquityCurve(PERIOD_POINTS[period]), [period]);

  const lastReturn = data[data.length - 1]?.return ?? 0;
  const isPositive = lastReturn >= 0;
  const gradientColor = isPositive ? "#10B981" : "#EF4444";
  const gradientId = "equityCurveGradient";

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
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
              d="M3 13h2l3-8 4 16 3-8h6"
            />
          </svg>
          <h3 className="text-sm font-medium text-white">Backtest Performance</h3>
          <span className="text-xs text-white/30">{strategyName}</span>
        </div>
        <span
          className={`text-xs font-semibold ${
            isPositive ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {isPositive ? "+" : ""}
          {lastReturn.toFixed(2)}%
        </span>
      </div>

      {/* Period Tabs */}
      <div className="mb-3 flex gap-1">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              period === p
                ? "bg-white/[0.08] text-white"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="mb-4 h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={gradientColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={gradientColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="return"
              stroke={gradientColor}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3">
        {STATS.map((stat) => (
          <div key={stat.label} className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] text-white/30">{stat.label}</p>
            <p className={`text-sm font-semibold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
