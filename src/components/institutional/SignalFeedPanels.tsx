/* ═══ Institutional Signal Feed Panels ═══ */

const COLORS = {
  blue: "#5B8DEF",
  green: "#2bc48a",
  yellow: "#F5C542",
  purple: "#A78BFA",
  orange: "#f97316",
  red: "#f6465d",
  muted: "var(--textMuted)",
  subtle: "var(--textSubtle)",
  text: "var(--text)",
};

/* ── Variation helper ── */
const vary = (base: number, range: number = 0.1) => {
  const factor = 1 + (Math.random() - 0.5) * 2 * range;
  return +(base * factor).toFixed(2);
};

/* ── AI Analysis label ── */
const AIBadge = () => (
  <span className="text-[7px] text-[#6B6F76] uppercase tracking-[0.1em] font-medium ml-auto">AI Analysis</span>
);

/* ── Signal Chips ── */
const signalChips = [
  { label: () => `BOS ↑ ${vary(148.20, 0.02).toFixed(2)}`, color: COLORS.green },
  { label: () => `Sweep ${vary(149.00, 0.02).toFixed(2)}`, color: COLORS.yellow },
  { label: () => `Vol Spike ${vary(1.8, 0.15).toFixed(1)}x`, color: COLORS.blue },
  { label: () => `OB Touch ${vary(146.50, 0.02).toFixed(2)}`, color: COLORS.purple },
  { label: () => `FVG Open ${vary(147.80, 0.02).toFixed(2)}`, color: COLORS.orange },
  { label: () => `Whale Buy $${vary(2.3, 0.2).toFixed(1)}M`, color: COLORS.green },
];

/* ── Reusable Pieces ── */
const SectionHeader = ({ title, color }: { title: string; color: string }) => (
  <div className="mb-1 flex items-center gap-1.5">
    <span className="text-[9px] font-bold tracking-[0.15em] uppercase" style={{ color }}>{title}</span>
    <AIBadge />
  </div>
);

const Row = ({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-[9px]" style={{ color: COLORS.muted }}>{label}</span>
    <span className="text-[10px] font-bold font-mono" style={{ color: valueColor || COLORS.text }}>{value}</span>
  </div>
);

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 ${className}`}>
    {children}
  </div>
);

/* ── Main Component ── */
export function SignalFeedPanels() {
  const bosPrice = vary(148.20, 0.02).toFixed(2);
  const sweepPrice = vary(149.00, 0.02).toFixed(2);
  const eqhPrice = vary(148.80, 0.02).toFixed(2);
  const restingPrice = vary(147.20, 0.02).toFixed(2);
  const buyersPct = Math.round(vary(68, 0.1));
  const volSpike = vary(1.8, 0.15).toFixed(1);
  const sellWall = vary(149.20, 0.02).toFixed(2);
  const bullOB = vary(146.50, 0.02).toFixed(2);
  const bearOB = vary(151.00, 0.02).toFixed(2);
  const mitOB = vary(148.20, 0.02).toFixed(2);
  const fvgLow = vary(147.80, 0.02).toFixed(2);
  const fvgHigh = vary(148.10, 0.02).toFixed(2);
  const filledFVG = vary(146.20, 0.02).toFixed(2);
  const deviation = vary(1.2, 0.2).toFixed(1);
  const whaleBuy = vary(2.3, 0.2).toFixed(1);
  const netFlow = vary(1.8, 0.2).toFixed(1);
  const confScore = vary(8.5, 0.08).toFixed(1);
  const confPct = Math.min(+confScore / 10, 1);
  const entryLow = vary(148.40, 0.02).toFixed(2);
  const entryHigh = vary(148.60, 0.02).toFixed(2);
  const slPrice = vary(147.20, 0.02).toFixed(2);
  const tp1 = vary(149.80, 0.02).toFixed(2);
  const tp2 = vary(151.00, 0.02).toFixed(2);
  const rr = vary(2.4, 0.1).toFixed(1);

  return (
    <div className="space-y-1.5">

      {/* ═══ 1. SIGNAL FEED — horizontal chips ═══ */}
      <Card>
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[9px] font-bold tracking-[0.15em] uppercase" style={{ color: COLORS.blue }}>Signal Feed</span>
          <AIBadge />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-0.5">
          {signalChips.map((s, idx) => {
            const lbl = s.label();
            return (
              <span
                key={idx}
                className="flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold font-mono whitespace-nowrap"
                style={{ color: s.color, background: `${s.color}18`, border: `1px solid ${s.color}30` }}
              >
                {lbl}
              </span>
            );
          })}
        </div>
      </Card>

      {/* ═══ 2. First 3-column grid ═══ */}
      <div className="grid grid-cols-3 gap-1">

        {/* MARKET STRUCTURE */}
        <Card>
          <SectionHeader title="Market Structure" color={COLORS.green} />
          <div className="space-y-0.5">
            <Row label="Structure" value="Bullish (HH/HL)" valueColor={COLORS.green} />
            <Row label="Last BOS" value={`$${bosPrice} ↑`} valueColor={COLORS.green} />
            <Row label="CHoCH" value="Not detected" />
            <Row label="Trend Strength" value="Strong" valueColor={COLORS.green} />
          </div>
        </Card>

        {/* LIQUIDITY */}
        <Card>
          <SectionHeader title="Liquidity" color={COLORS.yellow} />
          <div className="space-y-0.5">
            <Row label="Sweep" value={`Above $${sweepPrice} (taken)`} valueColor={COLORS.yellow} />
            <Row label="EQH" value={`$${eqhPrice}`} />
            <Row label="Resting" value={`Below $${restingPrice}`} />
            <Row label="Stop Hunt" value="Not active" />
          </div>
        </Card>

        {/* ORDER FLOW */}
        <Card>
          <SectionHeader title="Order Flow" color={COLORS.blue} />
          <div className="space-y-0.5">
            <Row label="Delta" value={`+${buyersPct}% Buyers`} valueColor={COLORS.green} />
            <Row label="Vol Spike" value={`YES (${volSpike}x avg)`} valueColor={COLORS.yellow} />
            <Row label="Absorption" value={`SELL wall $${sellWall}`} valueColor={COLORS.red} />
            <Row label="CVD" value="Diverging ↑" valueColor={COLORS.green} />
          </div>
        </Card>
      </div>

      {/* ═══ 3. Second 3-column grid ═══ */}
      <div className="grid grid-cols-3 gap-1">

        {/* ORDER BLOCKS */}
        <Card>
          <SectionHeader title="Order Blocks" color={COLORS.purple} />
          <div className="space-y-0.5">
            <Row label="Bullish OB" value={`$${bullOB} (untouched)`} valueColor={COLORS.green} />
            <Row label="Bearish OB" value={`$${bearOB} (active)`} valueColor={COLORS.red} />
            <Row label="Mitigated" value={`$${mitOB} ✓`} valueColor={COLORS.muted} />
          </div>
        </Card>

        {/* IMBALANCE (FVG) */}
        <Card>
          <SectionHeader title="Imbalance (FVG)" color={COLORS.orange} />
          <div className="space-y-0.5">
            <Row label="FVG" value={`$${fvgLow}–${fvgHigh} (open)`} valueColor={COLORS.orange} />
            <Row label="Filled" value={`$${filledFVG} ✓`} valueColor={COLORS.muted} />
            <Row label="VWAP" value="Above → Bullish" valueColor={COLORS.green} />
            <Row label="Deviation" value={`+${deviation}σ`} valueColor={COLORS.yellow} />
          </div>
        </Card>

        {/* WHALE ACTIVITY */}
        <Card>
          <SectionHeader title="Whale Activity" color={COLORS.green} />
          <div className="space-y-0.5">
            <Row label="Large Buy" value={`$${whaleBuy}M detected`} valueColor={COLORS.green} />
            <Row label="Large Sell" value="None" />
            <Row label="CVD Divergence" value="↑ Bullish" valueColor={COLORS.green} />
            <Row label="Net Flow" value={`+$${netFlow}M`} valueColor={COLORS.green} />
          </div>
        </Card>
      </div>

      {/* ═══ 4. Bottom row — Confluence + Active Setup ═══ */}
      <div className="grid grid-cols-2 gap-1">

        {/* CONFLUENCE SCORE */}
        <Card>
          <SectionHeader title="Confluence Score" color={COLORS.blue} />
          <div className="flex items-start gap-3">
            {/* Gauge */}
            <div className="flex flex-col items-center flex-shrink-0">
              <svg viewBox="0 0 60 60" className="h-12 w-12">
                {/* bg ring */}
                <circle cx="30" cy="30" r="25" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                {/* value ring */}
                <circle
                  cx="30" cy="30" r="25" fill="none"
                  stroke={COLORS.green} strokeWidth="5"
                  strokeDasharray={`${confPct * 2 * Math.PI * 25} ${2 * Math.PI * 25}`}
                  strokeLinecap="round"
                  transform="rotate(-90 30 30)"
                />
                <text x="30" y="33" textAnchor="middle" className="text-[11px] font-black font-mono" fill="white">{confScore}</text>
              </svg>
              <span className="text-[8px] font-bold tracking-wider mt-0.5" style={{ color: COLORS.green }}>STRONG</span>
            </div>
            {/* Confluences list */}
            <div className="space-y-0.5 min-w-0">
              {[
                { icon: "✅", text: "Structure aligned" },
                { icon: "✅", text: "Liquidity swept" },
                { icon: "✅", text: "OB support" },
                { icon: "✅", text: "Volume confirming" },
                { icon: "⚠️", text: "VWAP deviation high" },
              ].map((c) => (
                <div key={c.text} className="flex items-center gap-1">
                  <span className="text-[9px]">{c.icon}</span>
                  <span className="text-[9px]" style={{ color: c.icon === "⚠️" ? COLORS.yellow : COLORS.text }}>{c.text}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ACTIVE TRADE SETUP */}
        <Card className="border-[#2bc48a]/30 shadow-[0_0_12px_rgba(43,196,138,0.08)]">
          <SectionHeader title="Active Trade Setup" color={COLORS.green} />
          <div className="space-y-0.5">
            <Row label="Type" value="Long Pullback" valueColor={COLORS.green} />
            <Row label="Entry" value={`$${entryLow} – $${entryHigh}`} valueColor={COLORS.text} />
            <Row label="SL" value={`$${slPrice}`} valueColor={COLORS.red} />
            <Row label="TP1" value={`$${tp1}`} valueColor={COLORS.green} />
            <Row label="TP2" value={`$${tp2}`} valueColor={COLORS.green} />
            <Row label="R:R" value={rr} valueColor={COLORS.yellow} />
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#F5C542] animate-pulse" />
              <span className="text-[9px] font-bold tracking-wider" style={{ color: COLORS.yellow }}>WAITING FOR ENTRY</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
