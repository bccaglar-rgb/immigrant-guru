import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { INDICATOR_GROUPS, INDICATOR_LABELS, useIndicatorsStore } from "../hooks/useIndicatorsStore";
import { useExchangeTerminalStore } from "../hooks/useExchangeTerminalStore";
import { useMarketData } from "../hooks/useMarketData";
import { AiTraderTopTabs } from "../components/AiTraderTopTabs";
import type { IndicatorGroupKey, IndicatorKey } from "../types";
import { publishStrategyTrader } from "../services/aiTraderLeaderboardStore";
import { consumePendingStrategyCopy } from "../services/strategyClipboardStore";

type StrategyType = "AI_TRADING" | "AI_GRID";
type StyleType = "SCALPING" | "INTRADAY" | "SWING" | "POSITION";
type DirectionMode = "BOTH" | "LONG_ONLY" | "SHORT_ONLY";
type SourceType = "STATIC_LIST" | "AI500" | "OI_INCREASE" | "OI_DECREASE" | "MIXED";
type RoutingMode = "FLOW" | "AGGRESSIVE" | "BALANCED" | "CAPITAL_GUARD";
type RoutingSourceKey = "flow" | "ai500" | "oiIncrease" | "oiDecrease" | "staticList";
type PromptFieldKey = "role" | "frequency" | "entry" | "decision" | "extra";
type DslFieldKey =
  | "thesis"
  | "entryRules"
  | "exitRules"
  | "riskRules"
  | "sizingRules"
  | "positionManagement"
  | "marketRegimeRules"
  | "tradeFilters"
  | "cooldownRules"
  | "reEntryRules";
type IntelligenceFieldKey =
  | "consensus"
  | "layerStructure"
  | "layerLiquidity"
  | "layerPositioning"
  | "layerExecution"
  | "layerVolatility"
  | "layerRisk"
  | "tradeValidity"
  | "riskGate"
  | "bias"
  | "regime"
  | "trendDirection"
  | "trendStrength"
  | "vwapConfluence"
  | "selectedSymbol"
  | "selectedInterval"
  | "source"
  | "activeSource"
  | "fallbackActive"
  | "entryWindow"
  | "slippageState"
  | "fillProb"
  | "capacity"
  | "edgeR"
  | "riskAdjEdgeR"
  | "pWin"
  | "expectedRR"
  | "holdBars"
  | "price"
  | "volume24h"
  | "change24h"
  | "latencyMs"
  | "staleAgeSec"
  | "health"
  | "spreadBps"
  | "depthUsd"
  | "orderbookImbalance"
  | "marketSpeed"
  | "tradeDelta1m"
  | "tradeVolume1m"
  | "funding8h"
  | "openInterestUsdt"
  | "oiChange1h"
  | "liquidationUsd";

interface StrategySection {
  key: string;
  title: string;
  hint: string;
  icon: string;
  iconColor: string;
}

interface StaticCoinList {
  id: string;
  name: string;
  coins: string[];
  createdAt: string;
}

interface ModeRoutingConfig {
  enabled: boolean;
  minConfidence: number;
  sources: Record<RoutingSourceKey, boolean>;
}

interface IntelligenceFieldOption {
  key: IntelligenceFieldKey;
  label: string;
  promptLabel: string;
}

interface IndicatorPromptResult {
  key: IndicatorKey;
  label: string;
  group: IndicatorGroupKey;
  status: string;
  value: string;
  settings: Record<string, number | string | boolean | string[]>;
}

interface EntryConfiguration {
  minPositionSizeUsdt: number;
  maxPositionSizeUsdt: number;
  minPositionRatioPct: number;
  minConfidencePct: number;
  defaultEntryTolerancePct: number;
  maxPositions: number;
  directionMode: DirectionMode;
}

interface RiskManagementConfiguration {
  btcEthTradingLeverageX: number;
  altcoinTradingLeverageX: number;
  btcEthMinLeverageX: number;
  altcoinMinLeverageX: number;
  btcEthPositionValueRatioX: number;
  altcoinPositionValueRatioX: number;
  minRiskRewardRatio: number;
  maxMarginUsagePct: number;
  minMarginRatioPct: number;
}

type PromptBlockKey =
  | "strategy_type"
  | "market_universe"
  | "market_intelligence"
  | "indicators"
  | "risk_management"
  | "entry_exit_configuration"
  | "strategy_dsl"
  | "prompt_editor"
  | "publish";

interface PromptPriorityBlock {
  key: PromptBlockKey;
  title: string;
  enabled: boolean;
  payload: Record<string, unknown>;
}

const sections: StrategySection[] = [
  { key: "market-universe", title: "Market Universe", hint: "Set which coins and markets the system can trade.", icon: "🌐", iconColor: "text-[#6ec4ff]" },
  { key: "intelligence", title: "Bitrium Market Intelligence Engine", hint: "Analyzes market context and prepares AI-ready inputs.", icon: "🧠", iconColor: "text-[#F5C542]" },
  { key: "indicators", title: "Indicators", hint: "Add visual and quantitative filters for entries and exits.", icon: "📈", iconColor: "text-[#2bc48a]" },
  { key: "risk", title: "Risk Management", hint: "Control max risk, drawdown limits, and stop protections.", icon: "🛡", iconColor: "text-[#f5b35e]" },
  { key: "entry-exit", title: "Entry & Exit Configuration", hint: "Configure exact entry/exit behavior, validation, and execution rules.", icon: "🎯", iconColor: "text-[#78d3c2]" },
  { key: "dsl", title: "Strategy DSL", hint: "Define what the system is allowed to do and when.", icon: "⚙", iconColor: "text-[#a7b4cc]" },
  { key: "prompt", title: "Prompt Editor", hint: "Shape how the AI model makes decisions.", icon: "✍", iconColor: "text-[#cdb7ff]" },
  { key: "publish", title: "Publish", hint: "Release your strategy configuration to production.", icon: "🚀", iconColor: "text-[#9fe4bf]" },
];

const clsPill = (active: boolean) =>
  `rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
    active
      ? "border-[#F5C542]/70 bg-[#2b2417] text-[#F5C542]"
      : "border-white/15 bg-[#0F1012] text-[var(--textMuted)] hover:border-white/25"
  }`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const INDICATOR_GROUP_BY_KEY = (Object.entries(INDICATOR_GROUPS) as Array<[IndicatorGroupKey, { indicators: IndicatorKey[] }]>).reduce(
  (acc, [group, def]) => {
    def.indicators.forEach((key) => {
      acc[key] = group;
    });
    return acc;
  },
  {} as Record<IndicatorKey, IndicatorGroupKey>,
);

const fmtSettingValue = (value: number | string | boolean | string[]) => {
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
};

const sourceCards: Array<{ key: SourceType; title: string; hint: string; icon: string }> = [
  { key: "STATIC_LIST", title: "Static List", hint: "Manually specify trading coins", icon: "☰" },
  { key: "AI500", title: "AI500 Data Provider", hint: "Use AI500 smart-filtered popular coins", icon: "◉" },
  { key: "OI_INCREASE", title: "OI Increase", hint: "Open interest increase ranking", icon: "↗" },
  { key: "OI_DECREASE", title: "OI Decrease", hint: "Open interest decrease ranking", icon: "↘" },
  { key: "MIXED", title: "AI Modes", hint: "Combine source outputs for AI routing", icon: "⇄" },
];
const DEFAULT_AI500_COINS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "TRX", "ARB", "OP", "SUI", "APT", "INJ", "SEI", "RUNE", "ATOM", "NEAR", "TIA"];
const DEFAULT_OI_INCREASE_COINS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "INJ", "SUI", "APT", "WIF", "JUP", "RUNE", "NEAR", "SEI", "TIA", "TRX", "OP"];
const DEFAULT_OI_DECREASE_COINS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "ATOM", "ARB", "OP", "NEAR", "SEI", "APT", "INJ", "TRX", "TIA", "SUI", "RUNE"];
const ROUTING_MODES: Array<{ key: RoutingMode; label: string; tone: string }> = [
  { key: "FLOW", label: "Flow", tone: "border-[#6a5fc8]/60 bg-[#1f1a35] text-[#d7cffd]" },
  { key: "AGGRESSIVE", label: "Aggressive", tone: "border-[#9a5d57]/60 bg-[#2b1918] text-[#efc1bb]" },
  { key: "BALANCED", label: "Balanced", tone: "border-[#8e7339]/60 bg-[#2a2415] text-[#f1d089]" },
  { key: "CAPITAL_GUARD", label: "Capital Guard", tone: "border-[#4f6f58]/60 bg-[#1c2620] text-[#b8d8c4]" },
];
const ROUTING_SOURCE_OPTIONS: Array<{ key: RoutingSourceKey; label: string }> = [
  { key: "flow", label: "Flow Source Data" },
  { key: "ai500", label: "AI500 Provider" },
  { key: "oiIncrease", label: "OI Increase" },
  { key: "oiDecrease", label: "OI Decrease" },
  { key: "staticList", label: "Static List" },
];
const DEFAULT_ROUTING_SOURCES: Record<RoutingSourceKey, boolean> = {
  flow: true,
  ai500: true,
  oiIncrease: true,
  oiDecrease: true,
  staticList: true,
};
const DEFAULT_MODE_ROUTING: Record<RoutingMode, ModeRoutingConfig> = {
  FLOW: { enabled: true, minConfidence: 70, sources: { ...DEFAULT_ROUTING_SOURCES } },
  AGGRESSIVE: { enabled: true, minConfidence: 65, sources: { ...DEFAULT_ROUTING_SOURCES } },
  BALANCED: { enabled: true, minConfidence: 70, sources: { ...DEFAULT_ROUTING_SOURCES } },
  CAPITAL_GUARD: { enabled: true, minConfidence: 75, sources: { ...DEFAULT_ROUTING_SOURCES } },
};
const promptFieldLabels: Array<{ key: PromptFieldKey; label: string }> = [
  { key: "role", label: "Role Definition" },
  { key: "frequency", label: "Trading Frequency" },
  { key: "entry", label: "Entry Standards" },
  { key: "decision", label: "Decision Process" },
  { key: "extra", label: "Extra Prompt" },
];
const dslFieldLabels: Array<{ key: DslFieldKey; label: string; placeholder?: string }> = [
  { key: "thesis", label: "Thesis", placeholder: "Define the core market thesis and strategic intent." },
  { key: "entryRules", label: "Entry Rules", placeholder: "Define entry triggers, confirmations, and invalid conditions." },
  { key: "exitRules", label: "Exit Rules", placeholder: "Define TP/SL behavior and exit priorities." },
  { key: "riskRules", label: "Risk Rules", placeholder: "Set risk protections and non-negotiable limits." },
  { key: "sizingRules", label: "Sizing Rules", placeholder: "Define position sizing and scaling logic." },
  { key: "positionManagement", label: "Position Management", placeholder: "Define active position management rules." },
  { key: "marketRegimeRules", label: "Market Regime Rules", placeholder: "Set behavior across trend/range/high-volatility regimes." },
  { key: "tradeFilters", label: "Trade Filters", placeholder: "Specify additional filters that can block execution." },
  { key: "cooldownRules", label: "Cooldown Rules", placeholder: "Set cooldown behavior after trade close or invalidation." },
  { key: "reEntryRules", label: "Re-entry Rules", placeholder: "Define conditions for re-entry after an exit." },
];
const INTELLIGENCE_FIELD_OPTIONS: IntelligenceFieldOption[] = [
  { key: "consensus", label: "Consensus", promptLabel: "Consensus" },
  { key: "layerStructure", label: "Structure Layer", promptLabel: "Structure Layer Score" },
  { key: "layerLiquidity", label: "Liquidity Layer", promptLabel: "Liquidity Layer Score" },
  { key: "layerPositioning", label: "Positioning Layer", promptLabel: "Positioning Layer Score" },
  { key: "layerExecution", label: "Execution Layer", promptLabel: "Execution Layer Score" },
  { key: "layerVolatility", label: "Volatility Layer", promptLabel: "Volatility Layer Score" },
  { key: "layerRisk", label: "Risk Layer", promptLabel: "Risk Layer Score" },
  { key: "tradeValidity", label: "Trade Validity", promptLabel: "Trade Validity" },
  { key: "riskGate", label: "Risk Gate", promptLabel: "Risk Gate" },
  { key: "bias", label: "Bias", promptLabel: "Bias" },
  { key: "regime", label: "Regime", promptLabel: "Market Regime" },
  { key: "trendDirection", label: "Trend Direction", promptLabel: "Trend Direction" },
  { key: "trendStrength", label: "Trend Strength", promptLabel: "Trend Strength" },
  { key: "vwapConfluence", label: "VWAP Confluence", promptLabel: "VWAP Confluence" },
  { key: "selectedSymbol", label: "Selected Symbol", promptLabel: "Selected Symbol" },
  { key: "selectedInterval", label: "Selected Interval", promptLabel: "Selected Interval" },
  { key: "source", label: "Source", promptLabel: "Data Source" },
  { key: "activeSource", label: "Active Source", promptLabel: "Active Source" },
  { key: "fallbackActive", label: "Fallback Active", promptLabel: "Fallback Active" },
  { key: "entryWindow", label: "Entry Window", promptLabel: "Entry Window" },
  { key: "slippageState", label: "Slippage State", promptLabel: "Slippage State" },
  { key: "fillProb", label: "Fill Probability", promptLabel: "Fill Probability" },
  { key: "capacity", label: "Capacity", promptLabel: "Capacity" },
  { key: "edgeR", label: "Edge R", promptLabel: "Edge (R)" },
  { key: "riskAdjEdgeR", label: "Risk-Adj Edge", promptLabel: "Risk-Adjusted Edge (R)" },
  { key: "pWin", label: "Win Probability", promptLabel: "Win Probability" },
  { key: "expectedRR", label: "Expected RR", promptLabel: "Expected RR" },
  { key: "holdBars", label: "Expected Hold", promptLabel: "Expected Hold (bars)" },
  { key: "price", label: "Price", promptLabel: "Price" },
  { key: "volume24h", label: "24h Volume", promptLabel: "24h Volume" },
  { key: "change24h", label: "24h Change", promptLabel: "24h Change" },
  { key: "latencyMs", label: "Latency", promptLabel: "Latency" },
  { key: "staleAgeSec", label: "Stale Age", promptLabel: "Stale Age (sec)" },
  { key: "health", label: "Health", promptLabel: "Feed Health" },
  { key: "spreadBps", label: "Spread", promptLabel: "Spread (bps)" },
  { key: "depthUsd", label: "Depth (USD)", promptLabel: "Orderbook Depth (USD)" },
  { key: "orderbookImbalance", label: "OB Imbalance", promptLabel: "Orderbook Imbalance" },
  { key: "marketSpeed", label: "Market Speed", promptLabel: "Market Speed (tpm)" },
  { key: "tradeDelta1m", label: "Trade Delta 1m", promptLabel: "Trade Delta 1m" },
  { key: "tradeVolume1m", label: "Trade Volume 1m", promptLabel: "Trade Volume 1m" },
  { key: "funding8h", label: "Funding (8h)", promptLabel: "Funding (8h)" },
  { key: "openInterestUsdt", label: "Open Interest", promptLabel: "Open Interest (USDT)" },
  { key: "oiChange1h", label: "OI Change 1h", promptLabel: "Open Interest Change 1h" },
  { key: "liquidationUsd", label: "Liquidation", promptLabel: "Liquidation (USD)" },
];
const DEFAULT_INTELLIGENCE_SELECTION: Record<IntelligenceFieldKey, boolean> = INTELLIGENCE_FIELD_OPTIONS.reduce(
  (acc, item) => ({ ...acc, [item.key]: true }),
  {} as Record<IntelligenceFieldKey, boolean>,
);

const PROMPT_BLOCK_TITLES: Record<PromptBlockKey, string> = {
  strategy_type: "Strategy Type",
  market_universe: "Market Universe",
  market_intelligence: "Bitrium Market Intelligence Engine",
  indicators: "Indicators",
  risk_management: "Risk Management",
  entry_exit_configuration: "Entry & Exit Configuration",
  strategy_dsl: "Strategy DSL",
  prompt_editor: "Prompt Editor",
  publish: "Publish",
};

const buildIndicatorPromptResult = (
  key: IndicatorKey,
  summary: {
    trendDirection: string;
    trendStrength: string;
    vwapConfluence: boolean;
    spreadBps: number;
    change: number;
    speed: number;
    fillProb: number;
    capacity: number;
    orderbookImbalance: number;
    tradeDelta1m: number;
    depthUsd: number;
    consensus: number;
    regime: string;
    tradeValidity: string;
    riskGate: string;
    edgeR: number;
  },
): { status: string; value: string } => {
  const strength = summary.trendStrength;
  const dir = summary.trendDirection;
  const rsiLike = clamp(50 + summary.change * 8, 5, 95);
  const cciLike = clamp(summary.change * 22, -250, 250);
  const momentumLike = clamp(summary.speed / 5, 0, 100);
  switch (key) {
    case "ema":
      return { status: dir === "UP" ? "BULL" : dir === "DOWN" ? "BEAR" : "NEUTRAL", value: `trend=${dir}` };
    case "vwap":
      return { status: summary.vwapConfluence ? "CONFLUENT" : "OFFSIDE", value: summary.vwapConfluence ? "aligned" : "not_aligned" };
    case "adx":
      return { status: strength, value: `strength=${strength}` };
    case "supertrend":
    case "ichimoku":
      return { status: dir === "UP" ? "BULL" : dir === "DOWN" ? "BEAR" : "NEUTRAL", value: `trend=${dir}` };
    case "pivotPoints":
      return { status: summary.tradeValidity, value: `regime=${summary.regime}` };
    case "rsi":
      return { status: rsiLike >= 70 ? "OVERBOUGHT" : rsiLike <= 30 ? "OVERSOLD" : "NEUTRAL", value: `rsi~${rsiLike.toFixed(1)}` };
    case "macd":
      return { status: dir === "UP" ? "BULL_CROSS" : dir === "DOWN" ? "BEAR_CROSS" : "FLAT", value: `delta1m=${summary.tradeDelta1m.toFixed(3)}` };
    case "stochRsi":
      return { status: rsiLike >= 80 ? "HIGH" : rsiLike <= 20 ? "LOW" : "MID", value: `stoch~${clamp((rsiLike / 100) * 100, 0, 100).toFixed(1)}` };
    case "cci":
      return { status: cciLike >= 100 ? "BULL" : cciLike <= -100 ? "BEAR" : "NEUTRAL", value: `cci~${cciLike.toFixed(1)}` };
    case "momentumOsc":
      return { status: momentumLike >= 60 ? "FAST" : momentumLike <= 30 ? "SLOW" : "MID", value: `mom~${momentumLike.toFixed(1)}` };
    case "atr":
      return { status: summary.spreadBps > 10 ? "HIGH_VOL" : summary.spreadBps > 5 ? "MID_VOL" : "LOW_VOL", value: `spread=${summary.spreadBps.toFixed(2)}bps` };
    case "bbands":
      return { status: summary.regime === "RANGE" ? "SQUEEZE" : "EXPANSION", value: `regime=${summary.regime}` };
    case "keltner":
      return { status: summary.regime === "TREND" ? "TREND_BAND" : "MEAN_BAND", value: `edge=${summary.edgeR.toFixed(3)}R` };
    case "donchian":
      return { status: summary.regime === "BREAKOUT" ? "BREAKOUT" : "CHANNEL", value: `consensus=${summary.consensus}%` };
    case "volume":
      return { status: summary.speed >= 500 ? "HIGH" : summary.speed >= 200 ? "MID" : "LOW", value: `speed=${Math.round(summary.speed)}tpm` };
    case "volumeMa":
      return { status: summary.speed >= 300 ? "ABOVE_MA" : "BELOW_MA", value: `speed=${Math.round(summary.speed)}tpm` };
    case "obv":
      return { status: summary.orderbookImbalance >= 0 ? "UP" : "DOWN", value: `imbalance=${summary.orderbookImbalance.toFixed(3)}` };
    case "vwma":
      return { status: summary.vwapConfluence ? "ABOVE" : "BELOW", value: summary.vwapConfluence ? "price>vwma" : "price<vwma" };
    case "cvd":
      return { status: summary.tradeDelta1m >= 0 ? "BUY_PRESSURE" : "SELL_PRESSURE", value: `delta1m=${summary.tradeDelta1m.toFixed(3)}` };
    case "buySellImbalance":
      return { status: summary.orderbookImbalance >= 0 ? "BUY_HEAVY" : "SELL_HEAVY", value: `ob=${summary.orderbookImbalance.toFixed(3)}` };
    case "supportResistance":
      return { status: summary.tradeValidity, value: `risk_gate=${summary.riskGate}` };
    case "liquidityZones":
      return { status: summary.depthUsd >= 600000 ? "DENSE" : summary.depthUsd >= 200000 ? "MID" : "THIN", value: `depth=${Math.round(summary.depthUsd)}` };
    case "fairValueGaps":
      return { status: summary.regime === "BREAKOUT" ? "OPEN" : "NONE", value: `regime=${summary.regime}` };
    case "divergence":
      return { status: summary.tradeDelta1m * summary.change < 0 ? "PRESENT" : "NONE", value: `delta=${summary.tradeDelta1m.toFixed(3)} chg=${summary.change.toFixed(2)}%` };
    default:
      return { status: "N/A", value: "N/A" };
  }
};

export default function AiTraderStrategyPage() {
  const indicators = useIndicatorsStore();
  const selectedSymbol = useExchangeTerminalStore((state) => state.selectedSymbol);
  const rawSymbol = useMemo(() => selectedSymbol.replace(/\//g, "").replace(/:/g, ""), [selectedSymbol]);
  const market = useMarketData({
    symbol: rawSymbol || "BTCUSDT",
    interval: "15m",
    lookback: 360,
    overrideKey: "ai-trader-strategy",
  });

  const [strategyName, setStrategyName] = useState("New Strategy");
  const [strategyItems, setStrategyItems] = useState<Array<{ id: string; name: string }>>([
    { id: "strategy-1", name: "New Strategy" },
  ]);
  const [selectedStrategyId, setSelectedStrategyId] = useState("strategy-1");
  const [description, setDescription] = useState("");
  const [strategyType, setStrategyType] = useState<StrategyType>("AI_TRADING");
  const [style, setStyle] = useState<StyleType>("INTRADAY");
  const [proMode, setProMode] = useState(true);
  const [active, setActive] = useState(true);
  const [selectedSourceTypes, setSelectedSourceTypes] = useState<SourceType[]>(["AI500"]);
  const [ai500Limit, setAi500Limit] = useState(10);
  const [oiIncreaseLimit, setOiIncreaseLimit] = useState(10);
  const [oiDecreaseLimit, setOiDecreaseLimit] = useState(10);
  const [modeRouting, setModeRouting] = useState<Record<RoutingMode, ModeRoutingConfig>>({
    FLOW: { ...DEFAULT_MODE_ROUTING.FLOW, sources: { ...DEFAULT_MODE_ROUTING.FLOW.sources } },
    AGGRESSIVE: { ...DEFAULT_MODE_ROUTING.AGGRESSIVE, sources: { ...DEFAULT_MODE_ROUTING.AGGRESSIVE.sources } },
    BALANCED: { ...DEFAULT_MODE_ROUTING.BALANCED, sources: { ...DEFAULT_MODE_ROUTING.BALANCED.sources } },
    CAPITAL_GUARD: { ...DEFAULT_MODE_ROUTING.CAPITAL_GUARD, sources: { ...DEFAULT_MODE_ROUTING.CAPITAL_GUARD.sources } },
  });
  const [staticListName, setStaticListName] = useState("");
  const [staticListCoinsDraft, setStaticListCoinsDraft] = useState("");
  const [staticLists, setStaticLists] = useState<StaticCoinList[]>([
    {
      id: "core-top10",
      name: "Core Top 10",
      coins: ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "TRX"],
      createdAt: new Date().toISOString(),
    },
  ]);
  const [activeStaticListId, setActiveStaticListId] = useState("core-top10");
  const [promptValues, setPromptValues] = useState<Record<PromptFieldKey, string>>({
    role: "You are an institutional crypto execution model focused on disciplined entries and strict invalidation.",
    frequency: "Scan every 5m bar, execute only on confirmed setups, maximum 3 trades per session.",
    entry: "Only enter when structure aligns with trend, liquidity context supports direction, and slippage is acceptable.",
    decision: "Validate regime, score conflicts, confirm entry window and RR, then decide VALID / WEAK / NO-TRADE.",
    extra: "",
  });
  const [promptOpen, setPromptOpen] = useState<Record<PromptFieldKey, boolean>>({
    role: false,
    frequency: false,
    entry: false,
    decision: false,
    extra: false,
  });
  const [dslValues, setDslValues] = useState<Record<DslFieldKey, string>>({
    thesis: "Trade with momentum alignment and strong execution quality.",
    entryRules: "Enter only when key trigger confirms and entry window is OPEN.",
    exitRules: "Prioritize protective exits first, then target execution.",
    riskRules: "Block trades on stale data, extreme slippage, or invalid risk gate.",
    sizingRules: "Use capped risk per trade and reduce size under stress.",
    positionManagement: "Manage open positions only on valid updates and avoid over-adjustment.",
    marketRegimeRules: "Adapt behavior by TREND/RANGE state and volatility regime.",
    tradeFilters: "Reject duplicate setups and low-quality execution contexts.",
    cooldownRules: "Apply cooldown period after close before new entries.",
    reEntryRules: "Allow re-entry only after fresh signal confirmation.",
  });
  const [dslOpen, setDslOpen] = useState<Record<DslFieldKey, boolean>>({
    thesis: false,
    entryRules: false,
    exitRules: false,
    riskRules: false,
    sizingRules: false,
    positionManagement: false,
    marketRegimeRules: false,
    tradeFilters: false,
    cooldownRules: false,
    reEntryRules: false,
  });
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [indicatorOpenRows, setIndicatorOpenRows] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    "market-universe": true,
    intelligence: false,
    indicators: false,
    risk: false,
    "entry-exit": false,
    dsl: false,
    prompt: false,
    publish: false,
  });
  const [strategyTypeExpanded, setStrategyTypeExpanded] = useState(false);
  const [aiInputSelection, setAiInputSelection] = useState<Record<IntelligenceFieldKey, boolean>>({
    ...DEFAULT_INTELLIGENCE_SELECTION,
  });
  const [entryConfig, setEntryConfig] = useState<EntryConfiguration>({
    minPositionSizeUsdt: 50,
    maxPositionSizeUsdt: 1000,
    minPositionRatioPct: 0,
    minConfidencePct: 59,
    defaultEntryTolerancePct: 0.9,
    maxPositions: 10,
    directionMode: "BOTH",
  });
  const [riskConfig, setRiskConfig] = useState<RiskManagementConfiguration>({
    btcEthTradingLeverageX: 10,
    altcoinTradingLeverageX: 10,
    btcEthMinLeverageX: 10,
    altcoinMinLeverageX: 10,
    btcEthPositionValueRatioX: 4.5,
    altcoinPositionValueRatioX: 4.5,
    minRiskRewardRatio: 1,
    maxMarginUsagePct: 65,
    minMarginRatioPct: 11,
  });
  const [generatedPromptText, setGeneratedPromptText] = useState("");
  const [publishNotice, setPublishNotice] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const pending = consumePendingStrategyCopy();
    if (!pending) return;
    const nextId = `strategy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextName = pending.name?.trim() || "Imported Strategy";
    const importDescription = `Imported from leaderboard trader ${pending.traderName} (${pending.model} · ${pending.venue}).`;
    setStrategyItems((prev) => [{ id: nextId, name: nextName }, ...prev]);
    setSelectedStrategyId(nextId);
    setStrategyName(nextName);
    setDescription(importDescription);
    setStrategyType("AI_TRADING");
    setStyle(pending.style ?? "INTRADAY");
    setPublishNotice(`Strategy "${nextName}" was copied from leaderboard and added to your list.`);
  }, []);

  const summary = useMemo(() => {
    const selected = sections.filter((section) => expanded[section.key]).length;
    return `${selected}/${sections.length} modules configured`;
  }, [expanded]);

  const filteredIndicators = useMemo(() => {
    const q = indicatorSearch.trim().toLowerCase();
    return (Object.keys(indicators.state.indicators) as Array<keyof typeof indicators.state.indicators>).filter((key) => {
      if (!q) return true;
      const label = INDICATOR_LABELS[key].toLowerCase();
      return label.includes(q) || key.toLowerCase().includes(q);
    });
  }, [indicatorSearch, indicators.state.indicators]);

  const intelligenceSummary = useMemo(() => {
    const ticker = market.ticker;
    const derivatives = market.derivatives;
    const orderbook = market.orderbook;
    const trades = market.trades;
    const close = ticker?.price ?? 0;
    const change = ticker?.change24hPct ?? 0;
    const absChange = Math.abs(change);
    const spreadBps = orderbook?.spreadBps ?? 0;
    const funding = derivatives?.fundingRate ?? 0;
    const oi = derivatives?.oiValue ?? 0;
    const oiChange1h = derivatives?.oiChange1h ?? 0;
    const liquidationUsd = derivatives?.liquidationUsd ?? 0;
    const depthUsd = orderbook?.depthUsd ?? 0;
    const orderbookImbalance = orderbook?.imbalance ?? 0;
    const speed = trades?.speedTpm ?? 0;
    const tradeDelta1m = trades?.deltaBtc1m ?? 0;
    const tradeVolume1m = trades?.volumeBtc1m ?? 0;
    const stale = market.stale;
    const latencyMs = market.latencyMs ?? 0;
    const staleAgeSec = market.staleAgeSec ?? 0;

    const regime = absChange < 0.6 ? "RANGE" : absChange > 2 ? "BREAKOUT" : "TREND";
    const trendDirection = change > 0.15 ? "UP" : change < -0.15 ? "DOWN" : "FLAT";
    const trendStrength = absChange >= 1.5 ? "STRONG" : absChange >= 0.7 ? "MID" : "LOW";
    const vwapConfluence = (change >= 0 && orderbookImbalance >= 0) || (change < 0 && orderbookImbalance < 0);
    const entryWindow = stale ? "CLOSED" : "OPEN";
    const slippageState = spreadBps > 10 ? "HIGH" : spreadBps > 5 ? "MED" : "LOW";

    const depthNorm = clamp(depthUsd / 700000, 0, 1);
    const spreadPenalty = clamp(spreadBps / 40, 0, 0.8);
    const speedNorm = clamp(speed / 900, 0, 1);
    const fillProb = clamp(0.22 + depthNorm * 0.45 + speedNorm * 0.16 - spreadPenalty, 0.05, 0.98);
    const capacity = clamp(depthNorm * 1.1 - spreadPenalty * 0.35, 0.05, 1);
    const edgeR = clamp(absChange * 0.06 + speedNorm * 0.12 - spreadBps * 0.012 + depthNorm * 0.1 - (stale ? 0.08 : 0), -0.25, 1.2);
    const riskAdjEdgeR = clamp(
      edgeR * (stale ? 0.75 : 1) * (slippageState === "HIGH" ? 0.78 : slippageState === "MED" ? 0.9 : 1),
      -0.4,
      1.2,
    );
    const pWin = clamp(0.42 + fillProb * 0.3 + clamp(riskAdjEdgeR, -0.2, 0.8) * 0.15, 0.2, 0.94);
    const expectedRR = clamp(1 + absChange * 0.35 + (spreadBps < 4 ? 0.2 : 0) - (spreadBps > 10 ? 0.2 : 0), 0.7, 3.5);
    const holdBars = Math.max(4, Math.round(8 + absChange * 4 + speedNorm * 6));

    const structureScore = clamp(Math.round(52 + absChange * 18 + (trendDirection === "FLAT" ? -8 : 4)), 0, 100);
    const liquidityScore = clamp(Math.round(45 + depthNorm * 42 - spreadPenalty * 30 + Math.abs(orderbookImbalance) * 6), 0, 100);
    const positioningScore = clamp(
      Math.round(50 + clamp(Math.abs(funding) * 160000, 0, 12) + clamp(Math.abs(oiChange1h) * 8, 0, 16) + clamp(Math.abs(tradeDelta1m) * 40, 0, 14)),
      0,
      100,
    );
    const executionScore = clamp(Math.round(fillProb * 100 * 0.7 + capacity * 100 * 0.3), 0, 100);
    const volatilityScore = clamp(Math.round(40 + absChange * 18 + speedNorm * 22), 0, 100);
    const riskScore = clamp(Math.round(78 - spreadPenalty * 35 - (stale ? 18 : 0) - (latencyMs > 5000 ? 8 : 0)), 0, 100);

    const tradeValidity = executionScore >= 65 && riskScore >= 55 ? "VALID" : executionScore >= 45 ? "WEAK" : "WATCH";
    const riskGate = spreadBps > 12 ? "BLOCK" : "PASS";
    const bias = change >= 0 ? "LONG" : "SHORT";
    const consensus = clamp(
      Math.round(
        structureScore * 0.17 +
          liquidityScore * 0.2 +
          positioningScore * 0.2 +
          executionScore * 0.23 +
          volatilityScore * 0.1 +
          riskScore * 0.1,
      ),
      0,
      100,
    );

    return {
      close,
      change,
      regime,
      trendDirection,
      trendStrength,
      vwapConfluence,
      entryWindow,
      slippageState,
      fillProb,
      capacity,
      edgeR,
      riskAdjEdgeR,
      pWin,
      expectedRR,
      holdBars,
      structureScore,
      liquidityScore,
      positioningScore,
      executionScore,
      volatilityScore,
      riskScore,
      spreadBps,
      funding,
      oi,
      oiChange1h,
      liquidationUsd,
      depthUsd,
      orderbookImbalance,
      speed,
      tradeValidity,
      riskGate,
      bias,
      consensus,
      source: market.sourceChip ?? "Bitrium Labs API",
      activeSource: market.activeSource ?? "N/A",
      fallbackActive: Boolean(market.fallbackActive),
      stale,
      staleAgeSec,
      latencyMs,
      volume24h: ticker?.volume24h ?? 0,
      tradeDelta1m,
      tradeVolume1m,
    };
  }, [market]);

  const intelligenceFieldValues = useMemo<Record<IntelligenceFieldKey, string>>(
    () => ({
      consensus: `${intelligenceSummary.consensus}%`,
      layerStructure: `${intelligenceSummary.structureScore}%`,
      layerLiquidity: `${intelligenceSummary.liquidityScore}%`,
      layerPositioning: `${intelligenceSummary.positioningScore}%`,
      layerExecution: `${intelligenceSummary.executionScore}%`,
      layerVolatility: `${intelligenceSummary.volatilityScore}%`,
      layerRisk: `${intelligenceSummary.riskScore}%`,
      tradeValidity: intelligenceSummary.tradeValidity,
      riskGate: intelligenceSummary.riskGate,
      bias: intelligenceSummary.bias,
      regime: intelligenceSummary.regime,
      trendDirection: intelligenceSummary.trendDirection,
      trendStrength: intelligenceSummary.trendStrength,
      vwapConfluence: intelligenceSummary.vwapConfluence ? "YES" : "NO",
      selectedSymbol: selectedSymbol || "N/A",
      selectedInterval: "15m",
      source: intelligenceSummary.source || "N/A",
      activeSource: intelligenceSummary.activeSource || "N/A",
      fallbackActive: intelligenceSummary.fallbackActive ? "YES" : "NO",
      entryWindow: intelligenceSummary.entryWindow,
      slippageState: intelligenceSummary.slippageState,
      fillProb: `${(intelligenceSummary.fillProb * 100).toFixed(1)}%`,
      capacity: `${(intelligenceSummary.capacity * 100).toFixed(1)}%`,
      edgeR: `${intelligenceSummary.edgeR.toFixed(3)}R`,
      riskAdjEdgeR: `${intelligenceSummary.riskAdjEdgeR.toFixed(3)}R`,
      pWin: `${(intelligenceSummary.pWin * 100).toFixed(1)}%`,
      expectedRR: intelligenceSummary.expectedRR.toFixed(2),
      holdBars: `${intelligenceSummary.holdBars} bars`,
      price: intelligenceSummary.close ? intelligenceSummary.close.toFixed(2) : "N/A",
      volume24h: intelligenceSummary.volume24h ? intelligenceSummary.volume24h.toLocaleString() : "N/A",
      change24h: `${intelligenceSummary.change.toFixed(2)}%`,
      latencyMs: `${intelligenceSummary.latencyMs}ms`,
      staleAgeSec: `${Math.max(0, Math.floor(intelligenceSummary.staleAgeSec))}`,
      health: intelligenceSummary.stale ? "STALE" : "GOOD",
      spreadBps: `${intelligenceSummary.spreadBps.toFixed(2)}`,
      depthUsd: intelligenceSummary.depthUsd ? intelligenceSummary.depthUsd.toLocaleString() : "N/A",
      orderbookImbalance: intelligenceSummary.orderbookImbalance.toFixed(3),
      marketSpeed: `${Math.round(intelligenceSummary.speed)}`,
      tradeDelta1m: intelligenceSummary.tradeDelta1m.toFixed(3),
      tradeVolume1m: intelligenceSummary.tradeVolume1m.toFixed(3),
      funding8h: `${intelligenceSummary.funding.toFixed(6)}%`,
      openInterestUsdt: intelligenceSummary.oi ? intelligenceSummary.oi.toLocaleString() : "N/A",
      oiChange1h: `${intelligenceSummary.oiChange1h.toFixed(3)}%`,
      liquidationUsd: intelligenceSummary.liquidationUsd ? intelligenceSummary.liquidationUsd.toLocaleString() : "0",
    }),
    [intelligenceSummary, selectedSymbol],
  );

  const selectedIndicatorResults = useMemo<IndicatorPromptResult[]>(() => {
    if (!indicators.state.masterEnabled) return [];
    return (Object.keys(indicators.state.indicators) as IndicatorKey[])
      .filter((indicatorKey) => {
        const group = INDICATOR_GROUP_BY_KEY[indicatorKey];
        return indicators.state.groups[group].enabled && indicators.state.indicators[indicatorKey].enabled;
      })
      .map((indicatorKey) => {
        const indicator = indicators.state.indicators[indicatorKey];
        const group = INDICATOR_GROUP_BY_KEY[indicatorKey];
        const result = buildIndicatorPromptResult(indicatorKey, intelligenceSummary);
        return {
          key: indicatorKey,
          label: INDICATOR_LABELS[indicatorKey],
          group,
          status: result.status,
          value: result.value,
          settings: indicator.settings,
        };
      });
  }, [indicators.state, intelligenceSummary]);

  const selectedIndicatorPromptLines = useMemo(
    () =>
      selectedIndicatorResults.map((indicator) => {
        const settingsSummary = Object.entries(indicator.settings)
          .slice(0, 4)
          .map(([k, v]) => `${k}=${fmtSettingValue(v)}`)
          .join(", ");
        return `${indicator.label} (${indicator.group}): ${indicator.status} | ${indicator.value}${settingsSummary ? ` | ${settingsSummary}` : ""}`;
      }),
    [selectedIndicatorResults],
  );

  const selectedAiInputs = useMemo(
    () => INTELLIGENCE_FIELD_OPTIONS.filter((item) => aiInputSelection[item.key]),
    [aiInputSelection],
  );

  const activeStaticList = useMemo(
    () => staticLists.find((item) => item.id === activeStaticListId) ?? null,
    [activeStaticListId, staticLists],
  );

  const sourceTypeSet = useMemo(() => new Set<SourceType>(selectedSourceTypes), [selectedSourceTypes]);

  const selectedSourceCoins = useMemo(() => {
    const staticCoins = activeStaticList?.coins ?? [];
    const ai500Coins = DEFAULT_AI500_COINS.slice(0, ai500Limit);
    const oiIncreaseCoins = DEFAULT_OI_INCREASE_COINS.slice(0, oiIncreaseLimit);
    const oiDecreaseCoins = DEFAULT_OI_DECREASE_COINS.slice(0, oiDecreaseLimit);
    const selected: string[] = [];
    if (sourceTypeSet.has("STATIC_LIST")) selected.push(...staticCoins);
    if (sourceTypeSet.has("AI500")) selected.push(...ai500Coins);
    if (sourceTypeSet.has("OI_INCREASE")) selected.push(...oiIncreaseCoins);
    if (sourceTypeSet.has("OI_DECREASE")) selected.push(...oiDecreaseCoins);
    if (!selected.length) selected.push(...ai500Coins);
    return Array.from(new Set(selected));
  }, [activeStaticList, ai500Limit, oiDecreaseLimit, oiIncreaseLimit, sourceTypeSet]);

  const sourceTypeLabel = useMemo(() => {
    const labels = sourceCards
      .filter((card) => sourceTypeSet.has(card.key))
      .map((card) => card.title);
    return labels.length ? labels.join(" + ") : "AI500 Data Provider";
  }, [sourceTypeSet]);

  const aiModesEnabled = sourceTypeSet.has("MIXED");
  const primarySourceType: SourceType = selectedSourceTypes.length === 1 ? selectedSourceTypes[0] : "MIXED";

  const positionSizingModeSummary = useMemo(() => {
    const minSize = entryConfig.minPositionSizeUsdt;
    const maxSize = entryConfig.maxPositionSizeUsdt;
    const minRatio = entryConfig.minPositionRatioPct;
    if (maxSize > 0) {
      return {
        mode: "MIN_PLUS_MAX_NOTIONAL",
        rule: `Use min_position_size_usdt=${minSize} and max_position_size_usdt=${maxSize}. Ignore min_position_ratio_pct.`,
      };
    }
    if (minRatio > 0) {
      return {
        mode: "MIN_NOTIONAL_PLUS_MIN_RATIO",
        rule: `Use min_position_size_usdt=${minSize} and min_position_ratio_pct=${minRatio}. max_position_size_usdt is disabled.`,
      };
    }
    return {
      mode: "MIN_NOTIONAL_ONLY",
      rule: `Use min_position_size_usdt=${minSize}. No max notional and no min ratio constraint.`,
    };
  }, [entryConfig.maxPositionSizeUsdt, entryConfig.minPositionRatioPct, entryConfig.minPositionSizeUsdt]);

  const aiContextLines = useMemo(
    () => selectedAiInputs.map((item) => `${item.promptLabel}: ${intelligenceFieldValues[item.key]}`),
    [intelligenceFieldValues, selectedAiInputs],
  );

  const selectedDslEntries = useMemo(
    () =>
      dslFieldLabels
        .map(({ key, label }) => ({ key, label, value: (dslValues[key] ?? "").trim() }))
        .filter((entry) => entry.value.length > 0),
    [dslValues],
  );

  const selectedPromptEditorEntries = useMemo(
    () =>
      promptFieldLabels
        .map(({ key, label }) => ({ key, label, value: (promptValues[key] ?? "").trim() }))
        .filter((entry) => entry.value.length > 0),
    [promptValues],
  );

  const promptPriorityBlocks = useMemo<PromptPriorityBlock[]>(() => {
    const blocks: PromptPriorityBlock[] = [
      {
        key: "strategy_type",
        title: PROMPT_BLOCK_TITLES.strategy_type,
        enabled: true,
        payload: {
          strategy_id: selectedStrategyId,
          strategy_name: strategyName.trim() || "New Strategy",
          strategy_type: strategyType,
          style_profile: style,
          active,
          pro_mode: proMode,
        },
      },
      {
        key: "market_universe",
        title: PROMPT_BLOCK_TITLES.market_universe,
        enabled: selectedSourceCoins.length > 0,
        payload: {
          primary_source_type: primarySourceType,
          selected_source_types: selectedSourceTypes,
          selected_coins: selectedSourceCoins,
          static_list: activeStaticList
            ? {
                id: activeStaticList.id,
                name: activeStaticList.name,
                coins: activeStaticList.coins,
              }
            : null,
        },
      },
      {
        key: "market_intelligence",
        title: PROMPT_BLOCK_TITLES.market_intelligence,
        enabled: selectedAiInputs.length > 0,
        payload: {
          selected_fields: selectedAiInputs.map((item) => item.key),
          field_lines: aiContextLines,
        },
      },
      {
        key: "indicators",
        title: PROMPT_BLOCK_TITLES.indicators,
        enabled: indicators.state.masterEnabled && selectedIndicatorResults.length > 0,
        payload: {
          master_enabled: indicators.state.masterEnabled,
          selected: selectedIndicatorResults,
          lines: selectedIndicatorPromptLines,
        },
      },
      {
        key: "risk_management",
        title: PROMPT_BLOCK_TITLES.risk_management,
        enabled: true,
        payload: riskConfig as unknown as Record<string, unknown>,
      },
      {
        key: "entry_exit_configuration",
        title: PROMPT_BLOCK_TITLES.entry_exit_configuration,
        enabled: true,
        payload: {
          ...entryConfig,
          position_sizing_summary: positionSizingModeSummary,
        } as unknown as Record<string, unknown>,
      },
      {
        key: "strategy_dsl",
        title: PROMPT_BLOCK_TITLES.strategy_dsl,
        enabled: selectedDslEntries.length > 0,
        payload: {
          entries: selectedDslEntries,
        },
      },
      {
        key: "prompt_editor",
        title: PROMPT_BLOCK_TITLES.prompt_editor,
        enabled: selectedPromptEditorEntries.length > 0,
        payload: {
          entries: selectedPromptEditorEntries,
        },
      },
      {
        key: "publish",
        title: PROMPT_BLOCK_TITLES.publish,
        enabled: true,
        payload: {
          publish_status: active ? "READY" : "DRAFT",
          modules_summary: summary,
        },
      },
    ];

    const ordered = blocks.filter((block) => block.enabled);
    return ordered.map((block, index) => ({
      ...block,
      payload: {
        priority_order: index + 1,
        ...block.payload,
      },
    }));
  }, [
    active,
    activeStaticList,
    aiContextLines,
    entryConfig,
    indicators.state.masterEnabled,
    positionSizingModeSummary,
    primarySourceType,
    proMode,
    riskConfig,
    selectedAiInputs,
    selectedDslEntries,
    selectedIndicatorPromptLines,
    selectedIndicatorResults,
    selectedPromptEditorEntries,
    selectedSourceCoins,
    selectedSourceTypes,
    selectedStrategyId,
    strategyName,
    strategyType,
    style,
    summary,
  ]);

  const compiledPromptPayload = useMemo(
    () => ({
      task: {
        mode: active ? "LIVE" : "PAUSED",
        objective: "Generate a single trade decision for the next interval.",
        timeframe: "15m",
        allowed_actions: ["LONG", "SHORT", "WAIT", "NO_TRADE", "CLOSE"],
      },
      strategy: {
        strategy_id: selectedStrategyId,
        version: 1,
        name: strategyName.trim() || "New Strategy",
        description: description.trim() || "",
        strategy_type: strategyType,
        style_profile: style,
        priority_rules: ["risk_limits", "hard_blocks", "entry_exit_rules", "signals", "ai_hint"],
      },
      prompt_priority: {
        description: "Selected strategy modules are compiled and ordered by importance.",
        blocks: promptPriorityBlocks.map((block) => ({
          key: block.key,
          title: block.title,
          ...block.payload,
        })),
      },
      universe: {
        source_type: primarySourceType,
        source_types: selectedSourceTypes,
        top_n: selectedSourceCoins.length,
        selected_coins: selectedSourceCoins,
      },
      risk: {
        max_open_positions: entryConfig.maxPositions,
        max_leverage: Math.max(riskConfig.btcEthTradingLeverageX, riskConfig.altcoinTradingLeverageX),
        max_position_usd: entryConfig.maxPositionSizeUsdt,
        min_position_usd: entryConfig.minPositionSizeUsdt,
        min_position_ratio_pct: entryConfig.minPositionRatioPct,
        min_confidence_pct: entryConfig.minConfidencePct,
        position_sizing_summary: positionSizingModeSummary,
        stop_loss_guard_rr: riskConfig.minRiskRewardRatio,
        max_margin_usage_pct: riskConfig.maxMarginUsagePct,
        min_margin_ratio_pct: riskConfig.minMarginRatioPct,
      },
      rules: {
        thesis: dslValues.thesis,
        entry_rules: dslValues.entryRules,
        exit_rules: dslValues.exitRules,
        risk_rules: dslValues.riskRules,
        sizing_rules: dslValues.sizingRules,
        position_management: dslValues.positionManagement,
        market_regime_rules: dslValues.marketRegimeRules,
        trade_filters: dslValues.tradeFilters,
        cooldown_rules: dslValues.cooldownRules,
        re_entry_rules: dslValues.reEntryRules,
      },
      ai_prompt_inputs: selectedAiInputs.map((item) => ({
        key: item.key,
        label: item.promptLabel,
        value: intelligenceFieldValues[item.key],
      })),
      ai_context_lines: aiContextLines,
      indicators: {
        master_enabled: indicators.state.masterEnabled,
        enabled_count: selectedIndicatorResults.length,
        selected: selectedIndicatorResults.map((item) => ({
          key: item.key,
          label: item.label,
          group: item.group,
          status: item.status,
          value: item.value,
          settings: item.settings,
        })),
      },
      indicator_lines: selectedIndicatorPromptLines,
      market_context: {
        symbol: selectedSymbol || "N/A",
        price: intelligenceSummary.close,
        source: intelligenceSummary.source,
        active_source: intelligenceSummary.activeSource,
        fallback_active: intelligenceSummary.fallbackActive,
        regime: intelligenceSummary.regime,
        trend_direction: intelligenceSummary.trendDirection,
        trend_strength: intelligenceSummary.trendStrength,
        spread_bps: intelligenceSummary.spreadBps,
        depth_usd: intelligenceSummary.depthUsd,
        orderbook_imbalance: intelligenceSummary.orderbookImbalance,
        market_speed: intelligenceSummary.speed,
        fill_prob: intelligenceSummary.fillProb,
        capacity: intelligenceSummary.capacity,
        edge_r: intelligenceSummary.edgeR,
        risk_adj_edge_r: intelligenceSummary.riskAdjEdgeR,
      },
      ai_prompt_hint: {
        role: promptValues.role,
        frequency: promptValues.frequency,
        entry_standard: promptValues.entry,
        decision_process: promptValues.decision,
        notes: promptValues.extra,
      },
      output_schema: {
        type: "object",
        required: ["decision", "symbol", "confidence_pct"],
        properties: {
          decision: { enum: ["LONG", "SHORT", "WAIT", "NO_TRADE", "CLOSE"] },
          symbol: { type: "string" },
          confidence_pct: { type: "number", minimum: 0, maximum: 100 },
          entry: { type: "object" },
          stops: { type: "object" },
          targets: { type: "object" },
          notes: { type: "array" },
        },
      },
      meta: {
        prompt_type: "strategy_compile_json",
        selected_strategy_id: selectedStrategyId,
        selected_strategy_name: strategyName.trim() || "New Strategy",
        generated_in_ui_only: true,
      },
    }),
    [
      active,
      promptPriorityBlocks,
      description,
      dslValues.cooldownRules,
      dslValues.entryRules,
      dslValues.exitRules,
      dslValues.marketRegimeRules,
      dslValues.positionManagement,
      dslValues.reEntryRules,
      dslValues.riskRules,
      dslValues.sizingRules,
      dslValues.thesis,
      dslValues.tradeFilters,
      entryConfig.maxPositions,
      entryConfig.maxPositionSizeUsdt,
      entryConfig.minConfidencePct,
      entryConfig.minPositionRatioPct,
      entryConfig.minPositionSizeUsdt,
      indicators.state.masterEnabled,
      intelligenceSummary.activeSource,
      intelligenceSummary.capacity,
      intelligenceSummary.close,
      intelligenceSummary.depthUsd,
      intelligenceSummary.edgeR,
      intelligenceSummary.fallbackActive,
      intelligenceSummary.fillProb,
      intelligenceSummary.orderbookImbalance,
      intelligenceSummary.regime,
      intelligenceSummary.riskAdjEdgeR,
      intelligenceSummary.source,
      intelligenceSummary.speed,
      intelligenceSummary.spreadBps,
      intelligenceSummary.trendDirection,
      intelligenceSummary.trendStrength,
      intelligenceFieldValues,
      primarySourceType,
      promptValues.decision,
      promptValues.entry,
      promptValues.extra,
      promptValues.frequency,
      promptValues.role,
      riskConfig.altcoinTradingLeverageX,
      riskConfig.btcEthTradingLeverageX,
      riskConfig.maxMarginUsagePct,
      riskConfig.minMarginRatioPct,
      riskConfig.minRiskRewardRatio,
      selectedAiInputs,
      selectedIndicatorPromptLines,
      selectedIndicatorResults,
      selectedSourceCoins,
      selectedSourceTypes,
      selectedStrategyId,
      selectedSymbol,
      strategyName,
      strategyType,
      style,
    ],
  );

  const generatedPromptDraft = useMemo(() => JSON.stringify(compiledPromptPayload, null, 2), [compiledPromptPayload]);

  const createStaticList = () => {
    const name = staticListName.trim();
    const coins = staticListCoinsDraft
      .split(/[,\s]+/)
      .map((coin) => coin.trim().toUpperCase())
      .filter(Boolean);
    if (!name || coins.length === 0) return;

    const item: StaticCoinList = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      coins: Array.from(new Set(coins)),
      createdAt: new Date().toISOString(),
    };
    setStaticLists((prev) => [item, ...prev]);
    setActiveStaticListId(item.id);
    setStaticListName("");
    setStaticListCoinsDraft("");
  };

  const removeStaticList = (id: string) => {
    setStaticLists((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (!next.length) return prev;
      if (activeStaticListId === id) setActiveStaticListId(next[0].id);
      return next;
    });
  };

  const aiRoutingPayload = useMemo(
    () => ({
      market_universe: {
        source_type: primarySourceType,
        source_types: selectedSourceTypes,
        selected_coins: selectedSourceCoins,
        ai500: {
          enabled: sourceTypeSet.has("AI500"),
          limit: ai500Limit,
        },
        oi_increase: {
          enabled: sourceTypeSet.has("OI_INCREASE"),
          limit: oiIncreaseLimit,
        },
        oi_decrease: {
          enabled: sourceTypeSet.has("OI_DECREASE"),
          limit: oiDecreaseLimit,
        },
        static_list: activeStaticList
          ? {
              id: activeStaticList.id,
              name: activeStaticList.name,
              coins: activeStaticList.coins,
            }
          : null,
        ai_modes_enabled: aiModesEnabled,
      },
      mode_routing: ROUTING_MODES.map((item) => ({
        mode: item.key,
        enabled: modeRouting[item.key].enabled,
        min_confidence_pct: modeRouting[item.key].minConfidence,
        included_sources: ROUTING_SOURCE_OPTIONS.filter((opt) => modeRouting[item.key].sources[opt.key]).map((opt) => opt.key),
      })),
      ai_prompt_context: {
        selected_market_intelligence_fields: selectedAiInputs.map((item) => item.key),
        market_intelligence_lines: selectedAiInputs.map((item) => ({
          key: item.key,
          label: item.promptLabel,
          value: intelligenceFieldValues[item.key],
        })),
        selected_indicators: selectedIndicatorResults.map((indicator) => ({
          key: indicator.key,
          label: indicator.label,
          group: indicator.group,
          status: indicator.status,
          value: indicator.value,
          settings: indicator.settings,
        })),
        indicator_lines: selectedIndicatorPromptLines,
        prompt_draft: generatedPromptDraft,
        prompt_preview: generatedPromptText,
      },
      entry_configuration: entryConfig,
      risk_management: riskConfig,
    }),
    [
      activeStaticList,
      ai500Limit,
      aiModesEnabled,
      modeRouting,
      oiDecreaseLimit,
      oiIncreaseLimit,
      primarySourceType,
      selectedSourceCoins,
      selectedSourceTypes,
      selectedAiInputs,
      sourceTypeSet,
      intelligenceFieldValues,
      selectedIndicatorPromptLines,
      selectedIndicatorResults,
      generatedPromptDraft,
      generatedPromptText,
      entryConfig,
      riskConfig,
    ],
  );

  const addNewStrategy = () => {
    const trimmed = strategyName.trim();
    const nextName = trimmed.length ? trimmed : `New Strategy ${strategyItems.length + 1}`;
    const nextId = `strategy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextItem = { id: nextId, name: nextName };
    setStrategyItems((prev) => [nextItem, ...prev]);
    setSelectedStrategyId(nextId);
    setStrategyName(nextName);
  };

  const publishCurrentStrategy = () => {
    const normalizedSource = `${intelligenceSummary.activeSource || intelligenceSummary.source || ""}`.toUpperCase();
    const venue = normalizedSource.includes("GATE") ? "GATE" : "BINANCE";
    const model =
      promptValues.role.toUpperCase().includes("OPENAI")
        ? "OPENAI"
        : promptValues.role.toUpperCase().includes("QWEN")
          ? "QWEN"
          : "QWEN";
    const published = publishStrategyTrader({
      strategyId: selectedStrategyId,
      strategyName: strategyName.trim() || "New Strategy",
      model,
      venue,
    });
    setPublishNotice(
      `Published "${published.name}". Want to see your trader on the leaderboard? Click "Open Leaderboard".`,
    );
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--textMuted)] md:p-6">
      <div className="mx-auto max-w-[1680px] rounded-2xl border border-white/10 bg-[var(--panel)] p-4 shadow-[0_28px_68px_rgba(0,0,0,0.45)]">
        <AiTraderTopTabs />
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text)]">Strategy Studio</h1>
            <p className="text-xs text-[var(--textSubtle)]">Configure and test trading strategies</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={clsPill(!proMode)} onClick={() => setProMode(false)}>
              Basic
            </button>
            <button type="button" className={clsPill(proMode)} onClick={() => setProMode(true)}>
              Pro
            </button>
            <button
              type="button"
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                active ? "border-[#4f6f58] bg-[#1c2620] text-[#b8d8c4]" : "border-[#704844] bg-[#271a19] text-[#d6b3af]"
              }`}
              onClick={() => setActive((prev) => !prev)}
            >
              {active ? "Active" : "Inactive"}
            </button>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[260px_1fr_360px]">
          <aside className="rounded-xl border border-white/10 bg-[var(--panelAlt)] p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[var(--textSubtle)]">Strategies</p>
            <button
              type="button"
              onClick={addNewStrategy}
              className="mb-2 w-full rounded-lg border border-[#F5C542]/70 bg-[#2b2417] px-3 py-2 text-left text-sm font-semibold text-[#F5C542]"
            >
              + New Strategy
            </button>
            <div className="space-y-1.5">
              {strategyItems.map((item) => {
                const activeItem = item.id === selectedStrategyId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedStrategyId(item.id);
                      setStrategyName(item.name);
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      activeItem
                        ? "border-[#F5C542]/60 bg-[#221e14] text-[var(--text)]"
                        : "border-white/10 bg-[#11131a] text-[var(--textMuted)] hover:border-white/20"
                    }`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="space-y-3 rounded-xl border border-white/10 bg-[var(--panelAlt)] p-3">
            <div className="rounded-xl border border-[#F5C542]/35 bg-[linear-gradient(135deg,#1c1910_0%,#10131a_45%,#0f1218_100%)] p-3 shadow-[inset_0_1px_0_rgba(245,197,66,0.2)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#7a6840] bg-[#2b2417] text-[11px] text-[#F5C542]">
                    ✦
                  </span>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d8bf7b]">Strategy Profile</p>
                </div>
                <span className="rounded-md border border-[#5a4d31] bg-[#1e1910] px-2 py-0.5 text-[10px] font-semibold text-[#cdbb8d]">
                  Editable
                </span>
              </div>
              <input
                value={strategyName}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setStrategyName(nextValue);
                  setStrategyItems((prev) =>
                    prev.map((item) => (item.id === selectedStrategyId ? { ...item, name: nextValue } : item)),
                  );
                }}
                className="w-full bg-transparent text-lg font-semibold text-[var(--text)] outline-none"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add strategy description..."
                className="mt-2 w-full rounded-lg border border-white/10 bg-[#0d1016] px-3 py-2 text-sm text-[var(--textMuted)] outline-none placeholder:text-[var(--textSubtle)]"
              />
            </div>

            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#10131a]">
              <button
                type="button"
                onClick={() => setStrategyTypeExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex items-start gap-2">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/10 bg-[#141922] text-[12px] text-[#f5c542]">
                    ⚙
                  </span>
                  <p className="text-sm font-semibold text-[var(--text)]">Strategy Type</p>
                  <p className="text-xs text-[var(--textSubtle)]">
                    Select trading mode and style profile.
                    <span className="ml-2 text-[#c6cbda]">
                      {strategyType === "AI_TRADING" ? "AI Trading" : "AI Grid Trading"}
                    </span>
                  </p>
                </div>
                <span className="text-xs text-[var(--textSubtle)]">{strategyTypeExpanded ? "▾" : "▸"}</span>
              </button>
              {strategyTypeExpanded ? (
                <div className="border-t border-white/10 p-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setStrategyType("AI_TRADING")}
                      className={`rounded-lg border p-3 text-left ${
                        strategyType === "AI_TRADING"
                          ? "border-[#F5C542]/60 bg-[linear-gradient(135deg,#2b2417,#1a1711)]"
                          : "border-white/15 bg-[#0F1012]"
                      }`}
                    >
                      <p className="text-sm font-semibold text-[var(--text)]">AI Trading</p>
                      <p className="text-xs text-[var(--textSubtle)]">AI analyzes market and makes trading decisions.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStrategyType("AI_GRID")}
                      className={`rounded-lg border p-3 text-left ${
                        strategyType === "AI_GRID"
                          ? "border-[#F5C542]/60 bg-[linear-gradient(135deg,#2b2417,#1a1711)]"
                          : "border-white/15 bg-[#0F1012]"
                      }`}
                    >
                      <p className="text-sm font-semibold text-[var(--text)]">AI Grid Trading</p>
                      <p className="text-xs text-[var(--textSubtle)]">AI-controlled grid strategy for ranging markets.</p>
                    </button>
                  </div>

                  <p className="mb-2 mt-3 text-sm font-semibold text-[var(--text)]">AI Trading Style</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {(["SCALPING", "INTRADAY", "SWING", "POSITION"] as StyleType[]).map((mode) => (
                      <button key={mode} type="button" className={clsPill(style === mode)} onClick={() => setStyle(mode)}>
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              {sections.map((section) => (
                <div key={section.key} className="rounded-xl border border-white/10 bg-[#10131a]">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/10 bg-[#141922] text-[12px] ${section.iconColor}`}
                        aria-hidden="true"
                      >
                        {section.icon}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text)]">{section.title}</p>
                        <p className="text-xs text-[var(--textSubtle)]">{section.hint}</p>
                      </div>
                    </div>
                    <span className="text-xs text-[var(--textSubtle)]">{expanded[section.key] ? "▾" : "▸"}</span>
                  </button>
                  {expanded[section.key] ? (
                    <div className="border-t border-white/10 px-3 py-2 text-xs text-[var(--textMuted)]">
                      {section.key === "market-universe" ? (
                        <div className="space-y-4">
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--textSubtle)]">Source Type</p>
                            <div className="grid gap-2 xl:grid-cols-5 md:grid-cols-3 sm:grid-cols-2">
                              {sourceCards.map((card) => (
                                <div
                                  key={card.key}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() =>
                                    setSelectedSourceTypes((prev) => {
                                      const exists = prev.includes(card.key);
                                      if (exists) {
                                        const next = prev.filter((item) => item !== card.key);
                                        return next.length ? next : ["AI500"];
                                      }
                                      return Array.from(new Set([...prev, card.key]));
                                    })
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setSelectedSourceTypes((prev) => {
                                        const exists = prev.includes(card.key);
                                        if (exists) {
                                          const next = prev.filter((item) => item !== card.key);
                                          return next.length ? next : ["AI500"];
                                        }
                                        return Array.from(new Set([...prev, card.key]));
                                      });
                                    }
                                  }}
                                  className={`rounded-lg border p-3 text-left transition ${
                                    sourceTypeSet.has(card.key)
                                      ? "border-[#F5C542]/70 bg-[#2a2418]"
                                      : "border-white/15 bg-[#0F1012] hover:border-white/25"
                                  }`}
                                >
                                  <div className="mb-1 flex items-start justify-between gap-2">
                                    <p className="text-base text-[#F5C542]">{card.icon}</p>
                                    {card.key === "AI500" || card.key === "OI_INCREASE" || card.key === "OI_DECREASE" ? (
                                      <select
                                        value={card.key === "AI500" ? ai500Limit : card.key === "OI_INCREASE" ? oiIncreaseLimit : oiDecreaseLimit}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) => {
                                          const next = Number(event.target.value);
                                          if (card.key === "AI500") setAi500Limit(next);
                                          if (card.key === "OI_INCREASE") setOiIncreaseLimit(next);
                                          if (card.key === "OI_DECREASE") setOiDecreaseLimit(next);
                                        }}
                                        className="rounded-md border border-white/15 bg-[#0B0D12] px-1.5 py-1 text-[11px] text-[var(--text)] outline-none"
                                        title={`${card.title} coin limit`}
                                      >
                                        {[10, 20, 30, 50, 100].map((v) => (
                                          <option key={v} value={v}>
                                            {v}
                                          </option>
                                        ))}
                                      </select>
                                    ) : null}
                                  </div>
                                  <p className="text-sm font-semibold text-[var(--text)]">{card.title}</p>
                                  <p className="mt-1 text-xs text-[var(--textSubtle)]">{card.hint}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {sourceTypeSet.has("STATIC_LIST") ? (
                            <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                              <div className="mb-3 rounded-lg border border-[#F5C542]/35 bg-[#18140f] p-3">
                                <p className="text-sm font-semibold text-[var(--text)]">Static Lists</p>
                                <p className="mt-1 text-xs text-[var(--textSubtle)]">
                                  Create and manage multiple static coin lists. Choose one as active source.
                                </p>
                                <div className="mt-2 grid gap-2 md:grid-cols-[220px_1fr_auto]">
                                  <input
                                    value={staticListName}
                                    onChange={(e) => setStaticListName(e.target.value)}
                                    placeholder="List name (e.g. Meme Set)"
                                    className="rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--textSubtle)]"
                                  />
                                  <input
                                    value={staticListCoinsDraft}
                                    onChange={(e) => setStaticListCoinsDraft(e.target.value)}
                                    placeholder="BTC, ETH, DOGE..."
                                    className="rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--textSubtle)]"
                                  />
                                  <button
                                    type="button"
                                    onClick={createStaticList}
                                    className="rounded-lg border border-[#7a6840] bg-[#2a2418] px-3 py-2 text-xs font-semibold text-[#F5C542]"
                                  >
                                    + Add List
                                  </button>
                                </div>
                                <div className="mt-3 space-y-2">
                                  {staticLists.map((list) => (
                                    <div
                                      key={list.id}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => setActiveStaticListId(list.id)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          setActiveStaticListId(list.id);
                                        }
                                      }}
                                      className={`relative w-full rounded-lg border p-3 text-left ${
                                        activeStaticListId === list.id
                                          ? "border-[#F5C542]/70 bg-[#2b2417]"
                                          : "border-white/10 bg-[#121822]"
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-3 pr-2">
                                        <div>
                                          <p className="text-sm font-semibold text-[var(--text)]">{list.name}</p>
                                          <p className="mt-1 text-[11px] text-[var(--textSubtle)]">{list.coins.join(", ")}</p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                          <span className="inline-block text-[10px] text-[var(--textMuted)]">{list.coins.length} coins</span>
                                          {activeStaticListId === list.id ? (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setActiveStaticListId("");
                                              }}
                                              className="rounded border border-[#704844] bg-[#271a19] px-1.5 py-0.5 text-[10px] font-semibold text-[#f0b8b3]"
                                            >
                                              Cikar
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setActiveStaticListId(list.id);
                                              }}
                                              className="rounded border border-[#6f765f] bg-[#1f251b] px-1.5 py-0.5 text-[10px] font-semibold text-[#d8decf]"
                                            >
                                              Ekle
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      {staticLists.length > 1 ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            removeStaticList(list.id);
                                          }}
                                          className="absolute right-2 top-2 rounded border border-[#704844] bg-[#271a19] px-1.5 py-0.5 text-[10px] text-[#d6b3af]"
                                        >
                                          Delete
                                        </button>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                                {activeStaticList ? (
                                  <p className="mt-2 text-[11px] text-[#BFC2C7]">
                                    Active List: <span className="font-semibold text-[var(--text)]">{activeStaticList.name}</span>
                                  </p>
                                ) : (
                                  <p className="mt-2 text-[11px] text-[var(--textSubtle)]">No active static list.</p>
                                )}
                              </div>
                            </div>
                          ) : null}
                          {aiModesEnabled ? (
                          <div className="rounded-lg border border-[#4f5d7a]/35 bg-[#101726] p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-[var(--text)]">AI Mode Coin/Data Routing</p>
                                <p className="text-xs text-[var(--textSubtle)]">
                                  Configure AI mode enable state and min confidence routing threshold.
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {ROUTING_MODES.map((modeItem) => {
                                const config = modeRouting[modeItem.key];
                                return (
                                  <div key={modeItem.key} className="rounded-lg border border-white/10 bg-[#0F1012] p-2.5">
                                    <div className="grid gap-2 lg:grid-cols-[170px_170px] lg:justify-between">
                                      <div className="space-y-1">
                                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${modeItem.tone}`}>
                                          {modeItem.label}
                                        </span>
                                        <label className="flex items-center gap-2 text-xs text-[var(--textMuted)]">
                                          <input
                                            type="checkbox"
                                            checked={config.enabled}
                                            onChange={(e) =>
                                              setModeRouting((prev) => ({
                                                ...prev,
                                                [modeItem.key]: {
                                                  ...prev[modeItem.key],
                                                  enabled: e.target.checked,
                                                },
                                              }))
                                            }
                                            className="h-3.5 w-3.5 accent-[#F5C542]"
                                          />
                                          Send to AI
                                        </label>
                                      </div>

                                      <div className="rounded border border-white/10 bg-[#121822] px-2 py-1.5">
                                        <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--textSubtle)]">Min Confidence</p>
                                        <div className="mt-1 flex items-center gap-1.5">
                                          <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={config.minConfidence}
                                            onChange={(e) =>
                                              setModeRouting((prev) => ({
                                                ...prev,
                                                [modeItem.key]: {
                                                  ...prev[modeItem.key],
                                                  minConfidence: Number(e.target.value),
                                                },
                                              }))
                                            }
                                            className="h-1.5 w-full accent-[#F5C542]"
                                          />
                                          <span className="min-w-[40px] text-right text-xs font-semibold text-[#F5C542]">{config.minConfidence}%</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          ) : null}
                        </div>
                      ) : section.key === "prompt" ? (
                        <div className="space-y-2">
                          {promptFieldLabels.map((field) => {
                            const value = promptValues[field.key];
                            return (
                              <div key={field.key} className="rounded-lg border border-white/10 bg-[#0F1012]">
                                <button
                                  type="button"
                                  onClick={() => setPromptOpen((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                                  className="flex w-full items-center justify-between px-3 py-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-[var(--textSubtle)]">{promptOpen[field.key] ? "▾" : "▸"}</span>
                                    <span className="text-sm font-semibold text-[var(--text)]">{field.label}</span>
                                    {value.trim().length > 0 ? (
                                      <span className="rounded border border-[#7d53d5] bg-[#2b1e4c] px-1.5 py-0.5 text-[10px] font-semibold text-[#cdb7ff]">
                                        Modified
                                      </span>
                                    ) : null}
                                  </div>
                                  <span className="text-xs text-[var(--textSubtle)]">{value.length} chars</span>
                                </button>
                                {promptOpen[field.key] ? (
                                  <div className="border-t border-white/10 px-3 py-2">
                                    <textarea
                                      value={value}
                                      onChange={(e) =>
                                        setPromptValues((prev) => ({
                                          ...prev,
                                          [field.key]: e.target.value,
                                        }))
                                      }
                                      rows={field.key === "extra" ? 3 : 4}
                                      placeholder={`Write ${field.label.toLowerCase()} prompt...`}
                                      className="w-full resize-y rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-xs text-[var(--text)] outline-none placeholder:text-[var(--textSubtle)]"
                                    />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : section.key === "dsl" ? (
                        <div className="space-y-2">
                          <div className="rounded-lg border border-[#F5C542]/30 bg-[#18140f] px-3 py-2 text-[11px] text-[var(--textMuted)]">
                            Strategy DSL defines hard execution boundaries. AI cannot place trades outside these rules.
                          </div>
                          {dslFieldLabels.map((field) => {
                            const value = dslValues[field.key];
                            return (
                              <div key={field.key} className="rounded-lg border border-white/10 bg-[#0F1012]">
                                <button
                                  type="button"
                                  onClick={() => setDslOpen((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                                  className="flex w-full items-center justify-between px-3 py-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-[var(--textSubtle)]">{dslOpen[field.key] ? "▾" : "▸"}</span>
                                    <span className="text-sm font-semibold text-[var(--text)]">{field.label}</span>
                                  </div>
                                  <span className="max-w-[58%] truncate text-xs text-[var(--textSubtle)]">{value || "Not set"}</span>
                                </button>
                                {dslOpen[field.key] ? (
                                  <div className="border-t border-white/10 px-3 py-2">
                                    <textarea
                                      value={value}
                                      onChange={(e) =>
                                        setDslValues((prev) => ({
                                          ...prev,
                                          [field.key]: e.target.value,
                                        }))
                                      }
                                      rows={3}
                                      placeholder={field.placeholder ?? "Enter value..."}
                                      className="w-full resize-y rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-xs text-[var(--text)] outline-none placeholder:text-[var(--textSubtle)]"
                                    />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : section.key === "entry-exit" ? (
                        <div className="space-y-3">
                          <div className="grid gap-2 lg:grid-cols-2">
                            <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                              <p className="text-sm font-semibold text-[var(--text)]">Min Position Size</p>
                              <p className="mt-1 text-xs text-[var(--textSubtle)]">Minimum notional value in USDT.</p>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={entryConfig.minPositionSizeUsdt}
                                  onChange={(e) =>
                                    setEntryConfig((prev) => ({
                                      ...prev,
                                      minPositionSizeUsdt: Number(e.target.value || 0),
                                    }))
                                  }
                                  className="w-28 rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm text-[var(--text)] outline-none"
                                />
                                <span className="text-sm text-[var(--textMuted)]">USDT</span>
                              </div>
                            </div>

                            <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                              <p className="text-sm font-semibold text-[var(--text)]">Min Confidence</p>
                              <p className="mt-1 text-xs text-[var(--textSubtle)]">AI confidence threshold for entry.</p>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={entryConfig.minConfidencePct}
                                  onChange={(e) =>
                                    setEntryConfig((prev) => ({
                                      ...prev,
                                      minConfidencePct: Number(e.target.value),
                                    }))
                                  }
                                  className="h-1.5 w-full accent-[#F5C542]"
                                />
                                <span className="min-w-[38px] text-right text-sm font-semibold text-[#F5C542]">
                                  {entryConfig.minConfidencePct}
                                </span>
                              </div>
                            </div>

                            <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                              <p className="text-sm font-semibold text-[var(--text)]">Max Position Size</p>
                              <p className="mt-1 text-xs text-[var(--textSubtle)]">Maximum notional value in USDT (0 = off).</p>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={entryConfig.maxPositionSizeUsdt}
                                  onChange={(e) =>
                                    setEntryConfig((prev) => {
                                      const next = Number(e.target.value || 0);
                                      return {
                                        ...prev,
                                        maxPositionSizeUsdt: next,
                                        minPositionRatioPct: next > 0 ? 0 : prev.minPositionRatioPct,
                                      };
                                    })
                                  }
                                  className="w-28 rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm text-[var(--text)] outline-none"
                                />
                                <span className="text-sm text-[var(--textMuted)]">USDT</span>
                              </div>
                            </div>

                            <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                              <p className="text-sm font-semibold text-[var(--text)]">Default Entry Tolerance (%)</p>
                              <p className="mt-1 text-xs text-[var(--textSubtle)]">Allowed price drift at open execution time.</p>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  step={0.1}
                                  value={entryConfig.defaultEntryTolerancePct}
                                  onChange={(e) =>
                                    setEntryConfig((prev) => ({
                                      ...prev,
                                      defaultEntryTolerancePct: Number(e.target.value || 0),
                                    }))
                                  }
                                  className="w-28 rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm text-[var(--text)] outline-none"
                                />
                                <span className="text-sm text-[var(--textMuted)]">%</span>
                              </div>
                            </div>

                            <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                              <p className="text-sm font-semibold text-[var(--text)]">Min Position Ratio (%)</p>
                              <p className="mt-1 text-xs text-[var(--textSubtle)]">Use at least this % of equity per trade (0 = off).</p>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  step={0.1}
                                  value={entryConfig.minPositionRatioPct}
                                  onChange={(e) =>
                                    setEntryConfig((prev) => {
                                      const next = Number(e.target.value || 0);
                                      return {
                                        ...prev,
                                        minPositionRatioPct: next,
                                        maxPositionSizeUsdt: next > 0 ? 0 : prev.maxPositionSizeUsdt,
                                      };
                                    })
                                  }
                                  className="w-28 rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm text-[var(--text)] outline-none"
                                />
                                <span className="text-sm text-[var(--textMuted)]">%</span>
                              </div>
                            </div>

                            <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                              <p className="text-sm font-semibold text-[var(--text)]">Max Positions</p>
                              <p className="mt-1 text-xs text-[var(--textSubtle)]">Maximum coins held simultaneously.</p>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  value={entryConfig.maxPositions}
                                  onChange={(e) =>
                                    setEntryConfig((prev) => ({
                                      ...prev,
                                      maxPositions: Math.max(1, Number(e.target.value || 1)),
                                    }))
                                  }
                                  className="w-28 rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm text-[var(--text)] outline-none"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                            <p className="text-sm font-semibold text-[var(--text)]">Direction Mode</p>
                            <p className="mt-1 text-xs text-[var(--textSubtle)]">Limit AI to long-only, short-only, or both.</p>
                            <select
                              value={entryConfig.directionMode}
                              onChange={(e) =>
                                setEntryConfig((prev) => ({
                                  ...prev,
                                  directionMode: e.target.value as DirectionMode,
                                }))
                              }
                              className="mt-2 w-52 rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm text-[var(--text)] outline-none"
                            >
                              <option value="BOTH">Both</option>
                              <option value="LONG_ONLY">Long Only</option>
                              <option value="SHORT_ONLY">Short Only</option>
                            </select>
                          </div>
                        </div>
                      ) : section.key === "risk" ? (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                            <p className="text-sm font-semibold text-[var(--text)]">Position Limits</p>
                            <p className="mt-1 text-xs text-[var(--textSubtle)]">
                              Configure leverage and position value constraints for safer execution.
                            </p>
                          </div>

                          <div className="grid gap-2 lg:grid-cols-2">
                            <div className="rounded-lg border border-[#7a6840] bg-[#17140f] p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#F5C542]">Trading Leverage (Exchange)</p>
                              <p className="mt-2 text-sm font-semibold text-[var(--text)]">BTC/ETH Trading Leverage</p>
                              <p className="mt-1 text-xs text-[var(--textSubtle)]">Exchange leverage for opening positions.</p>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="range"
                                  min={1}
                                  max={50}
                                  value={riskConfig.btcEthTradingLeverageX}
                                  onChange={(e) =>
                                    setRiskConfig((prev) => ({
                                      ...prev,
                                      btcEthTradingLeverageX: Number(e.target.value),
                                    }))
                                  }
                                  className="h-1.5 w-full accent-[#F5C542]"
                                />
                                <span className="min-w-[44px] text-right text-sm font-semibold text-[#F5C542]">
                                  {riskConfig.btcEthTradingLeverageX}x
                                </span>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs text-[var(--textMuted)]">BTC/ETH Min Leverage</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={riskConfig.btcEthMinLeverageX}
                                  onChange={(e) =>
                                    setRiskConfig((prev) => ({
                                      ...prev,
                                      btcEthMinLeverageX: Number(e.target.value || 1),
                                    }))
                                  }
                                  className="w-20 rounded-lg border border-white/15 bg-[#0B0D12] px-2 py-1 text-sm text-[var(--text)] outline-none"
                                />
                                <span className="text-sm text-[var(--textMuted)]">x</span>
                              </div>
                            </div>

                            <div className="rounded-lg border border-[#7a6840] bg-[#17140f] p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#F5C542]">Trading Leverage (Exchange)</p>
                              <p className="mt-2 text-sm font-semibold text-[var(--text)]">Altcoin Trading Leverage</p>
                              <p className="mt-1 text-xs text-[var(--textSubtle)]">Exchange leverage for opening positions.</p>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="range"
                                  min={1}
                                  max={50}
                                  value={riskConfig.altcoinTradingLeverageX}
                                  onChange={(e) =>
                                    setRiskConfig((prev) => ({
                                      ...prev,
                                      altcoinTradingLeverageX: Number(e.target.value),
                                    }))
                                  }
                                  className="h-1.5 w-full accent-[#F5C542]"
                                />
                                <span className="min-w-[44px] text-right text-sm font-semibold text-[#F5C542]">
                                  {riskConfig.altcoinTradingLeverageX}x
                                </span>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs text-[var(--textMuted)]">Altcoin Min Leverage</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={riskConfig.altcoinMinLeverageX}
                                  onChange={(e) =>
                                    setRiskConfig((prev) => ({
                                      ...prev,
                                      altcoinMinLeverageX: Number(e.target.value || 1),
                                    }))
                                  }
                                  className="w-20 rounded-lg border border-white/15 bg-[#0B0D12] px-2 py-1 text-sm text-[var(--text)] outline-none"
                                />
                                <span className="text-sm text-[var(--textMuted)]">x</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-2 lg:grid-cols-2">
                            <div className="rounded-lg border border-[#4f6f58] bg-[#102016] p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#2bc48a]">Position Value Ratio (Code Enforced)</p>
                              <p className="mt-2 text-sm font-semibold text-[var(--text)]">BTC/ETH Position Value Ratio</p>
                              <p className="mt-1 text-xs text-[var(--textSubtle)]">Max position value = equity × this ratio.</p>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="range"
                                  min={1}
                                  max={10}
                                  step={0.1}
                                  value={riskConfig.btcEthPositionValueRatioX}
                                  onChange={(e) =>
                                    setRiskConfig((prev) => ({
                                      ...prev,
                                      btcEthPositionValueRatioX: Number(e.target.value),
                                    }))
                                  }
                                  className="h-1.5 w-full accent-[#2bc48a]"
                                />
                                <span className="min-w-[44px] text-right text-sm font-semibold text-[#2bc48a]">
                                  {riskConfig.btcEthPositionValueRatioX.toFixed(1)}x
                                </span>
                              </div>
                            </div>

                            <div className="rounded-lg border border-[#4f6f58] bg-[#102016] p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#2bc48a]">Position Value Ratio (Code Enforced)</p>
                              <p className="mt-2 text-sm font-semibold text-[var(--text)]">Altcoin Position Value Ratio</p>
                              <p className="mt-1 text-xs text-[var(--textSubtle)]">Max position value = equity × this ratio.</p>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="range"
                                  min={1}
                                  max={10}
                                  step={0.1}
                                  value={riskConfig.altcoinPositionValueRatioX}
                                  onChange={(e) =>
                                    setRiskConfig((prev) => ({
                                      ...prev,
                                      altcoinPositionValueRatioX: Number(e.target.value),
                                    }))
                                  }
                                  className="h-1.5 w-full accent-[#2bc48a]"
                                />
                                <span className="min-w-[44px] text-right text-sm font-semibold text-[#2bc48a]">
                                  {riskConfig.altcoinPositionValueRatioX.toFixed(1)}x
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                            <p className="text-sm font-semibold text-[var(--text)]">Risk Parameters</p>
                            <div className="mt-2">
                              <div className="max-w-[460px] rounded-lg border border-white/10 bg-[#121821] p-3">
                                <p className="text-sm font-semibold text-[var(--text)]">Min Risk/Reward Ratio</p>
                                <p className="mt-1 text-xs text-[var(--textSubtle)]">Minimum profit ratio for opening.</p>
                                <div className="mt-2 flex items-center gap-2">
                                  <span className="text-sm text-[var(--textMuted)]">1:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={riskConfig.minRiskRewardRatio}
                                    onChange={(e) =>
                                      setRiskConfig((prev) => ({
                                        ...prev,
                                        minRiskRewardRatio: Number(e.target.value || 0),
                                      }))
                                    }
                                    className="w-20 rounded-lg border border-white/15 bg-[#0B0D12] px-2 py-1 text-sm text-[var(--text)] outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-[#4f6f58] bg-[#102016] p-3">
                            <p className="text-sm font-semibold text-[var(--text)]">Max Margin Usage (Code Enforced)</p>
                            <p className="mt-1 text-xs text-[var(--textSubtle)]">
                              Maximum margin utilization and minimum initial margin controls.
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={riskConfig.maxMarginUsagePct}
                                onChange={(e) =>
                                  setRiskConfig((prev) => ({
                                    ...prev,
                                    maxMarginUsagePct: Number(e.target.value),
                                  }))
                                }
                                className="h-1.5 w-full accent-[#2bc48a]"
                              />
                              <span className="min-w-[48px] text-right text-sm font-semibold text-[#2bc48a]">
                                {riskConfig.maxMarginUsagePct}%
                              </span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-xs text-[var(--textMuted)]">Min Margin Ratio (%)</span>
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={riskConfig.minMarginRatioPct}
                                onChange={(e) =>
                                  setRiskConfig((prev) => ({
                                    ...prev,
                                    minMarginRatioPct: Number(e.target.value || 0),
                                  }))
                                }
                                className="w-20 rounded-lg border border-white/15 bg-[#0B0D12] px-2 py-1 text-sm text-[var(--text)] outline-none"
                              />
                              <span className="text-sm text-[var(--textMuted)]">%</span>
                            </div>
                          </div>
                        </div>
                      ) : section.key === "indicators" ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2">
                            <input
                              value={indicatorSearch}
                              onChange={(e) => setIndicatorSearch(e.target.value)}
                              placeholder="Search indicator..."
                              className="w-full bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--textSubtle)]"
                            />
                            <label className="ml-auto flex items-center gap-1 text-[11px] text-[var(--textMuted)]">
                              <input
                                type="checkbox"
                                checked={indicators.state.masterEnabled}
                                onChange={(e) => indicators.setMaster(e.target.checked)}
                                className="h-3.5 w-3.5 accent-[#F5C542]"
                              />
                              Master
                            </label>
                            <span className="rounded border border-white/15 bg-[#141922] px-1.5 py-0.5 text-[10px] text-[var(--textMuted)]">
                              {indicators.enabledCount} enabled
                            </span>
                          </div>

                          <div className="space-y-2">
                            {(Object.keys(INDICATOR_GROUPS) as Array<keyof typeof INDICATOR_GROUPS>).map((groupKey) => {
                              const group = INDICATOR_GROUPS[groupKey];
                              const groupIndicators = group.indicators.filter((k) => filteredIndicators.includes(k));
                              if (!groupIndicators.length) return null;
                              const groupEnabled = indicators.state.masterEnabled && indicators.state.groups[groupKey].enabled;
                              return (
                                <div key={groupKey} className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
                                  <div className="mb-2 flex items-center gap-2">
                                    <p className="text-xs font-semibold text-[var(--text)]">{group.label}</p>
                                    <label className="ml-auto flex items-center gap-1 text-[11px] text-[var(--textMuted)]">
                                      <input
                                        type="checkbox"
                                        checked={groupEnabled}
                                        disabled={!indicators.state.masterEnabled}
                                        onChange={(e) => indicators.setGroup(groupKey, e.target.checked)}
                                        className="h-3.5 w-3.5 accent-[#F5C542]"
                                      />
                                      Group
                                    </label>
                                  </div>
                                  <div className="space-y-1.5">
                                    {groupIndicators.map((indicatorKey) => {
                                      const indicator = indicators.state.indicators[indicatorKey];
                                      const rowOpen = !!indicatorOpenRows[indicatorKey];
                                      const disabled = !indicators.state.masterEnabled || !indicators.state.groups[groupKey].enabled;
                                      return (
                                        <div key={indicatorKey} className="rounded border border-white/10 bg-[#121316] px-2 py-1.5">
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="checkbox"
                                              className="h-3.5 w-3.5 accent-[#F5C542]"
                                              disabled={disabled}
                                              checked={indicators.state.masterEnabled && indicator.enabled}
                                              onChange={(e) => indicators.setIndicatorEnabled(indicatorKey, e.target.checked)}
                                            />
                                            <span className="text-xs text-[var(--text)]">{INDICATOR_LABELS[indicatorKey]}</span>
                                            <span
                                              className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
                                                indicators.state.masterEnabled && indicator.enabled
                                                  ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]"
                                                  : "border-white/10 bg-[#1A1B1F] text-[#6B6F76]"
                                              }`}
                                            >
                                              {indicators.state.masterEnabled && indicator.enabled ? "ON" : "OFF"}
                                            </span>
                                            <button
                                              type="button"
                                              className="ml-auto rounded border border-white/10 bg-[#0F1012] px-2 py-0.5 text-[10px] text-[var(--textMuted)]"
                                              onClick={() =>
                                                setIndicatorOpenRows((prev) => ({ ...prev, [indicatorKey]: !prev[indicatorKey] }))
                                              }
                                            >
                                              Settings {rowOpen ? "▴" : "▾"}
                                            </button>
                                          </div>
                                          {rowOpen ? (
                                            <div className="mt-2 grid gap-1.5 border-t border-white/10 pt-2 sm:grid-cols-2">
                                              {Object.entries(indicator.settings).map(([k, v]) => (
                                                <label key={k} className="text-[10px] text-[var(--textMuted)]">
                                                  {k}
                                                  {typeof v === "boolean" ? (
                                                    <input
                                                      type="checkbox"
                                                      checked={v}
                                                      onChange={(e) =>
                                                        indicators.setIndicatorSetting(indicatorKey, k, e.target.checked)
                                                      }
                                                      className="ml-2 h-3.5 w-3.5 accent-[#F5C542]"
                                                    />
                                                  ) : Array.isArray(v) ? (
                                                    <input
                                                      value={v.join(",")}
                                                      onChange={(e) =>
                                                        indicators.setIndicatorSetting(
                                                          indicatorKey,
                                                          k,
                                                          e.target.value.split(",").map((x) => x.trim()).filter(Boolean),
                                                        )
                                                      }
                                                      className="mt-1 w-full rounded border border-white/15 bg-[#0B0D12] px-2 py-1 text-[11px] text-[var(--text)] outline-none"
                                                    />
                                                  ) : (
                                                    <input
                                                      value={String(v)}
                                                      onChange={(e) =>
                                                        indicators.setIndicatorSetting(
                                                          indicatorKey,
                                                          k,
                                                          typeof v === "number" ? Number(e.target.value) : e.target.value,
                                                        )
                                                      }
                                                      className="mt-1 w-full rounded border border-white/15 bg-[#0B0D12] px-2 py-1 text-[11px] text-[var(--text)] outline-none"
                                                    />
                                                  )}
                                                </label>
                                              ))}
                                              <button
                                                type="button"
                                                className="self-end rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-[var(--textMuted)]"
                                                onClick={() => indicators.resetIndicator(indicatorKey)}
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
                      ) : section.key === "intelligence" ? (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-[#4f5d7a]/35 bg-[#101726] p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-[var(--text)]">AI Prompt Inputs</p>
                                <p className="text-xs text-[var(--textSubtle)]">
                                  Select which market intelligence fields will be sent to AI prompt payload.
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setAiInputSelection({ ...DEFAULT_INTELLIGENCE_SELECTION })}
                                  className="rounded border border-[#6f765f] bg-[#1f251b] px-2 py-1 text-[10px] font-semibold text-[#d8decf]"
                                >
                                  All ON
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAiInputSelection(
                                      INTELLIGENCE_FIELD_OPTIONS.reduce(
                                        (acc, item) => ({ ...acc, [item.key]: false }),
                                        {} as Record<IntelligenceFieldKey, boolean>,
                                      ),
                                    )
                                  }
                                  className="rounded border border-[#704844] bg-[#271a19] px-2 py-1 text-[10px] font-semibold text-[#f0b8b3]"
                                >
                                  All OFF
                                </button>
                              </div>
                            </div>

                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {INTELLIGENCE_FIELD_OPTIONS.map((field) => {
                                const checked = aiInputSelection[field.key];
                                return (
                                  <label
                                    key={field.key}
                                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${
                                      checked ? "border-[#6f765f] bg-[#1f251b]" : "border-white/10 bg-[#0F1012]"
                                    }`}
                                  >
                                    <div>
                                      <p className="text-xs font-semibold text-[var(--text)]">{field.label}</p>
                                      <p className="text-[11px] text-[var(--textSubtle)]">{intelligenceFieldValues[field.key]}</p>
                                    </div>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(event) =>
                                        setAiInputSelection((prev) => ({
                                          ...prev,
                                          [field.key]: event.target.checked,
                                        }))
                                      }
                                      className="h-3.5 w-3.5 shrink-0 accent-[#F5C542]"
                                    />
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : section.key === "publish" ? (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-[#4f6f58]/50 bg-[#102016] p-3">
                            <p className="text-sm font-semibold text-[var(--text)]">Publish Strategy</p>
                            <p className="mt-1 text-xs text-[var(--textSubtle)]">
                              Finalize this strategy and push it as a live trader candidate.
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={publishCurrentStrategy}
                                className="rounded-lg border border-[#4f6f58] bg-[#1f251b] px-3 py-1.5 text-xs font-semibold text-[#b8d8c4]"
                              >
                                Publish Current Strategy
                              </button>
                              <button
                                type="button"
                                onClick={() => navigate("/ai-trader/leaderboard")}
                                className="rounded-lg border border-[#4f6fa8] bg-[#1a2237] px-3 py-1.5 text-xs font-semibold text-[#b8cdf7]"
                              >
                                Open Leaderboard
                              </button>
                            </div>
                          </div>

                          <div className="rounded-lg border border-[#2e4f73]/50 bg-[#10263d] p-3">
                            <p className="text-sm font-semibold text-[#dbeafe]">Want to view your trader on the leaderboard?</p>
                            <p className="mt-1 text-xs text-[#9ec1f2]">
                              Click <span className="font-semibold">Open Leaderboard</span> to see live ranking sorted by trader PnL.
                            </p>
                            {publishNotice ? (
                              <p className="mt-2 text-xs font-semibold text-[#9fe4bf]">{publishNotice}</p>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <span>
                          Module settings area for <span className="font-semibold text-[var(--text)]">{section.title}</span>.
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-3 rounded-xl border border-white/10 bg-[var(--panelAlt)] p-3">
            <div className="rounded-xl border border-white/10 bg-[#10131a] p-3">
              <p className="text-sm font-semibold text-[var(--text)]">Prompt Preview</p>
              <p className="mt-1 text-xs text-[var(--textSubtle)]">
                Preview strategy prompt before AI test. Market intelligence fields selected:{" "}
                <span className="font-semibold text-[var(--text)]">{selectedAiInputs.length}</span>
                {" · "}
                Indicators included: <span className="font-semibold text-[var(--text)]">{selectedIndicatorResults.length}</span>
              </p>
              <p className="mt-1 text-xs text-[var(--textSubtle)]">
                Selected strategy: <span className="font-semibold text-[var(--text)]">{strategyName.trim() || "New Strategy"}</span>
              </p>
              <p className="mt-1 text-[11px] text-[#d8bf7b]">Generate Prompt only shows compiled JSON. It does not send to AI.</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGeneratedPromptText(generatedPromptDraft)}
                  className="rounded-lg border border-[#7a4fe0] bg-[#231a37] px-3 py-2 text-xs font-semibold text-[#cdb7ff]"
                >
                  Generate JSON Prompt
                </button>
                <button
                  type="button"
                  onClick={() => setGeneratedPromptText("")}
                  className="rounded-lg border border-[#4f6fb8] bg-[#1a2237] px-3 py-2 text-xs font-semibold text-[#b8cdf7]"
                >
                  Clear Preview
                </button>
              </div>
              <div className="mt-3 rounded-lg border border-dashed border-white/15 bg-[#0F1012] p-3">
                {generatedPromptText ? (
                  <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-[var(--textMuted)]">
                    {generatedPromptText}
                  </pre>
                ) : (
                  <div className="h-[220px]" />
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#10131a] p-3">
              <p className="text-sm font-semibold text-[var(--text)]">Configuration Status</p>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Mode</span>
                  <span className="font-semibold text-[var(--text)]">{proMode ? "PRO" : "BASIC"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Type</span>
                  <span className="font-semibold text-[var(--text)]">{strategyType === "AI_TRADING" ? "AI Trading" : "AI Grid Trading"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Style</span>
                  <span className="font-semibold text-[var(--text)]">{style}</span>
                </div>
                <div className="flex justify-between">
                  <span>Modules</span>
                  <span className="font-semibold text-[#F5C542]">{summary}</span>
                </div>
                <div className="flex justify-between">
                  <span>Source Type</span>
                  <span className="font-semibold text-[var(--text)]">{sourceTypeLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span>Source Coins</span>
                  <span className="font-semibold text-[var(--text)]">{aiRoutingPayload.market_universe.selected_coins.length}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
