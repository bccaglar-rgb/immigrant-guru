import { isEntryMissed, isEntryTouched, minutesBetween, resolveFirstHit, resolveFirstHitFromRange } from "./tradeIdeaLogic.ts";
import { TradeIdeaStore } from "./tradeIdeaStore.ts";
import type { TradeIdeaRecord } from "./tradeIdeaTypes.ts";

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

const fetchJson = async <T>(url: string): Promise<T | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

const fetchBinanceFuturesJson = async <T>(path: string): Promise<T | null> => {
  for (const base of BINANCE_FUTURES_BASES) {
    const body = await fetchJson<T>(`${base}${path}`);
    if (body) return body;
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
  for (const fetcher of fetchers) {
    const candles = await fetcher(symbol, safeStart, safeEnd);
    if (candles.length) return candles;
  }
  return [];
};

const isEntryTouchedByRange = (entryLow: number, entryHigh: number, candleLow: number, candleHigh: number): boolean => {
  const low = Math.min(entryLow, entryHigh);
  const high = Math.max(entryLow, entryHigh);
  return candleHigh >= low && candleLow <= high;
};

const fetchSymbolPrice = async (symbol: string): Promise<number | null> => {
  const fetchers: Array<(s: string) => Promise<number | null>> = [
    fetchFromBinanceFutures,
    fetchFromBinanceSpot,
    fetchFromBybit,
    fetchFromOkx,
    fetchFromGate,
  ];

  for (const fetcher of fetchers) {
    const price = await fetcher(symbol);
    if (typeof price === "number" && Number.isFinite(price)) return price;
  }
  return null;
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

  constructor(
    store: TradeIdeaStore,
    options?: {
      pollMs?: number;
      pendingTtlMinutes?: Partial<Record<Horizon, number>>;
    },
  ) {
    this.store = store;
    this.options = options;
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.reconcileHistoryOnStartup();
    const pollMs = Math.max(1000, this.options?.pollMs ?? 2000);
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
      const nowMs = Date.now();
      for (const idea of openIdeas) {
        const createdMs = Date.parse(idea.created_at);
        if (!Number.isFinite(createdMs)) continue;
        const fromMs = Math.max(0, createdMs - 60_000);
        const candles = await fetchSymbolHistory(idea.symbol, fromMs, nowMs);
        if (!candles.length) continue;
        await this.reconcileIdeaWithHistory(idea, candles);
      }

      // Repair: fill missing minutes_to_exit for resolved ideas with hit_level_type
      await this.repairMissingExitTimes();
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
      const symbolPrices = new Map<string, number>();
      await Promise.all(
        symbols.map(async (symbol) => {
          const price = await fetchSymbolPrice(symbol);
          if (typeof price === "number") symbolPrices.set(symbol, price);
        }),
      );

      for (const idea of openIdeas) {
        const currentPrice = symbolPrices.get(idea.symbol.toUpperCase());
        const prevPrice = this.lastPriceByIdeaId.get(idea.id) ?? null;
        const nowIso = new Date().toISOString();

        if (idea.status === "PENDING") {
          const ttl = this.ttlMinutes(idea.horizon);
          const ageMin = minutesBetween(idea.created_at, nowIso);
          if (typeof ageMin === "number" && ageMin > ttl) {
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
    } finally {
      this.processing = false;
    }
  }
}
