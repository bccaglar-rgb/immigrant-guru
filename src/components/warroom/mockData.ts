/* ═══ Alpha War Room — Mock Data Engine ═══ */

function genCandles(base: number, count: number, vol: number, seed: number, intervalMs = 60_000) {
  const out: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let p = base, s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return (s & 0x7fffffff) / 0x7fffffff; };
  for (let i = 0; i < count; i++) {
    const c = (r() - 0.48) * vol;
    const o = p, cl = p + c;
    const h = Math.max(o, cl) + r() * vol * 0.5;
    const l = Math.min(o, cl) - r() * vol * 0.5;
    out.push({ time: Date.now() - (count - i) * intervalMs, open: +o.toFixed(4), high: +h.toFixed(4), low: +l.toFixed(4), close: +cl.toFixed(4), volume: +(80000 + r() * 920000).toFixed(0) });
    p = cl;
  }
  return out;
}

const MIN1 = 60_000;
const MIN15 = 15 * MIN1;
const HOUR1 = 60 * MIN1;
const HOUR4 = 4 * HOUR1;
const DAY1 = 24 * HOUR1;

export const sol1m = genCandles(146.82, 150, 0.38, 42, MIN1);
export const sol15m = genCandles(145.50, 80, 1.3, 73, MIN15);
export const sol1h = genCandles(144.00, 60, 3.8, 91, HOUR1);
export const sol4h = genCandles(141.20, 50, 8.5, 17, HOUR4);
export const sol1d = genCandles(136.00, 40, 16.0, 55, DAY1);
export const btc1m = genCandles(87450, 120, 48, 33, MIN1);

export type TimeframeContext = {
  timeframe: string;
  trend: "Bullish" | "Bearish" | "Neutral";
  structure: "HH/HL" | "LH/LL" | "Range";
  momentum: "Strong" | "Fading" | "Neutral" | "Building";
  compression: "Compressed" | "Expanding" | "Normal";
  keyLevel: number;
  bias: number; // -100 to 100
};

export const timeframeContexts: TimeframeContext[] = [
  { timeframe: "15m", trend: "Bullish", structure: "HH/HL", momentum: "Strong", compression: "Expanding", keyLevel: 147.20, bias: 72 },
  { timeframe: "1H", trend: "Bullish", structure: "HH/HL", momentum: "Building", compression: "Normal", keyLevel: 148.50, bias: 65 },
  { timeframe: "4H", trend: "Neutral", structure: "Range", momentum: "Fading", compression: "Compressed", keyLevel: 150.00, bias: 15 },
  { timeframe: "1D", trend: "Bullish", structure: "HH/HL", momentum: "Neutral", compression: "Normal", keyLevel: 155.00, bias: 55 },
];

export const signalMatrix = {
  trendStrength: 74,
  momentumScore: 68,
  volatilityScore: 52,
  liquidityActivity: 81,
  breakoutProbability: 63,
  fakeoutProbability: 28,
  meanReversionProb: 19,
  orderFlowBias: 72,
  regimeClassification: "Trending" as const,
  aiConfidence: 76,
  tradeQuality: 71,
};

export const aiDecision = {
  bias: "Bullish" as const,
  confidence: 76,
  bestStrategy: "Pullback" as const,
  confirms: ["1H structure holding HH/HL", "Volume expanding on push", "BTC above key support $86K", "Funding rates neutral"],
  invalidates: ["Break below $144.50 (15m swing low)", "BTC loses $86K with volume", "Volatility crush below 30 VIX-equivalent"],
  optimalConditions: "Wait for pullback to $145.80–146.20 zone with volume confirmation on 1m",
  riskWarning: "4H timeframe is in compression — breakout direction uncertain. Size accordingly.",
};

export const structureLevels = {
  resistances: [
    { price: 150.00, label: "1D Major Resistance", strength: 95, type: "htf" as const },
    { price: 148.50, label: "4H Range High", strength: 82, type: "htf" as const },
    { price: 147.80, label: "1H Swing High", strength: 68, type: "ltf" as const },
  ],
  supports: [
    { price: 145.80, label: "15m Demand Zone", strength: 72, type: "ltf" as const },
    { price: 144.50, label: "1H Swing Low", strength: 85, type: "htf" as const },
    { price: 142.00, label: "4H Range Low", strength: 92, type: "htf" as const },
  ],
  liquidityZones: [
    { price: 148.80, side: "sell" as const, size: "Large" },
    { price: 144.20, side: "buy" as const, size: "Medium" },
    { price: 141.50, side: "buy" as const, size: "Large" },
  ],
  imbalanceZones: [
    { from: 146.50, to: 147.10, filled: false },
    { from: 143.80, to: 144.20, filled: true },
  ],
  invalidation: 144.50,
};

export const alerts = [
  { type: "breakout" as const, text: "SOL breaking above 15m consolidation", time: "12s ago", severity: "high" as const },
  { type: "volume" as const, text: "Volume spike 2.4x average on 1m", time: "45s ago", severity: "medium" as const },
  { type: "regime" as const, text: "Regime shift: Range → Trending detected on 15m", time: "3m ago", severity: "high" as const },
  { type: "btc" as const, text: "BTC reclaimed $87,200 — risk-on signal", time: "8m ago", severity: "medium" as const },
  { type: "liquidity" as const, text: "Sell-side liquidity swept at $147.50", time: "15m ago", severity: "low" as const },
];

export const sentiment = {
  fearGreed: 68,
  fearGreedLabel: "Greed" as const,
  crowdBias: 72,
  crowdDirection: "Long" as const,
  contrarianSignal: "Weak" as const,
  positioning: "Retail heavily long — watch for squeeze" as const,
};

export const sessionData = {
  current: "London" as const,
  volatility: 64,
  bias: "Bullish" as const,
  high: 147.82,
  low: 145.90,
  range: 1.92,
  avgRange: 2.15,
  timeRemaining: "2h 34m",
};

export const marketIntel = {
  btcTrend: "Bullish" as const,
  btcDominance: "Rising",
  crossAssetPressure: "Risk-on across equities and crypto. DXY weakening supports upside.",
  regime: "Trending with momentum — favor breakouts over mean reversion.",
  aiNarrative: "BTC holding above the critical $87K level with strong bid support. SOL showing relative strength with higher beta. The 15m structure is constructive with HH/HL intact. Key risk is the 4H compression — resolution will determine the next $5 move. Funding rates are neutral, meaning the move isn't over-leveraged yet. London session typically adds volatility — expect the range to expand in the next 90 minutes.",
  riskOnOff: "Risk-On" as const,
  liquidity: "Ample — deep books on major pairs, spread compression observed",
  macroTone: "Dovish Fed minutes, declining DXY, ETF inflows sustained. Macro tailwind intact.",
};
