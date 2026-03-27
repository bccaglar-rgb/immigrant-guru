/**
 * Trade Idea Reconciler — retroactively checks EXPIRED ideas against historical candle data.
 *
 * When the SystemScanner auto-expires an idea (score dropped), it doesn't check if entry/TP/SL
 * was actually hit. This reconciler fetches 1m candles and replays the idea lifecycle to determine
 * the correct result: SUCCESS, FAIL, or truly EXPIRED (no entry within TTL).
 *
 * Also used by the auto-expire path to check candles BEFORE expiring an idea.
 */

import { isEntryTouched, resolveFirstHitFromRange, minutesBetween } from "./tradeIdeaLogic.ts";
import type { TradeIdeaRecord } from "./tradeIdeaTypes.ts";
import type { TradeIdeaStore } from "./tradeIdeaStore.ts";
import { exchangeFetch, isExchangeAvailable } from "./binanceRateLimiter.ts";

const PREFIX = "[TradeIdeaReconciler]";

const FETCH_TIMEOUT_MS = 5000;

interface PriceCandle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ReconcileResult {
  ideaId: string;
  symbol: string;
  oldResult: string;
  newResult: string;
  newStatus: string;
  hitType?: string;
  hitIndex?: number;
  hitPrice?: number;
  candleCount: number;
}

// ── Candle Fetchers ──────────────────────────────────────────────────

const BINANCE_FUTURES_BASES = [
  "https://fapi.binance.com",
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
];

const fetchJson = async <T>(url: string): Promise<T | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const fetchBinanceFuturesKlines = async (symbol: string, startMs: number, endMs: number, interval = "5m", limit = 1000): Promise<PriceCandle[]> => {
  if (!isExchangeAvailable("binance")) return [];
  try {
    const res = await exchangeFetch({
      url: `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&startTime=${Math.floor(startMs)}&endTime=${Math.floor(endMs)}&limit=${limit}`,
      exchange: "binance", priority: "low", weight: 10,
      dedupKey: `reconciler-klines:${symbol}:${interval}:${startMs}`,
      init: { signal: AbortSignal.timeout(8_000) },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as Array<[number, string, string, string, string]>;
    if (!Array.isArray(body) || body.length === 0) return [];
    return body
      .map((row) => ({ ts: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]) }))
      .filter((r) => Number.isFinite(r.ts) && Number.isFinite(r.open) && Number.isFinite(r.high) && Number.isFinite(r.low) && Number.isFinite(r.close))
      .sort((a, b) => a.ts - b.ts);
  } catch { return []; }
};

const fetchBybitKlines = async (symbol: string, startMs: number, endMs: number): Promise<PriceCandle[]> => {
  const body = await fetchJson<{ result?: { list?: Array<[string, string, string, string, string]> } }>(
    `https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=5&start=${Math.floor(startMs)}&end=${Math.floor(endMs)}&limit=1000`,
  );
  const list = Array.isArray(body?.result?.list) ? body!.result!.list : [];
  return list
    .map((row) => ({ ts: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]) }))
    .filter((r) => Number.isFinite(r.ts) && Number.isFinite(r.open) && Number.isFinite(r.high) && Number.isFinite(r.low) && Number.isFinite(r.close))
    .sort((a, b) => a.ts - b.ts);
};

const fetchBinanceSpotKlines = async (symbol: string, startMs: number, endMs: number): Promise<PriceCandle[]> => {
  if (!isExchangeAvailable("binance")) return [];
  try {
    const res = await exchangeFetch({
      url: `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=5m&startTime=${Math.floor(startMs)}&endTime=${Math.floor(endMs)}&limit=1000`,
      exchange: "binance", priority: "low", weight: 2,
      init: { signal: AbortSignal.timeout(8_000) },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as Array<[number, string, string, string, string]>;
    if (!Array.isArray(body)) return [];
    return body
      .map((row) => ({ ts: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]) }))
      .filter((r) => Number.isFinite(r.ts) && Number.isFinite(r.open) && Number.isFinite(r.high) && Number.isFinite(r.low) && Number.isFinite(r.close))
      .sort((a, b) => a.ts - b.ts);
  } catch { return []; }
};

/**
 * Fetch 5m candles for a symbol covering the given time range.
 * For ranges > 5000 minutes (~3.5 days), fetches in chunks.
 * Tries Binance Futures → Bybit → Binance Spot in parallel.
 */
async function fetchCandles(symbol: string, startMs: number, endMs: number): Promise<PriceCandle[]> {
  const MAX_CANDLES_PER_CALL = 1000;
  const CANDLE_MS = 5 * 60 * 1000; // 5m

  // If the range is small enough for a single call, fire all sources in parallel
  const rangeMs = endMs - startMs;
  const estimatedCandles = Math.ceil(rangeMs / CANDLE_MS);

  if (estimatedCandles <= MAX_CANDLES_PER_CALL) {
    const results = await Promise.allSettled([
      fetchBinanceFuturesKlines(symbol, startMs, endMs),
      fetchBybitKlines(symbol, startMs, endMs),
      fetchBinanceSpotKlines(symbol, startMs, endMs),
    ]);
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.length > 0) return r.value;
    }
    return [];
  }

  // Chunk the range for large periods
  const allCandles: PriceCandle[] = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const chunkEnd = Math.min(cursor + MAX_CANDLES_PER_CALL * CANDLE_MS, endMs);
    const results = await Promise.allSettled([
      fetchBinanceFuturesKlines(symbol, cursor, chunkEnd),
      fetchBybitKlines(symbol, cursor, chunkEnd),
      fetchBinanceSpotKlines(symbol, cursor, chunkEnd),
    ]);
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.length > 0) {
        allCandles.push(...r.value);
        break;
      }
    }
    cursor = chunkEnd;
  }

  // Deduplicate by timestamp
  const seen = new Set<number>();
  return allCandles
    .filter((c) => { if (seen.has(c.ts)) return false; seen.add(c.ts); return true; })
    .sort((a, b) => a.ts - b.ts);
}

const isEntryTouchedByRange = (entryLow: number, entryHigh: number, candleLow: number, candleHigh: number): boolean => {
  const low = Math.min(entryLow, entryHigh);
  const high = Math.max(entryLow, entryHigh);
  return candleHigh >= low && candleLow <= high;
};

// ── Core Reconciliation Logic ────────────────────────────────────────

/**
 * Given an idea and its historical candles, determine the TRUE result.
 * Returns null if candles confirm it's genuinely expired (no entry/TP/SL hit).
 */
function reconcileIdeaFromCandles(
  idea: TradeIdeaRecord,
  candles: PriceCandle[],
): { result: "SUCCESS" | "FAIL"; hitType: "TP" | "SL"; hitIndex: number; hitPrice: number; activatedAt: string; resolvedAt: string } | null {
  if (!candles.length) return null;

  let prevPrice: number = candles[0].open;
  let isActive = idea.status === "ACTIVE";
  let activatedAt = idea.activated_at ?? "";

  for (const candle of candles) {
    const currentPrice = candle.close;
    const candleIso = new Date(candle.ts).toISOString();

    if (!isActive) {
      // PENDING: check if entry zone was touched by this candle
      const touched =
        isEntryTouchedByRange(idea.entry_low, idea.entry_high, candle.low, candle.high) ||
        isEntryTouched(prevPrice, currentPrice, idea.entry_low, idea.entry_high);

      if (touched) {
        isActive = true;
        activatedAt = candleIso;
      } else {
        // Check if TP/SL hit directly (price jumped past entry to TP/SL)
        const directHit = resolveFirstHitFromRange(
          idea.direction, idea.tp_levels, idea.sl_levels,
          prevPrice, candle.low, candle.high, currentPrice,
        );
        if (directHit) {
          return {
            result: directHit.type === "TP" ? "SUCCESS" : "FAIL",
            hitType: directHit.type,
            hitIndex: directHit.index,
            hitPrice: directHit.price,
            activatedAt: candleIso,
            resolvedAt: candleIso,
          };
        }
        prevPrice = currentPrice;
        continue;
      }
    }

    // ACTIVE: check if TP or SL was hit
    if (isActive) {
      const hit = resolveFirstHitFromRange(
        idea.direction, idea.tp_levels, idea.sl_levels,
        prevPrice, candle.low, candle.high, currentPrice,
      );
      if (hit) {
        return {
          result: hit.type === "TP" ? "SUCCESS" : "FAIL",
          hitType: hit.type,
          hitIndex: hit.index,
          hitPrice: hit.price,
          activatedAt,
          resolvedAt: candleIso,
        };
      }
    }

    prevPrice = currentPrice;
  }

  return null; // No hit found — genuinely expired
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Reconcile a single idea against historical candle data.
 * Used by:
 * - Auto-expire path (check before expiring)
 * - Admin reconcile endpoint (fix existing EXPIRED ideas)
 */
export async function reconcileSingleIdea(
  idea: TradeIdeaRecord,
  store: TradeIdeaStore,
): Promise<ReconcileResult | null> {
  const startMs = new Date(idea.created_at).getTime();
  const endMs = idea.resolved_at ? new Date(idea.resolved_at).getTime() : Date.now();

  if (!Number.isFinite(startMs) || endMs <= startMs) return null;

  const candles = await fetchCandles(idea.symbol, startMs, endMs);
  if (!candles.length) {
    return {
      ideaId: idea.id, symbol: idea.symbol,
      oldResult: idea.result, newResult: idea.result,
      newStatus: idea.status, candleCount: 0,
    };
  }

  const reconciled = reconcileIdeaFromCandles(idea, candles);
  if (!reconciled) {
    // Candles confirm: no entry/TP/SL hit → genuinely expired, no change
    return {
      ideaId: idea.id, symbol: idea.symbol,
      oldResult: idea.result, newResult: idea.result,
      newStatus: idea.status, candleCount: candles.length,
    };
  }

  // Found a real result — update the idea
  const minutesToEntry = minutesBetween(idea.created_at, reconciled.activatedAt);
  const minutesToExit = minutesBetween(reconciled.activatedAt, reconciled.resolvedAt);
  const minutesTotal = minutesBetween(idea.created_at, reconciled.resolvedAt);

  await store.updateIdea(idea.id, {
    status: "RESOLVED",
    result: reconciled.result,
    activated_at: reconciled.activatedAt,
    resolved_at: reconciled.resolvedAt,
    hit_level_type: reconciled.hitType,
    hit_level_index: reconciled.hitIndex,
    hit_level_price: reconciled.hitPrice,
    minutes_to_entry: minutesToEntry,
    minutes_to_exit: minutesToExit,
    minutes_total: minutesTotal,
  });

  await store.appendEvent({
    idea_id: idea.id,
    event_type: reconciled.hitType === "TP" ? "TP_HIT" : "SL_HIT",
    ts: reconciled.resolvedAt,
    price: reconciled.hitPrice,
    meta: {
      level_type: reconciled.hitType,
      level_index: reconciled.hitIndex,
      level_price: reconciled.hitPrice,
      reconciled: true,
    },
  });

  return {
    ideaId: idea.id, symbol: idea.symbol,
    oldResult: idea.result, newResult: reconciled.result,
    newStatus: "RESOLVED",
    hitType: reconciled.hitType,
    hitIndex: reconciled.hitIndex,
    hitPrice: reconciled.hitPrice,
    candleCount: candles.length,
  };
}

/**
 * Reconcile all EXPIRED ideas in the database.
 * Processes in batches to avoid overwhelming exchange APIs.
 */
export async function reconcileAllExpired(
  store: TradeIdeaStore,
  options?: { batchSize?: number; delayMs?: number; userId?: string },
): Promise<{ total: number; updated: number; results: ReconcileResult[] }> {
  const batchSize = options?.batchSize ?? 5;
  const delayMs = options?.delayMs ?? 1000;
  const allIdeas = await store.listIdeas({ userId: options?.userId, limit: 10000 });
  const expired = allIdeas.filter((i) => i.result === "EXPIRED");

  console.log(`${PREFIX} Starting reconciliation of ${expired.length} EXPIRED ideas (batch=${batchSize}, delay=${delayMs}ms)`);

  const results: ReconcileResult[] = [];
  let updated = 0;

  for (let i = 0; i < expired.length; i += batchSize) {
    const batch = expired.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((idea) => reconcileSingleIdea(idea, store)),
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value) {
        results.push(r.value);
        if (r.value.oldResult !== r.value.newResult) {
          updated++;
          console.log(`${PREFIX} ${r.value.symbol}: ${r.value.oldResult} → ${r.value.newResult} (${r.value.hitType}${r.value.hitIndex} @ ${r.value.hitPrice})`);
        }
      }
    }

    // Rate limiting between batches
    if (i + batchSize < expired.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if ((i + batchSize) % 50 === 0 || i + batchSize >= expired.length) {
      console.log(`${PREFIX} Progress: ${Math.min(i + batchSize, expired.length)}/${expired.length} processed, ${updated} updated`);
    }
  }

  console.log(`${PREFIX} Done: ${expired.length} total, ${updated} updated`);
  return { total: expired.length, updated, results };
}

/**
 * Quick check: should this idea be auto-expired or does candle data show a real result?
 * Returns the reconciled result or null if genuinely should expire.
 * Used by systemScannerService before setting result='EXPIRED'.
 */
export async function checkBeforeExpire(idea: TradeIdeaRecord): Promise<{
  result: "SUCCESS" | "FAIL";
  hitType: "TP" | "SL";
  hitIndex: number;
  hitPrice: number;
  activatedAt: string;
  resolvedAt: string;
} | null> {
  const startMs = new Date(idea.created_at).getTime();
  const endMs = Date.now();

  if (!Number.isFinite(startMs) || endMs <= startMs) return null;

  const candles = await fetchCandles(idea.symbol, startMs, endMs);
  if (!candles.length) return null;

  return reconcileIdeaFromCandles(idea, candles);
}
