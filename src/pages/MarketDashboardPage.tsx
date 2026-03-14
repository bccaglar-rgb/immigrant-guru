import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AiPanel } from "../components/AiPanel";
import { ChartPanel } from "../components/ChartPanel";
import { ConsensusInputsPanel } from "../components/ConsensusInputsPanel";
import { DataHealth } from "../components/DataHealth";
import { DashboardHeader } from "../components/DashboardHeader";
import { FeedToggles } from "../components/FeedToggles";
import { FlowModeSettingsPanel, type FlowModeSettings } from "../components/FlowModeSettingsPanel";
import { IndicatorsPanel } from "../components/IndicatorsPanel";
import { RiskChecksPanel } from "../components/RiskChecksPanel";
import { TileGrid } from "../components/TileGrid";
import { normalizeDashboardState } from "../data/CoherenceEngine";
import { useDataSourceManager } from "../data/DataSourceManager";
import { useIndicatorsStore } from "../hooks/useIndicatorsStore";
import { useMarketDashboardSource } from "../hooks/useMarketDashboardSource";
import { useMarketDashboard } from "../hooks/useMarketDashboard";
import { useMarketDataStatus } from "../hooks/useMarketData";
import { useExchangeTerminalStore } from "../hooks/useExchangeTerminalStore";
import { useAdminConfig } from "../hooks/useAdminConfig";
import { useTradeIdeasStream } from "../hooks/useTradeIdeasStream";
import { useExchangeConfigs } from "../hooks/useExchangeConfigs";
import { useUserSettings } from "../hooks/useUserSettings";
import { FLOW_SIGNAL_DEFAULT_WEIGHTS } from "../data/quantLayers";
import type {
  Coin,
  ConsensusInputConfig,
  ConsensusInputKey,
  FeedConfig,
  FeedKey,
  FlowSignalInputsConfig,
  FlowSignalWeightsConfig,
  RiskChecksInputsConfig,
  ScenarioConfig,
  TimeframeConfig,
} from "../types";
import type { TradeIdea } from "../types";
import type { ExchangeTradeSignal } from "../types/exchange";

const DASHBOARD_SETTINGS_STORAGE_KEY = "bitrium.market_dashboard.settings.v1";
const LEGACY_DASHBOARD_SETTINGS_STORAGE_KEY = "bitrium.market_dashboard.settings.v1";
const SOURCE_WARNING_STALE_SEC = 25;
const SOURCE_NO_CONNECTION_SEC = 60;
const SOURCE_WARMUP_GRACE_MS = 45_000;

const initialFeeds: FeedConfig = {
  priceOhlcv: true,
  orderbook: true,
  trades: true,
  rawFeeds: true,
  openInterest: true,
  fundingRate: true,
  netFlow: true,
};

const initialTimeframe: TimeframeConfig = {
  primary: "15m",
  lookbackBars: 360,
};

const initialScenario: ScenarioConfig = {
  horizon: "INTRADAY",
  riskMode: "NORMAL",
  breakoutOnly: false,
};

const initialConsensusInputs: ConsensusInputConfig = {
  tradeValidity: true,
  bias: true,
  intent: true,
  urgency: true,
  slippage: true,
  entryTiming: true,
  riskGate: true,
  marketStress: true,
  modelAgreement: true,
};

const CONSENSUS_TILE_KEYS = [
  "trade-validity",
  "market-intent",
  "slippage-risk",
  "entry-timing-window",
  "risk-gate",
  "market-stress-level",
];

const TIMEFRAME_TO_MINUTES: Record<TradeIdea["timeframe"], number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
  "1w": 10080,
};

const toSignalTimeframe = (timeframe: TradeIdea["timeframe"]): ExchangeTradeSignal["timeframe"] =>
  timeframe === "1w" ? "1d" : timeframe;

const toSignalHorizon = (timeframe: TradeIdea["timeframe"]): ExchangeTradeSignal["horizon"] => {
  if (timeframe === "1m" || timeframe === "5m") return "SCALP";
  if (timeframe === "1d" || timeframe === "1w") return "SWING";
  return "INTRADAY";
};

const inferDirection = (idea: TradeIdea): ExchangeTradeSignal["direction"] => {
  const entryMid = (Number(idea.entryLow) + Number(idea.entryHigh)) / 2;
  const avgTarget =
    idea.targets.length > 0
      ? idea.targets.reduce((sum, level) => sum + Number(level.price), 0) / idea.targets.length
      : entryMid;
  const avgStop =
    idea.stops.length > 0
      ? idea.stops.reduce((sum, level) => sum + Number(level.price), 0) / idea.stops.length
      : entryMid;

  if (avgTarget >= entryMid && avgStop <= entryMid) return "LONG";
  if (avgTarget <= entryMid && avgStop >= entryMid) return "SHORT";

  const firstTarget = Number(idea.targets[0]?.price ?? avgTarget);
  const firstStop = Number(idea.stops[0]?.price ?? avgStop);
  return firstTarget >= firstStop ? "LONG" : "SHORT";
};

const normalizeBaseCoin = (raw: string): Coin | null => {
  const upper = String(raw ?? "").toUpperCase().trim();
  if (!upper) return null;
  const compact = upper.replace(/[-_/]/g, "");
  const withoutQuote = compact.endsWith("USDT") ? compact.slice(0, -4) : compact;
  if (!withoutQuote) return null;
  if (!/^[A-Z0-9]{1,20}$/.test(withoutQuote)) return null;
  return withoutQuote;
};

type PersistedDashboardSettings = {
  feeds: FeedConfig;
  scenario: ScenarioConfig;
  consensusInputs: ConsensusInputConfig;
  advanced: boolean;
  flowMode: FlowModeSettings;
};

const initialFlowModeSettings: FlowModeSettings = {
  minConsensus: 70,
  minValidBars: 1,
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

const loadPersistedDashboardSettings = (): PersistedDashboardSettings | null => {
  try {
    const raw =
      window.localStorage.getItem(DASHBOARD_SETTINGS_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_DASHBOARD_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedDashboardSettings> | null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      feeds: { ...initialFeeds, ...(parsed.feeds ?? {}) },
      scenario: { ...initialScenario, ...(parsed.scenario ?? {}) },
      consensusInputs: { ...initialConsensusInputs, ...(parsed.consensusInputs ?? {}) },
      advanced: typeof parsed.advanced === "boolean" ? parsed.advanced : false,
      flowMode: {
        minConsensus: Number.isFinite(Number(parsed.flowMode?.minConsensus))
          ? Math.max(20, Math.min(95, Number(parsed.flowMode?.minConsensus)))
          : initialFlowModeSettings.minConsensus,
        minValidBars: Number.isFinite(Number(parsed.flowMode?.minValidBars))
          ? Math.max(1, Math.min(12, Math.round(Number(parsed.flowMode?.minValidBars))))
          : initialFlowModeSettings.minValidBars,
        requireValidTrade:
          typeof parsed.flowMode?.requireValidTrade === "boolean"
            ? parsed.flowMode.requireValidTrade
            : initialFlowModeSettings.requireValidTrade,
        dataFilters: {
          fundingBias: Boolean(parsed.flowMode?.dataFilters?.fundingBias),
          oiChange: Boolean(parsed.flowMode?.dataFilters?.oiChange),
          volumeSpike: Boolean(parsed.flowMode?.dataFilters?.volumeSpike),
          exchangeFlow: Boolean(parsed.flowMode?.dataFilters?.exchangeFlow),
          relativeStrength: Boolean(parsed.flowMode?.dataFilters?.relativeStrength),
          keyLevelReaction: Boolean(parsed.flowMode?.dataFilters?.keyLevelReaction),
        },
        signalInputs: (() => {
          const baseInputs = { ...initialFlowModeSettings.signalInputs };
          const rawInputs = parsed.flowMode?.signalInputs;
          if (!rawInputs || typeof rawInputs !== "object") return baseInputs;
          for (const [key, value] of Object.entries(rawInputs)) {
            if (typeof value === "boolean") {
              baseInputs[key] = value;
            }
          }
          return baseInputs;
        })(),
        signalInputWeights: (() => {
          const baseWeights = { ...initialFlowModeSettings.signalInputWeights };
          const rawWeights = parsed.flowMode?.signalInputWeights;
          if (!rawWeights || typeof rawWeights !== "object") return baseWeights;
          for (const [key, value] of Object.entries(rawWeights)) {
            const numeric = Number(value);
            if (Number.isFinite(numeric)) {
              baseWeights[key] = Math.max(1, Math.min(100, Math.round(numeric)));
            }
          }
          return baseWeights;
        })(),
        riskChecks: (() => {
          const baseChecks = { ...initialFlowModeSettings.riskChecks };
          const rawChecks = parsed.flowMode?.riskChecks;
          if (!rawChecks || typeof rawChecks !== "object") return baseChecks;
          for (const [key, value] of Object.entries(rawChecks)) {
            if (typeof value === "boolean" && key in baseChecks) {
              baseChecks[key as keyof RiskChecksInputsConfig] = value;
            }
          }
          return baseChecks;
        })(),
      },
    };
  } catch {
    return null;
  }
};

const persistDashboardSettings = (settings: PersistedDashboardSettings) => {
  try {
    window.localStorage.setItem(DASHBOARD_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.localStorage.removeItem(LEGACY_DASHBOARD_SETTINGS_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
};

export default function MarketDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const persistedSettings = loadPersistedDashboardSettings();
  const { config: adminConfig } = useAdminConfig();
  const flowDefaultsFromAdmin = useMemo<PersistedDashboardSettings["flowMode"]>(
    () => ({
      ...initialFlowModeSettings,
      minConsensus: Math.max(20, Math.min(95, Number(adminConfig.tradeIdeas.flowDefaults?.minConsensus ?? 70))),
      minValidBars: Math.max(1, Math.min(12, Math.round(Number(adminConfig.tradeIdeas.flowDefaults?.minValidBars ?? 4)))),
      requireValidTrade: Boolean(adminConfig.tradeIdeas.flowDefaults?.requireValidTrade ?? true),
    }),
    [adminConfig.tradeIdeas.flowDefaults],
  );
  const [selectedCoin, setSelectedCoin] = useState<Coin>("BTC");
  const [sourceCoins, setSourceCoins] = useState<Coin[]>(["BTC"]);
  const [coinsLoading, setCoinsLoading] = useState(false);
  const [coinErrorText, setCoinErrorText] = useState<string>();
  const [feeds, setFeeds] = useState<FeedConfig>(persistedSettings?.feeds ?? initialFeeds);
  const [advanced, setAdvanced] = useState<boolean>(persistedSettings?.advanced ?? false);
  const [timeframe, setTimeframe] = useState<TimeframeConfig>(initialTimeframe);
  const [scenario, setScenario] = useState<ScenarioConfig>(persistedSettings?.scenario ?? initialScenario);
  const [consensusInputs, setConsensusInputs] = useState<ConsensusInputConfig>(
    persistedSettings?.consensusInputs ?? initialConsensusInputs,
  );
  const [flowModeSettings, setFlowModeSettings] = useState<PersistedDashboardSettings["flowMode"]>(
    persistedSettings?.flowMode ?? flowDefaultsFromAdmin,
  );
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const indicators = useIndicatorsStore();
  const selectedExchange = useExchangeTerminalStore((state) => state.selectedExchange);
  const exchangeConnectionStatus = useExchangeTerminalStore((state) => state.connectionStatus);
  const setAccountMode = useExchangeTerminalStore((state) => state.setAccountMode);
  const setSelectedExchange = useExchangeTerminalStore((state) => state.setSelectedExchange);
  const setSelectedSymbol = useExchangeTerminalStore((state) => state.setSelectedSymbol);
  const setActiveSignal = useExchangeTerminalStore((state) => state.setActiveSignal);
  const setExchangeConnectionStatus = useExchangeTerminalStore((state) => state.setConnectionStatus);
  const setForcedExchange = useDataSourceManager((state) => state.setSelectedExchangeId);
  const marketStatus = useMarketDataStatus();
  const sourceMode = useMarketDashboardSource((state) => state.sourceMode);
  const exchangeId = useMarketDashboardSource((state) => state.exchangeId);
  const sourceWarning = useMarketDashboardSource((state) => state.warning);
  const sourceStatus = useMarketDashboardSource((state) => state.status);
  const setSource = useMarketDashboardSource((state) => state.setSource);
  const setSourceWarning = useMarketDashboardSource((state) => state.setWarning);
  const setSourceStatus = useMarketDashboardSource((state) => state.setStatus);
  const { enabledAccounts } = useExchangeConfigs();
  const {
    scoringMode,
    setScoringMode,
    flowModeSettings: userFlowModeSettings,
    setFlowModeSettings: setUserFlowModeSettings,
    loading: userSettingsLoading,
  } = useUserSettings();
  const flowHydratedRef = useRef(false);
  const flowSyncRef = useRef<string>("");
  const sourceMountedAtRef = useRef<number>(Date.now());
  const effectiveScoringMode = scoringMode;
  const activeConsensusInputs = effectiveScoringMode === "FLOW" ? consensusInputs : initialConsensusInputs;
  const routeSelectedCoin = useMemo<Coin | null>(() => {
    const state = (location.state ?? null) as { selectedCoin?: string } | null;
    return normalizeBaseCoin(state?.selectedCoin ?? "");
  }, [location.state]);

  useEffect(() => {
    if (!routeSelectedCoin) return;
    setSelectedCoin(routeSelectedCoin);
  }, [routeSelectedCoin]);

  useEffect(() => {
    if (userSettingsLoading || flowHydratedRef.current) return;
    if (userFlowModeSettings) {
      setFlowModeSettings(userFlowModeSettings);
      flowHydratedRef.current = true;
      return;
    }
    if (!persistedSettings?.flowMode) {
      setFlowModeSettings(flowDefaultsFromAdmin);
    }
    flowHydratedRef.current = true;
  }, [flowDefaultsFromAdmin, persistedSettings?.flowMode, userFlowModeSettings, userSettingsLoading]);

  useEffect(() => {
    if (userSettingsLoading) return;
    const serialized = JSON.stringify(flowModeSettings);
    if (serialized === flowSyncRef.current) return;
    flowSyncRef.current = serialized;
    setUserFlowModeSettings(flowModeSettings);
  }, [flowModeSettings, setUserFlowModeSettings, userSettingsLoading]);

  const [ideaScope, setIdeaScope] = useState<"SELECTED" | "ALL">("ALL");
  const { messages: streamMessages } = useTradeIdeasStream(adminConfig.tradeIdeas.minConfidence, selectedExchange);

  const parseSourceExchange = (raw?: string | null) => {
    const normalized = String(raw ?? "").toUpperCase();
    if (!normalized) return { exchangeId: undefined as string | undefined, accountName: undefined as string | undefined };
    const [exchangePart, accountPart] = normalized.split("::");
    return {
      exchangeId: exchangePart || undefined,
      accountName: accountPart || undefined,
    };
  };

  const configuredAvailable = useMemo(() => enabledAccounts, [enabledAccounts]);
  const publicSourceOptions = useMemo(
    () => [
      { value: "EXCHANGE:BINANCE::PUBLIC", label: "Binance (System default + fallback)" },
    ],
    [],
  );

  const sourceOptions = useMemo(() => publicSourceOptions, [publicSourceOptions]);

  useEffect(() => {
    const selectedId = parseSourceExchange(exchangeId).exchangeId;
    if (sourceMode === "EXCHANGE" && selectedId === "BINANCE") return;
    setSource("EXCHANGE", "BINANCE::PUBLIC");
    setSourceWarning(undefined);
  }, [exchangeId, setSource, setSourceWarning, sourceMode]);

  useEffect(() => {
    let cancelled = false;
    const loadSymbols = async () => {
      setCoinsLoading(true);
      setCoinErrorText(undefined);
      try {
        const source = "exchange";
        const exchange = "Binance";
        const symbolsQuery = new URLSearchParams({
          source,
          exchange,
        });
        const tickersQuery = new URLSearchParams({
          source,
          exchange,
        });

        const [symbolsRes, tickersRes] = await Promise.allSettled([
          fetch(`/api/market/symbols?${symbolsQuery.toString()}`),
          fetch(`/api/market/tickers?${tickersQuery.toString()}`),
        ]);

        let fromSymbols: Coin[] = [];
        if (symbolsRes.status === "fulfilled" && symbolsRes.value.ok) {
          const body = (await symbolsRes.value.json()) as { symbols?: string[] };
          fromSymbols = (body.symbols ?? [])
            .map((item) => normalizeBaseCoin(item))
            .filter((item): item is Coin => Boolean(item))
            .map((item) => String(item).toUpperCase().trim())
            .filter(Boolean);
        }

        let fromTickers: Coin[] = [];
        if (tickersRes.status === "fulfilled" && tickersRes.value.ok) {
          const body = (await tickersRes.value.json()) as { items?: Array<{ symbol: string }> };
          fromTickers = (body.items ?? [])
            .map((item) => normalizeBaseCoin(item.symbol))
            .filter((item): item is Coin => Boolean(item))
            .map((item) => String(item).toUpperCase().trim())
            .filter(Boolean);
        }

        const symbols = [...new Set([...fromTickers, ...fromSymbols])]
          .map((item) => String(item).toUpperCase().trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));

        if (!cancelled) {
          if (symbols.length) {
            setSourceCoins(symbols);
            setSelectedCoin((prev) => (symbols.includes(prev) ? prev : symbols.includes("BTC") ? "BTC" : symbols[0]));
          } else {
            setCoinErrorText("No symbols from selected source");
            setSourceCoins(["BTC", "ETH", "SOL", "BNB", "XRP"]);
            setSelectedCoin((prev) => (["BTC", "ETH", "SOL", "BNB", "XRP"].includes(prev) ? prev : "BTC"));
          }
        }
      } catch {
        if (!cancelled) {
          setCoinErrorText("Could not load source symbols");
          setSourceCoins(["BTC", "ETH", "SOL", "BNB", "XRP"]);
          setSelectedCoin((prev) => (["BTC", "ETH", "SOL", "BNB", "XRP"].includes(prev) ? prev : "BTC"));
        }
      } finally {
        if (!cancelled) setCoinsLoading(false);
      }
    };
    void loadSymbols();
    return () => {
      cancelled = true;
    };
  }, [configuredAvailable]);

  useEffect(() => {
    if (sourceMode !== "EXCHANGE") return;
    const inWarmup = Date.now() - sourceMountedAtRef.current < SOURCE_WARMUP_GRACE_MS;
    const staleSevere = marketStatus.stale && marketStatus.staleAgeSec >= SOURCE_WARNING_STALE_SEC;
    if (inWarmup && marketStatus.staleAgeSec < SOURCE_NO_CONNECTION_SEC) return;
    if (!staleSevere) {
      setSourceWarning(undefined);
      return;
    }
    if (marketStatus.staleAgeSec < SOURCE_NO_CONNECTION_SEC) return;
    const active = marketStatus.activeSource === "FALLBACK_API" ? "Bitrium Labs API" : marketStatus.activeSource;
    setSourceWarning(`No live packet from selected exchange. Active source: ${active}.`);
  }, [marketStatus.activeSource, marketStatus.stale, marketStatus.staleAgeSec, setSourceWarning, sourceMode]);

  useEffect(() => {
    if (sourceMode !== "EXCHANGE") return;
    if (!sourceWarning) return;
    if (marketStatus.stale && marketStatus.staleAgeSec >= SOURCE_NO_CONNECTION_SEC) return;
    setSourceWarning(undefined);
  }, [marketStatus.stale, marketStatus.staleAgeSec, setSourceWarning, sourceMode, sourceWarning]);

  useEffect(() => {
    const staleSevere = marketStatus.stale && marketStatus.staleAgeSec >= SOURCE_WARNING_STALE_SEC;
    const noConnection = marketStatus.staleAgeSec >= SOURCE_NO_CONNECTION_SEC;
    if (noConnection) {
      setSourceStatus("NO_CONNECTION");
    } else if (staleSevere) {
      setSourceStatus("STALE");
    } else {
      setSourceStatus("GOOD");
    }
    setForcedExchange("BINANCE");
    setSelectedExchange("Binance");
    if (exchangeConnectionStatus !== "CONNECTED") setExchangeConnectionStatus("CONNECTED");
  }, [exchangeConnectionStatus, marketStatus.stale, marketStatus.staleAgeSec, setExchangeConnectionStatus, setForcedExchange, setSelectedExchange, setSourceStatus]);

  const overlays = useMemo(
    () => ({
      ema: indicators.state.masterEnabled && indicators.state.indicators.ema.enabled && Boolean(indicators.state.indicators.ema.showOnChart),
      vwap: indicators.state.masterEnabled && indicators.state.indicators.vwap.enabled && Boolean(indicators.state.indicators.vwap.showOnChart),
      volume: indicators.state.masterEnabled && indicators.state.indicators.volume.enabled && Boolean(indicators.state.indicators.volume.showOnChart),
      keyLevels:
        indicators.state.masterEnabled &&
        indicators.state.indicators.pivotPoints.enabled &&
        Boolean(indicators.state.indicators.pivotPoints.showOnChart),
    }),
    [indicators.state],
  );

  const rawSnapshot = useMarketDashboard(
    selectedCoin,
    timeframe,
    feeds,
    scenario,
    indicators.state,
    activeConsensusInputs,
    effectiveScoringMode,
    selectedExchange,
    undefined,
    effectiveScoringMode === "FLOW" ? flowModeSettings.signalInputs : undefined,
    effectiveScoringMode === "FLOW" ? flowModeSettings.signalInputWeights : undefined,
    effectiveScoringMode === "FLOW" ? flowModeSettings.riskChecks : undefined,
  );
  const hasLiveData = Boolean(rawSnapshot?.ohlcv?.length);
  const safeSnapshot = rawSnapshot;
  const normalizedState = useMemo(
    () =>
      safeSnapshot
        ? normalizeDashboardState({
            snapshot: safeSnapshot,
            feeds,
            indicators: indicators.state,
            config: {
              symbol: `${selectedCoin}/USDT`,
              timeframe: timeframe.primary,
              lookbackBars: timeframe.lookbackBars,
              horizon: scenario.horizon,
              riskMode: scenario.riskMode,
              breakoutOnly: scenario.breakoutOnly,
            },
          })
        : null,
    [safeSnapshot, feeds, indicators.state, selectedCoin, timeframe.primary, timeframe.lookbackBars, scenario.horizon, scenario.riskMode, scenario.breakoutOnly],
  );

  const activeConsensusMin = useMemo(
    () =>
      Math.max(
        50,
        Math.min(
          95,
          Number(adminConfig.tradeIdeas.dashboardConsensus.activeMin) || 70,
        ),
      ),
    [adminConfig.tradeIdeas.dashboardConsensus.activeMin],
  );

  const allowTradeIdeas = useMemo(() => {
    if (!normalizedState) return false;
    const panel = normalizedState.aiPanel;
    const isFlowMode = effectiveScoringMode === "FLOW";
    const minConsensus = isFlowMode ? flowModeSettings.minConsensus : activeConsensusMin;
    const minValidBars = isFlowMode ? flowModeSettings.minValidBars : 1;
    const requireValidTrade = isFlowMode ? flowModeSettings.requireValidTrade : false;
    if (panel.signalConsensus < minConsensus) return false;
    if (panel.tradeValidity === "NO-TRADE") return false;
    if (requireValidTrade && panel.tradeValidity !== "VALID") return false;
    if (panel.freshness.validForBars < minValidBars) return false;
    return true;
  }, [
    activeConsensusMin,
    flowModeSettings.minConsensus,
    flowModeSettings.minValidBars,
    flowModeSettings.requireValidTrade,
    normalizedState,
    effectiveScoringMode,
  ]);

  const generatedIdeas = useMemo<TradeIdea[]>(() => {
    if (!normalizedState || !allowTradeIdeas) return [];
    const consensus = normalizedState.aiPanel.signalConsensus;

    const last = normalizedState.ohlcv[normalizedState.ohlcv.length - 1];
    if (!last) return [];

    const prev = normalizedState.ohlcv[Math.max(0, normalizedState.ohlcv.length - 21)] ?? last;
    const atrProxy = Math.max(0.001, Math.abs(last.close - prev.close) / Math.max(1, prev.close));
    const bias = normalizedState.aiPanel.bias;
    const isShort = bias === "SHORT";
    const confidence = Math.max(0.7, Math.min(0.99, consensus / 100));
    const riskCfg = adminConfig.tradeIdeas.dashboardIdeaRisk;
    const entryPad = last.close * Math.max(0.0008, atrProxy * Math.max(0.1, Number(riskCfg.entryAtrFactor) || 0.35));
    const stopPad = last.close * Math.max(0.0016, atrProxy * Math.max(0.1, Number(riskCfg.stopAtrFactor) || 0.75));
    const targetPad = last.close * Math.max(0.0024, atrProxy * Math.max(0.1, Number(riskCfg.targetAtrFactor) || 1.15));
    const target2Multiplier = Math.max(1, Number(riskCfg.target2Multiplier) || 1.65);

    const entryLow = Number((isShort ? last.close : last.close - entryPad).toFixed(2));
    const entryHigh = Number((isShort ? last.close + entryPad : last.close).toFixed(2));
    const sl1 = Number((isShort ? entryHigh + stopPad : entryLow - stopPad).toFixed(2));
    const sl2 = Number((isShort ? entryHigh + stopPad * 1.5 : entryLow - stopPad * 1.5).toFixed(2));
    const tp1 = Number((isShort ? entryLow - targetPad : entryHigh + targetPad).toFixed(2));
    const tp2 = Number((isShort ? entryLow - targetPad * target2Multiplier : entryHigh + targetPad * target2Multiplier).toFixed(2));

    return [
      {
        id: `dash-${selectedCoin}-${timeframe.primary}-${Math.round(last.time)}`,
        coin: selectedCoin,
        quote: "USDT",
        timeframe: timeframe.primary,
        confidence,
        approvedModes: [effectiveScoringMode],
        modeScores: { [effectiveScoringMode]: confidence },
        entryLow: Math.min(entryLow, entryHigh),
        entryHigh: Math.max(entryLow, entryHigh),
        stops: [
          { price: sl1, weightPct: 50 },
          { price: sl2, weightPct: 50 },
        ],
        targets: [
          { price: tp1, weightPct: 50 },
          { price: tp2, weightPct: 50 },
        ],
        createdAt: new Date(last.time * 1000).toISOString(),
      },
    ];
  }, [adminConfig.tradeIdeas.dashboardIdeaRisk, allowTradeIdeas, normalizedState, effectiveScoringMode, selectedCoin, timeframe.primary]);

  const streamedIdeas = useMemo<TradeIdea[]>(() => {
    const now = Date.now();
    const MAX_IDEA_AGE_MS = 6 * 60 * 60 * 1000;
    const isOpenStatus = (status?: string) => status === "PENDING" || status === "ACTIVE";
    const isModeApproved = (msg: (typeof streamMessages)[number]) => {
      const approved = Array.isArray(msg.approvedModes) && msg.approvedModes.length
        ? msg.approvedModes
        : [msg.scoringMode ?? "BALANCED"];
      return approved.includes(effectiveScoringMode);
    };
    const passesFlowGate = (msg: (typeof streamMessages)[number]) => {
      if (effectiveScoringMode !== "FLOW") return true;
      if ((msg.confidence ?? 0) * 100 < flowModeSettings.minConsensus) return false;
      if (flowModeSettings.requireValidTrade && msg.tradeValidity !== "VALID") return false;
      if ((msg.validUntilBars ?? 0) < flowModeSettings.minValidBars) return false;
      return true;
    };
    const toCoin = (rawSymbol: string) => {
      const upper = String(rawSymbol ?? "").toUpperCase().replace(/[-_]/g, "");
      if (upper.endsWith("USDT")) return upper.slice(0, -4);
      return upper;
    };
    const sorted = [...streamMessages]
      .filter((m) => {
        if (!isModeApproved(m)) return false;
        if (!passesFlowGate(m)) return false;
        const ts = Date.parse(String(m.createdAt ?? ""));
        if (!Number.isFinite(ts)) return false;
        return now - ts <= MAX_IDEA_AGE_MS;
      })
      .sort(
        (a, b) => {
          const aOpen = isOpenStatus(a.status) ? 0 : 1;
          const bOpen = isOpenStatus(b.status) ? 0 : 1;
          if (aOpen !== bOpen) return aOpen - bOpen;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        },
      );
    return sorted.slice(0, 24).map((m) => ({
      id: m.id,
      coin: toCoin(m.symbol),
      quote: "USDT",
      timeframe: m.timeframe as TradeIdea["timeframe"],
      confidence: m.confidence,
      approvedModes: m.approvedModes,
      modeScores: m.modeScores,
      entryLow: Number(m.entry.low ?? 0),
      entryHigh: Number(m.entry.high ?? 0),
      stops: [
        { price: Number(m.stops[0]?.price ?? m.entry.low ?? 0), weightPct: Number(m.stops[0]?.sharePct ?? 50) },
        { price: Number(m.stops[1]?.price ?? m.stops[0]?.price ?? m.entry.low ?? 0), weightPct: Number(m.stops[1]?.sharePct ?? 50) },
      ],
      targets: [
        { price: Number(m.targets[0]?.price ?? m.entry.high ?? 0), weightPct: Number(m.targets[0]?.sharePct ?? 50) },
        { price: Number(m.targets[1]?.price ?? m.targets[0]?.price ?? m.entry.high ?? 0), weightPct: Number(m.targets[1]?.sharePct ?? 50) },
      ],
      createdAt: m.createdAt,
    }));
  }, [
    effectiveScoringMode,
    flowModeSettings.minConsensus,
    flowModeSettings.minValidBars,
    flowModeSettings.requireValidTrade,
    streamMessages,
  ]);

  const tradeIdeas = useMemo<TradeIdea[]>(
    () => (streamedIdeas.length ? streamedIdeas : generatedIdeas),
    [generatedIdeas, streamedIdeas],
  );

  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);

  useEffect(() => {
    if (!tradeIdeas.length) {
      setSelectedIdeaId(null);
      return;
    }
    // Always keep focus on latest idea so panel updates from newest signal first.
    setSelectedIdeaId(tradeIdeas[0].id);
  }, [tradeIdeas]);

  const selectedTradeIdea = useMemo(
    () => tradeIdeas.find((idea) => idea.id === selectedIdeaId) ?? tradeIdeas[0] ?? null,
    [selectedIdeaId, tradeIdeas],
  );

  const resolvedAdvanced = useMemo(() => advanced || feeds.rawFeeds, [advanced, feeds.rawFeeds]);
  const activeTileLabels = useMemo(
    () =>
      normalizedState
        ? normalizedState.tiles
            .filter((tile) => resolvedAdvanced || !tile.advanced)
            .map((tile) => tile.label)
        : [],
    [normalizedState, resolvedAdvanced],
  );

  const consensusInputStates = useMemo(() => {
    if (!normalizedState) return [];
    const tileByKey = new Map(normalizedState.tiles.map((tile) => [tile.key, tile]));
    const tileState = (key: string) => {
      const tile = tileByKey.get(key);
      if (!tile) return { value: "N/A", confidence: 0 };
      const value = typeof tile.value === "number" ? `${tile.value}${tile.unit ? ` ${tile.unit}` : ""}` : tile.state ?? "N/A";
      return { value, confidence: tile.confidence };
    };
    const modelAgreement = normalizedState.aiPanel.modelAgreement;
    return [
      { key: "tradeValidity" as const, value: normalizedState.aiPanel.tradeValidity, confidence: tileState("trade-validity").confidence },
      { key: "bias" as const, value: normalizedState.aiPanel.bias, confidence: modelAgreement.totalModels > 0 ? (modelAgreement.aligned / modelAgreement.totalModels) * 100 : 0 },
      { key: "intent" as const, value: normalizedState.aiPanel.marketIntent, confidence: tileState("market-intent").confidence },
      { key: "urgency" as const, value: normalizedState.aiPanel.executionUrgency, confidence: normalizedState.aiPanel.signalConsensus },
      { key: "slippage" as const, value: tileState("slippage-risk").value, confidence: tileState("slippage-risk").confidence },
      { key: "entryTiming" as const, value: tileState("entry-timing-window").value, confidence: tileState("entry-timing-window").confidence },
      { key: "riskGate" as const, value: tileState("risk-gate").value, confidence: tileState("risk-gate").confidence },
      { key: "marketStress" as const, value: tileState("market-stress-level").value, confidence: tileState("market-stress-level").confidence },
      {
        key: "modelAgreement" as const,
        value: `${modelAgreement.aligned}/${modelAgreement.totalModels} ${modelAgreement.direction}`,
        confidence: modelAgreement.totalModels > 0 ? (modelAgreement.aligned / modelAgreement.totalModels) * 100 : 0,
      },
    ];
  }, [normalizedState]);

  useEffect(() => {
    persistDashboardSettings({
      feeds,
      scenario,
      consensusInputs,
      advanced,
      flowMode: flowModeSettings,
    });
  }, [advanced, consensusInputs, feeds, flowModeSettings, scenario]);

  const handleFeedChange = (key: FeedKey, value: boolean) => {
    setFeeds((prev) => ({ ...prev, [key]: value }));
  };

  const hasConfiguredSettings = useMemo(() => {
    const feedChanged = Object.entries(initialFeeds).some(([key, value]) => feeds[key as keyof FeedConfig] !== value);
    const scenarioChanged =
      scenario.horizon !== initialScenario.horizon ||
      scenario.riskMode !== initialScenario.riskMode ||
      scenario.breakoutOnly !== initialScenario.breakoutOnly;
    const consensusChanged = Object.entries(initialConsensusInputs).some(
      ([key, value]) => consensusInputs[key as keyof ConsensusInputConfig] !== value,
    );
    return feedChanged || scenarioChanged || consensusChanged || advanced;
  }, [advanced, consensusInputs, feeds, scenario]);

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        <DashboardHeader
          sourceSelection="EXCHANGE:BINANCE::PUBLIC"
          sourceOptions={sourceOptions}
          status={sourceStatus}
          latencyMs={marketStatus.latencyMs}
          warningText={sourceWarning}
          showAddExchangeCta={false}
          onAddExchange={() => navigate("/admin")}
          onSourceChange={(value) => {
            const selectedId = value.replace("EXCHANGE:", "").toUpperCase();
            if (selectedId.startsWith("BINANCE")) {
              setSource("EXCHANGE", "BINANCE::PUBLIC");
              return;
            }
            setSource("EXCHANGE", "BINANCE::PUBLIC");
          }}
          activeTileLabels={activeTileLabels}
        />
        {!hasLiveData && normalizedState ? (
          <section className="rounded-2xl border border-[#2e3642] bg-[#111824] px-4 py-3 text-xs text-[#8ea3c5]">
            Live packet not received yet. Panels stay visible; unavailable fields are shown as N/A.
          </section>
        ) : null}
        {normalizedState ? (
          <>
            <section className="flex flex-col gap-4 lg:flex-row">
              <div className="w-full lg:w-3/5">
                <ChartPanel
                  key={`chart-${selectedCoin}-${timeframe.primary}-${marketStatus.activeSource ?? "AUTO"}`}
                  selectedCoin={selectedCoin}
                  onCoinChange={(coin) => {
                    const normalized = normalizeBaseCoin(coin);
                    if (!normalized) return;
                    setSelectedCoin(normalized);
                  }}
                  coinOptions={sourceCoins}
                  coinsLoading={coinsLoading}
                  coinErrorText={coinErrorText}
                  coinSourceMode="EXCHANGE"
                  coinExchangeName="Binance"
                  symbol={`${selectedCoin}/USDT`}
                  timeframe={timeframe}
                  data={normalizedState.ohlcv}
                  keyLevels={normalizedState.keyLevels}
                  overlays={overlays}
                  tradeIdeas={tradeIdeas}
                  aiSummary={normalizedState.aiPanel.summary}
                  aiKeyReasons={normalizedState.aiPanel.keyReasons}
                  confidenceDrivers={normalizedState.aiPanel.confidenceDrivers}
                  scenarioOutlook={normalizedState.aiPanel.scenarioOutlook}
                  selectedTradeIdea={selectedTradeIdea}
                  indicatorsMasterEnabled={indicators.state.masterEnabled}
                  indicatorsEnabledCount={indicators.enabledCount}
                  indicatorsState={indicators.state}
                  onTradeIdeaSelect={setSelectedIdeaId}
                  tradeIdeaScope={ideaScope}
                  onTradeIdeaScopeChange={setIdeaScope}
                  onTradeIdeaCoinClick={(coin, ideaId) => {
                    setSelectedCoin(coin);
                    setSelectedIdeaId(ideaId);
                  }}
                  onTradeIdeaView={(coin, ideaId) => {
                    setSelectedCoin(coin);
                    setSelectedIdeaId(ideaId);
                    navigate("/quant-engine");
                  }}
                  onTradeIdeaTrade={(coin, ideaId) => {
                    setSelectedCoin(coin);
                    setSelectedIdeaId(ideaId);
                    const idea = tradeIdeas.find((item) => item.id === ideaId);
                    if (!idea) return;

                    const now = Date.now();
                    const validBars = 6;
                    const minutesPerBar = TIMEFRAME_TO_MINUTES[idea.timeframe] ?? 15;
                    const stop1 = Number(idea.stops[0]?.price ?? idea.entryLow);
                    const stop2 = Number(idea.stops[1]?.price ?? stop1);
                    const target1 = Number(idea.targets[0]?.price ?? idea.entryHigh);
                    const target2 = Number(idea.targets[1]?.price ?? target1);
                    const signal: ExchangeTradeSignal = {
                      direction: inferDirection(idea),
                      horizon: toSignalHorizon(idea.timeframe),
                      confidence: Number.isFinite(idea.confidence) ? idea.confidence : 0,
                      tradeValidity: "VALID",
                      entryWindow: "OPEN",
                      slippageRisk: "MED",
                      timeframe: toSignalTimeframe(idea.timeframe),
                      validBars,
                      timestampUtc: new Date(now).toISOString(),
                      validUntilUtc: new Date(now + validBars * minutesPerBar * 60_000).toISOString(),
                      setup: "Dashboard Trade Idea",
                      entryLow: Math.min(idea.entryLow, idea.entryHigh),
                      entryHigh: Math.max(idea.entryLow, idea.entryHigh),
                      stops: [stop1, stop2],
                      targets: [target1, target2],
                    };
                    setAccountMode("Futures");
                    setSelectedSymbol(`${idea.coin}/${idea.quote}`);
                    setActiveSignal(signal);
                    navigate("/exchange-terminal");
                  }}
                  onOverlayChange={(next) => {
                    indicators.setIndicatorEnabled("ema", next.ema);
                    indicators.setIndicatorEnabled("vwap", next.vwap);
                    indicators.setIndicatorEnabled("volume", next.volume);
                    indicators.setIndicatorEnabled("pivotPoints", next.keyLevels);
                  }}
                  onOpenIndicatorsPanel={() => setIndicatorsOpen(true)}
                  onTimeframeChange={(next) => {
                    setTimeframe((prev) => ({ ...prev, primary: next }));
                  }}
                  onLookbackChange={(bars) => setTimeframe((prev) => ({ ...prev, lookbackBars: bars }))}
                />
              </div>
              <div className="w-full lg:w-2/5">
                <AiPanel
                  key={`ai-${selectedCoin}-${timeframe.primary}-${marketStatus.activeSource ?? "AUTO"}`}
                  data={normalizedState.aiPanel}
                  dataHealth={normalizedState.dataHealth}
                  advanced={resolvedAdvanced}
                  configSnapshot={normalizedState.configSnapshot}
                  featuredPlan={selectedTradeIdea}
                  snapshotForExport={normalizedState}
                  onScoringModeChange={(next) => setScoringMode(next)}
                  scoringModeLoading={userSettingsLoading}
                  consensusThresholds={adminConfig.tradeIdeas.dashboardConsensus}
                />
              </div>
            </section>

            <section className="space-y-3">
              <FlowModeSettingsPanel
                scoringMode={scoringMode}
                settings={flowModeSettings}
                onChange={setFlowModeSettings}
              />

              <FeedToggles
                feeds={feeds}
                scenario={scenario}
                onFeedChange={handleFeedChange}
                onScenarioChange={setScenario}
                advanced={resolvedAdvanced}
                onAdvancedToggle={setAdvanced}
                title="Flow Feed Toggles"
                subtitle="These feed/scenario/input controls update the Flow profile."
              />

              <IndicatorsPanel
                state={indicators.state}
                enabledCount={indicators.enabledCount}
                open={indicatorsOpen}
                onOpenChange={setIndicatorsOpen}
                setMaster={indicators.setMaster}
                setGroup={indicators.setGroup}
                setIndicatorEnabled={indicators.setIndicatorEnabled}
                setIndicatorSetting={indicators.setIndicatorSetting}
                resetIndicator={indicators.resetIndicator}
              />

                <RiskChecksPanel
                  data={normalizedState.aiPanel}
                  inputs={flowModeSettings.riskChecks}
                  onInputChange={(key, value) => {
                    setFlowModeSettings((prev) => ({
                    ...prev,
                    riskChecks: {
                      ...prev.riskChecks,
                      [key]: value,
                      },
                    }));
                    if (effectiveScoringMode !== "FLOW") return;
                    if (key === "riskGate") {
                      setConsensusInputs((prev) => ({ ...prev, riskGate: value }));
                    } else if (key === "stressFilter") {
                      setConsensusInputs((prev) => ({ ...prev, marketStress: value }));
                    } else if (key === "executionCertainty") {
                      setConsensusInputs((prev) => ({ ...prev, entryTiming: value, slippage: value }));
                  }
                }}
                onBulkChange={(value) => {
                  setFlowModeSettings((prev) => ({
                    ...prev,
                    riskChecks: {
                      riskGate: value,
                      executionCertainty: value,
                      stressFilter: value,
                      sizeHint: value,
                    },
                  }));
                  if (effectiveScoringMode !== "FLOW") return;
                  setConsensusInputs((prev) => ({
                    ...prev,
                    riskGate: value,
                    marketStress: value,
                    entryTiming: value,
                    slippage: value,
                  }));
                }}
              />

              <ConsensusInputsPanel
                consensusInputs={consensusInputs}
                consensusInputStates={consensusInputStates}
                onConsensusInputChange={(key: ConsensusInputKey, value: boolean) =>
                  setConsensusInputs((prev) => ({ ...prev, [key]: value }))
                }
                onConsensusInputsBulk={(value: boolean) =>
                  setConsensusInputs({
                    tradeValidity: value,
                    bias: value,
                    intent: value,
                    urgency: value,
                    slippage: value,
                    entryTiming: value,
                    riskGate: value,
                    marketStress: value,
                    modelAgreement: value,
                  })
                }
                hasConfiguredSettings={hasConfiguredSettings}
                onOpenSettings={() => navigate("/settings")}
              >
                <TileGrid
                  tiles={normalizedState.tiles}
                  feeds={feeds}
                  advanced={resolvedAdvanced}
                  indicatorsEnabled={indicators.state.masterEnabled}
                  excludedKeys={CONSENSUS_TILE_KEYS}
                  layerScores={normalizedState.aiPanel.layerScores}
                  flowSignalInputs={flowModeSettings.signalInputs}
                  flowSignalWeights={flowModeSettings.signalInputWeights}
                  onFlowSignalInputsChange={(next: FlowSignalInputsConfig) =>
                    setFlowModeSettings((prev) => ({
                      ...prev,
                      signalInputs: next,
                    }))
                  }
                  onFlowSignalWeightChange={(next: FlowSignalWeightsConfig) =>
                    setFlowModeSettings((prev) => ({
                      ...prev,
                      signalInputWeights: next,
                    }))
                  }
                />
              </ConsensusInputsPanel>

              <DataHealth health={normalizedState.dataHealth} feeds={feeds} />
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
