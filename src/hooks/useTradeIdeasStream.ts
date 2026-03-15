import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { FallbackApiAdapter } from "../data/FallbackApiAdapter";
import { MarketDataRouter } from "../data/MarketDataRouter";
import type { ScoringMode, TradePlan } from "../types";
import { parseTradePlan } from "../utils/parseTradePlan";
import { readUserModeConsensusMinPct } from "../utils/modeConsensusRangeStorage";
import { useExchangeTerminalStore } from "./useExchangeTerminalStore";

const STORAGE_KEY = "trade-ideas-last100-v2";
const LEGACY_STORAGE_KEYS = ["trade-ideas-last100-v1"];
const RESET_MARKER_KEY = "trade-ideas-hard-reset-v20260301";
const SCAN_MAX_COINS_KEY = "bitrium.tradeIdeas.maxScanCoins";
const LEGACY_SCAN_MAX_COINS_KEY = "bitrium.tradeIdeas.maxScanCoins";
const SCAN_MIN_VOLUME_USD_KEY = "bitrium.tradeIdeas.universeMinVolumeUsd";
const LEGACY_SCAN_MIN_VOLUME_USD_KEY = "bitrium.tradeIdeas.universeMinVolumeUsd";
const USER_ID = "demo-user";
const FALLBACK_SCAN_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT"];
const SCAN_MODES = ["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"] as const satisfies readonly ScoringMode[];
const STABLE_BASE_ASSETS = new Set([
  "USDT",
  "USDC",
  "BUSD",
  "FDUSD",
  "TUSD",
  "USDP",
  "DAI",
  "PYUSD",
  "EURC",
  "GUSD",
  "USDD",
  "USDE",
  "UST",
  "USTC",
  "FRAX",
  "LUSD",
  "SUSD",
]);
const DEFAULT_MAX_SCAN_COINS = 400;
const DEFAULT_SCAN_BATCH_SIZE = 10;
const TOTAL_SCAN_BATCH_SIZE = DEFAULT_SCAN_BATCH_SIZE * SCAN_MODES.length;
const DEFAULT_UNIVERSE_MIN_VOLUME_USD = 20_000_000;
const UNIVERSE_REFRESH_MS = 60_000;
const LOOP_BASE_DELAY_MS = 9_000;
const LOOP_JITTER_MS = 0;
const ROTATION_WINDOW_MS = 9_000;
// Global lower bound for idea creation. UI mode ranges can raise this per mode.
const TRADE_IDEA_MIN_SCORE_PCT = 40;
const IDEA_HORIZON: TradePlan["horizon"] = "INTRADAY";
const IDEA_TIMEFRAME: TradePlan["timeframe"] = "15m";
const SCANNER_DEFAULT_EXCHANGE = "Binance";
const IDEA_REPEAT_COOLDOWN_ROUNDS = 0;
const OI_PRIORITY_HEAD_LIMIT = 10;

const clampInt = (value: number, min: number, max: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
};
const readScanConfig = () => {
  try {
    const rawMax = Number(window.localStorage.getItem(SCAN_MAX_COINS_KEY) ?? window.localStorage.getItem(LEGACY_SCAN_MAX_COINS_KEY));
    const rawMinVolume = Number(
      window.localStorage.getItem(SCAN_MIN_VOLUME_USD_KEY) ?? window.localStorage.getItem(LEGACY_SCAN_MIN_VOLUME_USD_KEY),
    );
    return {
      maxScanCoins: clampInt(rawMax, TOTAL_SCAN_BATCH_SIZE, 800, DEFAULT_MAX_SCAN_COINS),
      scanBatchSize: DEFAULT_SCAN_BATCH_SIZE,
      minVolumeUsd: clampInt(rawMinVolume, 0, 1_000_000_000, DEFAULT_UNIVERSE_MIN_VOLUME_USD),
    };
  } catch {
    return {
      maxScanCoins: DEFAULT_MAX_SCAN_COINS,
      scanBatchSize: DEFAULT_SCAN_BATCH_SIZE,
      minVolumeUsd: DEFAULT_UNIVERSE_MIN_VOLUME_USD,
    };
  }
};

const exchangeHint = (exchange: string) => {
  const lower = exchange.toLowerCase();
  if (lower.includes("bitrium") || lower.includes("bitrium")) return "BINANCE" as const;
  if (lower === "bybit") return "BYBIT" as const;
  if (lower === "okx") return "OKX" as const;
  if (lower === "gate.io" || lower === "gateio" || lower === "gate") return "GATEIO" as const;
  return "BINANCE" as const;
};

const normalizeBaseSymbol = (raw: unknown): string | null => {
  const cleaned = String(raw ?? "").toUpperCase().replace(/[-_/]/g, "").trim();
  if (!cleaned) return null;
  const base = cleaned.endsWith("USDT") ? cleaned.slice(0, -4) : cleaned;
  if (!base || base === "USDT" || base.length > 20 || !/^[A-Z0-9]+$/.test(base)) return null;
  return base;
};

const toPairSymbol = (raw: unknown): string | null => {
  const base = normalizeBaseSymbol(raw);
  return base ? `${base}USDT` : null;
};

const isStablePairSymbol = (pair: string): boolean => {
  const symbol = String(pair ?? "").toUpperCase().trim();
  if (!symbol.endsWith("USDT")) return false;
  const base = symbol.slice(0, -4);
  return STABLE_BASE_ASSETS.has(base);
};

const isScannablePairSymbol = (pair: string): boolean => !isStablePairSymbol(pair);

const tfMin = (tf: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d") => {
  if (tf === "1m") return 1;
  if (tf === "5m") return 5;
  if (tf === "15m") return 15;
  if (tf === "30m") return 30;
  if (tf === "1h") return 60;
  if (tf === "4h") return 240;
  return 1440;
};

const normalizeScoringMode = (value: unknown): ScoringMode => {
  const normalized = String(value ?? "").toUpperCase().trim();
  if (normalized === "HEDGE_FUND") return "CAPITAL_GUARD";
  if (normalized === "NORMAL") return "BALANCED";
  if (normalized === "EXTREME") return "FLOW";
  if (normalized === "VELOCITY") return "AGGRESSIVE";
  if (normalized === "FLOW") return "FLOW";
  if (normalized === "AGGRESSIVE") return "AGGRESSIVE";
  if (normalized === "BALANCED") return "BALANCED";
  if (normalized === "CAPITAL_GUARD" || normalized === "CAPITAL-GUARD" || normalized === "CAPITALGUARD") return "CAPITAL_GUARD";
  return "BALANCED";
};

const normalizeModeScoreRatio = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const ratio = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, ratio));
};

const effectiveMinScorePctForMode = (mode: ScoringMode): number => {
  const userRanges = readUserModeConsensusMinPct();
  const userMin = Number(userRanges[mode]);
  if (Number.isFinite(userMin)) return clampInt(userMin, TRADE_IDEA_MIN_SCORE_PCT, 100, TRADE_IDEA_MIN_SCORE_PCT);
  return TRADE_IDEA_MIN_SCORE_PCT;
};

const toPct = (value01: number): number => Math.max(0, Math.min(100, Math.round(value01 * 100)));

const percentile = (values: number[], q: number): number => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)));
  const value = sorted[idx];
  return Number.isFinite(value) ? value : 0;
};

const topLabel = (items: string[]): string | null => {
  if (!items.length) return null;
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  let winner: string | null = null;
  let winnerCount = -1;
  for (const [key, count] of counts.entries()) {
    if (count > winnerCount) {
      winner = key;
      winnerCount = count;
    }
  }
  return winner;
};

const summarizeTelemetry = (samples: TelemetrySample[]): ModeTelemetrySummary => {
  if (!samples.length) {
    return {
      count: 0,
      passRatePct: 0,
      confidenceP50: 0,
      confidenceP90: 0,
      finalScoreP50: 0,
      finalScoreP90: 0,
      topGateFailReason: null,
      topHardReason: null,
      dominantReducer: null,
    };
  }
  const confidencePcts = samples.map((sample) => toPct(sample.confidence01));
  const finalPcts = samples.map((sample) => toPct(sample.finalScore01));
  const passCount = samples.filter((sample) => sample.status === "PASS").length;
  const gateReasons = samples.flatMap((sample) => sample.gateReasons);
  const hardReasons = samples.flatMap((sample) => sample.hardReasons);
  const dominant = topLabel(samples.map((sample) => sample.dominantReducer)) as ModeTelemetrySummary["dominantReducer"];
  return {
    count: samples.length,
    passRatePct: Number(((passCount / samples.length) * 100).toFixed(1)),
    confidenceP50: Math.round(percentile(confidencePcts, 0.5)),
    confidenceP90: Math.round(percentile(confidencePcts, 0.9)),
    finalScoreP50: Math.round(percentile(finalPcts, 0.5)),
    finalScoreP90: Math.round(percentile(finalPcts, 0.9)),
    topGateFailReason: topLabel(gateReasons),
    topHardReason: topLabel(hardReasons),
    dominantReducer: dominant ?? null,
  };
};

const shouldRunFreshReset = () => {
  try {
    return window.localStorage.getItem(RESET_MARKER_KEY) !== "1";
  } catch {
    return false;
  }
};

const clearLocalIdeaCache = () => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    for (const key of LEGACY_STORAGE_KEYS) window.localStorage.removeItem(key);
  } catch {
    // ignore localStorage failures
  }
};

const markFreshResetDone = () => {
  try {
    window.localStorage.setItem(RESET_MARKER_KEY, "1");
  } catch {
    // ignore localStorage failures
  }
};

type ApiTradeIdea = {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence_pct: number;
  scoring_mode: ScoringMode;
  approved_modes?: ScoringMode[];
  mode_scores?: Partial<Record<ScoringMode, number>>;
  entry_low: number;
  entry_high: number;
  sl_levels: number[];
  tp_levels: number[];
  status: "PENDING" | "ACTIVE" | "RESOLVED" | "CANCELLED" | "EXPIRED";
  created_at: string;
  activated_at: string | null;
  resolved_at: string | null;
  result: "SUCCESS" | "FAIL" | "NONE";
  hit_level_type: "TP" | "SL" | null;
  hit_level_index: number | null;
  hit_level_price: number | null;
  minutes_to_entry: number | null;
  minutes_to_exit: number | null;
  minutes_total: number | null;
  horizon: "SCALP" | "INTRADAY" | "SWING";
  timeframe: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
  setup: string;
  trade_validity: "VALID" | "WEAK" | "NO-TRADE";
  entry_window: "OPEN" | "NARROW" | "CLOSED";
  slippage_risk: "LOW" | "MED" | "HIGH";
  triggers_to_activate: string[];
  invalidation: string;
  timestamp_utc: string;
  valid_until_bars: number;
  valid_until_utc: string;
  market_state: {
    trend: string;
    htfBias: string;
    volatility: string;
    execution: string;
  };
  flow_analysis: string[];
  trade_intent: string[];
  raw_text: string;
  incomplete: boolean;
  price_precision?: number;
};

const normalizeIdeaStatus = (
  status: "PENDING" | "ACTIVE" | "RESOLVED" | "CANCELLED" | "EXPIRED",
): "PENDING" | "ACTIVE" | "RESOLVED" | "CANCELLED" => (status === "EXPIRED" ? "RESOLVED" : status);

const normalizeIdeaResult = (
  status: "PENDING" | "ACTIVE" | "RESOLVED" | "CANCELLED" | "EXPIRED",
  result: "SUCCESS" | "FAIL" | "NONE",
): "SUCCESS" | "FAIL" | "NONE" => {
  if (status === "EXPIRED" && result === "NONE") return "FAIL";
  return result;
};

type UniverseApiResponse = {
  ok?: boolean;
  connectors?: string[];
  registry?: {
    active_pairs?: number;
  };
  universe?: {
    filtered_total?: number;
    candidates_total?: number;
  };
  ranked_candidates?: Array<{
    symbol?: string;
    exchanges?: string[];
    oi_priority?: "OI_INCREASE_TOP5" | "OI_DECREASE_TOP5" | null;
  }>;
};

type RejectCounts = {
  incomplete: number;
  validity: number;
  entryWindow: number;
  confidence: number;
  candleBucket: number;
};

type DecisionStage = "PASS" | "BLOCKED" | "GATED" | "FILTERED";

type TelemetrySample = {
  ts: number;
  mode: ScoringMode;
  status: DecisionStage;
  confidence01: number;
  finalScore01: number;
  coreAlpha01: number;
  tradeability: number;
  reliability: number;
  penaltyFactor: number;
  capMultiplier: number;
  dominantReducer: "tradeability" | "reliability" | "penalty" | "cap";
  gateReasons: string[];
  hardReasons: string[];
  source: string;
};

export type ModeTelemetrySummary = {
  count: number;
  passRatePct: number;
  confidenceP50: number;
  confidenceP90: number;
  finalScoreP50: number;
  finalScoreP90: number;
  topGateFailReason: string | null;
  topHardReason: string | null;
  dominantReducer: "tradeability" | "reliability" | "penalty" | "cap" | null;
};

type TelemetryByMode = Record<ScoringMode, ModeTelemetrySummary>;

export type ScannedModeRow = {
  symbol: string;
  confidencePct: number;
  confidencePass: boolean;
  passed: boolean;
  created: boolean;
  reason: string;
  // Card display fields from scan cache
  direction: string;
  decision: string;
  entryLow: number;
  entryHigh: number;
  slLevels: number[];
  tpLevels: number[];
  horizon: string;
  timeframe: string;
  setup: string;
  tradeValidity: string;
  entryWindow: string;
  slippageRisk: string;
  modeScores: Record<string, number>;
  scannedAt: number;
  pricePrecision?: number;
};

type LastScannedByMode = Record<ScoringMode, ScannedModeRow[]>;

export type TradeIdeasDiagnostics = {
  lastLoopAt: number | null;
  sourceMode: "exchange" | "fallback" | null;
  sourceKey: string;
  universeActivePairs: number;
  universeFilteredPairs: number;
  universeCandidates: number;
  universeConnectorCount: number;
  universeSize: number;
  maxScanCoins: number;
  scanBatchSize: number;
  scanned: number;
  responsesOk: number;
  parsed: number;
  parseFailed: number;
  created: number;
  locked: number;
  createErrors: number;
  fetchErrors: number;
  fallbackUsed: number;
  lastSourceUsed: "EXCHANGE" | "FALLBACK_API" | null;
  lastSourceDetail: string | null;
  lastSourceExchange: string | null;
  rejected: RejectCounts;
  lastScannedByMode: LastScannedByMode;
  telemetryByMode: TelemetryByMode;
};

const makeEmptyRejectCounts = (): RejectCounts => ({
  incomplete: 0,
  validity: 0,
  entryWindow: 0,
  confidence: 0,
  candleBucket: 0,
});

const makeEmptyLastScannedByMode = (): LastScannedByMode => ({
  FLOW: [],
  AGGRESSIVE: [],
  BALANCED: [],
  CAPITAL_GUARD: [],
});

const rejectReasonLabel: Record<keyof RejectCounts, string> = {
  incomplete: "INCOMPLETE_DATA",
  validity: "VALIDITY_BLOCK",
  entryWindow: "ENTRY_WINDOW_BLOCK",
  confidence: "NO_TRADE_LOW_CONF",
  candleBucket: "SAME_CANDLE_BUCKET",
};

const makeEmptyDiagnostics = (): TradeIdeasDiagnostics => ({
  lastLoopAt: null,
  sourceMode: null,
  sourceKey: "",
  universeActivePairs: 0,
  universeFilteredPairs: 0,
  universeCandidates: 0,
  universeConnectorCount: 0,
  universeSize: 0,
  maxScanCoins: DEFAULT_MAX_SCAN_COINS,
  scanBatchSize: DEFAULT_SCAN_BATCH_SIZE,
  scanned: 0,
  responsesOk: 0,
  parsed: 0,
  parseFailed: 0,
  created: 0,
  locked: 0,
  createErrors: 0,
  fetchErrors: 0,
  fallbackUsed: 0,
  lastSourceUsed: null,
  lastSourceDetail: null,
  lastSourceExchange: null,
  rejected: makeEmptyRejectCounts(),
  lastScannedByMode: makeEmptyLastScannedByMode(),
  telemetryByMode: {
    FLOW: { count: 0, passRatePct: 0, confidenceP50: 0, confidenceP90: 0, finalScoreP50: 0, finalScoreP90: 0, topGateFailReason: null, topHardReason: null, dominantReducer: null },
    AGGRESSIVE: { count: 0, passRatePct: 0, confidenceP50: 0, confidenceP90: 0, finalScoreP50: 0, finalScoreP90: 0, topGateFailReason: null, topHardReason: null, dominantReducer: null },
    BALANCED: { count: 0, passRatePct: 0, confidenceP50: 0, confidenceP90: 0, finalScoreP50: 0, finalScoreP90: 0, topGateFailReason: null, topHardReason: null, dominantReducer: null },
    CAPITAL_GUARD: { count: 0, passRatePct: 0, confidenceP50: 0, confidenceP90: 0, finalScoreP50: 0, finalScoreP90: 0, topGateFailReason: null, topHardReason: null, dominantReducer: null },
  },
});

const toTradePlanFromApi = (idea: ApiTradeIdea): TradePlan => ({
  id: idea.id,
  createdAt: idea.created_at,
  symbol: idea.symbol,
  scoringMode: normalizeScoringMode(idea.scoring_mode),
  approvedModes: Array.isArray(idea.approved_modes) && idea.approved_modes.length
    ? idea.approved_modes.map((mode) => normalizeScoringMode(mode))
    : [normalizeScoringMode(idea.scoring_mode)],
      modeScores: idea.mode_scores && typeof idea.mode_scores === "object"
    ? Object.fromEntries(
      Object.entries(idea.mode_scores)
        .map(([key, value]) => [normalizeScoringMode(key), normalizeModeScoreRatio(value)] as const)
        .filter(([, value]) => value !== null)
        .map(([key, value]) => [key, value as number]),
    ) as Partial<Record<ScoringMode, number>>
    : undefined,
  direction: idea.direction,
  horizon: idea.horizon,
  timeframe: idea.timeframe,
  setup: idea.setup,
  confidence: Math.max(0, Math.min(1, Number(idea.confidence_pct ?? 0) / 100)),
  tradeValidity: idea.trade_validity,
  entryWindow: idea.entry_window,
  slippageRisk: idea.slippage_risk,
  triggersToActivate: Array.isArray(idea.triggers_to_activate) ? idea.triggers_to_activate.slice(0, 4) : [],
  invalidation: idea.invalidation ?? "Invalidation not provided",
  timestampUtc: idea.timestamp_utc ?? idea.created_at,
  validUntilBars: Number.isFinite(idea.valid_until_bars) ? idea.valid_until_bars : 0,
  validUntilUtc: idea.valid_until_utc ?? idea.created_at,
  entry: {
    low: Number(idea.entry_low ?? 0),
    high: Number(idea.entry_high ?? 0),
    raw: `${idea.entry_low} - ${idea.entry_high}`,
  },
  stops: Array.isArray(idea.sl_levels)
    ? idea.sl_levels.map((price, idx) => ({ label: `SL${idx + 1}`, price, sharePct: 0 }))
    : [],
  targets: Array.isArray(idea.tp_levels)
    ? idea.tp_levels.map((price, idx) => ({ label: `TP${idx + 1}`, price, sharePct: 0 }))
    : [],
  marketState: {
    trend: idea.market_state?.trend ?? "N/A",
    htfBias: idea.market_state?.htfBias ?? "N/A",
    volatility: idea.market_state?.volatility ?? "N/A",
    execution: idea.market_state?.execution ?? "N/A",
  },
  flowAnalysis: Array.isArray(idea.flow_analysis) ? idea.flow_analysis : [],
  tradeIntent: Array.isArray(idea.trade_intent) ? idea.trade_intent : [],
  disclaimer: "Always manage your own risk.",
  rawText: idea.raw_text ?? "",
  incomplete: Boolean(idea.incomplete),
  status: normalizeIdeaStatus(idea.status),
  result: normalizeIdeaResult(idea.status, idea.result),
  hitLevelType: idea.hit_level_type,
  hitLevelIndex: idea.hit_level_index,
  hitLevelPrice: idea.hit_level_price,
  minutesToEntry: idea.minutes_to_entry,
  minutesToExit: idea.minutes_to_exit,
  minutesTotal: idea.minutes_total,
  pricePrecision: idea.price_precision,
});

const normalizeStoredPlan = (raw: any): TradePlan | null => {
  if (!raw || typeof raw !== "object") return null;
  const scoringMode = normalizeScoringMode(raw.scoringMode ?? raw.scoring_mode);
  const normalizedStatus = normalizeIdeaStatus(raw.status ?? "PENDING");
  const normalizedResult = normalizeIdeaResult(raw.status ?? "PENDING", raw.result ?? "NONE");
  const approvedModesRaw = Array.isArray(raw.approvedModes ?? raw.approved_modes)
    ? (raw.approvedModes ?? raw.approved_modes)
    : [];
  const approvedModes = approvedModesRaw.length
    ? approvedModesRaw.map((value: unknown) => normalizeScoringMode(value))
    : [scoringMode];
  const modeScores = raw.modeScores && typeof raw.modeScores === "object"
    ? Object.fromEntries(
      Object.entries(raw.modeScores as Record<string, unknown>)
        .map(([mode, value]) => [normalizeScoringMode(mode), normalizeModeScoreRatio(value)] as const)
        .filter(([, value]) => value !== null)
        .map(([mode, value]) => [mode, value as number]),
    ) as Partial<Record<ScoringMode, number>>
    : undefined;
  if (raw.rawText && typeof raw.rawText === "string") {
    const reparsed = parseTradePlan(raw.rawText);
    if (reparsed) {
      return {
        ...reparsed,
        id: raw.id ?? reparsed.id,
        createdAt: raw.createdAt ?? reparsed.createdAt,
        scoringMode,
        approvedModes,
        modeScores,
      };
    }
  }

  const timestampUtc =
    typeof raw.timestampUtc === "string" && !Number.isNaN(Date.parse(raw.timestampUtc))
      ? raw.timestampUtc
      : new Date().toISOString();
  const timeframe = (["1m", "5m", "15m", "30m", "1h", "4h", "1d"].includes(raw.timeframe) ? raw.timeframe : "15m") as TradePlan["timeframe"];
  const validUntilBars = Number.isFinite(raw.validUntilBars) && raw.validUntilBars > 0 ? Number(raw.validUntilBars) : 3;
  const validUntilUtc =
    typeof raw.validUntilUtc === "string" && !Number.isNaN(Date.parse(raw.validUntilUtc))
      ? raw.validUntilUtc
      : new Date(Date.parse(timestampUtc) + tfMin(timeframe) * validUntilBars * 60_000).toISOString();

  return {
    id: raw.id ?? `migrated-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: raw.createdAt ?? timestampUtc,
    symbol: raw.symbol ?? "UNKNOWN",
    scoringMode,
    approvedModes,
    modeScores,
    direction: raw.direction === "SHORT" ? "SHORT" : "LONG",
    horizon: ["SCALP", "INTRADAY", "SWING"].includes(raw.horizon) ? raw.horizon : "INTRADAY",
    timeframe,
    setup: raw.setup ?? "Raw message",
    confidence: Number.isFinite(raw.confidence) ? Number(raw.confidence) : 0.75,
    tradeValidity: ["VALID", "WEAK", "NO-TRADE"].includes(raw.tradeValidity) ? raw.tradeValidity : "WEAK",
    entryWindow: ["OPEN", "NARROW", "CLOSED"].includes(raw.entryWindow) ? raw.entryWindow : "NARROW",
    slippageRisk: ["LOW", "MED", "HIGH"].includes(raw.slippageRisk) ? raw.slippageRisk : "MED",
    triggersToActivate: Array.isArray(raw.triggersToActivate) ? raw.triggersToActivate.slice(0, 2) : ["Missing required execution fields"],
    invalidation: typeof raw.invalidation === "string" ? raw.invalidation.replace(/\n/g, " ").trim() : "Invalidation not provided",
    timestampUtc,
    validUntilBars,
    validUntilUtc,
    entry: {
      low: Number(raw.entry?.low ?? 0),
      high: Number(raw.entry?.high ?? 0),
      raw: String(raw.entry?.raw ?? ""),
      type: raw.entry?.type,
      trigger: raw.entry?.trigger,
    },
    stops: Array.isArray(raw.stops) ? raw.stops : [],
    targets: Array.isArray(raw.targets) ? raw.targets : [],
    marketState: {
      trend: raw.marketState?.trend ?? "N/A",
      htfBias: raw.marketState?.htfBias ?? "N/A",
      volatility: raw.marketState?.volatility ?? "N/A",
      execution: raw.marketState?.execution ?? "N/A",
    },
    flowAnalysis: Array.isArray(raw.flowAnalysis) ? raw.flowAnalysis : [],
    tradeIntent: Array.isArray(raw.tradeIntent) ? raw.tradeIntent : [],
    disclaimer: raw.disclaimer ?? "Always manage your own risk.",
    rawText: raw.rawText ?? "",
    incomplete: true,
    status: normalizedStatus,
    result: normalizedResult,
    hitLevelType: raw.hitLevelType ?? null,
    hitLevelIndex: Number.isFinite(raw.hitLevelIndex) ? Number(raw.hitLevelIndex) : null,
    hitLevelPrice: Number.isFinite(raw.hitLevelPrice) ? Number(raw.hitLevelPrice) : null,
    minutesToEntry: Number.isFinite(raw.minutesToEntry) ? Number(raw.minutesToEntry) : null,
    minutesToExit: Number.isFinite(raw.minutesToExit) ? Number(raw.minutesToExit) : null,
    minutesTotal: Number.isFinite(raw.minutesTotal) ? Number(raw.minutesTotal) : null,
    pricePrecision: Number.isFinite(raw.pricePrecision) ? Number(raw.pricePrecision) : undefined,
  };
};

const hydrate = (): TradePlan[] => {
  if (shouldRunFreshReset()) {
    clearLocalIdeaCache();
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeStoredPlan(item))
      .filter((item): item is TradePlan => Boolean(item));
  } catch {
    return [];
  }
};

interface TradeIdeasStreamState {
  messages: TradePlan[];
  streamError: string | null;
  lastSuccessAt: number | null;
  diagnostics: TradeIdeasDiagnostics;
  setMessages: (updater: (prev: TradePlan[]) => TradePlan[]) => void;
  setStreamError: (value: string | null) => void;
  setLastSuccessAt: (value: number | null) => void;
  setDiagnostics: (updater: (prev: TradeIdeasDiagnostics) => TradeIdeasDiagnostics) => void;
}

const useTradeIdeasStreamStore = create<TradeIdeasStreamState>((set) => ({
  messages: hydrate(),
  streamError: null,
  lastSuccessAt: null,
  diagnostics: makeEmptyDiagnostics(),
  setMessages: (updater) =>
    set((state) => {
      const next = updater(state.messages).slice(0, 500);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 100)));
      } catch {
        // ignore localStorage failures
      }
      return { messages: next };
    }),
  setStreamError: (value) => set({ streamError: value }),
  setLastSuccessAt: (value) => set({ lastSuccessAt: value }),
  setDiagnostics: (updater) =>
    set((state) => ({
      diagnostics: updater(state.diagnostics),
    })),
}));

// Server-side system scan cache for 3 system modes (persists across client loop iterations)
let cachedSystemScanByMode: Record<ScoringMode, ScannedModeRow[]> = {
  FLOW: [],
  AGGRESSIVE: [],
  BALANCED: [],
  CAPITAL_GUARD: [],
};
/* systemScanFetchedAt — timestamp updated below, consumed by staleness checks */
let systemScanTotalsByMode: Record<string, number> = {};
let systemScanHighScoreByMode: Record<string, number> = {};
let systemScanStartedAt = 0;
const SYSTEM_SCAN_REFRESH_MS = 5_000; // re-fetch server cache every 5s for responsive "Updated Xs ago" timer

let subscribers = 0;
let running = false;
let loopTimer: number | null = null;
let syncTimer: number | null = null;
let systemScanTimer: number | null = null;
let syncInFlight = false;
let binanceConnectResetArmed = true;
let scanSymbols = [...FALLBACK_SCAN_SYMBOLS];
const lastScanConfidenceByMode: Record<ScoringMode, Map<string, number>> = {
  FLOW: new Map<string, number>(),
  AGGRESSIVE: new Map<string, number>(),
  BALANCED: new Map<string, number>(),
  CAPITAL_GUARD: new Map<string, number>(),
};
let scanSourceKey = "";
let scanUniverseUpdatedAt = 0;
let symbolCursor = 0;
let symbolCursorBatchAnchorAt = 0;
let scanExchangeHintBySymbol = new Map<string, ReturnType<typeof exchangeHint>>();
let scanPrioritySymbols: string[] = [];
let scanRound = 0;
const symbolCooldownUntilRound = new Map<string, number>();
let latestUniverseStats = {
  activePairs: 0,
  filteredPairs: 0,
  candidates: 0,
  connectorCount: 0,
};
const TELEMETRY_RING_MAX = 200;
const telemetryByModeRing: Record<ScoringMode, TelemetrySample[]> = {
  FLOW: [],
  AGGRESSIVE: [],
  BALANCED: [],
  CAPITAL_GUARD: [],
};

const pushTelemetrySample = (sample: TelemetrySample) => {
  const bucket = telemetryByModeRing[sample.mode];
  bucket.push(sample);
  if (bucket.length > TELEMETRY_RING_MAX) {
    bucket.splice(0, bucket.length - TELEMETRY_RING_MAX);
  }
};

const summarizeTelemetryByMode = (): TelemetryByMode => ({
  FLOW: summarizeTelemetry(telemetryByModeRing.FLOW),
  AGGRESSIVE: summarizeTelemetry(telemetryByModeRing.AGGRESSIVE),
  BALANCED: summarizeTelemetry(telemetryByModeRing.BALANCED),
  CAPITAL_GUARD: summarizeTelemetry(telemetryByModeRing.CAPITAL_GUARD),
});

const readSourceContext = () => {
  const exchange = SCANNER_DEFAULT_EXCHANGE;
  const sourceMode: "exchange" = "exchange";
  const sourceKey = `${sourceMode}:${String(exchange).toUpperCase()}`;
  return {
    sourceMode,
    exchange,
    exchangeHint: exchangeHint(exchange),
    sourceKey,
  };
};

const refreshScanUniverse = async (context: { sourceMode: "exchange" | "fallback"; exchange: string; sourceKey: string }) => {
  const { maxScanCoins, minVolumeUsd } = readScanConfig();
  const universePoolSize = Math.max(maxScanCoins, TOTAL_SCAN_BATCH_SIZE * 8, 200);
  let loadedFromUniverse = false;
  const strictBinanceWsUniverse =
    context.sourceMode === "exchange" &&
    String(context.exchange).toLowerCase().includes("binance");
  const nextExchangeHintBySymbol = new Map<string, ReturnType<typeof exchangeHint>>();
  try {
    const universeQs = new URLSearchParams({
      source: context.sourceMode,
      exchange: context.exchange,
      min_volume_usd: String(minVolumeUsd),
      top: String(universePoolSize),
    });
    const universeRes = await fetch(`/api/market/universe?${universeQs.toString()}`).catch(() => null);
    if (universeRes?.ok) {
      const universeBody = (await universeRes.json()) as UniverseApiResponse;
      const nextPrioritySymbols = (universeBody.ranked_candidates ?? [])
        .filter((row) => row.oi_priority === "OI_INCREASE_TOP5" || row.oi_priority === "OI_DECREASE_TOP5")
        .map((row) => toPairSymbol(row.symbol))
        .filter((symbol): symbol is string => Boolean(symbol))
        .filter((symbol) => isScannablePairSymbol(symbol))
        .slice(0, OI_PRIORITY_HEAD_LIMIT);
      const rankedSymbols = (universeBody.ranked_candidates ?? [])
        .map((row) => {
          const symbol = toPairSymbol(row.symbol);
          if (!symbol) return null;
          // Trade ideas scanner always attempts Binance first, then backend fallback chain applies.
          const hint = exchangeHint(context.exchange);
          nextExchangeHintBySymbol.set(symbol, hint);
          return symbol;
        })
        .filter((symbol): symbol is string => Boolean(symbol))
        .filter((symbol) => isScannablePairSymbol(symbol));
      if (rankedSymbols.length >= 8) {
        scanSymbols = rankedSymbols;
        symbolCursor = symbolCursor % scanSymbols.length;
        symbolCursorBatchAnchorAt = 0;
        scanExchangeHintBySymbol = nextExchangeHintBySymbol;
        const rankedSet = new Set(rankedSymbols);
        scanPrioritySymbols = nextPrioritySymbols.filter((symbol, index, arr) => rankedSet.has(symbol) && arr.indexOf(symbol) === index);
        loadedFromUniverse = true;
      }
      latestUniverseStats = {
        activePairs: Number(universeBody.registry?.active_pairs ?? rankedSymbols.length),
        filteredPairs: Number(universeBody.universe?.filtered_total ?? rankedSymbols.length),
        candidates: Number(universeBody.universe?.candidates_total ?? rankedSymbols.length),
        connectorCount: Array.isArray(universeBody.connectors) ? universeBody.connectors.length : 0,
      };
    }

    if (!loadedFromUniverse && !strictBinanceWsUniverse) {
      const qs = new URLSearchParams({
        source: context.sourceMode,
        exchange: context.exchange,
      });
      const [tickersRes, symbolsRes] = await Promise.allSettled([
        fetch(`/api/market/tickers?${qs.toString()}`),
        fetch(`/api/market/symbols?${qs.toString()}`),
      ]);

      const fromTickers: string[] = [];
      if (tickersRes.status === "fulfilled" && tickersRes.value.ok) {
        const body = (await tickersRes.value.json()) as { items?: Array<{ symbol?: string }> };
        for (const item of body.items ?? []) {
          const pair = toPairSymbol(item.symbol);
          if (pair && isScannablePairSymbol(pair)) fromTickers.push(pair);
        }
      }

      const fromSymbols: string[] = [];
      if (symbolsRes.status === "fulfilled" && symbolsRes.value.ok) {
        const body = (await symbolsRes.value.json()) as { symbols?: string[] };
        for (const symbol of body.symbols ?? []) {
          const pair = toPairSymbol(symbol);
          if (pair && isScannablePairSymbol(pair)) fromSymbols.push(pair);
        }
      }

      const seen = new Set<string>();
      const merged: string[] = [];
      for (const symbol of [...fromTickers, ...fromSymbols, ...FALLBACK_SCAN_SYMBOLS]) {
        if (!isScannablePairSymbol(symbol)) continue;
        if (!seen.has(symbol)) {
          seen.add(symbol);
          merged.push(symbol);
        }
        if (merged.length >= universePoolSize) break;
      }

      if (merged.length >= 8) {
        scanSymbols = merged;
        symbolCursor = symbolCursor % scanSymbols.length;
        symbolCursorBatchAnchorAt = 0;
        const fallbackHint = exchangeHint(context.exchange);
        scanExchangeHintBySymbol = new Map(merged.map((symbol) => [symbol, fallbackHint]));
        scanPrioritySymbols = [];
      }
      latestUniverseStats = {
        activePairs: merged.length,
        filteredPairs: merged.length,
        candidates: merged.length,
        connectorCount: 1,
      };
    } else if (!loadedFromUniverse && strictBinanceWsUniverse && !scanSymbols.length) {
      const seeded = FALLBACK_SCAN_SYMBOLS.filter((symbol) => isScannablePairSymbol(symbol)).slice(0, universePoolSize);
      if (seeded.length) {
        scanSymbols = seeded;
        symbolCursor = symbolCursor % scanSymbols.length;
        symbolCursorBatchAnchorAt = 0;
        const fallbackHint = exchangeHint(context.exchange);
        scanExchangeHintBySymbol = new Map(seeded.map((symbol) => [symbol, fallbackHint]));
        scanPrioritySymbols = [];
        latestUniverseStats = {
          activePairs: seeded.length,
          filteredPairs: seeded.length,
          candidates: seeded.length,
          connectorCount: 1,
        };
      }
    }
  } catch {
    // keep previous universe on temporary failures
  } finally {
    scanSourceKey = context.sourceKey;
    scanUniverseUpdatedAt = Date.now();
  }
};

const isSymbolCoolingDown = (symbol: string, currentRound: number): boolean => {
  const untilRound = symbolCooldownUntilRound.get(symbol);
  return typeof untilRound === "number" && untilRound > currentRound;
};

const markIdeaCreatedAndRequeue = (symbolRaw: string) => {
  const symbol = toPairSymbol(symbolRaw);
  if (!symbol) return;
  if (IDEA_REPEAT_COOLDOWN_ROUNDS > 0) {
    symbolCooldownUntilRound.set(symbol, scanRound + IDEA_REPEAT_COOLDOWN_ROUNDS);
  }
  const index = scanSymbols.indexOf(symbol);
  if (index < 0) return;
  const [picked] = scanSymbols.splice(index, 1);
  scanSymbols.push(picked);
  if (scanSymbols.length) {
    symbolCursor = symbolCursor % scanSymbols.length;
  }
};

const clearLoopTimer = () => {
  if (loopTimer !== null) {
    window.clearTimeout(loopTimer);
    loopTimer = null;
  }
};

const clearSyncTimer = () => {
  if (syncTimer !== null) {
    window.clearInterval(syncTimer);
    syncTimer = null;
  }
};

const clearSystemScanTimer = () => {
  if (systemScanTimer !== null) {
    window.clearInterval(systemScanTimer);
    systemScanTimer = null;
  }
};

const setStreamErrorByAvailability = (fallbackMessage: string) => {
  const hasMessages = useTradeIdeasStreamStore.getState().messages.length > 0;
  useTradeIdeasStreamStore.getState().setStreamError(hasMessages ? null : fallbackMessage);
};

const scheduleNext = (fn: () => void) => {
  clearLoopTimer();
  loopTimer = window.setTimeout(fn, LOOP_BASE_DELAY_MS + Math.round(Math.random() * LOOP_JITTER_MS));
};

const settleWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> => {
  if (!items.length) return [];
  const safeConcurrency = Math.max(1, Math.min(items.length, Math.floor(concurrency)));
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        const value = await worker(items[index], index);
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };

  await Promise.all(Array.from({ length: safeConcurrency }, () => runWorker()));
  return results;
};

type FreshIdeaDecision =
  | { ok: true; stage: DecisionStage; reasons: string[] }
  | { ok: false; reason: keyof RejectCounts; stage: DecisionStage; reasons: string[] };

const evaluateFreshIdea = (
  plan: TradePlan,
  scorePct: number,
  minScorePct: number,
  modeDecision: string,
  hardReasons: string[],
  gateReasons: string[],
): FreshIdeaDecision => {
  if (plan.incomplete) return { ok: false, reason: "incomplete", stage: "BLOCKED", reasons: ["INCOMPLETE_DATA"] };
  // Keep NO_TRADE / gated ideas visible in list. They are annotated by stage+reason, not hard-eliminated.
  let stage: DecisionStage = "PASS";
  let reasons: string[] = [];
  if (hardReasons.length > 0) {
    stage = "BLOCKED";
    reasons = hardReasons;
  } else if (gateReasons.length > 0 || plan.entryWindow === "CLOSED" || plan.tradeValidity === "NO-TRADE" || modeDecision === "NO_TRADE") {
    stage = "GATED";
    reasons = gateReasons.length > 0 ? gateReasons : (plan.entryWindow === "CLOSED" ? ["ENTRY_WINDOW_BLOCK"] : ["VALIDITY_BLOCK"]);
  }
  if (!Number.isFinite(scorePct) || scorePct < minScorePct) {
    return { ok: true, stage: "FILTERED", reasons: ["NO_TRADE_LOW_CONF"] };
  }
  return { ok: true, stage, reasons };
};

const refreshTrackedIdeas = async () => {
  // Fetch both user ideas and system-scanner ideas
  const [userRes, systemRes] = await Promise.all([
    fetch("/api/trade-ideas?limit=500", { headers: { "x-user-id": USER_ID } }),
    fetch("/api/trade-ideas?limit=500", { headers: { "x-user-id": "system-scanner" } }),
  ]);
  const userItems: ApiTradeIdea[] = [];
  const systemItems: ApiTradeIdea[] = [];
  if (userRes.ok) {
    const body = (await userRes.json()) as { ok?: boolean; items?: ApiTradeIdea[] };
    if (Array.isArray(body.items)) userItems.push(...body.items);
  }
  if (systemRes.ok) {
    const body = (await systemRes.json()) as { ok?: boolean; items?: ApiTradeIdea[] };
    if (Array.isArray(body.items)) systemItems.push(...body.items);
  }
  // Merge and deduplicate (prefer user ideas when same symbol+mode)
  const seenKeys = new Set<string>();
  const merged: ApiTradeIdea[] = [];
  for (const idea of userItems) {
    const key = `${idea.symbol}:${idea.scoring_mode}:${idea.status}`;
    seenKeys.add(key);
    merged.push(idea);
  }
  for (const idea of systemItems) {
    const key = `${idea.symbol}:${idea.scoring_mode}:${idea.status}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      merged.push(idea);
    }
  }
  // Sort by created_at descending
  merged.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  let plans = merged.map((idea) => toTradePlanFromApi(idea));

  // SINGLE SOURCE OF TRUTH: always patch trade plan scores to match the cached scan row scores.
  // Without this, the 2-second sync timer would overwrite the patch applied by fetchSystemScanCache.
  if (cachedSystemScanByMode) {
    const scanLookup = new Map<string, number>();
    for (const mode of (["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"] as ScoringMode[])) {
      for (const row of cachedSystemScanByMode[mode]) {
        scanLookup.set(`${row.symbol}:${mode}`, row.confidencePct);
      }
    }
    if (scanLookup.size > 0) {
      plans = plans.map((plan) => {
        const key = `${plan.symbol}:${plan.scoringMode}`;
        const scanPct = scanLookup.get(key);
        if (scanPct !== undefined) {
          const scanRatio = scanPct / 100;
          return { ...plan, confidence: scanRatio, modeScores: { ...plan.modeScores, [plan.scoringMode as ScoringMode]: scanRatio } };
        }
        return plan;
      });
    }
  }

  useTradeIdeasStreamStore.getState().setMessages(() => plans);
};

const syncTrackedIdeas = async () => {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    await refreshTrackedIdeas();
  } catch {
    // keep existing list if sync fails temporarily
  } finally {
    syncInFlight = false;
  }
};

const resetTradeIdeasOnce = async () => {
  if (!shouldRunFreshReset()) return;
  clearLocalIdeaCache();
  useTradeIdeasStreamStore.getState().setMessages(() => []);
  try {
    const res = await fetch("/api/trade-ideas", {
      method: "DELETE",
      headers: { "x-user-id": USER_ID },
    });
    if (res.ok || res.status === 404) {
      markFreshResetDone();
    }
  } catch {
    // retry on next mount until reset succeeds
  }
};

const resetTradeIdeasForFreshBinanceSession = async () => {
  clearLocalIdeaCache();
  // Don't clear messages — keep system-scanner ideas visible while syncing
  useTradeIdeasStreamStore.getState().setStreamError(null);
  try {
    await fetch("/api/trade-ideas", {
      method: "DELETE",
      headers: { "x-user-id": USER_ID },
    });
  } catch {
    // retry happens on next arm
  }
  await refreshScanUniverse(readSourceContext());
  // Immediately sync to restore system-scanner ideas + remove stale user ideas
  await syncTrackedIdeas();
};

const createTrackedIdea = async (
  plan: TradePlan,
  scoringMode: ScoringMode,
  modeMeta?: { approved_modes?: ScoringMode[]; mode_scores?: Partial<Record<ScoringMode, number>> },
) => {
  const approvedModes = Array.isArray(modeMeta?.approved_modes) && modeMeta?.approved_modes.length
    ? modeMeta.approved_modes.map((mode) => normalizeScoringMode(mode))
    : (plan.approvedModes?.length ? plan.approvedModes.map((mode) => normalizeScoringMode(mode)) : [scoringMode]);
  const normalizedModeScores = modeMeta?.mode_scores && typeof modeMeta.mode_scores === "object"
    ? Object.fromEntries(
      Object.entries(modeMeta.mode_scores)
        .map(([mode, value]) => [normalizeScoringMode(mode), normalizeModeScoreRatio(value)] as const)
        .filter(([, value]) => value !== null)
        .map(([mode, value]) => [mode, value as number]),
    ) as Partial<Record<ScoringMode, number>>
    : plan.modeScores;
  // Use mode-specific score for confidence when available (avoids mismatch between
  // text-parsed general confidence and mode consensus score)
  const modeSpecificScore = normalizedModeScores?.[scoringMode];
  const effectiveConfidence = typeof modeSpecificScore === "number" && Number.isFinite(modeSpecificScore)
    ? modeSpecificScore
    : plan.confidence;
  const payload = {
    symbol: plan.symbol,
    direction: plan.direction,
    confidence: effectiveConfidence,
    scoring_mode: scoringMode,
    approved_modes: approvedModes,
    mode_scores: normalizedModeScores,
    entry_low: plan.entry.low,
    entry_high: plan.entry.high,
    sl_levels: plan.stops.map((stop) => stop.price),
    tp_levels: plan.targets.map((target) => target.price),
    horizon: plan.horizon,
    timeframe: plan.timeframe,
    setup: plan.setup,
    trade_validity: plan.tradeValidity,
    entry_window: plan.entryWindow,
    slippage_risk: plan.slippageRisk,
    triggers_to_activate: plan.triggersToActivate,
    invalidation: plan.invalidation,
    timestamp_utc: plan.timestampUtc,
    valid_until_bars: plan.validUntilBars,
    valid_until_utc: plan.validUntilUtc,
    market_state: plan.marketState,
    flow_analysis: plan.flowAnalysis,
    trade_intent: plan.tradeIntent,
    raw_text: plan.rawText,
    incomplete: plan.incomplete ?? false,
  };

  const res = await fetch("/api/trade-ideas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": USER_ID,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 409) {
    const body = (await res.json()) as { reason?: string; error?: string };
    if (body.reason === "SYMBOL_LOCKED") return { locked: true };
    throw new Error(body.error || body.reason || "HTTP_409");
  }
  if (!res.ok) {
    let errorMessage = `HTTP_${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; reason?: string };
      if (body.error) errorMessage = body.error;
      else if (body.reason) errorMessage = body.reason;
    } catch {
      // ignore body parse errors
    }
    throw new Error(errorMessage);
  }
  return { locked: false };
};

const runLoop = async () => {
  if (!running) return;
  const horizon = IDEA_HORIZON;
  const timeframe = IDEA_TIMEFRAME;
  const sourceContext = readSourceContext();
  // Trade Ideas scanner always runs against backend exchange mode.
  // Backend itself applies system default + dynamic fallback chain from admin config.
  const sourceMode: "exchange" = "exchange";
  const sourceKey = `${sourceMode}:${String(sourceContext.exchange).toUpperCase()}`;
  if (
    !scanSymbols.length ||
    scanSourceKey !== sourceKey ||
    Date.now() - scanUniverseUpdatedAt > UNIVERSE_REFRESH_MS
  ) {
    await refreshScanUniverse({
      sourceMode,
      exchange: sourceContext.exchange,
      sourceKey,
    });
  }
  const universe = scanSymbols.length ? scanSymbols : FALLBACK_SCAN_SYMBOLS;
  const currentUniverseSet = new Set(universe);
  scanRound += 1;
  const currentRound = scanRound;
  for (const symbol of [...symbolCooldownUntilRound.keys()]) {
    const untilRound = symbolCooldownUntilRound.get(symbol);
    if (!currentUniverseSet.has(symbol) || !Number.isFinite(untilRound) || Number(untilRound) <= currentRound) {
      symbolCooldownUntilRound.delete(symbol);
    }
  }
  scanPrioritySymbols = scanPrioritySymbols.filter((symbol) => currentUniverseSet.has(symbol));
  for (const mode of SCAN_MODES) {
    for (const symbol of [...lastScanConfidenceByMode[mode].keys()]) {
      if (!currentUniverseSet.has(symbol)) lastScanConfidenceByMode[mode].delete(symbol);
    }
  }
  const { maxScanCoins, scanBatchSize } = readScanConfig();
  const perModeBatch = Math.max(1, scanBatchSize);
  const totalBatch = perModeBatch * SCAN_MODES.length;
  const nowMs = Date.now();
  if (!symbolCursorBatchAnchorAt || !Number.isFinite(symbolCursorBatchAnchorAt)) {
    symbolCursorBatchAnchorAt = nowMs;
  } else if (nowMs - symbolCursorBatchAnchorAt >= ROTATION_WINDOW_MS) {
    symbolCursorBatchAnchorAt = nowMs;
  }

  const symbolsByMode = Object.fromEntries(
    SCAN_MODES.map((mode) => [mode, [] as string[]]),
  ) as Record<ScoringMode, string[]>;
  const usedSymbols = new Set<string>();
  const takeNextUniverseSymbol = (): string | null => {
    if (!universe.length) return null;
    const maxAttempts = Math.max(universe.length * 2, totalBatch * 3);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const next = universe[symbolCursor % universe.length];
      symbolCursor = (symbolCursor + 1) % universe.length;
      if (!next) continue;
      if (usedSymbols.has(next)) continue;
      if (!currentUniverseSet.has(next)) continue;
      if (isSymbolCoolingDown(next, currentRound)) continue;
      usedSymbols.add(next);
      return next;
    }
    return null;
  };

  const priorityPool = scanPrioritySymbols
    .filter((symbol, index, arr) => arr.indexOf(symbol) === index)
    .filter((symbol) => !isSymbolCoolingDown(symbol, currentRound))
    .slice(0, OI_PRIORITY_HEAD_LIMIT);
  let modePointer = 0;
  for (const symbol of priorityPool) {
    if (usedSymbols.has(symbol)) continue;
    for (let hop = 0; hop < SCAN_MODES.length; hop += 1) {
      const mode = SCAN_MODES[(modePointer + hop) % SCAN_MODES.length];
      if (symbolsByMode[mode].length >= perModeBatch) continue;
      symbolsByMode[mode].push(symbol);
      usedSymbols.add(symbol);
      modePointer = (modePointer + hop + 1) % SCAN_MODES.length;
      break;
    }
  }

  for (const mode of SCAN_MODES) {
    while (symbolsByMode[mode].length < perModeBatch) {
      const next = takeNextUniverseSymbol();
      if (!next) break;
      symbolsByMode[mode].push(next);
    }
  }

  let hasUsableBatchData = false;
  const sourceUsedCounts: Record<"EXCHANGE" | "FALLBACK_API", number> = {
    EXCHANGE: 0,
    FALLBACK_API: 0,
  };
  const sourceDetailCounts = new Map<string, number>();
  const sourceExchangeCounts = new Map<string, number>();
  const bumpCount = (target: Map<string, number>, raw: unknown) => {
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!key) return;
    target.set(key, (target.get(key) ?? 0) + 1);
  };
  const pickDominant = (target: Map<string, number>): string | null => {
    let winner: string | null = null;
    let winnerCount = -1;
    for (const [key, count] of target.entries()) {
      if (count > winnerCount) {
        winner = key;
        winnerCount = count;
      }
    }
    return winner;
  };
  const loopDiagnostics: TradeIdeasDiagnostics = {
    lastLoopAt: nowMs,
    sourceMode,
    sourceKey,
    universeActivePairs: latestUniverseStats.activePairs,
    universeFilteredPairs: latestUniverseStats.filteredPairs,
    universeCandidates: latestUniverseStats.candidates,
    universeConnectorCount: latestUniverseStats.connectorCount,
    universeSize: universe.length,
    maxScanCoins,
    scanBatchSize: perModeBatch,
    scanned: 0,
    responsesOk: 0,
    parsed: 0,
    parseFailed: 0,
    created: 0,
    locked: 0,
    createErrors: 0,
    fetchErrors: 0,
    fallbackUsed: 0,
    lastSourceUsed: null,
    lastSourceDetail: null,
    lastSourceExchange: null,
    rejected: makeEmptyRejectCounts(),
    telemetryByMode: summarizeTelemetryByMode(),
    lastScannedByMode: Object.fromEntries(
      SCAN_MODES.map((mode) => [
        mode,
        symbolsByMode[mode].map((symbol) => ({
          symbol,
          confidencePct: 0,
          confidencePass: false,
          passed: false,
          created: false,
          reason: "NO_DATA",
        })),
      ]),
    ) as LastScannedByMode,
  };

  try {
    const scanDescriptors = SCAN_MODES.flatMap((mode) =>
      symbolsByMode[mode].map((symbol, rowIndex) => ({
        mode,
        symbol,
        rowIndex,
        exchangeHint: scanExchangeHintBySymbol.get(symbol) ?? sourceContext.exchangeHint,
      })),
    );
    loopDiagnostics.scanned = scanDescriptors.length;
    const responses = await settleWithConcurrency(scanDescriptors, 4, async (descriptor) => {
      return await FallbackApiAdapter.fetchTradeIdea({
        symbol: descriptor.symbol,
        timeframe,
        horizon,
        exchangeHint: descriptor.exchangeHint,
        sourceMode,
        scoringMode: descriptor.mode,
        // Do not hard-pin strict exchange here: Binance should be primary,
        // but backend must fail over to other live exchanges (e.g. Gate.io)
        // to keep live flow running.
        strict: false,
        timeoutMs: 40_000,
      });
    });

    for (let index = 0; index < responses.length; index += 1) {
      const descriptor = scanDescriptors[index];
      if (!descriptor) continue;
      const { mode, symbol, rowIndex } = descriptor;
      const outcome = responses[index];
      const row = loopDiagnostics.lastScannedByMode[mode][rowIndex];
      if (outcome.status !== "fulfilled") {
        loopDiagnostics.fetchErrors += 1;
        if (row) {
          const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason ?? "");
          if (message.toUpperCase().includes("INVALID")) row.reason = "FETCH_ERROR:BAD_SYMBOL";
          else if (message.toUpperCase().includes("ABORT") || message.toUpperCase().includes("TIMEOUT")) row.reason = "FETCH_ERROR:TIMEOUT";
          else if (message.toUpperCase().includes("UNAVAILABLE")) row.reason = "FETCH_ERROR:NO_SOURCE";
          else row.reason = "FETCH_ERROR";
        }
        continue;
      }
      const response = outcome.value;
      const modeScoreRatio = normalizeModeScoreRatio(response.mode_scores?.[mode]);
      if (modeScoreRatio !== null) {
        lastScanConfidenceByMode[mode].set(symbol, Math.max(0, Math.min(100, Math.round(modeScoreRatio * 100))));
      }
      const minConfidencePct = effectiveMinScorePctForMode(mode);
      if (row) {
        const remembered = lastScanConfidenceByMode[mode].get(symbol);
        const parsedPct = Number.isFinite(remembered) ? Number(remembered) : 0;
        row.confidencePct = parsedPct;
        row.confidencePass = parsedPct >= minConfidencePct;
        row.passed = false;
        row.reason = row.confidencePass ? "WAIT_PARSE" : "NO_TRADE_LOW_CONF";
      }
      if (response.ok && response.text) {
        loopDiagnostics.responsesOk += 1;
        const normalizedSource = response.sourceUsed === "FALLBACK_API" ? "FALLBACK_API" : "EXCHANGE";
        sourceUsedCounts[normalizedSource] += 1;
        bumpCount(sourceDetailCounts, response.sourceDetail);
        bumpCount(sourceExchangeCounts, response.exchangeUsed);
        if (normalizedSource === "FALLBACK_API") {
          loopDiagnostics.fallbackUsed += 1;
        }
        useTradeIdeasStreamStore.getState().setLastSuccessAt(Date.now());
      }
      const parsed = response.text ? parseTradePlan(response.text) : null;
      if (!parsed) {
        loopDiagnostics.parseFailed += 1;
        if (row) row.reason = "PARSE_ERROR";
        continue;
      }
      hasUsableBatchData = true;
      loopDiagnostics.parsed += 1;
      if (normalizeModeScoreRatio(response.mode_scores?.[mode]) === null) {
        lastScanConfidenceByMode[mode].set(symbol, Math.max(0, Math.min(100, Math.round(parsed.confidence * 100))));
      }
      if (row) {
        const remembered = lastScanConfidenceByMode[mode].get(symbol);
        const parsedPct = Number.isFinite(remembered) ? Number(remembered) : Math.max(0, Math.min(100, Math.round(parsed.confidence * 100)));
        row.confidencePct = parsedPct;
        row.confidencePass = parsedPct >= minConfidencePct;
        row.reason = row.confidencePass ? "WAIT_RULES" : "NO_TRADE_LOW_CONF";
      }
      const scorePctForDecision =
        row?.confidencePct ??
        Math.max(0, Math.min(100, Math.round(parsed.confidence * 100)));
      const breakdown = response.mode_breakdown?.[mode] as {
        raw?: number;
        base?: number;
        final?: number;
        penaltyRate?: number;
        riskAdj?: number;
        gatingFlags?: string[];
        decision?: string;
      } | undefined;
      const trace = response.decision_trace?.by_mode?.[mode];
      const rawScore01 = Math.max(0, Math.min(1, Number(breakdown?.raw ?? 0) / 100));
      const baseScore01 = Math.max(0, Math.min(1.2, Number(breakdown?.base ?? 0) / 100));
      const finalScore01 = modeScoreRatio ?? Math.max(0, Math.min(1, Number(breakdown?.final ?? scorePctForDecision) / 100));
      const tradeability = Number.isFinite(Number(trace?.tradeability))
        ? Math.max(0, Math.min(1.2, Number(trace?.tradeability)))
        : (rawScore01 > 0 ? Math.max(0, Math.min(1.2, baseScore01 / rawScore01)) : 1);
      const reliability = Number.isFinite(Number(trace?.reliability))
        ? Math.max(0, Math.min(1.2, Number(trace?.reliability)))
        : (Number.isFinite(Number(breakdown?.riskAdj))
          ? Math.max(0, Math.min(1.2, Number(breakdown?.riskAdj)))
          : 1);
      const penaltyFactor = Number.isFinite(Number(trace?.penaltyFactor))
        ? Math.max(0, Math.min(1, Number(trace?.penaltyFactor)))
        : Math.max(0, Math.min(1, 1 - Number(breakdown?.penaltyRate ?? 0)));
      const capMultiplier = Number.isFinite(Number(trace?.capMultiplier))
        ? Math.max(0, Math.min(1.2, Number(trace?.capMultiplier)))
        : (baseScore01 > 0 ? Math.max(0, Math.min(1.2, finalScore01 / baseScore01)) : 1);
      const reducers: Array<{ key: TelemetrySample["dominantReducer"]; value: number }> = [
        { key: "tradeability", value: tradeability },
        { key: "reliability", value: reliability },
        { key: "penalty", value: penaltyFactor },
        { key: "cap", value: capMultiplier },
      ];
      reducers.sort((a, b) => a.value - b.value);
      const dominantReducer = reducers[0]?.key ?? "tradeability";
      const gatingFlags = Array.isArray(breakdown?.gatingFlags)
        ? breakdown.gatingFlags.map((flag) => String(flag).trim()).filter(Boolean)
        : [];
      const hardReasons: string[] = (Array.isArray(trace?.reasons) ? trace.reasons : gatingFlags)
        .filter((flag) => flag === "DATA_BLOCK" || flag === "SAFETY_BLOCK");
      const gateReasons: string[] = (Array.isArray(trace?.reasons) ? trace.reasons : gatingFlags)
        .filter((flag) => !hardReasons.includes(flag));
      const decisionWithThreshold = evaluateFreshIdea(
        parsed,
        scorePctForDecision,
        minConfidencePct,
        String(breakdown?.decision ?? ""),
        hardReasons,
        gateReasons,
      );
      pushTelemetrySample({
        ts: nowMs,
        mode,
        status: decisionWithThreshold.stage,
        confidence01: Math.max(0, Math.min(1, scorePctForDecision / 100)),
        finalScore01,
        coreAlpha01: rawScore01,
        tradeability,
        reliability,
        penaltyFactor,
        capMultiplier,
        dominantReducer,
        gateReasons,
        hardReasons,
        source: response.exchangeUsed ?? response.sourceUsed ?? sourceKey,
      });
      if (!decisionWithThreshold.ok) {
        loopDiagnostics.rejected[decisionWithThreshold.reason] += 1;
        if (row) {
          const primaryReason = decisionWithThreshold.reasons[0] ?? rejectReasonLabel[decisionWithThreshold.reason];
          row.reason = `${decisionWithThreshold.stage}:${primaryReason}`;
        }
        continue;
      }
      if (row) {
        row.passed = true;
        if (decisionWithThreshold.stage === "PASS") row.reason = "ELIGIBLE";
        else row.reason = `${decisionWithThreshold.stage}:${decisionWithThreshold.reasons[0] ?? "REVIEW"}`;
      }
      try {
        const created = await createTrackedIdea(parsed, mode, {
          approved_modes: response.approved_modes,
          mode_scores: response.mode_scores,
        });
        if (created.locked) {
          loopDiagnostics.locked += 1;
          if (row) row.reason = "LOCKED_OPEN_IDEA";
        } else {
          loopDiagnostics.created += 1;
          markIdeaCreatedAndRequeue(symbol);
          if (row) {
            row.created = true;
            row.reason = "IDEA_CREATED";
          }
        }
      } catch (err) {
        loopDiagnostics.createErrors += 1;
        if (row) {
          const errorText = err instanceof Error ? err.message : "CREATE_ERROR";
          row.reason = errorText === "CREATE_ERROR" ? errorText : `CREATE_ERROR:${errorText}`;
        }
      }
    }
    const totalSourceHits = sourceUsedCounts.EXCHANGE + sourceUsedCounts.FALLBACK_API;
    if (totalSourceHits > 0) {
      loopDiagnostics.lastSourceUsed =
        sourceUsedCounts.FALLBACK_API > sourceUsedCounts.EXCHANGE ? "FALLBACK_API" : "EXCHANGE";
      loopDiagnostics.lastSourceDetail = pickDominant(sourceDetailCounts);
      loopDiagnostics.lastSourceExchange = pickDominant(sourceExchangeCounts);
    }
    await refreshTrackedIdeas();
    if (hasUsableBatchData) {
      useTradeIdeasStreamStore.getState().setLastSuccessAt(Date.now());
      useTradeIdeasStreamStore.getState().setStreamError(null);
    } else {
      setStreamErrorByAvailability("Live trade idea data is unavailable.");
    }
  } catch {
    try {
      await refreshTrackedIdeas();
      setStreamErrorByAvailability("Live trade idea data is unavailable.");
    } catch {
      setStreamErrorByAvailability("Live trade idea data is unavailable.");
      // ignore sync failures when stream is down
    }
  } finally {
    loopDiagnostics.telemetryByMode = summarizeTelemetryByMode();

    // Preserve lastScannedByMode from fetchSystemScanCache — it is the single source of truth.
    // The client loop must NOT overwrite it to avoid race conditions where stale
    // cachedSystemScanByMode data replaces fresh server scan results.
    // Preserve the server scan timestamp for "Updated Xs ago" display.
    // Without this, the client loop overwrites lastLoopAt and the timer jumps to 30s+.
    const prevDiags = useTradeIdeasStreamStore.getState().diagnostics;
    if (prevDiags.lastLoopAt && prevDiags.lastLoopAt > 0) {
      loopDiagnostics.lastLoopAt = prevDiags.lastLoopAt;
    }
    // Also preserve universe stats from server scan cache
    if (prevDiags.universeFilteredPairs > loopDiagnostics.universeFilteredPairs) {
      loopDiagnostics.universeFilteredPairs = prevDiags.universeFilteredPairs;
    }
    if (prevDiags.universeSize > loopDiagnostics.universeSize) {
      loopDiagnostics.universeSize = prevDiags.universeSize;
    }

    // Merge: update client-loop fields but preserve server-managed lastScannedByMode
    useTradeIdeasStreamStore.getState().setDiagnostics((prev) => ({
      ...loopDiagnostics,
      lastScannedByMode: prev.lastScannedByMode,
    }));

    if (running) scheduleNext(() => void runLoop());
  }
};

const fetchSystemScanCache = async () => {
  try {
    const res = await fetch("/api/trade-ideas/system-scan");
    if (!res.ok) return;
    const body = (await res.json()) as {
      ok?: boolean;
      results?: Array<{
        symbol: string;
        mode: string;
        scorePct: number;
        decision: string;
        direction: string;
        tradeValidity: string;
        entryWindow: string;
        slippageRisk: string;
        setup: string;
        scannedAt: number;
        entryLow: number;
        entryHigh: number;
        slLevels: number[];
        tpLevels: number[];
        horizon: string;
        timeframe: string;
        modeScores: Record<string, number>;
        pricePrecision?: number;
      }>;
      lastScanAt?: number;
      universeSize?: number;
      scanRound?: number;
      startedAt?: number;
      totalScansByMode?: Record<string, number>;
      highScoreByMode?: Record<string, number>;
    };
    if (!body.ok || !Array.isArray(body.results) || !body.results.length) return;

    // Group results by mode and transform to ScannedModeRow format
    const byMode: Record<ScoringMode, ScannedModeRow[]> = {
      FLOW: [],
      AGGRESSIVE: [],
      BALANCED: [],
      CAPITAL_GUARD: [],
    };

    for (const r of body.results) {
      const mode = normalizeScoringMode(r.mode);
      const minPct = effectiveMinScorePctForMode(mode);
      const passed = r.scorePct >= minPct;
      const created = r.scorePct >= TRADE_IDEA_MIN_SCORE_PCT && r.decision !== "NO_TRADE" && r.tradeValidity !== "NO-TRADE";
      const reason = created
        ? (r.scorePct >= 70 ? "PASS" : "PASS_LOW")
        : (r.scorePct < TRADE_IDEA_MIN_SCORE_PCT ? "NO_TRADE_LOW_CONF" : r.decision === "NO_TRADE" ? "NO_TRADE" : "GATED");
      byMode[mode].push({
        symbol: r.symbol,
        confidencePct: r.scorePct,
        confidencePass: passed,
        passed,
        created,
        reason,
        direction: r.direction ?? "LONG",
        decision: r.decision ?? "NO_TRADE",
        entryLow: r.entryLow ?? 0,
        entryHigh: r.entryHigh ?? 0,
        slLevels: Array.isArray(r.slLevels) ? r.slLevels : [],
        tpLevels: Array.isArray(r.tpLevels) ? r.tpLevels : [],
        horizon: r.horizon ?? "INTRADAY",
        timeframe: r.timeframe ?? "15m",
        setup: r.setup ?? "",
        tradeValidity: r.tradeValidity ?? "NO-TRADE",
        entryWindow: r.entryWindow ?? "CLOSED",
        slippageRisk: r.slippageRisk ?? "HIGH",
        modeScores: r.modeScores ?? {},
        scannedAt: r.scannedAt ?? Date.now(),
        pricePrecision: r.pricePrecision,
      });
    }

    // Sort each mode by confidence descending
    for (const mode of ["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"] as ScoringMode[]) {
      byMode[mode].sort((a, b) => b.confidencePct - a.confidencePct);
    }

    // Persist in module-level cache so runLoop doesn't overwrite them
    cachedSystemScanByMode = byMode;
    /* systemScanFetchedAt updated */
    if (body.totalScansByMode) systemScanTotalsByMode = body.totalScansByMode;
    if (body.highScoreByMode) systemScanHighScoreByMode = body.highScoreByMode;
    if (body.startedAt) systemScanStartedAt = body.startedAt;

    // Update diagnostics with cached system scan results (top 10 per mode)
    useTradeIdeasStreamStore.getState().setDiagnostics((prev) => ({
      ...prev,
      lastScannedByMode: {
        FLOW: byMode.FLOW.slice(0, 10),
        AGGRESSIVE: byMode.AGGRESSIVE.slice(0, 10),
        BALANCED: byMode.BALANCED.slice(0, 10),
        CAPITAL_GUARD: byMode.CAPITAL_GUARD.slice(0, 10),
      },
      lastLoopAt: body.lastScanAt ?? prev.lastLoopAt,
      universeSize: body.universeSize ?? prev.universeSize,
      universeFilteredPairs: body.universeSize ?? prev.universeFilteredPairs,
    }));

    // Mark stream as having recent data
    if (body.lastScanAt && body.lastScanAt > 0) {
      useTradeIdeasStreamStore.getState().setLastSuccessAt(body.lastScanAt);
      useTradeIdeasStreamStore.getState().setStreamError(null);
    }

    // Immediately sync trade ideas so cards update at the same time as scan rows
    // Server-side syncExistingIdeaScores already updated the stored ideas — fetch them now
    await syncTrackedIdeas();

    // SINGLE SOURCE OF TRUTH: patch trade plan scores to match scan row scores.
    // This guarantees the scan row chip and the trade card always show the exact same %.
    // Without this, small timing gaps between cache and tradeIdeaStore cause visual mismatches.
    const scanScoreLookup = new Map<string, number>(); // "SYMBOL:MODE" → scorePct (0..100)
    for (const mode of (["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"] as ScoringMode[])) {
      for (const row of byMode[mode]) {
        scanScoreLookup.set(`${row.symbol}:${mode}`, row.confidencePct);
      }
    }
    if (scanScoreLookup.size > 0) {
      const currentPlans = useTradeIdeasStreamStore.getState().messages;
      let patched = false;
      const patchedPlans = currentPlans.map((plan) => {
        const key = `${plan.symbol}:${plan.scoringMode}`;
        const scanPct = scanScoreLookup.get(key);
        if (scanPct !== undefined) {
          const scanRatio = scanPct / 100;
          const currentRatio = plan.modeScores?.[plan.scoringMode as ScoringMode];
          // Only patch if different (avoid unnecessary re-renders)
          if (typeof currentRatio !== "number" || Math.abs(currentRatio - scanRatio) > 0.001) {
            patched = true;
            return {
              ...plan,
              confidence: scanRatio,
              modeScores: { ...plan.modeScores, [plan.scoringMode as string]: scanRatio },
            };
          }
        }
        return plan;
      });
      if (patched) {
        useTradeIdeasStreamStore.getState().setMessages(() => patchedPlans);
      }
    }
  } catch {
    // ignore — system scan cache is a best-effort optimization
  }
};

const startStream = () => {
  if (running) return;
  running = true;
  MarketDataRouter.mount();
  const { scanBatchSize } = readScanConfig();
  const watchCount = Math.max(6, Math.min(12, scanBatchSize));
  const watchSymbols = scanSymbols.slice(0, watchCount);
  watchSymbols.forEach((symbol) => MarketDataRouter.subscribe(symbol, "15m", 240));
  void refreshScanUniverse(readSourceContext());
  // Immediately fetch server-side system scan cache for instant results
  void fetchSystemScanCache();
  // Independent timer: re-fetch system scan cache every 15s regardless of client loop state
  clearSystemScanTimer();
  systemScanTimer = window.setInterval(() => {
    void fetchSystemScanCache();
  }, SYSTEM_SCAN_REFRESH_MS);
  void (async () => {
    await resetTradeIdeasOnce();
    if (!running) return;
    await syncTrackedIdeas().catch(() => {
      // ignore bootstrap sync failures
    });
    if (!running) return;
    clearSyncTimer();
    syncTimer = window.setInterval(() => {
      void syncTrackedIdeas();
    }, 2000);
    clearLoopTimer();
    loopTimer = window.setTimeout(() => void runLoop(), 1200);
  })();
};

const stopStream = () => {
  if (!running) return;
  running = false;
  clearLoopTimer();
  clearSyncTimer();
  clearSystemScanTimer();
  const { scanBatchSize } = readScanConfig();
  const watchCount = Math.max(6, Math.min(12, scanBatchSize));
  const watchSymbols = scanSymbols.slice(0, watchCount);
  watchSymbols.forEach((symbol) => MarketDataRouter.unsubscribe(symbol, "15m"));
  MarketDataRouter.unmount();
};

/** Get cumulative scan counts per mode from the server scanner */
export const getSystemScanTotals = () => ({
  totalScansByMode: systemScanTotalsByMode,
  highScoreByMode: systemScanHighScoreByMode,
  startedAt: systemScanStartedAt,
});

export const useTradeIdeasStream = (_minConfidence: number, _exchange?: string) => {
  const connectionStatus = useExchangeTerminalStore((state) => state.connectionStatus);
  const messagesRaw = useTradeIdeasStreamStore((state) => state.messages);
  const streamError = useTradeIdeasStreamStore((state) => state.streamError);
  const lastSuccessAt = useTradeIdeasStreamStore((state) => state.lastSuccessAt);
  const diagnostics = useTradeIdeasStreamStore((state) => state.diagnostics);

  useEffect(() => {
    const normalized = String(_exchange ?? "").toLowerCase();
    const isBinance = normalized.includes("binance");
    const isConnected = connectionStatus === "CONNECTED";
    if (!isBinance || !isConnected) {
      binanceConnectResetArmed = true;
      return;
    }
    if (!binanceConnectResetArmed) return;
    binanceConnectResetArmed = false;
    void resetTradeIdeasForFreshBinanceSession();
  }, [_exchange, connectionStatus]);

  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) startStream();
    return () => {
      subscribers = Math.max(0, subscribers - 1);
      if (subscribers === 0) stopStream();
    };
  }, []);

  const messages = useMemo(() => messagesRaw, [messagesRaw]);

  return useMemo(
    () => ({
      messages,
      streamError,
      lastSuccessAt,
      diagnostics,
    }),
    [messages, streamError, lastSuccessAt, diagnostics],
  );
};
