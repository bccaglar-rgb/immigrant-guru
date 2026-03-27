/**
 * FlowHubCard — Compact card for each symbol in the Flow Mode Hub
 * Blue theme to distinguish from Balanced Hub's gold theme
 */
import type { FlowSnapshotItem, FlowDecision, BiasDirection, RegimeType } from "../../hooks/useFlowHub";

/* ── Decision colors (blue theme) ─────────────────────── */
const DECISION_STYLE: Record<FlowDecision, { bg: string; text: string; border: string; label: string }> = {
  NO_TRADE:    { bg: "bg-[#1c1416]", text: "text-[#d46a6a]", border: "border-[#5a3030]", label: "No Trade" },
  WATCHLIST:   { bg: "bg-[#131a26]", text: "text-[#6a9fd4]", border: "border-[#2a4a6f]", label: "Watchlist" },
  SCOUT:       { bg: "bg-[#132033]", text: "text-[#7ab8e0]", border: "border-[#2d5575]", label: "Scout" },
  APPROVED:    { bg: "bg-[#0f2540]", text: "text-[#5ec2f5]", border: "border-[#2967a0]", label: "Approved" },
  STRONG_FLOW: { bg: "bg-[#0a2035]", text: "text-[#00e0ff]", border: "border-[#1a6090]", label: "Strong Flow" },
};

const DIR_ARROW: Record<BiasDirection, { icon: string; color: string }> = {
  LONG:  { icon: "\u25B2", color: "text-[#53d18a]" },
  SHORT: { icon: "\u25BC", color: "text-[#d46a6a]" },
  NONE:  { icon: "\u25C6", color: "text-[#6B6F76]" },
};

const REGIME_BADGE: Record<RegimeType, { color: string; short: string }> = {
  TREND:           { color: "text-[#53d18a]", short: "TREND" },
  RANGE:           { color: "text-[#8ca8d4]", short: "RANGE" },
  BREAKOUT_SETUP:  { color: "text-[#e7d073]", short: "BRKO" },
  FAKE_BREAK_RISK: { color: "text-[#d4a06a]", short: "FAKE" },
  HIGH_STRESS:     { color: "text-[#d46a6a]", short: "STRESS" },
};

interface Props {
  item: FlowSnapshotItem;
  selected?: boolean;
  onClick?: () => void;
}

export function FlowHubCard({ item, selected, onClick }: Props) {
  const ds = DECISION_STYLE[item.decision] ?? DECISION_STYLE.NO_TRADE;
  const dir = DIR_ARROW[item.direction] ?? DIR_ARROW.NONE;
  const regime = REGIME_BADGE[item.regime] ?? REGIME_BADGE.RANGE;
  const coreBreak = item.payload?.coreBreakdown;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full text-left rounded-xl border transition-all duration-200 px-3 py-2.5 ${
        selected
          ? "border-[#3d8fcf]/60 bg-[#132033] shadow-[0_0_18px_rgba(61,143,207,0.15)]"
          : "border-[#3d5f8f]/40 bg-[#0d1620] hover:border-[#3d5f8f]/70 hover:bg-[#111d2c]"
      }`}
    >
      {/* Row 1: Symbol + Decision badge + Score */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-base font-bold ${dir.color}`}>{dir.icon}</span>
          <span className="truncate text-sm font-bold text-white">{item.symbol.replace("USDT", "")}</span>
          <span className="text-[10px] text-[#6B6F76]">USDT</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${ds.bg} ${ds.text} ${ds.border}`}>
            {ds.label}
          </span>
          <span className="text-sm font-bold text-[#b8d3ff]">{item.adjustedScore.toFixed(1)}</span>
        </div>
      </div>

      {/* Row 2: Regime + Core Score + Edge */}
      <div className="mt-1.5 flex items-center gap-3 text-[11px]">
        <span className={`font-medium ${regime.color}`}>{regime.short}</span>
        <span className="text-[#6B6F76]">Core</span>
        <span className="font-semibold text-[#b7bec9]">{item.coreScore.toFixed(1)}</span>
        <span className="text-[#6B6F76]">Edge</span>
        <span className={`font-semibold ${item.edgeR >= 0.3 ? "text-[#53d18a]" : item.edgeR >= 0.1 ? "text-[#e7d073]" : "text-[#d46a6a]"}`}>
          {item.edgeR.toFixed(2)}R
        </span>
        {item.penalty > 0 && (
          <>
            <span className="text-[#6B6F76]">Pen</span>
            <span className="text-[#d4a06a]">-{item.penalty.toFixed(1)}</span>
          </>
        )}
      </div>

      {/* Row 3: Mini core breakdown bars */}
      {coreBreak && (
        <div className="mt-1.5 flex items-center gap-1">
          {(["structure", "liquidity", "positioning", "volatility", "execution"] as const).map((key) => {
            const v = coreBreak[key] ?? 0;
            const barColor = v >= 65 ? "bg-[#5ec2f5]" : v >= 45 ? "bg-[#7ab8e0]" : "bg-[#d46a6a]";
            return (
              <div key={key} className="flex-1 flex flex-col items-center gap-0.5" title={`${key}: ${v.toFixed(0)}`}>
                <div className="h-[3px] w-full rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(v, 100)}%` }} />
                </div>
                <span className="text-[8px] uppercase text-[#6B6F76] leading-none">{key.slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Row 4: Position size + gates */}
      <div className="mt-1.5 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-2">
          {item.payload?.positionSize && (
            <span className="text-[#b7bec9]">
              Size: <span className="font-semibold text-white">{(item.payload.positionSize.sizeMultiplier * 100).toFixed(0)}%</span>
            </span>
          )}
          {item.payload?.fillProbability != null && (
            <span className="text-[#6B6F76]">
              Fill: {(item.payload.fillProbability * 100).toFixed(0)}%
            </span>
          )}
        </div>
        {!item.gatesPassed && item.failedGates.length > 0 && (
          <span className="text-[#d46a6a]">
            Gates: {item.failedGates.join(", ")}
          </span>
        )}
      </div>
    </button>
  );
}
