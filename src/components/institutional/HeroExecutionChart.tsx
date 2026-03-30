import { LWChart, type OHLCVData } from "../shared/LWChart";

interface AIOverlay { bias: string; confidence: number; setup: string }
interface Props { data: OHLCVData[]; symbol: string; aiOverlay?: AIOverlay }

export const HeroExecutionChart = ({ data, symbol, aiOverlay }: Props) => {
  const last = data[data.length - 1], prev = data[data.length - 2];
  const pct = prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const up = pct >= 0;

  const overlayColor = aiOverlay?.bias === "LONG" ? "#2bc48a" : aiOverlay?.bias === "SHORT" ? "#f6465d" : "#8A8F98";

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.05] bg-[var(--panel)] h-full">
      <div className="flex items-center justify-between border-b border-white/[0.04] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--text)]">{symbol}</span>
          <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px] text-[var(--textMuted)]">1m</span>
          <span className="text-[9px] text-[#5B8DEF]">VWAP</span>
          <span className="text-[9px] text-[#F5C542]">EMA20</span>
          <span className="text-[9px] text-[#FF9F43]">EMA50</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`font-mono text-sm font-bold ${up ? "text-[#2bc48a]" : "text-[#f6465d]"}`}>${last?.close.toFixed(2)}</span>
          <span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold ${up ? "bg-[#2bc48a]/10 text-[#2bc48a]" : "bg-[#f6465d]/10 text-[#f6465d]"}`}>{up ? "+" : ""}{pct.toFixed(2)}%</span>
        </div>
      </div>

      {/* AI Decision Overlay — glassmorphism */}
      {aiOverlay && (
        <div
          className="absolute top-10 right-2.5 z-10 flex items-center gap-2 rounded-lg border px-2.5 py-1"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderColor: `${overlayColor}40`,
            boxShadow: `0 0 16px ${overlayColor}15`,
          }}
        >
          <span className="text-[9px] text-[var(--textSubtle)]">Bias:</span>
          <span className="text-[10px] font-black" style={{ color: overlayColor }}>{aiOverlay.bias}</span>
          <span className="text-white/[0.1]">|</span>
          <span className="text-[9px] text-[var(--textSubtle)]">Conf:</span>
          <span className="text-[10px] font-bold" style={{ color: overlayColor }}>{aiOverlay.confidence}%</span>
          <span className="text-white/[0.1]">|</span>
          <span className="text-[9px] text-[var(--textSubtle)]">Setup:</span>
          <span className="text-[10px] font-bold text-[#5B8DEF]">{aiOverlay.setup}</span>
        </div>
      )}

      {/* Overlay metrics moved to Quick Stats panel */}
      <div className="relative flex-1 min-h-0">
        <LWChart data={data} showVolume showIndicators />
      </div>
    </div>
  );
};
