import { useState } from "react";

/* ══════════════════════════════════════════════════════════════
   SignalsOverview — 20 core market signals in a compact matrix
   ══════════════════════════════════════════════════════════════
   Minimal, premium, institutional. Fits existing bot page design.
   No heavy tables, no large charts, no visual clutter.
   Desktop: 4-5 cols. Mobile: 2 cols. Tooltip on hover.
*/

/* ── Signal Definition ── */

type SignalStatus = "Bullish" | "Bearish" | "Neutral" | "High Risk" | "Watching" | "Triggered";

interface SignalDef {
  id: string;
  name: string;
  tooltip: string;
  icon: string;
  defaultStatus: SignalStatus;
}

const SIGNALS: SignalDef[] = [
  /* ── Row 1: Critical 5 ── */
  { id: "trend",            name: "Trend",              tooltip: "Higher timeframe directional bias of the market.",                        icon: "\u2197", defaultStatus: "Bullish"  },
  { id: "market-structure",  name: "Market Structure",   tooltip: "Tracks HH, HL, LH, LL and structure breaks.",                            icon: "\u25B3", defaultStatus: "Bullish"  },
  { id: "liquidity",        name: "Liquidity",           tooltip: "Detects clustered stop zones and likely sweep areas.",                    icon: "\u25C9", defaultStatus: "Watching" },
  { id: "open-interest",    name: "Open Interest",       tooltip: "Measures derivatives positioning buildup or unwind.",                     icon: "\u25CE", defaultStatus: "Neutral"  },
  { id: "funding-rate",     name: "Funding Rate",        tooltip: "Shows long/short crowding in perpetual markets.",                         icon: "\u00A7", defaultStatus: "Bearish"  },

  /* ── Row 2: Important ── */
  { id: "whale-activity",   name: "Whale Activity",      tooltip: "Tracks large wallet and major participant movements.",                    icon: "\u{1F40B}", defaultStatus: "Watching" },
  { id: "exchange-flow",    name: "Exchange Flow",        tooltip: "Monitors inflow and outflow to exchanges for pressure signals.",          icon: "\u21C4", defaultStatus: "Neutral"  },
  { id: "volume",           name: "Volume",               tooltip: "Confirms whether moves are supported by real participation.",             icon: "\u25AE", defaultStatus: "Bullish"  },
  { id: "support-resistance",name: "Support / Resistance",tooltip: "Key reaction zones where price may reject or continue.",                 icon: "\u2550", defaultStatus: "Watching" },
  { id: "rsi-divergence",   name: "RSI Divergence",       tooltip: "Detects momentum weakness or hidden reversal pressure.",                 icon: "\u223F", defaultStatus: "Neutral"  },

  /* ── Row 3-4: Supporting ── */
  { id: "cvd",              name: "CVD",                  tooltip: "Compares aggressive buying and selling pressure.",                       icon: "\u2195", defaultStatus: "Bullish"  },
  { id: "liquidation-map",  name: "Liquidation Heatmap",  tooltip: "Highlights liquidation clusters price may target.",                      icon: "\u2622", defaultStatus: "High Risk"},
  { id: "on-chain",         name: "On-Chain Data",        tooltip: "Reads broader blockchain activity and holder behavior.",                 icon: "\u26D3", defaultStatus: "Neutral"  },
  { id: "squeeze",          name: "Long / Short Squeeze", tooltip: "Detects squeeze potential from crowded positioning.",                    icon: "\u26A1", defaultStatus: "Watching" },
  { id: "imbalance-fvg",    name: "Imbalance / FVG",      tooltip: "Marks inefficient price delivery zones.",                               icon: "\u25A8", defaultStatus: "Triggered"},

  { id: "vwap",             name: "VWAP",                 tooltip: "Tracks fair intraday value based on traded volume.",                     icon: "\u2261", defaultStatus: "Neutral"  },
  { id: "anchored-vwap",    name: "Anchored VWAP",        tooltip: "Measures value from a key market event or pivot.",                       icon: "\u2693", defaultStatus: "Bullish"  },
  { id: "delta-volume",     name: "Delta Volume",          tooltip: "Shows buy-side versus sell-side execution pressure.",                   icon: "\u0394", defaultStatus: "Watching" },
  { id: "volume-profile",   name: "Volume Profile",        tooltip: "Maps high-volume acceptance and rejection areas.",                      icon: "\u2593", defaultStatus: "Neutral"  },
  { id: "composite",        name: "Composite Signal",      tooltip: "Combines funding, OI, CVD and liquidity into one read.",               icon: "\u2726", defaultStatus: "Bullish"  },
];

/* ── Status Config ── */

const STATUS_CONFIG: Record<SignalStatus, { color: string; bg: string; border: string }> = {
  "Bullish":   { color: "#2bc48a", bg: "rgba(43,196,138,0.08)",  border: "rgba(43,196,138,0.15)" },
  "Bearish":   { color: "#f6465d", bg: "rgba(246,70,93,0.08)",   border: "rgba(246,70,93,0.15)"  },
  "Neutral":   { color: "#8e95a1", bg: "rgba(142,149,161,0.06)", border: "rgba(142,149,161,0.10)" },
  "High Risk": { color: "#f4906c", bg: "rgba(244,144,108,0.08)", border: "rgba(244,144,108,0.15)" },
  "Watching":  { color: "#F5C542", bg: "rgba(245,197,66,0.06)",  border: "rgba(245,197,66,0.12)" },
  "Triggered": { color: "#5B8DEF", bg: "rgba(91,141,239,0.08)",  border: "rgba(91,141,239,0.15)" },
};

/* ── Props ── */

interface SignalOverride {
  id: string;
  status: SignalStatus;
}

interface SignalsOverviewProps {
  /** Override default statuses per bot context */
  overrides?: SignalOverride[];
  /** Compact mode: smaller text, tighter spacing */
  compact?: boolean;
}

/* ── Component ── */

export default function SignalsOverview({ overrides, compact }: SignalsOverviewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const getStatus = (signal: SignalDef): SignalStatus => {
    const override = overrides?.find(o => o.id === signal.id);
    return override?.status ?? signal.defaultStatus;
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      {/* Header */}
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h3 className={`font-semibold text-white ${compact ? "text-[12px]" : "text-[13px]"}`}>
            Signals Overview
          </h3>
          <p className="mt-0.5 text-[9px] text-white/25">
            20 core market signals tracked for this bot
          </p>
        </div>
      </div>

      {/* Signal Matrix */}
      <div className={`grid gap-1 ${compact ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"}`}>
        {SIGNALS.map((signal) => {
          const status = getStatus(signal);
          const cfg = STATUS_CONFIG[status];
          const isHovered = hoveredId === signal.id;

          return (
            <div
              key={signal.id}
              className="group relative"
              onMouseEnter={() => setHoveredId(signal.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Signal Chip */}
              <div
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all duration-150 cursor-default select-none"
                style={{
                  background: isHovered ? cfg.bg : "rgba(255,255,255,0.015)",
                  border: `1px solid ${isHovered ? cfg.border : "rgba(255,255,255,0.04)"}`,
                }}
              >
                {/* Icon */}
                <span
                  className="flex-shrink-0 text-[11px] leading-none"
                  style={{ color: cfg.color, opacity: 0.7 }}
                >
                  {signal.icon}
                </span>

                {/* Name */}
                <span className="flex-1 truncate text-[10px] font-medium text-white/60">
                  {signal.name}
                </span>

                {/* Status Badge */}
                <span
                  className="flex-shrink-0 rounded px-1.5 py-[1px] text-[8px] font-semibold uppercase tracking-wide"
                  style={{ color: cfg.color, background: cfg.bg }}
                >
                  {status === "High Risk" ? "Risk" : status}
                </span>
              </div>

              {/* Tooltip */}
              {isHovered && (
                <div className="absolute left-1/2 bottom-full z-50 mb-1.5 -translate-x-1/2 pointer-events-none">
                  <div className="whitespace-nowrap rounded-md bg-[#1a1a1e] px-2.5 py-1.5 text-[9px] text-white/70 shadow-lg border border-white/[0.06]">
                    <span className="font-semibold text-white/90">{signal.name}</span>
                    <span className="mx-1 text-white/20">&middot;</span>
                    <span style={{ color: cfg.color }}>{status}</span>
                    <p className="mt-0.5 text-white/40 max-w-[240px] whitespace-normal leading-relaxed">
                      {signal.tooltip}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
