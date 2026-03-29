/* ── Mock data for Master Trading Terminal ── */

function generateCandles(basePrice: number, count: number, volatility: number, seed: number): Array<{
  time: number; open: number; high: number; low: number; close: number; volume: number;
}> {
  const candles = [];
  let price = basePrice;
  let s = seed;
  const rng = () => { s = (s * 16807 + 0) % 2147483647; return (s & 0x7fffffff) / 0x7fffffff; };

  for (let i = 0; i < count; i++) {
    const change = (rng() - 0.48) * volatility;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + rng() * volatility * 0.5;
    const low = Math.min(open, close) - rng() * volatility * 0.5;
    const volume = 100000 + rng() * 900000;
    candles.push({
      time: Date.now() - (count - i) * 60000,
      open: +open.toFixed(4),
      high: +high.toFixed(4),
      low: +low.toFixed(4),
      close: +close.toFixed(4),
      volume: +volume.toFixed(0),
    });
    price = close;
  }
  return candles;
}

// SOL charts
export const sol1m = generateCandles(145.32, 120, 0.35, 42);
export const sol15m = generateCandles(144.80, 80, 1.2, 73);
export const sol1h = generateCandles(143.50, 60, 3.5, 91);
export const sol4h = generateCandles(140.20, 50, 8.0, 17);
export const sol24h = generateCandles(135.00, 40, 15.0, 55);

// BTC chart
export const btc1m = generateCandles(87250, 120, 45, 33);

export const signalData = {
  trendDirection: "Bullish" as const,
  momentumStrength: 72,
  volumeStrength: 65,
  volatility: "Medium" as const,
  aiSignalScore: 78,
  entryRecommendation: "Buy" as const,
  confidence: 74,
};

export const marketInsightData = {
  btcTrend: "Bullish" as const,
  macroDirection: "Risk-on regime. DXY weakening, bond yields declining. Favorable for crypto assets.",
  fearGreedIndex: 68,
  fearGreedLabel: "Greed",
  keyLevels: [
    { type: "resistance" as const, price: 89500, strength: "strong" as const },
    { type: "resistance" as const, price: 88200, strength: "moderate" as const },
    { type: "support" as const, price: 86000, strength: "strong" as const },
    { type: "support" as const, price: 84500, strength: "moderate" as const },
    { type: "support" as const, price: 82000, strength: "weak" as const },
  ],
  insights: [
    {
      title: "ETF Inflows Surge",
      content: "Bitcoin spot ETFs recorded $840M net inflows this week, highest since January. Institutional demand remains robust.",
      sentiment: "bullish" as const,
      timestamp: "2m ago",
    },
    {
      title: "SOL DeFi TVL Rising",
      content: "Solana DeFi TVL reached $8.2B, up 12% week-over-week. DEX volumes outpacing Ethereum L2s.",
      sentiment: "bullish" as const,
      timestamp: "15m ago",
    },
    {
      title: "Fed Minutes Dovish",
      content: "FOMC minutes signal potential rate cut in Q2. Market pricing 78% probability for June cut.",
      sentiment: "bullish" as const,
      timestamp: "1h ago",
    },
    {
      title: "Whale Alert",
      content: "Large BTC transfer: 2,500 BTC moved from exchange to cold wallet. Accumulation signal detected.",
      sentiment: "neutral" as const,
      timestamp: "2h ago",
    },
  ],
  aiCommentary:
    "Market structure remains constructive. BTC holding above the 50-day EMA with increasing volume profile. SOL showing relative strength vs BTC with higher highs on the 4H timeframe. Key risk: overnight funding rates elevated on perpetuals — watch for potential long squeeze if BTC loses $86K support.",
};
