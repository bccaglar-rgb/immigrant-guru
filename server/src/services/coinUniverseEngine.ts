/**
 * CoinUniverseEngine
 *
 * Pre-screening engine for Coin Universe page.
 * Decides which 28 coins get sent to Quant Engine each cycle.
 *
 * Two-tier scoring:
 *  Tier 1 (all ~300 coins): Free WS hub data — volume, momentum, funding, spread, depth, imbalance
 *  Tier 2 (top 60 coins):   Klines-based — S/R proximity, ATR%, RSI-14
 *
 * Composite = tier2 available ? 0.60 × tier1 + 0.40 × tier2 : tier1
 *
 * Cooldown: coins sent to Quant Engine wait min 3 cycles before re-entering the active list.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OhlcvBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

interface KlinesCache {
  bars: OhlcvBar[];
  fetchedAt: number;
}

interface CooldownEntry {
  sentAtRound: number;
  cooldownUntilRound: number;
}

interface SRLevel {
  price: number;
  type: "support" | "resistance";
  strength: "STRONG" | "MID" | "WEAK";
  touchCount: number;
}

export interface UniverseCoinRow {
  symbol: string;
  baseAsset: string;
  price: number;
  change24hPct: number;
  volume24hUsd: number;
  fundingRate: number | null;
  spreadBps: number | null;

  // Tier 2 fields (null until klines are fetched for this coin)
  atrPct: number | null;
  rsi14: number | null;
  srDistPct: number | null;
  nearestSR: SRLevel | null;

  // Scoring
  tier1Score: number;
  tier2Score: number | null;
  compositeScore: number;

  // Status
  status: "ACTIVE" | "COOLDOWN" | "NEW";
  cooldownRoundsLeft: number | null;
  scanner_selected: boolean;
}

export interface UniverseSnapshot {
  activeCoins: UniverseCoinRow[];
  cooldownCoins: UniverseCoinRow[];
  round: number;
  refreshedAt: string;
}

/* ------------------------------------------------------------------ */
/*  BinanceFuturesHub interface (subset we need)                       */
/* ------------------------------------------------------------------ */

interface BinanceFuturesHubLike {
  getUniverseRows(): Array<{
    symbol: string;
    baseAsset: string;
    price: number;
    change24hPct: number;
    volume24hUsd: number;
    spreadBps: number | null;
    fundingRate: number | null;
    depthUsd: number | null;
    imbalance: number | null;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const KLINES_CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minute cache per symbol
const KLINES_BARS = 100;                      // 100 candles
const KLINES_INTERVAL = "15m";               // 15-minute candles
const KLINES_CONCURRENT = 10;                // Max concurrent klines fetches
const TIER2_TOP_N = 60;                      // Compute Tier 2 for top 60 coins
const COOLDOWN_ROUNDS = 3;                   // Minimum 3 cycles cooldown
const SELECTED_TOP_28 = 28;                  // Output: top 28 active coins for Quant Engine

// Stablecoins to exclude
const EXCLUDED_BASE_ASSETS = new Set([
  "USDC", "FDUSD", "BUSD", "TUSD", "USDP", "DAI", "PYUSD", "EURC",
  "GUSD", "USDD", "USDE", "UST", "USTC", "FRAX", "LUSD", "SUSD",
]);

/* ------------------------------------------------------------------ */
/*  Utility: clamp                                                     */
/* ------------------------------------------------------------------ */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/* ------------------------------------------------------------------ */
/*  Tier 1 Scoring — WS hub data (all coins)                          */
/* ------------------------------------------------------------------ */

function computeTier1Score(row: {
  volume24hUsd: number;
  change24hPct: number;
  fundingRate: number | null;
  spreadBps: number | null;
  depthUsd: number | null;
  imbalance: number | null;
}): number {
  // Volume (20%) — log10 scale: $1M=0, $1B=1
  const volumeScore = clamp01((Math.log10(Math.max(row.volume24hUsd, 1)) - 6) / 3);

  // Momentum (20%) — |change24h|: 8% absolute = max
  const momentumScore = clamp01(Math.abs(row.change24hPct) / 8);

  // Funding (15%) — |fundingRate|: 0.001 (0.1%) = max (mean-reversion signal)
  const fundingScore = row.fundingRate !== null
    ? clamp01(Math.abs(row.fundingRate) / 0.001)
    : 0;

  // Spread (15%) — 1 bps = 1.0, 10+ bps = 0.0
  const spreadScore = row.spreadBps !== null
    ? clamp01(1 - (row.spreadBps - 1) / 9)
    : 0.3;

  // Depth (15%) — orderbook depth: $5M+ = max
  const depthScore = row.depthUsd !== null
    ? clamp01(row.depthUsd / 5_000_000)
    : 0.2;

  // Imbalance (15%) — |bid-ask imbalance|: extreme one-sided = opportunity
  const imbalanceScore = row.imbalance !== null
    ? clamp01(Math.abs(row.imbalance) / 0.6)
    : 0;

  const weighted =
    0.20 * volumeScore +
    0.20 * momentumScore +
    0.15 * fundingScore +
    0.15 * spreadScore +
    0.15 * depthScore +
    0.15 * imbalanceScore;

  return Math.round(Math.max(0, Math.min(100, weighted * 100)));
}

/* ------------------------------------------------------------------ */
/*  Tier 2 Scoring — Klines-based (top 60 coins)                      */
/* ------------------------------------------------------------------ */

function computeTier2Score(
  srDistPct: number | null,
  atrPct: number | null,
  rsi: number | null,
): number | null {
  // Need at least S/R data to compute Tier 2
  if (srDistPct === null && atrPct === null && rsi === null) return null;

  // S/R Proximity (50%) — closer to S/R = higher score
  let srScore = 0;
  if (srDistPct !== null) {
    if (srDistPct < 1) srScore = 1.0;       // < 1% away = excellent
    else if (srDistPct < 2) srScore = 0.75;  // < 2% away = good
    else if (srDistPct < 3) srScore = 0.50;  // < 3% away = moderate
    else if (srDistPct < 5) srScore = 0.25;  // < 5% away = fair
    else srScore = 0.05;                      // > 5% away = low value
  }

  // ATR Regime (25%) — higher ATR = more volatility = more opportunity
  let atrScore = 0.5; // default neutral
  if (atrPct !== null) {
    if (atrPct > 2.5) atrScore = 1.0;       // Very high volatility
    else if (atrPct > 1.5) atrScore = 0.85;  // High
    else if (atrPct > 0.8) atrScore = 0.55;  // Normal
    else atrScore = 0.15;                     // Low/compressed
  }

  // RSI Extremity (25%) — oversold (<30) or overbought (>70) = mean-reversion opportunity
  let rsiScore = 0.3; // default neutral
  if (rsi !== null) {
    const distFromMid = Math.abs(rsi - 50);
    if (distFromMid > 30) rsiScore = 1.0;    // RSI < 20 or > 80 = extreme
    else if (distFromMid > 20) rsiScore = 0.75; // RSI < 30 or > 70 = strong
    else if (distFromMid > 10) rsiScore = 0.40; // RSI 30-40 or 60-70 = moderate
    else rsiScore = 0.10;                     // RSI 40-60 = neutral (low signal)
  }

  const weighted = 0.50 * srScore + 0.25 * atrScore + 0.25 * rsiScore;
  return Math.round(Math.max(0, Math.min(100, weighted * 100)));
}

/* ------------------------------------------------------------------ */
/*  S/R Detection — simplified port from liveConsensusEngine.ts        */
/*  Original: src/data/liveConsensusEngine.ts lines 1518-1648          */
/* ------------------------------------------------------------------ */

function deriveKeyLevelsSimple(bars: OhlcvBar[]): SRLevel[] {
  if (bars.length < 10) return [];
  const close = bars[bars.length - 1].close;
  if (!Number.isFinite(close) || close <= 0) return [];

  const rawLevels: Array<{ price: number; type: "support" | "resistance"; source: string }> = [];

  // 1. Swing High/Low (lookback = 5 bars each side)
  const SWING_LB = 5;
  for (let i = SWING_LB; i < bars.length - SWING_LB; i++) {
    const bar = bars[i];
    let isSwingHigh = true;
    let isSwingLow = true;
    for (let j = 1; j <= SWING_LB; j++) {
      if (bars[i - j].high >= bar.high || bars[i + j].high >= bar.high) isSwingHigh = false;
      if (bars[i - j].low <= bar.low || bars[i + j].low <= bar.low) isSwingLow = false;
    }
    if (isSwingHigh) {
      rawLevels.push({ price: bar.high, type: bar.high > close ? "resistance" : "support", source: "swing" });
    }
    if (isSwingLow) {
      rawLevels.push({ price: bar.low, type: bar.low < close ? "support" : "resistance", source: "swing" });
    }
  }

  // 2. Classic Pivot Points
  const pivotBars = bars.slice(-Math.min(80, bars.length));
  const pivotHigh = Math.max(...pivotBars.map((b) => b.high));
  const pivotLow = Math.min(...pivotBars.map((b) => b.low));
  const pivotClose = bars[bars.length - 1].close;
  const P = (pivotHigh + pivotLow + pivotClose) / 3;
  const R1 = 2 * P - pivotLow;
  const R2 = P + (pivotHigh - pivotLow);
  const S1 = 2 * P - pivotHigh;
  const S2 = P - (pivotHigh - pivotLow);

  if (R1 > close) rawLevels.push({ price: R1, type: "resistance", source: "pivot_R1" });
  if (R2 > close) rawLevels.push({ price: R2, type: "resistance", source: "pivot_R2" });
  if (S1 < close) rawLevels.push({ price: S1, type: "support", source: "pivot_S1" });
  if (S2 < close) rawLevels.push({ price: S2, type: "support", source: "pivot_S2" });
  rawLevels.push({ price: P, type: P > close ? "resistance" : "support", source: "pivot_P" });

  // 3. Range High/Low (recent 20 bars)
  const recentBars = bars.slice(-20);
  const rangeHigh = Math.max(...recentBars.map((b) => b.high));
  const rangeLow = Math.min(...recentBars.map((b) => b.low));
  if (rangeHigh > close) rawLevels.push({ price: rangeHigh, type: "resistance", source: "range_high" });
  if (rangeLow < close) rawLevels.push({ price: rangeLow, type: "support", source: "range_low" });

  // 4. Cluster nearby levels (within 0.3%)
  const CLUSTER_PCT = 0.003;
  const sorted = rawLevels
    .filter((l) => Number.isFinite(l.price) && l.price > 0)
    .sort((a, b) => a.price - b.price);

  const clusters: Array<{
    price: number;
    type: "support" | "resistance";
    touchCount: number;
    sources: string[];
  }> = [];

  for (const level of sorted) {
    const existing = clusters.find(
      (c) => Math.abs(c.price - level.price) / Math.max(c.price, 1e-10) < CLUSTER_PCT,
    );
    if (existing) {
      existing.price = (existing.price * existing.touchCount + level.price) / (existing.touchCount + 1);
      existing.touchCount += 1;
      existing.sources.push(level.source);
      existing.type = existing.price > close ? "resistance" : "support";
    } else {
      clusters.push({
        price: level.price,
        type: level.type,
        touchCount: 1,
        sources: [level.source],
      });
    }
  }

  // 5. Pick top 2 supports + top 2 resistances closest to price
  const toStrength = (tc: number): "STRONG" | "MID" | "WEAK" =>
    tc >= 3 ? "STRONG" : tc >= 2 ? "MID" : "WEAK";

  const supports = clusters
    .filter((c) => c.type === "support" && Math.abs(c.price - close) / close > 0.001)
    .sort((a, b) => Math.abs(a.price - close) - Math.abs(b.price - close))
    .slice(0, 2)
    .map((c): SRLevel => ({ price: c.price, type: "support", strength: toStrength(c.touchCount), touchCount: c.touchCount }));

  const resistances = clusters
    .filter((c) => c.type === "resistance" && Math.abs(c.price - close) / close > 0.001)
    .sort((a, b) => Math.abs(a.price - close) - Math.abs(b.price - close))
    .slice(0, 2)
    .map((c): SRLevel => ({ price: c.price, type: "resistance", strength: toStrength(c.touchCount), touchCount: c.touchCount }));

  return [...resistances, ...supports];
}

/* ------------------------------------------------------------------ */
/*  ATR-14 — port from bitriumIntelligenceEngine.ts lines 77-89        */
/* ------------------------------------------------------------------ */

function computeAtrPct(bars: OhlcvBar[], period = 14): number | null {
  if (bars.length < period + 2) return null;
  let trSum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const curr = bars[i];
    const prevClose = bars[i - 1].close;
    const tr = Math.max(curr.high - curr.low, Math.abs(curr.high - prevClose), Math.abs(curr.low - prevClose));
    trSum += tr;
  }
  const atr = trSum / period;
  const close = bars[bars.length - 1].close;
  return close > 0 ? (atr / close) * 100 : null;
}

/* ------------------------------------------------------------------ */
/*  RSI-14 — standard RSI calculation                                  */
/* ------------------------------------------------------------------ */

function computeRsi14(bars: OhlcvBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;

  let gainSum = 0;
  let lossSum = 0;
  const start = bars.length - period;

  for (let i = start; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    if (diff > 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  const avgGain = gainSum / period;
  const avgLoss = lossSum / period;

  if (avgLoss === 0) return 100; // No losses = max RSI
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/*  Nearest S/R distance calculation                                   */
/* ------------------------------------------------------------------ */

function findNearestSR(
  price: number,
  levels: SRLevel[],
): { distPct: number; level: SRLevel } | null {
  if (!levels.length || price <= 0) return null;

  let nearest: SRLevel | null = null;
  let minDist = Infinity;

  for (const l of levels) {
    const dist = Math.abs(l.price - price) / price * 100;
    if (dist < minDist) {
      minDist = dist;
      nearest = l;
    }
  }

  return nearest ? { distPct: Math.round(minDist * 100) / 100, level: nearest } : null;
}

/* ------------------------------------------------------------------ */
/*  Engine Class                                                       */
/* ------------------------------------------------------------------ */

interface CoinUniverseEngineDeps {
  binanceFuturesHub: BinanceFuturesHubLike;
}

export class CoinUniverseEngine {
  private deps: CoinUniverseEngineDeps;
  private klinesCache = new Map<string, KlinesCache>();
  private cooldownMap = new Map<string, CooldownEntry>();
  private currentRound = 0;
  private rankedActive: UniverseCoinRow[] = [];
  private rankedCooldown: UniverseCoinRow[] = [];
  private refreshedAt = "";
  private previousActiveSymbols = new Set<string>();

  constructor(deps: CoinUniverseEngineDeps) {
    this.deps = deps;
  }

  /* ---- Public API ---- */

  /**
   * Called by SystemScanner at the start of each cycle.
   * Refreshes all scoring data and re-ranks coins.
   */
  async refresh(): Promise<void> {
    this.currentRound += 1;
    const t0 = Date.now();

    // 1. Get all coins from WS hub
    const wsRows = this.deps.binanceFuturesHub.getUniverseRows();
    const filtered = wsRows.filter((r) => !EXCLUDED_BASE_ASSETS.has(r.baseAsset));

    if (!filtered.length) {
      console.log(`[CoinUniverseEngine] Refresh #${this.currentRound}: No WS data available`);
      return;
    }

    // 2. Compute Tier 1 scores for all coins
    const allCoins: Array<{
      symbol: string;
      baseAsset: string;
      price: number;
      change24hPct: number;
      volume24hUsd: number;
      fundingRate: number | null;
      spreadBps: number | null;
      depthUsd: number | null;
      imbalance: number | null;
      tier1Score: number;
    }> = filtered.map((r) => ({
      symbol: r.symbol,
      baseAsset: r.baseAsset,
      price: r.price,
      change24hPct: r.change24hPct,
      volume24hUsd: r.volume24hUsd,
      fundingRate: r.fundingRate,
      spreadBps: r.spreadBps,
      depthUsd: r.depthUsd,
      imbalance: r.imbalance,
      tier1Score: computeTier1Score(r),
    }));

    // 3. Sort by Tier 1 score to determine top N for klines
    allCoins.sort((a, b) => b.tier1Score - a.tier1Score || b.volume24hUsd - a.volume24hUsd);

    // 4. Fetch klines for top TIER2_TOP_N coins
    const tier2Symbols = allCoins.slice(0, TIER2_TOP_N).map((c) => c.symbol);
    await this.fetchKlinesBatch(tier2Symbols);

    // 5. Compute Tier 2 + composite for all coins
    const now = Date.now();
    const activeList: UniverseCoinRow[] = [];
    const cooldownList: UniverseCoinRow[] = [];

    for (const coin of allCoins) {
      let atrPct: number | null = null;
      let rsi14: number | null = null;
      let srDistPct: number | null = null;
      let nearestSR: SRLevel | null = null;
      let tier2Score: number | null = null;

      // Check klines cache
      const cached = this.klinesCache.get(coin.symbol);
      if (cached && now - cached.fetchedAt < KLINES_CACHE_TTL_MS && cached.bars.length >= 20) {
        atrPct = computeAtrPct(cached.bars);
        rsi14 = computeRsi14(cached.bars);

        const srLevels = deriveKeyLevelsSimple(cached.bars);
        const nearest = findNearestSR(coin.price, srLevels);
        if (nearest) {
          srDistPct = nearest.distPct;
          nearestSR = nearest.level;
        }

        tier2Score = computeTier2Score(srDistPct, atrPct, rsi14);
      }

      // Composite score
      const compositeScore = tier2Score !== null
        ? Math.round(0.60 * coin.tier1Score + 0.40 * tier2Score)
        : coin.tier1Score;

      // Cooldown check
      const cooldownEntry = this.cooldownMap.get(coin.symbol);
      const isCooling = cooldownEntry != null && this.currentRound < cooldownEntry.cooldownUntilRound;
      const cooldownRoundsLeft = isCooling
        ? cooldownEntry!.cooldownUntilRound - this.currentRound
        : null;

      // NEW detection: symbol not in previous active set
      const isNew = !this.previousActiveSymbols.has(coin.symbol) && this.currentRound > 1;

      const row: UniverseCoinRow = {
        symbol: coin.symbol,
        baseAsset: coin.baseAsset,
        price: coin.price,
        change24hPct: coin.change24hPct,
        volume24hUsd: coin.volume24hUsd,
        fundingRate: coin.fundingRate,
        spreadBps: coin.spreadBps,
        atrPct,
        rsi14,
        srDistPct,
        nearestSR,
        tier1Score: coin.tier1Score,
        tier2Score,
        compositeScore,
        status: isCooling ? "COOLDOWN" : isNew ? "NEW" : "ACTIVE",
        cooldownRoundsLeft,
        scanner_selected: false, // set later by SystemScanner
      };

      if (isCooling) {
        cooldownList.push(row);
      } else {
        activeList.push(row);
      }
    }

    // Sort active by composite desc, cooldown by composite desc
    activeList.sort((a, b) => b.compositeScore - a.compositeScore || b.volume24hUsd - a.volume24hUsd);
    cooldownList.sort((a, b) => b.compositeScore - a.compositeScore);

    this.rankedActive = activeList;
    this.rankedCooldown = cooldownList;
    this.refreshedAt = new Date().toISOString();

    // Track current active symbols for next round's NEW detection
    this.previousActiveSymbols = new Set(activeList.map((c) => c.symbol));

    // Clean expired cooldowns
    for (const [sym, entry] of this.cooldownMap) {
      if (this.currentRound >= entry.cooldownUntilRound) {
        this.cooldownMap.delete(sym);
      }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const tier2Count = allCoins.filter((c) => this.klinesCache.has(c.symbol)).length;
    console.log(
      `[CoinUniverseEngine] Refresh #${this.currentRound}: ${allCoins.length} coins scored, ` +
      `${tier2Count} with klines, ${cooldownList.length} cooling down — ${elapsed}s`,
    );
  }

  /**
   * Get the full snapshot for the API endpoint.
   */
  getSnapshot(): UniverseSnapshot {
    return {
      activeCoins: this.rankedActive,
      cooldownCoins: this.rankedCooldown,
      round: this.currentRound,
      refreshedAt: this.refreshedAt,
    };
  }

  /**
   * Get the top 28 active coin symbols (for SystemScanner to use).
   */
  getTop28(): string[] {
    return this.rankedActive
      .slice(0, SELECTED_TOP_28)
      .map((c) => c.symbol);
  }

  /**
   * Get ALL active coin symbols ranked by composite score (for batch picking).
   */
  getActiveSymbolsRanked(): string[] {
    return this.rankedActive.map((c) => c.symbol);
  }

  /**
   * Mark symbols as sent to Quant Engine — starts cooldown.
   */
  markAsSentToQuant(symbols: string[]): void {
    for (const s of symbols) {
      this.cooldownMap.set(s, {
        sentAtRound: this.currentRound,
        cooldownUntilRound: this.currentRound + COOLDOWN_ROUNDS,
      });
    }
  }

  /**
   * Mark specific symbols as scanner_selected in the active list.
   */
  markScannerSelected(symbols: string[]): void {
    const set = new Set(symbols);
    for (const coin of this.rankedActive) {
      coin.scanner_selected = set.has(coin.symbol);
    }
  }

  /**
   * Check if a symbol is cooling down.
   */
  isCoolingDown(symbol: string): boolean {
    const entry = this.cooldownMap.get(symbol);
    return entry != null && this.currentRound < entry.cooldownUntilRound;
  }

  /* ---- Private methods ---- */

  /**
   * Fetch klines for a batch of symbols with concurrency limit.
   */
  private async fetchKlinesBatch(symbols: string[]): Promise<void> {
    const now = Date.now();

    // Filter to symbols that need fresh klines
    const needFetch = symbols.filter((s) => {
      const cached = this.klinesCache.get(s);
      return !cached || now - cached.fetchedAt >= KLINES_CACHE_TTL_MS;
    });

    if (!needFetch.length) return;

    // Fetch with concurrency limit
    for (let i = 0; i < needFetch.length; i += KLINES_CONCURRENT) {
      const chunk = needFetch.slice(i, i + KLINES_CONCURRENT);
      const results = await Promise.allSettled(
        chunk.map((symbol) => this.fetchKlines(symbol)),
      );
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === "fulfilled" && result.value) {
          this.klinesCache.set(chunk[j], {
            bars: result.value,
            fetchedAt: Date.now(),
          });
        }
      }
    }
  }

  /**
   * Fetch klines for a single symbol from Binance Futures API.
   */
  private async fetchKlines(symbol: string): Promise<OhlcvBar[] | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    try {
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${KLINES_INTERVAL}&limit=${KLINES_BARS}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) return null;

      const raw = (await res.json()) as Array<
        [number, string, string, string, string, string, number, string, number, string, string, string]
      >;

      if (!Array.isArray(raw)) return null;

      return raw.map((k) => ({
        time: k[0],
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      }));
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
