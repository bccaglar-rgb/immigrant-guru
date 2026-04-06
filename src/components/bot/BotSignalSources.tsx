import { useState, useCallback } from "react";

/* ── Types ── */
interface SignalSource {
  id: string;
  label: string;
  enabled: boolean;
  description?: string;
}

interface BotSignalSourcesProps {
  sources?: SignalSource[];
  onChange?: (sources: SignalSource[]) => void;
  accentColor?: string;
}

/* ── Defaults ── */
const DEFAULT_SOURCES: SignalSource[] = [
  { id: "ema",           label: "EMA",           enabled: true,  description: "Exponential Moving Average crossovers" },
  { id: "rsi",           label: "RSI",           enabled: true,  description: "Relative Strength Index momentum" },
  { id: "volume",        label: "Volume",        enabled: true,  description: "Volume spike detection" },
  { id: "sniper",        label: "Sniper",        enabled: false, description: "Bitrium sniper entry timing" },
  { id: "sr-levels",     label: "S/R Levels",    enabled: true,  description: "Support & resistance zones" },
  { id: "institutional", label: "Institutional",  enabled: false, description: "Institutional order flow signals" },
];

const BITRIUM_IDS = new Set(["sniper", "institutional"]);

/* ── Component ── */
export default function BotSignalSources({
  sources: externalSources,
  onChange,
  accentColor = "#2bc48a",
}: BotSignalSourcesProps) {
  const [internal, setInternal] = useState<SignalSource[]>(DEFAULT_SOURCES);
  const sources = externalSources ?? internal;

  const toggle = useCallback(
    (id: string) => {
      const next = sources.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s));
      if (onChange) onChange(next);
      else setInternal(next);
    },
    [sources, onChange],
  );

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Signal Sources</h3>

      <div className="flex flex-wrap gap-2">
        {sources.map(s => (
          <button
            key={s.id}
            onClick={() => toggle(s.id)}
            className="group relative flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all"
            style={
              s.enabled
                ? { borderColor: `${accentColor}40`, background: `${accentColor}15`, color: accentColor }
                : { borderColor: "rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.3)" }
            }
          >
            {s.enabled && <span className="text-[10px]">&#10003;</span>}
            {s.label}
            {BITRIUM_IDS.has(s.id) && (
              <span className="ml-0.5 rounded bg-[#5B8DEF]/15 px-1 py-px text-[8px] font-bold text-[#5B8DEF]">
                BI
              </span>
            )}
            {/* Tooltip */}
            {s.description && (
              <span className="pointer-events-none absolute -bottom-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-[#1a1a1e] px-2 py-0.5 text-[9px] text-white/50 opacity-0 shadow-lg transition group-hover:opacity-100">
                {s.description}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="mt-3 flex items-center gap-1 text-[9px] text-white/20">
        <span className="rounded bg-[#5B8DEF]/15 px-1 py-px text-[8px] font-bold text-[#5B8DEF]">BI</span>
        Bitrium Intelligence \u2014 proprietary signal engine
      </p>
    </div>
  );
}
