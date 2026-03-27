import WebSocket from "ws";
import type { IExchangeMarketAdapter } from "./adapter.ts";
import type {
  AdapterCandlePoint,
  AdapterHealthSnapshot,
  AdapterSymbolSnapshot,
  AdapterTradePoint,
  NormalizedBookDeltaEvent,
  NormalizedBookSnapshotEvent,
  NormalizedEvent,
  NormalizedKlineEvent,
  NormalizedTradeEvent,
} from "./types.ts";
import { SequenceSafeOrderbookStore } from "./sequenceSafeOrderbook.ts";
import { getSharedBinanceWsPool, type SharedBinanceWsPool } from "./SharedBinanceWsPool.ts";

// !bookTicker REMOVED: it fires for ALL 300+ symbols on every trade = 2000-5000 msgs/sec,
// saturating the event loop. Bid/ask data is available from depth WS for subscribed symbols
// and from !ticker@arr for price display. bookTicker data (top bid/ask, spread) is
// a nice-to-have but not worth the CPU cost.
const BINANCE_AGGREGATE_URLS = [
  "wss://fstream.binance.com/stream?streams=!ticker@arr/!markPrice@arr@1s",
  "wss://fstream.binance.com:443/stream?streams=!ticker@arr/!markPrice@arr@1s",
];
const BINANCE_DEPTH_URLS = [
  "wss://fstream.binance.com/ws",
  "wss://fstream.binance.com:443/ws",
];
const BINANCE_TRADE_URLS = [
  "wss://fstream.binance.com/ws",
  "wss://fstream.binance.com:443/ws",
];
const BINANCE_DEPTH_SNAPSHOT_BASE = "https://fapi.binance.com";
const WATCHDOG_STALE_MS = 20_000;
const WATCHDOG_TICK_MS = 5_000;
const HEARTBEAT_PING_MS = 8_000;
const SYMBOL_DELTA_STALE_MS = 14_000;
const SNAPSHOT_SANITY_INTERVAL_MS = 20_000;
const SNAPSHOT_REFRESH_MIN_MS = 90_000;
const SNAPSHOT_SANITY_BATCH = 3;
const SNAPSHOT_REQUEST_GAP_MS = 350;
const SNAPSHOT_BLOCK_COOLDOWN_MS = 120_000; // 2 min — IP ban lifted, fast recovery preferred
const CONTRACT_REFRESH_INTERVAL_MS = 45 * 60_000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 12_000;
const DEPTH_BUFFER_MAX = 400;
// Maximum symbols for depth+kline WS subscriptions.
// Each symbol = @depth@500ms (2/sec) + 7 @kline streams + @trade on tradeWs.
// 10 symbols × 2/sec = 20 depth msgs/sec — keeps event loop clean for trade latency.
// Beyond this, symbols still get price/ticker/mark from the aggregate WS (!ticker@arr).
const MAX_DEPTH_SYMBOLS = 10;

// Priority symbols that MUST be in depthSymbols (subscribed first on start).
// These are the highest-volume Binance Futures pairs — without priority seeding,
// random low-volume symbols from !ticker@arr could fill the depth slots first.
const PRIORITY_DEPTH_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
const BINANCE_CANDLE_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
const CANDLE_STORE_MAX = 900;
const TRADE_STORE_MAX = 500;

const toText = (raw: WebSocket.RawData): string => {
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  return String(raw ?? "");
};

const normalizeSymbol = (raw: unknown): string => String(raw ?? "").toUpperCase().replace(/[-_/]/g, "").trim();

const ensureUsdtPair = (raw: unknown): string => {
  const symbol = normalizeSymbol(raw);
  if (!symbol) return "";
  return symbol.endsWith("USDT") ? symbol : `${symbol}USDT`;
};

const toNum = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const levelRows = (input: unknown): Array<[number, number]> => {
  if (!Array.isArray(input)) return [];
  const out: Array<[number, number]> = [];
  for (const row of input) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const price = Number(row[0]);
    const qty = Number(row[1]);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty)) continue;
    out.push([price, Math.max(0, qty)]);
  }
  return out;
};

const computeBackoff = (attempt: number): number => {
  const expo = Math.round(RECONNECT_BASE_MS * Math.pow(1.9, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(RECONNECT_MAX_MS, expo + jitter);
};

const nowIso = () => new Date().toISOString();

export class BinanceFuturesMarketAdapter implements IExchangeMarketAdapter {
  readonly exchange = "BINANCE" as const;

  private aggregateWs: WebSocket | null = null;
  private depthPool: SharedBinanceWsPool | null = null;  // Shared WS pool — replaces depthWs
  private readonly DEPTH_POOL_CONSUMER_ID = "binance-hub-depth";
  private depthPoolStreams = new Set<string>();  // Tracks streams registered with pool
  private tradeWs: WebSocket | null = null;  // Fast lane: dedicated trade-only WS
  private aggregateUrlIndex = 0;
  private tradeUrlIndex = 0;
  private started = false;
  private aggregateReconnectAttempts = 0;
  private tradeReconnectAttempts = 0;
  private aggregateReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private tradeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotSanityTimer: ReturnType<typeof setInterval> | null = null;
  private contractRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(event: NormalizedEvent) => void>();

  private readonly snapshots = new Map<string, AdapterSymbolSnapshot>();
  private readonly candlesBySymbol = new Map<string, Map<string, AdapterCandlePoint[]>>();
  private readonly recentTradesBySymbol = new Map<string, AdapterTradePoint[]>();
  private readonly orderbooks = new SequenceSafeOrderbookStore();
  private readonly deltaBufferBySymbol = new Map<string, NormalizedBookDeltaEvent[]>();
  private readonly lastBookDeltaAtBySymbol = new Map<string, number>();
  private readonly lastSnapshotAtBySymbol = new Map<string, number>();
  private readonly snapshotFailuresBySymbol = new Map<string, number>();
  private readonly excludedDepthSymbols = new Set<string>();
  private readonly futuresContracts = new Set<string>();
  private readonly depthSymbols = new Set<string>();
  private readonly pendingSnapshotSymbols = new Set<string>();
  private readonly snapshotQueue: string[] = [];
  private readonly snapshotQueueSet = new Set<string>();
  private readonly recentReasons: string[] = [];

  private lastMessageAt = 0;
  private lastError: string | null = null;
  private reconnects = 0;
  private resyncs = 0;
  private gapCount = 0;
  private snapshotFailures = 0;
  private symbolStaleResyncs = 0;
  private snapshotCursor = 0;
  private snapshotBlockedUntil = 0;
  private contractsLoading = false;
  private snapshotDrainInFlight = false;
  private latencyEmaMs: number | null = null;
  private _depthLimitLogged = false;

  // ── Binance REST probe mode (shared via Redis — see ProbeStateManager.ts) ──
  // When REST is consistently failing (rate limited / banned), stop hammering and probe periodically.
  // WS data (SharedBinanceWsPool) continues unaffected — only REST calls are paused.
  // State is stored in Redis so ALL PM2 workers share the same probe/active/recovering state.
  private binanceRestMode: "ACTIVE" | "PROBING" | "RECOVERING" = "ACTIVE";
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private lastProbeAt = 0;
  private lastProbeWeight: number | null = null;
  /** Recovery batch index — tracks which batch of symbols we're re-enqueuing */
  private recoveryBatchIdx = 0;
  /** 500ms batch flush timer for ticker/markPrice events */
  private _tickerFlushTimer: ReturnType<typeof setInterval> | null = null;
  /** Event loop lag detection — identifies what blocks the event loop */
  private _elLagTimer: ReturnType<typeof setInterval> | null = null;
  private _lastElCheck = 0;
  /** Message counters per 30s window for diagnostic */
  private _diagKlineCount = 0;
  private _diagTradeCount = 0;
  private _diagDepthCount = 0;
  private _diagTickerCount = 0;
  private _diagTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.started) return;
    this.started = true;
    // Pre-seed priority symbols so they always get depth/trade subscriptions
    // before random low-volume symbols from !ticker@arr fill the slots
    for (const symbol of PRIORITY_DEPTH_SYMBOLS) {
      this.depthSymbols.add(symbol);
    }
    this.connectAggregate();
    this.connectDepth();
    this.connectTrade();  // Fast lane: dedicated trade WS
    this.startHeartbeat();
    this.startWatchdog();
    this.startSnapshotSanity();
    this.startContractRefresh();
    this.startTickerFlush();  // 500ms batch emit for ticker/markPrice
    this.startDiagnostics();  // Event loop lag + message rate monitor
    // Stagger initial REST calls across PM2 workers to avoid startup burst → 429/418
    const workerId = Number(process.env.NODE_APP_INSTANCE ?? process.env.pm_id ?? 0);
    const staggerMs = workerId * 5_000 + Math.floor(Math.random() * 3_000);
    setTimeout(() => { if (this.started) void this.refreshContracts(); }, staggerMs);
  }

  stop(): void {
    this.started = false;
    if (this.aggregateReconnectTimer) {
      clearTimeout(this.aggregateReconnectTimer);
      this.aggregateReconnectTimer = null;
    }
    // Unregister from SharedBinanceWsPool
    if (this.depthPool) {
      this.depthPool.removeConsumer(this.DEPTH_POOL_CONSUMER_ID);
      this.depthPoolStreams.clear();
      this.depthPool = null;
    }
    if (this.tradeReconnectTimer) {
      clearTimeout(this.tradeReconnectTimer);
      this.tradeReconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.snapshotSanityTimer) {
      clearInterval(this.snapshotSanityTimer);
      this.snapshotSanityTimer = null;
    }
    if (this.contractRefreshTimer) {
      clearInterval(this.contractRefreshTimer);
      this.contractRefreshTimer = null;
    }
    if (this._tickerFlushTimer) {
      clearInterval(this._tickerFlushTimer);
      this._tickerFlushTimer = null;
    }
    if (this._elLagTimer) {
      clearInterval(this._elLagTimer);
      this._elLagTimer = null;
    }
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
    if (this._diagTimer) {
      clearInterval(this._diagTimer);
      this._diagTimer = null;
    }
    if (this.aggregateWs) {
      this.aggregateWs.removeAllListeners();
      this.aggregateWs.terminate();
      this.aggregateWs = null;
    }
    // depthWs replaced by SharedBinanceWsPool — cleanup handled above
    if (this.tradeWs) {
      this.tradeWs.removeAllListeners();
      this.tradeWs.terminate();
      this.tradeWs = null;
    }
  }

  subscribeSymbols(symbols: string[]): void {
    const unique = [...new Set(symbols.map((symbol) => ensureUsdtPair(symbol)).filter(Boolean))];
    if (!unique.length) return;
    const eligible = unique.filter((symbol) => this.isDepthEligible(symbol));
    if (!eligible.length) return;
    const newlyAdded: string[] = [];
    for (const symbol of eligible) {
      if (this.depthSymbols.has(symbol)) continue;
      // Enforce depth symbol limit — prevent 200+ symbols flooding the event loop
      // Each symbol adds ~10 depth msgs/sec + 7 kline streams
      if (this.depthSymbols.size >= MAX_DEPTH_SYMBOLS) {
        // Log once per rejected symbol for debugging
        if (!this._depthLimitLogged) {
          console.log(`[BinanceFuturesAdapter] Depth limit reached (${MAX_DEPTH_SYMBOLS}), not subscribing ${symbol} and future symbols for depth/kline/trade WS`);
          this._depthLimitLogged = true;
        }
        break;
      }
      this.depthSymbols.add(symbol);
      newlyAdded.push(symbol);
    }
    if (!newlyAdded.length) return;
    this.subscribeDepthStreams(newlyAdded);
    this.subscribeTradeStreams(newlyAdded);  // Fast lane: subscribe on trade WS too
    for (const symbol of newlyAdded) {
      this.enqueueSnapshot(symbol);
    }
  }

  onEvent(cb: (event: NormalizedEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getHealth(): AdapterHealthSnapshot {
    const now = Date.now();
    const connectedAggregate = Boolean(this.aggregateWs && this.aggregateWs.readyState === WebSocket.OPEN);
    const connectedDepth = Boolean(this.depthPool && this.depthPool.isReady());
    const connectedTrade = Boolean(this.tradeWs && this.tradeWs.readyState === WebSocket.OPEN);
    const connected = connectedAggregate && connectedDepth && connectedTrade;
    const lastMessageAgeMs = this.lastMessageAt > 0 ? Math.max(0, now - this.lastMessageAt) : Number.POSITIVE_INFINITY;
    let score = connected ? 100 : (connectedAggregate || connectedDepth || connectedTrade) ? 58 : 20;
    if (lastMessageAgeMs > 3_000) score -= 8;
    if (lastMessageAgeMs > 6_000) score -= 12;
    if (lastMessageAgeMs > 12_000) score -= 18;
    if (lastMessageAgeMs > 20_000) score -= 25;
    if (this.latencyEmaMs !== null) {
      if (this.latencyEmaMs > 600) score -= 6;
      if (this.latencyEmaMs > 1_200) score -= 8;
      if (this.latencyEmaMs > 2_000) score -= 10;
    }
    score -= Math.min(12, this.gapCount * 0.6);
    score -= Math.min(10, this.resyncs * 0.5);
    score -= Math.min(10, this.symbolStaleResyncs * 0.4);
    score -= Math.min(12, this.snapshotFailures * 1.1);
    score -= Math.min(8, this.pendingSnapshotSymbols.size * 0.7);
    let staleSymbolCount = 0;
    for (const symbol of this.depthSymbols) {
      if (!this.orderbooks.isReady(symbol)) continue;
      const lastDeltaAt = this.lastBookDeltaAtBySymbol.get(symbol) ?? 0;
      if (!lastDeltaAt) continue;
      if (now - lastDeltaAt > SYMBOL_DELTA_STALE_MS) staleSymbolCount += 1;
    }
    if (staleSymbolCount > 0) score -= Math.min(10, staleSymbolCount * 1.2);
    score = Math.max(0, Math.min(100, Math.round(score)));
    const state: AdapterHealthSnapshot["state"] =
      !connected || lastMessageAgeMs > WATCHDOG_STALE_MS
        ? "down"
        : score >= 78
          ? "healthy"
          : "degraded";
    const reasons: string[] = [];
    if (!connectedAggregate) reasons.push("aggregate_ws_disconnected");
    if (!connectedDepth) reasons.push("depth_ws_disconnected");
    if (!connectedTrade) reasons.push("trade_ws_disconnected");
    if (lastMessageAgeMs > 6_000) reasons.push(`message_age_${Math.round(lastMessageAgeMs)}ms`);
    if (staleSymbolCount > 0) reasons.push(`stale_symbols_${staleSymbolCount}`);
    if (this.snapshotFailures > 0) reasons.push(`snapshot_failures_${this.snapshotFailures}`);
    if (this.pendingSnapshotSymbols.size > 0) reasons.push(`snapshot_pending_${this.pendingSnapshotSymbols.size}`);
    if (this.snapshotBlockedUntil > now) reasons.push(`snapshot_blocked_${Math.max(1, Math.round((this.snapshotBlockedUntil - now) / 1000))}s`);
    if (this.binanceRestMode === "PROBING") reasons.push(`rest_probe_mode(w=${this.lastProbeWeight ?? "?"})`);
    if (this.binanceRestMode === "RECOVERING") reasons.push(`rest_recovering(w=${this.lastProbeWeight ?? "?"})`);
    if (this.lastError) reasons.push(this.lastError);
    for (const reason of this.recentReasons.slice(-3)) reasons.push(reason);
    return {
      exchange: this.exchange,
      score,
      state,
      connected,
      latencyMs: this.latencyEmaMs !== null ? Math.round(this.latencyEmaMs) : null,
      lastMessageAt: this.lastMessageAt || null,
      lastMessageAgeMs: Number.isFinite(lastMessageAgeMs) ? lastMessageAgeMs : 99_999_999,
      reconnects: this.reconnects,
      resyncs: this.resyncs,
      gapCount: this.gapCount,
      reasons: [...new Set(reasons)].slice(0, 8),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // BINANCE REST PROBE MODE — Shared via Redis (ProbeStateManager.ts)
  // All workers share the same probe state. One worker detects failure → all workers pause.
  // Recovery is staged: /time probe → light snapshot → full active (storm-protected).
  // ═══════════════════════════════════════════════════════════════

  private async enterProbeMode(reason: string): Promise<void> {
    if (this.binanceRestMode === "PROBING") return;
    this.binanceRestMode = "PROBING";

    // Clear snapshot queue to stop hammering
    this.snapshotQueue.length = 0;
    this.snapshotQueueSet.clear();
    this.pendingSnapshotSymbols.clear();

    // Write shared state to Redis — all workers will see this
    const { enterProbeMode: redisEnterProbe, getProbeConfig } = await import("./ProbeStateManager.ts");
    await redisEnterProbe("binance", reason);

    // Start periodic probe
    const config = getProbeConfig("binance");
    if (this.probeTimer) clearInterval(this.probeTimer);
    this.probeTimer = setInterval(() => void this.probeBinanceRest(), config.probeIntervalMs);
  }

  private async exitProbeMode(weight: number): Promise<void> {
    if (this.binanceRestMode !== "PROBING" && this.binanceRestMode !== "RECOVERING") return;
    this.binanceRestMode = "ACTIVE";
    this.snapshotFailures = 0;
    this.snapshotFailuresBySymbol.clear();
    this.recoveryBatchIdx = 0;

    if (this.probeTimer) { clearInterval(this.probeTimer); this.probeTimer = null; }

    // Write shared state to Redis
    const { exitProbeMode: redisExitProbe } = await import("./ProbeStateManager.ts");
    await redisExitProbe("binance", weight);

    // Recovery storm protection: re-enqueue snapshots in batches with jitter
    const { buildRecoveryBatches, recoveryJitter, getProbeConfig } = await import("./ProbeStateManager.ts");
    const config = getProbeConfig("binance");
    const batches = buildRecoveryBatches(
      [...this.depthSymbols],
      PRIORITY_DEPTH_SYMBOLS,
      config.recoveryBatchSize,
    );
    for (const batch of batches) {
      for (const symbol of batch) {
        this.enqueueSnapshot(symbol);
      }
      if (batches.indexOf(batch) < batches.length - 1) {
        await recoveryJitter(config.recoveryJitterMs);
      }
    }
  }

  private async startRecoveryStage(weight: number): Promise<void> {
    if (this.binanceRestMode !== "PROBING") return;
    this.binanceRestMode = "RECOVERING";

    const { enterRecoveryMode } = await import("./ProbeStateManager.ts");
    await enterRecoveryMode("binance", weight);

    // Stage 2: try ONE lightweight snapshot to confirm REST is truly healthy
    const testSymbol = PRIORITY_DEPTH_SYMBOLS[0] ?? "BTCUSDT";
    try {
      const { binanceFetch } = await import("../binanceRateLimiter.ts");
      const res = await binanceFetch({
        url: `${BINANCE_DEPTH_SNAPSHOT_BASE}/fapi/v1/depth?symbol=${testSymbol}&limit=5`,
        init: { signal: AbortSignal.timeout(5_000) },
        priority: "normal",
        weight: 5,
        dedupKey: `probe-confirm-${testSymbol}`,
      });
      if (res.ok) {
        const weightStr = res.headers.get("X-MBX-USED-WEIGHT-1M");
        const confirmWeight = weightStr ? parseInt(weightStr) : weight;
        const { getProbeConfig } = await import("./ProbeStateManager.ts");
        const config = getProbeConfig("binance");
        if (confirmWeight < config.recoveryConfirmThreshold) {
          // Stage 3: confirmed — full active restore
          console.log(`[BinanceFuturesAdapter] Recovery confirmed — snapshot OK, weight=${confirmWeight}`);
          await this.exitProbeMode(confirmWeight);
        } else {
          // Weight spiked during confirm — back to PROBING
          console.log(`[BinanceFuturesAdapter] Recovery aborted — weight ${confirmWeight} > ${config.recoveryConfirmThreshold}`);
          this.binanceRestMode = "PROBING";
          const { recordRestoreFailure } = await import("./ProbeStateManager.ts");
          await recordRestoreFailure("binance");
        }
      } else {
        console.log(`[BinanceFuturesAdapter] Recovery snapshot HTTP ${res.status} — back to PROBING`);
        this.binanceRestMode = "PROBING";
        const { recordRestoreFailure, enterProbeMode: reEnterProbe } = await import("./ProbeStateManager.ts");
        await recordRestoreFailure("binance");
        await reEnterProbe("binance", `recovery_snapshot_${res.status}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      console.log(`[BinanceFuturesAdapter] Recovery snapshot failed: ${msg} — back to PROBING`);
      this.binanceRestMode = "PROBING";
      const { recordRestoreFailure } = await import("./ProbeStateManager.ts");
      await recordRestoreFailure("binance");
    }
  }

  private async probeBinanceRest(): Promise<void> {
    this.lastProbeAt = Date.now();

    // First check shared Redis state — another worker may have already recovered
    try {
      const { getProbeState } = await import("./ProbeStateManager.ts");
      const shared = await getProbeState("binance");
      if (shared.mode === "ACTIVE" && this.binanceRestMode !== "ACTIVE") {
        console.log(`[BinanceFuturesAdapter] Peer recovered — syncing to ACTIVE (weight=${shared.lastWeight ?? "?"})`);
        await this.exitProbeMode(shared.lastWeight ?? 0);
        return;
      }
    } catch { /* Redis unavailable — continue with local probe */ }

    try {
      const { binanceFetch } = await import("../binanceRateLimiter.ts");
      const { recordProbeAttempt, getProbeConfig } = await import("./ProbeStateManager.ts");
      const config = getProbeConfig("binance");

      const res = await binanceFetch({
        url: `${BINANCE_DEPTH_SNAPSHOT_BASE}/fapi/v1/time`,
        init: { signal: AbortSignal.timeout(5_000) },
        priority: "normal",
        weight: 1,
        dedupKey: "binance-rest-probe",
      });
      if (res.ok) {
        const weightStr = res.headers.get("X-MBX-USED-WEIGHT-1M");
        this.lastProbeWeight = weightStr ? parseInt(weightStr) : null;
        await recordProbeAttempt("binance", this.lastProbeWeight);
        console.log(`[BinanceFuturesAdapter] Probe OK — weight: ${this.lastProbeWeight ?? "?"}/${1200}`);

        // Stage 1 passed — check weight threshold
        if (this.lastProbeWeight === null || this.lastProbeWeight < config.recoveryWeightThreshold) {
          // Stage 2: try a light snapshot to confirm
          await this.startRecoveryStage(this.lastProbeWeight ?? 0);
        }
      } else {
        console.log(`[BinanceFuturesAdapter] Probe HTTP ${res.status}`);
        await recordProbeAttempt("binance", res.status === 429 || res.status === 418 ? 9999 : null);
        if (res.status === 429 || res.status === 418 || res.status === 403) {
          this.lastProbeWeight = 9999;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      if (msg.includes("soft_limit") || msg.includes("hard_limit")) {
        const weightMatch = msg.match(/weight (\d+)/);
        this.lastProbeWeight = weightMatch ? parseInt(weightMatch[1]) : null;
        const { recordProbeAttempt } = await import("./ProbeStateManager.ts");
        await recordProbeAttempt("binance", this.lastProbeWeight);
        console.log(`[BinanceFuturesAdapter] Probe blocked by RL — weight: ${this.lastProbeWeight ?? "?"}/${1200}`);
      } else {
        console.log(`[BinanceFuturesAdapter] Probe failed: ${msg}`);
      }
    }
  }

  /** Sync local probe state from Redis (called periodically by non-primary workers) */
  async syncProbeStateFromRedis(): Promise<void> {
    try {
      const { getProbeState } = await import("./ProbeStateManager.ts");
      const shared = await getProbeState("binance");
      if (shared.mode !== this.binanceRestMode) {
        console.log(`[BinanceFuturesAdapter] Syncing probe state: ${this.binanceRestMode} → ${shared.mode}`);
        this.binanceRestMode = shared.mode;
        this.lastProbeWeight = shared.lastWeight;
        if (shared.mode === "PROBING" || shared.mode === "RECOVERING") {
          // Another worker entered probe mode — clear our local queues too
          this.snapshotQueue.length = 0;
          this.snapshotQueueSet.clear();
          this.pendingSnapshotSymbols.clear();
        }
      }
    } catch { /* Redis unavailable — keep local state */ }
  }

  /** Get current REST mode for external monitoring */
  getRestMode(): string { return this.binanceRestMode; }

  getSnapshot(symbol: string): AdapterSymbolSnapshot | null {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized) return null;
    return this.snapshots.get(normalized) ?? null;
  }

  getCandles(symbol: string, interval: string, limit: number): AdapterCandlePoint[] {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized) return [];
    const byInterval = this.candlesBySymbol.get(normalized);
    if (!byInterval) return [];
    const rows = byInterval.get(interval.toLowerCase()) ?? [];
    if (!rows.length) return [];
    return rows.slice(-Math.max(1, Math.min(1500, limit)));
  }

  getRecentTrades(symbol: string, limit: number): AdapterTradePoint[] {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized) return [];
    const rows = this.recentTradesBySymbol.get(normalized) ?? [];
    if (!rows.length) return [];
    return rows.slice(-Math.max(1, Math.min(900, limit)));
  }

  /** Return full orderbook depth (up to 20 levels per side) from in-memory WS data. */
  getOrderbook(symbol: string): { exchange: string; symbol: string; bids: Array<{ price: number; qty: number }>; asks: Array<{ price: number; qty: number }>; ts: number } | null {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized || !this.orderbooks.isReady(normalized)) return null;
    const depth = this.orderbooks.getDepthLevels(normalized, 20);
    if (!depth || (depth.bids.length === 0 && depth.asks.length === 0)) return null;
    return {
      exchange: this.exchange,
      symbol: normalized,
      bids: depth.bids.map(([price, qty]) => ({ price, qty })),
      asks: depth.asks.map(([price, qty]) => ({ price, qty })),
      ts: Date.now(),
    };
  }

  private emit(event: NormalizedEvent): void {
    for (const cb of this.listeners) cb(event);
  }

  private pushReason(reason: string): void {
    this.recentReasons.push(`${nowIso()}:${reason}`);
    if (this.recentReasons.length > 30) {
      this.recentReasons.splice(0, this.recentReasons.length - 30);
    }
  }

  private touchMessage(eventTs?: number | null): void {
    const now = Date.now();
    this.lastMessageAt = now;
    if (eventTs === null || eventTs === undefined || !Number.isFinite(eventTs) || eventTs <= 0) return;
    const latency = Math.max(0, now - Number(eventTs));
    this.latencyEmaMs = this.latencyEmaMs === null ? latency : this.latencyEmaMs * 0.8 + latency * 0.2;
  }

  private connectAggregate(): void {
    if (!this.started) return;
    if (this.aggregateWs) {
      this.aggregateWs.removeAllListeners();
      this.aggregateWs.terminate();
      this.aggregateWs = null;
    }
    const url = BINANCE_AGGREGATE_URLS[this.aggregateUrlIndex] ?? BINANCE_AGGREGATE_URLS[0];
    const ws = new WebSocket(url, { handshakeTimeout: 10_000, perMessageDeflate: false });
    this.aggregateWs = ws;

    ws.on("open", () => {
      this.aggregateReconnectAttempts = 0;
      this.lastError = null;
      this.touchMessage(Date.now());
      this.pushReason("aggregate_open");
    });

    ws.on("message", (raw) => {
      this.parseAggregateMessage(raw);
    });

    ws.on("pong", () => {
      this.touchMessage(Date.now());
    });

    ws.on("close", () => {
      if (!this.started) return;
      this.pushReason("aggregate_close");
      this.scheduleAggregateReconnect();
    });

    ws.on("error", (error) => {
      if (!this.started) return;
      this.lastError = error instanceof Error ? error.message : "aggregate_ws_error";
      this.pushReason(`aggregate_error:${this.lastError}`);
      this.scheduleAggregateReconnect();
    });
  }

  private connectDepth(): void {
    if (!this.started) return;
    // Use SharedBinanceWsPool instead of opening a dedicated WS
    const pool = getSharedBinanceWsPool();
    this.depthPool = pool;

    // Register as consumer (idempotent — won't double-register)
    pool.registerConsumer(this.DEPTH_POOL_CONSUMER_ID, (stream: string, data: unknown) => {
      // Route pool messages through parseDepthMessage (accepts pre-parsed data)
      this.handlePoolDepthMessage(stream, data);
    });
    console.log(`[BinanceFuturesAdapter] Using SharedBinanceWsPool for depth+klines (consumers=${pool.getConsumerCount()})`);

    this.pushReason("depth_pool_open");
    this.touchMessage(Date.now());

    // Subscribe all current depth symbols
    this.subscribeDepthStreams([...this.depthSymbols]);

    for (const symbol of this.depthSymbols) {
      this.resetSymbolSyncState(symbol);
      this.enqueueSnapshot(symbol);
    }
    // Backfill candles only if REST API is not blocked (403 = IP ban)
    if (this.snapshotBlockedUntil <= Date.now()) {
      void this.backfillCandles([...this.depthSymbols]);
    } else {
      this.pushReason("backfill_skipped:rest_blocked");
    }
  }

  /** Handle messages from SharedBinanceWsPool — pre-parsed data */
  private handlePoolDepthMessage(_stream: string, data: unknown): void {
    const rec = data as Record<string, unknown>;
    if ("result" in rec && rec.result === null) return;
    const eventType = String(rec.e ?? "");
    if (eventType === "kline") {
      this.onKline(rec);
      return;
    }
    if (eventType === "depthUpdate") {
      this.onDepthDelta(rec);
    }
    this.touchMessage(Date.now());
  }

  private scheduleAggregateReconnect(): void {
    if (!this.started || this.aggregateReconnectTimer) return;
    this.aggregateReconnectAttempts += 1;
    this.reconnects += 1;
    this.aggregateUrlIndex = (this.aggregateUrlIndex + 1) % BINANCE_AGGREGATE_URLS.length;
    const waitMs = computeBackoff(this.aggregateReconnectAttempts);
    this.aggregateReconnectTimer = setTimeout(() => {
      this.aggregateReconnectTimer = null;
      this.connectAggregate();
    }, waitMs);
  }

  // scheduleDepthReconnect removed — SharedBinanceWsPool handles reconnection internally

  // ═══════════════════════════════════════════════════════════════════
  // FAST LANE: Dedicated trade-only WS connection
  //  Isolates trade events from depth/kline flood (~2000+ msg/sec)
  //  Expected: BTCUSDT trade latency drops from p50=200-900ms → ~35-50ms
  // ═══════════════════════════════════════════════════════════════════

  private connectTrade(): void {
    if (!this.started) return;
    if (this.tradeWs) {
      this.tradeWs.removeAllListeners();
      this.tradeWs.terminate();
      this.tradeWs = null;
    }
    const url = BINANCE_TRADE_URLS[this.tradeUrlIndex] ?? BINANCE_TRADE_URLS[0];
    const ws = new WebSocket(url, { handshakeTimeout: 10_000, perMessageDeflate: false });
    this.tradeWs = ws;

    ws.on("open", () => {
      this.tradeReconnectAttempts = 0;
      this.lastError = null;
      this.touchMessage(Date.now());
      this.pushReason("trade_fast_lane_open");
      // Subscribe all tracked symbols for @trade on the fast lane
      this.subscribeTradeStreams([...this.depthSymbols]);
    });

    ws.on("message", (raw) => {
      this.parseTradeMessage(raw);
    });

    ws.on("pong", () => {
      this.touchMessage(Date.now());
    });

    ws.on("close", () => {
      if (!this.started) return;
      this.pushReason("trade_fast_lane_close");
      this.scheduleTradeReconnect();
    });

    ws.on("error", (error) => {
      if (!this.started) return;
      this.lastError = error instanceof Error ? error.message : "trade_ws_error";
      this.pushReason(`trade_fast_lane_error:${this.lastError}`);
      this.scheduleTradeReconnect();
    });
  }

  /** Parse messages on the fast-lane trade WS — ONLY handles trade events */
  private parseTradeMessage(raw: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(toText(raw));
    } catch {
      return;
    }
    const rec = parsed as Record<string, unknown>;
    if ("result" in rec && rec.result === null) return; // subscription ack
    const eventType = String(rec.e ?? "");
    if (eventType === "trade" || eventType === "aggTrade") {
      this.onTrade(rec);
    }
  }

  private scheduleTradeReconnect(): void {
    if (!this.started || this.tradeReconnectTimer) return;
    this.tradeReconnectAttempts += 1;
    this.reconnects += 1;
    this.tradeUrlIndex = (this.tradeUrlIndex + 1) % BINANCE_TRADE_URLS.length;
    const waitMs = computeBackoff(this.tradeReconnectAttempts);
    this.tradeReconnectTimer = setTimeout(() => {
      this.tradeReconnectTimer = null;
      this.connectTrade();
    }, waitMs);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.aggregateWs && this.aggregateWs.readyState === WebSocket.OPEN) {
        try {
          this.aggregateWs.ping();
        } catch {
          // no-op
        }
      }
      // depthWs ping handled by SharedBinanceWsPool internally
      if (this.tradeWs && this.tradeWs.readyState === WebSocket.OPEN) {
        try {
          this.tradeWs.ping();
        } catch {
          // no-op
        }
      }
    }, HEARTBEAT_PING_MS);
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      if (!this.started) return;
      const ageMs = this.lastMessageAt > 0 ? Date.now() - this.lastMessageAt : Number.POSITIVE_INFINITY;
      if (ageMs <= WATCHDOG_STALE_MS) return;
      this.pushReason(`watchdog_reconnect_${Math.round(ageMs)}ms`);
      if (this.aggregateWs) {
        try {
          this.aggregateWs.terminate();
        } catch {
          // no-op
        }
      }
      // depthWs replaced by SharedBinanceWsPool — reconnect handled internally
      if (this.tradeWs) {
        try {
          this.tradeWs.terminate();
        } catch {
          // no-op
        }
      }
    }, WATCHDOG_TICK_MS);
  }

  private startSnapshotSanity(): void {
    if (this.snapshotSanityTimer) clearInterval(this.snapshotSanityTimer);
    this.snapshotSanityTimer = setInterval(() => {
      if (!this.started) return;
      const now = Date.now();
      for (const symbol of this.depthSymbols) {
        if (!this.isDepthEligible(symbol)) continue;
        if (!this.orderbooks.isReady(symbol)) {
          if (!this.pendingSnapshotSymbols.has(symbol)) this.enqueueSnapshot(symbol);
          continue;
        }
        const lastDeltaAt = this.lastBookDeltaAtBySymbol.get(symbol) ?? 0;
        if (lastDeltaAt > 0 && now - lastDeltaAt > SYMBOL_DELTA_STALE_MS) {
          if (!this.pendingSnapshotSymbols.has(symbol)) {
            this.symbolStaleResyncs += 1;
            this.pushReason(`symbol_delta_stale:${symbol}:${Math.round(now - lastDeltaAt)}ms`);
            this.resetSymbolSyncState(symbol);
            this.enqueueSnapshot(symbol);
          }
        }
      }

      const symbols = [...this.depthSymbols].filter((symbol) => this.isDepthEligible(symbol));
      if (!symbols.length) return;
      const total = symbols.length;
      const batch = Math.min(SNAPSHOT_SANITY_BATCH, total);
      for (let i = 0; i < batch; i += 1) {
        const idx = (this.snapshotCursor + i) % total;
        const symbol = symbols[idx]!;
        const lastSnapshotAt = this.lastSnapshotAtBySymbol.get(symbol) ?? 0;
        if (lastSnapshotAt > 0 && now - lastSnapshotAt < SNAPSHOT_REFRESH_MIN_MS) continue;
        if (this.pendingSnapshotSymbols.has(symbol)) continue;
        this.enqueueSnapshot(symbol);
      }
      this.snapshotCursor = (this.snapshotCursor + batch) % total;
    }, SNAPSHOT_SANITY_INTERVAL_MS);
  }

  private startContractRefresh(): void {
    if (this.contractRefreshTimer) clearInterval(this.contractRefreshTimer);
    this.contractRefreshTimer = setInterval(() => {
      void this.refreshContracts();
    }, CONTRACT_REFRESH_INTERVAL_MS);
  }

  /**
   * Event loop lag monitor + message rate diagnostics.
   * Detects what's blocking the Node.js event loop.
   */
  private startDiagnostics(): void {
    // Event loop lag: measure timer drift every 200ms
    this._lastElCheck = Date.now();
    this._elLagTimer = setInterval(() => {
      const now = Date.now();
      const expected = 200; // timer interval
      const lag = now - this._lastElCheck - expected;
      this._lastElCheck = now;
      // Log if event loop was blocked for > 50ms
      if (lag > 50) {
        console.log(`[EL_LAG] ${lag}ms event loop block detected`);
      }
    }, 200);

    // Message rate diagnostics + probe state sync: every 30s
    this._diagTimer = setInterval(() => {
      console.log(`[MSG_RATE] 30s: kline=${this._diagKlineCount} trade=${this._diagTradeCount} depth=${this._diagDepthCount} tickerArr=${this._diagTickerCount} depthSymbols=${this.depthSymbols.size} snapshots=${this.snapshots.size} restMode=${this.binanceRestMode}`);
      this._diagKlineCount = 0;
      this._diagTradeCount = 0;
      this._diagDepthCount = 0;
      this._diagTickerCount = 0;
      // Sync probe state from Redis — ensures all workers follow the same state
      void this.syncProbeStateFromRedis();
    }, 30_000);
  }

  /**
   * 500ms batch flush for ticker + markPrice events.
   * tickerArr/markPriceArr are CACHE-ONLY (update snapshots instantly, no emit).
   * This timer emits ticker + mark_price events for depth symbols every 500ms.
   * Result: event loop stays clean during !ticker@arr processing (300+ rows),
   * and the hub/bridge still gets periodic updates for Redis live snapshot.
   */
  private startTickerFlush(): void {
    if (this._tickerFlushTimer) clearInterval(this._tickerFlushTimer);
    this._tickerFlushTimer = setInterval(() => {
      if (!this.started) return;
      const now = Date.now();
      for (const symbol of this.depthSymbols) {
        const snap = this.snapshots.get(symbol);
        if (!snap) continue;
        if (snap.price !== null) {
          this.emit({
            type: "ticker",
            exchange: this.exchange,
            symbol,
            ts: snap.sourceTs ?? now,
            recvTs: now,
            price: snap.price,
            change24hPct: snap.change24hPct ?? 0,
            volume24hUsd: snap.volume24hUsd ?? 0,
          });
        }
        if (snap.markPrice !== null) {
          this.emit({
            type: "mark_price",
            exchange: this.exchange,
            symbol,
            ts: snap.sourceTs ?? now,
            recvTs: now,
            markPrice: snap.markPrice,
            fundingRate: snap.fundingRate,
            nextFundingTime: snap.nextFundingTime,
          });
        }
      }
    }, 500);
  }

  /** Subscribe depth + kline streams on the depth WS (NO trade — trade is on fast lane) */
  private subscribeDepthStreams(symbols: string[]): void {
    if (!this.depthPool || !symbols.length) return;
    const params: string[] = [];
    for (const symbol of symbols) {
      if (!this.isDepthEligible(symbol)) continue;
      const lower = symbol.toLowerCase();
      params.push(`${lower}@depth@500ms`);
      // NOTE: @trade removed from depth WS — now on dedicated tradeWs fast lane
      for (const frame of BINANCE_CANDLE_INTERVALS) {
        params.push(`${lower}@kline_${frame}`);
      }
    }
    if (!params.length) return;
    // Track all streams we registered with the pool
    for (const p of params) this.depthPoolStreams.add(p);
    this.depthPool.subscribe(this.DEPTH_POOL_CONSUMER_ID, params);
  }

  /** Subscribe ONLY trade streams on the dedicated fast-lane WS */
  private subscribeTradeStreams(symbols: string[]): void {
    const ws = this.tradeWs;
    if (!ws || ws.readyState !== WebSocket.OPEN || !symbols.length) return;
    const params: string[] = [];
    for (const symbol of symbols) {
      if (!this.isDepthEligible(symbol)) continue;
      params.push(`${symbol.toLowerCase()}@trade`);
    }
    if (!params.length) return;
    const chunkSize = 200; // trade-only: can use larger chunks
    let messageId = Date.now();
    for (let i = 0; i < params.length; i += chunkSize) {
      const chunk = params.slice(i, i + chunkSize);
      ws.send(
        JSON.stringify({
          method: "SUBSCRIBE",
          params: chunk,
          id: messageId,
        }),
      );
      messageId += 1;
    }
  }

  private parseAggregateMessage(raw: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(toText(raw));
    } catch {
      return;
    }
    const root = parsed as Record<string, unknown>;
    const stream = String(root.stream ?? "").toLowerCase();
    const data = root.data;
    if (!stream || data === undefined) return;

    // ══════════════════════════════════════════════════════════════
    // tickerArr: CACHE-ONLY — direct mutate snapshots, NO emit.
    // Ticker events are batched via 500ms flush timer (startTickerFlush).
    // This keeps the event loop clean for trade latency.
    // ══════════════════════════════════════════════════════════════
    if (stream.includes("!ticker@arr") && Array.isArray(data)) {
      this._diagTickerCount += 1;
      this.touchMessage(Date.now());
      for (const row of data) {
        const rec = row as Record<string, unknown>;
        const rawSymbol = String(rec.s ?? "");
        // Skip non-USDT pairs (COIN-margined futures like BTCUSD_PERP)
        if (!rawSymbol || !rawSymbol.endsWith("USDT")) continue;
        const price = toNum(rec.c);
        if (price === null) continue;
        // Direct cache mutation — no patchSnapshot, no ensureUsdtPair, no intermediate object
        let snap = this.snapshots.get(rawSymbol);
        if (!snap) {
          snap = {
            exchange: this.exchange, symbol: rawSymbol, price: null,
            change24hPct: null, volume24hUsd: null, topBid: null, topAsk: null,
            bidQty: null, askQty: null, spreadBps: null, depthUsd: null,
            imbalance: null, markPrice: null, fundingRate: null,
            nextFundingTime: null, lastTradePrice: null, lastTradeQty: null,
            lastTradeSide: null, sourceTs: null, updatedAt: Date.now(),
          };
          this.snapshots.set(rawSymbol, snap);
        }
        snap.price = price;
        const change = toNum(rec.P);
        if (change !== null) snap.change24hPct = change;
        const vol = toNum(rec.q);
        if (vol !== null) snap.volume24hUsd = vol;
        snap.sourceTs = toNum(rec.E) ?? Date.now();
        snap.updatedAt = Date.now();
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════
    // markPriceArr: CACHE-ONLY — same strategy as tickerArr.
    // ══════════════════════════════════════════════════════════════
    if (stream.includes("!markprice@arr") && Array.isArray(data)) {
      this.touchMessage(Date.now());
      for (const row of data) {
        const rec = row as Record<string, unknown>;
        const rawSymbol = String(rec.s ?? "");
        if (!rawSymbol || !rawSymbol.endsWith("USDT")) continue;
        const markPrice = toNum(rec.p);
        if (markPrice === null) continue;
        let snap = this.snapshots.get(rawSymbol);
        if (!snap) {
          snap = {
            exchange: this.exchange, symbol: rawSymbol, price: null,
            change24hPct: null, volume24hUsd: null, topBid: null, topAsk: null,
            bidQty: null, askQty: null, spreadBps: null, depthUsd: null,
            imbalance: null, markPrice: null, fundingRate: null,
            nextFundingTime: null, lastTradePrice: null, lastTradeQty: null,
            lastTradeSide: null, sourceTs: null, updatedAt: Date.now(),
          };
          this.snapshots.set(rawSymbol, snap);
        }
        snap.markPrice = markPrice;
        const fr = toNum(rec.r);
        if (fr !== null) snap.fundingRate = fr;
        const nft = toNum(rec.T);
        if (nft !== null) snap.nextFundingTime = nft;
        snap.sourceTs = toNum(rec.E) ?? Date.now();
        snap.updatedAt = Date.now();
      }
      return;
    }

    if (stream.includes("!bookticker")) {
      const rec = (data ?? {}) as Record<string, unknown>;
      const symbol = ensureUsdtPair(rec.s);
      if (!symbol) return;
      const bid = toNum(rec.b);
      const ask = toNum(rec.a);
      if (bid === null || ask === null || bid <= 0 || ask <= 0) return;
      const bidQty = toNum(rec.B);
      const askQty = toNum(rec.A);
      const ts = toNum(rec.E) ?? Date.now();
      const mid = (bid + ask) / 2;
      const spreadBps = mid > 0 ? ((ask - bid) / mid) * 10_000 : null;
      const bidDepthUsd = bidQty !== null && bidQty > 0 ? bid * bidQty : null;
      const askDepthUsd = askQty !== null && askQty > 0 ? ask * askQty : null;
      const depthUsd =
        bidDepthUsd !== null || askDepthUsd !== null
          ? Math.max(0, (bidDepthUsd ?? 0) + (askDepthUsd ?? 0))
          : null;
      const imbalance =
        depthUsd && depthUsd > 0
          ? (((bidDepthUsd ?? 0) - (askDepthUsd ?? 0)) / depthUsd)
          : null;
      this.touchMessage(ts);
      this.patchSnapshot(symbol, {
        topBid: bid,
        topAsk: ask,
        bidQty: bidQty ?? null,
        askQty: askQty ?? null,
        spreadBps,
        depthUsd,
        imbalance,
        sourceTs: ts,
      });
      this.emit({
        type: "book_ticker",
        exchange: this.exchange,
        symbol,
        ts,
        recvTs: Date.now(),
        bid,
        ask,
        bidQty: bidQty ?? undefined,
        askQty: askQty ?? undefined,
      });
    }
  }

  // parseDepthMessage removed — replaced by handlePoolDepthMessage (SharedBinanceWsPool integration)

  /** Diagnostic counter for raw trade timestamp debugging */
  private _rawTradeDiag = 0;

  private onTrade(rec: Record<string, unknown>): void {
    this._diagTradeCount += 1;
    const raw = String(rec.s ?? "");
    // Fast path: Binance sends uppercase USDT pairs — skip regex normalize
    const symbol = raw.endsWith("USDT") ? raw : ensureUsdtPair(raw);
    if (!symbol) return;
    const price = toNum(rec.p);
    const qty = toNum(rec.q);
    if (price === null || qty === null || price <= 0 || qty <= 0) return;
    const ts = toNum(rec.T) ?? toNum(rec.E) ?? Date.now();

    // Diagnostic: log raw timestamp fields for BTCUSDT (1 in 500)
    if (symbol === "BTCUSDT" && ++this._rawTradeDiag % 500 === 0) {
      const now = Date.now();
      console.log(`[RAW_TRADE] BTCUSDT T=${rec.T} E=${rec.E} ts=${ts} now=${now} T-now=${now - ts}ms E-now=${now - (toNum(rec.E) ?? 0)}ms price=${price}`);
    }

    this.touchMessage(ts);
    const side: "BUY" | "SELL" = rec.m === true ? "SELL" : "BUY";
    // Inline snapshot patch — skip patchSnapshot overhead (ensureUsdtPair + for..in + object alloc)
    const snap = this.snapshots.get(symbol);
    if (snap) {
      snap.lastTradePrice = price;
      snap.lastTradeQty = qty;
      snap.lastTradeSide = side;
      snap.sourceTs = ts;
      snap.updatedAt = Date.now();
    } else {
      this.patchSnapshot(symbol, { lastTradePrice: price, lastTradeQty: qty, lastTradeSide: side, sourceTs: ts });
    }
    this.appendRecentTrade(symbol, { ts, price, amount: qty, side });
    const event: NormalizedTradeEvent = {
      type: "trade",
      exchange: this.exchange,
      symbol,
      ts,
      recvTs: Date.now(),
      tradeId: rec.t !== undefined ? String(rec.t) : undefined,
      price,
      qty,
      side,
    };
    this.emit(event);
  }

  private onKline(rec: Record<string, unknown>): void {
    this._diagKlineCount += 1;
    const raw = String(rec.s ?? "");
    const symbol = raw.endsWith("USDT") ? raw : ensureUsdtPair(raw);
    if (!symbol) return;
    const k = (rec.k ?? {}) as Record<string, unknown>;
    const interval = String(k.i ?? "").toLowerCase();
    if (!interval) return;
    const openTime = toNum(k.t);
    const open = toNum(k.o);
    const high = toNum(k.h);
    const low = toNum(k.l);
    const close = toNum(k.c);
    const volume = toNum(k.v) ?? 0;
    const closed = Boolean(k.x); // true if candle is final/closed
    if (openTime === null || open === null || high === null || low === null || close === null) return;
    const candle: AdapterCandlePoint = {
      time: Math.floor(openTime / 1000),
      open,
      high,
      low,
      close,
      volume: Math.max(0, volume),
    };
    this.upsertCandle(symbol, interval, candle);
    // Use Binance event time (rec.E), NOT kline close time (k.T) which is in the future for open candles
    const ts = toNum(rec.E) ?? Date.now();
    this.touchMessage(ts);
    // Inline snapshot patch for hot path
    const snap = this.snapshots.get(symbol);
    if (snap) {
      snap.price = close;
      snap.sourceTs = ts;
      snap.updatedAt = Date.now();
    } else {
      this.patchSnapshot(symbol, { price: close, sourceTs: ts });
    }
    // Emit canonical kline event for real-time candle push
    const klineEvent: NormalizedKlineEvent = {
      type: "kline",
      exchange: this.exchange,
      symbol,
      ts,
      recvTs: Date.now(),
      interval,
      openTime: Math.floor(openTime / 1000),
      open,
      high,
      low,
      close,
      volume: Math.max(0, volume),
      closed,
    };
    this.emit(klineEvent);
  }

  private onDepthDelta(rec: Record<string, unknown>): void {
    this._diagDepthCount += 1;
    const symbol = ensureUsdtPair(rec.s);
    if (!symbol) return;
    const startSeq = toNum(rec.U);
    const endSeq = toNum(rec.u);
    if (startSeq === null || endSeq === null) return;
    const bids = levelRows(rec.b);
    const asks = levelRows(rec.a);
    const ts = toNum(rec.E) ?? Date.now();
    this.touchMessage(ts);
    this.lastBookDeltaAtBySymbol.set(symbol, Date.now());

    const delta: NormalizedBookDeltaEvent = {
      type: "book_delta",
      exchange: this.exchange,
      symbol,
      ts,
      recvTs: Date.now(),
      startSeq,
      endSeq,
      bids,
      asks,
    };
    this.emit(delta);

    if (!this.orderbooks.isReady(symbol)) {
      const queue = this.deltaBufferBySymbol.get(symbol) ?? [];
      queue.push(delta);
      if (queue.length > DEPTH_BUFFER_MAX) queue.splice(0, queue.length - DEPTH_BUFFER_MAX);
      this.deltaBufferBySymbol.set(symbol, queue);
      if (!this.pendingSnapshotSymbols.has(symbol)) {
        this.enqueueSnapshot(symbol);
      }
      return;
    }

    const applied = this.orderbooks.applyDelta(symbol, startSeq, endSeq, bids, asks);
    if (!applied.ok && applied.gap) {
      this.gapCount += 1;
      this.pushReason(`depth_gap:${symbol}:${startSeq}-${endSeq}`);
      this.resetSymbolSyncState(symbol);
      this.enqueueSnapshot(symbol);
      return;
    }
    if (applied.applied) {
      this.updateBookDerivedFields(symbol, ts);
    }
  }

  private enqueueSnapshot(symbol: string): void {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized || !this.isDepthEligible(normalized)) return;
    if (this.pendingSnapshotSymbols.has(normalized)) return;
    if (this.snapshotQueueSet.has(normalized)) return;
    this.snapshotQueue.push(normalized);
    this.snapshotQueueSet.add(normalized);
    void this.drainSnapshotQueue();
  }

  private async drainSnapshotQueue(): Promise<void> {
    if (this.snapshotDrainInFlight) return;
    // In PROBING/RECOVERING mode, don't process snapshots — wait for probe to recover
    if (this.binanceRestMode === "PROBING" || this.binanceRestMode === "RECOVERING") return;
    this.snapshotDrainInFlight = true;
    try {
      while (this.started && this.snapshotQueue.length > 0) {
        // Exit drain if we entered probe mode mid-drain
        if (this.binanceRestMode === "PROBING" || this.binanceRestMode === "RECOVERING") break;
        const now = Date.now();
        if (this.snapshotBlockedUntil > now) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(1_500, this.snapshotBlockedUntil - now)));
          continue;
        }
        const symbol = this.snapshotQueue.shift()!;
        this.snapshotQueueSet.delete(symbol);

        // FAZ 4.2: Distributed lock — prevent duplicate snapshot fetches across PM2 workers
        try {
          const { acquireFetchLock, releaseFetchLock } = await import("../marketDataCache.ts");
          const gotLock = await acquireFetchLock("snapshot", symbol);
          if (!gotLock) {
            // Another worker is already fetching this snapshot — skip
            continue;
          }
          try {
            await this.requestDepthSnapshot(symbol);
          } finally {
            void releaseFetchLock("snapshot", symbol);
          }
        } catch {
          // Lock module unavailable — fall back to unlocked fetch
          await this.requestDepthSnapshot(symbol);
        }

        if (this.snapshotQueue.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, SNAPSHOT_REQUEST_GAP_MS));
        }
      }
    } finally {
      this.snapshotDrainInFlight = false;
    }
  }

  private async requestDepthSnapshot(symbol: string): Promise<void> {
    if (!symbol || this.pendingSnapshotSymbols.has(symbol)) return;
    if (!this.isDepthEligible(symbol)) return;
    this.pendingSnapshotSymbols.add(symbol);
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      let res: Response;
      try {
        const { binanceFetch } = await import("../binanceRateLimiter.ts");
        res = await binanceFetch({
          url: `${BINANCE_DEPTH_SNAPSHOT_BASE}/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=100`,
          init: { headers: { accept: "application/json" } },
          priority: "high",
          dedupKey: `hub-depth:${symbol}:100`,
          weight: 10,
        });
      } catch (rlError) {
        // rate limiter blocked (cooldown / circuit / weight limit) — don't treat as real 429
        // Real 429 comes from Binance HTTP response, not from our rate limiter
        const msg = rlError instanceof Error ? rlError.message : "rl_blocked";
        throw new Error(`snapshot_rl_blocked:${msg}`);
      }
      if (!res.ok) {
        throw new Error(`snapshot_http_${res.status}`);
      }
      const snapshotRaw = (await res.json()) as Record<string, unknown>;
      const seq = toNum(snapshotRaw.lastUpdateId);
      if (seq === null) throw new Error("snapshot_no_seq");
      const bids = levelRows(snapshotRaw.bids);
      const asks = levelRows(snapshotRaw.asks);
      const ts = Date.now();
      const snapshotEvent: NormalizedBookSnapshotEvent = {
        type: "book_snapshot",
        exchange: this.exchange,
        symbol,
        ts,
        recvTs: ts,
        seq,
        bids,
        asks,
      };
      this.emit(snapshotEvent);
      this.orderbooks.applySnapshot(symbol, seq, bids, asks);
      this.lastSnapshotAtBySymbol.set(symbol, Date.now());
      this.snapshotFailuresBySymbol.set(symbol, 0);
      this.snapshotFailures = Math.max(0, this.snapshotFailures - 1);
      // REST is working — reset shared failure counter in Redis
      import("./ProbeStateManager.ts").then(m => void m.resetRestFailures("binance")).catch(() => {});

      const buffered = this.deltaBufferBySymbol.get(symbol) ?? [];
      this.deltaBufferBySymbol.delete(symbol);
      if (buffered.length) {
        buffered.sort((a, b) => a.endSeq - b.endSeq);
        for (const delta of buffered) {
          if (delta.endSeq <= seq) continue;
          const applied = this.orderbooks.applyDelta(
            symbol,
            delta.startSeq,
            delta.endSeq,
            delta.bids,
            delta.asks,
          );
          if (!applied.ok && applied.gap) {
            this.gapCount += 1;
            this.pushReason(`snapshot_reconcile_gap:${symbol}`);
            this.resetSymbolSyncState(symbol);
            this.resyncs += 1;
            this.pendingSnapshotSymbols.delete(symbol);
            this.enqueueSnapshot(symbol);
            return;
          }
        }
      }

      this.updateBookDerivedFields(symbol, ts);
      this.resyncs += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "snapshot_error";
      this.lastError = `snapshot:${message}`;
      this.pushReason(`snapshot_fail:${symbol}:${message}`);
      const currentFail = (this.snapshotFailuresBySymbol.get(symbol) ?? 0) + 1;
      this.snapshotFailuresBySymbol.set(symbol, currentFail);
      this.snapshotFailures += 1;
      // Log first 3 failures per symbol for debugging
      if (currentFail <= 3) {
        console.log(`[BinanceFuturesAdapter] Snapshot #${currentFail} failed for ${symbol}: ${message}`);
      }
      const statusMatch = message.match(/snapshot_http_(\d{3})/);
      const statusCode = statusMatch ? Number(statusMatch[1]) : null;

      // Record failure in shared Redis state + check threshold
      try {
        const { recordRestFailure, getProbeConfig, getProbeState } = await import("./ProbeStateManager.ts");
        const config = getProbeConfig("binance");

        if (statusCode && config.immediateProbeStatuses.includes(statusCode)) {
          // IP blocked or rate limited — enter probe mode immediately
          console.log(`[BinanceFuturesAdapter] REST API ${statusCode} — entering probe mode`);
          void this.enterProbeMode(`rest_api_${statusCode}`);
        } else if (statusCode === 400 && currentFail >= 3) {
          this.excludedDepthSymbols.add(symbol);
          this.pushReason(`exclude_depth_symbol:${symbol}`);
        } else {
          const sharedFailures = await recordRestFailure("binance");
          if (sharedFailures >= config.failureThreshold) {
            // Too many consecutive REST failures across all workers — enter probe mode
            void this.enterProbeMode(`${sharedFailures}_consecutive_failures`);
          } else if (currentFail >= 6) {
            this.pushReason(`snapshot_fail_threshold:${symbol}`);
            console.log(`[BinanceFuturesAdapter] Snapshot failed 6+ times for ${symbol} — skipping (WS still running)`);
          }
        }
      } catch {
        // Redis unavailable — fallback to simple skip
        if (currentFail >= 6) {
          this.pushReason(`snapshot_fail_threshold:${symbol}`);
        }
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      this.pendingSnapshotSymbols.delete(symbol);
    }
  }

  private isDepthEligible(symbol: string): boolean {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized) return false;
    if (this.excludedDepthSymbols.has(normalized)) return false;
    if (!this.futuresContracts.size) return true;
    return this.futuresContracts.has(normalized);
  }

  private resetSymbolSyncState(symbol: string): void {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized) return;
    this.orderbooks.reset(normalized);
    this.deltaBufferBySymbol.delete(normalized);
    this.pendingSnapshotSymbols.delete(normalized);
    this.lastBookDeltaAtBySymbol.delete(normalized);
  }

  private async refreshContracts(): Promise<void> {
    if (this.contractsLoading) return;
    this.contractsLoading = true;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      let res: Response;
      try {
        const { binanceFetch } = await import("../binanceRateLimiter.ts");
        res = await binanceFetch({
          url: `${BINANCE_DEPTH_SNAPSHOT_BASE}/fapi/v1/exchangeInfo`,
          init: { headers: { accept: "application/json" } },
          priority: "normal",
          dedupKey: "hub-exchangeInfo",
          weight: 10,
        });
      } catch {
        throw new Error("contracts_http_429");
      }
      if (!res.ok) {
        throw new Error(`contracts_http_${res.status}`);
      }
      const raw = (await res.json()) as Record<string, unknown>;
      const symbols = Array.isArray(raw.symbols) ? raw.symbols : [];
      const next = new Set<string>();
      for (const row of symbols) {
        const rec = row as Record<string, unknown>;
        const contractType = String(rec.contractType ?? "").toUpperCase();
        const status = String(rec.status ?? "").toUpperCase();
        const quoteAsset = String(rec.quoteAsset ?? "").toUpperCase();
        if (status !== "TRADING") continue;
        if (quoteAsset !== "USDT") continue;
        if (contractType && contractType !== "PERPETUAL") continue;
        const symbol = ensureUsdtPair(rec.symbol);
        if (symbol) next.add(symbol);
      }
      if (next.size > 0) {
        this.futuresContracts.clear();
        for (const symbol of next) this.futuresContracts.add(symbol);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "contracts_error";
      this.pushReason(`contracts_refresh_fail:${message}`);
    } finally {
      if (timeout) clearTimeout(timeout);
      this.contractsLoading = false;
    }
  }

  private updateBookDerivedFields(symbol: string, ts: number): void {
    const top = this.orderbooks.getTopOfBook(symbol);
    this.patchSnapshot(symbol, {
      topBid: top.topBid,
      topAsk: top.topAsk,
      bidQty: top.bidQty,
      askQty: top.askQty,
      spreadBps: top.spreadBps,
      depthUsd: top.depthUsd,
      imbalance: top.imbalance,
      sourceTs: ts,
    });
  }

  private patchSnapshot(symbol: string, patch: Partial<AdapterSymbolSnapshot>): void {
    const key = ensureUsdtPair(symbol);
    if (!key) return;
    let existing = this.snapshots.get(key);
    if (!existing) {
      existing = {
        exchange: this.exchange,
        symbol: key,
        price: null,
        change24hPct: null,
        volume24hUsd: null,
        topBid: null,
        topAsk: null,
        bidQty: null,
        askQty: null,
        spreadBps: null,
        depthUsd: null,
        imbalance: null,
        markPrice: null,
        fundingRate: null,
        nextFundingTime: null,
        lastTradePrice: null,
        lastTradeQty: null,
        lastTradeSide: null,
        sourceTs: null,
        updatedAt: Date.now(),
      };
      this.snapshots.set(key, existing);
    }
    // Mutate in place — avoid 300+ object allocations per !ticker@arr
    for (const k in patch) {
      (existing as Record<string, unknown>)[k] = (patch as Record<string, unknown>)[k];
    }
    existing.updatedAt = Date.now();
  }

  private appendRecentTrade(symbol: string, row: AdapterTradePoint): void {
    const key = ensureUsdtPair(symbol);
    if (!key) return;
    const current = this.recentTradesBySymbol.get(key) ?? [];
    current.push(row);
    if (current.length > TRADE_STORE_MAX) current.splice(0, current.length - TRADE_STORE_MAX);
    this.recentTradesBySymbol.set(key, current);
  }

  // ── Reconnect backfill: fetch last 2 candles per symbol via REST ──
  private async backfillCandles(symbols: string[]): Promise<void> {
    const intervals = BINANCE_CANDLE_INTERVALS;
    for (const symbol of symbols) {
      if (!this.started) return;
      for (const interval of intervals) {
        try {
          let res: Response;
          try {
            const { binanceFetch } = await import("../binanceRateLimiter.ts");
            res = await binanceFetch({
              url: `${BINANCE_DEPTH_SNAPSHOT_BASE}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=2`,
              init: { headers: { accept: "application/json" } },
              priority: "low",
              dedupKey: `hub-klines:${symbol}:${interval}:2`,
              weight: 1,
            });
          } catch { continue; }
          if (!res.ok) continue;
          const rows = (await res.json()) as unknown[];
          if (!Array.isArray(rows)) continue;
          for (const row of rows) {
            if (!Array.isArray(row) || row.length < 6) continue;
            const openTime = Number(row[0]);
            const open = Number(row[1]);
            const high = Number(row[2]);
            const low = Number(row[3]);
            const close = Number(row[4]);
            const volume = Number(row[5]);
            if (!Number.isFinite(openTime) || !Number.isFinite(close)) continue;
            this.upsertCandle(symbol, interval, {
              time: Math.floor(openTime / 1000),
              open, high, low, close,
              volume: Math.max(0, volume),
            });
            // Emit as kline event so gateway pushes it to clients
            const closed = Number(row[6]) < Date.now(); // closeTime < now → closed
            this.emit({
              type: "kline",
              exchange: this.exchange,
              symbol,
              ts: Date.now(),
              recvTs: Date.now(),
              interval,
              openTime: Math.floor(openTime / 1000),
              open, high, low, close,
              volume: Math.max(0, volume),
              closed,
            });
          }
        } catch {
          // backfill is best-effort; continue with next
        }
      }
      // Tiny gap between symbols to avoid rate-limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.pushReason(`backfill_done:${symbols.length}_symbols`);
  }

  private upsertCandle(symbol: string, interval: string, row: AdapterCandlePoint): void {
    const key = ensureUsdtPair(symbol);
    if (!key) return;
    const frame = interval.toLowerCase();
    const byInterval = this.candlesBySymbol.get(key) ?? new Map<string, AdapterCandlePoint[]>();
    const list = byInterval.get(frame) ?? [];
    const last = list[list.length - 1];
    if (last && last.time === row.time) {
      list[list.length - 1] = row;
    } else if (!last || row.time > last.time) {
      list.push(row);
      if (list.length > CANDLE_STORE_MAX) list.splice(0, list.length - CANDLE_STORE_MAX);
    } else {
      const idx = list.findIndex((item) => item.time === row.time);
      if (idx >= 0) list[idx] = row;
    }
    byInterval.set(frame, list);
    this.candlesBySymbol.set(key, byInterval);
  }
}
