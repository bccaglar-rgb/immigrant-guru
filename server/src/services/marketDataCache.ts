/**
 * MarketDataCache — Redis-backed centralized market data cache.
 *
 * FAZ 1.3: Per-symbol snapshot lock (Redis SETNX) prevents duplicate REST fetches.
 * FAZ 1.4: API routes read from cache ONLY — never hit exchange REST directly.
 * FAZ 1.5: Data confidence states (verified / cached / stale / unavailable).
 * FAZ 2.1: Redis cache layer for orderbook depth, klines, tickers per symbol.
 * FAZ 2.2: Redis Pub/Sub channels for real-time market data broadcast.
 * FAZ 2.4: Tiered TTL strategy by data type.
 *
 * Architecture:
 *   Worker 0 (PRIMARY): Background ingestion loops → fetch from exchange → write to Redis cache.
 *   Workers 0-N (ALL):  Read from Redis cache. NEVER hit exchange REST for user requests.
 *
 * Redis Keys:
 *   mdc:depth:{symbol}      — Cached orderbook depth (JSON)       TTL: 10s
 *   mdc:klines:{symbol}:{tf} — Cached klines (JSON)               TTL: 30s
 *   mdc:ticker:{symbol}     — Cached ticker snapshot (JSON)        TTL: 5s
 *   mdc:signal:{symbol}     — Cached signal/trade-idea (JSON)      TTL: 2s
 *   mdc:stats:{symbol}      — Cached derivatives/stats (JSON)      TTL: 30s
 *   mdc:lock:{type}:{symbol} — Fetch lock (SETNX, 8s TTL)
 *   mdc:meta:{type}:{symbol} — Confidence metadata (JSON)          TTL: matches data TTL × 3
 *
 * Pub/Sub Channels:
 *   mdc:depth_update         — Depth updates broadcast
 *   mdc:signal_update        — Signal/trade-idea broadcast
 */

import Redis from "ioredis";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type DataConfidence = "verified" | "cached" | "stale" | "unavailable";

export interface CachedData<T> {
  data: T;
  confidence: DataConfidence;
  source: string;          // e.g. "BINANCE", "BYBIT", "WS", "CACHE"
  fetchedAt: number;       // epoch ms when data was fetched from exchange
  cachedAt: number;        // epoch ms when data was written to Redis
  ageMs: number;           // how old is this data (computed on read)
  ttlMs: number;           // configured TTL for this data type
}

export interface DepthData {
  bids: string[][];
  asks: string[][];
  source: string;
  fetchedAt: number;
}

export interface KlinesData {
  candles: Array<{
    time: number; open: number; high: number; low: number; close: number; volume: number;
  }>;
  source: string;
  fetchedAt: number;
}

export interface TickerData {
  price: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  markPrice: number | null;
  fundingRate: number | null;
  topBid: number | null;
  topAsk: number | null;
  source: string;
  fetchedAt: number;
}

// ═══════════════════════════════════════════════════════════════════
// TIERED CACHE TTLs (FAZ 2.4)
// ═══════════════════════════════════════════════════════════════════

/** TTL in milliseconds by data type. */
export const CACHE_TTL = {
  depth: 10_000,        // 10s — orderbook refreshed by background loop
  klines: 30_000,       // 30s — candles (WS kline events keep fresh)
  ticker: 5_000,        // 5s — price/change (WS pushes sub-second)
  signal: 30_000,       // 30s — trade signals from SystemScanner (15s cycle + grace)
  stats: 30_000,        // 30s — derivatives / OI / liquidation
} as const;

/** Grace multiplier — stale data served up to TTL × GRACE_MULT before "unavailable". */
const GRACE_MULT = 6;

/** Lock TTL in seconds — prevents duplicate fetches for same symbol. */
const LOCK_TTL_SEC = 8;

/** FAZ 4.2: Type-specific lock TTLs (seconds). Snapshot needs longer TTL due to rate-limited queue. */
const LOCK_TTL_BY_TYPE: Record<string, number> = {
  snapshot: 15,   // depth snapshots: serial queue with 300ms gap, can take 10s+ for batch
  klines: 12,     // kline fetches can be slow on degraded exchanges
  depth: LOCK_TTL_SEC,
  ticker: LOCK_TTL_SEC,
  stats: LOCK_TTL_SEC,
  signal: LOCK_TTL_SEC,
};

/** FAZ 4.4: Lock contention counters for monitoring. */
const lockCounters = {
  acquired: 0,      // successful lock acquisitions
  contended: 0,     // lock attempts where another worker held it (NX failed)
  released: 0,      // successful releases
  errors: 0,        // Redis errors during lock ops
};

/** FAZ 4.4: Get lock contention stats for admin monitoring. */
export function getLockStats() {
  return { ...lockCounters };
}

// ═══════════════════════════════════════════════════════════════════
// REDIS CONNECTION
// ═══════════════════════════════════════════════════════════════════

const redisOpts = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 10) return null;
    return Math.min(times * 200, 3000);
  },
  lazyConnect: false,
};

let cacheRedis: Redis | null = null;
let pubRedis: Redis | null = null;
let subRedis: Redis | null = null;

const getRedis = (): Redis => {
  if (!cacheRedis) {
    cacheRedis = new Redis(redisOpts);
    cacheRedis.on("error", (err) => {
      console.error("[MarketDataCache:cache] Redis error:", err.message);
    });
  }
  return cacheRedis;
};

const getPub = (): Redis => {
  if (!pubRedis) {
    pubRedis = new Redis(redisOpts);
    pubRedis.on("error", (err) => {
      console.error("[MarketDataCache:pub] Redis error:", err.message);
    });
  }
  return pubRedis;
};

const getSub = (): Redis => {
  if (!subRedis) {
    subRedis = new Redis(redisOpts);
    subRedis.on("error", (err) => {
      console.error("[MarketDataCache:sub] Redis error:", err.message);
    });
  }
  return subRedis;
};

// ═══════════════════════════════════════════════════════════════════
// PUB/SUB CHANNELS (FAZ 2.2)
// ═══════════════════════════════════════════════════════════════════

const DEPTH_UPDATE_CHANNEL = "mdc:depth_update";
const SIGNAL_UPDATE_CHANNEL = "mdc:signal_update";

type DepthListener = (symbol: string, data: DepthData) => void;
type SignalListener = (symbol: string, data: unknown) => void;

const depthListeners = new Set<DepthListener>();
const signalListeners = new Set<SignalListener>();
let subInitialized = false;

/** Subscribe to real-time depth updates from Redis Pub/Sub. */
export function onDepthUpdate(cb: DepthListener): () => void {
  depthListeners.add(cb);
  ensureSubListener();
  return () => depthListeners.delete(cb);
}

/** Subscribe to real-time signal updates from Redis Pub/Sub. */
export function onSignalUpdate(cb: SignalListener): () => void {
  signalListeners.add(cb);
  ensureSubListener();
  return () => signalListeners.delete(cb);
}

function ensureSubListener(): void {
  if (subInitialized) return;
  subInitialized = true;
  const sub = getSub();
  sub.subscribe(DEPTH_UPDATE_CHANNEL, SIGNAL_UPDATE_CHANNEL, (err) => {
    if (err) console.error("[MarketDataCache] Sub error:", err.message);
  });
  sub.on("message", (channel: string, message: string) => {
    try {
      const parsed = JSON.parse(message);
      if (channel === DEPTH_UPDATE_CHANNEL && depthListeners.size > 0) {
        for (const cb of depthListeners) cb(parsed.symbol, parsed.data);
      }
      if (channel === SIGNAL_UPDATE_CHANNEL && signalListeners.size > 0) {
        for (const cb of signalListeners) cb(parsed.symbol, parsed.data);
      }
    } catch { /* malformed message */ }
  });
}

// ═══════════════════════════════════════════════════════════════════
// FAZ 1.3: PER-SYMBOL SNAPSHOT LOCK
// ═══════════════════════════════════════════════════════════════════

/**
 * Try to acquire a fetch lock for a symbol.
 * Returns true if lock acquired (caller should fetch).
 * Returns false if another worker/caller is already fetching (caller should wait/use cache).
 * FAZ 4.2: Uses type-specific TTLs and tracks contention stats.
 */
export async function acquireFetchLock(type: string, symbol: string): Promise<boolean> {
  try {
    const r = getRedis();
    const key = `mdc:lock:${type}:${symbol}`;
    const ttl = LOCK_TTL_BY_TYPE[type] ?? LOCK_TTL_SEC;
    const result = await r.set(key, `${process.env.NODE_APP_INSTANCE ?? "?"}:${Date.now()}`, "EX", ttl, "NX");
    if (result === "OK") {
      lockCounters.acquired++;
      return true;
    }
    lockCounters.contended++;
    return false;
  } catch {
    lockCounters.errors++;
    return true; // on Redis error, allow fetch (fail-open)
  }
}

/** Release the fetch lock. Called after fetch completes. */
export async function releaseFetchLock(type: string, symbol: string): Promise<void> {
  try {
    const r = getRedis();
    await r.del(`mdc:lock:${type}:${symbol}`);
    lockCounters.released++;
  } catch { /* best-effort */ }
}

// ═══════════════════════════════════════════════════════════════════
// FAZ 1.5: CONFIDENCE STATE COMPUTATION
// ═══════════════════════════════════════════════════════════════════

function computeConfidence(
  fetchedAt: number | undefined,
  cachedAt: number | undefined,
  ttlMs: number,
  source: string,
): DataConfidence {
  const now = Date.now();
  if (!fetchedAt || !cachedAt) return "unavailable";

  const age = now - fetchedAt;

  // Verified: data from WS or very fresh REST (< half TTL)
  if (source.includes("WS") || age < ttlMs / 2) return "verified";

  // Cached: within normal TTL
  if (age <= ttlMs) return "cached";

  // Stale: within grace period (TTL × GRACE_MULT)
  if (age <= ttlMs * GRACE_MULT) return "stale";

  return "unavailable";
}

// ═══════════════════════════════════════════════════════════════════
// WRITE FUNCTIONS (Worker 0 only — background ingestion)
// ═══════════════════════════════════════════════════════════════════

/** Write orderbook depth to Redis cache + publish update. */
export async function writeDepth(symbol: string, data: DepthData): Promise<void> {
  try {
    const r = getRedis();
    const now = Date.now();
    const payload = JSON.stringify({ ...data, cachedAt: now });
    const ttlSec = Math.ceil(CACHE_TTL.depth * GRACE_MULT / 1000);
    await r.set(`mdc:depth:${symbol}`, payload, "EX", ttlSec);

    // Publish update for real-time subscribers (FAZ 2.2)
    try {
      const pub = getPub();
      pub.publish(DEPTH_UPDATE_CHANNEL, JSON.stringify({ symbol, data }));
    } catch { /* best-effort pub */ }
  } catch (err) {
    console.error(`[MarketDataCache] writeDepth(${symbol}) error:`, err instanceof Error ? err.message : err);
  }
}

/** Write klines to Redis cache. */
export async function writeKlines(symbol: string, tf: string, data: KlinesData): Promise<void> {
  try {
    const r = getRedis();
    const now = Date.now();
    const payload = JSON.stringify({ ...data, cachedAt: now });
    const ttlSec = Math.ceil(CACHE_TTL.klines * GRACE_MULT / 1000);
    await r.set(`mdc:klines:${symbol}:${tf}`, payload, "EX", ttlSec);
  } catch (err) {
    console.error(`[MarketDataCache] writeKlines(${symbol}:${tf}) error:`, err instanceof Error ? err.message : err);
  }
}

/** Write ticker snapshot to Redis cache. */
export async function writeTicker(symbol: string, data: TickerData): Promise<void> {
  try {
    const r = getRedis();
    const now = Date.now();
    const payload = JSON.stringify({ ...data, cachedAt: now });
    const ttlSec = Math.ceil(CACHE_TTL.ticker * GRACE_MULT / 1000);
    await r.set(`mdc:ticker:${symbol}`, payload, "EX", ttlSec);
  } catch (err) {
    console.error(`[MarketDataCache] writeTicker(${symbol}) error:`, err instanceof Error ? err.message : err);
  }
}

/** Write signal/trade-idea to Redis cache + publish update. */
export async function writeSignal(symbol: string, data: unknown): Promise<void> {
  try {
    const r = getRedis();
    const now = Date.now();
    const payload = JSON.stringify({ data, fetchedAt: now, cachedAt: now, source: "SIGNAL_ENGINE" });
    const ttlSec = Math.ceil(CACHE_TTL.signal * GRACE_MULT / 1000);
    await r.set(`mdc:signal:${symbol}`, payload, "EX", ttlSec);

    // Publish update for real-time subscribers (FAZ 2.2)
    try {
      const pub = getPub();
      pub.publish(SIGNAL_UPDATE_CHANNEL, JSON.stringify({ symbol, data }));
    } catch { /* best-effort pub */ }
  } catch (err) {
    console.error(`[MarketDataCache] writeSignal(${symbol}) error:`, err instanceof Error ? err.message : err);
  }
}

/** Write derivatives/stats to Redis cache. */
export async function writeStats(symbol: string, data: Record<string, unknown>): Promise<void> {
  try {
    const r = getRedis();
    const now = Date.now();
    const payload = JSON.stringify({ ...data, fetchedAt: now, cachedAt: now, source: "STATS" });
    const ttlSec = Math.ceil(CACHE_TTL.stats * GRACE_MULT / 1000);
    await r.set(`mdc:stats:${symbol}`, payload, "EX", ttlSec);
  } catch (err) {
    console.error(`[MarketDataCache] writeStats(${symbol}) error:`, err instanceof Error ? err.message : err);
  }
}

// ═══════════════════════════════════════════════════════════════════
// READ FUNCTIONS (ALL workers — cache-first, no exchange REST)
// ═══════════════════════════════════════════════════════════════════

/** Read orderbook depth from Redis cache with confidence metadata. */
export async function readDepth(symbol: string): Promise<CachedData<DepthData> | null> {
  try {
    const r = getRedis();
    const raw = await r.get(`mdc:depth:${symbol}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as DepthData & { cachedAt?: number };
    const now = Date.now();
    const confidence = computeConfidence(parsed.fetchedAt, parsed.cachedAt, CACHE_TTL.depth, parsed.source);

    if (confidence === "unavailable") return null;

    return {
      data: { bids: parsed.bids, asks: parsed.asks, source: parsed.source, fetchedAt: parsed.fetchedAt },
      confidence,
      source: parsed.source,
      fetchedAt: parsed.fetchedAt,
      cachedAt: parsed.cachedAt ?? now,
      ageMs: now - parsed.fetchedAt,
      ttlMs: CACHE_TTL.depth,
    };
  } catch {
    return null;
  }
}

/** Read klines from Redis cache with confidence metadata. */
export async function readKlines(symbol: string, tf: string): Promise<CachedData<KlinesData> | null> {
  try {
    const r = getRedis();
    const raw = await r.get(`mdc:klines:${symbol}:${tf}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as KlinesData & { cachedAt?: number };
    const now = Date.now();
    const confidence = computeConfidence(parsed.fetchedAt, parsed.cachedAt, CACHE_TTL.klines, parsed.source);

    if (confidence === "unavailable") return null;

    return {
      data: { candles: parsed.candles, source: parsed.source, fetchedAt: parsed.fetchedAt },
      confidence,
      source: parsed.source,
      fetchedAt: parsed.fetchedAt,
      cachedAt: parsed.cachedAt ?? now,
      ageMs: now - parsed.fetchedAt,
      ttlMs: CACHE_TTL.klines,
    };
  } catch {
    return null;
  }
}

/** Read ticker from Redis cache with confidence metadata. */
export async function readTicker(symbol: string): Promise<CachedData<TickerData> | null> {
  try {
    const r = getRedis();
    const raw = await r.get(`mdc:ticker:${symbol}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as TickerData & { cachedAt?: number };
    const now = Date.now();
    const confidence = computeConfidence(parsed.fetchedAt, parsed.cachedAt, CACHE_TTL.ticker, parsed.source);

    if (confidence === "unavailable") return null;

    return {
      data: parsed,
      confidence,
      source: parsed.source,
      fetchedAt: parsed.fetchedAt,
      cachedAt: parsed.cachedAt ?? now,
      ageMs: now - parsed.fetchedAt,
      ttlMs: CACHE_TTL.ticker,
    };
  } catch {
    return null;
  }
}

/** Read signal/trade-idea from Redis cache. */
export async function readSignal(symbol: string): Promise<CachedData<unknown> | null> {
  try {
    const r = getRedis();
    const raw = await r.get(`mdc:signal:${symbol}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { data: unknown; fetchedAt: number; cachedAt: number; source: string };
    const now = Date.now();
    const confidence = computeConfidence(parsed.fetchedAt, parsed.cachedAt, CACHE_TTL.signal, parsed.source);

    if (confidence === "unavailable") return null;

    return {
      data: parsed.data,
      confidence,
      source: parsed.source,
      fetchedAt: parsed.fetchedAt,
      cachedAt: parsed.cachedAt,
      ageMs: now - parsed.fetchedAt,
      ttlMs: CACHE_TTL.signal,
    };
  } catch {
    return null;
  }
}

/** Read derivatives/stats from Redis cache. */
export async function readStats(symbol: string): Promise<CachedData<Record<string, unknown>> | null> {
  try {
    const r = getRedis();
    const raw = await r.get(`mdc:stats:${symbol}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown> & { fetchedAt?: number; cachedAt?: number; source?: string };
    const now = Date.now();
    const confidence = computeConfidence(
      parsed.fetchedAt as number | undefined,
      parsed.cachedAt as number | undefined,
      CACHE_TTL.stats,
      (parsed.source as string) ?? "UNKNOWN",
    );

    if (confidence === "unavailable") return null;

    return {
      data: parsed,
      confidence,
      source: (parsed.source as string) ?? "UNKNOWN",
      fetchedAt: (parsed.fetchedAt as number) ?? now,
      cachedAt: (parsed.cachedAt as number) ?? now,
      ageMs: now - ((parsed.fetchedAt as number) ?? now),
      ttlMs: CACHE_TTL.stats,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// BACKGROUND DEPTH INGESTION (Worker 0 only)
// ═══════════════════════════════════════════════════════════════════

const DEPTH_SYMBOLS_KEY = "mdc:active_depth_symbols";
const DEPTH_SYMBOLS_TTL_SEC = 120; // symbols expire after 2 minutes if not re-requested

/** Default symbols always fetched (top-10 most traded). */
const DEFAULT_DEPTH_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TRXUSDT",
];

/**
 * Max symbols fetched per ingestion cycle.
 * 20 symbols × 5 weight = 100 weight/cycle. At 5s interval = 1200 weight/min budget.
 * This leaves headroom for other services.
 */
const MAX_DEPTH_SYMBOLS_PER_CYCLE = 20;

let depthIngestTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Track which symbols need depth data (called when users request via API).
 * Writes to Redis so Worker 0's ingestion loop can see it across workers.
 */
export async function requestDepthSymbol(symbol: string): Promise<void> {
  try {
    const r = getRedis();
    // Add to sorted set with current timestamp as score (for TTL-like expiry)
    await r.zadd(DEPTH_SYMBOLS_KEY, Date.now(), symbol);
    await r.expire(DEPTH_SYMBOLS_KEY, DEPTH_SYMBOLS_TTL_SEC);
  } catch { /* best-effort */ }
}

/** Remove symbol from active depth tracking. */
export async function releaseDepthSymbol(symbol: string): Promise<void> {
  try {
    const r = getRedis();
    await r.zrem(DEPTH_SYMBOLS_KEY, symbol);
  } catch { /* best-effort */ }
}

/**
 * Get symbols needing depth data (defaults + recently requested).
 * Returns at most MAX_DEPTH_SYMBOLS_PER_CYCLE symbols.
 * Defaults always included; extra slots filled by most-recently-requested.
 */
export async function getActiveDepthSymbols(): Promise<Set<string>> {
  const result = new Set<string>(DEFAULT_DEPTH_SYMBOLS);
  try {
    const r = getRedis();
    // Get most recently requested symbols (by score = timestamp, highest first)
    const cutoff = Date.now() - DEPTH_SYMBOLS_TTL_SEC * 1000;
    // Get top N most recently requested
    const members = await r.zrevrangebyscore(
      DEPTH_SYMBOLS_KEY, "+inf", cutoff,
      "LIMIT", 0, MAX_DEPTH_SYMBOLS_PER_CYCLE,
    );
    for (const m of members) {
      if (result.size >= MAX_DEPTH_SYMBOLS_PER_CYCLE) break;
      result.add(m);
    }
    // Clean up old entries periodically
    await r.zremrangebyscore(DEPTH_SYMBOLS_KEY, "-inf", cutoff);
  } catch { /* use defaults on Redis error */ }
  return result;
}

/**
 * Start background depth ingestion loop (Worker 0 ONLY).
 * Fetches depth for all active symbols every 5s via exchangeFetch.
 * Writes results to Redis cache. API routes read from cache only.
 */
export function startDepthIngestion(opts?: {
  intervalMs?: number;
  getHubDepth?: (symbol: string) => { bids: Array<{ price: number; qty: number }>; asks: Array<{ price: number; qty: number }> } | null;
  getHubAdapters?: () => Map<string, { getOrderbook?: (symbol: string) => { bids: Array<{ price: number; qty: number }>; asks: Array<{ price: number; qty: number }> } | null }>;
}): void {
  if (depthIngestTimer) return; // already running

  const intervalMs = opts?.intervalMs ?? 5_000;
  let running = false;

  const ingestAll = async () => {
    if (running) return;
    running = true;
    successCount = 0;
    const activeSymbols = await getActiveDepthSymbols();
    const symbols = [...activeSymbols];
    if (symbols.length === 0) { running = false; return; }

    // Strategy:
    // 1. Try in-memory WS orderbook FIRST (zero REST cost — already subscribed via WS)
    // 2. Only use REST for symbols without WS data (max 5 per cycle to stay within budget)
    let restFetchCount = 0;
    const MAX_REST_PER_CYCLE = 2; // reduced from 5 — WS is primary, REST only for gaps

    for (const symbol of symbols) {
      try {
        // Skip if another worker is already fetching
        const locked = await acquireFetchLock("depth", symbol);
        if (!locked) continue;

        let depthResult: DepthData | null = null;

        // SOURCE 1: In-memory WS orderbook from hub adapters (FREE — no REST call)
        if (opts?.getHubAdapters) {
          const adapters = opts.getHubAdapters();
          // Try Binance adapter first (primary data source)
          for (const name of ["BINANCE", "BYBIT", "OKX", "GATEIO"]) {
            try {
              const adapter = adapters.get(name);
              if (!adapter) continue;
              const book = adapter.getOrderbook?.(symbol);
              if (book && book.bids.length > 2) {
                depthResult = {
                  bids: book.bids.map((l) => [String(l.price), String(l.qty)]),
                  asks: book.asks.map((l) => [String(l.price), String(l.qty)]),
                  source: name,
                  fetchedAt: Date.now(),
                };
                break;
              }
            } catch { /* continue to next adapter */ }
          }
        }

        // SOURCE 2: Binance REST — DISABLED
        // market-hub is the sole depth acquisition source. Server reads from hub adapters only.
        // This eliminates duplicate REST calls that were consuming ~120 weight/min.
        // To re-enable in emergency: set ENABLE_SERVER_DEPTH_REST=true
        if (!depthResult && process.env.ENABLE_SERVER_DEPTH_REST === "true" && restFetchCount < MAX_REST_PER_CYCLE) {
          try {
            const { exchangeFetch, isExchangeAvailable } = await import("./binanceRateLimiter.ts");
            if (isExchangeAvailable("binance")) {
              restFetchCount++;
              const res = await exchangeFetch({
                url: `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=20`,
                exchange: "binance",
                priority: "normal",
                weight: 5,
                dedupKey: `mdc:depth:${symbol}:20`,
                init: { signal: AbortSignal.timeout(6_000) },
              });
              if (res.ok) {
                const json = await res.clone().json() as { bids?: string[][]; asks?: string[][] };
                if (Array.isArray(json.bids) && json.bids.length > 1) {
                  depthResult = {
                    bids: json.bids,
                    asks: json.asks ?? [],
                    source: "BINANCE",
                    fetchedAt: Date.now(),
                  };
                }
              }
            }
          } catch { /* REST failed — symbol will be retried next cycle */ }
        }

        // Write to cache + update health
        if (depthResult) {
          await writeDepth(symbol, depthResult);
          successCount++;
          // FAZ 1: Update health store
          try {
            const { marketHealth } = await import("./marketHealth.ts");
            marketHealth.updateDepth(symbol, {
              source: depthResult.source,
              levels: Math.max(depthResult.bids.length, depthResult.asks.length),
              seqSynced: true,
              wsConnected: depthResult.source.includes("WS"), // only true when data comes from WebSocket
            });
          } catch { /* health update best-effort */ }
        }

        await releaseFetchLock("depth", symbol);
      } catch (err) {
        console.error(`[DepthIngestion] ${symbol} error:`, err instanceof Error ? err.message : err);
        await releaseFetchLock("depth", symbol);
      }
    }
    // Log every 6th cycle (every 30s at 5s interval) to avoid noise
    ingestCycle++;
    if (ingestCycle % 6 === 0 || (ingestCycle <= 3)) {
      console.log(`[DepthIngestion] cycle=${ingestCycle} symbols=${symbols.length} cached=${successCount} rest=${restFetchCount} ws=${successCount - restFetchCount}`);
    }
    running = false;
  };

  let ingestCycle = 0;
  let successCount = 0;
  depthIngestTimer = setInterval(() => void ingestAll(), intervalMs);
  // Run once immediately
  void ingestAll();
  console.log(`[MarketDataCache] Depth ingestion started — interval=${intervalMs}ms, defaults=${DEFAULT_DEPTH_SYMBOLS.length} symbols`);
}

/** Stop background depth ingestion. */
export function stopDepthIngestion(): void {
  if (depthIngestTimer) {
    clearInterval(depthIngestTimer);
    depthIngestTimer = null;
    console.log("[MarketDataCache] Depth ingestion stopped");
  }
}

// ═══════════════════════════════════════════════════════════════════
// DIAGNOSTICS / ADMIN
// ═══════════════════════════════════════════════════════════════════

export interface CacheStats {
  activeDepthSymbols: number;
  depthIngestRunning: boolean;
  redisConnected: boolean;
  activeLocks: number;  // FAZ 4.4: Currently held distributed locks
}

export async function getCacheStats(): Promise<CacheStats> {
  let connected = false;
  let symbolCount = 0;
  let activeLocks = 0;
  try {
    const r = getRedis();
    const pong = await r.ping();
    connected = pong === "PONG";
    symbolCount = (await getActiveDepthSymbols()).size;
    // FAZ 4.4: Count active distributed locks
    const lockKeys = await r.keys("mdc:lock:*");
    activeLocks = lockKeys.length;
  } catch { /* not connected */ }

  return {
    activeDepthSymbols: symbolCount,
    depthIngestRunning: depthIngestTimer !== null,
    redisConnected: connected,
    activeLocks,
  };
}

/** Flush all market data cache keys (admin use only). */
export async function flushCache(): Promise<number> {
  try {
    const r = getRedis();
    const keys = await r.keys("mdc:*");
    if (keys.length === 0) return 0;
    const deleted = await r.del(...keys);
    return deleted;
  } catch {
    return 0;
  }
}
