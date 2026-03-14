import { useCallback, useEffect, useRef, useState } from "react";
import type { FlowModeSettingsConfig, ScoringMode } from "../types";
import { isUserSelectableScoringMode } from "../data/scoringEngine";
import { FLOW_SIGNAL_DEFAULT_WEIGHTS } from "../data/quantLayers";

const STORAGE_KEY = "bitrium.scoring_mode";
const LEGACY_STORAGE_KEY = "bitrium.scoring_mode";
const FLOW_STORAGE_KEY = "bitrium.flow_mode_settings";
const LEGACY_FLOW_STORAGE_KEY = "bitrium.flow_mode_settings";
const DEFAULT_SCORING_MODE: ScoringMode = "FLOW";
const DEMO_USER_ID = "demo-user";

const isScoringMode = (value: unknown): value is ScoringMode =>
  value === "AGGRESSIVE" || value === "BALANCED" || value === "FLOW" || value === "CAPITAL_GUARD";

const normalizeScoringMode = (value: unknown): ScoringMode | null => {
  if (isScoringMode(value)) return value;
  const normalized = String(value ?? "").toUpperCase().trim();
  if (!normalized) return null;
  if (normalized === "EXTREME") return "FLOW";
  if (normalized === "VELOCITY") return "AGGRESSIVE";
  if (normalized === "NORMAL") return "BALANCED";
  if (normalized === "HEDGE_FUND") return "CAPITAL_GUARD";
  if (normalized === "AGGRESSIVE") return "AGGRESSIVE";
  if (normalized === "BALANCED") return "BALANCED";
  if (normalized === "FLOW") return "FLOW";
  if (normalized === "CAPITAL_GUARD" || normalized === "CAPITAL-GUARD" || normalized === "CAPITALGUARD") return "CAPITAL_GUARD";
  return null;
};

const readStoredScoringMode = (): ScoringMode => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed = normalizeScoringMode(raw) ?? DEFAULT_SCORING_MODE;
    return parsed === "BALANCED" || isUserSelectableScoringMode(parsed) ? parsed : DEFAULT_SCORING_MODE;
  } catch {
    return DEFAULT_SCORING_MODE;
  }
};

const persistStoredScoringMode = (mode: ScoringMode) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
};

const DEFAULT_FLOW_SETTINGS: FlowModeSettingsConfig = {
  minConsensus: 70,
  minValidBars: 4,
  requireValidTrade: true,
  dataFilters: {
    fundingBias: false,
    oiChange: false,
    volumeSpike: false,
    exchangeFlow: false,
    relativeStrength: false,
    keyLevelReaction: false,
  },
  signalInputs: {
    marketRegime: true,
    distanceToKeyLevel: true,
    rangePosition: true,
    liquidityClusterNearby: true,
    lastSwingDistance: true,
    htfLevelReaction: true,
    structureAge: true,
    timeInRange: true,
    trendDirection: true,
    trendStrength: true,
    trendPhase: true,
    emaAlignment: true,
    vwapPosition: true,
    timeSinceRegimeChange: true,
    atrRegime: true,
    compression: true,
    marketSpeed: true,
    breakoutRisk: true,
    fakeBreakoutProbability: true,
    expansionProbability: true,
  },
  signalInputWeights: { ...FLOW_SIGNAL_DEFAULT_WEIGHTS },
  riskChecks: {
    riskGate: true,
    executionCertainty: true,
    stressFilter: true,
    sizeHint: true,
  },
};

const normalizeFlowModeSettings = (raw: unknown): FlowModeSettingsConfig | null => {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<FlowModeSettingsConfig>;
  const minConsensus = Number(item.minConsensus);
  const minValidBars = Number(item.minValidBars);
  const requireValidTrade = typeof item.requireValidTrade === "boolean" ? item.requireValidTrade : DEFAULT_FLOW_SETTINGS.requireValidTrade;
  const signalInputs = { ...DEFAULT_FLOW_SETTINGS.signalInputs };
  const signalInputWeights = { ...DEFAULT_FLOW_SETTINGS.signalInputWeights };
  const riskChecks = { ...DEFAULT_FLOW_SETTINGS.riskChecks };
  const dataFilters = { ...DEFAULT_FLOW_SETTINGS.dataFilters };
  if (item.signalInputs && typeof item.signalInputs === "object") {
    for (const [k, v] of Object.entries(item.signalInputs)) {
      if (typeof v === "boolean" && k in signalInputs) signalInputs[k as keyof typeof signalInputs] = v;
    }
  }
  if (item.riskChecks && typeof item.riskChecks === "object") {
    for (const [k, v] of Object.entries(item.riskChecks)) {
      if (typeof v === "boolean" && k in riskChecks) riskChecks[k as keyof typeof riskChecks] = v;
    }
  }
  if (item.signalInputWeights && typeof item.signalInputWeights === "object") {
    for (const [k, v] of Object.entries(item.signalInputWeights)) {
      const numeric = Number(v);
      if (Number.isFinite(numeric)) {
        signalInputWeights[k] = Math.max(1, Math.min(10, Math.round(numeric)));
      }
    }
  }
  if (item.dataFilters && typeof item.dataFilters === "object") {
    for (const [k, v] of Object.entries(item.dataFilters)) {
      if (typeof v === "boolean" && k in dataFilters) dataFilters[k as keyof typeof dataFilters] = v;
    }
  }
  return {
    minConsensus: Number.isFinite(minConsensus) ? Math.max(20, Math.min(95, minConsensus)) : DEFAULT_FLOW_SETTINGS.minConsensus,
    minValidBars: Number.isFinite(minValidBars) ? Math.max(1, Math.min(12, Math.round(minValidBars))) : DEFAULT_FLOW_SETTINGS.minValidBars,
    requireValidTrade,
    dataFilters,
    signalInputs,
    signalInputWeights,
    riskChecks,
  };
};

const readStoredFlowModeSettings = (): FlowModeSettingsConfig | null => {
  try {
    const raw = window.localStorage.getItem(FLOW_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_FLOW_STORAGE_KEY);
    if (!raw) return null;
    return normalizeFlowModeSettings(JSON.parse(raw));
  } catch {
    return null;
  }
};

const persistStoredFlowModeSettings = (settings: FlowModeSettingsConfig) => {
  try {
    window.localStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(settings));
    window.localStorage.removeItem(LEGACY_FLOW_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
};

type UserSettingsApiBody = {
  ok?: boolean;
  scoring_mode?: ScoringMode;
  flow_mode?: FlowModeSettingsConfig;
  settings?: {
    scoring_mode?: ScoringMode;
    flow_mode?: FlowModeSettingsConfig;
  };
};

const parseScoringModeFromApi = (body: UserSettingsApiBody): ScoringMode | null => {
  const primary = normalizeScoringMode(body.scoring_mode);
  if (primary) return primary;
  const nested = normalizeScoringMode(body.settings?.scoring_mode);
  if (nested) return nested;
  return null;
};

export const useUserSettings = () => {
  const [scoringMode, setScoringModeState] = useState<ScoringMode>(() => readStoredScoringMode());
  const [flowModeSettings, setFlowModeSettingsState] = useState<FlowModeSettingsConfig | null>(() => readStoredFlowModeSettings());
  const [loading, setLoading] = useState(true);
  const userOverrodeRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);
      try {
        const res = await fetch("/api/user/settings", {
          headers: { "x-user-id": DEMO_USER_ID },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as UserSettingsApiBody;
        const mode = parseScoringModeFromApi(body);
        if (!cancelled && !userOverrodeRef.current && mode && isUserSelectableScoringMode(mode)) {
          setScoringModeState(mode);
          persistStoredScoringMode(mode);
        }
        const flowFromApi = normalizeFlowModeSettings(body.flow_mode ?? body.settings?.flow_mode);
        if (!cancelled && flowFromApi) {
          setFlowModeSettingsState(flowFromApi);
          persistStoredFlowModeSettings(flowFromApi);
        }
      } catch {
        // fallback stays localStorage based
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setScoringMode = useCallback((next: ScoringMode) => {
    if (!isUserSelectableScoringMode(next)) return;
    userOverrodeRef.current = true;
    setScoringModeState(next);
    persistStoredScoringMode(next);
    void fetch("/api/user/settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": DEMO_USER_ID,
      },
      body: JSON.stringify({ scoring_mode: next }),
    }).catch(() => {
      // local persistence is enough for MVP fallback
    });
  }, []);

  const setFlowModeSettings = useCallback((next: FlowModeSettingsConfig) => {
    const normalized = normalizeFlowModeSettings(next);
    if (!normalized) return;
    setFlowModeSettingsState(normalized);
    persistStoredFlowModeSettings(normalized);
    void fetch("/api/user/settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": DEMO_USER_ID,
      },
      body: JSON.stringify({ flow_mode: normalized }),
    }).catch(() => {
      // local persistence is enough for MVP fallback
    });
  }, []);

  return {
    scoringMode,
    setScoringMode,
    flowModeSettings,
    setFlowModeSettings,
    loading,
  };
};
