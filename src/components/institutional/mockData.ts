/* ═══ Institutional Command — Mock Data ═══ */

function gen(base: number, count: number, vol: number, seed: number) {
  const out: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let p = base, s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return (s & 0x7fffffff) / 0x7fffffff; };
  for (let i = 0; i < count; i++) {
    const c = (r() - 0.48) * vol, o = p, cl = p + c;
    const h = Math.max(o, cl) + r() * vol * 0.5, l = Math.min(o, cl) - r() * vol * 0.5;
    out.push({ time: Date.now() - (count - i) * 60000, open: +o.toFixed(4), high: +h.toFixed(4), low: +l.toFixed(4), close: +cl.toFixed(4), volume: +(70000 + r() * 930000).toFixed(0) });
    p = cl;
  }
  return out;
}

export const sol1m = gen(147.25, 160, 0.40, 42);
export const sol15m = gen(146.10, 80, 1.4, 73);
export const sol1h = gen(144.80, 60, 4.0, 91);
export const sol4h = gen(141.50, 50, 9.0, 17);
export const sol1d = gen(137.00, 40, 17.0, 55);
export const btc1m = gen(87680, 120, 52, 33);

export type TFContext = { tf: string; trend: "Bullish" | "Bearish" | "Neutral"; structure: string; momentum: string; state: string; keyLevel: number; bias: number };
export const tfContexts: TFContext[] = [
  { tf: "15m", trend: "Bullish", structure: "HH/HL", momentum: "Strong", state: "Expanding", keyLevel: 148.20, bias: 74 },
  { tf: "1H", trend: "Bullish", structure: "HH/HL", momentum: "Building", state: "Normal", keyLevel: 149.50, bias: 62 },
  { tf: "4H", trend: "Neutral", structure: "Range", momentum: "Fading", state: "Compressed", keyLevel: 151.00, bias: 12 },
  { tf: "1D", trend: "Bullish", structure: "HH/HL", momentum: "Neutral", state: "Normal", keyLevel: 156.00, bias: 58 },
];

export const signals = {
  trendDirection: "Bullish" as const, regime: "Trending" as const,
  momentumScore: 71, volumeExpansion: 66, volatilityScore: 54,
  breakoutProb: 64, meanRevProb: 18, liquiditySweep: true,
  structureBreak: false, orderFlowBias: 73, aiConviction: 77,
  setupQuality: 72, tradeReadiness: "Ready" as const,
};

export const aiDecision = {
  bias: "Bullish" as const, confidence: 77,
  strategy: "Pullback" as const,
  confirms: ["1H HH/HL intact", "Volume expanding on push", "BTC above $87K support", "Funding neutral"],
  invalidates: ["Break below $145.20 swing low", "BTC loses $86.5K", "Volatility crush below 30"],
  idealEntry: "Pullback to $146.50–147.00 with 1m volume confirmation",
  riskNote: "4H compressed — breakout direction unclear. Reduce size.",
  marketQuality: 72,
};

export const levels = {
  resistances: [
    { price: 151.00, label: "1D Major", strength: 94, htf: true },
    { price: 149.50, label: "4H Range High", strength: 83, htf: true },
    { price: 148.80, label: "1H Swing", strength: 67, htf: false },
  ],
  supports: [
    { price: 146.50, label: "15m Demand", strength: 71, htf: false },
    { price: 145.20, label: "1H Swing Low", strength: 86, htf: true },
    { price: 142.80, label: "4H Range Low", strength: 93, htf: true },
  ],
  pivots: { r1: 149.20, pp: 147.30, s1: 145.40 },
  vwapRelation: "Above" as const,
  liquidityZones: [
    { price: 149.80, side: "sell" as const, magnitude: "Large" },
    { price: 144.90, side: "buy" as const, magnitude: "Medium" },
    { price: 142.20, side: "buy" as const, magnitude: "Large" },
  ],
  imbalances: [
    { from: 147.20, to: 147.80, status: "Open" as const },
    { from: 144.50, to: 145.00, status: "Filled" as const },
  ],
  invalidation: 145.20,
};

export const alerts = [
  { type: "breakout", text: "SOL clearing 15m consolidation high", time: "8s", sev: "high" as const },
  { type: "volume", text: "Volume 2.8x avg on 1m candle", time: "32s", sev: "high" as const },
  { type: "regime", text: "Regime: Range → Trend on 15m", time: "2m", sev: "medium" as const },
  { type: "btc", text: "BTC reclaimed $87.5K — risk-on", time: "6m", sev: "medium" as const },
  { type: "liquidity", text: "Sell liquidity swept at $148.50", time: "12m", sev: "low" as const },
];

export const session = { name: "London" as const, volatility: 67, bias: "Bullish" as const, high: 148.62, low: 146.30, range: 2.32, remaining: "2h 18m" };
export const sentiment = { fearGreed: 69, label: "Greed", crowdBias: 74, crowdDir: "Long", contrarian: "Weak" };
export const execQuality = { slippage: "0.02%", fillQuality: "98.4%", latency: "12ms", expectedMove: "$1.85", execRisk: "Low" };

export const marketIntel = {
  btcTrend: "Bullish" as const, riskMode: "Risk-On" as const, dominance: "Rising",
  regime: "Trending with momentum",
  crossAsset: "Equities firm, DXY declining, yields lower. Full risk-on.",
  liquidity: "Deep books, tight spreads. Institutional flow detected.",
  macro: "Dovish Fed, sustained ETF inflows, declining DXY. Macro tailwind.",
  narrative: "BTC holding $87K with strong bid depth. SOL leading alts with 15m HH/HL structure intact and expanding volume. 4H compression is the key variable — resolution will set the direction for the next $5+ move. Funding neutral suggests room for continuation. London session adding volatility; expect range expansion within 90 minutes.",
};
