import type { FeedKey, TileCategory } from "../types";

export type TileKind = "enum" | "numeric";

export interface TileDefinition {
  key: string;
  label: string;
  category: TileCategory;
  kind: TileKind;
  dependsOnFeeds: FeedKey[];
  unit?: string;
  requiresIndicators?: boolean;
}

export const DEFAULT_TILES = [
  "market-regime",
  "structure-age",
  "time-in-range",
  "market-intent",
  "trend-direction",
  "sudden-move-risk",
  "liquidity-density",
  "orderbook-stability",
  "slippage-risk",
  "entry-timing-window",
  "move-participation-score",
  "spot-vs-derivatives-pressure",
  "asymmetry-score",
  "trade-validity",
  "exchange-inflow-outflow",
  "whale-activity",
  "wallet-distribution",
  "active-addresses",
  "nvt-ratio",
  "mvrv-ratio",
  "dormancy",
  "relative-strength-vs-market",
  "market-stress-level",
] as const;

const defs: TileDefinition[] = [
  { key: "market-regime", label: "Market Regime", category: "Price Structure", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "distance-key-level", label: "Distance to Key Level", category: "Price Structure", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "range-position", label: "Range Position", category: "Price Structure", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "liquidity-cluster", label: "Liquidity Cluster Nearby", category: "Price Structure", kind: "enum", dependsOnFeeds: ["orderbook"] },
  { key: "last-swing-distance", label: "Last Swing Distance", category: "Price Structure", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "htf-level-reaction", label: "HTF Level Reaction", category: "Price Structure", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "structure-age", label: "Structure Age", category: "Price Structure", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "time-in-range", label: "Time in Range", category: "Price Structure", kind: "numeric", unit: "bars", dependsOnFeeds: ["priceOhlcv"] },
  { key: "market-intent", label: "Market Intent", category: "Price Structure", kind: "enum", dependsOnFeeds: ["priceOhlcv", "trades", "orderbook"] },

  { key: "trend-direction", label: "Trend Direction", category: "Trend State", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "trend-strength", label: "Trend Strength", category: "Trend State", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "trend-phase", label: "Trend Phase", category: "Trend State", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "ema-alignment", label: "EMA Alignment", category: "Trend State", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "vwap-position", label: "VWAP Position", category: "Trend State", kind: "enum", dependsOnFeeds: ["priceOhlcv", "trades"] },
  { key: "time-since-regime-change", label: "Time Since Regime Change", category: "Trend State", kind: "numeric", unit: "bars", dependsOnFeeds: ["priceOhlcv"] },

  { key: "atr-regime", label: "ATR Regime", category: "Volatility & Market Speed", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "compression", label: "Compression", category: "Volatility & Market Speed", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "market-speed", label: "Market Speed", category: "Volatility & Market Speed", kind: "enum", dependsOnFeeds: ["trades"] },
  { key: "breakout-risk", label: "Breakout Risk", category: "Volatility & Market Speed", kind: "enum", dependsOnFeeds: ["priceOhlcv", "trades"] },
  { key: "fake-breakout-prob", label: "Fake Breakout Probability", category: "Volatility & Market Speed", kind: "enum", dependsOnFeeds: ["priceOhlcv", "trades"] },
  { key: "expansion-prob", label: "Expansion Probability", category: "Volatility & Market Speed", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "sudden-move-risk", label: "Sudden Move Risk", category: "Volatility & Market Speed", kind: "enum", dependsOnFeeds: ["priceOhlcv", "trades"] },
  { key: "volatility-expansion-prob", label: "Volatility Expansion Probability", category: "Volatility & Market Speed", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "news-risk-flag", label: "News Risk Flag", category: "Volatility & Market Speed", kind: "enum", dependsOnFeeds: ["rawFeeds"] },

  { key: "spread-regime", label: "Spread Regime", category: "Liquidity & Execution", kind: "enum", dependsOnFeeds: ["orderbook"] },
  { key: "depth-quality", label: "Depth Quality", category: "Liquidity & Execution", kind: "enum", dependsOnFeeds: ["orderbook"] },
  { key: "orderbook-imbalance", label: "Orderbook Imbalance", category: "Liquidity & Execution", kind: "enum", dependsOnFeeds: ["orderbook"] },
  { key: "slippage-risk", label: "Slippage Risk", category: "Liquidity & Execution", kind: "enum", dependsOnFeeds: ["orderbook", "trades"] },
  { key: "liquidity-density", label: "Liquidity Density", category: "Liquidity & Execution", kind: "enum", dependsOnFeeds: ["orderbook"] },
  { key: "stop-cluster-probability", label: "Stop Cluster Probability", category: "Liquidity & Execution", kind: "enum", dependsOnFeeds: ["orderbook", "rawFeeds"] },
  { key: "liquidity-distance", label: "Liquidity Distance", category: "Liquidity & Execution", kind: "numeric", unit: "%", dependsOnFeeds: ["orderbook"] },
  { key: "entry-timing-window", label: "Entry Timing Window", category: "Liquidity & Execution", kind: "enum", dependsOnFeeds: ["orderbook", "trades"] },
  { key: "reaction-sensitivity", label: "Reaction Sensitivity", category: "Liquidity & Execution", kind: "enum", dependsOnFeeds: ["orderbook", "trades"] },
  { key: "impulse-readiness", label: "Impulse Readiness", category: "Liquidity & Execution", kind: "enum", dependsOnFeeds: ["orderbook", "trades"] },
  { key: "orderbook-stability", label: "Orderbook Stability", category: "Liquidity & Execution", kind: "enum", dependsOnFeeds: ["orderbook"] },
  { key: "aggressor-flow", label: "Aggressor Flow", category: "Liquidity & Execution", kind: "enum", dependsOnFeeds: ["trades"] },
  { key: "liquidity-refill-behaviour", label: "Liquidity Refill Behaviour", category: "Liquidity & Execution", kind: "enum", dependsOnFeeds: ["orderbook", "trades"] },

  { key: "volume-spike", label: "Volume Spike", category: "Positioning / Derivatives", kind: "enum", dependsOnFeeds: ["trades"] },
  { key: "buy-sell-imbalance", label: "Buy/Sell Imbalance", category: "Positioning / Derivatives", kind: "enum", dependsOnFeeds: ["trades"] },
  { key: "oi-change", label: "OI Change (1h)", category: "Positioning / Derivatives", kind: "enum", dependsOnFeeds: ["openInterest"] },
  { key: "funding-bias", label: "Funding Bias", category: "Positioning / Derivatives", kind: "enum", dependsOnFeeds: ["fundingRate"] },
  { key: "funding-slope", label: "Funding Slope", category: "Positioning / Derivatives", kind: "enum", dependsOnFeeds: ["fundingRate", "openInterest"] },
  { key: "liquidations-bias", label: "Liquidations Bias", category: "Positioning / Derivatives", kind: "enum", dependsOnFeeds: ["openInterest", "trades", "rawFeeds"] },
  { key: "move-participation-score", label: "Move Participation Score", category: "Positioning / Derivatives", kind: "enum", dependsOnFeeds: ["trades", "openInterest"] },
  { key: "spot-vs-derivatives-pressure", label: "Spot vs Derivatives Pressure", category: "Positioning / Derivatives", kind: "enum", dependsOnFeeds: ["trades", "openInterest", "fundingRate"] },
  { key: "real-momentum-score", label: "Real Momentum Score", category: "Positioning / Derivatives", kind: "enum", dependsOnFeeds: ["trades", "openInterest", "priceOhlcv"] },

  { key: "entry-quality", label: "Entry Quality Score", category: "Entry Quality", kind: "enum", dependsOnFeeds: ["priceOhlcv", "trades"] },
  { key: "rr-potential", label: "RR Potential", category: "Entry Quality", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "invalidation-distance", label: "Invalidation Distance", category: "Entry Quality", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "reward-distance", label: "Reward Distance", category: "Entry Quality", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "risk-arrival-speed", label: "Risk Arrival Speed", category: "Entry Quality", kind: "enum", dependsOnFeeds: ["priceOhlcv", "trades"] },
  { key: "reward-accessibility", label: "Reward Accessibility", category: "Entry Quality", kind: "enum", dependsOnFeeds: ["priceOhlcv"] },
  { key: "asymmetry-score", label: "Asymmetry Score", category: "Entry Quality", kind: "enum", dependsOnFeeds: ["priceOhlcv", "trades"] },

  { key: "trade-validity", label: "Trade Validity", category: "Trade Filters", kind: "enum", dependsOnFeeds: ["priceOhlcv", "trades"] },
  { key: "signal-conflict", label: "Signal Conflict Level", category: "Trade Filters", kind: "enum", dependsOnFeeds: ["priceOhlcv", "orderbook", "trades"] },
  { key: "risk-gate", label: "Risk Gate", category: "Trade Filters", kind: "enum", dependsOnFeeds: ["priceOhlcv", "orderbook", "trades"] },

  { key: "exchange-inflow-outflow", label: "Exchange Inflow / Outflow", category: "On-Chain Metrics", kind: "enum", dependsOnFeeds: ["netFlow", "rawFeeds"] },
  { key: "whale-activity", label: "Whale Activity", category: "On-Chain Metrics", kind: "enum", dependsOnFeeds: ["netFlow", "rawFeeds"] },
  { key: "wallet-distribution", label: "Wallet Distribution", category: "On-Chain Metrics", kind: "enum", dependsOnFeeds: ["netFlow", "rawFeeds"] },
  { key: "active-addresses", label: "Active Addresses", category: "On-Chain Metrics", kind: "numeric", unit: "addr", dependsOnFeeds: ["netFlow", "rawFeeds"] },
  { key: "nvt-ratio", label: "NVT Ratio", category: "On-Chain Metrics", kind: "numeric", dependsOnFeeds: ["netFlow", "rawFeeds"] },
  { key: "mvrv-ratio", label: "MVRV", category: "On-Chain Metrics", kind: "numeric", dependsOnFeeds: ["netFlow", "rawFeeds"] },
  { key: "dormancy", label: "Dormancy", category: "On-Chain Metrics", kind: "numeric", unit: "days", dependsOnFeeds: ["netFlow", "rawFeeds"] },

  { key: "relative-strength-vs-market", label: "Relative Strength vs Market", category: "Context / Cross-Market", kind: "enum", dependsOnFeeds: ["netFlow", "priceOhlcv"] },
  { key: "opportunity-rank", label: "Opportunity Rank", category: "Context / Cross-Market", kind: "enum", dependsOnFeeds: ["rawFeeds", "priceOhlcv"] },
  { key: "btc-leadership-state", label: "BTC Leadership State", category: "Context / Cross-Market", kind: "enum", dependsOnFeeds: ["netFlow", "rawFeeds"] },

  { key: "market-stress-level", label: "Market Stress Level", category: "Risk Environment / Market Stress", kind: "enum", dependsOnFeeds: ["priceOhlcv", "orderbook", "trades"] },
  { key: "cascade-risk", label: "Cascade Risk", category: "Risk Environment / Market Stress", kind: "enum", dependsOnFeeds: ["openInterest", "trades", "orderbook"] },
  { key: "trap-probability", label: "Trap Probability", category: "Risk Environment / Market Stress", kind: "enum", dependsOnFeeds: ["priceOhlcv", "trades", "orderbook"] },

  { key: "rsi-state", label: "RSI State", category: "Indicators", kind: "enum", dependsOnFeeds: ["priceOhlcv"], requiresIndicators: true },
  { key: "macd-state", label: "MACD State", category: "Indicators", kind: "enum", dependsOnFeeds: ["priceOhlcv"], requiresIndicators: true },
  { key: "adx-state", label: "ADX State", category: "Indicators", kind: "enum", dependsOnFeeds: ["priceOhlcv"], requiresIndicators: true },
  { key: "bbands-squeeze", label: "BBands Squeeze", category: "Indicators", kind: "enum", dependsOnFeeds: ["priceOhlcv"], requiresIndicators: true },
  { key: "divergence-state", label: "Divergence", category: "Indicators", kind: "enum", dependsOnFeeds: ["priceOhlcv", "trades"], requiresIndicators: true },
  { key: "supertrend-direction", label: "Supertrend Direction", category: "Indicators", kind: "enum", dependsOnFeeds: ["priceOhlcv"], requiresIndicators: true },
  { key: "ichimoku-cloud-bias", label: "Ichimoku Cloud Bias", category: "Indicators", kind: "enum", dependsOnFeeds: ["priceOhlcv"], requiresIndicators: true },
];

export const TILE_DEFINITIONS: Record<string, TileDefinition> = defs.reduce((acc, def) => {
  acc[def.key] = def;
  return acc;
}, {} as Record<string, TileDefinition>);

export const ADVANCED_TILES = defs.map((d) => d.key).filter((key) => !DEFAULT_TILES.includes(key as (typeof DEFAULT_TILES)[number]));
