/* ═══ Institutional Command — Mock Data ═══ */

/** Slight variation helper — values shift on each call / page load */
const vary = (base: number, range: number = 0.1) => {
  const factor = 1 + (Math.random() - 0.5) * 2 * range;
  return +(base * factor).toFixed(base >= 1000 ? 1 : base >= 10 ? 2 : base >= 1 ? 4 : 6);
};

function gen(base: number, count: number, vol: number, seed: number, intervalMs = 60_000) {
  const out: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let p = base, s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return (s & 0x7fffffff) / 0x7fffffff; };
  for (let i = 0; i < count; i++) {
    const c = (r() - 0.48) * vol, o = p, cl = p + c;
    const h = Math.max(o, cl) + r() * vol * 0.5, l = Math.min(o, cl) - r() * vol * 0.5;
    out.push({ time: Date.now() - (count - i) * intervalMs, open: +o.toFixed(4), high: +h.toFixed(4), low: +l.toFixed(4), close: +cl.toFixed(4), volume: +(70000 + r() * 930000).toFixed(0) });
    p = cl;
  }
  return out;
}

const MIN1 = 60_000;
const MIN15 = 15 * MIN1;
const HOUR1 = 60 * MIN1;
const HOUR4 = 4 * HOUR1;
const DAY1 = 24 * HOUR1;

/* ── Per-coin config for dynamic data generation ── */
interface CoinProfile {
  base: number; vol1m: number; vol15m: number; vol1h: number; vol4h: number; vol1d: number;
  bias: "Bullish" | "Bearish" | "Neutral"; confidence: number; strategy: "Pullback" | "Breakout" | "Scalping";
  seed: number;
}

const COIN_PROFILES: Record<string, CoinProfile> = {
  "SOL/USDT": { base: 147.25, vol1m: 0.40, vol15m: 1.4, vol1h: 4.0, vol4h: 9.0, vol1d: 17.0, bias: "Bullish", confidence: 77, strategy: "Pullback", seed: 42 },
  "BTC/USDT": { base: 87680, vol1m: 52, vol15m: 180, vol1h: 520, vol4h: 1200, vol1d: 2800, bias: "Bullish", confidence: 82, strategy: "Breakout", seed: 33 },
  "ETH/USDT": { base: 3420, vol1m: 3.5, vol15m: 12, vol1h: 35, vol4h: 80, vol1d: 180, bias: "Bearish", confidence: 64, strategy: "Scalping", seed: 57 },
  "BNB/USDT": { base: 612, vol1m: 0.8, vol15m: 2.8, vol1h: 8.0, vol4h: 18, vol1d: 40, bias: "Bullish", confidence: 71, strategy: "Pullback", seed: 19 },
  "XRP/USDT": { base: 2.18, vol1m: 0.004, vol15m: 0.014, vol1h: 0.04, vol4h: 0.09, vol1d: 0.20, bias: "Neutral", confidence: 48, strategy: "Scalping", seed: 77 },
  "DOGE/USDT": { base: 0.164, vol1m: 0.0004, vol15m: 0.0014, vol1h: 0.004, vol4h: 0.009, vol1d: 0.02, bias: "Bearish", confidence: 38, strategy: "Scalping", seed: 63 },
  "ADA/USDT": { base: 0.72, vol1m: 0.0015, vol15m: 0.005, vol1h: 0.015, vol4h: 0.035, vol1d: 0.08, bias: "Neutral", confidence: 52, strategy: "Scalping", seed: 88 },
  "AVAX/USDT": { base: 38.50, vol1m: 0.08, vol15m: 0.28, vol1h: 0.8, vol4h: 1.8, vol1d: 4.0, bias: "Bullish", confidence: 69, strategy: "Pullback", seed: 31 },
  "DOT/USDT": { base: 7.25, vol1m: 0.015, vol15m: 0.05, vol1h: 0.15, vol4h: 0.35, vol1d: 0.8, bias: "Bearish", confidence: 55, strategy: "Scalping", seed: 44 },
  "LINK/USDT": { base: 15.80, vol1m: 0.035, vol15m: 0.12, vol1h: 0.35, vol4h: 0.8, vol1d: 1.8, bias: "Bullish", confidence: 73, strategy: "Breakout", seed: 22 },
};

const defaultProfile: CoinProfile = { base: 100, vol1m: 0.2, vol15m: 0.7, vol1h: 2.0, vol4h: 4.5, vol1d: 10, bias: "Neutral", confidence: 50, strategy: "Scalping", seed: 50 };

export function getCoinData(coin: string) {
  const p = COIN_PROFILES[coin] ?? defaultProfile;
  const s = p.seed;
  const b = p.base;
  const fmt = (v: number) => +v.toFixed(b >= 1000 ? 1 : b >= 10 ? 2 : b >= 1 ? 4 : 6);

  const data1m = gen(b, 160, p.vol1m, s, MIN1);
  const data15m = gen(b * 0.992, 80, p.vol15m, s + 31, MIN15);
  const data1h = gen(b * 0.984, 60, p.vol1h, s + 49, HOUR1);
  const data4h = gen(b * 0.96, 50, p.vol4h, s + 7, HOUR4);
  const data1d = gen(b * 0.93, 40, p.vol1d, s + 13, DAY1);

  const biasLabel = p.bias === "Bullish" ? "LONG" : p.bias === "Bearish" ? "SHORT" : "NEUTRAL";
  const ticker = coin.replace("/", "");

  const tfCtx: TFContext[] = [
    { tf: "15m", trend: p.bias, structure: p.bias === "Bearish" ? "LH/LL" : "HH/HL", momentum: p.confidence > 70 ? "Strong" : "Building", state: p.confidence > 65 ? "Expanding" : "Normal", keyLevel: fmt(b * 1.006), bias: p.confidence },
    { tf: "1H", trend: p.bias, structure: p.bias === "Bearish" ? "LH/LL" : "HH/HL", momentum: "Building", state: "Normal", keyLevel: fmt(b * 1.015), bias: Math.max(p.confidence - 12, 10) },
    { tf: "4H", trend: p.confidence > 60 ? p.bias : "Neutral", structure: p.confidence > 60 ? (p.bias === "Bearish" ? "LH/LL" : "HH/HL") : "Range", momentum: p.confidence > 60 ? "Building" : "Fading", state: p.confidence > 65 ? "Normal" : "Compressed", keyLevel: fmt(b * 1.025), bias: Math.max(p.confidence - 30, 5) },
    { tf: "1D", trend: p.bias === "Neutral" ? "Neutral" : p.bias, structure: p.bias === "Bearish" ? "LH/LL" : p.bias === "Bullish" ? "HH/HL" : "Range", momentum: "Neutral", state: "Normal", keyLevel: fmt(b * 1.06), bias: Math.max(p.confidence - 19, 10) },
  ];

  const sigs = {
    trendDirection: p.bias, regime: (p.confidence > 65 ? "Trending" : p.confidence > 45 ? "Ranging" : "Volatile") as "Trending" | "Ranging" | "Volatile",
    momentumScore: vary(p.confidence - 6, 0.08), volumeExpansion: vary(p.confidence - 11, 0.08), volatilityScore: vary(54, 0.1),
    breakoutProb: vary(p.confidence - 13, 0.08), meanRevProb: vary(100 - p.confidence, 0.08), liquiditySweep: p.confidence > 60,
    structureBreak: false, orderFlowBias: vary(p.confidence - 4, 0.08), aiConviction: vary(p.confidence, 0.05),
    setupQuality: vary(p.confidence - 5, 0.08), tradeReadiness: (p.confidence > 60 ? "Ready" : "Wait") as "Ready" | "Wait",
  };

  const entry = fmt(b * 1.008);
  const entryLow = fmt(b * 0.998);
  const sl = fmt(p.bias === "Bearish" ? b * 1.022 : b * 0.985);
  const tp1 = fmt(p.bias === "Bearish" ? b * 0.975 : b * 1.025);
  const tp2 = fmt(p.bias === "Bearish" ? b * 0.955 : b * 1.045);
  const inv = fmt(p.bias === "Bearish" ? b * 1.025 : b * 0.982);

  const ai = {
    bias: p.bias, confidence: p.confidence, strategy: p.strategy,
    confirms: [`1H ${p.bias === "Bearish" ? "LH/LL" : "HH/HL"} intact`, "Volume expanding", "BTC macro aligned", "Funding neutral"],
    invalidates: [`Break ${p.bias === "Bearish" ? "above" : "below"} $${inv}`, "BTC divergence", "Volatility crush"],
    idealEntry: `${p.strategy} to $${entryLow}–$${entry}`,
    riskNote: "4H structure key variable. Size accordingly.",
    marketQuality: p.confidence - 5,
  };

  const lvl = {
    resistances: [
      { price: fmt(b * 1.025), label: "1D Major", strength: 94, htf: true },
      { price: fmt(b * 1.015), label: "4H Range High", strength: 83, htf: true },
      { price: fmt(b * 1.008), label: "1H Swing", strength: 67, htf: false },
    ],
    supports: [
      { price: fmt(b * 0.995), label: "15m Demand", strength: 71, htf: false },
      { price: fmt(b * 0.985), label: "1H Swing Low", strength: 86, htf: true },
      { price: fmt(b * 0.97), label: "4H Range Low", strength: 93, htf: true },
    ],
    pivots: { r1: fmt(b * 1.013), pp: fmt(b * 1.0), s1: fmt(b * 0.987) },
    vwapRelation: (p.bias === "Bearish" ? "Below" : "Above") as "Above" | "Below",
    liquidityZones: [
      { price: fmt(b * 1.02), side: "sell" as const, magnitude: "Large" as const },
      { price: fmt(b * 0.98), side: "buy" as const, magnitude: "Medium" as const },
      { price: fmt(b * 0.965), side: "buy" as const, magnitude: "Large" as const },
    ],
    imbalances: [
      { from: fmt(b * 0.998), to: fmt(b * 1.002), status: "Open" as const },
      { from: fmt(b * 0.982), to: fmt(b * 0.986), status: "Filled" as const },
    ],
    invalidation: inv,
  };

  const al = [
    { type: "breakout", text: `${ticker} clearing 15m consolidation`, time: "8s", sev: "high" as const },
    { type: "volume", text: "Volume 2.8x avg on 1m candle", time: "32s", sev: "high" as const },
    { type: "regime", text: `Regime: Range → ${p.bias === "Bearish" ? "Down" : "Trend"} on 15m`, time: "2m", sev: "medium" as const },
    { type: "btc", text: "BTC reclaimed $87.5K — risk-on", time: "6m", sev: "medium" as const },
    { type: "liquidity", text: `Liquidity swept at $${fmt(b * 1.005)}`, time: "12m", sev: "low" as const },
  ];

  const intel = {
    btcTrend: "Bullish" as const, riskMode: (p.bias === "Bearish" ? "Risk-Off" : "Risk-On") as "Risk-On" | "Risk-Off",
    dominance: "Rising",
    regime: p.confidence > 65 ? "Trending with momentum" : "Range-bound, waiting for catalyst",
    crossAsset: "Equities firm, DXY declining, yields lower. Full risk-on.",
    liquidity: "Deep books, tight spreads. Institutional flow detected.",
    macro: "Dovish Fed, sustained ETF inflows, declining DXY. Macro tailwind.",
    narrative: `BTC holding $87K. ${coin.split("/")[0]} showing ${p.bias.toLowerCase()} structure on 15m with ${p.confidence > 70 ? "strong" : "moderate"} momentum. Key levels: support $${fmt(b * 0.985)}, resistance $${fmt(b * 1.025)}.`,
  };

  return {
    candles1m: data1m, candles15m: data15m, candles1h: data1h, candles4h: data4h, candles1d: data1d,
    tfContexts: tfCtx, signals: sigs, aiDecision: ai, levels: lvl, alerts: al, marketIntel: intel,
    biasLabel, entry, entryLow, sl, tp1, tp2, invalidation: inv,
  };
}

/* ── Legacy exports for backward compat ── */
export const sol1m = gen(147.25, 160, 0.40, 42, MIN1);
export const sol15m = gen(146.10, 80, 1.4, 73, MIN15);
export const sol1h = gen(144.80, 60, 4.0, 91, HOUR1);
export const sol4h = gen(141.50, 50, 9.0, 17, HOUR4);
export const sol1d = gen(137.00, 40, 17.0, 55, DAY1);
export const btc1m = gen(87680, 120, 52, 33, MIN1);

export type TFContext = { tf: string; trend: "Bullish" | "Bearish" | "Neutral"; structure: string; momentum: string; state: string; keyLevel: number; bias: number };
export const tfContexts: TFContext[] = [
  { tf: "15m", trend: "Bullish", structure: "HH/HL", momentum: "Strong", state: "Expanding", keyLevel: 148.20, bias: 74 },
  { tf: "1H", trend: "Bullish", structure: "HH/HL", momentum: "Building", state: "Normal", keyLevel: 149.50, bias: 62 },
  { tf: "4H", trend: "Neutral", structure: "Range", momentum: "Fading", state: "Compressed", keyLevel: 151.00, bias: 12 },
  { tf: "1D", trend: "Bullish", structure: "HH/HL", momentum: "Neutral", state: "Normal", keyLevel: 156.00, bias: 58 },
];

export const signals = {
  trendDirection: "Bullish" as const, regime: "Trending" as const,
  momentumScore: vary(71, 0.08), volumeExpansion: vary(66, 0.08), volatilityScore: vary(54, 0.1),
  breakoutProb: vary(64, 0.08), meanRevProb: vary(18, 0.1), liquiditySweep: true,
  structureBreak: false, orderFlowBias: vary(73, 0.08), aiConviction: vary(77, 0.05),
  setupQuality: vary(72, 0.08), tradeReadiness: "Ready" as const,
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

export const session = { name: "London" as const, volatility: vary(67, 0.08), bias: "Bullish" as const, high: vary(148.62, 0.02), low: vary(146.30, 0.02), range: vary(2.32, 0.1), remaining: "2h 18m" };
export const sentiment = { fearGreed: vary(69, 0.08), label: "Greed", crowdBias: vary(74, 0.08), crowdDir: "Long", contrarian: "Weak" };
export const execQuality = { slippage: "0.02%", fillQuality: "98.4%", latency: "12ms", expectedMove: `$${vary(1.85, 0.1).toFixed(2)}`, execRisk: "Low" };

export const marketIntel = {
  btcTrend: "Bullish" as const, riskMode: "Risk-On" as const, dominance: "Rising",
  regime: "Trending with momentum",
  crossAsset: "Equities firm, DXY declining, yields lower. Full risk-on.",
  liquidity: "Deep books, tight spreads. Institutional flow detected.",
  macro: "Dovish Fed, sustained ETF inflows, declining DXY. Macro tailwind.",
  narrative: "BTC holding $87K with strong bid depth. SOL leading alts with 15m HH/HL structure intact and expanding volume.",
};
