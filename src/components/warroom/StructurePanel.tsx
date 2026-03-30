interface Level { price: number; label: string; strength: number; type: "htf" | "ltf" }
interface LiqZone { price: number; side: "buy" | "sell"; size: string }
interface Imbalance { from: number; to: number; filled: boolean }

interface Props {
  data: {
    resistances: Level[];
    supports: Level[];
    liquidityZones: LiqZone[];
    imbalanceZones: Imbalance[];
    invalidation: number;
  };
}

export const StructurePanel = ({ data }: Props) => (
  <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 space-y-2">
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#FF9F43]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3z" /><path d="M3 12h18M12 3v18" /></svg>
      <span className="text-[10px] font-bold tracking-wider text-[#FF9F43] uppercase">Structure & Levels</span>
    </div>

    {/* Resistances */}
    <div className="space-y-0.5">
      <span className="text-[9px] font-bold text-[#f6465d] uppercase">Resistance</span>
      {data.resistances.map((l, i) => <LevelRow key={i} level={l} color="#f6465d" />)}
    </div>

    {/* Supports */}
    <div className="space-y-0.5">
      <span className="text-[9px] font-bold text-[#2bc48a] uppercase">Support</span>
      {data.supports.map((l, i) => <LevelRow key={i} level={l} color="#2bc48a" />)}
    </div>

    {/* Invalidation */}
    <div className="flex items-center justify-between rounded-lg bg-[#f6465d]/[0.06] px-2.5 py-1.5">
      <span className="text-[9px] font-bold text-[#f6465d]">INVALIDATION</span>
      <span className="font-mono text-[10px] font-bold text-[#f6465d]">${data.invalidation.toFixed(2)}</span>
    </div>

    {/* Liquidity */}
    <div className="space-y-0.5">
      <span className="text-[9px] font-bold text-[#5B8DEF] uppercase">Liquidity Zones</span>
      {data.liquidityZones.map((z, i) => (
        <div key={i} className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${z.side === "buy" ? "bg-[#2bc48a]" : "bg-[#f6465d]"}`} />
            <span className="font-mono text-[9px] text-[var(--text)]">${z.price.toFixed(2)}</span>
          </div>
          <span className="text-[9px] text-[var(--textSubtle)]">{z.side.toUpperCase()} · {z.size}</span>
        </div>
      ))}
    </div>

    {/* Imbalance */}
    <div className="space-y-0.5">
      <span className="text-[9px] font-bold text-[var(--textSubtle)] uppercase">Imbalance Zones</span>
      {data.imbalanceZones.map((z, i) => (
        <div key={i} className="flex items-center justify-between py-0.5">
          <span className="font-mono text-[9px] text-[var(--textMuted)]">${z.from.toFixed(2)} — ${z.to.toFixed(2)}</span>
          <span className={`text-[9px] font-bold ${z.filled ? "text-[var(--textSubtle)]" : "text-[#F5C542]"}`}>{z.filled ? "Filled" : "Open"}</span>
        </div>
      ))}
    </div>
  </div>
);

const LevelRow = ({ level, color }: { level: Level; color: string }) => (
  <div className="flex items-center justify-between py-0.5">
    <div className="flex items-center gap-1.5">
      <span className="rounded px-1 py-px text-[9px] font-bold" style={{ color, background: `${color}15` }}>{level.type.toUpperCase()}</span>
      <span className="font-mono text-[9px] text-[var(--text)]">${level.price.toFixed(2)}</span>
    </div>
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-[var(--textSubtle)]">{level.label}</span>
      <div className="h-1 w-8 rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${level.strength}%`, background: color }} />
      </div>
    </div>
  </div>
);
