/**
 * PrivateStreamManager — Manages per-user private WebSocket connections to exchanges.
 *
 * Binance: wss://fstream.binance.com/ws/{listenKey}
 *   - Listen key created via POST /fapi/v1/listenKey
 *   - Keepalive every 30min via PUT /fapi/v1/listenKey
 *   - Events: ORDER_TRADE_UPDATE, ACCOUNT_UPDATE, MARGIN_CALL
 *
 * Gate.io: wss://fx-ws.gateio.ws/v4/ws/usdt
 *   - Auth via HMAC-SHA512 signed channel subscribe
 *   - Channels: futures.orders, futures.usertrades, futures.positions, futures.balances
 *
 * Features:
 * - Auto-reconnect with exponential backoff (1s, 2s, 4s, ..., max 30s)
 * - Ping/pong health monitoring
 * - Listen key auto-renewal (Binance)
 * - Stale connection detection
 */
import WebSocket from "ws";
import { createHmac } from "node:crypto";
import { parseBinanceUserEvent, type BinanceUserEvent } from "./privateStreamBinance.ts";
import { parseGateUserEvent, type GateUserEvent } from "./privateStreamGate.ts";
import { parseBybitUserEvent, type BybitUserEvent } from "./privateStreamBybit.ts";
import { parseOkxUserEvent, type OkxUserEvent } from "./privateStreamOkx.ts";
import type { ApiVault } from "./apiVault.ts";
import type { CoreVenue } from "./types.ts";

type UserEvent = BinanceUserEvent | GateUserEvent | BybitUserEvent | OkxUserEvent;

export interface PrivateStreamCallbacks {
  onEvent: (userId: string, exchangeAccountId: string, venue: CoreVenue, events: UserEvent[]) => void;
  onDisconnect: (userId: string, exchangeAccountId: string, venue: CoreVenue) => void;
  onReconnect: (userId: string, exchangeAccountId: string, venue: CoreVenue) => void;
}

interface StreamEntry {
  ws: WebSocket | null;
  venue: CoreVenue;
  userId: string;
  exchangeAccountId: string;
  listenKey?: string;
  keepAliveTimer?: ReturnType<typeof setInterval>;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  reconnectAttempt: number;
  lastPongAt: number;
  active: boolean;
}

const MAX_BACKOFF_MS = 30_000;
const BINANCE_KEEPALIVE_MS = 30 * 60_000; // 30 minutes
const STALE_THRESHOLD_MS = 120_000; // 2 minutes without pong

const streamKey = (userId: string, exchangeAccountId: string) =>
  `${userId}:${exchangeAccountId}`;

export class PrivateStreamManager {
  private readonly vault: ApiVault;
  private readonly callbacks: PrivateStreamCallbacks;
  private readonly streams = new Map<string, StreamEntry>();
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(vault: ApiVault, callbacks: PrivateStreamCallbacks) {
    this.vault = vault;
    this.callbacks = callbacks;
  }

  start(): void {
    // Health check every 60s: detect stale connections
    this.healthTimer = setInterval(() => this.healthCheck(), 60_000);

    // Expose stats on globalThis for Mission Control dashboard
    (globalThis as Record<string, unknown>).__privateStreamStats = () => this.getStats();

    console.log("[PrivateStreamManager] Started");
  }

  stop(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    for (const [key, entry] of this.streams) {
      this.closeStream(entry);
      this.streams.delete(key);
    }
    console.log("[PrivateStreamManager] Stopped");
  }

  async startStream(userId: string, exchangeAccountId: string, venue: CoreVenue): Promise<boolean> {
    const key = streamKey(userId, exchangeAccountId);
    if (this.streams.has(key)) return true; // already active

    const entry: StreamEntry = {
      ws: null,
      venue,
      userId,
      exchangeAccountId,
      reconnectAttempt: 0,
      lastPongAt: Date.now(),
      active: true,
    };
    this.streams.set(key, entry);

    return this.connect(entry);
  }

  async stopStream(userId: string, exchangeAccountId: string): Promise<void> {
    const key = streamKey(userId, exchangeAccountId);
    const entry = this.streams.get(key);
    if (!entry) return;
    entry.active = false;
    this.closeStream(entry);
    this.streams.delete(key);
  }

  stopAllStreams(userId: string): void {
    for (const [key, entry] of this.streams) {
      if (entry.userId === userId) {
        entry.active = false;
        this.closeStream(entry);
        this.streams.delete(key);
      }
    }
  }

  getStatus(): { activeStreams: number; byVenue: Record<string, number> } {
    const byVenue: Record<string, number> = {};
    for (const entry of this.streams.values()) {
      byVenue[entry.venue] = (byVenue[entry.venue] ?? 0) + 1;
    }
    return { activeStreams: this.streams.size, byVenue };
  }

  /** Detailed stats for Mission Control dashboard. */
  getStats(): {
    activeStreams: number;
    totalUsers: number;
    byVenue: Record<string, number>;
    staleCount: number;
    reconnectingCount: number;
  } {
    const byVenue: Record<string, number> = {};
    const userIds = new Set<string>();
    let staleCount = 0;
    let reconnectingCount = 0;
    const now = Date.now();

    for (const entry of this.streams.values()) {
      byVenue[entry.venue] = (byVenue[entry.venue] ?? 0) + 1;
      userIds.add(entry.userId);
      if (entry.active && now - entry.lastPongAt > STALE_THRESHOLD_MS) staleCount++;
      if (entry.reconnectAttempt > 0 && entry.active) reconnectingCount++;
    }

    return {
      activeStreams: this.streams.size,
      totalUsers: userIds.size,
      byVenue,
      staleCount,
      reconnectingCount,
    };
  }

  // ── Connection Logic ──────────────────────────────────────────

  private async connect(entry: StreamEntry): Promise<boolean> {
    try {
      const creds = await this.vault.getCredentials(entry.userId, entry.exchangeAccountId, "private_stream");
      if (!creds) {
        console.error(`[PrivateStream] No credentials for ${entry.exchangeAccountId}`);
        return false;
      }

      if (entry.venue === "BINANCE") {
        return await this.connectBinance(entry, creds.apiKey, creds.apiSecret);
      } else if (entry.venue === "GATEIO") {
        return await this.connectGate(entry, creds.apiKey, creds.apiSecret);
      } else if (entry.venue === "BYBIT") {
        return await this.connectBybit(entry, creds.apiKey, creds.apiSecret);
      } else if (entry.venue === "OKX") {
        return await this.connectOkx(entry, creds.apiKey, creds.apiSecret, creds.passphrase ?? "");
      }
      return false;
    } catch (err: any) {
      console.error(`[PrivateStream] Connect failed for ${entry.exchangeAccountId}:`, err?.message);
      this.scheduleReconnect(entry);
      return false;
    }
  }

  private async connectBinance(entry: StreamEntry, apiKey: string, apiSecret: string): Promise<boolean> {
    // Create listen key
    const res = await fetch("https://fapi.binance.com/fapi/v1/listenKey", {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
    });
    if (!res.ok) {
      console.error(`[PrivateStream] Binance listenKey create failed: ${res.status}`);
      return false;
    }
    const { listenKey } = (await res.json()) as { listenKey: string };
    entry.listenKey = listenKey;

    // Connect WebSocket
    const ws = new WebSocket(`wss://fstream.binance.com/ws/${listenKey}`);
    entry.ws = ws;

    ws.on("open", () => {
      entry.reconnectAttempt = 0;
      entry.lastPongAt = Date.now();
      console.log(`[PrivateStream] Binance connected for ${entry.exchangeAccountId}`);
      this.callbacks.onReconnect(entry.userId, entry.exchangeAccountId, "BINANCE");
    });

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        const events = parseBinanceUserEvent(parsed);
        this.callbacks.onEvent(entry.userId, entry.exchangeAccountId, "BINANCE", events);
      } catch { /* ignore parse errors */ }
    });

    ws.on("pong", () => {
      entry.lastPongAt = Date.now();
    });

    ws.on("close", () => {
      if (entry.active) {
        console.log(`[PrivateStream] Binance disconnected for ${entry.exchangeAccountId}`);
        this.callbacks.onDisconnect(entry.userId, entry.exchangeAccountId, "BINANCE");
        this.scheduleReconnect(entry);
      }
    });

    ws.on("error", (err) => {
      console.error(`[PrivateStream] Binance WS error for ${entry.exchangeAccountId}:`, err.message);
    });

    // Keepalive: renew listen key every 30 minutes
    entry.keepAliveTimer = setInterval(async () => {
      try {
        await fetch("https://fapi.binance.com/fapi/v1/listenKey", {
          method: "PUT",
          headers: { "X-MBX-APIKEY": apiKey },
        });
      } catch (err: any) {
        console.error(`[PrivateStream] Binance keepalive failed:`, err?.message);
      }
    }, BINANCE_KEEPALIVE_MS);

    // Ping every 30s
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30_000);

    ws.on("close", () => clearInterval(pingInterval));

    return true;
  }

  private async connectGate(entry: StreamEntry, apiKey: string, apiSecret: string): Promise<boolean> {
    const ws = new WebSocket("wss://fx-ws.gateio.ws/v4/ws/usdt");
    entry.ws = ws;

    ws.on("open", () => {
      entry.reconnectAttempt = 0;
      entry.lastPongAt = Date.now();

      // Authenticate and subscribe to private channels
      const ts = Math.floor(Date.now() / 1000);
      const channels = ["futures.orders", "futures.positions", "futures.balances"];

      for (const channel of channels) {
        const signStr = `channel=${channel}&event=subscribe&time=${ts}`;
        const sign = createHmac("sha512", apiSecret).update(signStr).digest("hex");

        ws.send(JSON.stringify({
          time: ts,
          channel,
          event: "subscribe",
          payload: [],
          auth: { method: "api_key", KEY: apiKey, SIGN: sign },
        }));
      }

      console.log(`[PrivateStream] Gate.io connected for ${entry.exchangeAccountId}`);
      this.callbacks.onReconnect(entry.userId, entry.exchangeAccountId, "GATEIO");
    });

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.event === "subscribe") return; // ack, ignore
        const events = parseGateUserEvent(parsed);
        this.callbacks.onEvent(entry.userId, entry.exchangeAccountId, "GATEIO", events);
      } catch { /* ignore parse errors */ }
    });

    ws.on("pong", () => {
      entry.lastPongAt = Date.now();
    });

    ws.on("close", () => {
      if (entry.active) {
        console.log(`[PrivateStream] Gate.io disconnected for ${entry.exchangeAccountId}`);
        this.callbacks.onDisconnect(entry.userId, entry.exchangeAccountId, "GATEIO");
        this.scheduleReconnect(entry);
      }
    });

    ws.on("error", (err) => {
      console.error(`[PrivateStream] Gate.io WS error for ${entry.exchangeAccountId}:`, err.message);
    });

    // Ping every 30s
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30_000);
    ws.on("close", () => clearInterval(pingInterval));

    return true;
  }

  // ── Bybit V5 Private ──────────────────────────────────────────

  private async connectBybit(entry: StreamEntry, apiKey: string, apiSecret: string): Promise<boolean> {
    const ws = new WebSocket("wss://stream.bybit.com/v5/private");
    entry.ws = ws;

    ws.on("open", () => {
      entry.reconnectAttempt = 0;
      entry.lastPongAt = Date.now();

      // Authenticate: HMAC-SHA256(secret, "GET/realtime" + expires)
      const expires = Date.now() + 10_000;
      const signPayload = `GET/realtime${expires}`;
      const sign = createHmac("sha256", apiSecret).update(signPayload).digest("hex");

      ws.send(JSON.stringify({
        op: "auth",
        args: [apiKey, expires, sign],
      }));

      // Subscribe after short delay to allow auth to complete
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            op: "subscribe",
            args: ["order", "execution", "position", "wallet"],
          }));
        }
      }, 500);

      console.log(`[PrivateStream] Bybit connected for ${entry.exchangeAccountId}`);
      this.callbacks.onReconnect(entry.userId, entry.exchangeAccountId, "BYBIT");
    });

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        // Skip auth/subscribe acks
        if (parsed.op === "auth" || parsed.op === "subscribe") return;
        if (!parsed.topic) return;
        const events = parseBybitUserEvent(parsed);
        this.callbacks.onEvent(entry.userId, entry.exchangeAccountId, "BYBIT", events);
      } catch { /* ignore parse errors */ }
    });

    ws.on("pong", () => { entry.lastPongAt = Date.now(); });

    ws.on("close", () => {
      if (entry.active) {
        console.log(`[PrivateStream] Bybit disconnected for ${entry.exchangeAccountId}`);
        this.callbacks.onDisconnect(entry.userId, entry.exchangeAccountId, "BYBIT");
        this.scheduleReconnect(entry);
      }
    });

    ws.on("error", (err) => {
      console.error(`[PrivateStream] Bybit WS error for ${entry.exchangeAccountId}:`, err.message);
    });

    // Bybit requires ping every 20s to keep alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: "ping" }));
      }
    }, 20_000);
    ws.on("close", () => clearInterval(pingInterval));

    return true;
  }

  // ── OKX V5 Private ──────────────────────────────────────────

  private async connectOkx(entry: StreamEntry, apiKey: string, apiSecret: string, passphrase: string): Promise<boolean> {
    const ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/private");
    entry.ws = ws;

    ws.on("open", () => {
      entry.reconnectAttempt = 0;
      entry.lastPongAt = Date.now();

      // Login: HMAC-SHA256(secret, timestamp + "GET" + "/users/self/verify")
      const ts = String(Math.floor(Date.now() / 1000));
      const signPayload = ts + "GET" + "/users/self/verify";
      const sign = createHmac("sha256", apiSecret).update(signPayload).digest("base64");

      ws.send(JSON.stringify({
        op: "login",
        args: [{ apiKey, passphrase, timestamp: ts, sign }],
      }));

      // Subscribe after short delay to allow login to complete
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            op: "subscribe",
            args: [
              { channel: "orders", instType: "SWAP" },
              { channel: "positions", instType: "SWAP" },
              { channel: "account" },
            ],
          }));
        }
      }, 500);

      console.log(`[PrivateStream] OKX connected for ${entry.exchangeAccountId}`);
      this.callbacks.onReconnect(entry.userId, entry.exchangeAccountId, "OKX");
    });

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        // Skip login/subscribe acks
        if (parsed.event === "login" || parsed.event === "subscribe") return;
        if (!parsed.arg?.channel) return;
        const events = parseOkxUserEvent(parsed);
        this.callbacks.onEvent(entry.userId, entry.exchangeAccountId, "OKX", events);
      } catch { /* ignore parse errors */ }
    });

    ws.on("pong", () => { entry.lastPongAt = Date.now(); });

    ws.on("close", () => {
      if (entry.active) {
        console.log(`[PrivateStream] OKX disconnected for ${entry.exchangeAccountId}`);
        this.callbacks.onDisconnect(entry.userId, entry.exchangeAccountId, "OKX");
        this.scheduleReconnect(entry);
      }
    });

    ws.on("error", (err) => {
      console.error(`[PrivateStream] OKX WS error for ${entry.exchangeAccountId}:`, err.message);
    });

    // OKX requires ping every 25s
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, 25_000);
    ws.on("close", () => clearInterval(pingInterval));

    return true;
  }

  // ── Reconnect / Health ────────────────────────────────────────

  private scheduleReconnect(entry: StreamEntry): void {
    if (!entry.active) return;
    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);

    const delay = Math.min(1000 * Math.pow(2, entry.reconnectAttempt), MAX_BACKOFF_MS);
    entry.reconnectAttempt++;

    entry.reconnectTimer = setTimeout(() => {
      if (entry.active) void this.connect(entry);
    }, delay);
  }

  private closeStream(entry: StreamEntry): void {
    if (entry.ws) {
      try { entry.ws.close(); } catch { /* ignore */ }
      entry.ws = null;
    }
    if (entry.keepAliveTimer) {
      clearInterval(entry.keepAliveTimer);
      entry.keepAliveTimer = undefined;
    }
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = undefined;
    }
  }

  private healthCheck(): void {
    const now = Date.now();
    for (const [, entry] of this.streams) {
      if (!entry.active) continue;
      if (now - entry.lastPongAt > STALE_THRESHOLD_MS) {
        console.warn(`[PrivateStream] Stale connection for ${entry.exchangeAccountId}, reconnecting`);
        this.closeStream(entry);
        void this.connect(entry);
      }
    }
  }
}
