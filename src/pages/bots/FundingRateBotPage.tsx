import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";

/* ── Shared helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => "$" + fmt(n);
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>{children}</div>
);

/* ── Mock data ── */
const SCANNER_DATA = [
  { coin: "BTC", exchange: "Binance", current: 0.0120, rate8h: 0.0360, predicted: 0.0105, annualized: 13.14, bias: "Long-heavy", signal: "Collect", action: "Short perp" },
  { coin: "ETH", exchange: "Binance", current: 0.0085, rate8h: 0.0255, predicted: 0.0092, annualized: 9.31, bias: "Long-heavy", signal: "Collect", action: "Short perp" },
  { coin: "SOL", exchange: "Bybit", current: 0.0310, rate8h: 0.0930, predicted: 0.0280, annualized: 33.95, bias: "Long-heavy", signal: "Strong", action: "Short perp" },
  { coin: "DOGE", exchange: "Binance", current: -0.0145, rate8h: -0.0435, predicted: -0.0120, annualized: -15.88, bias: "Short-heavy", signal: "Collect", action: "Long perp" },
  { coin: "XRP", exchange: "OKX", current: 0.0065, rate8h: 0.0195, predicted: 0.0070, annualized: 7.12, bias: "Neutral", signal: "Watch", action: "---" },
  { coin: "AVAX", exchange: "Binance", current: 0.0190, rate8h: 0.0570, predicted: 0.0175, annualized: 20.81, bias: "Long-heavy", signal: "Collect", action: "Short perp" },
  { coin: "LINK", exchange: "Bybit", current: -0.0210, rate8h: -0.0630, predicted: -0.0180, annualized: -23.00, bias: "Short-heavy", signal: "Strong", action: "Long perp" },
  { coin: "ARB", exchange: "Binance", current: 0.0045, rate8h: 0.0135, predicted: 0.0050, annualized: 4.93, bias: "Neutral", signal: "Weak", action: "---" },
  { coin: "MATIC", exchange: "OKX", current: -0.0080, rate8h: -0.0240, predicted: -0.0065, annualized: -8.76, bias: "Short-heavy", signal: "Watch", action: "---" },
  { coin: "APT", exchange: "Binance", current: 0.0250, rate8h: 0.0750, predicted: 0.0230, annualized: 27.38, bias: "Long-heavy", signal: "Strong", action: "Short perp" },
];

const ACTIVE_POSITIONS = [
  { coin: "SOL", direction: "Short", size: "$12,400", entryRate: 0.0280, currentRate: 0.0310, collected: 186.20, durationH: 72 },
  { coin: "DOGE", direction: "Long", size: "$8,200", entryRate: -0.0160, currentRate: -0.0145, collected: 94.50, durationH: 48 },
  { coin: "LINK", direction: "Long", size: "$6,800", entryRate: -0.0190, currentRate: -0.0210, collected: 62.30, durationH: 24 },
];

const HISTORY_BARS = [
  0.008, 0.012, 0.015, 0.011, 0.018, 0.022, 0.019, 0.025,
  0.020, 0.016, 0.028, 0.031, 0.024, 0.020, 0.018, 0.022,
  0.026, 0.030, 0.028, 0.025, 0.021, 0.019, 0.023, 0.031,
];

/* ── Page ── */
export default function FundingRateBotPage() {
  const [minRate, setMinRate] = useState("0.010");
  const [maxPos, setMaxPos] = useState("25000");
  const [persistence, setPersistence] = useState("3");
  const [biasFilter, setBiasFilter] = useState("all");
  const [autoClose, setAutoClose] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState("SOL");

  const totalToday = ACTIVE_POSITIONS.reduce((s, p) => s + p.collected * 0.33, 0);
  const total7d = ACTIVE_POSITIONS.reduce((s, p) => s + p.collected, 0) * 1.8;
  const total30d = ACTIVE_POSITIONS.reduce((s, p) => s + p.collected, 0) * 6.2;

  const signalColor = (sig: string) => {
    if (sig === "Strong") return "#2bc48a";
    if (sig === "Collect") return "#5B8DEF";
    if (sig === "Watch") return "#F5C542";
    return "rgba(255,255,255,0.3)";
  };

  const maxBar = Math.max(...HISTORY_BARS.map(Math.abs));

  return (
    <BotProvider>
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        {/* 1 ── Exchange bar */}
        <BotExchangeBar botName="Funding Rate Engine" accentColor="#ef4444" />

        {/* 2 ── Funding Rate Scanner */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Funding Rate Scanner</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                  <th className="pb-2 pr-3">Coin</th>
                  <th className="pb-2 pr-3">Exchange</th>
                  <th className="pb-2 pr-3">Current</th>
                  <th className="pb-2 pr-3">8h Rate</th>
                  <th className="pb-2 pr-3">Predicted</th>
                  <th className="pb-2 pr-3">Annual %</th>
                  <th className="pb-2 pr-3">Bias</th>
                  <th className="pb-2 pr-3">Signal</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {SCANNER_DATA.map((r) => (
                  <tr key={r.coin + r.exchange} className="border-b border-white/[0.03] cursor-pointer hover:bg-white/[0.02]" onClick={() => setSelectedCoin(r.coin)}>
                    <td className="py-2 pr-3 font-semibold text-white/90">{r.coin}</td>
                    <td className="py-2 pr-3 text-white/50">{r.exchange}</td>
                    <td className={cn("py-2 pr-3 font-mono", r.current >= 0 ? "text-[#f6465d]" : "text-[#2bc48a]")}>
                      {r.current >= 0 ? "+" : ""}{fmt(r.current, 4)}%
                    </td>
                    <td className={cn("py-2 pr-3 font-mono", r.rate8h >= 0 ? "text-[#f6465d]/70" : "text-[#2bc48a]/70")}>
                      {r.rate8h >= 0 ? "+" : ""}{fmt(r.rate8h, 4)}%
                    </td>
                    <td className="py-2 pr-3 font-mono text-white/40">{r.predicted >= 0 ? "+" : ""}{fmt(r.predicted, 4)}%</td>
                    <td className={cn("py-2 pr-3 font-mono", r.annualized >= 0 ? "text-[#f6465d]" : "text-[#2bc48a]")}>
                      {r.annualized >= 0 ? "+" : ""}{fmt(r.annualized)}%
                    </td>
                    <td className="py-2 pr-3 text-white/50">{r.bias}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: signalColor(r.signal), background: signalColor(r.signal) + "15" }}>
                        {r.signal}
                      </span>
                    </td>
                    <td className="py-2 text-white/60">{r.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[9px] text-white/20">Negative rate = shorts pay longs (green). Positive rate = longs pay shorts (red).</p>
        </Card>

        {/* 3 ── Active Positions */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Active Positions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                  <th className="pb-2 pr-4">Coin</th>
                  <th className="pb-2 pr-4">Direction</th>
                  <th className="pb-2 pr-4">Size</th>
                  <th className="pb-2 pr-4">Entry Rate</th>
                  <th className="pb-2 pr-4">Current Rate</th>
                  <th className="pb-2 pr-4">Collected</th>
                  <th className="pb-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVE_POSITIONS.map((p) => (
                  <tr key={p.coin} className="border-b border-white/[0.03]">
                    <td className="py-2 pr-4 font-semibold text-white/90">{p.coin}</td>
                    <td className={cn("py-2 pr-4 font-semibold", p.direction === "Long" ? "text-[#2bc48a]" : "text-[#f6465d]")}>{p.direction}</td>
                    <td className="py-2 pr-4 text-white/70">{p.size}</td>
                    <td className="py-2 pr-4 font-mono text-white/50">{p.entryRate >= 0 ? "+" : ""}{fmt(p.entryRate, 4)}%</td>
                    <td className={cn("py-2 pr-4 font-mono", p.currentRate >= 0 ? "text-[#f6465d]" : "text-[#2bc48a]")}>
                      {p.currentRate >= 0 ? "+" : ""}{fmt(p.currentRate, 4)}%
                    </td>
                    <td className="py-2 pr-4 text-[#2bc48a]">{fmtUsd(p.collected)}</td>
                    <td className="py-2 text-white/50">{p.durationH}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 4 ── Funding Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Collected Today", value: fmtUsd(totalToday), color: "#2bc48a" },
            { label: "Collected 7d", value: fmtUsd(total7d), color: "#2bc48a" },
            { label: "Collected 30d", value: fmtUsd(total30d), color: "#2bc48a" },
            { label: "Annualized Yield", value: "18.4%", color: "#5B8DEF" },
            { label: "Win Rate", value: "82%", color: "#F5C542" },
          ].map((s) => (
            <Card key={s.label} className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/30">{s.label}</p>
              <p className="mt-1 text-[18px] font-bold" style={{ color: s.color }}>{s.value}</p>
            </Card>
          ))}
        </div>

        {/* 5 ── Funding History */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold tracking-wide text-white/80">Funding History &mdash; {selectedCoin}</h3>
            <span className="text-[10px] text-white/30">24h (8h intervals x 3 per bar)</span>
          </div>
          <div className="flex items-end gap-1" style={{ height: 80 }}>
            {HISTORY_BARS.map((v, i) => {
              const h = (Math.abs(v) / maxBar) * 100;
              return (
                <div key={i} className="flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${h}%`,
                      background: v >= 0 ? "#f6465d" : "#2bc48a",
                      opacity: 0.7,
                      minHeight: 2,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-white/20">
            <span>24h ago</span>
            <span>Now</span>
          </div>
        </Card>

        {/* 6 ── Setup */}
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold tracking-wide text-white/80">Setup</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Min Funding Rate %</span>
              <input value={minRate} onChange={(e) => setMinRate(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Max Position (USD)</span>
              <input value={maxPos} onChange={(e) => setMaxPos(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Rate Persistence (periods)</span>
              <input value={persistence} onChange={(e) => setPersistence(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Bias Filter</span>
              <select value={biasFilter} onChange={(e) => setBiasFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none">
                <option value="all">All</option>
                <option value="long-heavy">Long-Heavy Only</option>
                <option value="short-heavy">Short-Heavy Only</option>
              </select>
            </label>
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Auto-Close on Reversal</span>
              <button
                onClick={() => setAutoClose((v) => !v)}
                className={cn("rounded-full px-3 py-1 text-[11px] font-semibold transition", autoClose ? "bg-[#2bc48a]/20 text-[#2bc48a]" : "bg-white/[0.04] text-white/40")}
              >
                {autoClose ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </Card>

        {/* 7 ── Bot Thinking */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Bot Thinking</h3>
          <div className="space-y-2 text-[11px]">
            {[
              { q: "Why short SOL perp?", a: "SOL funding at +0.031% for 4 consecutive periods. Longs are crowded. Collecting payment by being short. Annualized yield ~34%.", color: "#2bc48a" },
              { q: "Why long DOGE perp?", a: "DOGE funding negative at -0.0145%. Shorts are paying longs. Persistent for 6 periods. Safe to collect on long side.", color: "#2bc48a" },
              { q: "Why no position on XRP?", a: "Rate at +0.0065% is below minimum threshold of 0.010%. Bias is neutral. Not enough edge to justify entry.", color: "#F5C542" },
              { q: "Exit conditions?", a: "Auto-close triggers when rate reverses sign for 2 consecutive periods or drops below 50% of entry rate.", color: "#5B8DEF" },
            ].map((t, i) => (
              <div key={i} className="rounded-lg bg-white/[0.02] px-3 py-2">
                <span className="text-white/40">{t.q}</span>
                <p className="mt-0.5" style={{ color: t.color }}>{t.a}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* 8 ── Execution Log */}
        <BotExecutionLog accentColor="#ef4444" />
      </div>
    </div>
    </BotProvider>
  );
}
