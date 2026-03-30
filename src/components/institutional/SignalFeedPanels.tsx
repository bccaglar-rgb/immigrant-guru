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

/* ── Signal Chips ── */
const signalChips = [
  { label: "BOS ↑ 148.20", color: COLORS.green },
  { label: "Sweep 149.00", color: COLORS.yellow },
  { label: "Vol Spike 1.8x", color: COLORS.blue },
  { label: "OB Touch 146.50", color: COLORS.purple },
  { label: "FVG Open 147.80", color: COLORS.orange },
  { label: "Whale Buy $2.3M", color: COLORS.green },
];

/* ── Reusable Pieces ── */
const SectionHeader = ({ title, color }: { title: string; color: string }) => (
  <div className="mb-1">
    <span className="text-[9px] font-bold tracking-[0.15em] uppercase" style={{ color }}>{title}</span>
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
  return (
    <div className="space-y-1.5">

      {/* ═══ 1. SIGNAL FEED — horizontal chips ═══ */}
      <Card>
        <SectionHeader title="Signal Feed" color={COLORS.blue} />
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-0.5">
          {signalChips.map((s) => (
            <span
              key={s.label}
              className="flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold font-mono whitespace-nowrap"
              style={{ color: s.color, background: `${s.color}18`, border: `1px solid ${s.color}30` }}
            >
              {s.label}
            </span>
          ))}
        </div>
      </Card>

      {/* ═══ 2. First 3-column grid ═══ */}
      <div className="grid grid-cols-3 gap-1">

        {/* MARKET STRUCTURE */}
        <Card>
          <SectionHeader title="Market Structure" color={COLORS.green} />
          <div className="space-y-0.5">
            <Row label="Structure" value="Bullish (HH/HL)" valueColor={COLORS.green} />
            <Row label="Last BOS" value="$148.20 ↑" valueColor={COLORS.green} />
            <Row label="CHoCH" value="Not detected" />
            <Row label="Trend Strength" value="Strong" valueColor={COLORS.green} />
          </div>
        </Card>

        {/* LIQUIDITY */}
        <Card>
          <SectionHeader title="Liquidity" color={COLORS.yellow} />
          <div className="space-y-0.5">
            <Row label="Sweep" value="Above $149.00 (taken)" valueColor={COLORS.yellow} />
            <Row label="EQH" value="$148.80" />
            <Row label="Resting" value="Below $147.20" />
            <Row label="Stop Hunt" value="Not active" />
          </div>
        </Card>

        {/* ORDER FLOW */}
        <Card>
          <SectionHeader title="Order Flow" color={COLORS.blue} />
          <div className="space-y-0.5">
            <Row label="Delta" value="+68% Buyers" valueColor={COLORS.green} />
            <Row label="Vol Spike" value="YES (1.8x avg)" valueColor={COLORS.yellow} />
            <Row label="Absorption" value="SELL wall $149.20" valueColor={COLORS.red} />
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
            <Row label="Bullish OB" value="$146.50 (untouched)" valueColor={COLORS.green} />
            <Row label="Bearish OB" value="$151.00 (active)" valueColor={COLORS.red} />
            <Row label="Mitigated" value="$148.20 ✓" valueColor={COLORS.muted} />
          </div>
        </Card>

        {/* IMBALANCE (FVG) */}
        <Card>
          <SectionHeader title="Imbalance (FVG)" color={COLORS.orange} />
          <div className="space-y-0.5">
            <Row label="FVG" value="$147.80–148.10 (open)" valueColor={COLORS.orange} />
            <Row label="Filled" value="$146.20 ✓" valueColor={COLORS.muted} />
            <Row label="VWAP" value="Above → Bullish" valueColor={COLORS.green} />
            <Row label="Deviation" value="+1.2σ" valueColor={COLORS.yellow} />
          </div>
        </Card>

        {/* WHALE ACTIVITY */}
        <Card>
          <SectionHeader title="Whale Activity" color={COLORS.green} />
          <div className="space-y-0.5">
            <Row label="Large Buy" value="$2.3M detected" valueColor={COLORS.green} />
            <Row label="Large Sell" value="None" />
            <Row label="CVD Divergence" value="↑ Bullish" valueColor={COLORS.green} />
            <Row label="Net Flow" value="+$1.8M" valueColor={COLORS.green} />
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
                {/* value ring — 8.5/10 = 85% */}
                <circle
                  cx="30" cy="30" r="25" fill="none"
                  stroke={COLORS.green} strokeWidth="5"
                  strokeDasharray={`${0.85 * 2 * Math.PI * 25} ${2 * Math.PI * 25}`}
                  strokeLinecap="round"
                  transform="rotate(-90 30 30)"
                />
                <text x="30" y="33" textAnchor="middle" className="text-[11px] font-black font-mono" fill="white">8.5</text>
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
            <Row label="Entry" value="$148.40 – $148.60" valueColor={COLORS.text} />
            <Row label="SL" value="$147.20" valueColor={COLORS.red} />
            <Row label="TP1" value="$149.80" valueColor={COLORS.green} />
            <Row label="TP2" value="$151.00" valueColor={COLORS.green} />
            <Row label="R:R" value="2.4" valueColor={COLORS.yellow} />
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
