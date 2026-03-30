import { useState } from "react";

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
  const sz = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span className={`inline-flex items-center rounded-md border font-bold ${sz} ${colors[variant]}`}>
      {text}
    </span>
  );
};

const SectionHeader = ({ icon, title }: { icon: string; title: string }) => (
  <div className="flex items-center gap-2 mb-2">
    <span className="text-sm">{icon}</span>
    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--textMuted)]">{title}</span>
  </div>
);

const PanelCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 ${className}`}>{children}</div>
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
  <div className="flex items-center justify-between py-[3px]">
    <span className="text-[10px] text-[var(--textMuted)]">{label}</span>
    <div className="flex items-center gap-1">
      {arrow && (
        <span className={`text-[9px] ${arrow === "up" ? "text-[#2bc48a]" : "text-[#f6465d]"}`}>
          {arrow === "up" ? "\u2191" : "\u2193"}
        </span>
      )}
      <span className="font-mono text-[11px] font-semibold" style={{ color: color ?? "var(--text)" }}>
        {value}
      </span>
      {sub && <span className="text-[9px] text-[var(--textSubtle)] ml-1">{sub}</span>}
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════
   1. MarketModePanel
   ══════════════════════════════════════════════════════════════ */

export const MarketModePanel = () => (
  <PanelCard>
    <SectionHeader icon="\uD83C\uDF0D" title="Market Mode" />
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      <div className="space-y-0.5">
        <span className="text-[9px] text-[var(--textSubtle)]">Regime</span>
        <div><Badge text="TRENDING" variant="green" size="md" /></div>
      </div>
      <div className="space-y-0.5">
        <span className="text-[9px] text-[var(--textSubtle)]">Risk</span>
        <div><Badge text="ON" variant="green" size="md" /></div>
      </div>
      <div className="space-y-0.5">
        <span className="text-[9px] text-[var(--textSubtle)]">Volatility</span>
        <div><Badge text="MEDIUM" variant="yellow" size="md" /></div>
      </div>
      <div className="space-y-0.5">
        <span className="text-[9px] text-[var(--textSubtle)]">Macro Bias</span>
        <div className="text-[18px] font-black text-[#2bc48a] leading-tight">BULLISH</div>
      </div>
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   2. AIMasterScore — ring gauge
   ══════════════════════════════════════════════════════════════ */

export const AIMasterScore = () => {
  const score = 8.2;
  const pct = score / 10;
  const radius = 44;
  const circ = 2 * Math.PI * radius;
  const dashOffset = circ * (1 - pct);

  return (
    <PanelCard className="flex flex-col items-center">
      <SectionHeader icon="\uD83E\uDDE0" title="AI Master Score" />
      {/* Ring */}
      <div className="relative flex items-center justify-center w-[110px] h-[110px]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#2bc48a"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={dashOffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <span className="font-mono text-xl font-bold text-[#2bc48a]">{score}</span>
      </div>
      {/* Metrics below */}
      <div className="w-full mt-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-[var(--textSubtle)]">Confidence</span>
          <Badge text="HIGH" variant="green" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-[var(--textSubtle)]">Signal Mode</span>
          <Badge text="AGGRESSIVE" variant="green" />
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[var(--textSubtle)]">Market Quality</span>
            <span className="font-mono text-[10px] font-semibold text-[var(--text)]">8.2/10</span>

          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-[#2bc48a] transition-all duration-700" style={{ width: "82%" }} />
          </div>
        </div>
      </div>
    </PanelCard>
  );
};

/* ══════════════════════════════════════════════════════════════
   3. CapitalFlowPanel
   ══════════════════════════════════════════════════════════════ */

export const CapitalFlowPanel = () => (
  <PanelCard>
    <SectionHeader icon="\uD83D\uDCB0" title="Capital Flow" />
    <div className="space-y-0.5">
      <StatRow label="BTC Dominance" value="54.2%" color="#F5C542" arrow="down" />
      <StatRow label="Altcoin Flow" value="Increasing" color="#2bc48a" arrow="up" />
      <StatRow label="Net Inflow" value="+$2.3B" color="#2bc48a" />
      <StatRow label="Stablecoin" value="Outflow" color="#F5C542" />
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   4. InstitutionalFlowPanel
   ══════════════════════════════════════════════════════════════ */

export const InstitutionalFlowPanel = () => (
  <PanelCard>
    <SectionHeader icon="\uD83C\uDFE6" title="Institutional" />
    <div className="space-y-0.5">
      <StatRow label="ETF Inflow" value="+$480M" color="#2bc48a" />
      <StatRow label="Whale Net" value="+$320M" color="#2bc48a" />
      <div className="flex items-center justify-between py-[3px]">
        <span className="text-[10px] text-[var(--textMuted)]">Smart Money</span>
        <Badge text="ACCUMULATING" variant="green" />
      </div>
      <StatRow label="Grayscale" value="+$120M" color="#2bc48a" />
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   5. SectorDominance
   ══════════════════════════════════════════════════════════════ */

const sectors = [
  { rank: 1, name: "AI Coins", pct: 5.2, bar: 80 },
  { rank: 2, name: "L1", pct: 3.8, bar: 60 },
  { rank: 3, name: "Meme", pct: 1.2, bar: 40 },
  { rank: 4, name: "DeFi", pct: -2.1, bar: 30 },
  { rank: 5, name: "Gaming", pct: -3.5, bar: 15 },
];

export const SectorDominance = () => (
  <PanelCard>
    <SectionHeader icon="\uD83D\uDCCA" title="Sector Dominance" />
    <div className="space-y-1.5">
      {sectors.map((s) => {
        const isUp = s.pct >= 0;
        const color = isUp ? "#2bc48a" : "#f6465d";
        return (
          <div key={s.rank} className="flex items-center gap-2">
            <span className="text-[9px] text-[var(--textSubtle)] w-3 text-right">#{s.rank}</span>
            <span className="text-[10px] text-[var(--text)] w-[52px] truncate">{s.name}</span>
            <div className="flex-1 h-[6px] rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.bar}%`, background: color }} />
            </div>
            <span className="font-mono text-[10px] font-semibold w-[42px] text-right" style={{ color }}>
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
    <SectionHeader icon="\u26A0\uFE0F" title="Risk Status" />
    <div className="space-y-1">
      {riskItems.map((r) => (
        <div key={r.label} className="flex items-center justify-between py-[2px]">
          <span className="text-[10px] text-[var(--textMuted)]">{r.label}</span>
          <Badge text={r.value} variant={r.variant} />
        </div>
      ))}
    </div>
    <div className="mt-2 rounded-lg bg-[#F5C542]/[0.06] border border-[#F5C542]/10 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px]">\u26A1</span>
        <span className="text-[10px] font-semibold text-[#F5C542]">Warning:</span>
        <span className="text-[9px] text-[#F5C542]/80">Pullback likely within 4-8H</span>
      </div>
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   8. StrategyMode
   ══════════════════════════════════════════════════════════════ */

export const StrategyMode = () => (
  <PanelCard>
    <SectionHeader icon="\u2694\uFE0F" title="Strategy" />
    <div className="space-y-1">
      <div className="flex items-center justify-between py-[2px]">
        <span className="text-[10px] text-[var(--textMuted)]">Mode</span>
        <span className="font-mono text-[11px] font-bold text-[#2bc48a]">BUY THE DIP</span>
      </div>
      <div className="flex items-center justify-between py-[2px]">
        <span className="text-[10px] text-[var(--textMuted)]">Avoid</span>
        <span className="font-mono text-[10px] font-semibold text-[#f6465d]">Aggressive shorts</span>
      </div>
      <div className="flex items-center justify-between py-[2px]">
        <span className="text-[10px] text-[var(--textMuted)]">Focus</span>
        <span className="font-mono text-[10px] font-semibold text-[#2bc48a]">Pullbacks on L1</span>
      </div>
      <div className="flex items-center justify-between py-[2px]">
        <span className="text-[10px] text-[var(--textMuted)]">Timeframe</span>
        <span className="font-mono text-[10px] font-semibold text-[var(--text)]">1H-4H</span>
      </div>
      <div className="flex items-center justify-between py-[2px]">
        <span className="text-[10px] text-[var(--textMuted)]">Risk per trade</span>
        <span className="font-mono text-[10px] font-semibold text-[#F5C542]">1-2%</span>
      </div>
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   9. TopAssets
   ══════════════════════════════════════════════════════════════ */

const topAssets = [
  { rank: 1, symbol: "SOL", note: "Strong trend, pullback entry", confidence: 84 },
  { rank: 2, symbol: "AVAX", note: "Breakout imminent", confidence: 79 },
  { rank: 3, symbol: "BTC", note: "Key level test", confidence: 76 },
  { rank: 4, symbol: "LINK", note: "Momentum building", confidence: 72 },
];

export const TopAssets = () => (
  <PanelCard>
    <SectionHeader icon="\uD83C\uDFC6" title="Top Assets" />
    <div className="space-y-2">
      {topAssets.map((a) => {
        const color = a.confidence >= 80 ? "#2bc48a" : a.confidence >= 75 ? "#5B8DEF" : "#F5C542";
        return (
          <div key={a.rank}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-[var(--textSubtle)]">{a.rank}.</span>
                <span className="text-[11px] font-bold text-[var(--text)]">{a.symbol}</span>
                <span className="text-[9px] text-[var(--textMuted)]">{a.note}</span>
              </div>
              <span className="font-mono text-[10px] font-semibold" style={{ color }}>{a.confidence}%</span>
            </div>
            <div className="mt-0.5 h-[4px] w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${a.confidence}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  </PanelCard>
);

/* ══════════════════════════════════════════════════════════════
   10. Bottom Strip panels
   ══════════════════════════════════════════════════════════════ */

const TFBadge = ({ tf, state, variant }: { tf: string; state: string; variant: "green" | "yellow" | "red" }) => (
  <div className="flex items-center gap-1.5">
    <span className="font-mono text-[10px] text-[var(--textMuted)]">{tf}:</span>
    <Badge text={state} variant={variant} />
  </div>
);

export const TimeframeControl = () => (
  <PanelCard>
    <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--textSubtle)] mb-1.5 block">Timeframe Control</span>
    <div className="flex flex-wrap items-center gap-2">
      <TFBadge tf="1D" state="Bullish" variant="green" />
      <TFBadge tf="4H" state="Bullish" variant="green" />
      <TFBadge tf="1H" state="Pullback" variant="yellow" />
      <TFBadge tf="15m" state="Weak" variant="red" />
    </div>
  </PanelCard>
);

export const MarketStructure = () => (
  <PanelCard>
    <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--textSubtle)] mb-1.5 block">Market Structure</span>
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[10px] text-[var(--textMuted)]">BTC:</span>
        <span className="font-mono text-[10px] font-semibold text-[#2bc48a]">HH/HL (Bullish)</span>
      </div>
      <span className="text-[var(--textSubtle)] text-[10px]">|</span>
      <div className="flex items-center gap-1">
        <span className="font-mono text-[10px] text-[var(--textMuted)]">ETH:</span>
        <span className="font-mono text-[10px] font-semibold text-[#F5C542]">Range</span>
      </div>
      <span className="text-[var(--textSubtle)] text-[10px]">|</span>
      <div className="flex items-center gap-1">
        <span className="font-mono text-[10px] text-[var(--textMuted)]">SOL:</span>
        <span className="font-mono text-[10px] font-semibold text-[#2bc48a]">Expansion</span>
      </div>
    </div>
  </PanelCard>
);

export const AutoModeSwitch = () => {
  const [mode, setMode] = useState<"aggressive" | "cautious" | "defensive">("aggressive");

  const modes = [
    { key: "aggressive" as const, label: "AGGRESSIVE", sub: "Trend strong, full size", variant: "green" as const },
    { key: "cautious" as const, label: "CAUTIOUS", sub: "Mixed signals, reduce size", variant: "yellow" as const },
    { key: "defensive" as const, label: "DEFENSIVE", sub: "Risk high, hedge/cash", variant: "red" as const },
  ];

  return (
    <PanelCard>
      <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--textSubtle)] mb-1.5 block">Auto Mode Switch</span>
      <div className="flex gap-1.5">
        {modes.map((m) => {
          const active = mode === m.key;
          const ring = m.variant === "green" ? "#2bc48a" : m.variant === "yellow" ? "#F5C542" : "#f6465d";
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-left transition-all ${
                active
                  ? `border-[${ring}]/40 bg-[${ring}]/10`
                  : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
              }`}
              style={active ? { borderColor: `${ring}66`, background: `${ring}1a` } : undefined}
            >
              <span className="block text-[10px] font-bold" style={{ color: active ? ring : "var(--textMuted)" }}>
                {m.label}
              </span>
              <span className="block text-[8px] text-[var(--textSubtle)] leading-tight mt-0.5">{m.sub}</span>
            </button>
          );
        })}
      </div>
    </PanelCard>
  );
};
