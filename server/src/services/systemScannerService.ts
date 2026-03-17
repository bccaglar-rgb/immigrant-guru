/**
 * SystemScannerService
 *
 * Continuously scans up to 40 coins per cycle, selects the top 28 by score,
 * and distributes 7 coins each across 4 modes (FLOW, AGGRESSIVE, BALANCED, CAPITAL_GUARD).
 *
 * Per coin: picks ONE random timeframe from [3m, 5m, 15m] → 1 API call per coin.
 * Total per cycle: ~40 coins × 1 call = ~40 API calls → ~10s with concurrency 8.
 *
 * UNIVERSE: Top 300 Binance Futures coins by 24h volume, refreshed every 4 hours.
 * Enhanced scoring (volume + momentum + funding + spread + cap rank) re-calculated each cycle.
 * Top 20 by score always scanned + 20 diversity picks rotated from the rest.
 *
 * Results cached in memory so Trade Ideas page loads instantly.
 */

import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.ts";
import { redis } from "../db/redis.ts";
import type { TradeIdeaStore } from "./tradeIdeaStore.ts";
import type { TradeIdeaRecord } from "./tradeIdeaTypes.ts";
import type { ScoringMode } from "./scoringMode.ts";
import { computeEnhancedScore } from "./coinScoring.ts";
import type { CoinUniverseEngine } from "./coinUniverseEngine.ts";

const SCAN_CACHE_REDIS_KEY = "scanner:scan_cache";
const SCAN_CACHE_REDIS_TTL = 120; // 2 minutes — scanner cycles every 60s

const ALL_MODES: ScoringMode[] = ["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"];
const SYSTEM_USER_ID = "system-scanner";

type ScanCountRecord = { ts: string; counts: Record<string, number> };
const SCAN_COUNTS_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000; // keep 8 days

const UNIVERSE_SIZE = 300; // Lock top 300 Binance Futures coins
const UNIVERSE_REFRESH_MS = 4 * 60 * 60 * 1000; // Refresh universe every 4 hours
const SELECTED_COINS = 28; // 4 modes × 7 coins = 28 coins for output
const TOP_FIXED_SLOTS = 20; // Top 20 by enhanced score always scanned
const DIVERSITY_SLOTS = 20; // 20 rotated from remaining pool for diversity
const SCAN_CONCURRENCY = 4;
const SCAN_INTERVAL_MS = 60_000; // 60 seconds between cycles (was 15s — CPU relief)
const STARTUP_DELAY_MS = 20_000; // Wait for WS hubs to connect
const IDEA_MIN_SCORE_PCT = 55;
const IDEA_MIN_SCORE_BY_MODE: Record<string, number> = {
  FLOW: 58,
  AGGRESSIVE: 66,
  BALANCED: 56,
  CAPITAL_GUARD: 55,
};
const MAX_TRADE_PER_MODE: Record<string, number> = {
  FLOW: 4,
  AGGRESSIVE: 4,
  BALANCED: 8,
  CAPITAL_GUARD: 6,
};

// Stablecoins to exclude from universe
const EXCLUDED_BASE_ASSETS = new Set([
  "USDC", "FDUSD", "BUSD", "TUSD", "USDP", "DAI", "PYUSD", "EURC",
  "GUSD", "USDD", "USDE", "UST", "USTC", "FRAX", "LUSD", "SUSD",
]);

interface BinanceFuturesHub {
  getUniverseRows(): Array<{
    symbol: string;
    baseAsset: string;
    price: number;
    volume24hUsd: number;
    change24hPct: number;
    spreadBps: number | null;
    fundingRate: number | null;
  }>;
}

/** Enriched universe coin with enhanced scoring data */
interface EnhancedUniverseCoin {
  symbol: string;
  baseAsset: string;
  price: number;
  volume24hUsd: number;
  change24hPct: number;
  spreadBps: number | null;
  fundingRate: number | null;
  enhancedScore: number; // 0-100
}

export interface SystemScanResult {
  symbol: string;
  mode: ScoringMode;
  scorePct: number;
  decision: string;
  direction: string;
  tradeValidity: string;
  entryWindow: string;
  slippageRisk: string;
  setup: string;
  scannedAt: number; // ms timestamp
  // Card display fields
  entryLow: number;
  entryHigh: number;
  slLevels: number[];
  tpLevels: number[];
  horizon: string;
  timeframe: string;
  modeScores: Partial<Record<ScoringMode, number>>;
  pricePrecision?: number;
}

export interface SystemScanCache {
  results: SystemScanResult[];
  lastScanAt: number;
  universeSize: number;
  scanRound: number;
  startedAt: number; // ms timestamp — when scanner started
  totalScansByMode: Record<string, number>; // cumulative scans per mode since startup
  highScoreByMode: Record<string, number>; // scans scoring >= 70% per mode since startup
  topScoredCoins: Array<{ symbol: string; enhancedScore: number }>; // top coins by enhanced score
}

/** Internal enriched result — holds full API data so we never re-fetch */
interface EnrichedScanResult extends SystemScanResult {
  text: string;
  modeScores: Partial<Record<ScoringMode, number>>;
  entryLow: number;
  entryHigh: number;
  slLevels: number[];
  tpLevels: number[];
  horizon: "SCALP" | "INTRADAY" | "SWING";
  timeframe: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
  pricePrecision?: number;
}

interface SystemScannerDeps {
  binanceFuturesHub: BinanceFuturesHub;
  tradeIdeaStore: TradeIdeaStore;
  serverPort: number;
  coinUniverseEngine?: CoinUniverseEngine;
}

/** Raw Binance Futures 24h ticker */
interface BinanceFuturesTicker {
  symbol: string;
  quoteVolume: string; // 24h quote volume in USDT
  lastPrice: string;
  priceChangePercent: string;
}

export class SystemScannerService {
  private deps: SystemScannerDeps;
  private cache: SystemScanResult[] = [];
  private lastScanAt = 0;
  private scanRound = 0;
  private universeSize = 0;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0; // when scanner started (ms timestamp)

  // Cumulative scan count per mode since startup
  private totalScansByMode: Record<string, number> = {
    FLOW: 0, AGGRESSIVE: 0, BALANCED: 0, CAPITAL_GUARD: 0,
  };

  // Cumulative count of scans scoring >= 70% per mode since startup
  private highScoreByMode: Record<string, number> = {
    FLOW: 0, AGGRESSIVE: 0, BALANCED: 0, CAPITAL_GUARD: 0,
  };

  // Locked universe — fetched once, refreshed every 4 hours
  private lockedUniverse: string[] = [];
  private enhancedUniverse: EnhancedUniverseCoin[] = []; // Scored & sorted by enhancedScore desc
  private universeLockedAt = 0;

  // Rotation pointer — cycle through the remaining universe coins for diversity
  private rotationIndex = 0;

  // Track open ideas per mode to avoid duplicates
  private openIdeasBySymbol = new Map<string, Set<ScoringMode>>();

  constructor(deps: SystemScannerDeps) {
    this.deps = deps;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = Date.now();
    console.log(`[SystemScanner] Starting in ${STARTUP_DELAY_MS / 1000}s...`);
    this.timer = setTimeout(() => {
      console.log("[SystemScanner] Scanner active — beginning first scan cycle");
      void this.scanLoop();
    }, STARTUP_DELAY_MS);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getLatestResults(mode?: string): SystemScanResult[] {
    if (!mode) return this.cache;
    const upper = mode.toUpperCase();
    return this.cache.filter((r) => r.mode === upper);
  }

  getCache(): SystemScanCache {
    return {
      results: this.cache,
      lastScanAt: this.lastScanAt,
      universeSize: this.universeSize,
      scanRound: this.scanRound,
      startedAt: this.startedAt,
      totalScansByMode: { ...this.totalScansByMode },
      highScoreByMode: { ...this.highScoreByMode },
      topScoredCoins: this.enhancedUniverse
        .slice(0, 40)
        .map((c) => ({ symbol: c.symbol, enhancedScore: c.enhancedScore })),
    };
  }

  /** Store scan cache to Redis for cross-process sharing (scanner → market-workers). */
  private storeScanCacheToRedis(): void {
    try {
      const payload = JSON.stringify(this.getCache());
      redis.set(SCAN_CACHE_REDIS_KEY, payload, "EX", SCAN_CACHE_REDIS_TTL).catch(() => {});
    } catch {
      // best-effort
    }
  }

  /** Read scan cache from Redis (for market-workers that don't run the scanner). */
  static async readScanCacheFromRedis(): Promise<SystemScanCache | null> {
    try {
      const json = await redis.get(SCAN_CACHE_REDIS_KEY);
      if (!json) return null;
      return JSON.parse(json) as SystemScanCache;
    } catch {
      return null;
    }
  }

  /** Read persisted scan counts from PostgreSQL (for time-range filtered reports) */
  static async readScanCounts(): Promise<ScanCountRecord[]> {
    try {
      const cutoff = new Date(Date.now() - SCAN_COUNTS_MAX_AGE_MS).toISOString();
      const { rows } = await pool.query(
        `SELECT ts, counts FROM scan_counts WHERE ts >= $1 ORDER BY ts`,
        [cutoff],
      );
      return rows.map((r) => ({ ts: String(r.ts), counts: r.counts as Record<string, number> }));
    } catch {
      return [];
    }
  }

  /** Append a scan cycle record to PostgreSQL and prune old entries */
  private persistScanCycle(cycleCounts: Record<string, number>): void {
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - SCAN_COUNTS_MAX_AGE_MS).toISOString();
    // Fire-and-forget — don't block the scan loop
    pool.query(
      `INSERT INTO scan_counts (ts, counts) VALUES ($1, $2)`,
      [now, JSON.stringify(cycleCounts)],
    ).then(() =>
      pool.query(`DELETE FROM scan_counts WHERE ts < $1`, [cutoff]),
    ).catch((err) => {
      console.error("[SystemScanner] Failed to persist scan counts:", err);
    });
  }

  /** Reset all stats — counters, scan round, cache, persisted scan_counts — fresh start */
  resetStats(): void {
    this.totalScansByMode = {
      FLOW: 0, AGGRESSIVE: 0, BALANCED: 0, CAPITAL_GUARD: 0,
    };
    this.highScoreByMode = {
      FLOW: 0, AGGRESSIVE: 0, BALANCED: 0, CAPITAL_GUARD: 0,
    };
    this.startedAt = Date.now();
    this.scanRound = 0;
    this.cache = [];
    this.lastScanAt = 0;
    this.rotationIndex = 0;
    this.enhancedUniverse = [];
    this.openIdeasBySymbol.clear();
    // Also clear persisted scan_counts from PostgreSQL
    pool.query(`DELETE FROM scan_counts`).catch((err) => {
      console.error("[SystemScanner] Failed to clear scan_counts:", err);
    });
    console.log("[SystemScanner] Stats reset — counters zeroed, scan_counts cleared, fresh start");
  }

  // ---- internal ----

  /** CoinUniverseEngine is heavy (klines fetch + S/R + 6-bucket discovery).
   *  Only refresh every UNIVERSE_REFRESH_EVERY_N_CYCLES cycles to save CPU. */
  private static readonly UNIVERSE_REFRESH_EVERY_N_CYCLES = 4;

  private async scanLoop(): Promise<void> {
    if (!this.running) return;

    const cycleStart = Date.now();
    try {
      await this.ensureUniverse();

      // CoinUniverseEngine refresh: only every Nth cycle to reduce CPU load.
      // Klines are cached for 5 min anyway, so refreshing every 4 × 60s = 4 min is adequate.
      if (this.deps.coinUniverseEngine) {
        const shouldRefreshUniverse = this.scanRound % SystemScannerService.UNIVERSE_REFRESH_EVERY_N_CYCLES === 0
          || this.scanRound <= 1; // always refresh on first cycle
        if (shouldRefreshUniverse) {
          await this.deps.coinUniverseEngine.refresh();
        }
      }

      // Yield to event loop before heavy scan — let queued WS events drain
      await new Promise<void>((r) => setImmediate(r));

      await this.runFullScan();
    } catch (err) {
      console.error("[SystemScanner] Scan cycle error:", err instanceof Error ? err.message : err);
    }

    if (this.running) {
      // Schedule next cycle so total cycle time = SCAN_INTERVAL_MS (scan included)
      const elapsed = Date.now() - cycleStart;
      const delay = Math.max(2000, SCAN_INTERVAL_MS - elapsed);
      this.timer = setTimeout(() => void this.scanLoop(), delay);
      console.log(`[SystemScanner] Cycle took ${(elapsed / 1000).toFixed(1)}s, next in ${(delay / 1000).toFixed(1)}s`);
    }
  }

  /**
   * Fetch and lock the coin universe from Binance Futures REST API.
   * Top 300 coins by 24h volume. Only refreshed every 4 hours.
   */
  private async ensureUniverse(): Promise<void> {
    const now = Date.now();
    if (this.lockedUniverse.length > 0 && now - this.universeLockedAt < UNIVERSE_REFRESH_MS) {
      return; // Universe is still fresh
    }

    try {
      // Try Binance REST API first
      const enriched = await this.fetchUniverseFromBinanceRest();
      if (enriched.length >= 50) {
        this.enhancedUniverse = enriched;
        this.lockedUniverse = enriched.map((c) => c.symbol);
        this.universeSize = enriched.length;
        this.universeLockedAt = now;
        this.rotationIndex = 0;
        console.log(`[SystemScanner] Locked universe: ${enriched.length} coins from Binance Futures REST API`);
        return;
      }
    } catch (err) {
      console.error("[SystemScanner] Binance REST API failed:", err instanceof Error ? err.message : err);
    }

    // Fallback 1: fetch from market-worker HTTP API (which has live WS hub data)
    try {
      const enriched = await this.fetchUniverseFromMarketWorker();
      if (enriched.length >= 50) {
        this.enhancedUniverse = enriched;
        this.lockedUniverse = enriched.map((c) => c.symbol);
        this.universeSize = enriched.length;
        this.universeLockedAt = now;
        this.rotationIndex = 0;
        console.log(`[SystemScanner] Locked universe: ${enriched.length} coins from market-worker API (fallback)`);
        return;
      }
    } catch (err) {
      console.error("[SystemScanner] Market-worker API failed:", err instanceof Error ? err.message : err);
    }

    // Fallback 2: use WS hub data (stub returns empty in scanner-worker)
    try {
      const enriched = this.fetchUniverseFromWsHub();
      if (enriched.length >= 10) {
        this.enhancedUniverse = enriched;
        this.lockedUniverse = enriched.map((c) => c.symbol);
        this.universeSize = enriched.length;
        this.universeLockedAt = now;
        this.rotationIndex = 0;
        console.log(`[SystemScanner] Locked universe: ${enriched.length} coins from WS hub (fallback)`);
        return;
      }
    } catch {
      // ignore
    }

    if (this.lockedUniverse.length === 0) {
      console.log("[SystemScanner] No universe available yet");
    }
  }

  /**
   * Fetch top 300 Binance Futures coins by 24h volume via REST API.
   * Returns enriched coins with enhanced scoring (funding/spread null from REST).
   */
  private async fetchUniverseFromBinanceRest(): Promise<EnhancedUniverseCoin[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr", {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`Binance API ${res.status}`);

      const tickers = (await res.json()) as BinanceFuturesTicker[];
      if (!Array.isArray(tickers)) throw new Error("Invalid response");

      // Filter, sort by volume, take top 300
      const filtered = tickers
        .filter((t) => {
          if (!t.symbol || !t.symbol.endsWith("USDT")) return false;
          const base = t.symbol.replace("USDT", "");
          if (EXCLUDED_BASE_ASSETS.has(base)) return false;
          const vol = Number(t.quoteVolume);
          return Number.isFinite(vol) && vol > 0;
        })
        .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
        .slice(0, UNIVERSE_SIZE);

      return filtered.map((t) => {
        const volume24hUsd = Number(t.quoteVolume);
        const change24hPct = Number(t.priceChangePercent);
        return {
          symbol: t.symbol,
          baseAsset: t.symbol.replace("USDT", ""),
          price: Number(t.lastPrice),
          volume24hUsd,
          change24hPct,
          spreadBps: null, // not available from REST
          fundingRate: null, // not available from REST
          enhancedScore: computeEnhancedScore({
            volume24hUsd,
            absChange24hPct: Math.abs(change24hPct),
            marketCapRank: null,
            fundingRate: null,
            spreadBps: null,
          }),
        };
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fallback: get universe from market-worker's /api/market/futures-universe endpoint.
   * Market-worker has live WS hub data (BinanceFuturesHub) that scanner-worker doesn't have.
   * This works even when Binance REST API returns 418 (IP ban).
   */
  private async fetchUniverseFromMarketWorker(): Promise<EnhancedUniverseCoin[]> {
    const port = this.deps.serverPort;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/market/futures-universe`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`Market-worker API ${res.status}`);

      const data = (await res.json()) as { ok: boolean; rows: Array<{
        symbol: string; baseAsset: string; price: number;
        volume24hUsd: number; change24hPct: number;
        spreadBps: number | null; fundingRate: number | null;
      }> };

      if (!data.ok || !Array.isArray(data.rows)) throw new Error("Invalid response");

      const filtered = data.rows
        .filter((r) => {
          if (!r.symbol || !r.symbol.endsWith("USDT")) return false;
          if (EXCLUDED_BASE_ASSETS.has(r.baseAsset)) return false;
          return r.volume24hUsd > 0;
        })
        .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
        .slice(0, UNIVERSE_SIZE);

      return filtered.map((r) => ({
        symbol: r.symbol,
        baseAsset: r.baseAsset,
        price: r.price,
        volume24hUsd: r.volume24hUsd,
        change24hPct: r.change24hPct,
        spreadBps: r.spreadBps,
        fundingRate: r.fundingRate,
        enhancedScore: computeEnhancedScore({
          volume24hUsd: r.volume24hUsd,
          absChange24hPct: Math.abs(r.change24hPct),
          marketCapRank: null,
          fundingRate: r.fundingRate,
          spreadBps: r.spreadBps,
        }),
      }));
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fallback: get universe from the BinanceFuturesHub WS data.
   * Returns enriched coins with enhanced scoring from live WS data (funding + spread included).
   */
  private fetchUniverseFromWsHub(): EnhancedUniverseCoin[] {
    const rows = this.deps.binanceFuturesHub.getUniverseRows();
    return rows
      .filter((r) => !EXCLUDED_BASE_ASSETS.has(r.baseAsset))
      .map((r) => ({
        symbol: r.symbol,
        baseAsset: r.baseAsset,
        price: r.price,
        volume24hUsd: r.volume24hUsd,
        change24hPct: r.change24hPct,
        spreadBps: r.spreadBps,
        fundingRate: r.fundingRate,
        enhancedScore: computeEnhancedScore({
          volume24hUsd: r.volume24hUsd,
          absChange24hPct: Math.abs(r.change24hPct),
          marketCapRank: null,
          fundingRate: r.fundingRate,
          spreadBps: r.spreadBps,
        }),
      }))
      .sort((a, b) => b.enhancedScore - a.enhancedScore || b.volume24hUsd - a.volume24hUsd)
      .slice(0, UNIVERSE_SIZE);
  }

  /**
   * Refresh enhanced scores with latest WS hub data every cycle.
   * Universe membership stays locked (refreshed every 4h), but scores update live.
   */
  private refreshScores(): void {
    if (!this.enhancedUniverse.length) return;

    const freshRows = this.deps.binanceFuturesHub.getUniverseRows();
    const rowMap = new Map(freshRows.map((r) => [r.symbol, r]));

    for (const coin of this.enhancedUniverse) {
      const fresh = rowMap.get(coin.symbol);
      if (!fresh) continue;

      coin.volume24hUsd = fresh.volume24hUsd;
      coin.change24hPct = fresh.change24hPct;
      coin.spreadBps = fresh.spreadBps;
      coin.fundingRate = fresh.fundingRate;
      coin.price = fresh.price;
      coin.enhancedScore = computeEnhancedScore({
        volume24hUsd: fresh.volume24hUsd,
        absChange24hPct: Math.abs(fresh.change24hPct),
        marketCapRank: null,
        fundingRate: fresh.fundingRate,
        spreadBps: fresh.spreadBps,
      });
    }

    // Re-sort by enhanced score descending
    this.enhancedUniverse.sort((a, b) => b.enhancedScore - a.enhancedScore || b.volume24hUsd - a.volume24hUsd);
  }

  /**
   * Pick coins for scanning — discovery-enhanced pipeline.
   *
   * Priority order:
   *   1. Discovery shortlisted coins (6-bucket algorithm, any bucket >= 72 OR 2 buckets >= 66)
   *   2. Top by composite score (always included)
   *   3. Diversity rotation from remaining pool
   *
   * Discovery shortlist increases trade frequency 2-3x by surfacing coins
   * with specific setups (momentum, compression, S/R proximity, etc.).
   */
  private pickScoredBatch(): string[] {
    // Source: CoinUniverseEngine (primary) or own enhancedUniverse (fallback)
    let rankedSymbols: string[] = [];
    if (this.deps.coinUniverseEngine) {
      rankedSymbols = this.deps.coinUniverseEngine.getActiveSymbolsRanked();
    }
    // Fallback to own enhancedUniverse if engine has no data (e.g. scanner-worker with stub hub)
    if (!rankedSymbols.length) {
      rankedSymbols = this.enhancedUniverse.map((c) => c.symbol);
    }

    if (!rankedSymbols.length) return [];

    const batch = new Set<string>();

    // 1. Discovery shortlisted coins get priority (already ranked at top by engine)
    //    The CoinUniverseEngine sorts shortlisted coins first, so they'll be in rankedSymbols[0..N]
    //    We just need to ensure top slots include them
    const fixedCount = Math.min(TOP_FIXED_SLOTS, rankedSymbols.length);
    for (let i = 0; i < fixedCount; i++) {
      batch.add(rankedSymbols[i]);
    }

    // 2. Rotate through remaining coins for diversity
    const remaining = rankedSymbols.slice(fixedCount);
    if (remaining.length > 0) {
      const diversityCount = Math.min(DIVERSITY_SLOTS, remaining.length);
      let idx = this.rotationIndex % remaining.length;
      for (let i = 0; i < diversityCount; i++) {
        batch.add(remaining[idx % remaining.length]);
        idx++;
      }
      this.rotationIndex = idx % remaining.length;
    }

    return [...batch];
  }

  private async runFullScan(): Promise<void> {
    this.scanRound += 1;
    const round = this.scanRound;
    const t0 = Date.now();

    if (!this.lockedUniverse.length) {
      console.log(`[SystemScanner] Round ${round}: No universe available`);
      return;
    }

    // 0. Refresh scores with latest WS hub data
    this.refreshScores();

    // 1. Pick scored batch (top 20 by score + 20 diversity = ~40 coins)
    const batch = this.pickScoredBatch();
    if (!batch.length) return;

    // 2. Refresh open ideas to avoid duplicates
    await this.refreshOpenIdeas();

    // 3. Scan all symbols — 1 API call per coin (random tf from 3m/5m/15m), SCAN_CONCURRENCY in parallel
    //    Yield between batches so WS events can drain (prevents event loop starvation)
    const allResults: EnrichedScanResult[] = [];

    for (let i = 0; i < batch.length; i += SCAN_CONCURRENCY) {
      if (!this.running) break;
      const chunk = batch.slice(i, i + SCAN_CONCURRENCY);
      const batchResults = await Promise.allSettled(
        chunk.map((symbol) => this.scanSymbol(symbol)),
      );
      for (const result of batchResults) {
        if (result.status === "fulfilled" && result.value) {
          for (const scanResult of result.value) {
            allResults.push(scanResult);
          }
        }
      }
      // Yield to event loop between batches — critical for WS event draining
      await new Promise<void>((r) => setImmediate(r));
    }

    // 4. Select top 28 coins by CoinUniverseEngine composite score (or scan score fallback)
    //    CoinUniverseEngine ranking = S/R proximity + ATR + RSI + WS data
    const scannedSymbolSet = new Set(allResults.map((r) => r.symbol));
    let rankedSymbols: string[];

    if (this.deps.coinUniverseEngine) {
      // Use CoinUniverseEngine composite score order — only include coins that were scanned
      rankedSymbols = this.deps.coinUniverseEngine
        .getActiveSymbolsRanked()
        .filter((s) => scannedSymbolSet.has(s))
        .slice(0, SELECTED_COINS);
    }
    // Fallback: rank by best Quant Engine scan score (when engine has no data, e.g. scanner-worker)
    if (!rankedSymbols.length) {
      const bestScoreBySymbol = new Map<string, number>();
      for (const r of allResults) {
        const current = bestScoreBySymbol.get(r.symbol) ?? 0;
        if (r.scorePct > current) bestScoreBySymbol.set(r.symbol, r.scorePct);
      }
      rankedSymbols = [...bestScoreBySymbol.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, SELECTED_COINS)
        .map(([sym]) => sym);
    }

    const selectedSet = new Set(rankedSymbols);
    const filteredResults = allResults.filter((r) => selectedSet.has(r.symbol));

    // 5. Assign each coin to exactly ONE mode — the mode where it scores highest.
    //    Greedy assignment: highest-scoring coins pick first; max 7 per mode.
    const assigned = this.assignCoinsToBestMode(filteredResults);

    // 5b. Increment cumulative scan counts per mode + persist to disk
    const cycleCounts: Record<string, number> = {};
    for (const r of assigned) {
      this.totalScansByMode[r.mode] = (this.totalScansByMode[r.mode] ?? 0) + 1;
      cycleCounts[r.mode] = (cycleCounts[r.mode] ?? 0) + 1;
    }
    this.persistScanCycle(cycleCounts);

    // 6. Apply per-mode TRADE cap — keep only top N as TRADE, downgrade rest to WATCH
    const tradeCounts: Record<string, number> = {};
    for (const mode of ALL_MODES) {
      const cap = MAX_TRADE_PER_MODE[mode] ?? 8;
      const modeResults = assigned
        .filter((r) => r.mode === mode && r.decision === "TRADE")
        .sort((a, b) => b.scorePct - a.scorePct);
      if (modeResults.length > cap) {
        for (let j = cap; j < modeResults.length; j++) {
          modeResults[j].decision = "WATCH";
        }
      }
      tradeCounts[mode] = Math.min(modeResults.length, cap);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `[SystemScanner] Round ${round}: scanned ${batch.length} → selected ${rankedSymbols.length}/${this.lockedUniverse.length} coins in ${elapsed}s → ` +
      `FLOW ${tradeCounts.FLOW ?? 0} | AGG ${tradeCounts.AGGRESSIVE ?? 0} | BAL ${tradeCounts.BALANCED ?? 0} | CG ${tradeCounts.CAPITAL_GUARD ?? 0} TRADE`,
    );

    // 7. Sync existing trade ideas' scores FIRST (so ideas are updated before cache goes live)
    await this.syncExistingIdeaScores(assigned);

    // 8. Create trade ideas for qualifying results (using SAME data, no re-fetch)
    await this.createQualifyingIdeas(assigned);

    // 9. Replace cache with ONLY the latest 28 scanned coins (7 per mode).
    //    The scan row always shows the freshest scan results.
    this.cache = assigned.map(({ text, ...publicFields }) => publicFields);
    this.lastScanAt = Date.now();

    // 9b. Store scan cache in Redis so market-workers can serve it
    //     (scanner runs in separate process, market-workers need to read from Redis)
    this.storeScanCacheToRedis();

    // 10. Notify CoinUniverseEngine: mark selected coins for cooldown & scanner badge
    if (this.deps.coinUniverseEngine) {
      this.deps.coinUniverseEngine.markAsSentToQuant(rankedSymbols);
      this.deps.coinUniverseEngine.markScannerSelected(rankedSymbols);
    }
  }

  /**
   * Assign each coin to exactly ONE mode — the mode where it scores highest.
   *
   * Uses greedy assignment with MAX_PER_MODE=7 cap to balance across 4 modes (28 coins total).
   * Highest-scoring coins get their preferred mode first; overflow spills to second-best mode.
   *
   * This ensures:
   *   - Each coin appears in only ONE mode (no duplicates across FLOW/AGG/BAL/CG)
   *   - High-scoring coins get their best mode
   *   - All 4 modes get coins (balanced distribution)
   *   - BAL/CG get coins that actually score well in those modes
   */
  private assignCoinsToBestMode(results: EnrichedScanResult[]): EnrichedScanResult[] {
    const MAX_PER_MODE = 7;

    // Group results by symbol
    const bySymbol = new Map<string, EnrichedScanResult[]>();
    for (const r of results) {
      const arr = bySymbol.get(r.symbol) ?? [];
      arr.push(r);
      bySymbol.set(r.symbol, arr);
    }

    // Build preference list: for each coin, modes sorted by score descending
    const coinPrefs: Array<{ symbol: string; prefs: EnrichedScanResult[] }> = [];
    for (const [symbol, symbolResults] of bySymbol) {
      coinPrefs.push({ symbol, prefs: [...symbolResults].sort((a, b) => b.scorePct - a.scorePct) });
    }

    // Sort coins by best score descending — highest-scoring coins pick first
    coinPrefs.sort((a, b) => (b.prefs[0]?.scorePct ?? 0) - (a.prefs[0]?.scorePct ?? 0));

    // Greedy assignment
    const modeCounts: Record<string, number> = {};
    const assigned: EnrichedScanResult[] = [];

    for (const coin of coinPrefs) {
      for (const pref of coin.prefs) {
        const count = modeCounts[pref.mode] ?? 0;
        if (count < MAX_PER_MODE) {
          assigned.push(pref);
          modeCounts[pref.mode] = count + 1;
          break;
        }
      }
    }

    return assigned;
  }

  /**
   * Scan a single symbol: 1 API call with a randomly chosen timeframe from [3m, 5m, 15m].
   * Returns results for ALL 4 modes from that single call.
   *
   * Each coin sees a different random timeframe each cycle — over multiple cycles,
   * all timeframes get covered naturally.
   */
  private async scanSymbol(symbol: string): Promise<EnrichedScanResult[]> {
    const port = this.deps.serverPort;

    // Randomly pick ONE timeframe per coin per cycle
    const TIMEFRAME_OPTIONS: Array<{ horizon: string; timeframe: string }> = [
      { horizon: "SCALP", timeframe: "3m" },
      { horizon: "SCALP", timeframe: "5m" },
      { horizon: "INTRADAY", timeframe: "15m" },
    ];
    const pick = TIMEFRAME_OPTIONS[Math.floor(Math.random() * TIMEFRAME_OPTIONS.length)];
    const { horizon, timeframe } = pick;

    try {
      const url = `http://127.0.0.1:${port}/api/market/trade-idea?` +
        `symbol=${encodeURIComponent(symbol)}` +
        `&timeframe=${timeframe}&horizon=${horizon}&exchange=Binance` +
        `&scoring_mode=AGGRESSIVE&source=exchange&strict=0`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) return [];

      const data = await res.json() as Record<string, unknown>;
      if (!data.ok) return [];

      const modeScores = data.mode_scores as Record<string, number> | undefined;
      const modeBreakdown = data.mode_breakdown as Record<string, Record<string, unknown>> | undefined;

      // Parse shared text fields (direction, setup, etc.)
      const text = String(data.text ?? "");
      const directionMatch = text.match(/Direction:\s*(LONG|SHORT)/i);
      const direction = directionMatch?.[1]?.toUpperCase() ?? "NEUTRAL";
      const setupMatch = text.match(/Setup:\s*(.+)/i);
      const setup = setupMatch?.[1]?.trim().slice(0, 80) ?? "";
      const validityMatch = text.match(/Trade Validity:\s*(VALID|WEAK|NO-TRADE)/i);
      const tradeValidity = validityMatch?.[1]?.toUpperCase() ?? "WEAK";
      const entryMatch = text.match(/Entry Window:\s*(OPEN|NARROW|CLOSED)/i);
      const entryWindow = entryMatch?.[1]?.toUpperCase() ?? "CLOSED";
      const slipMatch = text.match(/Slippage Risk:\s*(LOW|MED|HIGH)/i);
      const slippageRisk = slipMatch?.[1]?.toUpperCase() ?? "HIGH";

      // Use S/R-based entry/SL/TP directly from API response (computed with real support/resistance)
      const apiEntryLow = Number(data.entry_low ?? 0);
      const apiEntryHigh = Number(data.entry_high ?? 0);
      const apiSlLevels = Array.isArray(data.sl_levels) ? data.sl_levels.map(Number).filter(Number.isFinite) : [];
      const apiTpLevels = Array.isArray(data.tp_levels) ? data.tp_levels.map(Number).filter(Number.isFinite) : [];
      const apiPricePrecision = Number(data.price_precision ?? 8);

      // Extract a result for EACH mode from this single API response
      const results: EnrichedScanResult[] = [];
      for (const mode of ALL_MODES) {
        const score = modeScores?.[mode] ?? 0;
        const scorePct = Math.round(score * 100);
        const breakdown = modeBreakdown?.[mode];
        const decision = String(breakdown?.decision ?? "NO_TRADE");

        // Derive tradeValidity PER MODE from the mode's own decision (not shared AGGRESSIVE-based text)
        const modeTradeValidity = decision === "TRADE" ? "VALID" : decision === "WATCH" ? "WEAK" : "NO-TRADE";

        results.push({
          symbol,
          mode,
          scorePct,
          decision,
          direction,
          tradeValidity: modeTradeValidity,
          entryWindow,
          slippageRisk,
          setup,
          scannedAt: Date.now(),
          text,
          modeScores: modeScores ?? {},
          entryLow: apiEntryLow,
          entryHigh: apiEntryHigh,
          slLevels: apiSlLevels,
          tpLevels: apiTpLevels,
          horizon: horizon as "SCALP" | "INTRADAY" | "SWING",
          timeframe: timeframe as "5m" | "15m" | "4h",
          pricePrecision: apiPricePrecision,
        });
      }
      return results;
    } catch {
      return [];
    }
  }

  private async refreshOpenIdeas(): Promise<void> {
    try {
      this.openIdeasBySymbol.clear();
      // Only check system-scanner's own open ideas — demo-user ideas should NOT block creation
      const openIdeas = await this.deps.tradeIdeaStore.listIdeas({
        userId: SYSTEM_USER_ID,
        statuses: ["PENDING", "ACTIVE"],
        limit: 5000,
      });
      for (const idea of openIdeas) {
        const modes = this.openIdeasBySymbol.get(idea.symbol) ?? new Set();
        modes.add(idea.scoring_mode as ScoringMode);
        this.openIdeasBySymbol.set(idea.symbol, modes);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Update existing open trade ideas' scores to match the latest scan.
   * This keeps the scan row and trade card always showing the same number.
   */
  private async syncExistingIdeaScores(results: EnrichedScanResult[]): Promise<void> {
    for (const result of results) {
      const openModes = this.openIdeasBySymbol.get(result.symbol);
      if (!openModes?.has(result.mode)) continue;

      // Find the existing idea and update its score
      try {
        const existing = await this.deps.tradeIdeaStore.findOpenIdea(
          SYSTEM_USER_ID,
          result.symbol,
          result.mode,
        );
        if (!existing) continue;

        // Update confidence and mode_scores to match latest scan
        await this.deps.tradeIdeaStore.updateIdea(existing.id, {
          confidence_pct: result.scorePct,
          mode_scores: result.modeScores,
        });
      } catch {
        // ignore update failures
      }
    }
  }

  /**
   * Create trade ideas from qualifying scan results.
   * Uses the SAME data from scanSymbol — NO second API call.
   */
  private async createQualifyingIdeas(results: EnrichedScanResult[]): Promise<void> {
    let created = 0;

    for (const result of results) {
      const modeMinScore = IDEA_MIN_SCORE_BY_MODE[result.mode] ?? IDEA_MIN_SCORE_PCT;
      if (result.scorePct < modeMinScore) {
        if (result.decision === "TRADE") console.log(`[SystemScanner] SKIP ${result.symbol} ${result.mode}: score ${result.scorePct}% < min ${modeMinScore}%`);
        continue;
      }
      if (result.decision !== "TRADE") continue;
      // tradeValidity is informational — don't block idea creation for qualifying TRADE decisions

      // Need valid entry/SL/TP levels
      if (!result.entryLow || !result.entryHigh) {
        console.log(`[SystemScanner] SKIP ${result.symbol} ${result.mode} ${result.scorePct}%: missing entry (low=${result.entryLow}, high=${result.entryHigh})`);
        continue;
      }
      if (!result.slLevels.length || !result.tpLevels.length) {
        console.log(`[SystemScanner] SKIP ${result.symbol} ${result.mode} ${result.scorePct}%: missing SL(${result.slLevels.length}) or TP(${result.tpLevels.length})`);
        continue;
      }

      // Skip if already has an open idea for this symbol+mode
      const openModes = this.openIdeasBySymbol.get(result.symbol);
      if (openModes?.has(result.mode)) {
        console.log(`[SystemScanner] SKIP ${result.symbol} ${result.mode} ${result.scorePct}%: already open`);
        continue;
      }

      console.log(`[SystemScanner] CREATING ${result.symbol} ${result.mode} ${result.scorePct}% ${result.direction}`);
      try {
        const approvedModes = Object.entries(result.modeScores)
          .filter(([, v]) => (v ?? 0) * 100 >= IDEA_MIN_SCORE_PCT)
          .map(([k]) => k as ScoringMode);
        if (!approvedModes.includes(result.mode)) approvedModes.push(result.mode);

        const nowIso = new Date().toISOString();
        const tfMinutes = result.timeframe === "5m" ? 5 : result.timeframe === "4h" ? 240 : 15;
        const validUntilBars = result.horizon === "SCALP" ? 12 : result.horizon === "SWING" ? 6 : 16;
        const validUntilUtc = new Date(Date.now() + tfMinutes * validUntilBars * 60_000).toISOString();

        // Build a full TradeIdeaRecord using the SAME scorePct from scanSymbol
        const idea: TradeIdeaRecord = {
          id: randomUUID(),
          user_id: SYSTEM_USER_ID,
          symbol: result.symbol,
          direction: result.direction as "LONG" | "SHORT",
          confidence_pct: result.scorePct, // same value as scan cache
          scoring_mode: result.mode,
          approved_modes: approvedModes,
          mode_scores: result.modeScores,
          entry_low: Math.min(result.entryLow, result.entryHigh),
          entry_high: Math.max(result.entryLow, result.entryHigh),
          sl_levels: result.slLevels,
          tp_levels: result.tpLevels,
          status: "PENDING",
          created_at: nowIso,
          activated_at: null,
          resolved_at: null,
          result: "NONE",
          hit_level_type: null,
          hit_level_index: null,
          hit_level_price: null,
          minutes_to_entry: null,
          minutes_to_exit: null,
          minutes_total: null,
          horizon: result.horizon,
          timeframe: result.timeframe,
          setup: result.setup || "System Scanner",
          trade_validity: result.tradeValidity as "VALID" | "WEAK" | "NO-TRADE",
          entry_window: result.entryWindow as "OPEN" | "NARROW" | "CLOSED",
          slippage_risk: result.slippageRisk as "LOW" | "MED" | "HIGH",
          triggers_to_activate: [],
          invalidation: "",
          timestamp_utc: nowIso,
          valid_until_bars: validUntilBars,
          valid_until_utc: validUntilUtc,
          market_state: { trend: "", htfBias: "", volatility: "", execution: "" },
          flow_analysis: [],
          trade_intent: [],
          raw_text: result.text,
          incomplete: false,
          price_precision: result.pricePrecision,
        };

        const initialPrice = Number(((idea.entry_low + idea.entry_high) / 2).toFixed(8));
        await this.deps.tradeIdeaStore.createIdea(idea, initialPrice);
        created += 1;
        // Increment highScoreByMode only when a real trade idea is created
        this.highScoreByMode[result.mode] = (this.highScoreByMode[result.mode] ?? 0) + 1;

        // Track as open
        const modes = this.openIdeasBySymbol.get(result.symbol) ?? new Set();
        modes.add(result.mode);
        this.openIdeasBySymbol.set(result.symbol, modes);
      } catch (err) {
        console.error(`[SystemScanner] FAIL createIdea ${result.symbol} ${result.mode}:`, err instanceof Error ? err.message : err);
      }
    }

    if (created > 0) {
      console.log(`[SystemScanner] Created ${created} new trade ideas`);
    }
  }
}
