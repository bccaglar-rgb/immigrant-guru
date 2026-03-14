export type FeedKey =
  | "priceOhlcv"
  | "orderbook"
  | "trades"
  | "rawFeeds"
  | "openInterest"
  | "fundingRate"
  | "netFlow";

export interface FeedConfig {
  priceOhlcv: boolean;
  orderbook: boolean;
  trades: boolean;
  rawFeeds: boolean;
  openInterest: boolean;
  fundingRate: boolean;
  netFlow: boolean;
}

export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";

export type Coin = string;

export interface TimeframeConfig {
  primary: Timeframe;
  lookbackBars: number;
}

export type HorizonMode = "SCALP" | "INTRADAY" | "SWING";
export type RiskMode = "CONSERVATIVE" | "NORMAL" | "AGGRESSIVE";

export interface ScenarioConfig {
  horizon: HorizonMode;
  riskMode: RiskMode;
  breakoutOnly: boolean;
}

export type ScoringMode = "FLOW" | "AGGRESSIVE" | "BALANCED" | "CAPITAL_GUARD";

export type ConsensusInputKey =
  | "tradeValidity"
  | "bias"
  | "intent"
  | "urgency"
  | "slippage"
  | "entryTiming"
  | "riskGate"
  | "marketStress"
  | "modelAgreement";

export interface ConsensusInputConfig {
  tradeValidity: boolean;
  bias: boolean;
  intent: boolean;
  urgency: boolean;
  slippage: boolean;
  entryTiming: boolean;
  riskGate: boolean;
  marketStress: boolean;
  modelAgreement: boolean;
}

export interface FlowDataFiltersConfig {
  fundingBias: boolean;
  oiChange: boolean;
  volumeSpike: boolean;
  exchangeFlow: boolean;
  relativeStrength: boolean;
  keyLevelReaction: boolean;
  conflictTrend: boolean;
  conflictBuySell: boolean;
  conflictOrderbook: boolean;
}

export interface FlowSignalInputsConfig {
  [key: string]: boolean | undefined;
  marketRegime?: boolean;
  distanceToKeyLevel?: boolean;
  rangePosition?: boolean;
  liquidityClusterNearby?: boolean;
  lastSwingDistance?: boolean;
  htfLevelReaction?: boolean;
  structureAge?: boolean;
  timeInRange?: boolean;
  trendDirection?: boolean;
  trendStrength?: boolean;
  trendPhase?: boolean;
  emaAlignment?: boolean;
  vwapPosition?: boolean;
  timeSinceRegimeChange?: boolean;
  atrRegime?: boolean;
  compression?: boolean;
  marketSpeed?: boolean;
  breakoutRisk?: boolean;
  fakeBreakoutProbability?: boolean;
  expansionProbability?: boolean;
}

export interface FlowSignalWeightsConfig {
  [key: string]: number | undefined;
}

export interface RiskChecksInputsConfig {
  riskGate: boolean;
  executionCertainty: boolean;
  stressFilter: boolean;
  sizeHint: boolean;
}

export interface FlowScoringTuningConfig {
  fillShortfallCoeff: number;
  slippageSeverityCoeff: number;
  microSeverityCoeff: number;
  executionMultiplierFloor: number;
  stressFailureCoeff: number;
  cascadeFailureCoeff: number;
  crowdingFailureCoeff: number;
  riskMultiplierFloor: number;
  modeBias: number;
  compressKnee: number;
  compressScale: number;
  fillHardBlockThreshold: number;
  fillGateThreshold: number;
  hardBlockScoreCap: number;
  degradedFeedPenalty: number;
  dataMultiplierFloor: number;
}

export interface FlowModeSettingsConfig {
  minConsensus: number;
  minValidBars: number;
  requireValidTrade: boolean;
  dataFilters: FlowDataFiltersConfig;
  signalInputs: FlowSignalInputsConfig;
  signalInputWeights: FlowSignalWeightsConfig;
  riskChecks: RiskChecksInputsConfig;
  flowScoringTuning: FlowScoringTuningConfig;
}

export type TileCategory =
  | "Price Structure"
  | "Trend State"
  | "Volatility & Market Speed"
  | "Liquidity & Execution"
  | "Positioning / Derivatives"
  | "Entry Quality"
  | "Trade Filters"
  | "On-Chain Metrics"
  | "Context / Cross-Market"
  | "Risk Environment / Market Stress"
  | "Indicators";

export type IndicatorKey =
  | "ema"
  | "vwap"
  | "adx"
  | "supertrend"
  | "ichimoku"
  | "pivotPoints"
  | "rsi"
  | "macd"
  | "stochRsi"
  | "cci"
  | "momentumOsc"
  | "atr"
  | "bbands"
  | "keltner"
  | "donchian"
  | "volume"
  | "volumeMa"
  | "obv"
  | "vwma"
  | "cvd"
  | "buySellImbalance"
  | "supportResistance"
  | "liquidityZones"
  | "fairValueGaps"
  | "divergence";

export type IndicatorGroupKey = "trend" | "momentum" | "volatility" | "volumeFlow" | "structureHelpers";

export interface IndicatorConfig {
  enabled: boolean;
  showOnChart?: boolean;
  showPanel?: boolean;
  settings: Record<string, number | string | boolean | string[]>;
}

export interface IndicatorsState {
  masterEnabled: boolean;
  groups: Record<IndicatorGroupKey, { enabled: boolean }>;
  indicators: Record<IndicatorKey, IndicatorConfig>;
}

export interface TileState {
  key: string;
  label: string;
  category: TileCategory;
  state?: string;
  value?: number;
  unit?: string;
  confidence: number;
  rawValue?: string;
  shortExplanation?: string;
  source?: string;
  stale?: boolean;
  requiresIndicators?: boolean;
  updatedAt: string;
  advanced: boolean;
  dependsOnFeeds: FeedKey[];
}

export interface RiskCheck {
  label: string;
  status: "PASS" | "BLOCK";
  detail: string;
}

export interface AiPanelData {
  summary: string[];
  keyReasons: string[];
  riskChecks: RiskCheck[];
  tradeValidity: "VALID" | "WEAK" | "NO-TRADE";
  bias: "LONG" | "SHORT" | "WATCH" | "NONE";
  signalConsensus: number;
  conflictLevel: "LOW" | "MED" | "HIGH";
  marketIntent: "ACCUMULATION" | "DISTRIBUTION" | "LIQUIDITY_HUNT" | "TREND_CONTINUATION";
  playbook: string;
  confidenceBand: [number, number];
  confidenceDrivers: {
    structure: number;
    liquidity: number;
    positioning: number;
    execution: number;
  };
  scenarioOutlook: {
    trendContinuation: number;
    rangeContinuation: number;
    breakoutMove: number;
  };
  crowdingRisk: "LOW" | "MODERATE" | "HIGH";
  priceLocation: string;
  freshness: {
    updatedSecAgo: number;
    validForBars: number;
  };
  triggerConditions: string[];
  invalidationTriggers: string[];
  executionUrgency: "WAIT" | "WATCH" | "PREPARE" | "ACT";
  expectedMove: string;
  recentRegimePath: string[];
  modelAgreement: {
    totalModels: number;
    aligned: number;
    neutral: number;
    opposite: number;
    unknown: number;
    direction: "LONG" | "SHORT" | "WATCH" | "NONE";
  };
  explainability: string[];
  sizeHint: "0" | "0.25x" | "0.5x" | "1x";
  sizeHintReason: string;
  confidenceCapped?: boolean;
  unmetTriggers?: string[];
  sessionContext: {
    session: "Asia" | "EU" | "US" | "Weekend";
    liquidityExpectation: "Lower" | "Normal" | "High";
  };
  timeContextSummary: string;
  riskEnvironmentSummary: string;
  executionCertaintySummary: string;
  portfolioContextSummary: string;
  layerScores?: Record<
    "execution" | "structure" | "microstructure" | "positioning" | "volatility" | "risk" | "onchain",
    number
  >;
  layerWeights?: Record<
    "execution" | "structure" | "microstructure" | "positioning" | "volatility" | "risk" | "onchain",
    {
      activeWeight: number;
      totalWeight: number;
      activeCount: number;
      totalCount: number;
    }
  >;
  scoringMode: ScoringMode;
  scoreBreakdown: {
    edgeAdj: number;
    riskAdj: number;
    pFill: number;
    capacity: number;
    inputModifier: number;
    penaltyPoints: number;
  };
  gatingFlags: string[];
  scoring_mode: ScoringMode;
  score_breakdown: {
    edgeAdj: number;
    riskAdj: number;
    pFill: number;
    capacity: number;
    inputModifier: number;
    penaltyPoints: number;
  };
  gating_flags: string[];
  consensusEngine: {
    dataComplete: boolean;
    edgeNetR: number;
    pWin: number;
    pStop: number;
    avgWinR: number;
    expectedRR: number;
    costR: number;
    pFill: number;
    capacityFactor: number;
    riskAdjustment: number;
    riskAdjustedEdgeR: number;
    expectedHoldingBars: number;
    inputModifier: number;
    rawConsensus: number;
    adjustedConsensus: number;
    penalizedConsensus: number;
    penaltyTotal: number;
    penaltyModel: "SUBTRACT" | "MULTIPLY";
    penaltyRate: number;
    penaltyApplied: number;
    hardGates: {
      tradeValidity: boolean;
      dataHealth: boolean;
      riskGate: boolean;
      entryWindow: boolean;
      fillProb: boolean;
      edge: boolean;
      capacity: boolean;
    };
    formulaLine: string;
  };
}

export interface FeedSourceHealth {
  source: string;
  healthy: boolean;
}

export interface DataHealthState {
  latencyMs: number;
  feedLatencyMs?: number;
  uiLatencyMs?: number;
  lastUpdateAgeSec: number;
  staleFeed: boolean;
  missingFields: number;
  updatedAt: string;
  feedSources: Record<FeedKey, FeedSourceHealth>;
}

export interface OhlcvPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface KeyLevel {
  label: string;
  price: number;
}

export interface DashboardSnapshot {
  tiles: TileState[];
  aiPanel: AiPanelData;
  dataHealth: DataHealthState;
  ohlcv: OhlcvPoint[];
  keyLevels: KeyLevel[];
}

export interface TradeLevel {
  price: number;
  weightPct: number;
}

export interface TradeIdea {
  id: string;
  coin: Coin;
  quote: "USDT";
  timeframe: Timeframe;
  confidence: number;
  approvedModes?: ScoringMode[];
  modeScores?: Partial<Record<ScoringMode, number>>;
  entryLow: number;
  entryHigh: number;
  stops: TradeLevel[];
  targets: TradeLevel[];
  createdAt: string;
}

export interface AiModelConfig {
  id: string;
  name: string;
  type: "Hosted" | "Local";
  endpoint?: string;
  apiKey?: string;
  enabled: boolean;
  priority: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeConfig {
  id: string;
  name: string;
  type: "Spot" | "Futures" | "Both";
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  testnet: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoinRow {
  id: string;
  rank: number;
  symbol: string;
  name?: string;
  logoUrl?: string;
  price: number;
  priceChange24hPct: number;
  fundingRatePct: number;
  volume24hUsd: number;
  volumeChange24hPct: number;
  marketCapUsd: number;
  oiUsd: number;
  oiChange1hPct: number;
  oiChange24hPct: number;
  liquidation24hUsd: number;
  isFavorite: boolean;
}

export type CryptoSortKey =
  | "rank"
  | "symbol"
  | "price"
  | "priceChange24hPct"
  | "fundingRatePct"
  | "volume24hUsd"
  | "volumeChange24hPct"
  | "marketCapUsd"
  | "oiUsd"
  | "oiChange1hPct"
  | "oiChange24hPct"
  | "liquidation24hUsd";
export type CryptoFilterKey = "all" | "gainers" | "losers";

export interface ProviderConfig {
  id: string;
  name: string;
  presetKey?: string;
  providerGroup?: "OUTSOURCE" | "EXCHANGE";
  exchangeName?: string;
  type: "REST" | "WS" | "BOTH";
  baseUrl: string;
  wsUrl?: string;
  discoveryEndpoint?: string;
  fallbackPriority?: number;
  defaultPrimary?: boolean;
  extraPaths?: string[];
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  enabled: boolean;
  notes?: string;
  lastTestStatus?: "OK" | "FAIL" | "UNKNOWN";
  lastTestAt?: string;
}

export interface FieldMapping {
  fieldKey: string;
  providerId: string;
  endpointPath: string;
  parseRule: string;
  refreshSec: number;
  enabled: boolean;
}

export interface AdminConfig {
  providers: ProviderConfig[];
  mappings: FieldMapping[];
  globalRefreshSec: number;
  feeds: {
    prices: boolean;
    derivatives: boolean;
    marketCap: boolean;
  };
  tradeIdeas: {
    minConfidence: number;
    modeMinConfidence: Record<ScoringMode, number>;
    sharedMode: Exclude<ScoringMode, "FLOW">;
    flowDefaults: Pick<FlowModeSettingsConfig, "minConsensus" | "minValidBars" | "requireValidTrade">;
    dashboardConsensus: {
      activeMin: number;
      strongMin: number;
      eliteMin: number;
    };
    dashboardIdeaRisk: {
      entryAtrFactor: number;
      stopAtrFactor: number;
      targetAtrFactor: number;
      target2Multiplier: number;
    };
  };
  branding: {
    logoDataUrl?: string;
    emblemDataUrl?: string;
  };
  tradingView: {
    enabled: boolean;
    apiKey?: string;
    apiSecret?: string;
    widgetDomain?: string;
    defaultExchange?: "BINANCE" | "BYBIT" | "OKX" | "GATEIO";
  };
}

export interface TradePlan {
  id: string;
  createdAt: string;
  symbol: string;
  scoringMode?: ScoringMode;
  approvedModes?: ScoringMode[];
  modeScores?: Partial<Record<ScoringMode, number>>;
  direction: "LONG" | "SHORT";
  horizon: "SCALP" | "INTRADAY" | "SWING";
  timeframe: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
  setup: string;
  confidence: number;

  tradeValidity: "VALID" | "WEAK" | "NO-TRADE";
  entryWindow: "OPEN" | "NARROW" | "CLOSED";
  slippageRisk: "LOW" | "MED" | "HIGH";
  triggersToActivate: string[];
  invalidation: string;

  timestampUtc: string;
  validUntilBars: number;
  validUntilUtc: string;

  entry: { low: number; high: number; raw: string; type?: "LIMIT" | "MARKET" | "STOP_LIMIT"; trigger?: string };
  stops: Array<{ label: string; price: number; sharePct: number }>;
  targets: Array<{ label: string; price: number; sharePct: number }>;
  marketState: { trend: string; htfBias: string; volatility: string; execution: string };
  flowAnalysis: string[];
  tradeIntent: string[];
  disclaimer: string;
  rawText: string;
  incomplete?: boolean;
  status?: "PENDING" | "ACTIVE" | "RESOLVED" | "CANCELLED" | "EXPIRED";
  result?: "SUCCESS" | "FAIL" | "NONE";
  hitLevelType?: "TP" | "SL" | null;
  hitLevelIndex?: number | null;
  hitLevelPrice?: number | null;
  minutesToEntry?: number | null;
  minutesToExit?: number | null;
  minutesTotal?: number | null;
}
