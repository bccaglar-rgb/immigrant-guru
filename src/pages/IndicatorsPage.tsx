import { useEffect, useMemo, useRef, useState } from "react";

type TabKey = "fear-greed" | "altcoin-season" | "market-cycles" | "btc-dominance" | "cmc20" | "cmc100";

interface SeriesDef {
  label: string;
  color: string;
  values: number[];
  fill?: boolean;
}

interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
}

interface IndicatorsSnapshotResponse {
  ok: boolean;
  fearGreed?: {
    current: number;
    history: number[];
  };
  market?: {
    totalMarketCapUsd: number;
    btcDominance: number;
    ethDominance: number;
    coins: MarketCoin[];
  };
  btcChart?: {
    prices: number[];
    volumes: number[];
  };
  fetchedAt?: string;
  error?: string;
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "fear-greed", label: "Fear & Greed" },
  { key: "altcoin-season", label: "Altcoin Season" },
  { key: "market-cycles", label: "Market Cycles" },
  { key: "btc-dominance", label: "BTC Dominance" },
  { key: "cmc20", label: "CMC20" },
  { key: "cmc100", label: "CMC100" },
];

const cardCls = "rounded-xl border border-white/10 bg-[#121316] p-5";
const chipCls = "rounded-lg border border-white/15 bg-[#0F1012] px-3 py-1 text-xs text-[#BFC2C7]";
const sectionTitle = "text-lg font-semibold text-white";
const MAX_POINTS = 180;

const appendValue = (arr: number[], next: number) => [...arr.slice(-(MAX_POINTS - 1)), Number(next.toFixed(4))];
const fmtUsd = (v: number, d = 2) => `$${v.toLocaleString(undefined, { maximumFractionDigits: d })}`;
const fmtPct = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

const toPath = (values: number[], width: number, height: number, min: number, max: number) => {
  if (!values.length) return "";
  const span = Math.max(max - min, 1e-9);
  return values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
};

const ChartPanel = ({ title, series, yRight }: { title: string; series: SeriesDef[]; yRight?: string }) => {
  const width = 980;
  const height = 360;
  const [min, max] = useMemo(() => {
    const all = series.flatMap((s) => s.values);
    if (!all.length) return [0, 1];
    return [Math.min(...all), Math.max(...all)];
  }, [series]);

  return (
    <section className={`${cardCls} min-w-0`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[22px] font-semibold text-white">{title}</h3>
        <div className="flex gap-2">
          <button type="button" className={chipCls}>Live</button>
          <button type="button" className={`${chipCls} border-white/20 bg-[#1f2331] font-semibold`}>Auto refresh</button>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-4 text-sm text-[#9ba3b4]">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[380px] w-full rounded-lg bg-[#0F1012]">
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={i}
              x1={0}
              x2={width}
              y1={(i * height) / 4}
              y2={(i * height) / 4}
              stroke="rgba(255,255,255,0.12)"
              strokeDasharray="2 3"
            />
          ))}
          {series.map((s) => {
            const d = toPath(s.values, width, height, min, max);
            const fillD = `${d} L ${width},${height} L 0,${height} Z`;
            return (
              <g key={s.label}>
                {s.fill ? <path d={fillD} fill={`${s.color}20`} /> : null}
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
              </g>
            );
          })}
        </svg>
        {yRight ? <span className="absolute right-2 top-2 text-sm text-[#9ba3b4]">{yRight}</span> : null}
      </div>
    </section>
  );
};

export default function IndicatorsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("fear-greed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fgValue, setFgValue] = useState(50);
  const [fgHistory, setFgHistory] = useState<number[]>([]);
  const [btcPriceSeries, setBtcPriceSeries] = useState<number[]>([]);
  const [btcVolSeries, setBtcVolSeries] = useState<number[]>([]);

  const [altSeason, setAltSeason] = useState(50);
  const [altSeasonSeries, setAltSeasonSeries] = useState<number[]>([]);
  const [altMcapSeries, setAltMcapSeries] = useState<number[]>([]);

  const [btcDom, setBtcDom] = useState(50);
  const [ethDom, setEthDom] = useState(15);
  const [othersDom, setOthersDom] = useState(35);
  const [btcDomSeries, setBtcDomSeries] = useState<number[]>([]);
  const [ethDomSeries, setEthDomSeries] = useState<number[]>([]);
  const [othersDomSeries, setOthersDomSeries] = useState<number[]>([]);

  const [cmc20, setCmc20] = useState(100);
  const [cmc100, setCmc100] = useState(100);
  const [cmc20Series, setCmc20Series] = useState<number[]>([]);
  const [cmc100Series, setCmc100Series] = useState<number[]>([]);
  const [constituents, setConstituents] = useState<MarketCoin[]>([]);

  const [puellSeries, setPuellSeries] = useState<number[]>([]);
  const [pi1Series, setPi1Series] = useState<number[]>([]);
  const [pi2Series, setPi2Series] = useState<number[]>([]);
  const [rainbowSeries, setRainbowSeries] = useState<number[]>([]);

  const baseCap20Ref = useRef<number | null>(null);
  const baseCap100Ref = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch("/api/market/indicators");
        if (!res.ok) throw new Error("Indicators live feed request failed");
        const payload = (await res.json()) as IndicatorsSnapshotResponse;
        if (!payload.ok) throw new Error(payload.error || "Indicators feed unavailable");
        const coins = payload.market?.coins ?? [];
        if (cancelled) return;

        const fgNow = Number(payload.fearGreed?.current ?? 50);
        const fgSeries = payload.fearGreed?.history?.slice(0, MAX_POINTS) ?? [];
        setFgValue(fgNow);
        setFgHistory(fgSeries.length ? fgSeries : [fgNow]);

        const btcPrices = (payload.btcChart?.prices ?? []).slice(-MAX_POINTS);
        const btcVols = (payload.btcChart?.volumes ?? []).slice(-MAX_POINTS).map((v) => v / 1_000_000_000);
        if (btcPrices.length) setBtcPriceSeries(btcPrices);
        if (btcVols.length) setBtcVolSeries(btcVols);

        const btc = coins.find((c) => c.symbol.toLowerCase() === "btc");
        const btc30 = Number(btc?.price_change_percentage_30d_in_currency ?? 0);
        const top50ExBtc = coins.filter((c) => c.symbol.toLowerCase() !== "btc").slice(0, 50);
        const outperform = top50ExBtc.filter((c) => Number(c.price_change_percentage_30d_in_currency ?? -999) > btc30).length;
        const altIdx = Math.round((outperform / Math.max(top50ExBtc.length, 1)) * 100);
        setAltSeason(altIdx);
        setAltSeasonSeries((prev) => appendValue(prev.length ? prev : Array(30).fill(altIdx), altIdx));
        const totalMcap = Number(payload.market?.totalMarketCapUsd ?? 0);
        const btcMcap = Number(btc?.market_cap ?? 0);
        const altMcap = Math.max(0, totalMcap - btcMcap) / 1_000_000_000;
        setAltMcapSeries((prev) => appendValue(prev.length ? prev : Array(30).fill(altMcap), altMcap));

        const btcD = Number(payload.market?.btcDominance ?? 50);
        const ethD = Number(payload.market?.ethDominance ?? 15);
        const othersD = Math.max(0, 100 - btcD - ethD);
        setBtcDom(btcD);
        setEthDom(ethD);
        setOthersDom(othersD);
        setBtcDomSeries((prev) => appendValue(prev.length ? prev : Array(50).fill(btcD), btcD));
        setEthDomSeries((prev) => appendValue(prev.length ? prev : Array(50).fill(ethD), ethD));
        setOthersDomSeries((prev) => appendValue(prev.length ? prev : Array(50).fill(othersD), othersD));

        const cap20 = coins.slice(0, 20).reduce((sum, c) => sum + (c.market_cap || 0), 0);
        const cap100 = coins.slice(0, 100).reduce((sum, c) => sum + (c.market_cap || 0), 0);
        const nextBase20 = (baseCap20Ref.current ?? cap20) || 1;
        const nextBase100 = (baseCap100Ref.current ?? cap100) || 1;
        if (!baseCap20Ref.current) {
          baseCap20Ref.current = nextBase20;
        }
        if (!baseCap100Ref.current) {
          baseCap100Ref.current = nextBase100;
        }
        const idx20 = (cap20 / nextBase20) * 100;
        const idx100 = (cap100 / nextBase100) * 100;
        setCmc20(idx20);
        setCmc100(idx100);
        setCmc20Series((prev) => appendValue(prev.length ? prev : Array(60).fill(idx20), idx20));
        setCmc100Series((prev) => appendValue(prev.length ? prev : Array(60).fill(idx100), idx100));
        setConstituents(coins.slice(0, 12));

        const price = Number(btc?.current_price ?? btcPrices[btcPrices.length - 1] ?? 0);
        const puell = ((Number(btcVols[btcVols.length - 1] ?? 0) * 1_000_000_000) / Math.max(price * 10000, 1)) * 2.2;
        const pi1 = price * 0.8;
        const pi2 = price * 1.65;
        const rainbow = Math.log10(Math.max(price, 1));
        setPuellSeries((prev) => appendValue(prev.length ? prev : Array(80).fill(puell), puell));
        setPi1Series((prev) => appendValue(prev.length ? prev : Array(80).fill(pi1), pi1));
        setPi2Series((prev) => appendValue(prev.length ? prev : Array(80).fill(pi2), pi2));
        setRainbowSeries((prev) => appendValue(prev.length ? prev : Array(80).fill(rainbow), rainbow));

        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Live data is unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    const t = window.setInterval(() => void run(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const fearGreedLabel = fgValue >= 75 ? "Extreme Greed" : fgValue >= 55 ? "Greed" : fgValue >= 45 ? "Neutral" : fgValue >= 25 ? "Fear" : "Extreme Fear";

  const CmcIndexView = ({ label, value, series }: { label: "CMC20" | "CMC100"; value: number; series: number[] }) => (
    <>
      <h1 className="text-2xl font-semibold text-white">CoinMarketCap {label.replace("CMC", "")} Index</h1>
      <p className="text-sm text-[#6B6F76]">Live proxy index calculated from top market-cap constituents.</p>
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className={cardCls}>
            <h3 className={sectionTitle}>{label}</h3>
            <p className="mt-3 text-6xl font-bold text-white">{fmtUsd(value, 2)}</p>
            <p className={`text-2xl ${value >= 100 ? "text-[#2cc497]" : "text-[#f6465d]"}`}>{fmtPct(((value - 100) / 100) * 100)}</p>
          </section>
          <section className={cardCls}>
            <h3 className={sectionTitle}>Historical Values</h3>
            <div className="mt-3 space-y-3 text-lg">
              <p className="flex justify-between"><span className="text-[#9ba3b4]">Now</span><span>{fmtUsd(value, 2)}</span></p>
              <p className="flex justify-between"><span className="text-[#9ba3b4]">Last point</span><span>{fmtUsd(series.at(-2) ?? value, 2)}</span></p>
              <p className="flex justify-between"><span className="text-[#9ba3b4]">Baseline</span><span>$100.00</span></p>
            </div>
          </section>
        </div>
        <ChartPanel title={`CoinMarketCap ${label.replace("CMC", "")} Index Chart`} series={[{ label, color: "#2cc497", values: series, fill: true }]} yRight="$" />
      </div>
    </>
  );

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1800px] space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">Indicators</h1>
          <span className={`rounded border px-2 py-1 text-xs ${error ? "border-[#704844] bg-[#271a19] text-[#d6b3af]" : "border-[#6f765f] bg-[#1f251b] text-[#d8decf]"}`}>
            {loading ? "Loading..." : error ? "Live feed issue" : "Live"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === t.key ? "border-b-2 border-[#F5C542] text-white" : "text-[#6B6F76] hover:text-[#BFC2C7]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "fear-greed" ? (
          <>
            <h1 className="text-2xl font-semibold text-white">CMC Crypto Fear and Greed Index</h1>
            <p className="text-sm text-[#6B6F76]">Live sentiment index with BTC price and BTC volume overlays.</p>
            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-4">
                <section className={cardCls}>
                  <h3 className={sectionTitle}>CMC Crypto Fear and Greed Index</h3>
                  <div className="mt-4 text-6xl font-bold text-white">{Math.round(fgValue)}</div>
                  <p className={`text-xl ${fgValue >= 55 ? "text-[#2cc497]" : "text-[#f6465d]"}`}>{fearGreedLabel}</p>
                </section>
                <section className={cardCls}>
                  <h3 className={sectionTitle}>Historical Values</h3>
                  <div className="mt-3 space-y-3 text-lg">
                    <p className="flex justify-between"><span className="text-[#9ba3b4]">Now</span><span>{Math.round(fgHistory.at(-1) ?? fgValue)}</span></p>
                    <p className="flex justify-between"><span className="text-[#9ba3b4]">Last Point</span><span>{Math.round(fgHistory.at(-2) ?? fgValue)}</span></p>
                    <p className="flex justify-between"><span className="text-[#9ba3b4]">30 points avg</span><span>{Math.round((fgHistory.slice(-30).reduce((a, b) => a + b, 0) / Math.max(fgHistory.slice(-30).length, 1)) || fgValue)}</span></p>
                  </div>
                </section>
              </div>
              <ChartPanel
                title="Fear and Greed Index Chart"
                series={[
                  { label: "Fear & Greed", color: "#facc15", values: fgHistory.length ? fgHistory : [fgValue], fill: true },
                  { label: "Bitcoin Price", color: "#98a3bb", values: btcPriceSeries.length ? btcPriceSeries : [0] },
                  { label: "Bitcoin Volume", color: "#68728a", values: btcVolSeries.length ? btcVolSeries : [0] },
                ]}
                yRight="100"
              />
            </div>
          </>
        ) : null}

        {activeTab === "altcoin-season" ? (
          <>
            <h1 className="text-2xl font-semibold text-white">CMC Altcoin Season Index</h1>
            <p className="text-sm text-[#6B6F76]">Live proxy index from top-50 altcoins outperforming BTC on 30d change.</p>
            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-4">
                <section className={cardCls}>
                  <h3 className={sectionTitle}>CMC Altcoin Season Index</h3>
                  <p className="mt-3 text-6xl font-bold text-white">{Math.round(altSeason)}<span className="text-3xl text-[#9ba3b4]">/100</span></p>
                </section>
                <section className={cardCls}>
                  <h3 className={sectionTitle}>Historical Values</h3>
                  <div className="mt-3 space-y-3 text-lg">
                    <p className="flex justify-between"><span className="text-[#9ba3b4]">Now</span><span>{Math.round(altSeasonSeries.at(-1) ?? altSeason)}</span></p>
                    <p className="flex justify-between"><span className="text-[#9ba3b4]">Last Point</span><span>{Math.round(altSeasonSeries.at(-2) ?? altSeason)}</span></p>
                    <p className="flex justify-between"><span className="text-[#9ba3b4]">30 points avg</span><span>{Math.round((altSeasonSeries.slice(-30).reduce((a, b) => a + b, 0) / Math.max(altSeasonSeries.slice(-30).length, 1)) || altSeason)}</span></p>
                  </div>
                </section>
              </div>
              <ChartPanel
                title="Altcoin Season Index Chart"
                series={[
                  { label: "Altcoin Season Index", color: "#4f74ff", values: altSeasonSeries.length ? altSeasonSeries : [altSeason], fill: true },
                  { label: "Altcoin Market Cap (B$)", color: "#8b95af", values: altMcapSeries.length ? altMcapSeries : [0] },
                ]}
                yRight="100"
              />
            </div>
          </>
        ) : null}

        {activeTab === "market-cycles" ? (
          <>
            <h1 className="text-2xl font-semibold text-white">Crypto Market Cycle Indicators</h1>
            <p className="text-sm text-[#6B6F76]">Live proxies for cycle momentum using BTC price, volume and trend curvature.</p>
            <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
              <div className="space-y-4">
                <section className={cardCls}>
                  <h3 className={sectionTitle}>Puell Multiple Status</h3>
                  <p className="mt-3 text-6xl font-bold text-white">{(puellSeries.at(-1) ?? 0).toFixed(4)}</p>
                  <div className="mt-4 h-3 rounded-full bg-gradient-to-r from-[#2cc497] via-[#d1d5db] to-[#f6465d]" />
                </section>
                <section className={cardCls}>
                  <h3 className={sectionTitle}>Pi Cycle Top Status</h3>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-white/10 bg-[#242b3d] p-2"><p className="text-[#9ba3b4]">111DMA*</p><p className="text-xl font-semibold">{fmtUsd(pi1Series.at(-1) ?? 0, 0)}</p></div>
                    <div className="rounded-lg border border-white/10 bg-[#242b3d] p-2"><p className="text-[#9ba3b4]">Cross</p><p className="text-xl font-semibold">{(pi2Series.at(-1) ?? 0) > (pi1Series.at(-1) ?? 0) ? "No" : "Yes"}</p></div>
                    <div className="rounded-lg border border-white/10 bg-[#242b3d] p-2"><p className="text-[#9ba3b4]">350DMAx2*</p><p className="text-xl font-semibold">{fmtUsd(pi2Series.at(-1) ?? 0, 0)}</p></div>
                  </div>
                </section>
              </div>
              <ChartPanel
                title="Puell Multiple"
                series={[
                  { label: "Puell Multiple", color: "#4169ff", values: puellSeries.length ? puellSeries : [0] },
                  { label: "Bitcoin Price", color: "#cbd5e1", values: btcPriceSeries.length ? btcPriceSeries : [0] },
                ]}
              />
            </div>
            <section className="grid gap-4 xl:grid-cols-2">
              <ChartPanel title="Pi Cycle Top Indicator" series={[{ label: "111DMA*", color: "#4169ff", values: pi1Series.length ? pi1Series : [0] }, { label: "350DMA x2*", color: "#10b981", values: pi2Series.length ? pi2Series : [0] }]} />
              <ChartPanel title="Bitcoin Rainbow Price Chart Indicator" series={[{ label: "Rainbow Proxy", color: "#e2e8f0", values: rainbowSeries.length ? rainbowSeries : [0] }]} />
            </section>
          </>
        ) : null}

        {activeTab === "btc-dominance" ? (
          <>
            <h1 className="text-2xl font-semibold text-white">Bitcoin Dominance</h1>
            <p className="text-sm text-[#6B6F76]">Live BTC / ETH / Others market-cap dominance from global market feed.</p>
            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-4">
                <section className={cardCls}>
                  <h3 className={sectionTitle}>Bitcoin Dominance</h3>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-5xl font-bold text-[#f59e0b]">{btcDom.toFixed(1)}%</p><p className="text-[#9ba3b4]">Bitcoin</p></div>
                    <div><p className="text-5xl font-bold text-[#4f74ff]">{ethDom.toFixed(1)}%</p><p className="text-[#9ba3b4]">Ethereum</p></div>
                    <div><p className="text-5xl font-bold text-[#8b95af]">{othersDom.toFixed(1)}%</p><p className="text-[#9ba3b4]">Others</p></div>
                  </div>
                </section>
              </div>
              <ChartPanel
                title="Bitcoin Dominance Chart"
                series={[
                  { label: "Bitcoin", color: "#f59e0b", values: btcDomSeries.length ? btcDomSeries : [btcDom] },
                  { label: "Ethereum", color: "#4f74ff", values: ethDomSeries.length ? ethDomSeries : [ethDom] },
                  { label: "Others", color: "#8b95af", values: othersDomSeries.length ? othersDomSeries : [othersDom] },
                ]}
                yRight="%"
              />
            </div>
          </>
        ) : null}

        {activeTab === "cmc20" ? <CmcIndexView label="CMC20" value={cmc20} series={cmc20Series.length ? cmc20Series : [cmc20]} /> : null}
        {activeTab === "cmc100" ? (
          <>
            <CmcIndexView label="CMC100" value={cmc100} series={cmc100Series.length ? cmc100Series : [cmc100]} />
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className={cardCls}>
                <h3 className={sectionTitle}>CoinMarketCap 100 Index Constituents</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-[#9ba3b4]">
                      <tr>
                        <th className="py-2">#</th>
                        <th className="py-2">Coin Name</th>
                        <th className="py-2 text-right">Price</th>
                        <th className="py-2 text-right">Price 24h %</th>
                        <th className="py-2 text-right">Market Cap</th>
                        <th className="py-2 text-right">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {constituents.slice(0, 10).map((row, idx) => {
                        const cap = row.market_cap || 0;
                        const total = constituents.reduce((s, c) => s + (c.market_cap || 0), 0) || 1;
                        const weight = (cap / total) * 100;
                        const chg = Number(row.price_change_percentage_24h_in_currency ?? 0);
                        return (
                          <tr key={row.id} className="border-t border-white/10">
                            <td className="py-2">{idx + 1}</td>
                            <td className="py-2 font-semibold text-white">{row.name} <span className="text-[#9ba3b4]">{row.symbol.toUpperCase()}</span></td>
                            <td className="py-2 text-right">{fmtUsd(row.current_price, row.current_price < 2 ? 4 : 2)}</td>
                            <td className={`py-2 text-right ${chg >= 0 ? "text-[#2cc497]" : "text-[#f6465d]"}`}>{fmtPct(chg)}</td>
                            <td className="py-2 text-right">{fmtUsd(cap / 1_000_000_000, 2)}B</td>
                            <td className="py-2 text-right">{weight.toFixed(2)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className={cardCls}>
                <h3 className={sectionTitle}>Top Constituents</h3>
                <p className="mt-2 text-sm text-[#9ba3b4]">Live weight distribution from top 10 of current 100 set.</p>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
