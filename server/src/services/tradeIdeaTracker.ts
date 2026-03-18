import { isEntryMissed, isEntryTouched, minutesBetween, resolveFirstHit, resolveFirstHitFromRange } from "./tradeIdeaLogic.ts";
import { TradeIdeaStore } from "./tradeIdeaStore.ts";
import type { TradeIdeaRecord } from "./tradeIdeaTypes.ts";
import { redis } from "../db/redis.ts";

type Horizon = TradeIdeaRecord["horizon"];

const DEFAULT_PENDING_TTL_MINUTES: Record<Horizon, number> = {
  SCALP: 60,
  INTRADAY: 60,
  SWING: 240,
};

interface PriceCandle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const BINANCE_FUTURES_BASES = [
  "https://fapi.binance.com",
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi3.binance.com",
  "https://fapi4.binance.com",
];
const GATE_FUTURES_BASE = "https://fx-api.gateio.ws/api/v4";

const FETCH_TIMEOUT_MS = 5000;

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

const fetchBinanceFuturesJson = async <T>(path: string): Promise<T | null> => {
  // Fire all bases in parallel and return first successful result
  const results = await Promise.allSettled(
    BINANCE_FUTURES_BASES.map((base) => fetchJson<T>(`${base}${path}`)),
  );
  for (const result of results) {
    if (result.status === "fulfilled" && result.value !== null) return result.value;
  }
  return null;
};

const parseBaseQuote = (symbol: string): { base: string; quote: string } | null => {
  const normalized = symbol.toUpperCase().replace("/", "").trim();
  for (const quote of ["USDT", "USDC", "BUSD", "USD"]) {
    if (normalized.endsWith(quote) && normalized.length > quote.length) {
      return {
        base: normalized.slice(0, -quote.length),
        quote,
      };
    }
  }
  return null;
};

const fetchFromBinanceSpot = async (symbol: string): Promise<number | null> => {
  const body = await fetchJson<{ price?: string }>(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
  const price = Number(body?.price);
  return Number.isFinite(price) ? price : null;
};

const fetchFromBinanceFutures = async (symbol: string): Promise<number | null> => {
  const body = await fetchBinanceFuturesJson<{ price?: string }>(`/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`);
  const price = Number(body?.price);
  return Number.isFinite(price) ? price : null;
};

const fetchFromBybit = async (symbol: string): Promise<number | null> => {
  const body = await fetchJson<{ result?: { list?: Array<{ lastPrice?: string }> } }>(
    `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`,
  );
  const price = Number(body?.result?.list?.[0]?.lastPrice);
  return Number.isFinite(price) ? price : null;
};

const fetchFromOkx = async (symbol: string): Promise<number | null> => {
  const pair = parseBaseQuote(symbol);
  if (!pair) return null;
  const instId = `${pair.base}-${pair.quote}-SWAP`;
  const body = await fetchJson<{ data?: Array<{ last?: string }> }>(
    `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`,
  );
  const price = Number(body?.data?.[0]?.last);
  return Number.isFinite(price) ? price : null;
};

const fetchFromGate = async (symbol: string): Promise<number | null> => {
  const pair = parseBaseQuote(symbol);
  if (!pair) return null;
  if (pair.quote !== "USDT") return null;
  const contract = `${pair.base}_${pair.quote}`;
  const body = await fetchJson<unknown>(
    `${GATE_FUTURES_BASE}/futures/usdt/tickers?contract=${encodeURIComponent(contract)}`,
  );
  const rows = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { data?: unknown[] }).data)
      ? (body as { data: unknown[] }).data
      : [];
  const row = rows[0] as Record<string, unknown> | undefined;
  const price = Number(row?.last ?? row?.last_price ?? row?.mark_price ?? 0);
  return Number.isFinite(price) ? price : null;
};

const fetchHistoryFromBinanceSpot = async (symbol: string, startMs: number, endMs: number): Promise<PriceCandle[]> => {
  const body = await fetchJson<Array<[number, string, string, string, string]>>(
    `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&startTime=${Math.floor(startMs)}&endTime=${Math.floor(endMs)}&limit=1000`,
  );
  if (!Array.isArray(body)) return [];
  return body
    .map((row) => ({
      ts: Number(row?.[0]),
      open: Number(row?.[1]),
      high: Number(row?.[2]),
      low: Number(row?.[3]),
      close: Number(row?.[4]),
    }))
    .filter((row) => Number.isFinite(row.ts) && Number.isFinite(row.open) && Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close))
    .sort((a, b) => a.ts - b.ts);
};

const fetchHistoryFromBinanceFutures = async (symbol: string, startMs: number, endMs: number): Promise<PriceCandle[]> => {
  const body = await fetchBinanceFuturesJson<Array<[number, string, string, string, string]>>(
    `/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&startTime=${Math.floor(startMs)}&endTime=${Math.floor(endMs)}&limit=1000`,
  );
  if (!Array.isArray(body)) return [];
  return body
    .map((row) => ({
      ts: Number(row?.[0]),
      open: Number(row?.[1]),
      high: Number(row?.[2]),
      low: Number(row?.[3]),
      close: Number(row?.[4]),
    }))
    .filter((row) => Number.isFinite(row.ts) && Number.isFinite(row.open) && Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close))
    .sort((a, b) => a.ts - b.ts);
};

const fetchHistoryFromBybit = async (symbol: string, startMs: number, endMs: number): Promise<PriceCandle[]> => {
  const body = await fetchJson<{ result?: { list?: Array<[string, string, string, string, string]> } }>(
    `https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=1&start=${Math.floor(startMs)}&end=${Math.floor(endMs)}&limit=1000`,
  );
  const list = Array.isArray(body?.result?.list) ? body.result!.list : [];
  return list
    .map((row) => ({
      ts: Number(row?.[0]),
      open: Number(row?.[1]),
      high: Number(row?.[2]),
      low: Number(row?.[3]),
      close: Number(row?.[4]),
    }))
    .filter((row) => Number.isFinite(row.ts) && Number.isFinite(row.open) && Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close))
    .sort((a, b) => a.ts - b.ts);
};

const fetchSymbolHistory = async (symbol: string, startMs: number, endMs: number): Promise<PriceCandle[]> => {
  const safeEnd = Number.isFinite(endMs) ? Math.floor(endMs) : Date.now();
  const safeStart = Number.isFinite(startMs) ? Math.max(0, Math.floor(startMs)) : Math.max(0, safeEnd - 6 * 60 * 60 * 1000);
  const fetchers: Array<(s: string, start: number, end: number) => Promise<PriceCandle[]>> = [
    fetchHistoryFromBinanceFutures,
    fetchHistoryFromBybit,
    fetchHistoryFromBinanceSpot,
  ];
  // Fire all in parallel, return first non-empty result
  const results = await Promise.allSettled(fetchers.map((f) => f(symbol, safeStart, safeEnd)));
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.length > 0) return result.value;
  }
  return [];
};

const isEntryTouchedByRange = (entryLow: number, entryHigh: number, candleLow: number, candleHigh: number): boolean => {
  const low = Math.min(entryLow, entryHigh);
  const high = Math.max(entryLow, entryHigh);
  return candleHigh >= low && candleLow <= high;
};

/**
 * Race all exchange fetchers in parallel — return the first valid price.
 * This avoids sequential 5s timeouts when some exchanges are unreachable (e.g. Binance 403).
 */
const fetchSymbolPrice = async (symbol: string): Promise<number | null> => {
  const fetchers: Array<(s: string) => Promise<number | null>> = [
    fetchFromBinanceFutures,
    fetchFromBinanceSpot,
    fetchFromBybit,
    fetchFromOkx,
    fetchFromGate,
  ];

  // Fire all in parallel — first one to resolve with a valid price wins
  const results = await Promise.allSettled(fetchers.map((f) => f(symbol)));
  for (const result of results) {
    if (result.status === "fulfilled" && typeof result.value === "number" && Number.isFinite(result.value)) {
      return result.value;
    }
  }
  return null;
};

/**
 * Bulk-fetch live prices for many symbols from Redis (hub:live:{symbol} hashes).
 * Worker 0 writes these every 10s from BinanceFuturesHub via HubEventBridge.
 * This is MUCH faster than making 5 REST API calls per symbol — one Redis pipeline
 * for all symbols takes <50ms vs 5-60s for REST APIs.
 *
 * Returns a Map of symbol → price. Symbols not in Redis are returned in the
 * `missing` set so the caller can fall back to REST for those.
 */
const bulkFetchPricesFromRedis = async (symbols: string[]): Promise<{ prices: Map<string, number>; missing: string[] }> => {
  const prices = new Map<string, number>();
  const missing: string[] = [];
  if (!symbols.length) return { prices, missing };

  try {
    const pipeline = redis.pipeline();
    for (const symbol of symbols) {
      pipeline.hget(`hub:live:${symbol}`, "lastTradePrice");
    }
    const results = await pipeline.exec();
    if (!results) return { prices, missing: [...symbols] };

    for (let i = 0; i < symbols.length; i++) {
      const result = results[i];
      if (result && !result[0] && result[1]) {
        const price = Number(result[1]);
        if (Number.isFinite(price) && price > 0) {
          prices.set(symbols[i], price);
          continue;
        }
      }
      missing.push(symbols[i]);
    }
  } catch {
    return { prices, missing: [...symbols] };
  }
  return { prices, missing };
};

export class TradeIdeaTracker {
  private timer: NodeJS.Timeout | null = null;

  private running = false;

  private processing = false;

  private lastPriceByIdeaId = new Map<string, number>();

  private readonly store: TradeIdeaStore;

  private readonly options?: {
    pollMs?: number;
    pendingTtlMinutes?: Partial<Record<Horizon, number>>;
  };

  /** Callback fired when a trade idea is resolved (win/loss) */
  onResolve: ((idea: any) => void) | null = null;

  constructor(
    store: TradeIdeaStore,
    options?: {
      pollMs?: number;
      pendingTtlMinutes?: Partial<Record<Horizon, number>>;
    },
  ) {
    this.store = store;
    this.options = options;

    // Monkey-patch store.updateIdea to fire onResolve callback
    const originalUpdate = store.updateIdea.bind(store);
    store.updateIdea = async (id: string, updates: any) => {
      await originalUpdate(id, updates);
      if (updates?.status === "RESOLVED" && this.onResolve) {
        try { this.onResolve({ id, ...updates }); } catch { /* ignore */ }
      }
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.reconcileHistoryOnStartup();
    const pollMs = Math.max(5000, this.options?.pollMs ?? 10_000);
    this.timer = setInterval(() => {
      void this.tick();
    }, pollMs);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private ttlMinutes(horizon: Horizon) {
    return this.options?.pendingTtlMinutes?.[horizon] ?? DEFAULT_PENDING_TTL_MINUTES[horizon];
  }

  private async reconcileIdeaWithHistory(idea: TradeIdeaRecord, candles: PriceCandle[]) {
    if (!candles.length) return;
    let prevPrice = this.lastPriceByIdeaId.get(idea.id);
    if (!(typeof prevPrice === "number" && Number.isFinite(prevPrice))) {
      prevPrice = candles[0].open;
    }

    for (const candle of candles) {
      const currentPrice = candle.close;
      const candleIso = new Date(candle.ts).toISOString();

      if (idea.status === "PENDING") {
        const ttl = this.ttlMinutes(idea.horizon);
        const ageMin = minutesBetween(idea.created_at, candleIso);
        if (typeof ageMin === "number" && ageMin > ttl) {
          await this.store.updateIdea(idea.id, {
            status: "RESOLVED",
            resolved_at: candleIso,
            result: "FAIL",
            minutes_total: ageMin,
          });
          await this.store.appendEvent({
            idea_id: idea.id,
            event_type: "RESOLVED",
            ts: candleIso,
            price: currentPrice,
            meta: { reason: "ENTRY_TTL_EXPIRED", ttl_minutes: ttl, backfill: true },
          });
          this.lastPriceByIdeaId.delete(idea.id);
          return;
        }

        const touched =
          isEntryTouchedByRange(idea.entry_low, idea.entry_high, candle.low, candle.high) ||
          isEntryTouched(prevPrice, currentPrice, idea.entry_low, idea.entry_high);

        if (touched) {
          const minutesToEntry = minutesBetween(idea.created_at, candleIso);
          await this.store.updateIdea(idea.id, {
            status: "ACTIVE",
            activated_at: candleIso,
            minutes_to_entry: minutesToEntry,
          });
          await this.store.appendEvent({
            idea_id: idea.id,
            event_type: "ENTRY_TOUCHED",
            ts: candleIso,
            price: currentPrice,
            meta: {
              entry_low: idea.entry_low,
              entry_high: idea.entry_high,
              backfill: true,
            },
          });
          idea.status = "ACTIVE";
          idea.activated_at = candleIso;
        } else {
          const pendingLevelHit = resolveFirstHitFromRange(
            idea.direction,
            idea.tp_levels,
            idea.sl_levels,
            prevPrice,
            candle.low,
            candle.high,
            currentPrice,
          );
          if (pendingLevelHit) {
            const minutesTotal = minutesBetween(idea.created_at, candleIso);
            const pendingResult = pendingLevelHit.type === "TP" ? "SUCCESS" : "FAIL";
          await this.store.updateIdea(idea.id, {
            status: "RESOLVED",
            activated_at: candleIso,
            resolved_at: candleIso,
            result: pendingResult,
            hit_level_type: pendingLevelHit.type,
            hit_level_index: pendingLevelHit.index,
            hit_level_price: pendingLevelHit.price,
            minutes_to_entry: minutesTotal,
            minutes_to_exit: 0,
            minutes_total: minutesTotal,
          });
            await this.store.appendEvent({
              idea_id: idea.id,
              event_type: pendingLevelHit.type === "TP" ? "TP_HIT" : "SL_HIT",
              ts: candleIso,
              price: currentPrice,
              meta: {
                reason: "PENDING_LEVEL_HIT",
                level_type: pendingLevelHit.type,
                level_index: pendingLevelHit.index,
                level_price: pendingLevelHit.price,
                backfill: true,
              },
            });
            this.lastPriceByIdeaId.delete(idea.id);
            return;
          }

          const missed = isEntryMissed(idea.direction, prevPrice, currentPrice, idea.entry_low, idea.entry_high);
          if (missed) {
            const minutesTotal = minutesBetween(idea.created_at, candleIso);
            await this.store.updateIdea(idea.id, {
              status: "RESOLVED",
              resolved_at: candleIso,
              result: "FAIL",
              minutes_total: minutesTotal,
            });
            await this.store.appendEvent({
              idea_id: idea.id,
              event_type: "RESOLVED",
              ts: candleIso,
              price: currentPrice,
              meta: {
                reason: "ENTRY_MISSED",
                entry_low: idea.entry_low,
                entry_high: idea.entry_high,
                backfill: true,
              },
            });
            this.lastPriceByIdeaId.delete(idea.id);
            return;
          }
        }
      }

      if (idea.status === "ACTIVE") {
        const hit = resolveFirstHitFromRange(
          idea.direction,
          idea.tp_levels,
          idea.sl_levels,
          prevPrice,
          candle.low,
          candle.high,
          currentPrice,
        );
        if (hit) {
          const eventType = hit.type === "TP" ? "TP_HIT" : "SL_HIT";
          const result = hit.type === "TP" ? "SUCCESS" : "FAIL";
          const minutesToExit = idea.activated_at ? minutesBetween(idea.activated_at, candleIso) : null;
          const minutesTotal = minutesBetween(idea.created_at, candleIso);

          await this.store.appendEvent({
            idea_id: idea.id,
            event_type: eventType,
            ts: candleIso,
            price: currentPrice,
            meta: {
              level_type: hit.type,
              level_index: hit.index,
              level_price: hit.price,
              ref_price: prevPrice ?? null,
              backfill: true,
            },
          });

          await this.store.updateIdea(idea.id, {
            status: "RESOLVED",
            resolved_at: candleIso,
            result,
            hit_level_type: hit.type,
            hit_level_index: hit.index,
            hit_level_price: hit.price,
            minutes_to_exit: minutesToExit,
            minutes_total: minutesTotal,
          });

          await this.store.appendEvent({
            idea_id: idea.id,
            event_type: "RESOLVED",
            ts: candleIso,
            price: currentPrice,
            meta: {
              result,
              hit_level_type: hit.type,
              hit_level_index: hit.index,
              backfill: true,
            },
          });
          this.lastPriceByIdeaId.delete(idea.id);
          return;
        }
      }

      prevPrice = currentPrice;
    }

    if (typeof prevPrice === "number" && Number.isFinite(prevPrice)) {
      this.lastPriceByIdeaId.set(idea.id, prevPrice);
    }
  }

  private async reconcileHistoryOnStartup() {
    if (!this.running || this.processing) return;
    this.processing = true;
    try {
      const openIdeas = await this.store.listOpenIdeas();
      if (!openIdeas.length) return;
      console.log(`[TradeIdeaTracker] reconcileHistoryOnStartup: ${openIdeas.length} open ideas — seeding prevPrices`);

      // Lightweight startup: just seed prevPrice for all open ideas from their entry zone.
      // Full reconciliation with historical candles is too expensive when there are 1000+ ideas
      // (each needs API calls to Binance/Bybit). This blocks tick() via the processing flag
      // for potentially 10+ minutes. Instead, seed prevPrice and let tick() do the live tracking.
      for (const idea of openIdeas) {
        this.lastPriceByIdeaId.set(idea.id, (idea.entry_low + idea.entry_high) / 2);
      }
      console.log(`[TradeIdeaTracker] Seeded ${openIdeas.length} prevPrices — tick() will handle live tracking`);
    } catch (err: unknown) {
      console.error("[TradeIdeaTracker] reconcileHistoryOnStartup error:", (err as Error)?.message ?? err);
    } finally {
      this.processing = false;
    }
  }

  private async repairMissingExitTimes() {
    try {
      const allIdeas = await this.store.listIdeas({ limit: 10000 });
      let repaired = 0;
      for (const idea of allIdeas) {
        if (idea.status !== "RESOLVED") continue;
        if (idea.hit_level_type === null) continue; // entry missed — no exit
        if (typeof idea.minutes_to_exit === "number") continue; // already has exit time
        // Has a TP/SL hit but no minutes_to_exit — repair it
        if (idea.activated_at && idea.resolved_at) {
          const exitMin = minutesBetween(idea.activated_at, idea.resolved_at);
          await this.store.updateIdea(idea.id, { minutes_to_exit: exitMin ?? 0 });
          repaired++;
        } else if (idea.resolved_at) {
          // Was never activated (PENDING → direct hit) — set exit to 0
          const totalMin = minutesBetween(idea.created_at, idea.resolved_at);
          await this.store.updateIdea(idea.id, {
            activated_at: idea.resolved_at,
            minutes_to_entry: totalMin,
            minutes_to_exit: 0,
          });
          repaired++;
        }
      }
      if (repaired > 0) console.log(`[TradeIdeaTracker] Repaired ${repaired} ideas with missing minutes_to_exit`);
    } catch (err) {
      console.error("[TradeIdeaTracker] repairMissingExitTimes error:", err instanceof Error ? err.message : err);
    }
  }

  private async tick() {
    if (!this.running || this.processing) return;
    this.processing = true;
    try {
      const openIdeas = await this.store.listOpenIdeas();
      if (!openIdeas.length) return;

      const symbols = [...new Set(openIdeas.map((idea) => idea.symbol.toUpperCase()))];
      const t0 = Date.now();

      // 1. Bulk-fetch from Redis (fast: single pipeline, <50ms for 500+ symbols)
      const { prices: symbolPrices, missing } = await bulkFetchPricesFromRedis(symbols);
      const redisMs = Date.now() - t0;

      // 2. REST fallback only for symbols NOT in Redis (typically spot-only coins)
      if (missing.length > 0) {
        const CHUNK_SIZE = 20;
        for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
          const chunk = missing.slice(i, i + CHUNK_SIZE);
          await Promise.all(
            chunk.map(async (symbol) => {
              const price = await fetchSymbolPrice(symbol);
              if (typeof price === "number") symbolPrices.set(symbol, price);
            }),
          );
        }
      }

      const pending = openIdeas.filter((i) => i.status === "PENDING").length;
      const active = openIdeas.filter((i) => i.status === "ACTIVE").length;
      const priced = symbolPrices.size;
      const elapsed = Date.now() - t0;
      console.log(`[TradeIdeaTracker] tick: ${openIdeas.length} ideas (${pending}P/${active}A), ${priced}/${symbols.length} prices (redis=${symbols.length - missing.length} in ${redisMs}ms, rest=${missing.length}) total ${elapsed}ms`);

      for (const idea of openIdeas) {
        const currentPrice = symbolPrices.get(idea.symbol.toUpperCase());
        let prevPrice = this.lastPriceByIdeaId.get(idea.id) ?? null;
        const nowIso = new Date().toISOString();

        // Seed prevPrice for ideas we haven't tracked yet — use entry zone midpoint
        // so that price movement away from the zone is detected as a crossing
        if (typeof prevPrice !== "number" && typeof currentPrice === "number") {
          prevPrice = (idea.entry_low + idea.entry_high) / 2;
          this.lastPriceByIdeaId.set(idea.id, prevPrice);
        }

        if (idea.status === "PENDING") {
          const ttl = this.ttlMinutes(idea.horizon);
          const ageMin = minutesBetween(idea.created_at, nowIso);
          if (typeof ageMin === "number" && ageMin > ttl) {
            console.log(`[TradeIdeaTracker] TTL_EXPIRED ${idea.symbol} ${idea.direction} (age=${ageMin}min > ttl=${ttl}min)`);
            await this.store.updateIdea(idea.id, {
              status: "RESOLVED",
              resolved_at: nowIso,
              result: "FAIL",
              minutes_total: ageMin,
            });
            await this.store.appendEvent({
              idea_id: idea.id,
              event_type: "RESOLVED",
              ts: nowIso,
              price: currentPrice ?? prevPrice,
              meta: { reason: "ENTRY_TTL_EXPIRED", ttl_minutes: ttl },
            });
            this.lastPriceByIdeaId.delete(idea.id);
            continue;
          }

          if (typeof currentPrice !== "number") continue;

          const touched = isEntryTouched(prevPrice, currentPrice, idea.entry_low, idea.entry_high);
          if (touched) {
            console.log(`[TradeIdeaTracker] ENTRY_TOUCHED ${idea.symbol} ${idea.direction} @ ${currentPrice} (zone=${idea.entry_low}-${idea.entry_high})`);
            const minutesToEntry = minutesBetween(idea.created_at, nowIso);
            await this.store.updateIdea(idea.id, {
              status: "ACTIVE",
              activated_at: nowIso,
              minutes_to_entry: minutesToEntry,
            });
            await this.store.appendEvent({
              idea_id: idea.id,
              event_type: "ENTRY_TOUCHED",
              ts: nowIso,
              price: currentPrice,
              meta: {
                entry_low: idea.entry_low,
                entry_high: idea.entry_high,
              },
            });
            idea.status = "ACTIVE";
            idea.activated_at = nowIso;
          } else {
            const pendingLevelHit = resolveFirstHit(idea.direction, idea.tp_levels, idea.sl_levels, prevPrice, currentPrice);
            if (pendingLevelHit) {
              const pendingResult = pendingLevelHit.type === "TP" ? "SUCCESS" : "FAIL";
              const minutesTotal = minutesBetween(idea.created_at, nowIso);
              const minutesToEntry = minutesTotal;
              await this.store.updateIdea(idea.id, {
                status: "RESOLVED",
                activated_at: nowIso,
                resolved_at: nowIso,
                result: pendingResult,
                hit_level_type: pendingLevelHit.type,
                hit_level_index: pendingLevelHit.index,
                hit_level_price: pendingLevelHit.price,
                minutes_to_entry: minutesToEntry,
                minutes_to_exit: 0,
                minutes_total: minutesTotal,
              });
              await this.store.appendEvent({
                idea_id: idea.id,
                event_type: pendingLevelHit.type === "TP" ? "TP_HIT" : "SL_HIT",
                ts: nowIso,
                price: currentPrice,
                meta: {
                  reason: "PENDING_LEVEL_HIT",
                  level_type: pendingLevelHit.type,
                  level_index: pendingLevelHit.index,
                  level_price: pendingLevelHit.price,
                },
              });
              this.lastPriceByIdeaId.delete(idea.id);
              continue;
            }

            const missed = isEntryMissed(idea.direction, prevPrice, currentPrice, idea.entry_low, idea.entry_high);
            if (missed) {
              const minutesTotal = minutesBetween(idea.created_at, nowIso);
              await this.store.updateIdea(idea.id, {
                status: "RESOLVED",
                resolved_at: nowIso,
                result: "FAIL",
                minutes_total: minutesTotal,
              });
              await this.store.appendEvent({
                idea_id: idea.id,
                event_type: "RESOLVED",
                ts: nowIso,
                price: currentPrice,
                meta: {
                  reason: "ENTRY_MISSED",
                  entry_low: idea.entry_low,
                  entry_high: idea.entry_high,
                },
              });
              this.lastPriceByIdeaId.delete(idea.id);
              continue;
            }
          }
        }

        if (idea.status === "ACTIVE") {
          if (typeof currentPrice !== "number") continue;
          const hit = resolveFirstHit(idea.direction, idea.tp_levels, idea.sl_levels, prevPrice, currentPrice);
          if (hit) {
            console.log(`[TradeIdeaTracker] RESOLVED ${idea.symbol} ${idea.direction} → ${hit.type}${hit.index} @ ${currentPrice} (prev=${prevPrice}, level=${hit.price})`);
            const eventType = hit.type === "TP" ? "TP_HIT" : "SL_HIT";
            const result = hit.type === "TP" ? "SUCCESS" : "FAIL";
            const minutesToExit = idea.activated_at ? minutesBetween(idea.activated_at, nowIso) : null;
            const minutesTotal = minutesBetween(idea.created_at, nowIso);

            await this.store.appendEvent({
              idea_id: idea.id,
              event_type: eventType,
              ts: nowIso,
              price: currentPrice,
              meta: {
                level_type: hit.type,
                level_index: hit.index,
                level_price: hit.price,
                ref_price: prevPrice,
              },
            });

            await this.store.updateIdea(idea.id, {
              status: "RESOLVED",
              resolved_at: nowIso,
              result,
              hit_level_type: hit.type,
              hit_level_index: hit.index,
              hit_level_price: hit.price,
              minutes_to_exit: minutesToExit,
              minutes_total: minutesTotal,
            });

            await this.store.appendEvent({
              idea_id: idea.id,
              event_type: "RESOLVED",
              ts: nowIso,
              price: currentPrice,
              meta: {
                result,
                hit_level_type: hit.type,
                hit_level_index: hit.index,
              },
            });
            this.lastPriceByIdeaId.delete(idea.id);
            continue;
          }
        }

        if (typeof currentPrice === "number") {
          this.lastPriceByIdeaId.set(idea.id, currentPrice);
        }
      }
    } catch (err: unknown) {
      console.error("[TradeIdeaTracker] tick error:", (err as Error)?.message ?? err);
    } finally {
      this.processing = false;
    }
  }
}
