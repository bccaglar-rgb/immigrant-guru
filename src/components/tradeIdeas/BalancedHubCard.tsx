/**
 * BalancedHubCard — Compact card for each symbol in the Balanced Mode Hub
 */
import type { HubSnapshotItem, HubDecision, BiasDirection, RegimeType } from "../../hooks/useBalancedHub";

/* ── Decision colors ─────────────────────────────────── */
const DECISION_STYLE: Record<HubDecision, { bg: string; text: string; border: string; label: string }> = {
  NO_TRADE:     { bg: "bg-[#1c1416]", text: "text-[#d46a6a]", border: "border-[#5a3030]", label: "No Trade" },
  WATCHLIST:    { bg: "bg-[#1a1e25]", text: "text-[#8ca8d4]", border: "border-[#3d5575]", label: "Watchlist" },
  PROBE:        { bg: "bg-[#1a1f14]", text: "text-[#a3c97a]", border: "border-[#4a6a30]", label: "Probe" },
  APPROVED:     { bg: "bg-[#1f1e10]", text: "text-[#e7d073]", border: "border-[#7a6830]", label: "Approved" },
  HIGH_QUALITY: { bg: "bg-[#1a2510]", text: "text-[#53d18a]", border: "border-[#2d6b40]", label: "High Quality" },
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
  item: HubSnapshotItem;
  selected?: boolean;
  onClick?: () => void;
}

export function BalancedHubCard({ item, selected, onClick }: Props) {
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
          ? "border-[#F5C542]/60 bg-[#2a2418] shadow-[0_0_18px_rgba(245,197,66,0.12)]"
          : "border-[#7a6840]/40 bg-[#16130e] hover:border-[#7a6840]/70 hover:bg-[#1e1a12]"
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
          <span className="text-sm font-bold text-[#e7d9b3]">{item.adjustedScore.toFixed(1)}</span>
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
            const barColor = v >= 65 ? "bg-[#53d18a]" : v >= 45 ? "bg-[#e7d073]" : "bg-[#d46a6a]";
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
