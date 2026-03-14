import { useEffect, useRef, useState } from "react";
import { TILE_LABELS } from "../data/tileLabels";

interface Props {
  sourceSelection: string;
  sourceOptions: Array<{ value: string; label: string }>;
  status: "GOOD" | "BAD" | "STALE" | "NO_CONNECTION";
  latencyMs?: number | null;
  warningText?: string;
  showAddExchangeCta?: boolean;
  onAddExchange?: () => void;
  onSourceChange: (value: string) => void;
  activeTileLabels?: string[];
}

export const DashboardHeader = ({
  sourceSelection,
  sourceOptions,
  status,
  latencyMs,
  warningText,
  showAddExchangeCta,
  onAddExchange,
  onSourceChange,
  activeTileLabels,
}: Props) => {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement | null>(null);
  const tilesToShow = activeTileLabels?.length ? activeTileLabels : TILE_LABELS;

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!infoRef.current) return;
      if (!infoRef.current.contains(event.target as Node)) setInfoOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInfoOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <header className="rounded-2xl border border-white/10 bg-[#121316] px-4 py-3 shadow-[0_20px_48px_rgba(0,0,0,0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          <span>Bitrium Quant Engine</span>
        </h1>
        <div className="min-h-[42px] text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-[#BFC2C7]">Source:</span>
            <select
              className="rounded-lg border border-white/15 bg-[#0F1012] px-2 py-1 text-xs text-[#E7E9ED] outline-none transition hover:shadow-[0_0_10px_rgba(245,197,66,0.2)] focus:border-[#F5C542]/50"
              value={sourceSelection}
              onChange={(e) => onSourceChange(e.target.value)}
            >
              {sourceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div ref={infoRef} className="relative">
              <button
                type="button"
                aria-label="Tiles info"
                onClick={() => setInfoOpen((prev) => !prev)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setInfoOpen((prev) => !prev);
                  }
                }}
                className="flex h-5 w-5 items-center justify-center rounded-full text-[14px] text-[#8e95a3] transition hover:text-[#c3cad8] hover:shadow-[0_0_10px_rgba(245,197,66,0.16)]"
              >
                ⓘ
              </button>
              {infoOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[260px] max-h-[260px] overflow-y-auto rounded-xl border border-white/10 bg-[#101216] p-3 text-left shadow-[0_20px_48px_rgba(0,0,0,0.45)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#E7E9ED]">Tiles shown</p>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-[#BFC2C7]">
                    {tilesToShow.map((label) => (
                      <li key={label} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#F5C542]" />
                        <span>{label}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-[#7f8796]">Tiles vary by view and data availability.</p>
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-1 min-h-[18px] text-[12px] text-[#7f8796]">
            {warningText ? (
              <span className="inline-flex items-center gap-1 text-[#c8b6a0]">
                <span>⚠</span>
                <span>{warningText}</span>
              </span>
            ) : showAddExchangeCta ? (
              <button
                type="button"
                onClick={onAddExchange}
                className="text-[#F5C542] underline underline-offset-2 hover:text-[#ffd76f]"
              >
                Add your exchange
              </button>
            ) : (
              <div className="inline-flex items-center gap-1">
                <span className="rounded-full border border-white/10 bg-[#0F1012] px-2 py-0.5 text-[10px] text-[#BFC2C7]">
                  {latencyMs !== null && latencyMs !== undefined ? `Latency ${Math.round(latencyMs)}ms` : "Latency -"}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    status === "GOOD"
                      ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]"
                      : status === "BAD"
                        ? "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]"
                        : status === "STALE"
                          ? "border-[#704844] bg-[#271a19] text-[#d6b3af]"
                          : "border-white/15 bg-[#171a1f] text-[#c1c7d3]"
                  }`}
                >
                  {status === "NO_CONNECTION" ? "NO CONNECTION" : status}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="mt-1 text-sm text-[#6B6F76]">
        Real-time quantitative intelligence designed to identify directional edge, detect crowding shifts, and validate execution quality across crypto futures markets.
      </p>
    </header>
  );
};
