import { useState } from "react";
import BotExchangeBar from "./BotExchangeBar";
import BotStrategyChart from "./BotStrategyChart";
import BotThinkingPanel from "./BotThinkingPanel";
import BotBacktestPanel from "./BotBacktestPanel";
import BotRiskPanel from "./BotRiskPanel";
import BotStatePanel from "./BotStatePanel";
import BotExecutionLog from "./BotExecutionLog";
import BotSignalSources from "./BotSignalSources";
import BotSetupForm from "./BotSetupForm";

/* ── Types ── */

export interface BotCondition {
  label: string;
  description?: string;
  met: boolean;
  currentValue?: string;
  targetValue?: string;
}

export interface BotPageConfig {
  name: string;
  slug: string;
  category: string;
  tier: string;
  description: string;
  strategy: string;
  riskLevel: "Low" | "Medium" | "High";
  avgWinRate: string;
  accentColor: string;

  /* Strategy */
  defaultPair?: string;
  defaultTf?: string;
  indicators?: string[];
  entryLong: string;
  entryShort: string;
  exitLogic: string;

  /* Setup defaults */
  defaultSize?: number;
  defaultRisk?: number;
  defaultLeverage?: number;
  defaultTp?: number;
  defaultSl?: number;

  /* Bot thinking conditions */
  conditions: BotCondition[];
  thinkingAction: string;
  thinkingConfidence: number;

  /* How it works */
  howItWorks: string[];
  bestFor: string[];
}

/* ── Helpers ── */

const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");

const RISK_COLORS: Record<string, string> = {
  Low: "text-[#2bc48a]",
  Medium: "text-[#F5C542]",
  High: "text-[#f6465d]",
};

/* ── Main Template ── */

export default function BotPageTemplate({ config }: { config: BotPageConfig }) {
  const [activeSection, setActiveSection] = useState<"overview" | "setup" | "logs">("overview");

  const sections = [
    { key: "overview" as const, label: "Overview" },
    { key: "setup" as const, label: "Setup & Launch" },
    { key: "logs" as const, label: "Logs & State" },
  ];

  return (
    <div className="flex h-full flex-col overflow-auto bg-[#0B0B0C] text-white">
      {/* ── EXCHANGE BAR ── */}
      <div className="shrink-0 p-4 pb-0">
        <BotExchangeBar botName={`${config.name} Engine`} accentColor={config.accentColor} />
      </div>

      {/* ── TRUST BAR ── */}
      <div className="shrink-0 px-4 pt-3">
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-white/[0.04] bg-white/[0.015] px-5 py-2.5">
          <TrustStat label="Live Performance" value="+12.4%" color="text-[#2bc48a]" />
          <TrustDivider />
          <TrustStat label="Win Rate (30d)" value="61.2%" color="text-[#2bc48a]" />
          <TrustDivider />
          <TrustStat label="Avg R:R" value="1:1.8" color="text-white" />
          <TrustDivider />
          <TrustStat label="Max Drawdown" value="-6.2%" color="text-[#f6465d]" />
          <TrustDivider />
          <TrustStat label="Trades" value="184" color="text-white/70" />
          <div className="ml-auto flex items-center gap-1.5 rounded-full border border-[#2bc48a]/20 bg-[#2bc48a]/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#2bc48a]" />
            <span className="text-[10px] font-semibold text-[#2bc48a]">Profitable</span>
          </div>
        </div>
      </div>

      {/* ── SECTION TABS ── */}
      <div className="shrink-0 px-4 pt-3">
        <div className="flex gap-1 border-b border-white/[0.06] pb-0">
          {sections.map(s => (
            <button key={s.key} onClick={() => setActiveSection(s.key)}
              className={cn(
                "rounded-t-lg px-4 py-2 text-[12px] font-semibold transition",
                activeSection === s.key
                  ? "border-b-2 text-white"
                  : "text-white/40 hover:text-white/60"
              )}
              style={activeSection === s.key ? { borderBottomColor: config.accentColor } : undefined}
            >{s.label}</button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="flex-1 overflow-auto p-4">
        {activeSection === "overview" && <OverviewSection config={config} />}
        {activeSection === "setup" && <SetupSection config={config} />}
        {activeSection === "logs" && <LogsSection config={config} />}
      </div>
    </div>
  );
}

/* ── TRUST BAR helpers ── */

const TrustStat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="text-center">
    <p className="text-[9px] uppercase tracking-wider text-white/30">{label}</p>
    <p className={cn("text-[14px] font-bold", color)}>{value}</p>
  </div>
);

const TrustDivider = () => <div className="h-6 w-px bg-white/[0.06]" />;

/* ══════════════════════════════════════════════════════════════
   OVERVIEW SECTION — Chart + Thinking + Backtest
   ══════════════════════════════════════════════════════════════ */

const OverviewSection = ({ config }: { config: BotPageConfig }) => (
  <div className="space-y-4">
    {/* ── ROW 1: Chart + Bot Thinking ── */}
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      {/* PRIMARY: Chart */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-bold text-white">Live Strategy Preview</h2>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] text-white/40">REAL-TIME</span>
        </div>
        <BotStrategyChart
          defaultPair={config.defaultPair || "BTCUSDT"}
          defaultTf={config.defaultTf || "15m"}
          indicators={config.indicators}
          accentColor={config.accentColor}
        />
      </div>

      {/* SECONDARY: Bot Thinking */}
      <BotThinkingPanel
        conditions={config.conditions}
        action={config.thinkingAction}
        confidence={config.thinkingConfidence}
        symbol={config.defaultPair || "BTCUSDT"}
        accentColor={config.accentColor}
      />
    </div>

    {/* ── ROW 2: Backtest Performance ── */}
    <BotBacktestPanel strategyName={config.name} accentColor={config.accentColor} />

    {/* ── ROW 3: Bot Info (compact) ── */}
    <div className="grid gap-4 md:grid-cols-4">
      <Stat label="Status" value="Ready" color="text-[#2bc48a]" />
      <Stat label="Risk Level" value={config.riskLevel} color={RISK_COLORS[config.riskLevel]} />
      <Stat label="Strategy" value={config.strategy} color="text-white" />
      <Stat label="Avg Win Rate" value={config.avgWinRate} color="text-[#F5C542]" />
    </div>

    {/* ── ROW 4: Strategy Logic (interactive) ── */}
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <h3 className="mb-3 text-[13px] font-bold text-white">Strategy Logic</h3>
      <div className="grid gap-4 md:grid-cols-3">
        <LogicBlock label="Long Entry" color="#2bc48a" content={config.entryLong} conditions={config.conditions.filter((_, i) => i < 3)} />
        <LogicBlock label="Short Entry" color="#f6465d" content={config.entryShort} conditions={config.conditions.filter((_, i) => i >= 3 && i < 6)} />
        <LogicBlock label="Exit Logic" color="#F5C542" content={config.exitLogic} conditions={[]} />
      </div>
      {config.indicators && config.indicators.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {config.indicators.map(ind => (
            <span key={ind} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[10px] text-white/50">{ind}</span>
          ))}
        </div>
      )}
    </div>

    {/* ── ROW 5: Signal Sources ── */}
    <BotSignalSources accentColor={config.accentColor} />
  </div>
);

/* ══════════════════════════════════════════════════════════════
   SETUP SECTION — Enhanced Setup + Risk
   ══════════════════════════════════════════════════════════════ */

const SetupSection = ({ config }: { config: BotPageConfig }) => (
  <div className="space-y-4">
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      {/* Setup Form */}
      <BotSetupForm
        botName={config.name}
        defaultPair={config.defaultPair}
        defaultTf={config.defaultTf}
        defaultSize={config.defaultSize}
        defaultRisk={config.defaultRisk}
        defaultLeverage={config.defaultLeverage}
        defaultTp={config.defaultTp}
        defaultSl={config.defaultSl}
        indicators={config.indicators}
        accentColor={config.accentColor}
      />

      {/* Risk Panel */}
      <div className="space-y-4">
        <BotRiskPanel
          riskPerTrade={config.defaultRisk}
          maxOpenTrades={3}
          leverage={config.defaultLeverage}
          accentColor={config.accentColor}
        />

        {/* How It Works */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h3 className="mb-2 text-[13px] font-bold text-white">How It Works</h3>
          <ol className="space-y-1.5">
            {config.howItWorks.map((step, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-white/60">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold" style={{ background: config.accentColor + "20", color: config.accentColor }}>{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Best Conditions */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h3 className="mb-2 text-[13px] font-bold text-white">Best Conditions</h3>
          <ul className="space-y-1">
            {config.bestFor.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-[12px] text-white/60">
                <span className="text-[#2bc48a]">&#10003;</span>{c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════
   LOGS SECTION — Bot State + Execution Log
   ══════════════════════════════════════════════════════════════ */

const LogsSection = ({ config }: { config: BotPageConfig }) => (
  <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-2">
      <BotStatePanel accentColor={config.accentColor} />
      <BotExecutionLog accentColor={config.accentColor} />
    </div>
  </div>
);

/* ── Shared sub-components ── */

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
    <p className="text-[9px] uppercase tracking-wider text-white/30">{label}</p>
    <p className={cn("mt-1 text-[13px] font-bold", color)}>{value}</p>
  </div>
);

const LogicBlock = ({ label, color, content, conditions }: { label: string; color: string; content: string; conditions: BotCondition[] }) => (
  <div>
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</p>
    <code className="block rounded-lg bg-[#0F1012] px-3 py-2.5 text-[11px] leading-relaxed text-white/60">{content}</code>
    {conditions.length > 0 && (
      <div className="mt-2 space-y-1">
        {conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[10px]">
            <span className={c.met ? "text-[#2bc48a]" : "text-[#f6465d]"}>{c.met ? "✓" : "✗"}</span>
            <span className="text-white/50">{c.label}</span>
            {c.currentValue && <span className="ml-auto font-mono text-white/30">{c.currentValue}</span>}
          </div>
        ))}
      </div>
    )}
  </div>
);
