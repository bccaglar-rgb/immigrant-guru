import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";
import BotLivePanel from "../../components/bot/BotLivePanel";
import BotStrategyChart from "../../components/bot/BotStrategyChart";
import BotBacktestPanel from "../../components/bot/BotBacktestPanel";
import SignalsOverview from "../../components/bot/SignalsOverview";

/* ── Shared helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => "$" + fmt(n);
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>
    {children}
  </div>
);

/* ── Trust bar stats ── */
const TRUST_STATS = [
  { label: "Win Rate", value: "52%", color: "#2bc48a" },
  { label: "Avg RR", value: "1:2.5", color: "#5B8DEF" },
  { label: "Max DD", value: "-8.5%", color: "#f6465d" },
  { label: "Trades", value: "78", color: "#fff" },
  { label: "Performance", value: "+9.4%", color: "#2bc48a" },
];

/* ── Bot thinking conditions ── */
const CONDITIONS = [
  { label: "Key level nearby", met: true, detail: "Support at 93,200 (2.1% below)" },
  { label: "Sweep detected", met: false, detail: "No wick below 92,800 yet" },
  { label: "Volume spike on sweep", met: false, detail: "Waiting for 2x+ vol" },
  { label: "Reversal candle", met: false, detail: "Need bullish engulfing" },
  { label: "Liquidity cluster size", met: true, detail: "Est. $4.2M stops below 92,800" },
];

/* ── Liquidity zones ── */
const LIQUIDITY_ZONES = [
  {
    type: "sell" as const,
    level: 96200,
    clusterAt: 96500,
    label: "Stop-loss cluster above resistance",
    estSize: "$6.8M",
    nearLevel: { name: "Resistance", price: 95400 },
  },
  {
    type: "sell" as const,
    level: 95400,
    clusterAt: 95700,
    label: "Shorts stop-losses above recent high",
    estSize: "$3.1M",
    nearLevel: { name: "Resistance", price: 95400 },
  },
  {
    type: "buy" as const,
    level: 93200,
    clusterAt: 92800,
    label: "Stop-loss cluster below support",
    estSize: "$4.2M",
    nearLevel: { name: "Support", price: 93200 },
  },
  {
    type: "buy" as const,
    level: 92100,
    clusterAt: 91700,
    label: "Longs stop-losses below major support",
    estSize: "$7.5M",
    nearLevel: { name: "Major Support", price: 92100 },
  },
];

/* ── Strategy logic conditions ── */
const ENTRY_LONG = [
  { rule: "Liquidity sweep below support", met: false },
  { rule: "Wick below cluster + reclaim", met: false },
  { rule: "Volume spike > threshold", met: false },
  { rule: "Bullish reversal candle", met: false },
];
const ENTRY_SHORT = [
  { rule: "Liquidity sweep above resistance", met: false },
  { rule: "Wick above cluster + reclaim", met: false },
  { rule: "Volume spike > threshold", met: false },
  { rule: "Bearish reversal candle", met: false },
];

/* ── Default setup state ── */
const DEFAULT_SETUP = {
  pair: "BTCUSDT",
  tf: "15m",
  sweepDepth: 0.5,
  reversalCandles: 2,
  volumeSpikeThreshold: 2.0,
  minLiquiditySize: 1.0,
  size: 0.02,
  leverage: 5,
  tp: 2.5,
  sl: 1.0,
  maxTrades: 2,
  cooldown: 20,
  timeExit: 25,
  riskProfile: "aggressive" as "conservative" | "moderate" | "aggressive",
};

export default function LiquiditySweepBotPage() {
  const [setup, setSetup] = useState(DEFAULT_SETUP);
  const accent = "#f4906c";
  const currentPrice = 94800;

  return (
    <BotProvider>
    <div className="mx-auto max-w-[1400px] space-y-4 p-4">
      {/* ── 1. Exchange Bar ── */}
      <BotExchangeBar botName="Liquidity Sweep Engine" accentColor={accent} />

      {/* ── 2. Trust Bar ── */}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        {TRUST_STATS.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-white/30">{s.label}</span>
            <span className="text-sm font-bold" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </Card>

      {/* ── 3. Chart + Bot Thinking ── */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden !p-0">
          <BotStrategyChart defaultPair="BTCUSDT" defaultTf="15m" accentColor={accent} />
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full animate-pulse"
              style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
            />
            <h3 className="text-[13px] font-semibold text-white/90">Bot Thinking</h3>
          </div>

          <div className="space-y-2.5">
            {CONDITIONS.map((c) => (
              <div key={c.label} className="flex items-start gap-2">
                <span className="mt-0.5 text-sm">{c.met ? "\u2705" : "\u274C"}</span>
                <div className="flex-1">
                  <p className="text-[12px] font-medium text-white/80">{c.label}</p>
                  <p className="text-[11px] text-white/40">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Action</p>
            <p className="mt-1 text-[12px] font-medium text-white/70">
              Watching for sweep below $92,800 buy liquidity
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-white/30">Confidence</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full" style={{ width: "45%", background: accent }} />
              </div>
              <span className="text-[12px] font-bold" style={{ color: accent }}>45%</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 4. LIQUIDITY MAP (unique) ── */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-white/90">Liquidity Map</h3>
          <span className="text-[10px] text-white/40">
            Price: <span className="font-mono font-medium text-white/70">{fmtUsd(currentPrice)}</span>
          </span>
        </div>

        <div className="relative rounded-lg border border-white/[0.06] bg-[#0a0b0d] p-4 font-mono text-[11px]">
          {/* Sell liquidity zones (above price) */}
          {LIQUIDITY_ZONES.filter((z) => z.type === "sell")
            .sort((a, b) => b.clusterAt - a.clusterAt)
            .map((zone) => (
              <div key={zone.clusterAt} className="mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-44">
                    <span className="rounded bg-[#f6465d]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#f6465d]">
                      SELL LIQ
                    </span>
                    <span className="text-[#f6465d] font-medium">{fmtUsd(zone.clusterAt)}</span>
                  </div>
                  <div className="flex-1 relative h-4">
                    <div className="absolute inset-0 rounded bg-[#f6465d]/[0.08] border border-[#f6465d]/20" />
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-[#f6465d]/20"
                      style={{ width: `${Math.min(100, (parseFloat(zone.estSize.replace(/[$M]/g, "")) / 8) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-white/50 w-14 text-right">{zone.estSize}</span>
                </div>
                <p className="mt-0.5 ml-1 text-[9px] text-white/30">{zone.label}</p>
              </div>
            ))}

          {/* Resistance line */}
          <div className="flex items-center gap-3 my-2 py-1">
            <span className="text-[10px] text-[#f6465d]/60 w-44 text-right">RESISTANCE</span>
            <div className="flex-1 border-t border-dashed border-[#f6465d]/30" />
            <span className="text-[10px] text-[#f6465d]/60">{fmtUsd(95400)}</span>
          </div>

          {/* Current price */}
          <div className="flex items-center gap-3 my-3 py-2 rounded-lg bg-white/[0.04] px-2">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            <span className="text-white font-medium">Price: {fmtUsd(currentPrice)}</span>
            <div className="flex-1" />
            <span className="text-[10px] text-white/40">
              2.1% above buy liquidity
            </span>
          </div>

          {/* Support line */}
          <div className="flex items-center gap-3 my-2 py-1">
            <span className="text-[10px] text-[#2bc48a]/60 w-44 text-right">SUPPORT</span>
            <div className="flex-1 border-t border-dashed border-[#2bc48a]/30" />
            <span className="text-[10px] text-[#2bc48a]/60">{fmtUsd(93200)}</span>
          </div>

          {/* Buy liquidity zones (below price) */}
          {LIQUIDITY_ZONES.filter((z) => z.type === "buy")
            .sort((a, b) => b.clusterAt - a.clusterAt)
            .map((zone) => (
              <div key={zone.clusterAt} className="mt-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-44">
                    <span className="rounded bg-[#2bc48a]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#2bc48a]">
                      BUY LIQ
                    </span>
                    <span className="text-[#2bc48a] font-medium">{fmtUsd(zone.clusterAt)}</span>
                  </div>
                  <div className="flex-1 relative h-4">
                    <div className="absolute inset-0 rounded bg-[#2bc48a]/[0.08] border border-[#2bc48a]/20" />
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-[#2bc48a]/20"
                      style={{ width: `${Math.min(100, (parseFloat(zone.estSize.replace(/[$M]/g, "")) / 8) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-white/50 w-14 text-right">{zone.estSize}</span>
                </div>
                <p className="mt-0.5 ml-1 text-[9px] text-white/30">{zone.label}</p>
              </div>
            ))}

          {/* Status */}
          <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3">
            <span className="rounded-md bg-[#f4906c]/15 px-2 py-0.5 text-[10px] font-bold text-[#f4906c]">
              STATUS
            </span>
            <span className="text-[11px] text-white/60">
              WATCHING for sweep below <span className="font-medium text-[#2bc48a]">{fmtUsd(92800)}</span>
            </span>
            <span className="ml-auto text-[10px] text-white/30">
              Est. {LIQUIDITY_ZONES.filter((z) => z.type === "buy").reduce((sum, z) => sum + parseFloat(z.estSize.replace(/[$M]/g, "")), 0).toFixed(1)}M in buy stops
            </span>
          </div>
        </div>
      </Card>

      {/* Signals Overview */}
      <SignalsOverview overrides={[
        { id: "liquidity", status: "Triggered" },
        { id: "liquidation-map", status: "High Risk" },
        { id: "squeeze", status: "Watching" },
        { id: "market-structure", status: "Bullish" },
        { id: "volume", status: "Watching" },
        { id: "whale-activity", status: "Watching" },
        { id: "imbalance-fvg", status: "Watching" },
      ]} />

      {/* ── 5. Backtest ── */}
      <BotBacktestPanel strategyName="Liquidity Sweep" accentColor={accent} />

      {/* ── 6. Setup + Risk ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold text-white/90">Bot Setup</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Exchange Account</span>
              <select className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none">
                <option>Auto (from Exchange Bar)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Pair</span>
              <select
                value={setup.pair}
                onChange={(e) => setSetup({ ...setup, pair: e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Timeframe</span>
              <select
                value={setup.tf}
                onChange={(e) => setSetup({ ...setup, tf: e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                {["1m", "5m", "15m", "1h", "4h"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Sweep Depth (%)</span>
              <input
                type="number"
                step="0.1"
                value={setup.sweepDepth}
                onChange={(e) => setSetup({ ...setup, sweepDepth: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Reversal Candles</span>
              <input
                type="number"
                value={setup.reversalCandles}
                onChange={(e) => setSetup({ ...setup, reversalCandles: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Vol Spike Threshold</span>
              <input
                type="number"
                step="0.1"
                value={setup.volumeSpikeThreshold}
                onChange={(e) => setSetup({ ...setup, volumeSpikeThreshold: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Min Liq Size ($M)</span>
              <input
                type="number"
                step="0.1"
                value={setup.minLiquiditySize}
                onChange={(e) => setSetup({ ...setup, minLiquiditySize: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Size (BTC)</span>
              <input
                type="number"
                step="0.001"
                value={setup.size}
                onChange={(e) => setSetup({ ...setup, size: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Leverage</span>
              <input
                type="number"
                value={setup.leverage}
                onChange={(e) => setSetup({ ...setup, leverage: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">TP (%)</span>
              <input
                type="number"
                step="0.1"
                value={setup.tp}
                onChange={(e) => setSetup({ ...setup, tp: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">SL (%)</span>
              <input
                type="number"
                step="0.1"
                value={setup.sl}
                onChange={(e) => setSetup({ ...setup, sl: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Max Trades</span>
              <input
                type="number"
                value={setup.maxTrades}
                onChange={(e) => setSetup({ ...setup, maxTrades: +e.target.value })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Risk Profile</span>
              <select
                value={setup.riskProfile}
                onChange={(e) => setSetup({ ...setup, riskProfile: e.target.value as typeof setup.riskProfile })}
                className="rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                <option value="conservative">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </label>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-[13px] font-semibold text-white/90">Risk Management</h3>
          <div className="space-y-3">
            {[
              { label: "Risk per Trade", value: `${fmt(setup.sl)}%`, color: accent },
              { label: "Max Open Positions", value: String(setup.maxTrades), color: "#fff" },
              { label: "Worst Case (all SL hit)", value: `${fmt(setup.sl * setup.maxTrades)}%`, color: "#f6465d" },
              { label: "Position Size", value: `${fmt(setup.size, 4)} BTC`, color: "#fff" },
              { label: "Notional Value", value: fmtUsd(setup.size * currentPrice * setup.leverage), color: "#5B8DEF" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5">
                <span className="text-[11px] text-white/50">{r.label}</span>
                <span className="text-[13px] font-semibold" style={{ color: r.color }}>{r.value}</span>
              </div>
            ))}

            <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/30">Market Condition</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="rounded-md bg-[#F5C542]/15 px-2 py-0.5 text-[11px] font-semibold text-[#F5C542]">
                  LIQUIDITY BUILDING
                </span>
                <span className="text-[11px] text-white/40">
                  Buy stops accumulating below <span className="font-medium text-white/70">92,800</span>
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 7. Strategy Logic ── */}
      <Card>
        <h3 className="mb-4 text-[13px] font-semibold text-white/90">Strategy Logic</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-semibold text-[#2bc48a]">Long (Buy Sweep Reversal)</p>
            <div className="space-y-1.5">
              {ENTRY_LONG.map((c) => (
                <div key={c.rule} className="flex items-center gap-2 text-[11px]">
                  <span>{c.met ? "\u2705" : "\u274C"}</span>
                  <span className={c.met ? "text-white/70" : "text-white/40"}>{c.rule}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-semibold text-[#f6465d]">Short (Sell Sweep Reversal)</p>
            <div className="space-y-1.5">
              {ENTRY_SHORT.map((c) => (
                <div key={c.rule} className="flex items-center gap-2 text-[11px]">
                  <span>{c.met ? "\u2705" : "\u274C"}</span>
                  <span className={c.met ? "text-white/70" : "text-white/40"}>{c.rule}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-semibold text-[#5B8DEF]">Exit Logic</p>
            <div className="space-y-1.5 text-[11px] text-white/60">
              <p>TP: Opposite liquidity zone</p>
              <p>SL: Beyond sweep low/high</p>
              <p>Reversal candles needed: {setup.reversalCandles}</p>
              <p>Time exit: {setup.timeExit} candles max</p>
            </div>
          </div>
        </div>
      </Card>

      {/* ── 8. Bot State + Log ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold text-white/90">Bot State</h3>
          <div className="space-y-3">
            {[
              {
                label: "Status",
                render: (
                  <span className="rounded-md bg-[#F5C542]/15 px-2 py-0.5 text-[11px] font-bold text-[#F5C542]">
                    SCANNING
                  </span>
                ),
              },
              {
                label: "Last Trade",
                render: <span className="text-[12px] text-white/60">LONG BTC @ 91,800 &middot; +3.2%</span>,
              },
              {
                label: "Current Position",
                render: <span className="text-[12px] text-white/40">None</span>,
              },
              {
                label: "Target Zone",
                render: (
                  <span className="text-[12px] font-medium text-[#2bc48a]">
                    Buy liquidity at 92,800 ($4.2M stops)
                  </span>
                ),
              },
              {
                label: "Next Action",
                render: <span className="text-[12px] text-white/60">Enter long after sweep + reversal at 92,800</span>,
              },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5">
                <span className="text-[11px] text-white/40">{row.label}</span>
                {row.render}
              </div>
            ))}
          </div>
        </Card>

        <BotLivePanel botSlug="liquidity-sweep" botName="Liquidity Sweep Bot" accentColor="#f4906c" />
        <BotExecutionLog accentColor={accent} />
      </div>
    </div>
    </BotProvider>
  );
}
