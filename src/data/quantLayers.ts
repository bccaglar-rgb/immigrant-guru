import type { FlowSignalInputsConfig, FlowSignalWeightsConfig } from "../types";

export type QuantLayerKey =
  | "execution"
  | "structure"
  | "microstructure"
  | "positioning"
  | "volatility"
  | "risk"
  | "onchain";

export interface QuantLayerDefinition {
  key: QuantLayerKey;
  label: string;
  subtitle: string;
  priority: "P1" | "P2" | "P3";
  tone: {
    chip: string;
    border: string;
    bg: string;
  };
}

export const QUANT_LAYER_DEFINITIONS: QuantLayerDefinition[] = [
  {
    key: "execution",
    label: "Execution Layer",
    subtitle: "Tradeability · Fill Quality",
    priority: "P1",
    tone: {
      chip: "border-[#7f6a3b] bg-[#2a2418] text-[#e7d9b3]",
      border: "border-[#7f6a3b]/35",
      bg: "bg-[linear-gradient(180deg,#14130f_0%,#121316_100%)]",
    },
  },
  {
    key: "structure",
    label: "Structure Layer",
    subtitle: "Macro Direction · Regime Context",
    priority: "P1",
    tone: {
      chip: "border-[#5e7d9a] bg-[#18222d] text-[#c8d8e9]",
      border: "border-[#5e7d9a]/35",
      bg: "bg-[linear-gradient(180deg,#10151b_0%,#121316_100%)]",
    },
  },
  {
    key: "microstructure",
    label: "Liquidity & Microstructure Layer",
    subtitle: "Short-Term Pressure · Refill Behavior",
    priority: "P1",
    tone: {
      chip: "border-[#8a6d5a] bg-[#2b211a] text-[#e6d1c2]",
      border: "border-[#8a6d5a]/35",
      bg: "bg-[linear-gradient(180deg,#17120f_0%,#121316_100%)]",
    },
  },
  {
    key: "positioning",
    label: "Positioning Layer",
    subtitle: "Futures Core · Flow Pressure",
    priority: "P2",
    tone: {
      chip: "border-[#87626f] bg-[#281a20] text-[#e4c8d2]",
      border: "border-[#87626f]/35",
      bg: "bg-[linear-gradient(180deg,#171116_0%,#121316_100%)]",
    },
  },
  {
    key: "volatility",
    label: "Volatility Layer",
    subtitle: "Compression · Breakout Probability",
    priority: "P2",
    tone: {
      chip: "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]",
      border: "border-[#7a6840]/35",
      bg: "bg-[linear-gradient(180deg,#16130f_0%,#121316_100%)]",
    },
  },
  {
    key: "risk",
    label: "Risk Environment Layer",
    subtitle: "Systemic Risk · Conflict Filter",
    priority: "P2",
    tone: {
      chip: "border-[#8b4f4f] bg-[#291818] text-[#e0b7b7]",
      border: "border-[#8b4f4f]/35",
      bg: "bg-[linear-gradient(180deg,#171011_0%,#121316_100%)]",
    },
  },
  {
    key: "onchain",
    label: "On-Chain Layer",
    subtitle: "Flow Bias · Mid-Term Context",
    priority: "P3",
    tone: {
      chip: "border-[#4f7b6c] bg-[#17251f] text-[#c5e1d7]",
      border: "border-[#4f7b6c]/35",
      bg: "bg-[linear-gradient(180deg,#101712_0%,#121316_100%)]",
    },
  },
];

export const TILE_LAYER_MAP: Record<string, QuantLayerKey> = {
  "spread-regime": "execution",
  "depth-quality": "execution",
  "liquidity-density": "execution",
  "slippage-risk": "execution",
  "entry-timing-window": "execution",
  "orderbook-stability": "execution",
  "entry-quality": "execution",
  "asymmetry-score": "execution",

  "trend-direction": "structure",
  "trend-strength": "structure",
  "ema-alignment": "structure",
  "vwap-position": "structure",
  "market-regime": "structure",
  "structure-age": "structure",
  "time-in-range": "structure",
  "htf-level-reaction": "structure",
  "distance-key-level": "structure",
  "range-position": "structure",
  "liquidity-cluster": "structure",
  "last-swing-distance": "structure",
  "trend-phase": "structure",
  "time-since-regime-change": "structure",
  "market-intent": "structure",

  "orderbook-imbalance": "microstructure",
  "liquidity-distance": "microstructure",
  "aggressor-flow": "microstructure",
  "liquidity-refill-behaviour": "microstructure",
  "stop-cluster-probability": "microstructure",
  "reaction-sensitivity": "microstructure",
  "impulse-readiness": "microstructure",

  "funding-bias": "positioning",
  "oi-change": "positioning",
  "buy-sell-imbalance": "positioning",
  "spot-vs-derivatives-pressure": "positioning",
  "move-participation-score": "positioning",
  "volume-spike": "positioning",
  "liquidations-bias": "positioning",
  "funding-slope": "positioning",
  "real-momentum-score": "positioning",

  "market-speed": "volatility",
  "atr-regime": "volatility",
  compression: "volatility",
  "breakout-risk": "volatility",
  "fake-breakout-prob": "volatility",
  "sudden-move-risk": "volatility",
  "expansion-prob": "volatility",
  "volatility-expansion-prob": "volatility",
  "news-risk-flag": "volatility",

  "market-stress-level": "risk",
  "cascade-risk": "risk",
  "trap-probability": "risk",
  "signal-conflict": "risk",
  "risk-gate": "risk",
  "trade-validity": "risk",

  "rr-potential": "execution",
  "invalidation-distance": "execution",
  "reward-distance": "execution",
  "reward-accessibility": "execution",
  "risk-arrival-speed": "execution",

  "relative-strength-vs-market": "onchain",
  "opportunity-rank": "onchain",
  "btc-leadership-state": "onchain",

  "exchange-inflow-outflow": "onchain",
  "whale-activity": "onchain",
  "wallet-distribution": "onchain",
  "active-addresses": "onchain",
  "nvt-ratio": "onchain",
  "mvrv-ratio": "onchain",
  dormancy: "onchain",
};

export const FLOW_SIGNAL_DEFAULT_WEIGHTS: FlowSignalWeightsConfig = {
  compression: 10,
  "volume-spike": 10,
  "market-speed": 7,
  "sudden-move-risk": 8,

  "funding-bias": 10,
  "oi-change": 8,
  "spot-vs-derivatives-pressure": 6,
  "move-participation-score": 6,

  "orderbook-imbalance": 8,
  "liquidity-density": 7,
  "depth-quality": 5,
  "spread-regime": 3,
  "orderbook-stability": 2,

  "entry-quality": 3,
  "rr-potential": 2,
  "invalidation-distance": 2,
  "reward-distance": 2,
  "reward-accessibility": 2,
  "risk-arrival-speed": 1,
  "entry-timing-window": 2,
  "slippage-risk": 2,
};

export const FLOW_SIGNAL_ALIASES: Record<string, string[]> = {
  "market-regime": ["marketRegime"],
  "distance-key-level": ["distanceToKeyLevel"],
  "range-position": ["rangePosition"],
  "liquidity-cluster": ["liquidityClusterNearby"],
  "last-swing-distance": ["lastSwingDistance"],
  "htf-level-reaction": ["htfLevelReaction"],
  "structure-age": ["structureAge"],
  "time-in-range": ["timeInRange"],
  "trend-direction": ["trendDirection"],
  "trend-strength": ["trendStrength"],
  "trend-phase": ["trendPhase"],
  "ema-alignment": ["emaAlignment"],
  "vwap-position": ["vwapPosition"],
  "time-since-regime-change": ["timeSinceRegimeChange"],
  "atr-regime": ["atrRegime"],
  compression: ["compression"],
  "market-speed": ["marketSpeed"],
  "breakout-risk": ["breakoutRisk"],
  "fake-breakout-prob": ["fakeBreakoutProbability"],
  "expansion-prob": ["expansionProbability"],
};

export const getFlowInputEnabled = (
  flowInputs: FlowSignalInputsConfig,
  key: string,
): boolean => {
  const direct = flowInputs[key];
  if (typeof direct === "boolean") return direct;
  const aliases = FLOW_SIGNAL_ALIASES[key] ?? [];
  for (const alias of aliases) {
    const value = flowInputs[alias];
    if (typeof value === "boolean") return value;
  }
  return false;
};
