import type { FlowModeSettingsConfig, ScoringMode } from "../types";

export type FlowModeSettings = FlowModeSettingsConfig;

interface Props {
  scoringMode: ScoringMode;
  settings: FlowModeSettings;
  onChange: (next: FlowModeSettings) => void;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const FlowModeSettingsPanel = ({ scoringMode, settings, onChange }: Props) => {
  const isFlowActive = scoringMode === "FLOW";

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
    </section>
  );
};
