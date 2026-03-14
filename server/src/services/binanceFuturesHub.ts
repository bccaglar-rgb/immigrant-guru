import WebSocket from "ws";

const BINANCE_FUTURES_STREAM_URLS = [
  "wss://fstream.binance.com/stream?streams=!ticker@arr/!markPrice@arr@1s/!bookTicker",
  "wss://fstream.binance.com:443/stream?streams=!ticker@arr/!markPrice@arr@1s/!bookTicker",
];

const STREAM_STALE_MS = 15_000;
const HARD_STALE_RECONNECT_MS = 22_000;
const HEARTBEAT_PING_MS = 7_000;
const WATCHDOG_TICK_MS = 5_000;
const RECONNECT_BASE_MS = 600;
const RECONNECT_MAX_MS = 15_000;
const MAX_SYMBOL_ROWS = 2600;

const toFinite = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const rawToText = (raw: WebSocket.RawData): string => {
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  return String(raw ?? "");
};

const normalizeSymbol = (raw: unknown): string => String(raw ?? "").toUpperCase().trim();

const toBaseAsset = (symbol: string): string | null => {
  if (!symbol.endsWith("USDT")) return null;
  const base = symbol.slice(0, -4);
  if (!base || !/^[A-Z0-9]{1,20}$/.test(base)) return null;
  return base;
};

type TickerRow = {
  symbol: string;
  price: number;
  change24hPct: number;
  volume24hUsd: number;
  sourceTs: number | null;
};

type MarkRow = {
  symbol: string;
  markPrice: number;
  fundingRate: number | null;
  nextFundingTime: number | null;
  sourceTs: number | null;
};

type BookRow = {
  symbol: string;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  depthUsd: number;
  imbalance: number;
  spreadBps: number;
  sourceTs: number | null;
};

export interface BinanceFuturesHubStatus {
  connected: boolean;
  stale: boolean;
  staleAgeMs: number;
  streamUrl: string;
  reconnects: number;
  lastError?: string;
  lastMessageAt?: string;
  tickerSymbols: number;
  markSymbols: number;
  bookSymbols: number;
}

export interface BinanceFuturesUniverseRow {
  symbol: string;
  baseAsset: string;
  price: number;
  change24hPct: number;
  volume24hUsd: number;
  topBid: number | null;
  topAsk: number | null;
  depthUsd: number | null;
  imbalance: number | null;
  spreadBps: number | null;
  markPrice: number | null;
  fundingRate: number | null;
  nextFundingTime: number | null;
  sourceTs: number | null;
}

export class BinanceFuturesHub {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private reconnectAttempts = 0;
  private reconnectCount = 0;
  private streamUrlIndex = 0;
  private connected = false;
  private lastError: string | undefined;
  private lastMessageAt = 0;
  private readonly tickerBySymbol = new Map<string, TickerRow>();
  private readonly markBySymbol = new Map<string, MarkRow>();
  private readonly bookBySymbol = new Map<string, BookRow>();

  start() {
    if (this.started) return;
    this.started = true;
    this.startWatchdog();
    this.connect();
  }

  stop() {
    this.started = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearConnectionTimers();
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
    this.connected = false;
  }

  getStatus(): BinanceFuturesHubStatus {
    const now = Date.now();
    const staleAgeMs = this.lastMessageAt > 0 ? Math.max(0, now - this.lastMessageAt) : Number.POSITIVE_INFINITY;
    return {
      connected: this.connected,
      stale: !this.connected || staleAgeMs > STREAM_STALE_MS,
      staleAgeMs: Number.isFinite(staleAgeMs) ? staleAgeMs : 99_999_999,
      streamUrl: BINANCE_FUTURES_STREAM_URLS[this.streamUrlIndex] ?? BINANCE_FUTURES_STREAM_URLS[0],
      reconnects: this.reconnectCount,
      lastError: this.lastError,
      lastMessageAt: this.lastMessageAt > 0 ? new Date(this.lastMessageAt).toISOString() : undefined,
      tickerSymbols: this.tickerBySymbol.size,
      markSymbols: this.markBySymbol.size,
      bookSymbols: this.bookBySymbol.size,
    };
  }

  getTickers(): Array<{ symbol: string; price: number; change24hPct: number; volume24hUsd: number | null }> {
    return [...this.tickerBySymbol.values()]
      .map((row) => {
        const base = toBaseAsset(row.symbol);
        if (!base) return null;
        return {
          symbol: base,
          price: row.price,
          change24hPct: row.change24hPct,
          volume24hUsd: Number.isFinite(row.volume24hUsd) ? row.volume24hUsd : null,
        };
      })
      .filter((row): row is { symbol: string; price: number; change24hPct: number; volume24hUsd: number | null } => Boolean(row));
  }

  getSymbols(): string[] {
    return [...this.tickerBySymbol.keys()]
      .map((symbol) => toBaseAsset(symbol))
      .filter((base): base is string => Boolean(base))
      .filter((base) => base !== "USDT")
      .sort((a, b) => a.localeCompare(b));
  }

  getUniverseRows(): BinanceFuturesUniverseRow[] {
    return [...this.tickerBySymbol.values()]
      .map((ticker) => {
        const baseAsset = toBaseAsset(ticker.symbol);
        if (!baseAsset) return null;
        if (
          baseAsset === "USDC" ||
          baseAsset === "FDUSD" ||
          baseAsset === "BUSD" ||
          baseAsset === "TUSD" ||
          baseAsset === "USDP" ||
          baseAsset === "DAI"
        ) {
          return null;
        }
        const mark = this.markBySymbol.get(ticker.symbol);
        const book = this.bookBySymbol.get(ticker.symbol);
        return {
          symbol: ticker.symbol,
          baseAsset,
          price: ticker.price,
          change24hPct: ticker.change24hPct,
          volume24hUsd: ticker.volume24hUsd,
          topBid: book?.bid ?? null,
          topAsk: book?.ask ?? null,
          depthUsd: book?.depthUsd ?? null,
          imbalance: book?.imbalance ?? null,
          spreadBps: book?.spreadBps ?? null,
          markPrice: mark?.markPrice ?? null,
          fundingRate: mark?.fundingRate ?? null,
          nextFundingTime: mark?.nextFundingTime ?? null,
          sourceTs: ticker.sourceTs ?? mark?.sourceTs ?? book?.sourceTs ?? null,
        };
      })
      .filter((row): row is BinanceFuturesUniverseRow => Boolean(row));
  }

  getLiveRow(symbol: string): BinanceFuturesUniverseRow | null {
    const normalized = normalizeSymbol(symbol);
    const ticker = this.tickerBySymbol.get(normalized);
    if (!ticker) return null;
    const baseAsset = toBaseAsset(normalized);
    if (!baseAsset) return null;
    const mark = this.markBySymbol.get(normalized);
    const book = this.bookBySymbol.get(normalized);
    return {
      symbol: normalized,
      baseAsset,
      price: ticker.price,
      change24hPct: ticker.change24hPct,
      volume24hUsd: ticker.volume24hUsd,
      topBid: book?.bid ?? null,
      topAsk: book?.ask ?? null,
      depthUsd: book?.depthUsd ?? null,
      imbalance: book?.imbalance ?? null,
      spreadBps: book?.spreadBps ?? null,
      markPrice: mark?.markPrice ?? null,
      fundingRate: mark?.fundingRate ?? null,
      nextFundingTime: mark?.nextFundingTime ?? null,
      sourceTs: ticker.sourceTs ?? mark?.sourceTs ?? book?.sourceTs ?? null,
    };
  }

  private connect() {
    if (!this.started) return;
    this.clearConnectionTimers();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
    const activeUrl = BINANCE_FUTURES_STREAM_URLS[this.streamUrlIndex] ?? BINANCE_FUTURES_STREAM_URLS[0];
    const ws = new WebSocket(activeUrl, {
      handshakeTimeout: 10_000,
    });
    this.ws = ws;

    ws.on("open", () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.lastError = undefined;
      this.lastMessageAt = Date.now();
      this.startHeartbeat();
    });

    ws.on("message", (raw) => {
      this.lastMessageAt = Date.now();
      this.parseIncoming(raw);
    });

    ws.on("close", () => {
      this.connected = false;
      this.clearConnectionTimers();
      this.scheduleReconnect();
    });

    ws.on("error", (error) => {
      this.connected = false;
      this.lastError = error instanceof Error ? error.message : "ws_error";
      this.clearConnectionTimers();
      this.scheduleReconnect();
    });

    ws.on("pong", () => {
      this.lastMessageAt = Date.now();
    });
  }

  private scheduleReconnect() {
    if (!this.started) return;
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    this.reconnectCount += 1;
    this.streamUrlIndex = (this.streamUrlIndex + 1) % BINANCE_FUTURES_STREAM_URLS.length;
    const expo = Math.round(RECONNECT_BASE_MS * Math.pow(1.8, Math.max(0, this.reconnectAttempts - 1)));
    const jitter = Math.floor(Math.random() * 350);
    const backoffMs = Math.min(RECONNECT_MAX_MS, expo + jitter);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, backoffMs);
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.ping();
      } catch {
        // ping failures are handled by watchdog/reconnect
      }
    }, HEARTBEAT_PING_MS);
  }

  private startWatchdog() {
    if (this.watchdogTimer) return;
    this.watchdogTimer = setInterval(() => {
      if (!this.started) return;
      const ageMs = this.lastMessageAt > 0 ? Date.now() - this.lastMessageAt : Number.POSITIVE_INFINITY;
      if (!this.connected) return;
      if (ageMs > HARD_STALE_RECONNECT_MS) {
        this.lastError = `stream_stale_${ageMs}ms`;
        if (this.ws) {
          try {
            this.ws.terminate();
          } catch {
            // noop
          }
        }
        this.connected = false;
        this.clearConnectionTimers();
        this.scheduleReconnect();
      }
    }, WATCHDOG_TICK_MS);
  }

  private clearConnectionTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private pruneMap<T>(map: Map<string, T>) {
    if (map.size <= MAX_SYMBOL_ROWS) return;
    const overflow = map.size - MAX_SYMBOL_ROWS;
    if (overflow <= 0) return;
    const keys = [...map.keys()];
    for (let i = 0; i < overflow; i += 1) {
      const key = keys[i];
      if (!key) continue;
      map.delete(key);
    }
  }

  private parseIncoming(raw: WebSocket.RawData) {
    try {
      const msg = JSON.parse(rawToText(raw) || "{}") as {
        stream?: string;
        data?: unknown;
      };
      const stream = String(msg.stream ?? "").toLowerCase();
      if (!stream || msg.data === undefined) return;

      if (stream.includes("!ticker@arr")) {
        const rows = Array.isArray(msg.data) ? msg.data : [];
        for (const row of rows) {
          const rec = row as Record<string, unknown>;
          const symbol = normalizeSymbol(rec.s);
          if (!toBaseAsset(symbol)) continue;
          const price = toFinite(rec.c);
          const change24hPct = toFinite(rec.P);
          const volume24hUsd = toFinite(rec.q);
          if (price === null || change24hPct === null || volume24hUsd === null) continue;
          this.tickerBySymbol.set(symbol, {
            symbol,
            price,
            change24hPct,
            volume24hUsd,
            sourceTs: toFinite(rec.E),
          });
        }
        this.pruneMap(this.tickerBySymbol);
        return;
      }

      if (stream.includes("!markprice@arr")) {
        const rows = Array.isArray(msg.data) ? msg.data : [];
        for (const row of rows) {
          const rec = row as Record<string, unknown>;
          const symbol = normalizeSymbol(rec.s);
          if (!toBaseAsset(symbol)) continue;
          const markPrice = toFinite(rec.p);
          if (markPrice === null) continue;
          this.markBySymbol.set(symbol, {
            symbol,
            markPrice,
            fundingRate: toFinite(rec.r),
            nextFundingTime: toFinite(rec.T),
            sourceTs: toFinite(rec.E),
          });
        }
        this.pruneMap(this.markBySymbol);
        return;
      }

      if (stream.includes("!bookticker")) {
        const rec = (msg.data ?? {}) as Record<string, unknown>;
        const symbol = normalizeSymbol(rec.s);
        if (!toBaseAsset(symbol)) return;
        const bid = toFinite(rec.b);
        const ask = toFinite(rec.a);
        const bidQty = toFinite(rec.B) ?? 0;
        const askQty = toFinite(rec.A) ?? 0;
        if (bid === null || ask === null || bid <= 0 || ask <= 0) return;
        const mid = (bid + ask) / 2;
        const spreadBps = mid > 0 ? ((ask - bid) / mid) * 10_000 : 0;
        const bidUsd = Math.max(0, bid * Math.max(0, bidQty));
        const askUsd = Math.max(0, ask * Math.max(0, askQty));
        const depthUsd = bidUsd + askUsd;
        const imbalance = depthUsd > 0 ? (bidUsd - askUsd) / depthUsd : 0;
        this.bookBySymbol.set(symbol, {
          symbol,
          bid,
          ask,
          bidQty,
          askQty,
          depthUsd: Number.isFinite(depthUsd) ? depthUsd : 0,
          imbalance: Number.isFinite(imbalance) ? imbalance : 0,
          spreadBps: Number.isFinite(spreadBps) ? spreadBps : 0,
          sourceTs: toFinite(rec.E),
        });
        this.pruneMap(this.bookBySymbol);
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "parse_error";
    }
  }
}
