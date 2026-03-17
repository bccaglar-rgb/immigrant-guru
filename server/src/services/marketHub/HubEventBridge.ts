/**
 * HubEventBridge — Redis pub/sub bridge for ExchangeMarketHub events.
 *
 * Architecture:
 *   Worker 0 (PRIMARY):  MarketHub → onEvent → Redis PUBLISH + Redis HSET (live snapshot)
 *   Worker 0,1,2:        Redis SUBSCRIBE → callback → Gateway
 *                         Redis HGETALL → live snapshot for REST API fallback
 *
 * This ensures 1 Binance WS connection serves N workers.
 * Events are serialized as JSON through a Redis channel.
 *
 * Live snapshot: Primary writes lastTradePrice, markPrice, topBid/Ask etc.
 * to Redis hashes (hub:live:{symbol}). Any worker can read these for REST API
 * responses, solving the "worker 0 has data, worker 1-2 don't" problem.
 */
import Redis from "ioredis";
import type { NormalizedEvent } from "./types.ts";
import type { ExchangeMarketHub } from "./ExchangeMarketHub.ts";

const CHANNEL = "hub:events";
const MARKET_LIST_CHANNEL = "hub:market_list";
const SNAPSHOT_KEY_PREFIX = "hub:live:";
const SNAPSHOT_TTL_SEC = 300; // 5 min TTL

/**
 * Only bridge event types the Gateway actually consumes.
 * The adapter's 500ms ticker flush already limits ticker/mark_price to depth symbols
 * only (~10 symbols × 2/sec = ~40 events/sec total), so they're safe to bridge now.
 * book_ticker is still excluded (400+/sec for 200+ symbols).
 */
const BRIDGED_TYPES = new Set(["kline", "trade", "book_snapshot", "book_delta", "mark_price", "ticker"]);

/** Throttle interval for high-frequency snapshot writes (book_ticker).
 * 50ms = 20 updates/sec per symbol. Reduced from 200ms for faster top-of-book display. */
const BOOK_TICKER_THROTTLE_MS = 50;

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

export class HubEventBridge {
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private reader: Redis | null = null;
  private listeners = new Set<(event: NormalizedEvent) => void>();
  private marketListListeners = new Set<(msg: string) => void>();
  private unsubHub: (() => void) | null = null;

  /** Throttle map for book_ticker writes: "symbol" → last write timestamp */
  private bookTickerLastWrite = new Map<string, number>();
  /** Throttle map for trade writes: "symbol" → last write timestamp */
  private tradeLastWrite = new Map<string, number>();

  /**
   * Start publishing: connects hub events → Redis channel + live snapshot hashes.
   * Call ONLY on the primary worker that runs ExchangeMarketHub.
   */
  startPublisher(hub: ExchangeMarketHub): void {
    this.pub = new Redis(redisOpts);
    this.pub.on("error", (err) => {
      console.error("[HubEventBridge:pub] Redis error:", err.message);
    });

    this.unsubHub = hub.onEvent((event) => {
      if (!this.pub) return;

      // 1. Bridge critical events via pub/sub channel (existing behavior)
      // CRITICAL: Only bridge Binance events. Gate.io trade/kline events have different
      // prices and would contaminate tick pipeline, chart candles, and displayed prices.
      const evtExchange = String((event as Record<string, unknown>).exchange ?? "").toUpperCase();
      const isBinance = !evtExchange || evtExchange.includes("BINANCE");
      if (BRIDGED_TYPES.has(event.type) && isBinance) {
        try {
          this.pub.publish(CHANNEL, JSON.stringify(event));
        } catch {
          // best-effort — if Redis is down, events are dropped
        }
      }

      // 2. Write live snapshot fields to Redis hash (NEW — for secondary workers)
      this.writeLiveFields(event);
    });
  }

  /**
   * Write live market fields to a Redis hash per symbol.
   * Called on Primary worker only. Each event type writes its own fields:
   *   trade     → lastTradePrice, lastTradeQty, lastTradeSide, sourceTs
   *   mark_price → markPrice, fundingRate, nextFundingTime
   *   book_ticker → topBid, topAsk, bidQty, askQty (throttled to 200ms)
   *   ticker     → price, change24hPct, volume24hUsd
   */
  private writeLiveFields(event: NormalizedEvent): void {
    if (!this.pub) return;
    const key = SNAPSHOT_KEY_PREFIX + event.symbol;

    // CRITICAL: Only write Binance data to the live snapshot.
    // Gate.io trades have different prices (premium/discount) and would contaminate
    // the canonical Binance price, causing the UI to show values BTC never reached.
    const eventExchange = String((event as Record<string, unknown>).exchange ?? "").toUpperCase();
    if (eventExchange && !eventExchange.includes("BINANCE")) return;

    if (event.type === "trade") {
      // Throttle trade snapshot writes to 50ms per symbol (20/sec vs 180/sec raw)
      const now = Date.now();
      const lastWrite = this.tradeLastWrite.get(event.symbol) ?? 0;
      if (now - lastWrite < 50) return;
      this.tradeLastWrite.set(event.symbol, now);

      this.pub.hmset(key, {
        lastTradePrice: String(event.price),
        lastTradeQty: String(event.qty),
        lastTradeSide: event.side,
        sourceTs: String(event.ts),
        updatedAt: String(now),
      });
      this.pub.expire(key, SNAPSHOT_TTL_SEC);
    } else if (event.type === "mark_price") {
      const fields: Record<string, string> = {
        markPrice: String(event.markPrice),
        markUpdatedAt: String(Date.now()),
      };
      if (event.fundingRate != null) fields.fundingRate = String(event.fundingRate);
      if (event.nextFundingTime != null) fields.nextFundingTime = String(event.nextFundingTime);
      this.pub.hmset(key, fields);
      this.pub.expire(key, SNAPSHOT_TTL_SEC);
    } else if (event.type === "book_ticker") {
      // Throttle book_ticker to avoid Redis overload (200ms per symbol)
      const now = Date.now();
      const lastWrite = this.bookTickerLastWrite.get(event.symbol) ?? 0;
      if (now - lastWrite < BOOK_TICKER_THROTTLE_MS) return;
      this.bookTickerLastWrite.set(event.symbol, now);

      this.pub.hmset(key, {
        topBid: String(event.bid),
        topAsk: String(event.ask),
        bidQty: String(event.bidQty ?? 0),
        askQty: String(event.askQty ?? 0),
        bookUpdatedAt: String(Date.now()),
      });
      this.pub.expire(key, SNAPSHOT_TTL_SEC);
    } else if (event.type === "ticker") {
      this.pub.hmset(key, {
        price: String(event.price),
        change24hPct: String(event.change24hPct),
        volume24hUsd: String(event.volume24hUsd),
        tickerUpdatedAt: String(Date.now()),
      });
      this.pub.expire(key, SNAPSHOT_TTL_SEC);
    }
  }

  /**
   * Start subscribing: Redis channel → local callbacks.
   * Call on ALL workers (including primary).
   * Also opens a reader connection for snapshot hash reads.
   */
  startSubscriber(): void {
    // Subscriber needs a dedicated connection (ioredis requirement)
    this.sub = new Redis(redisOpts);
    this.sub.on("error", (err) => {
      console.error("[HubEventBridge:sub] Redis error:", err.message);
    });

    // Separate non-subscriber connection for reading snapshot hashes
    this.reader = new Redis(redisOpts);
    this.reader.on("error", (err) => {
      console.error("[HubEventBridge:reader] Redis error:", err.message);
    });

    this.sub.subscribe(CHANNEL, MARKET_LIST_CHANNEL, (err) => {
      if (err) {
        console.error("[HubEventBridge] Subscribe failed:", err.message);
      }
    });

    this.sub.on("message", (channel: string, message: string) => {
      if (channel === MARKET_LIST_CHANNEL) {
        // Market list patch — forward raw JSON to gateway (no parse needed)
        if (!this.marketListListeners.size) return;
        for (const cb of this.marketListListeners) cb(message);
        return;
      }
      if (!this.listeners.size) return; // No listeners → skip JSON.parse entirely
      try {
        const event = JSON.parse(message) as NormalizedEvent;
        for (const cb of this.listeners) cb(event);
      } catch {
        // malformed message — skip
      }
    });
  }

  /**
   * Read live snapshot from Redis hash — usable on ALL workers.
   * Returns an AdapterSymbolSnapshot-like object or null.
   * Costs ~1ms (local Redis HGETALL).
   */
  async getLiveSnapshot(symbol: string): Promise<{
    lastTradePrice: number | null;
    lastTradeQty: number | null;
    lastTradeSide: "BUY" | "SELL" | null;
    markPrice: number | null;
    fundingRate: number | null;
    nextFundingTime: number | null;
    topBid: number | null;
    topAsk: number | null;
    bidQty: number | null;
    askQty: number | null;
    price: number | null;
    change24hPct: number | null;
    volume24hUsd: number | null;
    sourceTs: number | null;
    updatedAt: number;
  } | null> {
    if (!this.reader) return null;
    try {
      const data = await this.reader.hgetall(SNAPSHOT_KEY_PREFIX + symbol);
      if (!data || Object.keys(data).length === 0) return null;

      const num = (v: string | undefined) => {
        if (v === undefined || v === "null" || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      return {
        lastTradePrice: num(data.lastTradePrice),
        lastTradeQty: num(data.lastTradeQty),
        lastTradeSide: (data.lastTradeSide === "BUY" || data.lastTradeSide === "SELL") ? data.lastTradeSide : null,
        markPrice: num(data.markPrice),
        fundingRate: num(data.fundingRate),
        nextFundingTime: num(data.nextFundingTime),
        topBid: num(data.topBid),
        topAsk: num(data.topAsk),
        bidQty: num(data.bidQty),
        askQty: num(data.askQty),
        price: num(data.price),
        change24hPct: num(data.change24hPct),
        volume24hUsd: num(data.volume24hUsd),
        sourceTs: num(data.sourceTs),
        updatedAt: num(data.updatedAt) ?? Date.now(),
      };
    } catch {
      return null;
    }
  }

  /** Register a callback for received events. Returns unsubscribe function. */
  onEvent(cb: (event: NormalizedEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Publish a market list patch to Redis channel (Worker 0 → Workers 1-2). */
  publishMarketListPatch(patchJson: string): void {
    if (!this.pub) return;
    try {
      this.pub.publish(MARKET_LIST_CHANNEL, patchJson);
    } catch {
      // best-effort
    }
  }

  /** Store the full market list snapshot in Redis (Worker 0 only). */
  storeMarketListSnapshot(snapshotJson: string): void {
    if (!this.pub) return;
    try {
      this.pub.set("hub:market_list_snapshot", snapshotJson, "EX", 60);
    } catch {
      // best-effort
    }
  }

  /** Read the full market list snapshot from Redis (secondary workers). */
  async getMarketListSnapshot(): Promise<string | null> {
    if (!this.reader) return null;
    try {
      return await this.reader.get("hub:market_list_snapshot");
    } catch {
      return null;
    }
  }

  /** Store the CoinUniverseEngine snapshot in Redis (Worker 0 only, after each refresh). */
  storeUniverseSnapshot(snapshotJson: string): void {
    if (!this.pub) return;
    try {
      this.pub.set("hub:universe_engine_snapshot", snapshotJson, "EX", 120);
    } catch {
      // best-effort
    }
  }

  /** Read the CoinUniverseEngine snapshot from Redis (any worker). */
  async getUniverseSnapshot(): Promise<string | null> {
    if (!this.reader) return null;
    try {
      return await this.reader.get("hub:universe_engine_snapshot");
    } catch {
      return null;
    }
  }

  /** Store the BinanceFuturesHub universe in Redis (Worker 0 only). */
  storeFuturesUniverse(json: string): void {
    if (!this.pub) return;
    try {
      this.pub.set("hub:futures_universe", json, "EX", 120);
    } catch {
      // best-effort
    }
  }

  /** Read the BinanceFuturesHub universe from Redis (any worker). */
  async getFuturesUniverse(): Promise<string | null> {
    if (!this.reader) return null;
    try {
      return await this.reader.get("hub:futures_universe");
    } catch {
      return null;
    }
  }

  /** Register a callback for market list patches from Redis. Returns unsubscribe function. */
  onMarketListPatch(cb: (msg: string) => void): () => void {
    this.marketListListeners.add(cb);
    return () => this.marketListListeners.delete(cb);
  }

  stop(): void {
    if (this.unsubHub) {
      this.unsubHub();
      this.unsubHub = null;
    }
    if (this.pub) {
      this.pub.disconnect();
      this.pub = null;
    }
    if (this.sub) {
      this.sub.unsubscribe(CHANNEL).catch(() => {});
      this.sub.disconnect();
      this.sub = null;
    }
    if (this.reader) {
      this.reader.disconnect();
      this.reader = null;
    }
    this.listeners.clear();
    this.marketListListeners.clear();
    this.bookTickerLastWrite.clear();
    this.tradeLastWrite.clear();
  }
}
