import type { TileState } from "../types";

/* ── Metric layer groupings matching the user's 5 edge driver model ── */

interface MetricGroup {
  id: string;
  label: string;
  labelTr: string;
  priority: "EDGE" | "MULTIPLIER" | "RISK" | "CONTEXT";
  icon: string;
  tone: { chip: string; border: string; bg: string };
  keys: string[];
}

const EDGE_GROUPS: MetricGroup[] = [
  {
    id: "regime",
    label: "Market Regime",
    labelTr: "Structure Layer",
    priority: "EDGE",
    icon: "1",
    tone: {
      chip: "border-[#5e7d9a] bg-[#18222d] text-[#c8d8e9]",
      border: "border-[#5e7d9a]/35",
      bg: "bg-[#10151b]",
    },
    keys: [
      "market-regime",
      "trend-direction",
      "trend-strength",
      "trend-phase",
      "structure-age",
      "market-intent",
    ],
  },
  {
    id: "liquidity",
    label: "Liquidity",
    labelTr: "Liquidity Layer",
    priority: "EDGE",
    icon: "2",
    tone: {
      chip: "border-[#8a6d5a] bg-[#2b211a] text-[#e6d1c2]",
      border: "border-[#8a6d5a]/35",
      bg: "bg-[#17120f]",
    },
    keys: [
      "liquidity-cluster",
      "orderbook-imbalance",
      "liquidity-density",
      "stop-cluster-probability",
      "depth-quality",
      "aggressor-flow",
      "liquidity-refill-behaviour",
    ],
  },
  {
    id: "positioning",
    label: "Positioning",
    labelTr: "Positioning Layer",
    priority: "EDGE",
    icon: "3",
    tone: {
      chip: "border-[#87626f] bg-[#281a20] text-[#e4c8d2]",
      border: "border-[#87626f]/35",
      bg: "bg-[#171116]",
    },
    keys: [
      "funding-bias",
      "liquidations-bias",
      "oi-change",
      "buy-sell-imbalance",
      "spot-vs-derivatives-pressure",
      "real-momentum-score",
    ],
  },
  {
    id: "execution",
    label: "Execution Quality",
    labelTr: "Execution Layer",
    priority: "EDGE",
    icon: "4",
    tone: {
      chip: "border-[#7f6a3b] bg-[#2a2418] text-[#e7d9b3]",
      border: "border-[#7f6a3b]/35",
      bg: "bg-[#14130f]",
    },
    keys: [
      "spread-regime",
      "entry-quality",
      "slippage-risk",
      "entry-timing-window",
      "orderbook-stability",
      "reaction-sensitivity",
    ],
  },
  {
    id: "volatility",
    label: "Volatility State",
    labelTr: "Volatility Layer",
    priority: "EDGE",
    icon: "5",
    tone: {
      chip: "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]",
      border: "border-[#7a6840]/35",
      bg: "bg-[#16130f]",
    },
    keys: [
      "compression",
      "expansion-prob",
      "market-speed",
      "atr-regime",
      "sudden-move-risk",
      "breakout-risk",
    ],
  },
];

const EXTRA_GROUPS: MetricGroup[] = [
  {
    id: "multiplier",
    label: "Multiplier",
    labelTr: "Kazanc Carpani",
    priority: "MULTIPLIER",
    icon: "\u26A1",
    tone: {
      chip: "border-[#6f9a5e] bg-[#1c2a18] text-[#c8e9c8]",
      border: "border-[#6f9a5e]/35",
      bg: "bg-[#111a0f]",
    },
    keys: [
      "rr-potential",
      "asymmetry-score",
      "reward-distance",
      "reward-accessibility",
      "invalidation-distance",
    ],
  },
  {
    id: "risk",
    label: "Risk Filters",
    labelTr: "Risk Filtreleri",
    priority: "RISK",
    icon: "\u26A0",
    tone: {
      chip: "border-[#8b4f4f] bg-[#291818] text-[#e0b7b7]",
      border: "border-[#8b4f4f]/35",
      bg: "bg-[#171011]",
    },
    keys: [
      "risk-gate",
      "signal-conflict",
      "market-stress-level",
      "cascade-risk",
      "trap-probability",
      "trade-validity",
    ],
  },
  {
    id: "context",
    label: "Context",
    labelTr: "Yari Onemli",
    priority: "CONTEXT",
    icon: "\uD83E\uDDEA",
    tone: {
      chip: "border-[#5d6472] bg-[#1a202b] text-[#d5deed]",
      border: "border-[#5d6472]/35",
      bg: "bg-[#111722]",
    },
    keys: [
      "ema-alignment",
      "vwap-position",
      "time-in-range",
      "move-participation-score",
      "relative-strength-vs-market",
      "funding-slope",
    ],
  },
];

/* All groups combined (exported for potential external use) */
export const ALL_METRIC_GROUPS = [...EDGE_GROUPS, ...EXTRA_GROUPS];

/* ── Tile value renderer ── */

const stateTone = (state: string): string => {
  if (
    [
      "NO-TRADE",
      "BLOCK",
      "HIGH",
      "WIDE",
      "POOR",
      "CROWDED_LONG",
      "CROWDED_SHORT",
      "VIOLENT",
      "RISK_DOMINANT",
      "SPOOF_RISK",
    ].includes(state)
  )
    return "border-[#704844] bg-[#271a19] text-[#f6465d]";
  if (
    [
      "VALID",
      "PASS",
      "LOW",
      "GOOD",
      "UP",
      "ABOVE",
      "BUY",
      "ON",
      "STRONG",
      "BULL",
      "LONG",
      "REWARD_DOMINANT",
      "READY",
      "OPEN",
    ].includes(state)
  )
    return "border-[#6f765f] bg-[#1f251b] text-[#2cc497]";
  if (
    ["WEAK", "MED", "NORMAL", "WATCH", "BALANCED", "NARROW", "BUILDING"].includes(
      state,
    )
  )
    return "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]";
  return "border-white/15 bg-[#1A1B1F] text-[#BFC2C7]";
};

const MiniTile = ({ tile }: { tile: TileState }) => {
  const hasNumeric = typeof tile.value === "number";
  const display = hasNumeric
    ? `${tile.value}${tile.unit ? ` ${tile.unit}` : ""}`
    : tile.state ?? "N/A";
  const tone = hasNumeric
    ? "border-[#7a6840] bg-[#2a2418] text-[#FFFFFF]"
    : stateTone(display);

  return (
    <div className="flex items-center justify-between gap-2 rounded border border-white/[0.04] bg-white/[0.02] px-2 py-1">
      <span className="text-[11px] text-[#9CA3AF] min-w-0 truncate">
        {tile.label}
      </span>
      <span
        className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-tight ${tone}`}
      >
        {display}
      </span>
    </div>
  );
};

/* ── Layer score bar ── */

const LayerScoreBar = ({
  score,
  label,
}: {
  score: number | undefined;
  label: string;
}) => {
  const pct = typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;
  const color =
    pct >= 70
      ? "bg-[#2cc497]"
      : pct >= 45
        ? "bg-[#F5C542]"
        : pct > 0
          ? "bg-[#f6465d]"
          : "bg-white/10";

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#6B6F76] w-[56px] shrink-0 text-right">
        {label}
      </span>
      <div className="flex-1 h-1 rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-[#8A8F98] w-[30px] shrink-0">
        {typeof score === "number" ? `${Math.round(score)}%` : "-"}
      </span>
    </div>
  );
};

/* ── Main panel component ── */

interface ChartMetricsPanelProps {
  tiles: TileState[];
  layerScores?: Record<string, number>;
  loading?: boolean;
  error?: string | null;
}

export const ChartMetricsPanel = ({
  tiles,
  layerScores,
  loading,
  error,
}: ChartMetricsPanelProps) => {
  const tileMap = new Map(tiles.map((t) => [t.key, t]));

  if (loading) {
    return (
      <div className="mt-2 rounded-lg border border-white/[0.04] bg-[#0d0e11] p-3">
        <div className="flex items-center gap-2 text-[11px] text-[#555A63]">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#F5C542] border-t-transparent" />
          Loading metrics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-2 rounded-lg border border-[#704844]/20 bg-[#0d0e11] p-3">
        <p className="text-[11px] text-[#f6465d]">Metrics unavailable: {error}</p>
      </div>
    );
  }

  if (!tiles.length) return null;

  /* Layer score mapping from API */
  const scoreMap: Record<string, string> = {
    regime: "structure",
    liquidity: "microstructure",
    positioning: "positioning",
    execution: "execution",
    volatility: "volatility",
    risk: "risk",
    context: "onchain",
  };

  return (
    <div className="mt-2 space-y-1.5">
      {/* ── Layer scores overview bar ── */}
      {layerScores && (
        <div className="rounded-lg border border-white/[0.04] bg-[#0d0e11] p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#555A63]">
            Layer Scores
          </p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-4">
            <LayerScoreBar score={layerScores.structure} label="Structure" />
            <LayerScoreBar score={layerScores.microstructure} label="Liquidity" />
            <LayerScoreBar score={layerScores.positioning} label="Position" />
            <LayerScoreBar score={layerScores.execution} label="Execution" />
            <LayerScoreBar score={layerScores.volatility} label="Volatility" />
            <LayerScoreBar score={layerScores.risk} label="Risk" />
            <LayerScoreBar score={layerScores.onchain} label="On-Chain" />
          </div>
        </div>
      )}

      {/* ── Edge driver groups ── */}
      <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-5">
        {EDGE_GROUPS.map((group) => {
          const groupTiles = group.keys
            .map((k) => tileMap.get(k))
            .filter((t): t is TileState => !!t);
          if (!groupTiles.length) return null;

          return (
            <section
              key={group.id}
              className={`rounded-lg border p-2.5 ${group.tone.border} ${group.tone.bg}`}
            >
              <div className="mb-2 flex items-center gap-1.5">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${group.tone.chip}`}
                >
                  {group.icon}
                </span>
                <span className="text-[11px] font-semibold text-[#D1D5DB]">
                  {group.label}
                </span>
                {layerScores && scoreMap[group.id] && (
                  <span className="ml-auto text-[10px] font-semibold text-[#F5C542]">
                    {Math.round(layerScores[scoreMap[group.id]] ?? 0)}%
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {groupTiles.map((tile) => (
                  <MiniTile key={tile.key} tile={tile} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── Extra groups row ── */}
      <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-3">
        {EXTRA_GROUPS.map((group) => {
          const groupTiles = group.keys
            .map((k) => tileMap.get(k))
            .filter((t): t is TileState => !!t);
          if (!groupTiles.length) return null;

          const priorityLabel =
            group.priority === "MULTIPLIER"
              ? "Kazanc Carpani"
              : group.priority === "RISK"
                ? "Risk Filtreleri"
                : "Yari Onemli";

          return (
            <section
              key={group.id}
              className={`rounded-lg border p-2.5 ${group.tone.border} ${group.tone.bg}`}
            >
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-[11px]">{group.icon}</span>
                <span className="text-[11px] font-semibold text-[#D1D5DB]">
                  {group.label}
                </span>
                <span className="ml-auto rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-[#555A63]">
                  {priorityLabel}
                </span>
              </div>
              <div className="space-y-1">
                {groupTiles.map((tile) => (
                  <MiniTile key={tile.key} tile={tile} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
