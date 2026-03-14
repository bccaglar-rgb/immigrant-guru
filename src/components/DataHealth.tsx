import type { DataHealthState, FeedConfig, FeedKey } from "../types";

interface Props {
  health: DataHealthState;
  feeds: FeedConfig;
}

const feedLabels: Record<FeedKey, string> = {
  priceOhlcv: "Price OHLCV",
  orderbook: "Orderbook",
  trades: "Trades",
  rawFeeds: "Raw Feeds",
  openInterest: "Open Interest",
  fundingRate: "Funding Rate",
  netFlow: "Net Flow",
};

export const DataHealth = ({ health, feeds }: Props) => {
  const freshness = Math.max(0, 100 - health.lastUpdateAgeSec * 8 - health.missingFields * 4 - (health.staleFeed ? 18 : 0));

  return (
    <div className="rounded-xl border border-white/10 bg-[#121316] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-widest text-[#6B6F76]">Data Health</h4>
        <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${health.staleFeed ? "border-[#704844] bg-[#271a19] text-[#d6b3af]" : "border-[#6f765f] bg-[#1f251b] text-[#d8decf]"}`}>
          {health.staleFeed ? "STALE" : "LIVE"}
        </span>
      </div>

      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-[#0F1012]">
        <div className="h-full rounded-full bg-[#F5C542] transition-all" style={{ width: `${freshness}%` }} />
      </div>

      <div className="grid gap-2 text-xs text-[#BFC2C7] md:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <p className="text-[#6B6F76]">latency_ms</p>
          <p className="text-sm font-semibold text-white">{health.latencyMs}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <p className="text-[#6B6F76]">last_update_age</p>
          <p className="text-sm font-semibold text-white">{health.lastUpdateAgeSec}s</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <p className="text-[#6B6F76]">stale_feed</p>
          <p className="text-sm font-semibold text-white">{health.staleFeed ? "true" : "false"}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <p className="text-[#6B6F76]">missing_fields</p>
          <p className="text-sm font-semibold text-white">{health.missingFields}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-[11px] md:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(health.feedSources) as FeedKey[]).map((feed) => {
          const source = health.feedSources[feed];
          const enabled = feeds[feed];
          const healthy = source.healthy && enabled;

          return (
            <div key={feed} className="rounded-lg border border-white/10 bg-[#0F1012] px-2 py-1.5">
              <p className="text-[#BFC2C7]">{feedLabels[feed]}</p>
              <p className="text-[#6B6F76]">{source.source}</p>
              <p className={healthy ? "text-[#d8decf]" : "text-[#d6b3af]"}>{enabled ? (healthy ? "healthy" : "degraded") : "disabled"}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-[#6B6F76]">Updated: {new Date(health.updatedAt).toLocaleTimeString()}</p>
    </div>
  );
};
