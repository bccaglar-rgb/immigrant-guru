import { useEffect, useMemo, useReducer } from "react";
import type { IndicatorConfig, IndicatorGroupKey, IndicatorKey, IndicatorsState } from "../types";

const STORAGE_KEY = "btc-dashboard-indicators-v1";

export const INDICATOR_GROUPS: Record<IndicatorGroupKey, { label: string; indicators: IndicatorKey[] }> = {
  trend: {
    label: "Trend / Structure",
    indicators: ["ema", "vwap", "adx", "supertrend", "ichimoku", "pivotPoints"],
  },
  momentum: {
    label: "Momentum",
    indicators: ["rsi", "macd", "stochRsi", "cci", "momentumOsc"],
  },
  volatility: {
    label: "Volatility",
    indicators: ["atr", "bbands", "keltner", "donchian"],
  },
  volumeFlow: {
    label: "Volume / Flow",
    indicators: ["volume", "volumeMa", "obv", "vwma", "cvd", "buySellImbalance"],
  },
  structureHelpers: {
    label: "Market Structure Helpers",
    indicators: ["supportResistance", "liquidityZones", "fairValueGaps", "divergence"],
  },
};

export const INDICATOR_LABELS: Record<IndicatorKey, string> = {
  ema: "EMA",
  vwap: "VWAP",
  adx: "ADX",
  supertrend: "Supertrend",
  ichimoku: "Ichimoku",
  pivotPoints: "Pivot Points / Key Levels",
  rsi: "RSI",
  macd: "MACD",
  stochRsi: "Stochastic RSI",
  cci: "CCI",
  momentumOsc: "Momentum Oscillator",
  atr: "ATR",
  bbands: "Bollinger Bands",
  keltner: "Keltner Channels",
  donchian: "Donchian Channels",
  volume: "Volume",
  volumeMa: "Volume MA",
  obv: "OBV",
  vwma: "VWMA",
  cvd: "CVD",
  buySellImbalance: "Buy/Sell Imbalance",
  supportResistance: "Support/Resistance",
  liquidityZones: "Liquidity Zones",
  fairValueGaps: "Fair Value Gaps",
  divergence: "Divergence Detector",
};

const defaults = (): IndicatorsState => ({
  masterEnabled: true,
  groups: {
    trend: { enabled: true },
    momentum: { enabled: true },
    volatility: { enabled: true },
    volumeFlow: { enabled: true },
    structureHelpers: { enabled: true },
  },
  indicators: {
    ema: { enabled: true, showOnChart: true, settings: { periods: ["20", "50", "200"], source: "close", showOnChart: true } },
    vwap: { enabled: true, showOnChart: true, settings: { mode: "session", showOnChart: true } },
    adx: { enabled: false, showPanel: false, settings: { length: 14, thresholdStrong: 25, showPanel: false } },
    supertrend: { enabled: false, showOnChart: false, settings: { atrLength: 10, multiplier: 3, showOnChart: false } },
    ichimoku: { enabled: false, showOnChart: false, settings: { conversion: 9, base: 26, spanB: 52, showOnChart: false } },
    pivotPoints: { enabled: true, showOnChart: true, settings: { showOnChart: true } },
    rsi: { enabled: false, showPanel: true, settings: { length: 14, overbought: 70, oversold: 30, showPanel: true } },
    macd: { enabled: false, showPanel: true, settings: { fast: 12, slow: 26, signal: 9, showPanel: true } },
    stochRsi: { enabled: false, showPanel: false, settings: { length: 14, smoothK: 3, smoothD: 3, showPanel: false } },
    cci: { enabled: false, showPanel: false, settings: { length: 20, showPanel: false } },
    momentumOsc: { enabled: false, showPanel: false, settings: { length: 14, showPanel: false } },
    atr: { enabled: false, showOnChart: false, settings: { length: 14, showAs: "line", showOnChart: false } },
    bbands: { enabled: false, showOnChart: true, settings: { length: 20, stdev: 2, showOnChart: true } },
    keltner: { enabled: false, showOnChart: false, settings: { length: 20, multiplier: 1.5, showOnChart: false } },
    donchian: { enabled: false, showOnChart: false, settings: { length: 20, showOnChart: false } },
    volume: { enabled: true, showOnChart: true, settings: { showOnChart: true } },
    volumeMa: { enabled: false, showOnChart: false, settings: { length: 20, showOnChart: false } },
    obv: { enabled: false, showPanel: false, settings: { showPanel: false } },
    vwma: { enabled: false, showOnChart: false, settings: { length: 20, showOnChart: false } },
    cvd: { enabled: false, showPanel: false, settings: { mode: "delta", showPanel: false } },
    buySellImbalance: { enabled: false, showPanel: false, settings: { showPanel: false } },
    supportResistance: { enabled: false, showOnChart: false, settings: { method: "pivots", sensitivity: "MED", maxLevels: 6 } },
    liquidityZones: { enabled: false, showOnChart: true, settings: { depth: "medium", showOnChart: true } },
    fairValueGaps: { enabled: false, showOnChart: false, settings: { showOnChart: false } },
    divergence: { enabled: false, showPanel: false, settings: { mode: "BOTH", sensitivity: "MED", showPanel: false } },
  },
});

const GROUP_BY_INDICATOR = (Object.entries(INDICATOR_GROUPS) as Array<[IndicatorGroupKey, { indicators: IndicatorKey[] }]>).reduce(
  (acc, [groupKey, group]) => {
    group.indicators.forEach((indicator) => {
      acc[indicator] = groupKey;
    });
    return acc;
  },
  {} as Record<IndicatorKey, IndicatorGroupKey>,
);

type Action =
  | { type: "hydrate"; payload: IndicatorsState }
  | { type: "setMaster"; enabled: boolean }
  | { type: "setGroup"; group: IndicatorGroupKey; enabled: boolean }
  | { type: "setIndicatorEnabled"; indicator: IndicatorKey; enabled: boolean }
  | { type: "setSetting"; indicator: IndicatorKey; key: string; value: number | string | boolean | string[] }
  | { type: "resetIndicator"; indicator: IndicatorKey };

const resetIndicator = (state: IndicatorsState, indicator: IndicatorKey): IndicatorsState => ({
  ...state,
  indicators: {
    ...state.indicators,
    [indicator]: { ...defaults().indicators[indicator] },
  },
});

const reducer = (state: IndicatorsState, action: Action): IndicatorsState => {
  if (action.type === "hydrate") return action.payload;

  if (action.type === "setMaster") {
    if (!action.enabled) {
      const allOffIndicators = Object.keys(state.indicators).reduce<Record<IndicatorKey, IndicatorConfig>>((acc, indicator) => {
        const key = indicator as IndicatorKey;
        acc[key] = { ...state.indicators[key], enabled: false };
        return acc;
      }, {} as Record<IndicatorKey, IndicatorConfig>);

      const allOffGroups = Object.keys(state.groups).reduce<IndicatorsState["groups"]>((acc, group) => {
        acc[group as IndicatorGroupKey] = { enabled: false };
        return acc;
      }, {} as IndicatorsState["groups"]);

      return {
        ...state,
        masterEnabled: false,
        groups: allOffGroups,
        indicators: allOffIndicators,
      };
    }

    const allOnGroups = Object.keys(state.groups).reduce<IndicatorsState["groups"]>((acc, group) => {
      acc[group as IndicatorGroupKey] = { enabled: true };
      return acc;
    }, {} as IndicatorsState["groups"]);

    return {
      ...state,
      masterEnabled: true,
      groups: allOnGroups,
    };
  }

  if (action.type === "setGroup") {
    const nextGroups = {
      ...state.groups,
      [action.group]: { enabled: action.enabled },
    };

    if (action.enabled) {
      return { ...state, groups: nextGroups };
    }

    const nextIndicators = { ...state.indicators };
    INDICATOR_GROUPS[action.group].indicators.forEach((indicator) => {
      nextIndicators[indicator] = { ...nextIndicators[indicator], enabled: false };
    });
    return { ...state, groups: nextGroups, indicators: nextIndicators };
  }

  if (action.type === "setIndicatorEnabled") {
    const group = GROUP_BY_INDICATOR[action.indicator];
    const canEnable = state.masterEnabled && state.groups[group].enabled;
    return {
      ...state,
      indicators: {
        ...state.indicators,
        [action.indicator]: {
          ...state.indicators[action.indicator],
          enabled: action.enabled ? canEnable : false,
        },
      },
    };
  }

  if (action.type === "setSetting") {
    const current = state.indicators[action.indicator];
    const next = {
      ...current,
      settings: {
        ...current.settings,
        [action.key]: action.value,
      },
    };
    if (action.key === "showOnChart" && typeof action.value === "boolean") next.showOnChart = action.value;
    if (action.key === "showPanel" && typeof action.value === "boolean") next.showPanel = action.value;
    return {
      ...state,
      indicators: {
        ...state.indicators,
        [action.indicator]: next,
      },
    };
  }

  if (action.type === "resetIndicator") {
    return resetIndicator(state, action.indicator);
  }

  return state;
};

const loadPersisted = (): IndicatorsState | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IndicatorsState;
    if (!parsed || typeof parsed.masterEnabled !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
};

export const useIndicatorsStore = () => {
  const [state, dispatch] = useReducer(reducer, undefined, () => defaults());

  useEffect(() => {
    const persisted = loadPersisted();
    if (persisted) dispatch({ type: "hydrate", payload: persisted });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const enabledCount = useMemo(
    () => Object.values(state.indicators).filter((indicator) => state.masterEnabled && indicator.enabled).length,
    [state],
  );

  return {
    state,
    enabledCount,
    setMaster: (enabled: boolean) => dispatch({ type: "setMaster", enabled }),
    setGroup: (group: IndicatorGroupKey, enabled: boolean) => dispatch({ type: "setGroup", group, enabled }),
    setIndicatorEnabled: (indicator: IndicatorKey, enabled: boolean) => dispatch({ type: "setIndicatorEnabled", indicator, enabled }),
    setIndicatorSetting: (indicator: IndicatorKey, key: string, value: number | string | boolean | string[]) =>
      dispatch({ type: "setSetting", indicator, key, value }),
    resetIndicator: (indicator: IndicatorKey) => dispatch({ type: "resetIndicator", indicator }),
  };
};
