import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../hooks/useAuthStore";

// ═══════════════════════════════════════════════════════════════════
// BOT DEFINITIONS — ALL 30 BOTS + BUILDER
// ═══════════════════════════════════════════════════════════════════

interface BotConfig {
  id: string; name: string; tier: string; description: string;
  strategy: string; riskLevel: "Low" | "Medium" | "High"; avgWinRate: string;
  bestFor: string[]; howItWorks: string[];
  defaultPair: string; defaultTimeframe: string; defaultTradeSize: number;
  defaultRisk: number; defaultLeverage: number; defaultTp: number; defaultSl: number;
  indicators: string[]; entryLong: string; entryShort: string; exitLogic: string;
  isBuilder?: boolean;
}

const B: Record<string, BotConfig> = {
  // ── CREATE ──
  "builder": {
    id: "builder", name: "Multi-Condition Builder", tier: "create", isBuilder: true,
    description: "Create and launch custom trading bots with flexible rule-based logic. Combine indicators, price conditions, and risk rules into a deployable strategy.",
    strategy: "Rule-Based Custom", riskLevel: "Medium", avgWinRate: "Custom",
    bestFor: ["Advanced users", "Custom strategies", "Multi-indicator confirmation", "Flexible rule testing"],
    howItWorks: [
      "Choose market, pair, and timeframe",
      "Add entry conditions (RSI, EMA, MACD, Volume, Price...)",
      "Combine with AND/OR logic groups",
      "Define exit rules (TP/SL, trailing, indicator-based)",
      "Set risk management (position size, leverage, max loss)",
      "Review, validate, and launch as paper or live bot",
    ],
    defaultPair: "BTC/USDT", defaultTimeframe: "15m", defaultTradeSize: 100,
    defaultRisk: 1, defaultLeverage: 3, defaultTp: 2, defaultSl: 1,
    indicators: ["RSI", "EMA", "SMA", "MACD", "Bollinger", "VWAP", "ATR", "Volume", "Price"],
    entryLong: "User-defined conditions (AND/OR groups)", entryShort: "User-defined conditions (AND/OR groups)",
    exitLogic: "TP/SL + trailing + indicator-based exit",
  },
  // ── FEATURED ──
  "trend-pullback": {
    id: "trend-pullback", name: "Trend Pullback Bot", tier: "featured",
    description: "Trades pullbacks within strong trends using EMA and momentum confirmation. Waits for price to retrace to moving average zone, then enters in trend direction with RSI confirmation.",
    strategy: "Trend Following", riskLevel: "Medium", avgWinRate: "~62%",
    bestFor: ["Trending markets", "BTC, ETH, SOL", "15m / 1H timeframes", "Avoid sideways/choppy markets"],
    howItWorks: ["Detects trend direction using EMA 50/200 crossover", "Waits for price to pull back to EMA 50 zone", "Confirms entry with RSI (< 40 long, > 60 short)", "Enters continuation trade in trend direction", "Manages exit with fixed TP/SL ratio"],
    defaultPair: "BTC/USDT", defaultTimeframe: "15m", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 3, defaultTp: 2, defaultSl: 1,
    indicators: ["EMA 50", "EMA 200", "RSI 14"],
    entryLong: "EMA50 > EMA200 AND price near EMA50 AND RSI < 40", entryShort: "EMA50 < EMA200 AND price near EMA50 AND RSI > 60", exitLogic: "TP: +2% / SL: -1% (2:1 R:R)",
  },
  "breakout-retest": {
    id: "breakout-retest", name: "Breakout Retest Bot", tier: "featured",
    description: "Enters after confirmed breakouts and retests of key market levels. Waits for price to break S/R, retest the broken level, then enters on continuation confirmation.",
    strategy: "Breakout Continuation", riskLevel: "Medium", avgWinRate: "~58%",
    bestFor: ["Strong momentum markets", "Volatility expansion", "BTC, ETH, major altcoins", "Avoid weak fakeout environments"],
    howItWorks: ["Detects breakout above resistance or below support", "Waits for price to retest broken level", "Confirms continuation with momentum candle", "Opens trade in breakout direction", "Manages with tight stop below retest level"],
    defaultPair: "ETH/USDT", defaultTimeframe: "15m", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 3, defaultTp: 2.5, defaultSl: 1,
    indicators: ["S/R Levels", "Volume", "ATR", "Candle Patterns"],
    entryLong: "Resistance break AND retest hold AND bullish candle confirm", entryShort: "Support break AND retest rejection AND bearish candle confirm", exitLogic: "TP: +2.5% / SL: -1% (2.5:1 R:R)",
  },
  "multi-condition": {
    id: "multi-condition", name: "Multi-Condition Bot", tier: "featured",
    description: "Combines multiple technical indicators and conditions into a single entry signal. Only trades when ALL conditions align for maximum probability.",
    strategy: "Multi-Factor", riskLevel: "Low", avgWinRate: "~65%",
    bestFor: ["All market conditions", "Higher win rate preference", "Patient traders", "Swing trading"],
    howItWorks: ["Checks trend alignment (EMA)", "Checks momentum (RSI + MACD)", "Checks volatility (ATR regime)", "Checks volume (above average)", "Only enters when ALL 4 conditions pass"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1H", defaultTradeSize: 150, defaultRisk: 0.5, defaultLeverage: 2, defaultTp: 2.5, defaultSl: 1,
    indicators: ["EMA 20/50/200", "RSI 14", "MACD", "ATR", "Volume SMA"],
    entryLong: "EMA aligned bullish AND RSI 30-50 AND MACD cross up AND vol > avg", entryShort: "EMA aligned bearish AND RSI 50-70 AND MACD cross down AND vol > avg", exitLogic: "TP: +2.5% / SL: -1% / Trailing: ATR-based",
  },
  // ── POPULAR ──
  "trend": {
    id: "trend", name: "Trend Bot", tier: "popular",
    description: "Simple trend-following bot using moving average crossover. Rides the trend until reversal signal appears.",
    strategy: "Trend Following", riskLevel: "Medium", avgWinRate: "~55%",
    bestFor: ["Strong trending markets", "BTC, ETH majors", "4H / 1D timeframes"],
    howItWorks: ["Detects trend via EMA 20/50 crossover", "Enters on golden/death cross", "Rides trend with trailing stop", "Exits on reverse cross"],
    defaultPair: "BTC/USDT", defaultTimeframe: "4H", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 2, defaultTp: 5, defaultSl: 2,
    indicators: ["EMA 20", "EMA 50"], entryLong: "EMA20 crosses above EMA50", entryShort: "EMA20 crosses below EMA50", exitLogic: "TP: +5% / SL: -2% / Trailing stop",
  },
  "momentum-volume": {
    id: "momentum-volume", name: "Momentum + Volume Bot", tier: "popular",
    description: "Combines price momentum with volume spikes to catch explosive moves early. Enters when both momentum and volume confirm direction.",
    strategy: "Momentum", riskLevel: "Medium", avgWinRate: "~57%",
    bestFor: ["Volatile markets", "News-driven moves", "15m / 1H timeframes", "High volume pairs"],
    howItWorks: ["Monitors RSI momentum direction", "Detects volume spike (> 2x average)", "Confirms price breakout from range", "Enters on momentum + volume alignment"],
    defaultPair: "BTC/USDT", defaultTimeframe: "15m", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 3, defaultTp: 2, defaultSl: 1,
    indicators: ["RSI 14", "Volume SMA 20", "ATR"], entryLong: "RSI > 55 AND volume > 2x SMA AND price breakout up", entryShort: "RSI < 45 AND volume > 2x SMA AND price breakout down", exitLogic: "TP: +2% / SL: -1%",
  },
  "smart-dca": {
    id: "smart-dca", name: "Smart DCA Bot", tier: "popular",
    description: "Dollar-cost averaging with smart entry timing. Uses RSI and support levels to buy dips instead of fixed intervals.",
    strategy: "DCA + Technical", riskLevel: "Low", avgWinRate: "~72%",
    bestFor: ["Long-term accumulation", "Bear markets", "BTC, ETH", "Low risk tolerance"],
    howItWorks: ["Sets base DCA interval (daily/weekly)", "Accelerates buying on RSI oversold", "Increases size near support levels", "Pauses on extreme overbought"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1D", defaultTradeSize: 50, defaultRisk: 0.5, defaultLeverage: 1, defaultTp: 10, defaultSl: 0,
    indicators: ["RSI 14", "S/R Levels", "SMA 200"], entryLong: "DCA interval reached AND RSI < 35 (bonus size)", entryShort: "N/A (long only)", exitLogic: "TP: +10% / No SL (accumulation mode)",
  },
  // ── MARKET ──
  "grid": {
    id: "grid", name: "Grid Bot", tier: "market",
    description: "Places buy and sell orders at regular intervals within a price range. Profits from price oscillation in sideways markets.",
    strategy: "Market Making", riskLevel: "Low", avgWinRate: "~70%",
    bestFor: ["Sideways/ranging markets", "Stable pairs", "Low volatility periods"],
    howItWorks: ["Defines upper/lower price bounds", "Places grid of limit orders", "Buys low, sells high within range", "Auto-replenishes filled orders"],
    defaultPair: "BTC/USDT", defaultTimeframe: "15m", defaultTradeSize: 500, defaultRisk: 0.5, defaultLeverage: 1, defaultTp: 0.5, defaultSl: 5,
    indicators: ["Bollinger Bands", "ATR"], entryLong: "Grid buy at each level", entryShort: "Grid sell at each level", exitLogic: "Per-grid TP: 0.5% / Range break SL: -5%",
  },
  "range-trading": {
    id: "range-trading", name: "Range Trading Bot", tier: "market",
    description: "Buys at range support and sells at range resistance. Uses Bollinger Bands and RSI to identify range boundaries.",
    strategy: "Mean Reversion", riskLevel: "Low", avgWinRate: "~68%",
    bestFor: ["Sideways markets", "Consolidation phases", "Low ATR environments"],
    howItWorks: ["Identifies range using Bollinger Bands", "Buys at lower band + RSI oversold", "Sells at upper band + RSI overbought", "Stops if range breaks"],
    defaultPair: "ETH/USDT", defaultTimeframe: "1H", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 2, defaultTp: 1.5, defaultSl: 1,
    indicators: ["Bollinger Bands 20", "RSI 14"], entryLong: "Price at lower BB AND RSI < 30", entryShort: "Price at upper BB AND RSI > 70", exitLogic: "TP: mid BB / SL: -1% below band",
  },
  "rsi-reversal": {
    id: "rsi-reversal", name: "RSI Reversal Bot", tier: "market",
    description: "Catches reversal points using RSI extreme readings with price action confirmation.",
    strategy: "Mean Reversion", riskLevel: "Medium", avgWinRate: "~60%",
    bestFor: ["Oversold/overbought conditions", "Range markets", "15m / 1H timeframes"],
    howItWorks: ["Waits for RSI extreme (< 25 or > 75)", "Confirms with bullish/bearish engulfing candle", "Enters reversal trade", "Tight TP at mean"],
    defaultPair: "BTC/USDT", defaultTimeframe: "15m", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 3, defaultTp: 1.5, defaultSl: 0.8,
    indicators: ["RSI 14", "Candle Patterns"], entryLong: "RSI < 25 AND bullish engulfing", entryShort: "RSI > 75 AND bearish engulfing", exitLogic: "TP: +1.5% / SL: -0.8%",
  },
  "bollinger-reversion": {
    id: "bollinger-reversion", name: "Bollinger Reversion Bot", tier: "market",
    description: "Trades price reversion to Bollinger Band mean after extreme band touches.",
    strategy: "Mean Reversion", riskLevel: "Low", avgWinRate: "~65%",
    bestFor: ["Ranging markets", "Low volatility", "Any timeframe"],
    howItWorks: ["Detects price touching outer Bollinger Band", "Waits for reversal candle", "Enters toward middle band", "Exits at SMA 20 (mid band)"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1H", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 2, defaultTp: 1, defaultSl: 0.5,
    indicators: ["Bollinger Bands 20/2"], entryLong: "Close < lower BB AND reversal candle", entryShort: "Close > upper BB AND reversal candle", exitLogic: "TP: mid BB / SL: -0.5%",
  },
  "vwap-reversion": {
    id: "vwap-reversion", name: "VWAP Reversion Bot", tier: "market",
    description: "Trades price reversion to VWAP after significant deviations. Uses standard deviation bands around VWAP.",
    strategy: "Mean Reversion", riskLevel: "Low", avgWinRate: "~63%",
    bestFor: ["Intraday trading", "High volume sessions", "5m / 15m timeframes"],
    howItWorks: ["Calculates VWAP with 1-2 std dev bands", "Enters when price deviates > 1.5 std dev", "Targets reversion to VWAP", "Uses VWAP as dynamic TP"],
    defaultPair: "BTC/USDT", defaultTimeframe: "5m", defaultTradeSize: 100, defaultRisk: 0.5, defaultLeverage: 3, defaultTp: 0.8, defaultSl: 0.4,
    indicators: ["VWAP", "Std Dev Bands"], entryLong: "Price < VWAP - 1.5 std", entryShort: "Price > VWAP + 1.5 std", exitLogic: "TP: VWAP / SL: -0.4%",
  },
  // ── SCALPING ──
  "scalping": {
    id: "scalping", name: "Scalping Bot", tier: "scalping",
    description: "Ultra-fast scalping targeting small price movements with high frequency. Uses orderbook imbalance and momentum for sub-minute entries.",
    strategy: "Scalping", riskLevel: "High", avgWinRate: "~52%",
    bestFor: ["High liquidity pairs only", "BTC, ETH", "1m / 5m timeframes", "Low spread markets"],
    howItWorks: ["Monitors orderbook bid/ask imbalance", "Detects momentum micro-bursts", "Enters with market order", "Exits within 1-5 candles"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1m", defaultTradeSize: 200, defaultRisk: 0.3, defaultLeverage: 5, defaultTp: 0.3, defaultSl: 0.15,
    indicators: ["Orderbook Depth", "VWAP", "Tick Volume"], entryLong: "Bid imbalance > 60% AND price > VWAP", entryShort: "Ask imbalance > 60% AND price < VWAP", exitLogic: "TP: +0.3% / SL: -0.15%",
  },
  "micro-scalper": {
    id: "micro-scalper", name: "Micro Scalper Bot", tier: "scalping",
    description: "Captures micro price movements using tick-level data and spread analysis. Extremely high frequency with minimal hold time.",
    strategy: "Micro Scalping", riskLevel: "High", avgWinRate: "~51%",
    bestFor: ["BTC/USDT only", "1m timeframe", "Lowest spread environments", "High-speed connections"],
    howItWorks: ["Analyzes tick-by-tick price action", "Detects micro-momentum bursts", "Enters and exits within seconds", "Requires tight spreads"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1m", defaultTradeSize: 300, defaultRisk: 0.2, defaultLeverage: 10, defaultTp: 0.15, defaultSl: 0.1,
    indicators: ["Tick Data", "Spread", "Micro Volume"], entryLong: "Tick momentum up AND spread < 0.01%", entryShort: "Tick momentum down AND spread < 0.01%", exitLogic: "TP: +0.15% / SL: -0.1%",
  },
  "order-flow-scalper": {
    id: "order-flow-scalper", name: "Order Flow Scalper Bot", tier: "scalping",
    description: "Scalps based on real-time order flow analysis — detects aggressive buying/selling pressure from trade tape.",
    strategy: "Order Flow", riskLevel: "High", avgWinRate: "~54%",
    bestFor: ["Liquid futures markets", "BTC, ETH", "1m / 5m timeframes", "Real-time data required"],
    howItWorks: ["Analyzes trade tape for aggressor side", "Detects delta spikes (buy/sell pressure)", "Enters on strong flow direction", "Exits on flow reversal"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1m", defaultTradeSize: 200, defaultRisk: 0.3, defaultLeverage: 5, defaultTp: 0.4, defaultSl: 0.2,
    indicators: ["Delta", "CVD", "Aggressor Ratio"], entryLong: "Buy delta spike > threshold AND CVD rising", entryShort: "Sell delta spike > threshold AND CVD falling", exitLogic: "TP: +0.4% / SL: -0.2%",
  },
  // ── ADVANCED ──
  "market-structure": {
    id: "market-structure", name: "Market Structure Bot", tier: "advanced",
    description: "Trades based on market structure — higher highs/lows for uptrend, lower highs/lows for downtrend. Enters on structure breaks and retests.",
    strategy: "Structure Trading", riskLevel: "Medium", avgWinRate: "~60%",
    bestFor: ["All market conditions", "Swing trading", "1H / 4H timeframes", "Structure-based traders"],
    howItWorks: ["Maps swing highs and lows", "Identifies structure breaks (BOS)", "Waits for change of character (CHoCH)", "Enters on structure retest"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1H", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 3, defaultTp: 3, defaultSl: 1,
    indicators: ["Swing H/L", "BOS/CHoCH", "FVG"], entryLong: "Bullish BOS AND retest of broken structure", entryShort: "Bearish BOS AND retest of broken structure", exitLogic: "TP: next structure level / SL: below swing low",
  },
  "support-resistance": {
    id: "support-resistance", name: "Support Resistance Bot", tier: "advanced",
    description: "Trades bounces off key support and resistance levels identified from multiple timeframe analysis.",
    strategy: "S/R Trading", riskLevel: "Medium", avgWinRate: "~61%",
    bestFor: ["Clear S/R levels", "All markets", "15m / 1H / 4H timeframes"],
    howItWorks: ["Identifies key S/R from HTF", "Waits for price to reach level", "Confirms with rejection candle", "Enters bounce trade"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1H", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 3, defaultTp: 2, defaultSl: 0.8,
    indicators: ["S/R Levels", "Candle Patterns", "Volume"], entryLong: "Price at support AND rejection candle AND volume", entryShort: "Price at resistance AND rejection candle AND volume", exitLogic: "TP: next S/R / SL: -0.8%",
  },
  "liquidity-sweep": {
    id: "liquidity-sweep", name: "Liquidity Sweep Bot", tier: "advanced",
    description: "Detects liquidity sweeps where price grabs stop losses beyond key levels, then reverses. Smart money concept strategy.",
    strategy: "Smart Money", riskLevel: "High", avgWinRate: "~56%",
    bestFor: ["Volatile markets", "Major pairs", "15m / 1H timeframes", "Smart money traders"],
    howItWorks: ["Identifies liquidity pools (equal lows/highs)", "Detects sweep (wick beyond level)", "Waits for strong reversal candle", "Enters counter-sweep direction"],
    defaultPair: "BTC/USDT", defaultTimeframe: "15m", defaultTradeSize: 100, defaultRisk: 1.5, defaultLeverage: 3, defaultTp: 3, defaultSl: 1,
    indicators: ["Liquidity Levels", "Sweep Detection", "FVG"], entryLong: "Sell-side liquidity swept AND bullish reversal", entryShort: "Buy-side liquidity swept AND bearish reversal", exitLogic: "TP: +3% / SL: -1%",
  },
  "order-block": {
    id: "order-block", name: "Order Block Bot", tier: "advanced",
    description: "Trades from institutional order block zones — areas where large orders were previously placed. Smart money concept strategy.",
    strategy: "Smart Money", riskLevel: "Medium", avgWinRate: "~59%",
    bestFor: ["Trending markets", "Major pairs", "1H / 4H timeframes", "ICT/SMC traders"],
    howItWorks: ["Identifies order blocks (last candle before impulse)", "Marks bullish/bearish OB zones", "Waits for price to return to OB", "Enters on OB zone reaction"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1H", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 3, defaultTp: 3, defaultSl: 1,
    indicators: ["Order Blocks", "FVG", "BOS"], entryLong: "Price enters bullish OB zone AND shows rejection", entryShort: "Price enters bearish OB zone AND shows rejection", exitLogic: "TP: opposing OB / SL: below OB",
  },
  "hybrid": {
    id: "hybrid", name: "Hybrid Bot", tier: "advanced",
    description: "Combines trend-following with mean reversion — follows trends in trending markets, trades ranges in sideways markets. Adapts automatically.",
    strategy: "Adaptive", riskLevel: "Medium", avgWinRate: "~61%",
    bestFor: ["All market conditions", "Adaptive trading", "1H / 4H timeframes"],
    howItWorks: ["Classifies market regime (trend/range/volatile)", "Applies trend strategy in trends", "Applies range strategy in ranges", "Switches automatically"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1H", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 2, defaultTp: 2, defaultSl: 1,
    indicators: ["ADX", "EMA", "RSI", "BB"], entryLong: "Trend mode: EMA cross / Range mode: BB bounce", entryShort: "Trend mode: EMA cross / Range mode: BB bounce", exitLogic: "Dynamic TP/SL based on regime",
  },
  "custom-rule": {
    id: "custom-rule", name: "Custom Rule Bot", tier: "advanced",
    description: "Pre-configured template for custom rule-based strategies. Start from a template and modify conditions to match your style.",
    strategy: "Custom", riskLevel: "Medium", avgWinRate: "Custom",
    bestFor: ["Custom strategies", "Learning users", "Template-based building"],
    howItWorks: ["Select a template (trend/reversal/scalp)", "Modify entry conditions", "Adjust risk parameters", "Test and deploy"],
    defaultPair: "BTC/USDT", defaultTimeframe: "15m", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 3, defaultTp: 2, defaultSl: 1,
    indicators: ["User Selected"], entryLong: "User-defined", entryShort: "User-defined", exitLogic: "User-defined TP/SL",
  },
  // ── PRO ──
  "arbitrage": {
    id: "arbitrage", name: "Arbitrage Bot", tier: "pro",
    description: "Exploits price differences between spot and futures on the same exchange. Low-risk, market-neutral strategy.",
    strategy: "Arbitrage", riskLevel: "Low", avgWinRate: "~85%",
    bestFor: ["Low risk appetite", "Large capital", "Stable returns"],
    howItWorks: ["Monitors spot vs futures price spread", "Enters when spread exceeds threshold", "Profits from spread convergence", "Market-neutral (hedged)"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1m", defaultTradeSize: 1000, defaultRisk: 0.1, defaultLeverage: 1, defaultTp: 0.1, defaultSl: 0.05,
    indicators: ["Spread Monitor", "Funding Rate"], entryLong: "Spot-futures spread > threshold", entryShort: "Hedge on opposite side", exitLogic: "Spread convergence / Time-based",
  },
  "cross-exchange-arb": {
    id: "cross-exchange-arb", name: "Cross-Exchange Arbitrage Bot", tier: "pro",
    description: "Exploits price differences of the same asset across different exchanges. Requires accounts on multiple exchanges.",
    strategy: "Cross-Exchange Arb", riskLevel: "Low", avgWinRate: "~80%",
    bestFor: ["Multi-exchange setup", "Large capital", "Fast execution required"],
    howItWorks: ["Monitors same pair across exchanges", "Detects price discrepancy", "Buys on cheaper, sells on expensive", "Profits from convergence"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1m", defaultTradeSize: 2000, defaultRisk: 0.1, defaultLeverage: 1, defaultTp: 0.05, defaultSl: 0.03,
    indicators: ["Cross-Exchange Spread"], entryLong: "Buy on exchange A (cheaper)", entryShort: "Sell on exchange B (expensive)", exitLogic: "Spread convergence",
  },
  "delta-neutral": {
    id: "delta-neutral", name: "Delta Neutral Bot", tier: "pro",
    description: "Maintains delta-neutral position to profit from funding rates without directional exposure. Hedges spot against futures.",
    strategy: "Delta Neutral", riskLevel: "Low", avgWinRate: "~90%",
    bestFor: ["Passive income", "Low volatility preference", "Large capital", "Funding rate farming"],
    howItWorks: ["Buys spot asset", "Shorts equal amount in futures", "Collects positive funding rate", "Rebalances on drift"],
    defaultPair: "BTC/USDT", defaultTimeframe: "8H", defaultTradeSize: 5000, defaultRisk: 0.05, defaultLeverage: 1, defaultTp: 0, defaultSl: 0,
    indicators: ["Funding Rate", "Basis Spread"], entryLong: "Buy spot + Short futures (funding > 0.01%)", entryShort: "Close when funding turns negative", exitLogic: "Funding rate < threshold / Manual close",
  },
  "hedging": {
    id: "hedging", name: "Hedging Bot", tier: "pro",
    description: "Automatically hedges existing positions by opening opposite trades when risk increases. Protects portfolio during uncertain periods.",
    strategy: "Hedging", riskLevel: "Low", avgWinRate: "N/A (risk mgmt)",
    bestFor: ["Portfolio protection", "During high volatility", "Large positions"],
    howItWorks: ["Monitors existing positions", "Detects increased risk (VIX, ATR spike)", "Opens hedge on opposite side", "Closes hedge when risk normalizes"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1H", defaultTradeSize: 100, defaultRisk: 0.5, defaultLeverage: 1, defaultTp: 0, defaultSl: 0,
    indicators: ["ATR", "Portfolio Risk Score"], entryLong: "Hedge short exposure", entryShort: "Hedge long exposure", exitLogic: "Risk normalization / Manual",
  },
  "funding-rate": {
    id: "funding-rate", name: "Funding Rate Bot", tier: "pro",
    description: "Profits from extreme funding rates by taking the opposite side. When funding is very positive (longs pay shorts), it shorts. Vice versa.",
    strategy: "Funding Arbitrage", riskLevel: "Medium", avgWinRate: "~68%",
    bestFor: ["High funding rate periods", "Major pairs", "Passive income"],
    howItWorks: ["Monitors funding rates across pairs", "Enters when funding is extreme", "Takes opposite side to collect funding", "Exits when funding normalizes"],
    defaultPair: "BTC/USDT", defaultTimeframe: "8H", defaultTradeSize: 500, defaultRisk: 0.5, defaultLeverage: 2, defaultTp: 1, defaultSl: 2,
    indicators: ["Funding Rate", "OI"], entryLong: "Funding rate < -0.05% (shorts pay)", entryShort: "Funding rate > 0.05% (longs pay)", exitLogic: "Funding normalization / TP: +1%",
  },
  "basis": {
    id: "basis", name: "Basis Bot", tier: "pro",
    description: "Trades the basis spread between spot and futures prices. Profits from premium/discount convergence.",
    strategy: "Basis Trading", riskLevel: "Low", avgWinRate: "~75%",
    bestFor: ["Market-neutral preference", "Large capital", "Institutional-style trading"],
    howItWorks: ["Monitors spot-futures basis", "Enters when basis is extreme", "Profits from basis mean reversion", "Fully hedged position"],
    defaultPair: "BTC/USDT", defaultTimeframe: "4H", defaultTradeSize: 2000, defaultRisk: 0.2, defaultLeverage: 1, defaultTp: 0.3, defaultSl: 0.5,
    indicators: ["Basis Spread", "Historical Basis Mean"], entryLong: "Basis < -0.5% (futures discount)", entryShort: "Basis > 1% (futures premium)", exitLogic: "Basis mean reversion",
  },
  "volatility-adaptive": {
    id: "volatility-adaptive", name: "Volatility Adaptive Bot", tier: "pro",
    description: "Dynamically adjusts position size, TP/SL, and strategy based on current volatility regime. More aggressive in low vol, conservative in high vol.",
    strategy: "Volatility Adaptive", riskLevel: "Medium", avgWinRate: "~62%",
    bestFor: ["All market conditions", "Dynamic risk management", "Experienced traders"],
    howItWorks: ["Classifies volatility regime (low/normal/high/extreme)", "Adjusts position size inversely to vol", "Widens TP/SL in high vol", "Tightens in low vol"],
    defaultPair: "BTC/USDT", defaultTimeframe: "1H", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 3, defaultTp: 2, defaultSl: 1,
    indicators: ["ATR", "Bollinger Width", "Historical Vol"], entryLong: "Trend signal + vol-adjusted sizing", entryShort: "Trend signal + vol-adjusted sizing", exitLogic: "Dynamic TP/SL based on ATR multiple",
  },
  "session": {
    id: "session", name: "Session Bot", tier: "pro",
    description: "Trades based on market session timing — Asian, European, US sessions. Different strategies for different session characteristics.",
    strategy: "Session-Based", riskLevel: "Medium", avgWinRate: "~58%",
    bestFor: ["Session-aware trading", "Timezone optimization", "Intraday strategies"],
    howItWorks: ["Detects current trading session", "Applies session-specific strategy", "Asian: range trading / EU: breakout / US: momentum", "Adjusts parameters per session"],
    defaultPair: "BTC/USDT", defaultTimeframe: "15m", defaultTradeSize: 100, defaultRisk: 1, defaultLeverage: 3, defaultTp: 1.5, defaultSl: 0.8,
    indicators: ["Session Clock", "ATR", "Volume Profile"], entryLong: "Session open + momentum alignment", entryShort: "Session open + momentum alignment", exitLogic: "Session close or TP/SL hit",
  },
};

// ═══════════════════════════════════════════════════════════════════
// BOT CATEGORIES (left panel)
// ═══════════════════════════════════════════════════════════════════

const BOT_CATEGORIES = [
  { label: "Create", accent: "#2bc48a", bots: [
    { id: "builder", name: "Multi-Condition Builder", tier: "create" },
  ]},
  { label: "Featured Bots", accent: "#F5C542", bots: [
    { id: "trend-pullback", name: "Trend Pullback Bot", tier: "featured" },
    { id: "breakout-retest", name: "Breakout Retest Bot", tier: "featured" },
    { id: "multi-condition", name: "Multi-Condition Bot", tier: "featured" },
  ]},
  { label: "Popular Bots", accent: "#6ec4ff", bots: [
    { id: "trend", name: "Trend Bot", tier: "popular" },
    { id: "momentum-volume", name: "Momentum + Volume Bot", tier: "popular" },
    { id: "smart-dca", name: "Smart DCA Bot", tier: "popular" },
  ]},
  { label: "Market Bots", accent: "#9f8bff", bots: [
    { id: "grid", name: "Grid Bot", tier: "market" },
    { id: "range-trading", name: "Range Trading Bot", tier: "market" },
    { id: "rsi-reversal", name: "RSI Reversal Bot", tier: "market" },
    { id: "bollinger-reversion", name: "Bollinger Reversion Bot", tier: "market" },
    { id: "vwap-reversion", name: "VWAP Reversion Bot", tier: "market" },
  ]},
  { label: "Scalping Bots", accent: "#2bc48a", bots: [
    { id: "scalping", name: "Scalping Bot", tier: "scalping" },
    { id: "micro-scalper", name: "Micro Scalper Bot", tier: "scalping" },
    { id: "order-flow-scalper", name: "Order Flow Scalper Bot", tier: "scalping" },
  ]},
  { label: "Advanced Bots", accent: "#f4906c", bots: [
    { id: "market-structure", name: "Market Structure Bot", tier: "advanced" },
    { id: "support-resistance", name: "Support Resistance Bot", tier: "advanced" },
    { id: "liquidity-sweep", name: "Liquidity Sweep Bot", tier: "advanced" },
    { id: "order-block", name: "Order Block Bot", tier: "advanced" },
    { id: "hybrid", name: "Hybrid Bot", tier: "advanced" },
    { id: "custom-rule", name: "Custom Rule Bot", tier: "advanced" },
  ]},
  { label: "Pro Bots", accent: "#ef4444", bots: [
    { id: "arbitrage", name: "Arbitrage Bot", tier: "pro" },
    { id: "cross-exchange-arb", name: "Cross-Exchange Arbitrage Bot", tier: "pro" },
    { id: "delta-neutral", name: "Delta Neutral Bot", tier: "pro" },
    { id: "hedging", name: "Hedging Bot", tier: "pro" },
    { id: "funding-rate", name: "Funding Rate Bot", tier: "pro" },
    { id: "basis", name: "Basis Bot", tier: "pro" },
    { id: "volatility-adaptive", name: "Volatility Adaptive Bot", tier: "pro" },
    { id: "session", name: "Session Bot", tier: "pro" },
    { id: "spot-arbitrage", name: "Spot Arbitrage Bot", tier: "pro" },
    { id: "futures-hedge", name: "Futures Hedge Bot", tier: "pro" },
  ]},
] as const;

type BotEntry = (typeof BOT_CATEGORIES)[number]["bots"][number];

const TIER_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  create: { border: "border-[#2b8a5e]/60", bg: "bg-[#0f2a1f]", text: "text-[#2bc48a]" },
  featured: { border: "border-[#c4893d]/60", bg: "bg-[#2a1f0f]", text: "text-[#ffd699]" },
  popular: { border: "border-[#3d6f8f]/60", bg: "bg-[#0f1f2a]", text: "text-[#b8d9ff]" },
  market: { border: "border-[#6b4fa8]/60", bg: "bg-[#1a0f2a]", text: "text-[#d5c5ff]" },
  scalping: { border: "border-[#2b8a5e]/60", bg: "bg-[#0f2a1f]", text: "text-[#a8f0c8]" },
  advanced: { border: "border-[#c47a4a]/60", bg: "bg-[#2a1a0f]", text: "text-[#ffd0b0]" },
  pro: { border: "border-[#a03030]/60", bg: "bg-[#2a0f0f]", text: "text-[#ffb0b0]" },
};

const RISK_COLORS: Record<string, string> = { Low: "text-[#2bc48a]", Medium: "text-[#F5C542]", High: "text-[#f6465d]" };

// ── Plan-based bot access ──
type PlanLevel = "explorer" | "trader" | "strategist" | "titan";
const PLAN_LABELS: Record<PlanLevel, { label: string; color: string; bg: string }> = {
  explorer: { label: "Explorer", color: "text-[#6B6F76]", bg: "bg-[#1A1B1F]" },
  trader: { label: "Trader", color: "text-[#6ec4ff]", bg: "bg-[#0f1f2a]" },
  strategist: { label: "Strategist", color: "text-[#9f8bff]", bg: "bg-[#1a0f2a]" },
  titan: { label: "Titan", color: "text-[#ef4444]", bg: "bg-[#2a0f0f]" },
};

const BOT_PLAN_MAP: Record<string, PlanLevel> = {
  // Trader
  "trend": "trader", "grid": "trader", "rsi-reversal": "trader", "bollinger-reversion": "trader",
  // Strategist
  "trend-pullback": "strategist", "breakout-retest": "strategist", "momentum-volume": "strategist",
  "smart-dca": "strategist", "range-trading": "strategist", "scalping": "strategist",
  "support-resistance": "strategist", "market-structure": "strategist", "vwap-reversion": "strategist",
  // Titan
  "builder": "titan", "multi-condition": "titan", "custom-rule": "titan",
  "micro-scalper": "titan", "order-flow-scalper": "titan", "liquidity-sweep": "titan",
  "order-block": "titan", "hybrid": "titan",
  "arbitrage": "titan", "cross-exchange-arb": "titan", "delta-neutral": "titan",
  "hedging": "titan", "funding-rate": "titan", "basis": "titan",
  "volatility-adaptive": "titan", "session": "titan",
};

const PLAN_RANK: Record<PlanLevel, number> = { explorer: 0, trader: 1, strategist: 2, titan: 3 };
const isBotLocked = (botId: string, userPlan: PlanLevel): boolean => {
  const required = BOT_PLAN_MAP[botId] ?? "trader";
  return PLAN_RANK[userPlan] < PLAN_RANK[required];
};
const getRequiredPlan = (botId: string): PlanLevel => BOT_PLAN_MAP[botId] ?? "trader";

// ═══════════════════════════════════════════════════════════════════
// BUILDER PANEL — Multi-Condition Builder workspace
// ═══════════════════════════════════════════════════════════════════

const BuilderPanel = () => {
  const [activeStep, setActiveStep] = useState(0);
  const steps = ["Strategy Name", "Market & Timeframe", "Entry Rules", "Exit Rules", "Risk Settings", "Review & Launch"];
  const templates = [
    { name: "Trend Pullback", desc: "EMA trend + RSI pullback entry", complexity: "Simple" },
    { name: "Breakout Retest", desc: "S/R breakout + retest confirmation", complexity: "Medium" },
    { name: "RSI Reversal", desc: "RSI extreme + candle confirmation", complexity: "Simple" },
    { name: "EMA Cross", desc: "Moving average crossover system", complexity: "Simple" },
    { name: "Multi-Factor", desc: "4 conditions must align", complexity: "Advanced" },
    { name: "Empty", desc: "Start from scratch", complexity: "Custom" },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0d1a14] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[#2b8a5e]/60 bg-[#0f2a1f] px-2.5 py-0.5 text-[10px] font-semibold text-[#2bc48a]">Builder</span>
            </div>
            <h1 className="mt-1.5 text-xl font-bold text-white">Multi-Condition Builder</h1>
            <p className="mt-1 max-w-lg text-sm text-[#9CA3AF]">Create custom bot strategies using indicator, price, and risk conditions.</p>
          </div>
          <button type="button" className="rounded-lg bg-[#2bc48a] px-5 py-2.5 text-sm font-bold text-black transition hover:bg-[#24a876]">
            Open Builder
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          {/* Steps */}
          <div className="flex items-center gap-1">
            {steps.map((step, i) => (
              <button key={i} type="button" onClick={() => setActiveStep(i)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
                  activeStep === i ? "border-[#2bc48a]/40 bg-[#0d1a14] text-[#2bc48a]" : "border-white/10 bg-[#121316] text-[#6B6F76] hover:text-white"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${activeStep === i ? "bg-[#2bc48a] text-black" : "bg-white/10 text-[#6B6F76]"}`}>{i + 1}</span>
                {step}
              </button>
            ))}
          </div>

          {/* Strategy Summary */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "Entry Rules", value: "0", color: "text-[#2bc48a]" },
              { label: "Exit Rules", value: "0", color: "text-[#F5C542]" },
              { label: "Indicators", value: "None", color: "text-white" },
              { label: "Risk Mode", value: "Fixed %", color: "text-white" },
              { label: "Status", value: "Draft", color: "text-[#F5C542]" },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-white/10 bg-[#121316] p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">{card.label}</p>
                <p className={`mt-1 text-sm font-semibold ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Templates */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-white">Start from Template</h3>
            <div className="grid grid-cols-3 gap-2.5">
              {templates.map((t) => (
                <button key={t.name} type="button" className="group rounded-xl border border-white/10 bg-[#121316] p-3 text-left transition hover:border-[#2bc48a]/40 hover:bg-[#0d1a14]">
                  <p className="text-sm font-semibold text-white group-hover:text-[#2bc48a]">{t.name}</p>
                  <p className="mt-0.5 text-[11px] text-[#6B6F76]">{t.desc}</p>
                  <span className="mt-1.5 inline-block rounded border border-white/10 bg-[#1A1B1F] px-1.5 py-0.5 text-[9px] text-[#8A8F98]">{t.complexity}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Available Conditions */}
          <div className="rounded-xl border border-white/10 bg-[#121316] p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Available Condition Blocks</h3>
            <div className="flex flex-wrap gap-1.5">
              {["RSI", "EMA", "SMA", "MACD", "Bollinger Bands", "VWAP", "ATR", "Volume", "Price", "Candle Close", "Candle Open", "High/Low", "Price Change %", "Support/Resistance", "Funding Rate", "OI Change", "Delta/CVD", "Orderbook Imbalance"].map((block) => (
                <span key={block} className="rounded-full border border-white/10 bg-[#1A1B1F] px-2.5 py-1 text-[11px] text-[#BFC2C7] hover:border-[#2bc48a]/40 hover:text-[#2bc48a] transition cursor-pointer">{block}</span>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="rounded-xl border border-white/10 bg-[#121316] p-4">
            <h3 className="mb-2 text-sm font-semibold text-white">How Builder Works</h3>
            <ol className="space-y-1.5">
              {["Choose market, pair, and timeframe", "Add entry conditions with AND/OR logic", "Define exit rules (TP/SL, trailing, indicator-based)", "Set risk management (size, leverage, max loss)", "Validate and launch as paper or live bot"].map((step, i) => (
                <li key={i} className="flex gap-2 text-[12px] text-[#9CA3AF]">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0d1a14] text-[9px] font-bold text-[#2bc48a]">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// BOT DETAIL PANEL — standard bot page
// ═══════════════════════════════════════════════════════════════════

// ── Bot-specific Quick Setup forms ──
const I = "mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-sm text-white outline-none";
const L = "text-[11px] text-[#6B6F76]";
const pairs = ["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT","XRP/USDT","AAVE/USDT","DOGE/USDT","ADA/USDT"];
const tfs = ["1m","5m","15m","1H","4H","1D","8H"];

const GridSetup = () => {
  const [pair,setPair]=useState("BTC/USDT"); const [lo,setLo]=useState(60000); const [hi,setHi]=useState(72000);
  const [grids,setGrids]=useState(20); const [invest,setInvest]=useState(1000); const [mode,setMode]=useState("Neutral");
  const perGrid=invest/grids; const spacing=((hi-lo)/grids); const estProfit=(spacing/((lo+hi)/2)*100);
  return (<div className="rounded-xl border border-[#9f8bff]/30 bg-[#12101e] p-4">
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><span className="text-[#9f8bff]">&#9881;</span> Grid Setup</h3>
    <div className="grid grid-cols-2 gap-3">
      <label className={L}>Pair<select value={pair} onChange={e=>setPair(e.target.value)} className={I}>{pairs.map(p=><option key={p}>{p}</option>)}</select></label>
      <label className={L}>Mode<select value={mode} onChange={e=>setMode(e.target.value)} className={I}>{["Neutral","Long","Short"].map(m=><option key={m}>{m}</option>)}</select></label>
      <label className={L}>Price Range Low<input type="number" value={lo} onChange={e=>setLo(Number(e.target.value))} className={I}/></label>
      <label className={L}>Price Range High<input type="number" value={hi} onChange={e=>setHi(Number(e.target.value))} className={I}/></label>
      <label className={L}>Grid Count<input type="number" value={grids} onChange={e=>setGrids(Math.max(2,Number(e.target.value)))} className={I}/></label>
      <label className={L}>Investment (USDT)<input type="number" value={invest} onChange={e=>setInvest(Number(e.target.value))} className={I}/></label>
    </div>
    <div className="mt-3 rounded-lg border border-white/10 bg-[#0F1012] p-3">
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-[#9f8bff]">Grid Preview</p>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div><span className="text-[#6B6F76]">Levels</span><p className="font-semibold text-white">{grids}</p></div>
        <div><span className="text-[#6B6F76]">Spacing</span><p className="font-semibold text-white">${spacing.toFixed(0)}</p></div>
        <div><span className="text-[#6B6F76]">Per Grid</span><p className="font-semibold text-white">${perGrid.toFixed(1)}</p></div>
        <div><span className="text-[#6B6F76]">Est. Profit/Grid</span><p className="font-semibold text-[#2bc48a]">{estProfit.toFixed(3)}%</p></div>
        <div><span className="text-[#6B6F76]">Total Capital</span><p className="font-semibold text-white">${invest}</p></div>
        <div><span className="text-[#6B6F76]">Range Width</span><p className="font-semibold text-white">{((hi-lo)/lo*100).toFixed(1)}%</p></div>
      </div>
    </div>
    <button type="button" className="mt-3 w-full rounded-lg bg-[#9f8bff] py-2 text-sm font-bold text-black transition hover:bg-[#8a76ee]">Launch Grid Bot</button>
  </div>);
};

const DcaSetup = () => {
  const [pair,setPair]=useState("BTC/USDT"); const [base,setBase]=useState(100); const [safetyCount,setSafetyCount]=useState(5);
  const [safetySize,setSafetySize]=useState(100); const [deviation,setDeviation]=useState(2); const [volScale,setVolScale]=useState(1.2);
  const [stepScale,setStepScale]=useState(1.1); const [tp,setTp]=useState(1.5); const [sl,setSl]=useState(8); const [maxCap,setMaxCap]=useState(1000);
  const totalSafety=Array.from({length:safetyCount},(_,i)=>safetySize*Math.pow(volScale,i)).reduce((a,b)=>a+b,0);
  const totalCap=base+totalSafety; const avgEntry=100-(deviation*safetyCount/2);
  return (<div className="rounded-xl border border-[#2bc48a]/30 bg-[#0d1a14] p-4">
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><span className="text-[#2bc48a]">&#9881;</span> DCA Setup</h3>
    <div className="grid grid-cols-2 gap-3">
      <label className={L}>Pair<select value={pair} onChange={e=>setPair(e.target.value)} className={I}>{pairs.map(p=><option key={p}>{p}</option>)}</select></label>
      <label className={L}>Base Order (USDT)<input type="number" value={base} onChange={e=>setBase(Number(e.target.value))} className={I}/></label>
      <label className={L}>Safety Orders<input type="number" value={safetyCount} onChange={e=>setSafetyCount(Math.max(1,Number(e.target.value)))} className={I}/></label>
      <label className={L}>Safety Size (USDT)<input type="number" value={safetySize} onChange={e=>setSafetySize(Number(e.target.value))} className={I}/></label>
      <label className={L}>Price Deviation %<input type="number" step="0.1" value={deviation} onChange={e=>setDeviation(Number(e.target.value))} className={I}/></label>
      <label className={L}>Volume Scale<input type="number" step="0.1" value={volScale} onChange={e=>setVolScale(Number(e.target.value))} className={I}/></label>
      <label className={L}>Step Scale<input type="number" step="0.1" value={stepScale} onChange={e=>setStepScale(Number(e.target.value))} className={I}/></label>
      <label className={L}>Max Capital<input type="number" value={maxCap} onChange={e=>setMaxCap(Number(e.target.value))} className={I}/></label>
      <label className={L}>Take Profit %<input type="number" step="0.1" value={tp} onChange={e=>setTp(Number(e.target.value))} className={I}/></label>
      <label className={L}>Stop Loss %<input type="number" step="0.1" value={sl} onChange={e=>setSl(Number(e.target.value))} className={I}/></label>
    </div>
    <div className="mt-3 rounded-lg border border-white/10 bg-[#0F1012] p-3">
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-[#2bc48a]">Capital Allocation Preview</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-[#6B6F76]">Initial Order</span><p className="font-semibold text-white">${base}</p></div>
        <div><span className="text-[#6B6F76]">Safety Orders Total</span><p className="font-semibold text-white">${totalSafety.toFixed(0)}</p></div>
        <div><span className="text-[#6B6F76]">Max Exposure</span><p className="font-semibold text-[#F5C542]">${Math.min(totalCap,maxCap).toFixed(0)}</p></div>
        <div><span className="text-[#6B6F76]">Avg Entry Est.</span><p className="font-semibold text-[#2bc48a]">~{avgEntry.toFixed(1)}% of spot</p></div>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-[#2bc48a] to-[#F5C542]" style={{width:`${Math.min(100,(totalCap/maxCap)*100)}%`}}/>
      </div>
      <p className="mt-1 text-[10px] text-[#6B6F76]">{((totalCap/maxCap)*100).toFixed(0)}% of max capital allocated</p>
    </div>
    <button type="button" className="mt-3 w-full rounded-lg bg-[#2bc48a] py-2 text-sm font-bold text-black transition hover:bg-[#24a876]">Launch DCA Bot</button>
  </div>);
};

const StandardSetup = ({ config, accentColor = "#2bc48a" }: { config: BotConfig; accentColor?: string }) => {
  const [pair,setPair]=useState(config.defaultPair); const [tf,setTf]=useState(config.defaultTimeframe);
  const [size,setSize]=useState(config.defaultTradeSize); const [risk,setRisk]=useState(config.defaultRisk);
  const [lev,setLev]=useState(config.defaultLeverage); const [tp,setTp]=useState(config.defaultTp); const [sl,setSl]=useState(config.defaultSl);
  // Bot-specific extra fields
  const isRsi=config.id==="rsi-reversal"; const isBb=config.id==="bollinger-reversion"; const isVwap=config.id==="vwap-reversion";
  const isBreakout=config.id==="breakout-retest"; const isPullback=config.id==="trend-pullback"; const isRange=config.id==="range-trading";
  const [rsiLen,setRsiLen]=useState(14); const [obLevel,setObLevel]=useState(70); const [osLevel,setOsLevel]=useState(30);
  const [bbLen,setBbLen]=useState(20); const [stdDev,setStdDev]=useState(2);
  const [vwapDev,setVwapDev]=useState(1.5); const [lookback,setLookback]=useState(20); const [retestTol,setRetestTol]=useState(0.3);
  const [emaFast,setEmaFast]=useState(50); const [emaSlow,setEmaSlow]=useState(200);
  return (<div className="rounded-xl border p-4" style={{borderColor:`${accentColor}30`,backgroundColor:`${accentColor}08`}}>
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><span style={{color:accentColor}}>&#9881;</span> Quick Setup</h3>
    <div className="grid grid-cols-2 gap-3">
      <label className={L}>Pair<select value={pair} onChange={e=>setPair(e.target.value)} className={I}>{pairs.map(p=><option key={p}>{p}</option>)}</select></label>
      <label className={L}>Timeframe<select value={tf} onChange={e=>setTf(e.target.value)} className={I}>{tfs.map(t=><option key={t}>{t}</option>)}</select></label>
      <label className={L}>Trade Size (USDT)<input type="number" value={size} onChange={e=>setSize(Number(e.target.value))} className={I}/></label>
      <label className={L}>Risk %<input type="number" step="0.1" value={risk} onChange={e=>setRisk(Number(e.target.value))} className={I}/></label>
      {(isPullback||isRange)&&<label className={L}>EMA Fast<input type="number" value={emaFast} onChange={e=>setEmaFast(Number(e.target.value))} className={I}/></label>}
      {(isPullback||isRange)&&<label className={L}>EMA Slow<input type="number" value={emaSlow} onChange={e=>setEmaSlow(Number(e.target.value))} className={I}/></label>}
      {isPullback&&<label className={L}>Pullback Tolerance %<input type="number" step="0.1" value={retestTol} onChange={e=>setRetestTol(Number(e.target.value))} className={I}/></label>}
      {isBreakout&&<label className={L}>Lookback Period<input type="number" value={lookback} onChange={e=>setLookback(Number(e.target.value))} className={I}/></label>}
      {isBreakout&&<label className={L}>Retest Tolerance %<input type="number" step="0.1" value={retestTol} onChange={e=>setRetestTol(Number(e.target.value))} className={I}/></label>}
      {isRsi&&<label className={L}>RSI Length<input type="number" value={rsiLen} onChange={e=>setRsiLen(Number(e.target.value))} className={I}/></label>}
      {isRsi&&<label className={L}>Overbought<input type="number" value={obLevel} onChange={e=>setObLevel(Number(e.target.value))} className={I}/></label>}
      {isRsi&&<label className={L}>Oversold<input type="number" value={osLevel} onChange={e=>setOsLevel(Number(e.target.value))} className={I}/></label>}
      {isBb&&<label className={L}>BB Length<input type="number" value={bbLen} onChange={e=>setBbLen(Number(e.target.value))} className={I}/></label>}
      {isBb&&<label className={L}>Std Dev<input type="number" step="0.1" value={stdDev} onChange={e=>setStdDev(Number(e.target.value))} className={I}/></label>}
      {isVwap&&<label className={L}>VWAP Deviation<input type="number" step="0.1" value={vwapDev} onChange={e=>setVwapDev(Number(e.target.value))} className={I}/></label>}
      <label className={L}>Leverage<input type="number" value={lev} onChange={e=>setLev(Number(e.target.value))} className={I}/></label>
      <label className={L}>TP %<input type="number" step="0.1" value={tp} onChange={e=>setTp(Number(e.target.value))} className={I}/></label>
      <label className={L}>SL %<input type="number" step="0.1" value={sl} onChange={e=>setSl(Number(e.target.value))} className={I}/></label>
      <div className="flex items-end">
        <button type="button" className="w-full rounded-lg py-2 text-sm font-bold text-black transition hover:opacity-90" style={{backgroundColor:accentColor}}>Launch Bot</button>
      </div>
    </div>
  </div>);
};

// Accent colors per bot category
const botAccent = (id: string): string => {
  if (["trend-pullback","breakout-retest","multi-condition"].includes(id)) return "#F5C542";
  if (["trend","momentum-volume","smart-dca"].includes(id)) return "#6ec4ff";
  if (["grid","range-trading","rsi-reversal","bollinger-reversion","vwap-reversion"].includes(id)) return "#9f8bff";
  if (["scalping","micro-scalper","order-flow-scalper"].includes(id)) return "#2bc48a";
  if (["market-structure","support-resistance","liquidity-sweep","order-block","hybrid","custom-rule"].includes(id)) return "#f4906c";
  return "#ef4444";
};

const BotDetailPanel = ({ bot, userPlan }: { bot: BotEntry; userPlan: PlanLevel }) => {
  const config = B[bot.id];
  if (!config) return <div className="flex flex-1 items-center justify-center text-[#6B6F76]">Bot configuration not found.</div>;

  const locked = isBotLocked(bot.id, userPlan);
  const reqPlan = getRequiredPlan(bot.id);
  const planInfo = PLAN_LABELS[reqPlan];

  if (locked) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
        <div className="text-center">
          <span className="mb-3 inline-block text-4xl">&#128274;</span>
          <h2 className="text-xl font-bold text-white">{bot.name}</h2>
          <p className="mt-2 max-w-md text-sm text-[#9CA3AF]">{config.description}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#1A1B1F] px-4 py-1.5 text-xs">
            <span className="text-[#6B6F76]">Required plan:</span>
            <span className={`font-bold ${planInfo.color}`}>{planInfo.label}</span>
          </div>
          <div className="mt-5">
            <a href="/pricing" className={`inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-bold text-black transition hover:opacity-90 ${planInfo.bg.replace("bg-","bg-")} ${reqPlan === "titan" ? "bg-gradient-to-r from-[#ef4444] to-[#f97316]" : reqPlan === "strategist" ? "bg-[#9f8bff]" : "bg-[#6ec4ff]"}`}>
              Upgrade to {planInfo.label}
            </a>
          </div>
          <p className="mt-3 text-[11px] text-[#6B6F76]">Unlock {bot.name} and {reqPlan === "titan" ? "16+" : reqPlan === "strategist" ? "8+" : "4+"} other trading bots.</p>
        </div>
      </div>
    );
  }

  if (config.isBuilder) return <BuilderPanel />;

  const tier = TIER_COLORS[bot.tier] ?? TIER_COLORS.advanced!;
  const accent = botAccent(bot.id);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${tier.border} ${tier.bg} ${tier.text}`}>
              {bot.tier.charAt(0).toUpperCase() + bot.tier.slice(1)}
            </span>
            <h1 className="mt-2 text-2xl font-bold text-white">{bot.name}</h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[#9CA3AF]">{config.description}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button type="button" className="rounded-lg px-5 py-2.5 text-sm font-bold text-black transition hover:opacity-90 active:scale-[0.97]" style={{backgroundColor:accent}}>Start Bot</button>
            <button type="button" className="rounded-lg border border-white/15 bg-[#1A1B1F] px-5 py-2 text-xs text-[#BFC2C7] transition hover:border-white/25">Use on Chart</button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Status", value: "Ready", color: "text-[#2bc48a]" },
            { label: "Risk Level", value: config.riskLevel, color: RISK_COLORS[config.riskLevel] ?? "text-white" },
            { label: "Strategy", value: config.strategy, color: "text-white" },
            { label: "Avg Win Rate", value: config.avgWinRate, color: "text-[#F5C542]" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-[#121316] p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">{s.label}</p>
              <p className={`mt-1 text-sm font-semibold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* Bot-specific Quick Setup */}
          {bot.id === "grid" ? <GridSetup /> : bot.id === "smart-dca" ? <DcaSetup /> : <StandardSetup config={config} accentColor={accent} />}

          {/* Right info */}
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-[#121316] p-4">
              <h3 className="mb-2 text-sm font-semibold text-white">How It Works</h3>
              <ol className="space-y-1.5">
                {config.howItWorks.map((step, i) => (
                  <li key={i} className="flex gap-2 text-[12px] text-[#9CA3AF]">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#1d222b] text-[9px] font-bold text-[#F5C542]">{i+1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#121316] p-4">
              <h3 className="mb-2 text-sm font-semibold text-white">Best Conditions</h3>
              <ul className="space-y-1">
                {config.bestFor.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px] text-[#9CA3AF]"><span className="text-[#2bc48a]">&#10003;</span>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Strategy Logic */}
        <div className="rounded-xl border border-white/10 bg-[#121316] p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Strategy Logic</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-[#2bc48a]">Long Entry</p>
              <code className="block rounded-lg bg-[#0F1012] px-3 py-2 text-[11px] text-[#BFC2C7] leading-relaxed">{config.entryLong}</code>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-[#f6465d]">Short Entry</p>
              <code className="block rounded-lg bg-[#0F1012] px-3 py-2 text-[11px] text-[#BFC2C7] leading-relaxed">{config.entryShort}</code>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-[#F5C542]">Exit Logic</p>
              <code className="block rounded-lg bg-[#0F1012] px-3 py-2 text-[11px] text-[#BFC2C7] leading-relaxed">{config.exitLogic}</code>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {config.indicators.map(ind => (
              <span key={ind} className="rounded-full border border-white/10 bg-[#1A1B1F] px-2.5 py-0.5 text-[10px] text-[#8A8F98]">{ind}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════

const BOT_PAGE_ROUTES: Record<string, string> = {
  "spot-arbitrage": "/bot/spot-arbitrage",
  "futures-hedge": "/bot/futures-hedge",
};

export default function BotPage() {
  const authUser = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const USER_PLAN: PlanLevel = (authUser?.activePlanTier as PlanLevel) || "explorer";
  const [selectedBot, setSelectedBot] = useState<BotEntry>(BOT_CATEGORIES[0].bots[0]);

  return (
    <div className="flex h-full min-h-0 gap-0">
      {/* Left — Bot Library */}
      <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--borderSoft)] bg-[var(--panel)]">
        <div className="border-b border-[var(--borderSoft)] px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Bot Library</h2>
          <p className="mt-0.5 text-[11px] text-[var(--textMuted)]">30 strategies + builder</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {BOT_CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-3">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: cat.accent }}>{cat.label}</p>
              {cat.bots.map((bot) => {
                const isActive = selectedBot?.id === bot.id;
                const isBuilder = bot.id === "builder";
                const locked = isBotLocked(bot.id, USER_PLAN);
                const reqPlan = getRequiredPlan(bot.id);
                const planInfo = PLAN_LABELS[reqPlan];
                return (
                  <button key={bot.id} type="button" onClick={() => { const route = BOT_PAGE_ROUTES[bot.id]; if (route && !locked) { navigate(route); } else { setSelectedBot(bot); } }}
                    className={`mb-0.5 block w-full rounded-lg border px-3 py-2 text-left text-[13px] transition-all ${
                      isActive ? "border-[var(--borderSoft)] bg-[var(--panelAlt3)] text-white"
                      : locked ? "border-transparent text-[var(--textMuted)] opacity-60 hover:opacity-80"
                      : "border-transparent text-[var(--textMuted)] hover:border-[var(--borderSoft)] hover:bg-[var(--panelAlt)]"
                    }`}
                    style={{ boxShadow: isActive ? `inset 2px 0 0 0 ${cat.accent}` : undefined }}
                  >
                    <span className="flex items-center gap-1.5">
                      {isBuilder && <span className="text-[#2bc48a]">+</span>}
                      {locked && <span className="text-[10px]">&#128274;</span>}
                      <span className={locked ? "line-clamp-1" : ""}>{bot.name}</span>
                      {locked && <span className={`ml-auto rounded px-1 py-px text-[8px] font-bold ${planInfo.color} ${planInfo.bg}`}>{planInfo.label}</span>}
                      {!locked && bot.id in B && !isBuilder && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#2bc48a]" title="Ready" />}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Right — Detail */}
      <div className="flex flex-1 flex-col bg-[#0F1012]">
        <BotDetailPanel bot={selectedBot} userPlan={USER_PLAN} />
      </div>
    </div>
  );
}
