import type { FeedConfig, FeedKey, HorizonMode, RiskMode, ScenarioConfig } from "../types";

interface Props {
  feeds: FeedConfig;
  scenario: ScenarioConfig;
  onFeedChange: (key: FeedKey, value: boolean) => void;
  onScenarioChange: (next: ScenarioConfig) => void;
  advanced: boolean;
  onAdvancedToggle: (next: boolean) => void;
  title?: string;
  subtitle?: string;
}

const feedLabels: Array<{ key: FeedKey; label: string }> = [
  { key: "priceOhlcv", label: "Price OHLCV" },
  { key: "orderbook", label: "Orderbook" },
  { key: "trades", label: "Trades" },
  { key: "rawFeeds", label: "Raw Feeds (Advanced)" },
  { key: "openInterest", label: "Open Interest" },
  { key: "fundingRate", label: "Funding Rate" },
  { key: "netFlow", label: "Net Flow" },
];

const scenarioButton = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold transition ${
    active
      ? "border-[#F5C542]/70 bg-[#2b2417] text-[#F5C542]"
      : "border-white/15 bg-[#111215] text-[#BFC2C7] hover:bg-[#17191d]"
  }`;

const horizons: HorizonMode[] = ["SCALP", "INTRADAY", "SWING"];
const riskModes: RiskMode[] = ["CONSERVATIVE", "NORMAL", "AGGRESSIVE"];

export const FeedToggles = ({
  feeds,
  scenario,
  onFeedChange,
  onScenarioChange,
  advanced,
  onAdvancedToggle,
  title = "Feed Toggles",
  subtitle,
}: Props) => {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#121316] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle ? <p className="text-[11px] text-[#6B6F76]">{subtitle}</p> : null}
        </div>
        <button type="button" onClick={() => onAdvancedToggle(!advanced)} className={scenarioButton(advanced)}>
          Advanced {advanced ? "ON" : "OFF"}
        </button>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {feedLabels.map((feed) => (
          <label key={feed.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-xs text-[#BFC2C7] hover:bg-[#15171b]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#F5C542]"
              checked={feeds[feed.key]}
              onChange={(e) => onFeedChange(feed.key, e.target.checked)}
            />
            {feed.label}
          </label>
        ))}
      </div>

      <div className="grid gap-3 border-t border-white/10 pt-3 lg:grid-cols-3">
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wider text-[#6B6F76]">Horizon</p>
          <div className="flex flex-wrap gap-2">
            {horizons.map((value) => (
              <button key={value} type="button" className={scenarioButton(scenario.horizon === value)} onClick={() => onScenarioChange({ ...scenario, horizon: value })}>
                {value}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wider text-[#6B6F76]">Risk Mode</p>
          <div className="flex flex-wrap gap-2">
            {riskModes.map((value) => (
              <button key={value} type="button" className={scenarioButton(scenario.riskMode === value)} onClick={() => onScenarioChange({ ...scenario, riskMode: value })}>
                {value}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wider text-[#6B6F76]">Breakout Only</p>
          <button type="button" className={scenarioButton(scenario.breakoutOnly)} onClick={() => onScenarioChange({ ...scenario, breakoutOnly: !scenario.breakoutOnly })}>
            {scenario.breakoutOnly ? "ON" : "OFF"}
          </button>
        </div>
      </div>
    </div>
  );
};
