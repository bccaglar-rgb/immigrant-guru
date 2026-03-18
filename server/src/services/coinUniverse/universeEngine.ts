/**
 * Coin Universe Engine — Orchestrator
 *
 * Pre-filter layer before quant engine.
 * 4-stage pipeline on each tick (60s):
 *   1. Hard Filter → remove untradeable
 *   2. Universe Score → 100-point scoring (5 sub-scores)
 *   3. False Filter → penalty up to 30 points
 *   4. Top 10% Selection → send to quant engine
 *
 * Backward-compatible: exposes same getSnapshot() / getTop28() API
 * as the old CoinUniverseEngine.
 */

import type {
  BinanceFuturesHubLike,
  CoinUniverseData,
  CooldownEntry,
  MarketRegime,
  OhlcvBar,
  RawCoinData,
  SRLevel,
  UniverseCoinRow,
  UniverseSnapshot,
} from "./types.ts";
import { applyHardFilter } from "./hardFilter.ts";
import { computeUniverseScore } from "./universeScorer.ts";
import { selectTopCoins } from "./universeSelector.ts";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const KLINES_CACHE_TTL_MS = 5 * 60 * 1000;
const KLINES_BARS = 100;
const KLINES_INTERVAL = "15m";
const KLINES_CONCURRENT = 10;
const COOLDOWN_ROUNDS = 2;
const SELECTED_TOP_28 = 28;

/* ------------------------------------------------------------------ */
/*  Technical analysis helpers (ported from old engine)                 */
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
  return close > 0 ? Math.round((atr / close) * 100 * 100) / 100 : null;
}

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
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

function deriveKeyLevels(bars: OhlcvBar[]): SRLevel[] {
  if (bars.length < 10) return [];
  const close = bars[bars.length - 1].close;
  if (!Number.isFinite(close) || close <= 0) return [];

  const rawLevels: Array<{ price: number; type: "support" | "resistance"; source: string }> = [];

  // Swing High/Low
  const SWING_LB = 5;
  for (let i = SWING_LB; i < bars.length - SWING_LB; i++) {
    const bar = bars[i];
    let isHigh = true, isLow = true;
    for (let j = 1; j <= SWING_LB; j++) {
      if (bars[i - j].high >= bar.high || bars[i + j].high >= bar.high) isHigh = false;
      if (bars[i - j].low <= bar.low || bars[i + j].low <= bar.low) isLow = false;
    }
    if (isHigh) rawLevels.push({ price: bar.high, type: bar.high > close ? "resistance" : "support", source: "swing" });
    if (isLow) rawLevels.push({ price: bar.low, type: bar.low < close ? "support" : "resistance", source: "swing" });
  }

  // Pivot Points
  const pivotBars = bars.slice(-Math.min(80, bars.length));
  const pH = Math.max(...pivotBars.map((b) => b.high));
  const pL = Math.min(...pivotBars.map((b) => b.low));
  const P = (pH + pL + close) / 3;
  const R1 = 2 * P - pL, R2 = P + (pH - pL);
  const S1 = 2 * P - pH, S2 = P - (pH - pL);
  if (R1 > close) rawLevels.push({ price: R1, type: "resistance", source: "pivot" });
  if (R2 > close) rawLevels.push({ price: R2, type: "resistance", source: "pivot" });
  if (S1 < close) rawLevels.push({ price: S1, type: "support", source: "pivot" });
  if (S2 < close) rawLevels.push({ price: S2, type: "support", source: "pivot" });
  rawLevels.push({ price: P, type: P > close ? "resistance" : "support", source: "pivot" });

  // Range
  const recent = bars.slice(-20);
  const rH = Math.max(...recent.map((b) => b.high));
  const rL = Math.min(...recent.map((b) => b.low));
  if (rH > close) rawLevels.push({ price: rH, type: "resistance", source: "range" });
  if (rL < close) rawLevels.push({ price: rL, type: "support", source: "range" });

  // Cluster
  const CLUSTER_PCT = 0.003;
  const sorted = rawLevels.filter((l) => Number.isFinite(l.price) && l.price > 0).sort((a, b) => a.price - b.price);
  const clusters: Array<{ price: number; type: "support" | "resistance"; touchCount: number }> = [];

  for (const level of sorted) {
    const existing = clusters.find((c) => Math.abs(c.price - level.price) / Math.max(c.price, 1e-10) < CLUSTER_PCT);
    if (existing) {
      existing.price = (existing.price * existing.touchCount + level.price) / (existing.touchCount + 1);
      existing.touchCount += 1;
      existing.type = existing.price > close ? "resistance" : "support";
    } else {
      clusters.push({ price: level.price, type: level.type, touchCount: 1 });
    }
  }

  const toStrength = (tc: number): "STRONG" | "MID" | "WEAK" => tc >= 3 ? "STRONG" : tc >= 2 ? "MID" : "WEAK";

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

function findNearestSR(price: number, levels: SRLevel[]): { distPct: number; level: SRLevel } | null {
  if (!levels.length || price <= 0) return null;
  let nearest: SRLevel | null = null;
  let minDist = Infinity;
  for (const l of levels) {
    const dist = (Math.abs(l.price - price) / price) * 100;
    if (dist < minDist) { minDist = dist; nearest = l; }
  }
  return nearest ? { distPct: Math.round(minDist * 100) / 100, level: nearest } : null;
}

/* ------------------------------------------------------------------ */
/*  Market regime detection                                            */
/* ------------------------------------------------------------------ */

function detectRegime(bars: OhlcvBar[]): { regime: MarketRegime; trendStrength: number; expansionProb: number } {
  if (bars.length < 20) return { regime: "UNKNOWN", trendStrength: 0, expansionProb: 0.5 };

  const recent = bars.slice(-20);
  const closes = recent.map((b) => b.close);

  // ADX-like trend strength: slope of closes
  const first5Avg = closes.slice(0, 5).reduce((s, v) => s + v, 0) / 5;
  const last5Avg = closes.slice(-5).reduce((s, v) => s + v, 0) / 5;
  const trendPct = first5Avg > 0 ? ((last5Avg - first5Avg) / first5Avg) * 100 : 0;
  const absTrend = Math.abs(trendPct);

  // Range detection: high-low range vs ATR
  const rangeHigh = Math.max(...recent.map((b) => b.high));
  const rangeLow = Math.min(...recent.map((b) => b.low));
  const rangeSize = rangeHigh > 0 ? ((rangeHigh - rangeLow) / rangeHigh) * 100 : 0;

  // Volume expansion check
  const avgVol = recent.slice(0, 15).reduce((s, b) => s + b.volume, 0) / 15;
  const recentVol = recent.slice(-5).reduce((s, b) => s + b.volume, 0) / 5;
  const volExpansion = avgVol > 0 ? recentVol / avgVol : 1;

  // Trend strength 0-100
  const trendStrength = Math.min(100, Math.round(absTrend * 12 + (volExpansion > 1.3 ? 15 : 0)));

  // Expansion probability
  const expansionProb = Math.min(1, Math.max(0,
    (volExpansion > 1.5 ? 0.3 : volExpansion > 1.2 ? 0.15 : 0) +
    (absTrend > 3 ? 0.3 : absTrend > 1.5 ? 0.15 : 0) +
    (rangeSize < 3 ? 0.25 : rangeSize < 5 ? 0.1 : 0) +
    0.2, // base
  ));

  let regime: MarketRegime;
  if (absTrend > 3 && trendStrength > 50) {
    regime = "TREND";
  } else if (rangeSize < 3 && volExpansion > 1.4) {
    regime = "BREAKOUT";
  } else if (rangeSize < 5 && absTrend < 2) {
    regime = "RANGE";
  } else {
    regime = "UNKNOWN";
  }

  return { regime, trendStrength, expansionProb };
}

/* ------------------------------------------------------------------ */
/*  Volume spike detection                                             */
/* ------------------------------------------------------------------ */

function detectVolumeSpike(bars: OhlcvBar[]): boolean {
  if (bars.length < 20) return false;
  const recent = bars.slice(-20);
  const avgVol = recent.slice(0, 15).reduce((s, b) => s + b.volume, 0) / 15;
  const lastBar = recent[recent.length - 1];
  return avgVol > 0 && lastBar.volume > avgVol * 2;
}

/* ------------------------------------------------------------------ */
/*  Aggressor flow proxy (from klines)                                 */
/* ------------------------------------------------------------------ */

function detectAggressorFlow(bars: OhlcvBar[]): "BUY" | "SELL" | "NEUTRAL" {
  if (bars.length < 5) return "NEUTRAL";
  const last5 = bars.slice(-5);
  let buyVol = 0, sellVol = 0;
  for (const bar of last5) {
    const bodyPct = bar.close > bar.open
      ? (bar.close - bar.open) / (bar.high - bar.low || 1)
      : (bar.open - bar.close) / (bar.high - bar.low || 1);
    if (bar.close > bar.open) buyVol += bar.volume * bodyPct;
    else sellVol += bar.volume * bodyPct;
  }
  const total = buyVol + sellVol;
  if (total === 0) return "NEUTRAL";
  const buyRatio = buyVol / total;
  if (buyRatio > 0.6) return "BUY";
  if (buyRatio < 0.4) return "SELL";
  return "NEUTRAL";
}

/* ------------------------------------------------------------------ */
/*  OI change proxy (from volume + price action)                       */
/* ------------------------------------------------------------------ */

function estimateOiChange(bars: OhlcvBar[]): number | null {
  if (bars.length < 10) return null;
  const recent = bars.slice(-10);
  const older = bars.slice(-20, -10);
  if (older.length < 5) return null;

  const recentAvgVol = recent.reduce((s, b) => s + b.volume, 0) / recent.length;
  const olderAvgVol = older.reduce((s, b) => s + b.volume, 0) / older.length;

  if (olderAvgVol === 0) return null;
  // Volume increase + price movement in same direction suggests OI increase
  const volChange = ((recentAvgVol - olderAvgVol) / olderAvgVol) * 100;
  return Math.round(volChange * 100) / 100;
}

/* ------------------------------------------------------------------ */
/*  Enrich raw coin data with klines                                   */
/* ------------------------------------------------------------------ */

function enrichCoin(raw: RawCoinData, bars: OhlcvBar[]): CoinUniverseData {
  const atrPct = computeAtrPct(bars);
  const rsi14 = computeRsi14(bars);
  const srLevels = deriveKeyLevels(bars);
  const nearest = findNearestSR(raw.price, srLevels);
  const regimeData = detectRegime(bars);
  const volumeSpike = detectVolumeSpike(bars);
  const aggressorFlow = detectAggressorFlow(bars);
  const oiChange = estimateOiChange(bars);

  return {
    ...raw,
    atrPct,
    rsi14,
    srDistPct: nearest?.distPct ?? null,
    nearestSR: nearest?.level ?? null,
    srLevels,
    regime: regimeData.regime,
    trendStrength: regimeData.trendStrength,
    expansionProbability: regimeData.expansionProb,
    volumeSpike,
    oiChange,
    aggressorFlow,
    bars,
  };
}

function enrichCoinNoKlines(raw: RawCoinData): CoinUniverseData {
  return {
    ...raw,
    atrPct: null,
    rsi14: null,
    srDistPct: null,
    nearestSR: null,
    srLevels: [],
    regime: "UNKNOWN",
    trendStrength: 0,
    expansionProbability: 0.5,
    volumeSpike: false,
    oiChange: null,
    aggressorFlow: "NEUTRAL",
    bars: [],
  };
}

/* ------------------------------------------------------------------ */
/*  Klines cache                                                       */
/* ------------------------------------------------------------------ */

interface KlinesCache {
  bars: OhlcvBar[];
  fetchedAt: number;
}

/* ------------------------------------------------------------------ */
/*  Engine Class                                                       */
/* ------------------------------------------------------------------ */

interface CoinUniverseEngineV2Deps {
  binanceFuturesHub: BinanceFuturesHubLike;
}

export class CoinUniverseEngineV2 {
  private deps: CoinUniverseEngineV2Deps;
  private klinesCache = new Map<string, KlinesCache>();
  private cooldownMap = new Map<string, CooldownEntry>();
  private currentRound = 0;
  private rankedActive: UniverseCoinRow[] = [];
  private rankedCooldown: UniverseCoinRow[] = [];
  private rankedRejected: UniverseCoinRow[] = [];
  private refreshedAt = "";
  private previousActiveSymbols = new Set<string>();
  private lastStats = { totalScanned: 0, hardFiltered: 0, scored: 0, selected: 0, cooldown: 0 };

  constructor(deps: CoinUniverseEngineV2Deps) {
    this.deps = deps;
  }

  /* ---- Public API (backward-compatible) ---- */

  async refresh(): Promise<void> {
    this.currentRound += 1;
    const t0 = Date.now();

    // 1. Get all coins from WS hub
    const wsRows = this.deps.binanceFuturesHub.getUniverseRows();
    if (!wsRows.length) {
      console.log(`[CoinUniverseV2] Refresh #${this.currentRound}: No WS data`);
      return;
    }

    // 2. Stage 1: Hard Filter
    const { passed, rejected: hardRejected } = applyHardFilter(wsRows);
    if (!passed.length) {
      console.log(`[CoinUniverseV2] Refresh #${this.currentRound}: All ${wsRows.length} coins hard-filtered`);
      return;
    }

    // 3. Fetch klines for top coins (sorted by volume descending as rough priority)
    const sortedByVol = [...passed].sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    const klinesSymbols = sortedByVol.slice(0, 80).map((c) => c.symbol);
    await this.fetchKlinesBatch(klinesSymbols);

    // 4. Enrich coins with klines data
    const now = Date.now();
    const enriched: CoinUniverseData[] = passed.map((raw) => {
      const cached = this.klinesCache.get(raw.symbol);
      if (cached && now - cached.fetchedAt < KLINES_CACHE_TTL_MS && cached.bars.length >= 20) {
        return enrichCoin(raw, cached.bars);
      }
      return enrichCoinNoKlines(raw);
    });

    // 5. Stage 2 + 3: Universe Score (includes false penalty)
    const expansionProbs = new Map<string, number>();
    const scoredRows: UniverseCoinRow[] = enriched.map((coin) => {
      const score = computeUniverseScore(coin);
      expansionProbs.set(coin.symbol, coin.expansionProbability);

      // Cooldown check
      const cooldownEntry = this.cooldownMap.get(coin.symbol);
      const isCooling = cooldownEntry != null && this.currentRound < cooldownEntry.cooldownUntilRound;
      const cooldownRoundsLeft = isCooling ? cooldownEntry!.cooldownUntilRound - this.currentRound : null;
      const isNew = !this.previousActiveSymbols.has(coin.symbol) && this.currentRound > 1;

      return {
        symbol: coin.symbol,
        baseAsset: coin.baseAsset,
        price: coin.price,
        change24hPct: coin.change24hPct,
        volume24hUsd: coin.volume24hUsd,
        fundingRate: coin.fundingRate,
        spreadBps: coin.spreadBps,
        atrPct: coin.atrPct,
        rsi14: coin.rsi14,
        srDistPct: coin.srDistPct,
        nearestSR: coin.nearestSR,
        regime: coin.regime,
        trendStrength: coin.trendStrength,
        volumeSpike: coin.volumeSpike,
        oiChange: coin.oiChange,
        aggressorFlow: coin.aggressorFlow,
        universeScore: score,
        compositeScore: score.final,
        selected: false,
        rejectedReason: null,
        status: isCooling ? "COOLDOWN" : isNew ? "NEW" : "ACTIVE",
        cooldownRoundsLeft,
        scanner_selected: false,
      };
    });

    // Separate cooldown coins
    const activePool = scoredRows.filter((c) => c.status !== "COOLDOWN");
    const cooldownPool = scoredRows.filter((c) => c.status === "COOLDOWN");

    // 6. Stage 4: Top 10% Selection
    const selection = selectTopCoins(activePool, expansionProbs);

    // Mark status on rejected from selection
    const rejectedFromHardFilter: UniverseCoinRow[] = hardRejected.map((r) => ({
      symbol: r.coin.symbol,
      baseAsset: r.coin.baseAsset,
      price: r.coin.price,
      change24hPct: r.coin.change24hPct,
      volume24hUsd: r.coin.volume24hUsd,
      fundingRate: r.coin.fundingRate,
      spreadBps: r.coin.spreadBps,
      atrPct: null,
      rsi14: null,
      srDistPct: null,
      nearestSR: null,
      regime: "UNKNOWN" as const,
      trendStrength: 0,
      volumeSpike: false,
      oiChange: null,
      aggressorFlow: "NEUTRAL" as const,
      universeScore: { raw: 0, penalty: 0, final: 0, liquidity: { total: 0, volumeScore: 0, depthScore: 0, spreadScore: 0 }, structure: { total: 0, srProximity: 0, regimeScore: 0, trendScore: 0 }, momentum: { total: 0, priceChange: 0, rsiScore: 0, volumeSpikeScore: 0 }, positioning: { total: 0, fundingScore: 0, oiScore: 0, flowScore: 0 }, execution: { total: 0, spreadQuality: 0, depthQuality: 0, imbalanceScore: 0 }, falsePenalty: { total: 0, fakeBreakout: 0, signalConflict: 0, trapProbability: 0, cascadeRisk: 0, newsRisk: 0 } },
      compositeScore: 0,
      selected: false,
      rejectedReason: r.reason,
      status: "REJECTED" as const,
      cooldownRoundsLeft: null,
      scanner_selected: false,
    }));

    // Combine selected + watchlist as active
    const allActive = [...selection.selected, ...selection.watchlist]
      .sort((a, b) => b.compositeScore - a.compositeScore || b.volume24hUsd - a.volume24hUsd);

    this.rankedActive = allActive;
    this.rankedCooldown = cooldownPool.sort((a, b) => b.compositeScore - a.compositeScore);
    this.rankedRejected = [...selection.rejected, ...rejectedFromHardFilter];
    this.refreshedAt = new Date().toISOString();
    this.previousActiveSymbols = new Set(allActive.map((c) => c.symbol));

    // Clean expired cooldowns
    for (const [sym, entry] of this.cooldownMap) {
      if (this.currentRound >= entry.cooldownUntilRound) {
        this.cooldownMap.delete(sym);
      }
    }

    this.lastStats = {
      totalScanned: wsRows.length,
      hardFiltered: hardRejected.length,
      scored: passed.length,
      selected: selection.selected.length,
      cooldown: cooldownPool.length,
    };

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `[CoinUniverseV2] Refresh #${this.currentRound}: ${wsRows.length} scanned, ` +
      `${hardRejected.length} hard-filtered, ${passed.length} scored, ` +
      `${selection.selected.length} selected (top 10%), ${cooldownPool.length} cooling — ${elapsed}s`,
    );
  }

  getSnapshot(): UniverseSnapshot {
    return {
      activeCoins: this.rankedActive,
      cooldownCoins: this.rankedCooldown,
      rejectedCoins: this.rankedRejected,
      round: this.currentRound,
      refreshedAt: this.refreshedAt,
      stats: this.lastStats,
    };
  }

  getTop28(): string[] {
    return this.rankedActive
      .filter((c) => c.selected)
      .slice(0, SELECTED_TOP_28)
      .map((c) => c.symbol);
  }

  getActiveSymbolsRanked(): string[] {
    return this.rankedActive.map((c) => c.symbol);
  }

  markAsSentToQuant(symbols: string[]): void {
    for (const s of symbols) {
      this.cooldownMap.set(s, {
        sentAtRound: this.currentRound,
        cooldownUntilRound: this.currentRound + COOLDOWN_ROUNDS,
      });
    }
  }

  markScannerSelected(symbols: string[]): void {
    const set = new Set(symbols);
    for (const coin of this.rankedActive) {
      coin.scanner_selected = set.has(coin.symbol);
    }
  }

  isCoolingDown(symbol: string): boolean {
    const entry = this.cooldownMap.get(symbol);
    return entry != null && this.currentRound < entry.cooldownUntilRound;
  }

  /* ---- Private: Klines fetching ---- */

  private async fetchKlinesBatch(symbols: string[]): Promise<void> {
    const now = Date.now();
    const needFetch = symbols.filter((s) => {
      const cached = this.klinesCache.get(s);
      return !cached || now - cached.fetchedAt >= KLINES_CACHE_TTL_MS;
    });
    if (!needFetch.length) return;

    for (let i = 0; i < needFetch.length; i += KLINES_CONCURRENT) {
      const chunk = needFetch.slice(i, i + KLINES_CONCURRENT);
      const results = await Promise.allSettled(chunk.map((symbol) => this.fetchKlines(symbol)));
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === "fulfilled" && result.value) {
          this.klinesCache.set(chunk[j], { bars: result.value, fetchedAt: Date.now() });
        }
      }
      await new Promise<void>((r) => setImmediate(r));
    }
  }

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
