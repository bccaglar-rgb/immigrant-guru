import { useState } from "react";

/* ── Variation helper ── */
const vary = (base: number, range: number = 0.1) => {
  const factor = 1 + (Math.random() - 0.5) * 2 * range;
  return +(base * factor).toFixed(2);
};

/* ── AI badge label ── */
const AILabel = () => (
  <span className="text-[7px] text-[#6B6F76] uppercase tracking-[0.1em] font-medium ml-auto">AI Analysis</span>
);

/* ══════════════════════════════════════════════════════════════
   Shared primitives
   ══════════════════════════════════════════════════════════════ */

const Badge = ({
  text,
  variant,
  size = "sm",
}: {
  text: string;
  variant: "green" | "red" | "yellow" | "blue" | "orange" | "muted";
  size?: "sm" | "md";
}) => {
  const colors: Record<string, string> = {
    green: "bg-[#2bc48a]/15 text-[#2bc48a] border-[#2bc48a]/20",
    red: "bg-[#f6465d]/15 text-[#f6465d] border-[#f6465d]/20",
    yellow: "bg-[#F5C542]/15 text-[#F5C542] border-[#F5C542]/20",
    blue: "bg-[#5B8DEF]/15 text-[#5B8DEF] border-[#5B8DEF]/20",
    orange: "bg-[#FF9F43]/15 text-[#FF9F43] border-[#FF9F43]/20",
    muted: "bg-white/[0.06] text-[var(--textMuted)] border-white/[0.08]",
  };
  const sz = size === "md" ? "px-2 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[9px]";
  return (
    <span className={`inline-flex items-center rounded-md border font-bold ${sz} ${colors[variant]}`}>
      {text}
    </span>
  );
};

const SectionHeader = ({ icon, title }: { icon: string; title: string }) => (
  <div className="flex items-center gap-1.5 mb-1">
    <span className="text-[10px]">{icon}</span>
    <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--textMuted)]">{title}</span>
    <AILabel />
  </div>
);

const PanelCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 ${className}`}>{children}</div>
);

const StatRow = ({
  label,
  value,
  color,
  arrow,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  arrow?: "up" | "down";
  sub?: string;
}) => (
  <div className="flex items-center justify-between py-[2px]">
    <span className="text-[9px] text-[var(--textMuted)]">{label}</span>
    <div className="flex items-center gap-1">
      {arrow && (
        <span className={`text-[9px] ${arrow === "up" ? "text-[#2bc48a]" : "text-[#f6465d]"}`}>
          {arrow === "up" ? "\u2191" : "\u2193"}
        </span>
      )}
      <span className="font-mono text-[10px] font-semibold" style={{ color: color ?? "var(--text)" }}>
        {value}
      </span>
      {sub && <span className="text-[8px] text-[var(--textSubtle)] ml-1">{sub}</span>}
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════
   1. CompactStrip — replaces MarketModePanel + AIMasterScore
   ══════════════════════════════════════════════════════════════ */

const StripChip = ({ label, value, variant }: { label: string; value: string; variant: "green" | "red" | "yellow" | "blue" | "orange" | "muted" }) => {
  const colors: Record<string, string> = {
    green: "bg-[#2bc48a]/15 text-[#2bc48a] border-[#2bc48a]/20",
    red: "bg-[#f6465d]/15 text-[#f6465d] border-[#f6465d]/20",
    yellow: "bg-[#F5C542]/15 text-[#F5C542] border-[#F5C542]/20",
    blue: "bg-[#5B8DEF]/15 text-[#5B8DEF] border-[#5B8DEF]/20",
    orange: "bg-[#FF9F43]/15 text-[#FF9F43] border-[#FF9F43]/20",
    muted: "bg-white/[0.06] text-[var(--textMuted)] border-white/[0.08]",
  };
  return (
    <div className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${colors[variant]}`}>
      <span className="text-[8px] text-[var(--textSubtle)] font-medium">{label}:</span>
      <span className="text-[9px] font-bold font-mono">{value}</span>
    </div>
  );
};

export const CompactStrip = () => {
  const aiScore = vary(8.2, 0.06).toFixed(1);
  const quality = vary(8.2, 0.06).toFixed(1);
  return (
    <div className="flex items-center gap-1.5 flex-wrap rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5" style={{ maxHeight: "50px" }}>
      <StripChip label="Regime" value="TRENDING" variant="green" />
      <StripChip label="Risk" value="ON" variant="green" />
      <StripChip label="Vol" value="MEDIUM" variant="yellow" />
      <StripChip label="Bias" value="BULLISH" variant="green" />
      <StripChip label="AI" value={`${aiScore}\u2191`} variant="green" />
      <StripChip label="Mode" value="AGGRESSIVE" variant="green" />
      <StripChip label="Conf" value="HIGH" variant="green" />
      <StripChip label="Quality" value={quality} variant="blue" />
      <AILabel />
    </div>
  );
};

/* keep old exports alive so nothing breaks at import level — but they are no longer used */
export const MarketModePanel = CompactStrip;
export const AIMasterScore = () => null;

/* ══════════════════════════════════════════════════════════════
   3. CapitalFlowPanel
   ══════════════════════════════════════════════════════════════ */

export const CapitalFlowPanel = () => (
  <PanelCard>
    <SectionHeader icon={"\uD83D\uDCB0"} title="Capital Flow" />
    <div className="space-y-0.5">
      <StatRow label="BTC Dominance" value={`${vary(54.2, 0.03).toFixed(1)}%`} color="#F5C542" arrow="down" />
      <StatRow label="Altcoin Flow" value="Increasing" color="#2bc48a" arrow="up" />
      <StatRow label="Net Inflow" value={`+$${vary(2.3, 0.12).toFixed(1)}B`} color="#2bc48a" />
      <StatRow label="Stablecoin" value="Outflow" color="#F5C542" />
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   4. InstitutionalFlowPanel
   ══════════════════════════════════════════════════════════════ */

export const InstitutionalFlowPanel = () => (
  <PanelCard>
    <SectionHeader icon={"\uD83C\uDFE6"} title="Institutional" />
    <div className="space-y-0.5">
      <StatRow label="ETF Inflow" value={`+$${Math.round(vary(480, 0.1))}M`} color="#2bc48a" />
      <StatRow label="Whale Net" value={`+$${Math.round(vary(320, 0.1))}M`} color="#2bc48a" />
      <div className="flex items-center justify-between py-[2px]">
        <span className="text-[9px] text-[var(--textMuted)]">Smart Money</span>
        <Badge text="ACCUMULATING" variant="green" />
      </div>
      <StatRow label="Grayscale" value={`+$${Math.round(vary(120, 0.1))}M`} color="#2bc48a" />
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   5. SectorDominance
   ══════════════════════════════════════════════════════════════ */

const sectors = [
  { rank: 1, name: "AI Coins", pct: vary(5.2, 0.12), bar: Math.round(vary(80, 0.05)) },
  { rank: 2, name: "L1", pct: vary(3.8, 0.12), bar: Math.round(vary(60, 0.06)) },
  { rank: 3, name: "Meme", pct: vary(1.2, 0.2), bar: Math.round(vary(40, 0.08)) },
  { rank: 4, name: "DeFi", pct: vary(-2.1, 0.12), bar: Math.round(vary(30, 0.08)) },
  { rank: 5, name: "Gaming", pct: vary(-3.5, 0.12), bar: Math.round(vary(15, 0.1)) },
];

export const SectorDominance = () => (
  <PanelCard>
    <SectionHeader icon={"\uD83D\uDCCA"} title="Sector Dominance" />
    <div className="space-y-1">
      {sectors.map((s) => {
        const isUp = s.pct >= 0;
        const color = isUp ? "#2bc48a" : "#f6465d";
        return (
          <div key={s.rank} className="flex items-center gap-1.5">
            <span className="text-[8px] text-[var(--textSubtle)] w-3 text-right">#{s.rank}</span>
            <span className="text-[9px] text-[var(--text)] w-[48px] truncate">{s.name}</span>
            <div className="flex-1 h-[5px] rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.bar}%`, background: color }} />
            </div>
            <span className="font-mono text-[9px] font-semibold w-[40px] text-right" style={{ color }}>
              {isUp ? "+" : ""}{s.pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   7. RiskEngine
   ══════════════════════════════════════════════════════════════ */

const riskItems = [
  { label: "Liquidation Risk", value: "HIGH", variant: "red" as const },
  { label: "Funding", value: "Overheated", variant: "yellow" as const },
  { label: "Crowd Position", value: "Overlong", variant: "yellow" as const },
  { label: "Drawdown Risk", value: "MEDIUM", variant: "yellow" as const },
];

export const RiskEngine = () => (
  <PanelCard>
    <SectionHeader icon={"\u26A0\uFE0F"} title="Risk Status" />
    <div className="space-y-0.5">
      {riskItems.map((r) => (
        <div key={r.label} className="flex items-center justify-between py-[1px]">
          <span className="text-[9px] text-[var(--textMuted)]">{r.label}</span>
          <Badge text={r.value} variant={r.variant} />
        </div>
      ))}
    </div>
    <div className="mt-1.5 rounded-md bg-[#F5C542]/[0.06] border border-[#F5C542]/10 px-2 py-1">
      <div className="flex items-center gap-1">
        <span className="text-[9px]">{"\u26A1"}</span>
        <span className="text-[9px] font-semibold text-[#F5C542]">Warning:</span>
        <span className="text-[8px] text-[#F5C542]/80">Pullback likely within 4-8H</span>
      </div>
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   8. StrategyMode
   ══════════════════════════════════════════════════════════════ */

export const StrategyMode = () => (
  <PanelCard>
    <SectionHeader icon={"\u2694\uFE0F"} title="Strategy" />
    <div className="space-y-0.5">
      <div className="flex items-center justify-between py-[1px]">
        <span className="text-[9px] text-[var(--textMuted)]">Mode</span>
        <span className="font-mono text-[10px] font-bold text-[#2bc48a]">BUY THE DIP</span>
      </div>
      <div className="flex items-center justify-between py-[1px]">
        <span className="text-[9px] text-[var(--textMuted)]">Avoid</span>
        <span className="font-mono text-[9px] font-semibold text-[#f6465d]">Aggressive shorts</span>
      </div>
      <div className="flex items-center justify-between py-[1px]">
        <span className="text-[9px] text-[var(--textMuted)]">Focus</span>
        <span className="font-mono text-[9px] font-semibold text-[#2bc48a]">Pullbacks on L1</span>
      </div>
      <div className="flex items-center justify-between py-[1px]">
        <span className="text-[9px] text-[var(--textMuted)]">Timeframe</span>
        <span className="font-mono text-[9px] font-semibold text-[var(--text)]">1H-4H</span>
      </div>
      <div className="flex items-center justify-between py-[1px]">
        <span className="text-[9px] text-[var(--textMuted)]">Risk per trade</span>
        <span className="font-mono text-[9px] font-semibold text-[#F5C542]">1-2%</span>
      </div>
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   9. TopAssets
   ══════════════════════════════════════════════════════════════ */

const topAssets = [
  { rank: 1, symbol: "SOL", note: "Strong trend, pullback entry", confidence: Math.round(vary(84, 0.04)) },
  { rank: 2, symbol: "AVAX", note: "Breakout imminent", confidence: Math.round(vary(79, 0.04)) },
  { rank: 3, symbol: "BTC", note: "Key level test", confidence: Math.round(vary(76, 0.04)) },
  { rank: 4, symbol: "LINK", note: "Momentum building", confidence: Math.round(vary(72, 0.04)) },
];

export const TopAssets = () => (
  <PanelCard>
    <SectionHeader icon={"\uD83C\uDFC6"} title="Top Assets" />
    <div className="space-y-1.5">
      {topAssets.map((a) => {
        const color = a.confidence >= 80 ? "#2bc48a" : a.confidence >= 75 ? "#5B8DEF" : "#F5C542";
        return (
          <div key={a.rank}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-[var(--textSubtle)]">{a.rank}.</span>
                <span className="text-[10px] font-bold text-[var(--text)]">{a.symbol}</span>
                <span className="text-[8px] text-[var(--textMuted)]">{a.note}</span>
              </div>
              <span className="font-mono text-[9px] font-semibold" style={{ color }}>{a.confidence}%</span>
            </div>
            <div className="mt-0.5 h-[3px] w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${a.confidence}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   NEW: MicroSignalBar
   ══════════════════════════════════════════════════════════════ */

export const MicroSignalBar = () => (
  <div className="flex items-center gap-1.5 flex-wrap rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1">
    <StripChip label="BOS" value={`\u2191 $${vary(84.20, 0.02).toFixed(2)}`} variant="green" />
    <StripChip label="Sweep" value={"\u2713"} variant="green" />
    <StripChip label="OB" value={`Active $${vary(83.50, 0.02).toFixed(2)}`} variant="blue" />
    <StripChip label="FVG" value="Open" variant="yellow" />
    <StripChip label="Delta" value={`+${Math.round(vary(62, 0.08))}%`} variant="green" />
    <StripChip label="Mom" value="Strong" variant="green" />
    <AILabel />
  </div>
);

/* ══════════════════════════════════════════════════════════════
   NEW: QuickEntryPanel
   ══════════════════════════════════════════════════════════════ */

export const QuickEntryPanel = () => (
  <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1">
    <div className="flex items-center gap-1.5 flex-1 flex-wrap">
      <span className="text-[8px] text-[var(--textSubtle)]">Entry:</span>
      <span className="font-mono text-[9px] font-bold text-[var(--text)]">${vary(84.20, 0.02).toFixed(2)}</span>
      <span className="text-[8px] text-[var(--textSubtle)]">|</span>
      <span className="text-[8px] text-[var(--textSubtle)]">SL:</span>
      <span className="font-mono text-[9px] font-bold text-[#f6465d]">${vary(83.10, 0.02).toFixed(2)}</span>
      <span className="text-[8px] text-[var(--textSubtle)]">|</span>
      <span className="text-[8px] text-[var(--textSubtle)]">TP:</span>
      <span className="font-mono text-[9px] font-bold text-[#2bc48a]">${vary(86.00, 0.02).toFixed(2)}</span>
      <span className="text-[8px] text-[var(--textSubtle)]">|</span>
      <span className="text-[8px] text-[var(--textSubtle)]">RR:</span>
      <span className="font-mono text-[9px] font-bold text-[#5B8DEF]">{vary(2.3, 0.1).toFixed(1)}</span>
      <AILabel />
    </div>
    <div className="flex items-center gap-1">
      <button type="button" className="rounded-md bg-[#2bc48a]/20 border border-[#2bc48a]/30 px-2.5 py-0.5 text-[9px] font-bold text-[#2bc48a] hover:bg-[#2bc48a]/30 transition-colors">LONG</button>
      <button type="button" className="rounded-md bg-[#f6465d]/20 border border-[#f6465d]/30 px-2.5 py-0.5 text-[9px] font-bold text-[#f6465d] hover:bg-[#f6465d]/30 transition-colors">SHORT</button>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════
   NEW: DecisionBox
   ══════════════════════════════════════════════════════════════ */

export const DecisionBox = () => (
  <div className="flex items-center gap-1.5 rounded-lg border border-[#5B8DEF]/20 bg-[#5B8DEF]/[0.06] px-2 py-1">
    <span className="text-[10px]">{"\uD83E\uDDE0"}</span>
    <span className="text-[9px] font-bold text-[#5B8DEF]">WHAT TO DO NOW?</span>
    <span className="text-[8px] text-[var(--textSubtle)]">{"\u2192"}</span>
    <span className="text-[9px] text-[var(--text)]">Wait for pullback near ${vary(84.00, 0.02).toFixed(2)}</span>
    <span className="text-[8px] text-[var(--textSubtle)]">{"\u2192"}</span>
    <span className="text-[9px] text-[#F5C542]">Avoid chasing</span>
    <span className="text-[8px] text-[var(--textSubtle)]">{"\u2192"}</span>
    <span className="text-[8px] text-[var(--textSubtle)]">Edge:</span>
    <span className="font-mono text-[9px] font-bold text-[#2bc48a]">{vary(8.5, 0.06).toFixed(1)}/10</span>
  </div>
);

/* ══════════════════════════════════════════════════════════════
   NEW: LiveOrderFlowMini
   ══════════════════════════════════════════════════════════════ */

export const LiveOrderFlowMini = () => (
  <PanelCard>
    <SectionHeader icon={"\uD83D\uDCE1"} title="Live Order Flow" />
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <span className="text-[8px] text-[var(--textSubtle)]">Buy:</span>
        <span className="font-mono text-[9px] font-bold text-[#2bc48a]">+${vary(1.2, 0.15).toFixed(1)}M</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[8px] text-[var(--textSubtle)]">Sell:</span>
        <span className="font-mono text-[9px] font-bold text-[#f6465d]">-${Math.round(vary(800, 0.12))}K</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[8px] text-[var(--textSubtle)]">Net:</span>
        <span className="font-mono text-[9px] font-bold text-[#2bc48a]">+${Math.round(vary(400, 0.15))}K</span>
        <span className="h-2 w-2 rounded-full bg-[#2bc48a]" />
      </div>
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   NEW: MomentumGauge
   ══════════════════════════════════════════════════════════════ */

export const MomentumGauge = () => (
  <PanelCard>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px]">{"\uD83D\uDCC8"}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--textMuted)]">Momentum</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] font-bold text-[#2bc48a]">STRONG {"\u2191"}</span>
        <div className="flex items-center gap-[1px]">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-2 w-[4px] rounded-[1px] bg-[#2bc48a]" />
          ))}
          {[...Array(2)].map((_, i) => (
            <div key={`e${i}`} className="h-2 w-[4px] rounded-[1px] bg-white/[0.08]" />
          ))}
        </div>
      </div>
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   NEW: LiquidityMagnet
   ══════════════════════════════════════════════════════════════ */

export const LiquidityMagnet = () => (
  <PanelCard>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px]">{"\uD83E\uDDF2"}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--textMuted)]">Liquidity</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-[var(--textSubtle)]">Magnet:</span>
          <span className="font-mono text-[9px] font-bold text-[#2bc48a]">${vary(85.20, 0.02).toFixed(2)} {"\u2191"}</span>
        </div>
        <span className="text-[8px] text-[var(--textSubtle)]">|</span>
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-[var(--textSubtle)]">Risk Timer:</span>
          <span className="font-mono text-[9px] font-bold text-[#F5C542]">~2H</span>
        </div>
      </div>
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   10. Bottom Strip panels
   ══════════════════════════════════════════════════════════════ */

const TFBadge = ({ tf, state, variant }: { tf: string; state: string; variant: "green" | "yellow" | "red" }) => (
  <div className="flex items-center gap-1">
    <span className="font-mono text-[9px] text-[var(--textMuted)]">{tf}:</span>
    <Badge text={state} variant={variant} />
  </div>
);

export const TimeframeControl = () => (
  <PanelCard>
    <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--textSubtle)] mb-1 block">Timeframe Control</span>
    <div className="flex flex-wrap items-center gap-1.5">
      <TFBadge tf="1D" state="Bullish" variant="green" />
      <TFBadge tf="4H" state="Bullish" variant="green" />
      <TFBadge tf="1H" state="Pullback" variant="yellow" />
      <TFBadge tf="15m" state="Weak" variant="red" />
    </div>
  </PanelCard>
);

export const MarketStructure = () => (
  <PanelCard>
    <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--textSubtle)] mb-1 block">Market Structure</span>
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] text-[var(--textMuted)]">BTC:</span>
        <span className="font-mono text-[9px] font-semibold text-[#2bc48a]">HH/HL (Bullish)</span>
      </div>
      <span className="text-[var(--textSubtle)] text-[9px]">|</span>
      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] text-[var(--textMuted)]">ETH:</span>
        <span className="font-mono text-[9px] font-semibold text-[#F5C542]">Range</span>
      </div>
      <span className="text-[var(--textSubtle)] text-[9px]">|</span>
      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] text-[var(--textMuted)]">SOL:</span>
        <span className="font-mono text-[9px] font-semibold text-[#2bc48a]">Expansion</span>
      </div>
    </div>
  </PanelCard>
);

export const AutoModeSwitch = () => {
  const [mode, setMode] = useState<"aggressive" | "cautious" | "defensive">("aggressive");

  const modes = [
    { key: "aggressive" as const, label: "AGGRESSIVE", desc: "Trend strong \u2192 full size", variant: "green" as const },
    { key: "cautious" as const, label: "CAUTIOUS", desc: "Mixed signals \u2192 reduce size", variant: "yellow" as const },
    { key: "defensive" as const, label: "DEFENSIVE", desc: "Risk high \u2192 hedge/cash", variant: "red" as const },
  ];

  return (
    <PanelCard>
      <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--textSubtle)] mb-1 block">Auto Mode Switch</span>
      <div className="flex gap-1">
        {modes.map((m) => {
          const active = mode === m.key;
          const ring = m.variant === "green" ? "#2bc48a" : m.variant === "yellow" ? "#F5C542" : "#f6465d";
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`flex-1 rounded-md border px-1.5 py-1 text-left transition-all ${
                active
                  ? `border-[${ring}]/40 bg-[${ring}]/10`
                  : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
              }`}
              style={active ? { borderColor: `${ring}66`, background: `${ring}1a` } : undefined}
            >
              <span className="block text-[9px] font-bold" style={{ color: active ? ring : "var(--textMuted)" }}>
                {m.label}
              </span>
              <span className="block text-[7px] text-[var(--textSubtle)] leading-tight mt-0.5">{m.desc}</span>
            </button>
          );
        })}
      </div>
    </PanelCard>
  );
};
