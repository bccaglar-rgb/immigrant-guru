import { useState } from "react";
import type { FlowModeSettingsConfig, FlowScoringTuningConfig, ScoringMode } from "../types";
import { DEFAULT_FLOW_SCORING_TUNING, FLOW_SCORING_TUNING_BOUNDS } from "../data/scoringEngine";

export type FlowModeSettings = FlowModeSettingsConfig;

interface Props {
  scoringMode: ScoringMode;
  settings: FlowModeSettings;
  onChange: (next: FlowModeSettings) => void;
  onResetAll?: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type TuningSectionKey = "scoreTuning" | "executionPenalties" | "riskPenalties" | "gatingData";

const TUNING_SECTIONS: {
  key: TuningSectionKey;
  label: string;
  fields: (keyof FlowScoringTuningConfig)[];
}[] = [
  {
    key: "scoreTuning",
    label: "Score Tuning",
    fields: ["modeBias", "compressKnee", "compressScale"],
  },
  {
    key: "executionPenalties",
    label: "Execution Penalties",
    fields: ["fillShortfallCoeff", "slippageSeverityCoeff", "microSeverityCoeff", "executionMultiplierFloor"],
  },
  {
    key: "riskPenalties",
    label: "Risk Penalties",
    fields: ["stressFailureCoeff", "cascadeFailureCoeff", "crowdingFailureCoeff", "riskMultiplierFloor"],
  },
  {
    key: "gatingData",
    label: "Gating & Data",
    fields: ["fillHardBlockThreshold", "fillGateThreshold", "hardBlockScoreCap", "degradedFeedPenalty", "dataMultiplierFloor"],
  },
];

const TuningSlider = ({
  field,
  value,
  onChangeValue,
}: {
  field: keyof FlowScoringTuningConfig;
  value: number;
  onChangeValue: (field: keyof FlowScoringTuningConfig, value: number) => void;
}) => {
  const bounds = FLOW_SCORING_TUNING_BOUNDS[field];
  const isDefault = value === DEFAULT_FLOW_SCORING_TUNING[field];
  const displayValue = bounds.step < 1 ? value.toFixed(2) : String(value);

  return (
    <div className="rounded-lg border border-white/8 bg-[#0F1012] px-3 py-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[#9BA1AE]">{bounds.label}</p>
        <p className={`text-xs font-semibold tabular-nums ${isDefault ? "text-[#9BA1AE]" : "text-[#F5C542]"}`}>
          {displayValue}{bounds.unit ? ` ${bounds.unit}` : ""}
        </p>
      </div>
      <input
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={value}
        onChange={(e) => onChangeValue(field, Number(e.target.value))}
        className="mt-1 w-full accent-[#F5C542]"
      />
      <div className="mt-0.5 flex justify-between text-[9px] text-[#555]">
        <span>{bounds.min}</span>
        <span>{bounds.max}</span>
      </div>
    </div>
  );
};

export const FlowModeSettingsPanel = ({ scoringMode, settings, onChange, onResetAll }: Props) => {
  const isFlowActive = scoringMode === "FLOW";
  const [openSections, setOpenSections] = useState<Record<TuningSectionKey, boolean>>({
    scoreTuning: false,
    executionPenalties: false,
    riskPenalties: false,
    gatingData: false,
  });

  const toggleSection = (key: TuningSectionKey) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const tuning = settings.flowScoringTuning ?? DEFAULT_FLOW_SCORING_TUNING;

  const handleTuningChange = (field: keyof FlowScoringTuningConfig, value: number) => {
    const bounds = FLOW_SCORING_TUNING_BOUNDS[field];
    onChange({
      ...settings,
      flowScoringTuning: {
        ...tuning,
        [field]: clamp(value, bounds.min, bounds.max),
      },
    });
  };

  const resetSection = (fields: (keyof FlowScoringTuningConfig)[]) => {
    const resetTuning = { ...tuning };
    for (const f of fields) {
      resetTuning[f] = DEFAULT_FLOW_SCORING_TUNING[f];
    }
    onChange({ ...settings, flowScoringTuning: resetTuning });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Flow Mode Settings</h3>
          <p className="text-xs text-[#6B6F76]">
            Flow Mode governs how dashboard trade ideas are generated, validated, and approved.
            Customize consensus strength, execution tolerance, and risk filters to align with your trading style.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onResetAll && (
            <button
              type="button"
              onClick={onResetAll}
              title="Reset all settings to defaults"
              className="flex items-center gap-1 rounded-full border border-white/10 bg-[#171a1f] px-2 py-1 text-[10px] font-semibold text-[#9BA1AE] transition hover:border-[#F5C542]/40 hover:text-[#F5C542]"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset All
            </button>
          )}
          <span
            className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
              isFlowActive
                ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]"
                : "border-white/15 bg-[#171a1f] text-[#b5bbc6]"
            }`}
          >
            {isFlowActive ? "Flow Active" : "Flow Inactive"}
          </span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
          <p className="text-[11px] uppercase tracking-wider text-[#6B6F76]">Min Consensus</p>
          <p className="mt-1 text-lg font-semibold text-[#F5C542]">{settings.minConsensus}%</p>
          <input
            type="range"
            min={20}
            max={95}
            step={1}
            value={settings.minConsensus}
            onChange={(event) =>
              onChange({
                ...settings,
                minConsensus: clamp(Number(event.target.value), 20, 95),
              })
            }
            className="mt-2 w-full accent-[#F5C542]"
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
          <p className="text-[11px] uppercase tracking-wider text-[#6B6F76]">Min Valid Bars</p>
          <p className="mt-1 text-lg font-semibold text-white">{settings.minValidBars} bars</p>
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={settings.minValidBars}
            onChange={(event) =>
              onChange({
                ...settings,
                minValidBars: clamp(Number(event.target.value), 1, 12),
              })
            }
            className="mt-2 w-full accent-[#F5C542]"
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
          <p className="text-[11px] uppercase tracking-wider text-[#6B6F76]">Trade Validity Filter</p>
          <button
            type="button"
            onClick={() =>
              onChange({
                ...settings,
                requireValidTrade: !settings.requireValidTrade,
              })
            }
            className={`mt-2 inline-flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              settings.requireValidTrade
                ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]"
                : "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]"
            }`}
          >
            <span>{settings.requireValidTrade ? "Require VALID" : "Allow WEAK"}</span>
            <span>{settings.requireValidTrade ? "ON" : "OFF"}</span>
          </button>
          <p className="mt-2 text-[11px] text-[#7f8691]">
            NO-TRADE is always blocked.
          </p>
        </div>
      </div>

      {/* Conflict Detection Filters */}
      <div className="mt-3 rounded-xl border border-white/10 bg-[#0F1012] p-3">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-[#6B6F76]">Conflict Detection</p>
        <p className="mb-2 text-[10px] text-[#555]">
          When enabled, opposing signals trigger NO-TRADE and cap score at 48.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {([
            { key: "conflictTrend" as const, label: "Trend Direction" },
            { key: "conflictBuySell" as const, label: "Buy/Sell Imbalance" },
            { key: "conflictOrderbook" as const, label: "Orderbook Imbalance" },
          ]).map(({ key, label }) => {
            const enabled = settings.dataFilters[key] !== false;
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onChange({
                    ...settings,
                    dataFilters: { ...settings.dataFilters, [key]: !enabled },
                  })
                }
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  enabled
                    ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]"
                    : "border-white/10 bg-[#171a1f] text-[#6B6F76]"
                }`}
              >
                <span>{label}</span>
                <span className="text-[10px]">{enabled ? "ON" : "OFF"}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scoring Tuning Sections */}
      <div className="mt-4 space-y-2">
        {TUNING_SECTIONS.map((section) => {
          const isOpen = openSections[section.key];
          const hasCustom = section.fields.some((f) => tuning[f] !== DEFAULT_FLOW_SCORING_TUNING[f]);

          return (
            <div key={section.key} className="rounded-xl border border-white/8 bg-[#0E0F11]">
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${isOpen ? "text-white" : "text-[#9BA1AE]"}`}>
                    {section.label}
                  </span>
                  {hasCustom && (
                    <span className="rounded-full bg-[#F5C542]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#F5C542]">
                      Custom
                    </span>
                  )}
                </div>
                <svg
                  className={`h-3.5 w-3.5 text-[#6B6F76] transition-transform ${isOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <div className="border-t border-white/6 px-3 pb-3 pt-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {section.fields.map((field) => (
                      <TuningSlider
                        key={field}
                        field={field}
                        value={tuning[field]}
                        onChangeValue={handleTuningChange}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => resetSection(section.fields)}
                    className="mt-2 text-[10px] font-medium text-[#6B6F76] transition hover:text-[#F5C542]"
                  >
                    Reset Defaults
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
