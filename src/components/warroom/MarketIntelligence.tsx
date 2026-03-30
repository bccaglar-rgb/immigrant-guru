import { LWChart, type OHLCVData } from "../shared/LWChart";

interface Props {
  btcData: OHLCVData[];
  intel: {
    btcTrend: string; btcDominance: string; crossAssetPressure: string; regime: string;
    aiNarrative: string; riskOnOff: string; liquidity: string; macroTone: string;
  };
}

export const MarketIntelligence = ({ btcData, intel }: Props) => {
  const latest = btcData[btcData.length - 1];
  const prev = btcData[btcData.length - 2];
  const pct = prev ? ((latest.close - prev.close) / prev.close) * 100 : 0;
  const isUp = pct >= 0;

  const riskColor = intel.riskOnOff === "Risk-On" ? "#2bc48a" : "#f6465d";
  const trendColor = intel.btcTrend === "Bullish" ? "#2bc48a" : intel.btcTrend === "Bearish" ? "#f6465d" : "#F5C542";

  return (
    <div className="flex flex-col gap-2 h-full overflow-y-auto">
      {/* BTC Mini Chart */}
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[var(--text)]">BTC/USDT</span>
            <span className="rounded border border-white/10 bg-white/[0.04] px-1 py-px font-mono text-[9px] text-[var(--textMuted)]">1m</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-[10px] font-bold ${isUp ? "text-[#2bc48a]" : "text-[#f6465d]"}`}>${latest?.close.toLocaleString()}</span>
            <span className={`rounded-full px-1 py-px font-mono text-[9px] font-bold ${isUp ? "bg-[#2bc48a]/10 text-[#2bc48a]" : "bg-[#f6465d]/10 text-[#f6465d]"}`}>
              {isUp ? "+" : ""}{pct.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="h-24">
          <LWChart data={btcData} compact showVolume={false} showIndicators={false} />
        </div>
      </div>

      {/* Intelligence Feed */}
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#FF9F43]" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          <span className="text-[10px] font-bold tracking-wider text-[#FF9F43] uppercase">Market Intelligence</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <IntelRow label="BTC Trend" value={intel.btcTrend} color={trendColor} />
          <IntelRow label="Risk Mode" value={intel.riskOnOff} color={riskColor} />
          <IntelRow label="Dominance" value={intel.btcDominance} />
          <IntelRow label="Regime" value={intel.regime.split("\u2014")[0].trim()} />
        </div>

        <IntelBlock label="Cross-Asset" text={intel.crossAssetPressure} />
        <IntelBlock label="Liquidity" text={intel.liquidity} />
        <IntelBlock label="Macro Tone" text={intel.macroTone} />

        {/* AI Narrative */}
        <div className="rounded-lg border border-[#F5C542]/10 bg-[#F5C542]/[0.03] px-2.5 py-2">
          <span className="text-[9px] font-bold text-[#F5C542] uppercase tracking-wider">AI Narrative</span>
          <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--textMuted)]">{intel.aiNarrative}</p>
        </div>
      </div>
    </div>
  );
};

const IntelRow = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="rounded-lg bg-black/20 px-2 py-1">
    <div className="text-[9px] text-[var(--textSubtle)]">{label}</div>
    <div className="text-[9px] font-bold" style={{ color: color ?? "var(--text)" }}>{value}</div>
  </div>
);

const IntelBlock = ({ label, text }: { label: string; text: string }) => (
  <div className="rounded-lg bg-black/20 px-2 py-1.5">
    <span className="text-[9px] font-bold text-[var(--textSubtle)] uppercase">{label}</span>
    <p className="mt-0.5 text-[9px] text-[var(--textMuted)]">{text}</p>
  </div>
);
