import { useMemo, useState } from "react";
import { INDICATOR_GROUPS, INDICATOR_LABELS } from "../hooks/useIndicatorsStore";
import type { IndicatorGroupKey, IndicatorKey, IndicatorsState } from "../types";

type SettingValue = number | string | boolean | string[];

interface Props {
  state: IndicatorsState;
  enabledCount: number;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  setMaster: (enabled: boolean) => void;
  setGroup: (group: IndicatorGroupKey, enabled: boolean) => void;
  setIndicatorEnabled: (indicator: IndicatorKey, enabled: boolean) => void;
  setIndicatorSetting: (indicator: IndicatorKey, key: string, value: SettingValue) => void;
  resetIndicator: (indicator: IndicatorKey) => void;
}

interface FieldDefinition {
  key: string;
  type: "number" | "select" | "boolean" | "multi-select";
  label: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

const indicatorFields: Partial<Record<IndicatorKey, FieldDefinition[]>> = {
  ema: [
    { key: "periods", type: "multi-select", label: "Periods", options: ["9", "20", "50", "100", "200"] },
    { key: "source", type: "select", label: "Source", options: ["close", "hlc3"] },
    { key: "showOnChart", type: "boolean", label: "Show on chart" },
  ],
  vwap: [
    { key: "mode", type: "select", label: "Mode", options: ["session", "anchored"] },
    { key: "showOnChart", type: "boolean", label: "Show on chart" },
  ],
  rsi: [
    { key: "length", type: "number", label: "Length", min: 2, max: 100, step: 1 },
    { key: "overbought", type: "number", label: "Overbought", min: 50, max: 95, step: 1 },
    { key: "oversold", type: "number", label: "Oversold", min: 5, max: 50, step: 1 },
    { key: "showPanel", type: "boolean", label: "Show panel" },
  ],
  macd: [
    { key: "fast", type: "number", label: "Fast", min: 2, max: 50, step: 1 },
    { key: "slow", type: "number", label: "Slow", min: 5, max: 100, step: 1 },
    { key: "signal", type: "number", label: "Signal", min: 2, max: 40, step: 1 },
    { key: "showPanel", type: "boolean", label: "Show panel" },
  ],
  adx: [
    { key: "length", type: "number", label: "Length", min: 2, max: 100, step: 1 },
    { key: "thresholdStrong", type: "number", label: "Strong threshold", min: 10, max: 50, step: 1 },
    { key: "showPanel", type: "boolean", label: "Show panel" },
  ],
  bbands: [
    { key: "length", type: "number", label: "Length", min: 2, max: 100, step: 1 },
    { key: "stdev", type: "number", label: "StdDev", min: 0.5, max: 4, step: 0.1 },
    { key: "showOnChart", type: "boolean", label: "Show on chart" },
  ],
  atr: [
    { key: "length", type: "number", label: "Length", min: 2, max: 100, step: 1 },
    { key: "showAs", type: "select", label: "Show as", options: ["line", "bands"] },
    { key: "showOnChart", type: "boolean", label: "Show on chart" },
  ],
  stochRsi: [
    { key: "length", type: "number", label: "Length", min: 2, max: 100, step: 1 },
    { key: "smoothK", type: "number", label: "Smooth K", min: 1, max: 20, step: 1 },
    { key: "smoothD", type: "number", label: "Smooth D", min: 1, max: 20, step: 1 },
  ],
  ichimoku: [
    { key: "conversion", type: "number", label: "Conversion", min: 2, max: 40, step: 1 },
    { key: "base", type: "number", label: "Base", min: 2, max: 80, step: 1 },
    { key: "spanB", type: "number", label: "Span B", min: 2, max: 120, step: 1 },
  ],
  supertrend: [
    { key: "atrLength", type: "number", label: "ATR length", min: 2, max: 40, step: 1 },
    { key: "multiplier", type: "number", label: "Multiplier", min: 0.5, max: 10, step: 0.1 },
  ],
  keltner: [
    { key: "length", type: "number", label: "Length", min: 2, max: 100, step: 1 },
    { key: "multiplier", type: "number", label: "Multiplier", min: 0.5, max: 4, step: 0.1 },
  ],
  donchian: [{ key: "length", type: "number", label: "Length", min: 2, max: 100, step: 1 }],
  obv: [{ key: "showPanel", type: "boolean", label: "Show panel" }],
  divergence: [
    { key: "mode", type: "select", label: "Mode", options: ["RSI", "MACD", "BOTH"] },
    { key: "sensitivity", type: "select", label: "Sensitivity", options: ["LOW", "MED", "HIGH"] },
  ],
  supportResistance: [
    { key: "method", type: "select", label: "Method", options: ["pivots", "fractals"] },
    { key: "sensitivity", type: "select", label: "Sensitivity", options: ["LOW", "MED", "HIGH"] },
    { key: "maxLevels", type: "number", label: "Max levels", min: 2, max: 12, step: 1 },
  ],
  liquidityZones: [
    { key: "depth", type: "select", label: "Depth", options: ["light", "medium", "heavy"] },
    { key: "showOnChart", type: "boolean", label: "Show on chart" },
  ],
};

const chip = (on: boolean) =>
  `rounded-full border px-2 py-0.5 text-[10px] font-semibold ${on ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]" : "border-white/10 bg-[#1A1B1F] text-[#6B6F76]"}`;

export const IndicatorsPanel = ({
  state,
  enabledCount,
  open,
  onOpenChange,
  setMaster,
  setGroup,
  setIndicatorEnabled,
  setIndicatorSetting,
  resetIndicator,
}: Props) => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const groupedCounts = useMemo(() => {
    const counts = {} as Record<IndicatorGroupKey, number>;
    (Object.keys(INDICATOR_GROUPS) as IndicatorGroupKey[]).forEach((groupKey) => {
      counts[groupKey] = INDICATOR_GROUPS[groupKey].indicators.filter((indicator) => state.indicators[indicator].enabled).length;
    });
    return counts;
  }, [state.indicators]);

  return (
    <section className="relative rounded-2xl border border-[#2f3340] bg-[linear-gradient(180deg,#12141a_0%,#111318_100%)]">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition hover:bg-[rgba(255,255,255,0.02)]"
        onClick={() => onOpenChange(!open)}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#F5C542] shadow-[0_0_10px_rgba(245,197,66,0.55)]" />
          <p className="text-sm font-semibold text-white">Indicators</p>
          <span className="rounded-full border border-[#4a3e2a] bg-[#201a10] px-2 py-0.5 text-[10px] font-semibold text-[#f1cf78]">
            Live Controls
          </span>
        </div>
        <label
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0f1218] px-2 py-1 text-xs text-[#BFC2C7]"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#F5C542]"
            checked={state.masterEnabled}
            onChange={(e) => setMaster(e.target.checked)}
          />
          Master
        </label>
        <span className="text-[11px] text-[#8f97a5]">({enabledCount} enabled)</span>
        <span className="rounded-full border border-white/10 bg-[#0f1218] px-2 py-0.5 text-[11px] text-[#BFC2C7]">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#121316] p-3 shadow-2xl">
          {(Object.keys(INDICATOR_GROUPS) as IndicatorGroupKey[]).map((groupKey) => {
            const group = INDICATOR_GROUPS[groupKey];
            const groupEnabled = state.masterEnabled && state.groups[groupKey].enabled;
            return (
              <div key={groupKey} className="rounded-xl border border-white/10 bg-[#0F1012] p-2">
                <div className="mb-2 flex items-center gap-2">
                  <p className="text-xs font-semibold text-white">{group.label}</p>
                  <span className="text-[10px] text-[#6B6F76]">{groupedCounts[groupKey]} enabled</span>
                  <label className="ml-auto flex items-center gap-2 text-[11px] text-[#BFC2C7]">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[#F5C542]"
                      disabled={!state.masterEnabled}
                      checked={groupEnabled}
                      onChange={(e) => setGroup(groupKey, e.target.checked)}
                    />
                    Group
                  </label>
                </div>

                <div className="space-y-1.5">
                  {group.indicators.map((indicatorKey) => {
                    const indicator = state.indicators[indicatorKey];
                    const disabled = !state.masterEnabled || !state.groups[groupKey].enabled;
                    const rowOpen = !!expandedRows[indicatorKey];
                    const fields = indicatorFields[indicatorKey] ?? [];

                    return (
                      <div key={indicatorKey} className="rounded-lg border border-white/10 bg-[#121316] px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[#F5C542]"
                            disabled={disabled}
                            checked={state.masterEnabled && indicator.enabled}
                            onChange={(e) => setIndicatorEnabled(indicatorKey, e.target.checked)}
                          />
                          <p className="text-xs text-[#BFC2C7]">{INDICATOR_LABELS[indicatorKey]}</p>
                          <span className={chip(state.masterEnabled && indicator.enabled)}>ON/OFF {state.masterEnabled && indicator.enabled ? "ON" : "OFF"}</span>
                          {fields.length ? (
                            <button
                              type="button"
                              className="ml-auto rounded border border-white/10 bg-[#0F1012] px-2 py-0.5 text-[10px] text-[#BFC2C7] hover:bg-[#17191d]"
                              onClick={() => setExpandedRows((prev) => ({ ...prev, [indicatorKey]: !prev[indicatorKey] }))}
                            >
                              Settings {rowOpen ? "▴" : "▾"}
                            </button>
                          ) : null}
                        </div>

                        {rowOpen ? (
                          <div className="mt-2 grid gap-2 border-t border-white/10 pt-2 sm:grid-cols-2 xl:grid-cols-3">
                            {fields.map((field) => {
                              const value = indicator.settings[field.key];
                              if (field.type === "number") {
                                return (
                                  <label key={field.key} className="text-[11px] text-[#BFC2C7]">
                                    {field.label}
                                    <input
                                      type="number"
                                      className="mt-1 w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-[11px]"
                                      min={field.min}
                                      max={field.max}
                                      step={field.step}
                                      value={typeof value === "number" ? value : 0}
                                      onChange={(e) => setIndicatorSetting(indicatorKey, field.key, Number(e.target.value))}
                                    />
                                  </label>
                                );
                              }

                              if (field.type === "select") {
                                return (
                                  <label key={field.key} className="text-[11px] text-[#BFC2C7]">
                                    {field.label}
                                    <select
                                      className="mt-1 w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-[11px]"
                                      value={typeof value === "string" ? value : String(field.options?.[0] ?? "")}
                                      onChange={(e) => setIndicatorSetting(indicatorKey, field.key, e.target.value)}
                                    >
                                      {(field.options ?? []).map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                );
                              }

                              if (field.type === "boolean") {
                                return (
                                  <label key={field.key} className="flex items-center gap-2 text-[11px] text-[#BFC2C7]">
                                    <input
                                      type="checkbox"
                                      className="h-3.5 w-3.5 accent-[#F5C542]"
                                      checked={Boolean(value)}
                                      onChange={(e) => setIndicatorSetting(indicatorKey, field.key, e.target.checked)}
                                    />
                                    {field.label}
                                  </label>
                                );
                              }

                              const set = new Set(Array.isArray(value) ? value : []);
                              return (
                                <div key={field.key} className="text-[11px] text-[#BFC2C7]">
                                  <p>{field.label}</p>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {(field.options ?? []).map((option) => (
                                      <label key={option} className="flex items-center gap-1">
                                        <input
                                          type="checkbox"
                                          className="h-3.5 w-3.5 accent-[#F5C542]"
                                          checked={set.has(option)}
                                          onChange={(e) => {
                                            const next = new Set(set);
                                            if (e.target.checked) next.add(option);
                                            else next.delete(option);
                                            setIndicatorSetting(indicatorKey, field.key, Array.from(next));
                                          }}
                                        />
                                        {option}
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                            <button
                              type="button"
                              className="self-end rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-[#BFC2C7] hover:bg-[#17191d]"
                              onClick={() => resetIndicator(indicatorKey)}
                            >
                              Reset
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
};
