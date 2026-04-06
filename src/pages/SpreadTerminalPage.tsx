import { useState, useMemo } from "react";
import { LWChart } from "../components/shared/LWChart";
import { useLiveMarketData } from "../hooks/useLiveMarketData";
import type { Timeframe } from "../types";

/* ── Constants ── */
const EXCHANGES = ["Gate.io", "Binance", "Bybit", "OKX"] as const;
type Exchange = (typeof EXCHANGES)[number];

const EXCHANGE_HINT: Record<Exchange, "GATEIO" | "BINANCE" | "BYBIT" | "OKX"> = {
  "Gate.io": "GATEIO",
  Binance: "BINANCE",
  Bybit: "BYBIT",
  OKX: "OKX",
};

const EXCHANGE_COLOR: Record<Exchange, string> = {
  "Gate.io": "#17e6a1",
  Binance: "#F0B90B",
  Bybit: "#f7a600",
  OKX: "#fff",
};

const COINS = [
  { label: "BTC", symbol: "BTCUSDT" },
  { label: "ETH", symbol: "ETHUSDT" },
  { label: "SOL", symbol: "SOLUSDT" },
  { label: "AVAX", symbol: "AVAXUSDT" },
  { label: "BNB", symbol: "BNBUSDT" },
  { label: "LINK", symbol: "LINKUSDT" },
] as const;

const TF_OPTIONS: Timeframe[] = ["1m", "15m", "1h", "4h", "1d"];

const TF_CANDLE_KEY: Record<string, "candles1m" | "candles15m" | "candles1h" | "candles4h" | "candles1d"> = {
  "1m": "candles1m",
  "15m": "candles15m",
  "1h": "candles1h",
  "4h": "candles4h",
  "1d": "candles1d",
};

/* ── Helpers ── */
const fmt = (n: number, decimals = 2) =>
  n >= 1000
    ? n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : n.toFixed(decimals);

const fmtPct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";

/* ── Sub-components ── */

function ExchangeSelector({
  value,
  onChange,
  label,
}: {
  value: Exchange;
  onChange: (v: Exchange) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-[#8e95a1]">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Exchange)}
        className="rounded border border-white/10 bg-[#181c27] px-2 py-1 text-white outline-none focus:border-[#F5C542]/50"
      >
        {EXCHANGES.map((ex) => (
          <option key={ex} value={ex}>
            {ex}
          </option>
        ))}
      </select>
    </div>
  );
}

function CoinSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-[#8e95a1]">Coin:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-white/10 bg-[#181c27] px-2 py-1 text-white outline-none focus:border-[#F5C542]/50"
      >
        {COINS.map((c) => (
          <option key={c.symbol} value={c.symbol}>
            {c.label}/USDT
          </option>
        ))}
      </select>
    </div>
  );
}

function TfSelector({ value, onChange }: { value: Timeframe; onChange: (v: Timeframe) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-[#8e95a1]">TF:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Timeframe)}
        className="rounded border border-white/10 bg-[#181c27] px-2 py-1 text-white outline-none focus:border-[#F5C542]/50"
      >
        {TF_OPTIONS.map((tf) => (
          <option key={tf} value={tf}>
            {tf}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ── Chart Panel ── */
function ChartPanel({
  exchange,
  symbol,
  tf,
}: {
  exchange: Exchange;
  symbol: string;
  tf: Timeframe;
}) {
  const data = useLiveMarketData(symbol, EXCHANGE_HINT[exchange]);
  const candleKey = TF_CANDLE_KEY[tf] ?? "candles1m";
  const candles = data[candleKey];
  const coinLabel = COINS.find((c) => c.symbol === symbol)?.label ?? symbol;

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-white/5 bg-[#10131a]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-2">
        <span
          className="rounded px-2 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: EXCHANGE_COLOR[exchange] + "22", color: EXCHANGE_COLOR[exchange] }}
        >
          {exchange}
        </span>
        <span className="text-sm text-[#8e95a1]">{coinLabel}/USDT</span>
        <span className="font-mono text-lg font-bold text-white">
          {data.loading ? "--" : "$" + fmt(data.currentPrice, data.currentPrice < 10 ? 4 : 2)}
        </span>
        <span
          className={`font-mono text-sm font-medium ${data.priceChange24hPct >= 0 ? "text-[#0ecb81]" : "text-[#f6465d]"}`}
        >
          {data.loading ? "--" : fmtPct(data.priceChange24hPct)}
        </span>
      </div>
      {/* Chart */}
      <div className="relative min-h-[320px] flex-1">
        {data.loading ? (
          <div className="flex h-full items-center justify-center text-[#8e95a1]">Loading...</div>
        ) : (
          <LWChart data={candles} showVolume showIndicators />
        )}
      </div>
    </div>
  );
}

/* ── Comparison Strip ── */
function ComparisonStrip({
  leftPrice,
  rightPrice,
  leftLoading,
  rightLoading,
}: {
  leftPrice: number;
  rightPrice: number;
  leftLoading: boolean;
  rightLoading: boolean;
}) {
  const spreadPct = useMemo(() => {
    if (!leftPrice || !rightPrice) return 0;
    return ((rightPrice - leftPrice) / leftPrice) * 100;
  }, [leftPrice, rightPrice]);

  // Mock metrics
  const fundingDelta = "+0.0032%";
  const volumeRatio = "1.24x";
  const signalAlignment = "Aligned";

  const items = [
    { label: "Left Price", value: leftLoading ? "--" : "$" + fmt(leftPrice, leftPrice < 10 ? 4 : 2) },
    { label: "Right Price", value: rightLoading ? "--" : "$" + fmt(rightPrice, rightPrice < 10 ? 4 : 2) },
    {
      label: "Spread %",
      value: leftLoading || rightLoading ? "--" : fmtPct(spreadPct),
      color: spreadPct >= 0 ? "#0ecb81" : "#f6465d",
    },
    { label: "Funding Delta", value: fundingDelta, color: "#F5C542" },
    { label: "Volume Ratio", value: volumeRatio },
    { label: "Signal Alignment", value: signalAlignment, color: "#0ecb81" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-6 rounded-lg border border-white/5 bg-[#0d0f17] px-5 py-3">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-[#8e95a1]">{item.label}</span>
          <span className="font-mono text-sm font-semibold" style={{ color: item.color ?? "#fff" }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Paired Execution Panel ── */
function PairedExecutionPanel({
  leftExchange,
  rightExchange,
}: {
  leftExchange: Exchange;
  rightExchange: Exchange;
}) {
  const [leftSide, setLeftSide] = useState<"Long" | "Short">("Long");
  const [rightSide, setRightSide] = useState<"Long" | "Short">("Short");
  const [leftSize, setLeftSize] = useState("1000");
  const [rightSize, setRightSize] = useState("1000");
  const [leftLeverage, setLeftLeverage] = useState("5");
  const [rightLeverage, setRightLeverage] = useState("5");

  const toggleBtn =
    "rounded border border-white/10 px-3 py-1 text-xs font-medium transition-colors";
  const activeBtn = "bg-[#F5C542]/20 border-[#F5C542]/50 text-[#F5C542]";
  const inactiveBtn = "bg-transparent text-[#8e95a1] hover:text-white";

  return (
    <div className="rounded-lg border border-white/5 bg-[#0d0f17]">
      <div className="border-b border-white/5 px-5 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#F5C542]">
          Paired Execution
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 p-5">
        {/* Left Leg */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-[#8e95a1]">LEFT LEG</div>
          <div className="rounded border border-white/10 bg-[#181c27] px-3 py-2 text-sm text-white">
            {leftExchange}
          </div>
          <div className="flex gap-2">
            <button
              className={`${toggleBtn} ${leftSide === "Long" ? activeBtn : inactiveBtn}`}
              onClick={() => setLeftSide("Long")}
            >
              Long
            </button>
            <button
              className={`${toggleBtn} ${leftSide === "Short" ? activeBtn : inactiveBtn}`}
              onClick={() => setLeftSide("Short")}
            >
              Short
            </button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] uppercase text-[#8e95a1]">Size (USDT)</label>
              <input
                type="text"
                value={leftSize}
                onChange={(e) => setLeftSize(e.target.value)}
                className="w-full rounded border border-white/10 bg-[#181c27] px-2 py-1 font-mono text-sm text-white outline-none focus:border-[#F5C542]/50"
              />
            </div>
            <div className="w-20">
              <label className="mb-1 block text-[10px] uppercase text-[#8e95a1]">Leverage</label>
              <input
                type="text"
                value={leftLeverage}
                onChange={(e) => setLeftLeverage(e.target.value)}
                className="w-full rounded border border-white/10 bg-[#181c27] px-2 py-1 font-mono text-sm text-white outline-none focus:border-[#F5C542]/50"
              />
            </div>
          </div>
        </div>

        {/* Center Buttons */}
        <div className="flex flex-col items-center justify-center gap-3">
          <button className="rounded-lg bg-[#0ecb81] px-5 py-2 text-sm font-bold text-black transition-opacity hover:opacity-80">
            Open Pair
          </button>
          <button className="rounded-lg bg-[#f6465d] px-5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-80">
            Close Pair
          </button>
        </div>

        {/* Right Leg */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-[#8e95a1]">RIGHT LEG</div>
          <div className="rounded border border-white/10 bg-[#181c27] px-3 py-2 text-sm text-white">
            {rightExchange}
          </div>
          <div className="flex gap-2">
            <button
              className={`${toggleBtn} ${rightSide === "Long" ? activeBtn : inactiveBtn}`}
              onClick={() => setRightSide("Long")}
            >
              Long
            </button>
            <button
              className={`${toggleBtn} ${rightSide === "Short" ? activeBtn : inactiveBtn}`}
              onClick={() => setRightSide("Short")}
            >
              Short
            </button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] uppercase text-[#8e95a1]">Size (USDT)</label>
              <input
                type="text"
                value={rightSize}
                onChange={(e) => setRightSize(e.target.value)}
                className="w-full rounded border border-white/10 bg-[#181c27] px-2 py-1 font-mono text-sm text-white outline-none focus:border-[#F5C542]/50"
              />
            </div>
            <div className="w-20">
              <label className="mb-1 block text-[10px] uppercase text-[#8e95a1]">Leverage</label>
              <input
                type="text"
                value={rightLeverage}
                onChange={(e) => setRightLeverage(e.target.value)}
                className="w-full rounded border border-white/10 bg-[#181c27] px-2 py-1 font-mono text-sm text-white outline-none focus:border-[#F5C542]/50"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function SpreadTerminalPage() {
  const [leftExchange, setLeftExchange] = useState<Exchange>("Gate.io");
  const [rightExchange, setRightExchange] = useState<Exchange>("Binance");
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [tf, setTf] = useState<Timeframe>("1m");

  const leftData = useLiveMarketData(selectedSymbol, EXCHANGE_HINT[leftExchange]);
  const rightData = useLiveMarketData(selectedSymbol, EXCHANGE_HINT[rightExchange]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-white/5 bg-[#0d0f17] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#0ecb81]" />
          <span className="text-sm font-bold uppercase tracking-wider text-white">Spread Terminal</span>
        </div>
        <div className="h-4 w-px bg-white/10" />
        <ExchangeSelector label="Left" value={leftExchange} onChange={setLeftExchange} />
        <ExchangeSelector label="Right" value={rightExchange} onChange={setRightExchange} />
        <div className="h-4 w-px bg-white/10" />
        <CoinSelector value={selectedSymbol} onChange={setSelectedSymbol} />
        <TfSelector value={tf} onChange={setTf} />
      </div>

      {/* Charts Side by Side */}
      <div className="grid min-h-[380px] flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPanel exchange={leftExchange} symbol={selectedSymbol} tf={tf} />
        <ChartPanel exchange={rightExchange} symbol={selectedSymbol} tf={tf} />
      </div>

      {/* Comparison Strip */}
      <ComparisonStrip
        leftPrice={leftData.currentPrice}
        rightPrice={rightData.currentPrice}
        leftLoading={leftData.loading}
        rightLoading={rightData.loading}
      />

      {/* Paired Execution Panel */}
      <PairedExecutionPanel leftExchange={leftExchange} rightExchange={rightExchange} />
    </div>
  );
}
