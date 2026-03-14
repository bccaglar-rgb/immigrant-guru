import { useEffect, useRef, useState } from "react";
import type { AiPanelData, DashboardSnapshot, DataHealthState, ScoringMode, TradeIdea } from "../types";
import { SCORING_MODE_OPTIONS, scoringModeDescription, scoringModeLabel } from "../data/scoringEngine";

interface Props {
  data: AiPanelData;
  dataHealth: DataHealthState;
  advanced: boolean;
  configSnapshot: string;
  featuredPlan: TradeIdea | null;
  snapshotForExport: DashboardSnapshot & { configSnapshot: string };
  onScoringModeChange?: (mode: ScoringMode) => void;
  scoringModeLoading?: boolean;
  consensusThresholds?: {
    activeMin: number;
    strongMin: number;
    eliteMin: number;
  };
}

const stateTone = (value: string): string => {
  if (["VALID", "PASS", "LONG", "LOW", "ACCUMULATION", "TREND_CONTINUATION", "ACT"].includes(value)) return "border-[#6f765f] bg-[#1f251b] text-[#d8decf]";
  if (["WEAK", "WATCH", "MED", "LIQUIDITY_HUNT", "PREPARE", "MODERATE"].includes(value)) return "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]";
  if (["NO-TRADE", "BLOCK", "SHORT", "HIGH", "NONE", "DISTRIBUTION", "WAIT"].includes(value)) return "border-[#704844] bg-[#271a19] text-[#d6b3af]";
  return "border-white/15 bg-[#1A1B1F] text-[#BFC2C7]";
};

const p = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
const f2 = (v: number) => Number(v).toFixed(2);
const engineMetric = (dataComplete: boolean, value: number, suffix = "") => (dataComplete ? `${f2(value)}${suffix}` : "N/A");
const engineBars = (dataComplete: boolean, value: number) => (dataComplete ? `${Math.round(value)} bars` : "N/A");
const consensusPct = (value: number) => `${Number(value).toFixed(2)}%`;

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // noop
  }
};

const modeTone = (mode: AiPanelData["scoringMode"]) => {
  if (mode === "FLOW") return "border-[#3d5f8f] bg-[#132033] text-[#b8d3ff]";
  if (mode === "AGGRESSIVE") return "border-[#6b4fa8] bg-[#241a3c] text-[#dbcdfd]";
  if (mode === "CAPITAL_GUARD") return "border-[#4f6f5b] bg-[#19271f] text-[#c6e9d5]";
  return "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]";
};

const consensusStyle = (
  value: number,
  thresholds: { activeMin: number; strongMin: number; eliteMin: number },
) => {
  if (value >= thresholds.eliteMin) {
    return {
      box: "border-[#6f765f] bg-[linear-gradient(180deg,rgba(36,44,31,0.95),rgba(20,24,20,0.95))] shadow-[0_0_0_1px_rgba(111,118,95,0.25),0_0_22px_rgba(111,118,95,0.22)]",
      value: "text-[#d8decf]",
      band: "text-[#b9c2ae]",
      tier: `ELITE ${thresholds.eliteMin}-100`,
    };
  }
  if (value >= thresholds.strongMin) {
    return {
      box: "border-[#7a6840] bg-[linear-gradient(180deg,rgba(42,36,24,0.96),rgba(22,19,14,0.96))] shadow-[0_0_0_1px_rgba(122,104,64,0.25),0_0_18px_rgba(122,104,64,0.2)]",
      value: "text-[#f3d27b]",
      band: "text-[#d8c39a]",
      tier: `STRONG ${thresholds.strongMin}-${Math.max(thresholds.eliteMin - 1, thresholds.strongMin)}`,
    };
  }
  if (value >= thresholds.activeMin) {
    return {
      box: "border-[#6a5a37] bg-[linear-gradient(180deg,rgba(33,28,20,0.95),rgba(18,16,13,0.95))] shadow-[0_0_0_1px_rgba(106,90,55,0.2),0_0_14px_rgba(106,90,55,0.15)]",
      value: "text-[#e9cb79]",
      band: "text-[#c9b48a]",
      tier: `ACTIVE ${thresholds.activeMin}-${Math.max(thresholds.strongMin - 1, thresholds.activeMin)}`,
    };
  }
  return {
    box: "border-white/10 bg-[#0F1012]",
    value: "text-[#F5C542]",
    band: "text-[#BFC2C7]",
    tier: `BASE <${thresholds.activeMin}`,
  };
};

export const AiPanel = ({
  data,
  dataHealth: _dataHealth,
  advanced: _advanced,
  configSnapshot,
  featuredPlan,
  snapshotForExport,
  onScoringModeChange,
  scoringModeLoading = false,
  consensusThresholds = { activeMin: 70, strongMin: 80, eliteMin: 90 },
}: Props) => {
  const [consensusInfoOpen, setConsensusInfoOpen] = useState(false);
  const consensusInfoRef = useRef<HTMLDivElement | null>(null);
  const triggers = data.unmetTriggers ?? data.triggerConditions;
  const engine = data.consensusEngine;

  const planCopy = featuredPlan
    ? `Plan ${featuredPlan.coin}/${featuredPlan.quote} ${featuredPlan.timeframe}\nEntry: ${p(featuredPlan.entryLow)}-${p(featuredPlan.entryHigh)}\nStops: ${featuredPlan.stops.map((s) => p(s.price)).join(" / ")}\nTargets: ${featuredPlan.targets.map((t) => p(t.price)).join(" / ")}\nConfidence: ${featuredPlan.confidence.toFixed(2)}`
    : "No featured plan";

  const triggerCopy = triggers.length ? triggers.map((t) => `- ${t}`).join("\n") : "No unmet triggers";
  const consensusUi = consensusStyle(data.signalConsensus, consensusThresholds);

  const downloadSnapshot = () => {
    const blob = new Blob([JSON.stringify(snapshotForExport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-snapshot-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!consensusInfoRef.current) return;
      if (!consensusInfoRef.current.contains(event.target as Node)) setConsensusInfoOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConsensusInfoOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <aside className="h-full rounded-2xl border border-white/10 bg-[#121316] p-4 shadow-[0_20px_48px_rgba(0,0,0,0.35)]">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Playbook</p>
          <p className="text-lg font-semibold text-[#F5C542]">{data.playbook}</p>
          <p className="mt-1 text-[10px] text-[#6B6F76]">Config: {configSnapshot}</p>
        </div>
        <div className="min-w-[168px] text-left">
          <div className={`min-w-[168px] rounded-xl border px-4 py-3 text-center ${consensusUi.box}`}>
            <div className="mb-0.5 flex items-center justify-center gap-1">
              <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Consensus</p>
              <div ref={consensusInfoRef} className="relative">
                <button
                  type="button"
                  onClick={() => setConsensusInfoOpen((prev) => !prev)}
                  className="grid h-4 w-4 place-items-center rounded-full text-[10px] text-[#8e95a3] transition hover:text-[#c7cdd8] hover:shadow-[0_0_8px_rgba(245,197,66,0.14)]"
                  aria-label="Consensus info"
                >
                  i
                </button>
                {consensusInfoOpen ? (
                  <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-52 rounded-lg border border-white/10 bg-[#101216] p-2 text-left text-[11px] text-[#BFC2C7] shadow-[0_16px_36px_rgba(0,0,0,0.45)]">
                    Consensus is computed only from enabled Consensus Inputs. OFF inputs are excluded from the score.
                  </div>
                ) : null}
              </div>
            </div>
            <p className={`text-xl font-semibold leading-none ${consensusUi.value}`}>{consensusPct(data.signalConsensus)}</p>
            <div className="mt-1 flex items-center justify-center gap-1">
              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${modeTone(data.scoringMode)}`}>
                {scoringModeLabel(data.scoringMode)}
              </span>
            </div>
            <p className="mt-1 text-[10px] font-semibold tracking-wide text-[#8A8F98]">{consensusUi.tier}</p>
          </div>
          <p className="mt-1 text-[10px] text-[#6B6F76]">
            Signal Freshness · Updated {data.freshness.updatedSecAgo}s ago · Valid ~{data.freshness.validForBars} bars
          </p>
        </div>
      </div>

      {data.confidenceCapped ? (
        <div className="mb-3 rounded-lg border border-[#7a6840] bg-[#2a2418] px-2 py-1 text-xs text-[#e7d9b3]">
          Confidence capped due to data health
        </div>
      ) : null}

      <div className="mb-3 rounded-lg border border-white/10 bg-[#0F1012] p-2 text-xs text-[#BFC2C7]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Consensus Engine</p>
          <div className="inline-flex items-center gap-1">
            <span className="text-[10px] text-[#8A8F98]">Mode:</span>
            <div className="inline-flex items-center rounded-lg border border-white/10 bg-[#0E1014] p-0.5">
              {SCORING_MODE_OPTIONS.map((modeOption) => {
                const active = data.scoringMode === modeOption.id;
                const selectable = modeOption.userSelectable;
                return (
                  <button
                    type="button"
                    key={modeOption.id}
                    disabled={scoringModeLoading || !onScoringModeChange || !selectable}
                    title={selectable ? modeOption.description : `${modeOption.label} is system controlled`}
                    onClick={() => onScoringModeChange?.(modeOption.id)}
                    className={`rounded-md px-2 py-1 text-[10px] font-semibold transition disabled:opacity-60 ${
                      active
                        ? "bg-[#2a2418] text-[#f3d27b] shadow-[inset_0_0_0_1px_rgba(245,197,66,0.35)]"
                        : "text-[#9da3ae] hover:text-[#d1d6de]"
                    }`}
                  >
                    {scoringModeLabel(modeOption.id)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Edge (E_net)</p>
            <p className="text-sm text-white">{engineMetric(engine.dataComplete, engine.edgeNetR, "R")}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Fill (P_fill)</p>
            <p className="text-sm text-white">{engineMetric(engine.dataComplete, engine.pFill)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Capacity (C)</p>
            <p className="text-sm text-white">{engineMetric(engine.dataComplete, engine.capacityFactor)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Risk Adj (R_adj)</p>
            <p className="text-sm text-white">{engineMetric(engine.dataComplete, engine.riskAdjustment)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">pWin</p>
            <p className="text-sm text-white">{engineMetric(engine.dataComplete, engine.pWin)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Stop Prob (P_stop)</p>
            <p className="text-sm text-white">{engineMetric(engine.dataComplete, engine.pStop)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Avg Win (R)</p>
            <p className="text-sm text-white">{engineMetric(engine.dataComplete, engine.avgWinR)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Expected RR</p>
            <p className="text-sm text-white">{engineMetric(engine.dataComplete, engine.expectedRR)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Cost (R)</p>
            <p className="text-sm text-white">{engineMetric(engine.dataComplete, engine.costR)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Risk-Adj Edge</p>
            <p className="text-sm text-white">{engineMetric(engine.dataComplete, engine.riskAdjustedEdgeR, "R")}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Expected Hold</p>
            <p className="text-sm text-white">{engineBars(engine.dataComplete, engine.expectedHoldingBars)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Input Modifier</p>
            <p className="text-sm text-white">{engineMetric(engine.dataComplete, engine.inputModifier)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Raw Consensus</p>
            <p className="text-sm text-white">{f2(engine.rawConsensus)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Adjusted</p>
            <p className="text-sm text-white">{f2(engine.adjustedConsensus)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Penalized</p>
            <p className="text-sm text-white">{f2(engine.penalizedConsensus)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Final (Display)</p>
            <p className="text-sm text-white">{consensusPct(data.signalConsensus)}</p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
              Penalty {engine.penaltyModel === "MULTIPLY" ? "(Rate)" : "(Points)"}
            </p>
            <p className="text-sm text-white">
              {engine.penaltyModel === "MULTIPLY" ? `${engine.penaltyTotal}%` : engine.penaltyTotal}
            </p>
          </div>
          <div className="rounded border border-white/10 bg-[#111316] p-2 flex min-h-[76px] flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">Penalty Impact</p>
            <p className="text-sm text-white">{f2(engine.penaltyApplied)}</p>
          </div>
        </div>
        <p className="mt-2 rounded border border-white/10 bg-[#111316] px-2 py-1 text-[11px] text-[#BFC2C7]">{engine.formulaLine}</p>
        <p className="mt-1 text-[11px] text-[#6B6F76]">Preview: {scoringModeDescription(data.scoringMode)}</p>
        <p className="mt-2 text-[11px] text-[#6B6F76]">
          Gates: trade {engine.hardGates.tradeValidity ? "PASS" : "BLOCK"} · data {engine.hardGates.dataHealth ? "PASS" : "BLOCK"} · risk {engine.hardGates.riskGate ? "PASS" : "BLOCK"} · entry {engine.hardGates.entryWindow ? "PASS" : "BLOCK"} · fill {engine.hardGates.fillProb ? "PASS" : "BLOCK"} · edge {engine.hardGates.edge ? "PASS" : "BLOCK"} · capacity {engine.hardGates.capacity ? "PASS" : "BLOCK"}
        </p>
        {data.gatingFlags.length ? (
          <p className="mt-1 text-[11px] text-[#6B6F76]">Gating Flags: {data.gatingFlags.join(", ")}</p>
        ) : null}
      </div>

      <div className="mb-3 flex items-center gap-1">
        <button type="button" onClick={() => void copyText(planCopy)} className="rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-[10px] text-[#BFC2C7] hover:bg-[#17191d]">Copy Plan</button>
        <button type="button" onClick={() => void copyText(triggerCopy)} className="rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-[10px] text-[#BFC2C7] hover:bg-[#17191d]">Copy Triggers</button>
        <button type="button" onClick={downloadSnapshot} className="rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-[10px] text-[#BFC2C7] hover:bg-[#17191d]">Export Snapshot</button>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2">
        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Trade Validity</p>
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${stateTone(data.tradeValidity)}`}>{data.tradeValidity}</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Bias</p>
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${stateTone(data.bias)}`}>{data.bias}</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Intent</p>
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${stateTone(data.marketIntent)}`}>{data.marketIntent}</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Urgency</p>
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${stateTone(data.executionUrgency)}`}>{data.executionUrgency}</span>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-[#6B6F76]">Crowding Risk</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${stateTone(data.crowdingRisk)}`}>{data.crowdingRisk}</span>
      </div>

      <div className="mb-3 space-y-1.5 rounded-lg border border-white/10 bg-[#0F1012] p-2 text-xs text-[#BFC2C7]">
        <p>{data.timeContextSummary}</p>
        <p>{data.riskEnvironmentSummary}</p>
        <p>{data.executionCertaintySummary}</p>
        <p>{data.portfolioContextSummary}</p>
        <p>Price vs Levels: {data.priceLocation}</p>
        <p>Expected Move Range: {data.expectedMove}</p>
        <p>Recent Regime Path: {data.recentRegimePath.join(" -> ")}</p>
        <p>Model Agreement: {data.modelAgreement.aligned}/{data.modelAgreement.totalModels} aligned {data.modelAgreement.direction}, {data.modelAgreement.neutral} neutral, {data.modelAgreement.opposite} opposite, {data.modelAgreement.unknown} unknown</p>
      </div>

      {data.tradeValidity !== "VALID" ? (
        <div className="mb-3 rounded-lg border border-white/10 bg-[#0F1012] p-2 text-xs text-[#BFC2C7]">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Triggers to Activate Trade</p>
          {(triggers.length ? triggers : ["No unmet triggers"]).slice(0, 3).map((condition) => (
            <p key={condition}>- {condition}</p>
          ))}
        </div>
      ) : null}

      <details className="mb-3 rounded-lg border border-white/10 bg-[#0F1012] p-2 text-xs text-[#BFC2C7]">
        <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-[#6B6F76]">Why this?</summary>
        <div className="mt-2 space-y-1">
          {data.explainability.map((line) => (
            <p key={line}>- {line}</p>
          ))}
        </div>
      </details>

    </aside>
  );
};
