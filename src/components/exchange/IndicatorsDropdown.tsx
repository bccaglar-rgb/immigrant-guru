import { useEffect, useMemo, useRef, useState } from "react";
import { INDICATOR_GROUPS, INDICATOR_LABELS } from "../../hooks/useIndicatorsStore";
import type { IndicatorGroupKey, IndicatorKey, IndicatorsState } from "../../types";

type SettingValue = number | string | boolean | string[];

interface Props {
  state: IndicatorsState;
  enabledCount: number;
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
  supportResistance: [
    { key: "method", type: "select", label: "Method", options: ["pivots", "fractals"] },
    { key: "sensitivity", type: "select", label: "Sensitivity", options: ["LOW", "MED", "HIGH"] },
    { key: "maxLevels", type: "number", label: "Max levels", min: 2, max: 12, step: 1 },
  ],
  liquidityZones: [
    { key: "depth", type: "select", label: "Depth", options: ["light", "medium", "heavy"] },
    { key: "showOnChart", type: "boolean", label: "Show on chart" },
  ],
  divergence: [
    { key: "mode", type: "select", label: "Mode", options: ["RSI", "MACD", "BOTH"] },
    { key: "sensitivity", type: "select", label: "Sensitivity", options: ["LOW", "MED", "HIGH"] },
  ],
};

export const IndicatorsDropdown = ({
  state,
  enabledCount,
  setMaster,
  setGroup,
  setIndicatorEnabled,
  setIndicatorSetting,
  resetIndicator,
}: Props) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return Object.keys(state.indicators) as IndicatorKey[];
    return (Object.keys(state.indicators) as IndicatorKey[]).filter((key) => {
      const label = INDICATOR_LABELS[key]?.toLowerCase() ?? "";
      return label.includes(q) || key.toLowerCase().includes(q);
    });
  }, [query, state.indicators]);

  const groups = useMemo(
    () =>
      (Object.keys(INDICATOR_GROUPS) as IndicatorGroupKey[])
        .map((groupKey) => ({
          groupKey,
          label: INDICATOR_GROUPS[groupKey].label,
          indicators: INDICATOR_GROUPS[groupKey].indicators.filter((k) => filtered.includes(k)),
        }))
        .filter((group) => group.indicators.length > 0),
    [filtered],
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-[#D3D7DE] hover:border-white/20"
      >
        <span>Indicators</span>
        <span className="rounded-full bg-[#1b1d22] px-1.5 py-0.5 text-[10px] text-[#8A8F98]">{enabledCount}</span>
        <span className="text-[10px] text-[#8A8F98]">{open ? "▴" : "▾"}</span>
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[420px] max-w-[90vw] rounded-xl border border-white/10 bg-[#121316] p-2 shadow-2xl">
          <div className="mb-2 flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search indicator..."
              className="w-full rounded border border-white/15 bg-[#0F1012] px-2.5 py-1.5 text-xs text-[#E7E9ED] outline-none placeholder:text-[#6B6F76]"
            />
            <label className="inline-flex items-center gap-1 text-[11px] text-[#BFC2C7]">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[#F5C542]"
                checked={state.masterEnabled}
                onChange={(e) => setMaster(e.target.checked)}
              />
              Master
            </label>
          </div>

          <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
            {groups.map((group) => {
              const groupEnabled = state.masterEnabled && state.groups[group.groupKey].enabled;
              return (
                <div key={group.groupKey} className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-[11px] font-semibold text-white">{group.label}</p>
                    <label className="ml-auto inline-flex items-center gap-1 text-[10px] text-[#BFC2C7]">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-[#F5C542]"
                        checked={groupEnabled}
                        disabled={!state.masterEnabled}
                        onChange={(e) => setGroup(group.groupKey, e.target.checked)}
                      />
                      Group
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    {group.indicators.map((indicatorKey) => {
                      const indicator = state.indicators[indicatorKey];
                      const disabled = !state.masterEnabled || !state.groups[group.groupKey].enabled;
                      const rowOpen = !!expandedRows[indicatorKey];
                      const fields = indicatorFields[indicatorKey] ?? [];
                      return (
                        <div key={indicatorKey} className="rounded border border-white/10 bg-[#121316] px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-[#F5C542]"
                              checked={state.masterEnabled && indicator.enabled}
                              disabled={disabled}
                              onChange={(e) => setIndicatorEnabled(indicatorKey, e.target.checked)}
                            />
                            <span className="text-[11px] text-[#D3D7DE]">{INDICATOR_LABELS[indicatorKey]}</span>
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
                            <div className="mt-2 grid gap-1.5 border-t border-white/10 pt-2">
                              {fields.map((field) => {
                                const value = indicator.settings[field.key];
                                if (field.type === "number") {
                                  return (
                                    <label key={field.key} className="text-[10px] text-[#BFC2C7]">
                                      {field.label}
                                      <input
                                        type="number"
                                        min={field.min}
                                        max={field.max}
                                        step={field.step}
                                        value={typeof value === "number" ? value : 0}
                                        onChange={(e) => setIndicatorSetting(indicatorKey, field.key, Number(e.target.value))}
                                        className="mt-1 w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-[11px]"
                                      />
                                    </label>
                                  );
                                }
                                if (field.type === "select") {
                                  return (
                                    <label key={field.key} className="text-[10px] text-[#BFC2C7]">
                                      {field.label}
                                      <select
                                        value={typeof value === "string" ? value : String(field.options?.[0] ?? "")}
                                        onChange={(e) => setIndicatorSetting(indicatorKey, field.key, e.target.value)}
                                        className="mt-1 w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-[11px]"
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
                                    <label key={field.key} className="inline-flex items-center gap-2 text-[10px] text-[#BFC2C7]">
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
                                  <div key={field.key} className="text-[10px] text-[#BFC2C7]">
                                    <p>{field.label}</p>
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      {(field.options ?? []).map((option) => (
                                        <label key={option} className="inline-flex items-center gap-1">
                                          <input
                                            type="checkbox"
                                            className="h-3.5 w-3.5 accent-[#F5C542]"
                                            checked={set.has(option)}
                                            onChange={(e) => {
                                              const next = new Set(set);
                                              if (e.target.checked) next.add(option);
                                              else next.delete(option);
                                              setIndicatorSetting(indicatorKey, field.key, [...next]);
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
                                className="ml-auto mt-1 rounded border border-white/10 bg-[#111215] px-2 py-0.5 text-[10px] text-[#BFC2C7] hover:bg-[#17191d]"
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
        </div>
      ) : null}
    </div>
  );
};

