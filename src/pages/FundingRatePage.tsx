import { DataSourceStatusBar } from "../components/DataSourceStatusBar";
import { SourceChip } from "../components/SourceChip";
import { useMarketData, usePageSourceChip } from "../hooks/useMarketData";

export default function FundingRatePage() {
  const market = useMarketData({
    symbol: "BTCUSDT",
    interval: "15m",
    lookback: 240,
  });
  const source = usePageSourceChip();
  const funding = (market.derivatives?.fundingRate ?? 0) * 100;
  const oi = market.derivatives?.oiValue ?? 0;
  const price = market.ticker?.price ?? 0;

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        <DataSourceStatusBar />
        <section className="rounded-2xl border border-white/10 bg-[#121316] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-white">Funding Rate</h1>
              <p className="text-xs text-[#6B6F76]">Live market stream</p>
            </div>
            <SourceChip sourceName={source.sourceName} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-[#0F1012] p-4">
              <p className="text-xs text-[#6B6F76]">BTC Price</p>
              <p className="mt-1 text-2xl font-semibold text-white">{price.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0F1012] p-4">
              <p className="text-xs text-[#6B6F76]">Funding Rate (8h)</p>
              <p className={`mt-1 text-2xl font-semibold ${funding >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{funding.toFixed(4)}%</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0F1012] p-4">
              <p className="text-xs text-[#6B6F76]">Open Interest (USDT)</p>
              <p className="mt-1 text-2xl font-semibold text-white">{oi.toLocaleString()}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
