import { useEffect, useMemo, useState } from "react";
import { scoringModeLabel } from "../data/scoringEngine";
import type { TradeIdea } from "../types";

interface Props {
  idea: TradeIdea;
  selected: boolean;
  featured: boolean;
  onClick: () => void;
  onView?: () => void;
  onTrade?: () => void;
  onCoinClick?: (coin: string) => void;
}

const price = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
const MODE_ORDER = ["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"] as const;

export const TradeIdeaCard = ({ idea, selected, featured, onClick, onView, onTrade, onCoinClick }: Props) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsedText = useMemo(() => {
    const created = new Date(idea.createdAt).getTime();
    const diffSec = Math.max(0, Math.floor((nowMs - created) / 1000));
    const mm = Math.floor(diffSec / 60);
    const ss = diffSec % 60;
    return `${mm}m ${String(ss).padStart(2, "0")}s ago`;
  }, [idea.createdAt, nowMs]);
  const approvedModes = useMemo(() => {
    const fromIdea = Array.isArray(idea.approvedModes) ? idea.approvedModes : [];
    const merged = [...fromIdea]
      .map((mode) => String(mode).toUpperCase())
      .filter((mode): mode is (typeof MODE_ORDER)[number] => MODE_ORDER.includes(mode as (typeof MODE_ORDER)[number]));
    const unique = merged.filter((mode, index, arr) => arr.indexOf(mode) === index);
    return MODE_ORDER.filter((mode) => unique.includes(mode));
  }, [idea.approvedModes]);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`w-full min-w-0 rounded-lg border bg-[#15171b] px-3 py-2 text-left transition ${
        selected
          ? "border-[#F5C542]/70 shadow-[0_0_0_1px_rgba(245,197,66,0.18)]"
          : "border-white/10 hover:border-[#F5C542]/35"
      } border-t-2 border-t-[#F5C542] cursor-pointer`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCoinClick?.(idea.coin);
            }}
            className="text-xs font-semibold text-white hover:text-[#F5C542]"
          >
            {idea.coin}/{idea.quote} · {idea.timeframe}
          </button>
          {featured ? <span className="rounded border border-[#F5C542]/50 bg-[#2b2417] px-1.5 py-0.5 text-[10px] font-semibold text-[#F5C542]">FEATURED</span> : null}
        </div>
        <p className="text-xs font-semibold text-[#F5C542]">{idea.confidence.toFixed(2)}</p>
      </div>
      {approvedModes.length ? (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Approved</span>
          {approvedModes.map((mode) => (
            <span
              key={`${idea.id}-mode-${mode}`}
              className="rounded border border-[#39517a]/70 bg-[#162136] px-1.5 py-0.5 text-[10px] font-semibold text-[#cdd9f8]"
            >
              {scoringModeLabel(mode)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="space-y-1 text-xs text-[#BFC2C7]">
        <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Entry Zone</p>
        <p>{price(idea.entryLow)} - {price(idea.entryHigh)}</p>

        <p className="pt-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Stop Levels</p>
        {idea.stops.map((stop, idx) => (
          <p key={`${idea.id}-sl-${idx}`}>SL{idx + 1}: {price(stop.price)} ({stop.weightPct}%)</p>
        ))}

        <p className="pt-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Targets</p>
        {idea.targets.map((target, idx) => (
          <p key={`${idea.id}-tp-${idx}`}>TP{idx + 1}: {price(target.price)} ({target.weightPct}%)</p>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (onView) onView();
              else onClick();
            }}
            className="rounded border border-white/15 bg-[#0F1012] px-2 py-0.5 text-[10px] font-semibold text-[#BFC2C7] hover:border-[#F5C542]/40 hover:text-[#F5C542]"
          >
            View
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (onTrade) onTrade();
            }}
            className="rounded border border-[#7a6840] bg-[#2a2418] px-2 py-0.5 text-[10px] font-semibold text-[#F5C542] hover:border-[#F5C542]/70"
          >
            Trade
          </button>
        </div>
        <span className="rounded border border-white/10 bg-[#0F1012] px-1.5 py-0.5 text-[10px] text-[#9aa1ad]">{elapsedText}</span>
      </div>
    </article>
  );
};
