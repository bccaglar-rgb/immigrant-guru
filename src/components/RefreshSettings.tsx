import type { AdminConfig } from "../types";

interface Props {
  globalRefreshSec: number;
  feeds: AdminConfig["feeds"];
  onChangeGlobalRefresh: (value: number) => void;
  onChangeFeed: (key: keyof AdminConfig["feeds"], value: boolean) => void;
}

export const RefreshSettings = ({ globalRefreshSec, feeds, onChangeGlobalRefresh, onChangeFeed }: Props) => (
  <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
    <h2 className="mb-3 text-sm font-semibold text-white">Update / Refresh Settings</h2>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-xs text-[#BFC2C7]">
        Global refresh interval (seconds)
        <input
          type="number"
          min={1}
          value={globalRefreshSec}
          onChange={(e) => onChangeGlobalRefresh(Math.max(1, Number(e.target.value) || 1))}
          className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none focus:border-[#F5C542]/50"
        />
      </label>
      <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
        <p className="mb-2 text-xs font-semibold text-white">Per-feed toggles</p>
        <div className="space-y-2 text-xs text-[#BFC2C7]">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[#F5C542]" checked={feeds.prices} onChange={(e) => onChangeFeed("prices", e.target.checked)} />
            Prices feed
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[#F5C542]" checked={feeds.derivatives} onChange={(e) => onChangeFeed("derivatives", e.target.checked)} />
            Derivatives feed
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[#F5C542]" checked={feeds.marketCap} onChange={(e) => onChangeFeed("marketCap", e.target.checked)} />
            MarketCap feed
          </label>
        </div>
      </div>
    </div>
  </section>
);
