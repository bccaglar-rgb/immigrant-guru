import type { FeedConfig, TileState } from "../types";

interface Props {
  tile: TileState;
  feeds: FeedConfig;
  indicatorsEnabled: boolean;
  signalInput?: {
    enabled: boolean;
    onToggle: (next: boolean) => void;
  };
  signalWeight?: {
    value: number;
    onChange: (next: number) => void;
  };
}

const stateTone = (state: string): string => {
  if (["NO-TRADE", "BLOCK", "HIGH", "WIDE", "POOR", "CROWDED_LONG", "CROWDED_SHORT", "VIOLENT", "RISK_DOMINANT", "SPOOF_RISK"].includes(state)) {
    return "border-[#704844] bg-[#271a19] text-[#d6b3af]";
  }
  if (["VALID", "PASS", "LOW", "GOOD", "UP", "ABOVE", "BUY", "ON", "STRONG", "BULL", "LONG", "REWARD_DOMINANT", "READY", "OPEN"].includes(state)) {
    return "border-[#6f765f] bg-[#1f251b] text-[#d8decf]";
  }
  if (["WEAK", "MED", "NORMAL", "WATCH", "BALANCED", "NARROW", "BUILDING"].includes(state)) {
    return "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]";
  }
  return "border-white/15 bg-[#1A1B1F] text-[#BFC2C7]";
};

export const TileCard = ({ tile, feeds, indicatorsEnabled, signalInput, signalWeight }: Props) => {
  const feedAvailable = tile.dependsOnFeeds.every((feed) => feeds[feed]);
  const indicatorAvailable = !tile.requiresIndicators || indicatorsEnabled;
  const isAvailable = feedAvailable && indicatorAvailable;
  const hasNumeric = typeof tile.value === "number";
  const primary = hasNumeric ? `${tile.value}${tile.unit ? ` ${tile.unit}` : ""}` : tile.state ?? "N/A";
  const displayState = isAvailable ? primary : "N/A";
  const disabledReason = !feedAvailable ? "Feed disabled" : "Indicators master OFF";

  return (
    <article className="relative rounded-xl border border-white/10 bg-[#0F1012] p-3 transition hover:border-[#F5C542]/45 hover:shadow-[0_0_0_1px_rgba(245,197,66,0.15)]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-[#BFC2C7]">{tile.label}</p>
          <div className="group/tooltip relative">
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/15 bg-[#14161a] text-[10px] text-[#9aa1ad] transition hover:border-[#F5C542]/60 hover:text-[#F5C542] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C542]/50"
              aria-label={`${tile.label} details`}
            >
              i
            </button>
            <div className="pointer-events-auto absolute right-0 top-full z-40 hidden w-64 rounded-lg border border-[#F5C542]/40 bg-[#121316]/95 p-2 text-[11px] text-[#BFC2C7] shadow-[0_20px_48px_rgba(0,0,0,0.45)] group-hover/tooltip:block group-focus-within/tooltip:block">
              <p className="font-semibold text-[#FFFFFF]">{tile.label}</p>
              <p className="mt-1 text-[#BFC2C7]">Raw: {isAvailable ? tile.rawValue ?? "N/A" : disabledReason}</p>
              <p className="text-[#BFC2C7]">Why: {isAvailable ? tile.shortExplanation ?? "N/A" : disabledReason}</p>
              <p className="text-[#BFC2C7]">Source: {isAvailable ? tile.source ?? "N/A" : disabledReason}</p>
              <p className="text-[#6B6F76]">Stale: {isAvailable ? (tile.stale ? "ON" : "OFF") : "N/A"}</p>
              <p className="text-[#6B6F76]">Updated: {new Date(tile.updatedAt).toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            isAvailable
              ? (hasNumeric ? "border-[#7a6840] bg-[#2a2418] text-[#FFFFFF]" : stateTone(displayState))
              : "border-white/10 bg-[#1A1B1F] text-[#6B6F76]"
          }`}
        >
          {displayState}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-[#6B6F76]">
        <div className="flex items-center gap-1">
          <span>Confidence</span>
          <span className="text-[#BFC2C7]">{isAvailable ? `${tile.confidence}%` : "-"}</span>
        </div>
        <div className="flex items-center gap-1">
          <span>Weight %</span>
          {signalWeight ? (
            <input
              type="number"
              min={1}
              max={10}
              step={1}
              value={signalWeight.value}
              onChange={(event) => {
                const numeric = Number(event.target.value);
                if (!Number.isFinite(numeric)) return;
                signalWeight.onChange(Math.max(1, Math.min(10, Math.round(numeric))));
              }}
              className="h-6 w-14 rounded-md border border-white/15 bg-[#101216] px-1.5 text-right text-[11px] font-semibold text-[#F5C542] focus:border-[#F5C542]/70 focus:outline-none"
            />
          ) : (
            <span className="text-[#BFC2C7]">-</span>
          )}
        </div>
      </div>

      {signalInput ? (
        <label className="mt-2 flex cursor-pointer items-center justify-between rounded-md border border-white/10 bg-[#111318] px-2 py-1 text-[11px] text-[#BFC2C7]">
          <span>{signalInput.enabled ? "Included in Flow" : "Excluded from Flow"}</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#F5C542]"
            checked={signalInput.enabled}
            onChange={(event) => signalInput.onToggle(event.target.checked)}
          />
        </label>
      ) : null}
    </article>
  );
};
