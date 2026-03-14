import type { ReactNode } from "react";
import type { ConsensusInputConfig, ConsensusInputKey } from "../types";

interface Props {
  consensusInputs: ConsensusInputConfig;
  consensusInputStates?: Array<{
    key: ConsensusInputKey;
    value: string;
    confidence?: number;
  }>;
  onConsensusInputChange: (key: ConsensusInputKey, value: boolean) => void;
  onConsensusInputsBulk: (value: boolean) => void;
  hasConfiguredSettings?: boolean;
  onOpenSettings?: () => void;
  children?: ReactNode;
}

type ControlKind = "HARD_GATE" | "SOFT_MODIFIER";

type ConsensusControl = { key: ConsensusInputKey; label: string; kind: ControlKind };

const controlGroups: Array<{ title: string; subtitle: string; items: ConsensusControl[] }> = [
  {
    title: "Execution & Trade Filters",
    subtitle: "Decision filters for authorization and trade flow.",
    items: [
      { key: "tradeValidity", label: "Trade Validity", kind: "HARD_GATE" },
      { key: "bias", label: "Bias", kind: "SOFT_MODIFIER" },
      { key: "intent", label: "Intent", kind: "SOFT_MODIFIER" },
      { key: "urgency", label: "Urgency", kind: "SOFT_MODIFIER" },
      { key: "slippage", label: "Slippage", kind: "SOFT_MODIFIER" },
    ],
  },
  {
    title: "Risk & Alignment Controls",
    subtitle: "Risk gates and alignment checks for consensus stability.",
    items: [
      { key: "entryTiming", label: "Entry Timing", kind: "HARD_GATE" },
      { key: "riskGate", label: "Risk Gate", kind: "HARD_GATE" },
      { key: "marketStress", label: "Market Stress", kind: "SOFT_MODIFIER" },
      { key: "modelAgreement", label: "Model Agreement", kind: "SOFT_MODIFIER" },
    ],
  },
];

const stateTone = (state: string): string => {
  if (["NO-TRADE", "BLOCK", "HIGH", "WIDE", "POOR", "RISK_DOMINANT", "SPOOF_RISK", "NONE", "SHORT", "CLOSED"].includes(state)) {
    return "border-[#704844] bg-[#271a19] text-[#d6b3af]";
  }
  if (["VALID", "PASS", "LOW", "GOOD", "UP", "BULL", "LONG", "REWARD_DOMINANT", "READY", "OPEN", "ACT"].includes(state)) {
    return "border-[#6f765f] bg-[#1f251b] text-[#d8decf]";
  }
  if (["WEAK", "MED", "NORMAL", "WATCH", "BALANCED", "NARROW", "BUILDING", "WAIT", "PREPARE"].includes(state)) {
    return "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]";
  }
  return "border-white/15 bg-[#1A1B1F] text-[#BFC2C7]";
};

const influenceTone = (value: "LOW" | "MED" | "HIGH" | "OFF"): string => {
  if (value === "HIGH") return "border-[#6f765f] bg-[#1f251b] text-[#d8decf]";
  if (value === "MED") return "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]";
  if (value === "LOW") return "border-[#4d5872] bg-[#182133] text-[#b7c9e8]";
  return "border-white/15 bg-[#1A1B1F] text-[#BFC2C7]";
};

const classifyInfluence = (
  input: ConsensusControl,
  state: string,
  confidence?: number,
): "LOW" | "MED" | "HIGH" => {
  const isNegativeExtreme = ["NO-TRADE", "BLOCK", "HIGH", "WIDE", "POOR", "CLOSED", "SPOOF_RISK"].includes(state);
  const isMid = ["MED", "BUILDING", "NARROW", "WATCH", "BALANCED"].includes(state);
  if (input.kind === "HARD_GATE") return "HIGH";
  if (input.key === "slippage" || input.key === "marketStress") {
    if (isNegativeExtreme) return "HIGH";
    if (isMid) return "MED";
    return "LOW";
  }
  if (typeof confidence === "number") {
    if (confidence >= 70) return "HIGH";
    if (confidence >= 40) return "MED";
  }
  return "LOW";
};

const switchTrackClass = (on: boolean) =>
  `relative inline-flex h-5 w-9 items-center rounded-full border transition ${
    on
      ? "border-[#6f765f] bg-[#1f251b]"
      : "border-white/15 bg-[#17191d]"
  }`;

const switchThumbClass = (on: boolean) =>
  `inline-block h-3.5 w-3.5 transform rounded-full transition ${
    on ? "translate-x-[18px] bg-[#d8decf]" : "translate-x-[3px] bg-[#7b7f87]"
  }`;

const buttonTone = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold transition ${
    active
      ? "border-[#F5C542]/70 bg-[#2b2417] text-[#F5C542]"
      : "border-white/15 bg-[#111215] text-[#BFC2C7] hover:bg-[#17191d]"
  }`;

export const ConsensusInputsPanel = ({
  consensusInputs,
  consensusInputStates,
  onConsensusInputChange,
  onConsensusInputsBulk,
  hasConfiguredSettings = false,
  onOpenSettings,
  children,
}: Props) => {
  const allOn = Object.values(consensusInputs).every(Boolean);
  const someOff = Object.values(consensusInputs).some((value) => !value);
  const liveStateByKey = new Map((consensusInputStates ?? []).map((item) => [item.key, item]));
  const totalControls = controlGroups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#121316] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs uppercase tracking-widest text-[#6B6F76]">Signal Panels · Consensus Controls</h4>
          <p className="text-[10px] text-[#6B6F76]">Decision filters ({totalControls}) · Hard gates + soft modifiers</p>
        </div>
        <div className="flex gap-2">
          {hasConfiguredSettings && onOpenSettings ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-full border border-[#4b586a] bg-[#121722] px-3 py-1 text-xs font-semibold text-[#c9d5e8] transition hover:bg-[#182134]"
            >
              Settings
            </button>
          ) : null}
          <button type="button" className={buttonTone(allOn)} onClick={() => onConsensusInputsBulk(true)}>
            All ON
          </button>
          <button type="button" className={buttonTone(someOff)} onClick={() => onConsensusInputsBulk(false)}>
            All OFF
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {controlGroups.map((group, panelIndex) => (
          <section key={`consensus-panel-${panelIndex + 1}`} className="rounded-2xl border border-white/10 bg-[#121316] p-3">
            <div className="mb-3">
              <h4 className="text-xs uppercase tracking-widest text-[#6B6F76]">{group.title}</h4>
              <p className="text-[10px] text-[#6B6F76]">{group.subtitle}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {group.items.map((input) => {
                const included = consensusInputs[input.key];
                const live = liveStateByKey.get(input.key);
                const value = live?.value ?? "N/A";
                const confidenceValue = typeof live?.confidence === "number" ? Math.round(live.confidence) : undefined;
                const confidence = typeof confidenceValue === "number" ? `${confidenceValue}%` : "-";
                const behavior = input.kind === "HARD_GATE" ? "Hard Gate" : "Soft Modifier";
                const influence = included ? classifyInfluence(input, value, confidenceValue) : "OFF";
                return (
                  <article
                    key={input.key}
                    className={`rounded-xl border p-3 transition ${
                      included
                        ? "border-[#6f765f]/40 bg-[linear-gradient(180deg,#131a13_0%,#0F1012_100%)]"
                        : "border-white/10 bg-[#0F1012]"
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-[#dfe3ea]">{input.label}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stateTone(value)}`}>{value}</span>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-[11px] text-[#6B6F76]">
                      <span>Confidence {confidence}</span>
                      <span>{behavior}</span>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-[11px] text-[#6B6F76]">
                      <span>Influence</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${influenceTone(influence)}`}>
                        {influence}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-pressed={included}
                      onClick={() => onConsensusInputChange(input.key, !included)}
                      className="inline-flex w-full items-center justify-between rounded-lg border border-white/10 bg-[#111316] px-2.5 py-2 text-[11px] font-semibold text-[#BFC2C7] transition hover:bg-[#171a1f]"
                    >
                      <span className={`uppercase tracking-wider ${included ? "text-[#9db18d]" : "text-[#7b7f87]"}`}>
                        {included ? "Active" : "Off"}
                      </span>
                      <span className={switchTrackClass(included)}>
                        <span className={switchThumbClass(included)} />
                      </span>
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {children ? <div className="mt-3 border-t border-white/10 pt-3">{children}</div> : null}
    </section>
  );
};
