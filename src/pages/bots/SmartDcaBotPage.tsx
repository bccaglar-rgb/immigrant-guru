import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";

/* ═══════════════════════════════════════════════════════════
   MOCK DATA
   ═══════════════════════════════════════════════════════════ */

interface SafetyOrder {
  id: number;
  price: number;
  size: number;
  status: "Filled" | "Pending" | "Cancelled";
  deviation: number;
  filledAt?: string;
}

const SAFETY_ORDERS: SafetyOrder[] = [
  { id: 0, price: 95000, size: 100, status: "Filled", deviation: 0, filledAt: "Apr 4 09:12" },
  { id: 1, price: 93100, size: 120, status: "Filled", deviation: -2.0, filledAt: "Apr 4 14:33" },
  { id: 2, price: 91200, size: 144, status: "Pending", deviation: -4.0 },
  { id: 3, price: 89300, size: 172.8, status: "Pending", deviation: -6.0 },
  { id: 4, price: 87400, size: 207.4, status: "Pending", deviation: -8.0 },
];

const TOTAL_INVESTED = SAFETY_ORDERS.filter(o => o.status === "Filled").reduce((s, o) => s + o.size, 0);
const MAX_CAPITAL = 1500;
const FILLED_COUNT = SAFETY_ORDERS.filter(o => o.status === "Filled").length;
const AVG_ENTRY = SAFETY_ORDERS.filter(o => o.status === "Filled").reduce((s, o) => s + o.price * o.size, 0) / TOTAL_INVESTED;
const CURRENT_PRICE = 93800;
const UNREALIZED_PNL = ((CURRENT_PRICE - AVG_ENTRY) / AVG_ENTRY) * TOTAL_INVESTED;
const UNREALIZED_PCT = ((CURRENT_PRICE - AVG_ENTRY) / AVG_ENTRY) * 100;
const TP_TARGET = 95400;
const RECOVERY_PRICE = AVG_ENTRY * 1.003;

const CURRENT_RSI = 28;
const BB_POSITION = "0.5% above lower band";

const ZONES = [
  { label: "Zone 1", range: "RSI < 30", action: "HEAVY BUY", size: "$200", style: "Aggressive", bars: 8, active: true },
  { label: "Zone 2", range: "RSI 30-40", action: "MEDIUM BUY", size: "$150", style: "Standard", bars: 5, active: false },
  { label: "Zone 3", range: "RSI 40-50", action: "LIGHT BUY", size: "$100", style: "Conservative", bars: 3, active: false },
  { label: "Zone 4", range: "RSI > 50", action: "NO BUY", size: "--", style: "Waiting", bars: 0, active: false },
];

const PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[14px]" style={{ color: accent ?? "#6ec4ff" }}>{"\u25B8"}</span>
        <h3 className="text-[13px] font-semibold tracking-wide text-white/80">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StatCell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider text-white/30">{label}</div>
      <div className="mt-0.5 text-[14px] font-bold" style={{ color: color ?? "#fff" }}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-white/30">{sub}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function SmartDcaBotPage() {
  const [pair, setPair] = useState("BTCUSDT");
  const [baseOrder, setBaseOrder] = useState(100);
  const [safetySize, setSafetySize] = useState(120);
  const [safetyCount, setSafetyCount] = useState(5);
  const [deviation, setDeviation] = useState(2.0);
  const [volumeScale, setVolumeScale] = useState(1.2);
  const [stepScale, setStepScale] = useState(1.0);
  const [maxCapital, setMaxCapital] = useState(1500);
  const [tpPct, setTpPct] = useState(3.0);
  const [slPct, setSlPct] = useState(8.0);
  const [rsiTiming, setRsiTiming] = useState(true);

  // capital allocation preview
  const previewOrders: number[] = [baseOrder];
  let sz = safetySize;
  for (let i = 0; i < safetyCount; i++) {
    previewOrders.push(Math.round(sz * 100) / 100);
    sz *= volumeScale;
  }
  const totalCapitalNeeded = previewOrders.reduce((a, b) => a + b, 0);

  return (
    <BotProvider>
    <div className="min-h-screen bg-[#0a0a0b] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">

        {/* ── 1. EXCHANGE BAR ── */}
        <BotExchangeBar botName="Smart DCA Engine" accentColor="#6ec4ff" />

        {/* ── 2. DCA POSITION OVERVIEW ── */}
        <Section title="DCA Position Overview">
          {/* Progress bar */}
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="text-white/40">Capital Deployed</span>
              <span className="font-mono text-white/60">${fmt(TOTAL_INVESTED, 0)} / ${fmt(MAX_CAPITAL, 0)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(TOTAL_INVESTED / MAX_CAPITAL) * 100}%`,
                  background: "linear-gradient(90deg, #6ec4ff 0%, #3a9edb 100%)",
                }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[9px] text-white/25">
              <span>{((TOTAL_INVESTED / MAX_CAPITAL) * 100).toFixed(1)}% allocated</span>
              <span>Avg Entry: ${fmt(AVG_ENTRY, 0)}</span>
            </div>
          </div>

          {/* Orders table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[9px] uppercase tracking-wider text-white/30">
                  <th className="pb-2 pr-4">Order</th>
                  <th className="pb-2 pr-4">Price</th>
                  <th className="pb-2 pr-4">Size</th>
                  <th className="pb-2 pr-4">Deviation</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Filled At</th>
                </tr>
              </thead>
              <tbody>
                {SAFETY_ORDERS.map((o) => (
                  <tr key={o.id} className="border-b border-white/[0.03]">
                    <td className="py-1.5 pr-4 font-mono text-white/60">
                      {o.id === 0 ? "Base" : `SO #${o.id}`}
                    </td>
                    <td className="py-1.5 pr-4 font-mono text-white/80">${fmt(o.price, 0)}</td>
                    <td className="py-1.5 pr-4 font-mono text-white/80">${fmt(o.size, 1)}</td>
                    <td className="py-1.5 pr-4 font-mono text-white/50">
                      {o.deviation === 0 ? "--" : `${o.deviation}%`}
                    </td>
                    <td className="py-1.5 pr-4">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                          o.status === "Filled"
                            ? "bg-[#2bc48a]/15 text-[#2bc48a]"
                            : "bg-white/[0.04] text-white/30"
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="py-1.5 font-mono text-[10px] text-white/30">
                      {o.filledAt ?? "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── 3. DCA ZONES VISUALIZATION ── */}
        <Section title="DCA Buy Zones">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-[10px] text-white/40">Current RSI:</span>
            <span className="rounded bg-[#6ec4ff]/15 px-2 py-0.5 text-[12px] font-bold text-[#6ec4ff]">
              {CURRENT_RSI}
            </span>
            <span className="text-[10px] text-white/40">BB Position:</span>
            <span className="text-[11px] text-white/60">{BB_POSITION}</span>
          </div>

          <div className="space-y-2">
            {ZONES.map((z) => (
              <div
                key={z.label}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition ${
                  z.active
                    ? "border-[#6ec4ff]/30 bg-[#6ec4ff]/[0.06]"
                    : "border-white/[0.04] bg-transparent"
                }`}
              >
                <div className="w-[80px] shrink-0">
                  <div className={`text-[11px] font-semibold ${z.active ? "text-[#6ec4ff]" : "text-white/50"}`}>
                    {z.label}
                  </div>
                  <div className="text-[9px] text-white/25">{z.range}</div>
                </div>
                <div className="w-[90px] shrink-0 text-[10px] font-bold" style={{ color: z.active ? "#6ec4ff" : "rgba(255,255,255,0.4)" }}>
                  {z.action}
                </div>
                <div className="flex-1">
                  <div className="flex gap-[2px]">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-3 w-3 rounded-[2px]"
                        style={{
                          background: i < z.bars
                            ? z.active ? "#6ec4ff" : "rgba(255,255,255,0.12)"
                            : "rgba(255,255,255,0.03)",
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="w-[50px] text-right text-[11px] font-mono text-white/50">{z.size}</div>
                <div className="w-[90px] text-right text-[10px] text-white/30">{z.style}</div>
                {z.active && (
                  <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-[#6ec4ff] shadow-[0_0_6px_#6ec4ff]" />
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* ── 4. DCA STATS GRID ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCell label="Total Invested" value={`$${fmt(TOTAL_INVESTED, 0)}`} sub={`of $${fmt(MAX_CAPITAL, 0)}`} color="#6ec4ff" />
          <StatCell label="Avg Entry" value={`$${fmt(AVG_ENTRY, 0)}`} />
          <StatCell label="Current Price" value={`$${fmt(CURRENT_PRICE, 0)}`} />
          <StatCell
            label="Unrealized PnL"
            value={`${UNREALIZED_PNL >= 0 ? "+" : ""}$${fmt(UNREALIZED_PNL)}`}
            sub={`${UNREALIZED_PCT >= 0 ? "+" : ""}${fmt(UNREALIZED_PCT)}%`}
            color={UNREALIZED_PNL >= 0 ? "#2bc48a" : "#f6465d"}
          />
          <StatCell label="Safety Orders" value={`${FILLED_COUNT}/${SAFETY_ORDERS.length - 1}`} sub="filled" />
          <StatCell label="Volume Scale" value={`${volumeScale}x`} />
          <StatCell label="TP Target" value={`$${fmt(TP_TARGET, 0)}`} sub="BB Middle" color="#2bc48a" />
          <StatCell label="Max Drawdown Cap" value={`-${slPct}%`} color="#f6465d" />
        </div>

        {/* ── 5. DCA SETUP ── */}
        <Section title="DCA Setup">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            {/* Pair */}
            <label className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-white/30">Pair</span>
              <select
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#6ec4ff]/40"
              >
                {PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>

            {/* Base Order */}
            <label className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-white/30">Base Order ($)</span>
              <input
                type="number"
                value={baseOrder}
                onChange={(e) => setBaseOrder(+e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#6ec4ff]/40"
              />
            </label>

            {/* Safety Order Size */}
            <label className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-white/30">Safety Order ($)</span>
              <input
                type="number"
                value={safetySize}
                onChange={(e) => setSafetySize(+e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#6ec4ff]/40"
              />
            </label>

            {/* Safety Order Count */}
            <label className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-white/30">Safety Count (1-10)</span>
              <input
                type="number"
                min={1}
                max={10}
                value={safetyCount}
                onChange={(e) => setSafetyCount(Math.min(10, Math.max(1, +e.target.value)))}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#6ec4ff]/40"
              />
            </label>

            {/* Price Deviation */}
            <label className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-white/30">Deviation %</span>
              <input
                type="number"
                step={0.1}
                value={deviation}
                onChange={(e) => setDeviation(+e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#6ec4ff]/40"
              />
            </label>

            {/* Volume Scale */}
            <label className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-white/30">Volume Scale</span>
              <input
                type="number"
                step={0.1}
                value={volumeScale}
                onChange={(e) => setVolumeScale(+e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#6ec4ff]/40"
              />
            </label>

            {/* Step Scale */}
            <label className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-white/30">Step Scale</span>
              <input
                type="number"
                step={0.1}
                value={stepScale}
                onChange={(e) => setStepScale(+e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#6ec4ff]/40"
              />
            </label>

            {/* Max Capital */}
            <label className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-white/30">Max Capital ($)</span>
              <input
                type="number"
                value={maxCapital}
                onChange={(e) => setMaxCapital(+e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#6ec4ff]/40"
              />
            </label>

            {/* TP % */}
            <label className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-white/30">Take Profit %</span>
              <input
                type="number"
                step={0.1}
                value={tpPct}
                onChange={(e) => setTpPct(+e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#6ec4ff]/40"
              />
            </label>

            {/* SL % */}
            <label className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-white/30">Stop Loss %</span>
              <input
                type="number"
                step={0.1}
                value={slPct}
                onChange={(e) => setSlPct(+e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#6ec4ff]/40"
              />
            </label>

            {/* RSI Timing Toggle */}
            <label className="flex items-end gap-2 pb-1">
              <button
                onClick={() => setRsiTiming(!rsiTiming)}
                className={`h-5 w-9 rounded-full transition ${rsiTiming ? "bg-[#6ec4ff]" : "bg-white/10"}`}
              >
                <span
                  className={`block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    rsiTiming ? "translate-x-[18px]" : "translate-x-[3px]"
                  }`}
                />
              </button>
              <span className="text-[10px] text-white/50">RSI Timing</span>
            </label>
          </div>

          {/* Capital allocation preview */}
          <div className="mt-5 rounded-lg border border-white/[0.04] bg-white/[0.015] p-3">
            <div className="mb-2 text-[9px] uppercase tracking-wider text-white/30">Capital Allocation Preview</div>
            <div className="flex flex-wrap gap-2">
              {previewOrders.map((amt, i) => (
                <div key={i} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-center">
                  <div className="text-[8px] text-white/25">{i === 0 ? "Base" : `SO ${i}`}</div>
                  <div className="text-[11px] font-mono font-semibold text-white/70">${fmt(amt, 0)}</div>
                </div>
              ))}
              <div className="flex items-center rounded-md border border-[#6ec4ff]/20 bg-[#6ec4ff]/[0.06] px-3 py-1">
                <div>
                  <div className="text-[8px] text-[#6ec4ff]/60">TOTAL NEEDED</div>
                  <div className="text-[12px] font-bold text-[#6ec4ff]">${fmt(totalCapitalNeeded, 0)}</div>
                </div>
              </div>
            </div>
            {totalCapitalNeeded > maxCapital && (
              <div className="mt-2 rounded border border-[#f6465d]/20 bg-[#f6465d]/[0.05] px-2 py-1 text-[10px] text-[#f6465d]">
                Warning: Total capital needed (${fmt(totalCapitalNeeded, 0)}) exceeds max capital (${fmt(maxCapital, 0)})
              </div>
            )}
          </div>
        </Section>

        {/* ── 6. BOT THINKING ── */}
        <Section title="Bot Thinking">
          <div className="space-y-2.5">
            {[
              { label: "RSI Value", value: `${CURRENT_RSI} — Heavy Buy Zone (< 30)`, color: "#6ec4ff" },
              { label: "BB Position", value: `Price at ${BB_POSITION}`, color: "#a78bfa" },
              { label: "Volume Confirmation", value: "Dip volume 0.8x avg — waiting for 1.5x spike", color: "#F5C542" },
              { label: "Next Safety Trigger", value: `$${fmt(SAFETY_ORDERS[2].price, 0)} (${SAFETY_ORDERS[2].deviation}% deviation)`, color: "#f4906c" },
              { label: "Confidence", value: "82% — conditions favor next safety fill", color: "#2bc48a" },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: row.color }} />
                <span className="w-[140px] shrink-0 text-[10px] text-white/40">{row.label}</span>
                <span className="text-[11px] text-white/70">{row.value}</span>
              </div>
            ))}
          </div>
          {/* Confidence bar */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[9px]">
              <span className="text-white/30">Overall Confidence</span>
              <span className="font-mono text-[#2bc48a]">82%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-[#2bc48a]" style={{ width: "82%" }} />
            </div>
          </div>
        </Section>

        {/* ── 7. RISK PANEL ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCell label="Max Capital at Risk" value={`$${fmt(MAX_CAPITAL, 0)}`} sub="Full allocation" color="#f6465d" />
          <StatCell
            label="Average Down Risk"
            value={`${FILLED_COUNT} fills deep`}
            sub={`${((FILLED_COUNT / (SAFETY_ORDERS.length - 1)) * 100).toFixed(0)}% of safety orders used`}
            color="#F5C542"
          />
          <StatCell label="Recovery Price" value={`$${fmt(RECOVERY_PRICE, 0)}`} sub="+0.3% from avg entry" />
          <StatCell
            label="Liquidation Distance"
            value="N/A"
            sub="Spot — no liquidation"
            color="#2bc48a"
          />
        </div>

        {/* ── 8. EXECUTION LOG ── */}
        <BotExecutionLog accentColor="#6ec4ff" />
      </div>
    </div>
    </BotProvider>
  );
}
