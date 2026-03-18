/**
 * Coin Universe Engine V2 — Orchestrator
 *
 * 4-stage pipeline (60s tick):
 *   1. Hard Filter → remove untradeable
 *   2. Universe Score → 100-point (5 sub-scores)
 *   3. False Filter → penalty 0-30
 *   4. Top 10% Selection → quant engine
 *
 * Features:
 *   - Redis persistence (all workers see same data)
 *   - Degraded mode when klines unavailable
 *   - Data quality tracking per coin
 *   - Bybit klines fallback when Binance rate-limited
 *   - Candle cache in Redis (5min TTL)
 *   - Rejection telemetry
 *   - Engine health metadata
 */

import type {
  BinanceFuturesHubLike,
  CoinUniverseData,
  CooldownEntry,
  DataQuality,
  EngineHealth,
  EngineMode,
  MarketRegime,
  OhlcvBar,
  RawCoinData,
  RejectionTelemetry,
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
const COOLDOWN_ROUNDS = 1;
const SELECTED_TOP_28 = 28;

const REDIS_SNAPSHOT_KEY = "coin_universe_v2:snapshot";
const REDIS_SNAPSHOT_TTL = 90; // seconds
const REDIS_CANDLE_PREFIX = "coin_universe_v2:candle:";
const REDIS_CANDLE_TTL = 300; // 5 min

/* ------------------------------------------------------------------ */
/*  Redis import (lazy — may not be available in all envs)             */
/* ------------------------------------------------------------------ */

let redis: any = null;
try {
  const mod = await import("../../db/redis.ts");
  redis = mod.redis;
} catch {
  // Redis unavailable — engine works without persistence
}

/* ------------------------------------------------------------------ */
/*  Technical analysis helpers                                         */
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

  const recent = bars.slice(-20);
  const rH = Math.max(...recent.map((b) => b.high));
  const rL = Math.min(...recent.map((b) => b.low));
  if (rH > close) rawLevels.push({ price: rH, type: "resistance", source: "range" });
  if (rL < close) rawLevels.push({ price: rL, type: "support", source: "range" });

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

function detectRegime(bars: OhlcvBar[]): { regime: MarketRegime; trendStrength: number; expansionProb: number } {
  if (bars.length < 20) return { regime: "UNKNOWN", trendStrength: 0, expansionProb: 0.5 };
  const recent = bars.slice(-20);
  const closes = recent.map((b) => b.close);
  const first5Avg = closes.slice(0, 5).reduce((s, v) => s + v, 0) / 5;
  const last5Avg = closes.slice(-5).reduce((s, v) => s + v, 0) / 5;
  const trendPct = first5Avg > 0 ? ((last5Avg - first5Avg) / first5Avg) * 100 : 0;
  const absTrend = Math.abs(trendPct);
  const rangeHigh = Math.max(...recent.map((b) => b.high));
  const rangeLow = Math.min(...recent.map((b) => b.low));
  const rangeSize = rangeHigh > 0 ? ((rangeHigh - rangeLow) / rangeHigh) * 100 : 0;
  const avgVol = recent.slice(0, 15).reduce((s, b) => s + b.volume, 0) / 15;
  const recentVol = recent.slice(-5).reduce((s, b) => s + b.volume, 0) / 5;
  const volExpansion = avgVol > 0 ? recentVol / avgVol : 1;
  const trendStrength = Math.min(100, Math.round(absTrend * 12 + (volExpansion > 1.3 ? 15 : 0)));
  const expansionProb = Math.min(1, Math.max(0,
    (volExpansion > 1.5 ? 0.3 : volExpansion > 1.2 ? 0.15 : 0) +
    (absTrend > 3 ? 0.3 : absTrend > 1.5 ? 0.15 : 0) +
    (rangeSize < 3 ? 0.25 : rangeSize < 5 ? 0.1 : 0) + 0.2,
  ));
  let regime: MarketRegime;
  if (absTrend > 3 && trendStrength > 50) regime = "TREND";
  else if (rangeSize < 3 && volExpansion > 1.4) regime = "BREAKOUT";
  else if (rangeSize < 5 && absTrend < 2) regime = "RANGE";
  else regime = "UNKNOWN";
  return { regime, trendStrength, expansionProb };
}

function detectVolumeSpike(bars: OhlcvBar[]): boolean {
  if (bars.length < 20) return false;
  const recent = bars.slice(-20);
  const avgVol = recent.slice(0, 15).reduce((s, b) => s + b.volume, 0) / 15;
  return avgVol > 0 && recent[recent.length - 1].volume > avgVol * 2;
}

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

function estimateOiChange(bars: OhlcvBar[]): number | null {
  if (bars.length < 10) return null;
  const recent = bars.slice(-10);
  const older = bars.slice(-20, -10);
  if (older.length < 5) return null;
  const recentAvgVol = recent.reduce((s, b) => s + b.volume, 0) / recent.length;
  const olderAvgVol = older.reduce((s, b) => s + b.volume, 0) / older.length;
  if (olderAvgVol === 0) return null;
  return Math.round(((recentAvgVol - olderAvgVol) / olderAvgVol) * 100 * 100) / 100;
}

/* ------------------------------------------------------------------ */
/*  Data quality computation                                           */
/* ------------------------------------------------------------------ */

function computeDataQuality(coin: RawCoinData, hasKlines: boolean): DataQuality {
  const hasFunding = coin.fundingRate !== null;
  const hasOrderbook = coin.depthUsd !== null && coin.imbalance !== null;
  const hasOi = false; // OI is estimated from klines, true OI requires separate feed

  let score = 0;
  if (hasKlines) score += 40;    // klines = ATR, RSI, S/R, regime
  if (hasFunding) score += 20;
  if (hasOrderbook) score += 25;
  if (coin.spreadBps !== null) score += 15;

  return { hasKlines, hasOi, hasFunding, hasOrderbook, score };
}

/* ------------------------------------------------------------------ */
/*  Enrich raw coin data                                               */
/* ------------------------------------------------------------------ */

function enrichCoin(raw: RawCoinData, bars: OhlcvBar[]): CoinUniverseData {
  const regimeData = detectRegime(bars);
  return {
    ...raw,
    atrPct: computeAtrPct(bars),
    rsi14: computeRsi14(bars),
    srDistPct: null, nearestSR: null, // set below
    srLevels: deriveKeyLevels(bars),
    regime: regimeData.regime,
    trendStrength: regimeData.trendStrength,
    expansionProbability: regimeData.expansionProb,
    volumeSpike: detectVolumeSpike(bars),
    oiChange: estimateOiChange(bars),
    aggressorFlow: detectAggressorFlow(bars),
    bars,
  };
}

function enrichCoinFull(raw: RawCoinData, bars: OhlcvBar[]): CoinUniverseData {
  const enriched = enrichCoin(raw, bars);
  const nearest = findNearestSR(raw.price, enriched.srLevels);
  enriched.srDistPct = nearest?.distPct ?? null;
  enriched.nearestSR = nearest?.level ?? null;
  return enriched;
}

function enrichCoinNoKlines(raw: RawCoinData): CoinUniverseData {
  return {
    ...raw, atrPct: null, rsi14: null, srDistPct: null, nearestSR: null,
    srLevels: [], regime: "UNKNOWN", trendStrength: 0, expansionProbability: 0.5,
    volumeSpike: false, oiChange: null, aggressorFlow: "NEUTRAL", bars: [],
  };
}

/* ------------------------------------------------------------------ */
/*  Klines cache (in-memory + Redis)                                   */
/* ------------------------------------------------------------------ */

interface KlinesCache { bars: OhlcvBar[]; fetchedAt: number; source: "binance" | "bybit"; }

async function getRedisCandle(symbol: string): Promise<OhlcvBar[] | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(`${REDIS_CANDLE_PREFIX}${symbol}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

async function setRedisCandle(symbol: string, bars: OhlcvBar[], source: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(`${REDIS_CANDLE_PREFIX}${symbol}`, JSON.stringify(bars), "EX", REDIS_CANDLE_TTL);
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/*  Klines fetchers                                                    */
/* ------------------------------------------------------------------ */

async function fetchBinanceKlines(symbol: string): Promise<OhlcvBar[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${KLINES_INTERVAL}&limit=${KLINES_BARS}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const raw = (await res.json()) as Array<[number, string, string, string, string, string, ...any]>;
    if (!Array.isArray(raw)) return null;
    return raw.map((k) => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
  } catch { return null; } finally { clearTimeout(timeout); }
}

async function fetchBybitKlines(symbol: string): Promise<OhlcvBar[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    // Bybit linear USDT perps use same symbol format
    const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=15&limit=${KLINES_BARS}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const body = (await res.json()) as { retCode: number; result?: { list?: string[][] } };
    if (body.retCode !== 0 || !body.result?.list?.length) return null;
    // Bybit returns newest first — reverse
    return body.result.list.reverse().map((k) => ({
      time: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
  } catch { return null; } finally { clearTimeout(timeout); }
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
  private lastHealth: EngineHealth = { engine: "v2", mode: "degraded", klinesAvailable: false, klinesSource: "none", klinesSuccessCount: 0, klinesFailCount: 0, dataQuality: "minimal", binanceStatus: "unknown" };
  private lastTelemetry: RejectionTelemetry = { hard_reject_volume: 0, hard_reject_spread: 0, hard_reject_stablecoin: 0, hard_reject_missing_data: 0, reject_score_below_threshold: 0, reject_weak_trend: 0, reject_range_low_expansion: 0, reject_declining_oi: 0, reject_below_top_10pct: 0, selected_count: 0, watchlist_count: 0 };

  constructor(deps: CoinUniverseEngineV2Deps) {
    this.deps = deps;
  }

  /* ---- Public API ---- */

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
      console.log(`[CoinUniverseV2] Refresh #${this.currentRound}: All ${wsRows.length} hard-filtered`);
      return;
    }

    // Build rejection telemetry from hard filter
    const telemetry: RejectionTelemetry = {
      hard_reject_volume: 0, hard_reject_spread: 0, hard_reject_stablecoin: 0, hard_reject_missing_data: 0,
      reject_score_below_threshold: 0, reject_weak_trend: 0, reject_range_low_expansion: 0,
      reject_declining_oi: 0, reject_below_top_10pct: 0, selected_count: 0, watchlist_count: 0,
    };
    for (const r of hardRejected) {
      if (r.reason.startsWith("volume")) telemetry.hard_reject_volume++;
      else if (r.reason.startsWith("spread")) telemetry.hard_reject_spread++;
      else if (r.reason === "stablecoin") telemetry.hard_reject_stablecoin++;
      else telemetry.hard_reject_missing_data++;
    }

    // 3. Fetch klines with Binance → Bybit → Redis cache fallback
    const sortedByVol = [...passed].sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    const klinesSymbols = sortedByVol.slice(0, 80).map((c) => c.symbol);
    const { successCount, failCount, source: klinesSource, binanceStatus } = await this.fetchKlinesBatchWithFallback(klinesSymbols);

    // 4. Enrich coins
    const now = Date.now();
    let klinesHitCount = 0;
    const enriched: CoinUniverseData[] = passed.map((raw) => {
      const cached = this.klinesCache.get(raw.symbol);
      if (cached && now - cached.fetchedAt < KLINES_CACHE_TTL_MS && cached.bars.length >= 20) {
        klinesHitCount++;
        return enrichCoinFull(raw, cached.bars);
      }
      return enrichCoinNoKlines(raw);
    });

    // Determine engine mode
    const mode: EngineMode = klinesHitCount > 0 ? "full" : "degraded";
    const dataQualityLevel = klinesHitCount >= 40 ? "full" : klinesHitCount > 0 ? "degraded" : "minimal";

    // 5. Score + select
    const expansionProbs = new Map<string, number>();
    const scoredRows: UniverseCoinRow[] = enriched.map((coin) => {
      const score = computeUniverseScore(coin);
      expansionProbs.set(coin.symbol, coin.expansionProbability);
      const cooldownEntry = this.cooldownMap.get(coin.symbol);
      const isCooling = cooldownEntry != null && this.currentRound < cooldownEntry.cooldownUntilRound;
      const cooldownRoundsLeft = isCooling ? cooldownEntry!.cooldownUntilRound - this.currentRound : null;
      const isNew = !this.previousActiveSymbols.has(coin.symbol) && this.currentRound > 1;
      const hasKlines = coin.regime !== "UNKNOWN";
      const dq = computeDataQuality(coin, hasKlines);

      return {
        symbol: coin.symbol, baseAsset: coin.baseAsset, price: coin.price,
        change24hPct: coin.change24hPct, volume24hUsd: coin.volume24hUsd,
        fundingRate: coin.fundingRate, spreadBps: coin.spreadBps,
        atrPct: coin.atrPct, rsi14: coin.rsi14, srDistPct: coin.srDistPct,
        nearestSR: coin.nearestSR, regime: coin.regime, trendStrength: coin.trendStrength,
        volumeSpike: coin.volumeSpike, oiChange: coin.oiChange, aggressorFlow: coin.aggressorFlow,
        universeScore: score, compositeScore: score.final, dataQuality: dq,
        tier: "GAMMA" as const, // default — upgraded by selector
        selected: false, rejectedReason: null,
        status: isCooling ? "COOLDOWN" as const : isNew ? "NEW" as const : "ACTIVE" as const,
        cooldownRoundsLeft, scanner_selected: false,
      };
    });

    const activePool = scoredRows.filter((c) => c.status !== "COOLDOWN");
    const cooldownPool = scoredRows.filter((c) => c.status === "COOLDOWN");

    // 6. Top 10% Selection
    const selection = selectTopCoins(activePool, expansionProbs);

    // Build selection telemetry
    for (const c of selection.rejected) {
      if (c.rejectedReason?.startsWith("score_below")) telemetry.reject_score_below_threshold++;
      else if (c.rejectedReason === "weak_trend_no_volume") telemetry.reject_weak_trend++;
      else if (c.rejectedReason === "range_low_expansion") telemetry.reject_range_low_expansion++;
      else if (c.rejectedReason === "declining_oi_neutral_flow") telemetry.reject_declining_oi++;
      else if (c.rejectedReason === "below_top_10pct") telemetry.reject_below_top_10pct++;
    }
    for (const c of selection.watchlist) {
      if (c.rejectedReason === "below_top_10pct") telemetry.reject_below_top_10pct++;
    }
    telemetry.selected_count = selection.selected.length;
    telemetry.watchlist_count = selection.watchlist.length;

    // Build rejected list (minimal — no heavy data)
    const rejectedFromHardFilter: UniverseCoinRow[] = hardRejected.slice(0, 20).map((r) => ({
      symbol: r.coin.symbol, baseAsset: r.coin.baseAsset, price: r.coin.price,
      change24hPct: r.coin.change24hPct, volume24hUsd: r.coin.volume24hUsd,
      fundingRate: r.coin.fundingRate, spreadBps: r.coin.spreadBps,
      atrPct: null, rsi14: null, srDistPct: null, nearestSR: null,
      regime: "UNKNOWN" as const, trendStrength: 0, volumeSpike: false,
      oiChange: null, aggressorFlow: "NEUTRAL" as const,
      universeScore: { raw: 0, penalty: 0, final: 0, liquidity: { total: 0, volumeScore: 0, depthScore: 0, spreadScore: 0 }, structure: { total: 0, srProximity: 0, regimeScore: 0, trendScore: 0 }, momentum: { total: 0, priceChange: 0, rsiScore: 0, volumeSpikeScore: 0 }, positioning: { total: 0, fundingScore: 0, oiScore: 0, flowScore: 0 }, execution: { total: 0, spreadQuality: 0, depthQuality: 0, imbalanceScore: 0 }, falsePenalty: { total: 0, fakeBreakout: 0, signalConflict: 0, trapProbability: 0, cascadeRisk: 0, newsRisk: 0 } },
      compositeScore: 0, dataQuality: { hasKlines: false, hasOi: false, hasFunding: false, hasOrderbook: false, score: 0 },
      tier: "GAMMA" as const, selected: false, rejectedReason: r.reason, status: "REJECTED" as const,
      cooldownRoundsLeft: null, scanner_selected: false,
    }));

    // Cooldown penalty: reduce compositeScore by 30% for cooldown coins
    for (const coin of cooldownPool) {
      coin.compositeScore = Math.round(coin.compositeScore * 0.7 * 100) / 100;
    }

    // Combine ALL scored coins (including cooldown) — top 100 for UI display
    // Active coins first (no cooldown), then cooldown coins sorted by penalized score
    const activeCoins = [...selection.selected, ...selection.watchlist, ...selection.rejected];
    const allScored = [...activeCoins, ...cooldownPool]
      .sort((a, b) => b.compositeScore - a.compositeScore || b.volume24hUsd - a.volume24hUsd)
      .slice(0, 100);

    this.rankedActive = allScored;
    this.rankedCooldown = cooldownPool.sort((a, b) => b.compositeScore - a.compositeScore);
    this.rankedRejected = [...selection.rejected.slice(0, 20), ...rejectedFromHardFilter];
    this.refreshedAt = new Date().toISOString();
    this.previousActiveSymbols = new Set(allScored.map((c) => c.symbol));

    for (const [sym, entry] of this.cooldownMap) {
      if (this.currentRound >= entry.cooldownUntilRound) this.cooldownMap.delete(sym);
    }

    this.lastStats = {
      totalScanned: wsRows.length, hardFiltered: hardRejected.length,
      scored: passed.length, selected: selection.selected.length, cooldown: cooldownPool.length,
    };
    this.lastHealth = {
      engine: "v2", mode, klinesAvailable: klinesHitCount > 0,
      klinesSource, klinesSuccessCount: successCount, klinesFailCount: failCount,
      dataQuality: dataQualityLevel, binanceStatus,
    };
    this.lastTelemetry = telemetry;

    // 7. Persist to Redis (so workers 1-2 can read)
    await this.persistToRedis();

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `[CoinUniverseV2] Refresh #${this.currentRound}: ${wsRows.length} scanned, ` +
      `${hardRejected.length} hard-filtered, ${passed.length} scored, ` +
      `${selection.selected.length} selected, ${klinesHitCount} klines (${klinesSource}) — ${mode} — ${elapsed}s`,
    );
  }

  getSnapshot(): UniverseSnapshot {
    return {
      activeCoins: this.rankedActive, cooldownCoins: this.rankedCooldown,
      rejectedCoins: this.rankedRejected, round: this.currentRound,
      refreshedAt: this.refreshedAt, stats: this.lastStats,
      health: this.lastHealth, telemetry: this.lastTelemetry,
    };
  }

  /** Read snapshot from Redis (for secondary workers) */
  async getSnapshotFromRedis(): Promise<UniverseSnapshot | null> {
    if (!redis) return null;
    try {
      const raw = await redis.get(REDIS_SNAPSHOT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  getTop28(): string[] {
    // Simple: all coins sorted by compositeScore desc, take first 28
    return this.rankedActive.slice(0, SELECTED_TOP_28).map((c) => c.symbol);
  }

  getActiveSymbolsRanked(): string[] {
    return this.rankedActive.map((c) => c.symbol);
  }

  markAsSentToQuant(symbols: string[]): void {
    for (const s of symbols) {
      this.cooldownMap.set(s, { sentAtRound: this.currentRound, cooldownUntilRound: this.currentRound + COOLDOWN_ROUNDS });
    }
  }

  markScannerSelected(symbols: string[]): void {
    const set = new Set(symbols);
    for (const coin of this.rankedActive) coin.scanner_selected = set.has(coin.symbol);
  }

  isCoolingDown(symbol: string): boolean {
    const entry = this.cooldownMap.get(symbol);
    return entry != null && this.currentRound < entry.cooldownUntilRound;
  }

  /* ---- Private: Redis persistence ---- */

  private async persistToRedis(): Promise<void> {
    if (!redis) return;
    try {
      const snapshot: UniverseSnapshot = {
        activeCoins: this.rankedActive, cooldownCoins: this.rankedCooldown,
        rejectedCoins: [], // Don't store full rejected in Redis (too large)
        round: this.currentRound, refreshedAt: this.refreshedAt,
        stats: this.lastStats, health: this.lastHealth, telemetry: this.lastTelemetry,
      };
      await redis.set(REDIS_SNAPSHOT_KEY, JSON.stringify(snapshot), "EX", REDIS_SNAPSHOT_TTL);
    } catch (err: any) {
      console.error("[CoinUniverseV2] Redis persist error:", err?.message);
    }
  }

  /* ---- Private: Klines with fallback chain ---- */

  private async fetchKlinesBatchWithFallback(symbols: string[]): Promise<{
    successCount: number; failCount: number;
    source: "binance" | "bybit" | "cache" | "none";
    binanceStatus: "ok" | "rate_limited" | "error" | "unknown";
  }> {
    const now = Date.now();
    const needFetch = symbols.filter((s) => {
      const cached = this.klinesCache.get(s);
      return !cached || now - cached.fetchedAt >= KLINES_CACHE_TTL_MS;
    });
    if (!needFetch.length) {
      const cachedCount = symbols.filter((s) => this.klinesCache.has(s)).length;
      return { successCount: cachedCount, failCount: 0, source: "cache", binanceStatus: "unknown" };
    }

    let successCount = 0;
    let failCount = 0;
    let primarySource: "binance" | "bybit" | "cache" | "none" = "none";
    let binanceStatus: "ok" | "rate_limited" | "error" | "unknown" = "unknown";

    // Try Binance first (first 3 symbols as probe)
    const probeSymbols = needFetch.slice(0, 3);
    let binanceWorks = false;
    for (const symbol of probeSymbols) {
      const bars = await fetchBinanceKlines(symbol);
      if (bars && bars.length >= 20) {
        binanceWorks = true;
        binanceStatus = "ok";
        this.klinesCache.set(symbol, { bars, fetchedAt: Date.now(), source: "binance" });
        await setRedisCandle(symbol, bars, "binance");
        successCount++;
        break;
      }
    }

    if (!binanceWorks) {
      binanceStatus = "rate_limited";
    }

    // Determine source for remaining
    const fetchFn = binanceWorks ? fetchBinanceKlines : fetchBybitKlines;
    primarySource = binanceWorks ? "binance" : "bybit";
    const remaining = needFetch.filter((s) => !this.klinesCache.has(s) || now - this.klinesCache.get(s)!.fetchedAt >= KLINES_CACHE_TTL_MS);

    for (let i = 0; i < remaining.length; i += KLINES_CONCURRENT) {
      const chunk = remaining.slice(i, i + KLINES_CONCURRENT);
      const results = await Promise.allSettled(chunk.map(async (symbol) => {
        // Try Redis cache first
        const cached = await getRedisCandle(symbol);
        if (cached && cached.length >= 20) return { bars: cached, source: "cache" as const };
        // Fetch from exchange
        const bars = await fetchFn(symbol);
        if (bars && bars.length >= 20) {
          await setRedisCandle(symbol, bars, primarySource);
          return { bars, source: primarySource };
        }
        // Bybit fallback if Binance was primary
        if (binanceWorks) {
          const bybitBars = await fetchBybitKlines(symbol);
          if (bybitBars && bybitBars.length >= 20) {
            await setRedisCandle(symbol, bybitBars, "bybit");
            return { bars: bybitBars, source: "bybit" as const };
          }
        }
        return null;
      }));
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === "fulfilled" && result.value) {
          this.klinesCache.set(chunk[j], { bars: result.value.bars, fetchedAt: Date.now(), source: result.value.source as any });
          successCount++;
        } else {
          failCount++;
        }
      }
      await new Promise<void>((r) => setImmediate(r));
    }

    if (successCount === 0) primarySource = "none";
    return { successCount, failCount, source: primarySource, binanceStatus };
  }
}
