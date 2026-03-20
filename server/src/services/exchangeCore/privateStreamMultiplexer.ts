/**
 * Private Stream Multiplexer — Reduces WS connections for private user data.
 *
 * PROBLEM: Current PrivateStreamManager creates 1 WS connection per user per exchange.
 * At 100 users = 100 WS connections to Binance alone. This doesn't scale.
 *
 * SOLUTION: Binance combined streams support up to 200 streams per WS.
 * Multiple listen keys can share a single WS connection:
 *   wss://fstream.binance.com/stream?streams={listenKey1}/{listenKey2}/...
 *
 * Architecture:
 *   1. MultiplexerPool manages N WS connections (buckets)
 *   2. Each bucket holds up to MAX_KEYS_PER_BUCKET listen keys
 *   3. When a user connects, their listenKey is added to the least-loaded bucket
 *   4. Messages are routed to the correct user by matching listenKey in the stream field
 *   5. Keepalive timers are shared (batch PUT for all keys in a bucket)
 *
 * Scaling:
 *   100 users = 1 bucket (1 WS connection)
 *   500 users = 3 buckets (3 WS connections)
 *   1000 users = 5 buckets (5 WS connections)
 *   vs. current: 1000 WS connections
 *
 * IMPORTANT: This is a DROP-IN replacement for PrivateStreamManager's Binance handling.
 * Other exchanges (Gate.io, Bybit, OKX) keep their existing per-user WS since they
 * don't support combined stream multiplexing.
 *
 * Integration steps:
 *   1. PrivateStreamManager.connectBinance() calls multiplexer.addUser() instead
 *   2. Multiplexer handles listenKey creation, WS connection, message routing
 *   3. PrivateStreamManager still handles per-user state, disconnect, reconnect
 */

import WebSocket from "ws";

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const MAX_KEYS_PER_BUCKET = 150; // Conservative (Binance limit: 200)
const KEEPALIVE_INTERVAL_MS = 25 * 60_000; // 25 minutes (under Binance's 30 min expiry)
const KEEPALIVE_BATCH_SIZE = 10; // Batch keepalive requests
const KEEPALIVE_STAGGER_MS = 200; // Delay between batched keepalive calls
const RECONNECT_DELAY_MS = 3_000;
const PING_INTERVAL_MS = 30_000;

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface MultiplexedUser {
  userId: string;
  exchangeAccountId: string;
  apiKey: string;
  listenKey: string;
  addedAt: number;
}

interface WsBucket {
  id: number;
  ws: WebSocket | null;
  ready: boolean;
  users: Map<string, MultiplexedUser>; // listenKey → user
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  pingTimer: ReturnType<typeof setInterval> | null;
}

type EventCallback = (
  userId: string,
  exchangeAccountId: string,
  event: unknown,
) => void;

// ═══════════════════════════════════════════════════════════════════
// MULTIPLEXER
// ═══════════════════════════════════════════════════════════════════

export class PrivateStreamMultiplexer {
  private buckets: WsBucket[] = [];
  private nextBucketId = 0;
  private onEvent: EventCallback;
  private onDisconnect: (userId: string, exchangeAccountId: string) => void;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  /** Map from exchangeAccountId → bucketId for quick lookup */
  private userToBucket = new Map<string, number>();

  constructor(
    onEvent: EventCallback,
    onDisconnect: (userId: string, exchangeAccountId: string) => void,
  ) {
    this.onEvent = onEvent;
    this.onDisconnect = onDisconnect;
  }

  /** Start the multiplexer (begins keepalive timer) */
  start(): void {
    this.keepAliveTimer = setInterval(
      () => void this.batchKeepAlive(),
      KEEPALIVE_INTERVAL_MS,
    );
    console.log("[PrivateMux] Started");
  }

  /** Stop the multiplexer and close all connections */
  stop(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    for (const bucket of this.buckets) {
      this.closeBucket(bucket);
    }
    this.buckets = [];
    this.userToBucket.clear();
    console.log("[PrivateMux] Stopped");
  }

  /**
   * Add a user to the multiplexer.
   * Creates listenKey and adds to the least-loaded bucket.
   */
  async addUser(
    userId: string,
    exchangeAccountId: string,
    apiKey: string,
  ): Promise<boolean> {
    // Already added?
    if (this.userToBucket.has(exchangeAccountId)) return true;

    try {
      // Step 1: Create listen key
      const res = await fetch("https://fapi.binance.com/fapi/v1/listenKey", {
        method: "POST",
        headers: { "X-MBX-APIKEY": apiKey },
      });
      if (!res.ok) {
        console.error(`[PrivateMux] listenKey create failed for ${exchangeAccountId}: ${res.status}`);
        return false;
      }
      const { listenKey } = (await res.json()) as { listenKey: string };

      // Step 2: Find or create bucket
      const bucket = this.findOrCreateBucket();

      // Step 3: Add user to bucket
      const user: MultiplexedUser = {
        userId,
        exchangeAccountId,
        apiKey,
        listenKey,
        addedAt: Date.now(),
      };
      bucket.users.set(listenKey, user);
      this.userToBucket.set(exchangeAccountId, bucket.id);

      // Step 4: If bucket WS is connected, subscribe the new stream
      if (bucket.ready && bucket.ws?.readyState === WebSocket.OPEN) {
        // For combined streams, we need to reconnect with updated stream list
        this.reconnectBucket(bucket);
      } else if (!bucket.ws) {
        this.connectBucket(bucket);
      }

      console.log(
        `[PrivateMux] Added ${exchangeAccountId} to bucket ${bucket.id} ` +
        `(${bucket.users.size}/${MAX_KEYS_PER_BUCKET} users)`,
      );
      return true;
    } catch (err: any) {
      console.error(`[PrivateMux] addUser failed for ${exchangeAccountId}:`, err?.message);
      return false;
    }
  }

  /** Remove a user from the multiplexer */
  removeUser(exchangeAccountId: string): void {
    const bucketId = this.userToBucket.get(exchangeAccountId);
    if (bucketId === undefined) return;

    const bucket = this.buckets.find((b) => b.id === bucketId);
    if (!bucket) return;

    // Find and remove the user
    for (const [listenKey, user] of bucket.users) {
      if (user.exchangeAccountId === exchangeAccountId) {
        bucket.users.delete(listenKey);
        break;
      }
    }
    this.userToBucket.delete(exchangeAccountId);

    // If bucket is empty, close the connection
    if (bucket.users.size === 0) {
      this.closeBucket(bucket);
      this.buckets = this.buckets.filter((b) => b.id !== bucket.id);
    } else {
      // Reconnect to update stream list
      this.reconnectBucket(bucket);
    }

    console.log(`[PrivateMux] Removed ${exchangeAccountId} from bucket ${bucketId}`);
  }

  /** Get status for monitoring */
  getStatus() {
    return {
      buckets: this.buckets.map((b) => ({
        id: b.id,
        connected: b.ready,
        users: b.users.size,
        maxUsers: MAX_KEYS_PER_BUCKET,
      })),
      totalUsers: this.userToBucket.size,
      totalConnections: this.buckets.filter((b) => b.ready).length,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE — Bucket Management
  // ═══════════════════════════════════════════════════════════════

  private findOrCreateBucket(): WsBucket {
    // Find bucket with available capacity
    for (const bucket of this.buckets) {
      if (bucket.users.size < MAX_KEYS_PER_BUCKET) return bucket;
    }

    // Create new bucket
    const bucket: WsBucket = {
      id: this.nextBucketId++,
      ws: null,
      ready: false,
      users: new Map(),
      reconnectTimer: null,
      pingTimer: null,
    };
    this.buckets.push(bucket);
    return bucket;
  }

  private connectBucket(bucket: WsBucket): void {
    if (bucket.users.size === 0) return;

    // Build combined stream URL
    const listenKeys = [...bucket.users.keys()];
    const streamParam = listenKeys.join("/");
    const url = `wss://fstream.binance.com/stream?streams=${streamParam}`;

    // Clean up old WS
    if (bucket.ws) {
      try { bucket.ws.removeAllListeners(); } catch {}
      try { if (bucket.ws.readyState !== WebSocket.CLOSED) bucket.ws.close(); } catch {}
    }
    bucket.ws = null;
    bucket.ready = false;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error(`[PrivateMux] Bucket ${bucket.id} WS constructor failed:`, e);
      this.scheduleReconnectBucket(bucket);
      return;
    }

    bucket.ws = ws;

    ws.on("open", () => {
      bucket.ready = true;
      console.log(`[PrivateMux] Bucket ${bucket.id} connected (${bucket.users.size} users)`);

      // Start ping
      if (bucket.pingTimer) clearInterval(bucket.pingTimer);
      bucket.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.ping(); } catch {}
        }
      }, PING_INTERVAL_MS);
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.result !== undefined || msg.id !== undefined) return;

        // Combined stream format: { stream: "listenKey", data: {...} }
        const stream = msg.stream ?? "";
        const data = msg.data ?? msg;

        // Route to the user whose listenKey matches the stream
        const user = bucket.users.get(stream);
        if (user) {
          this.onEvent(user.userId, user.exchangeAccountId, data);
        }
      } catch { /* ignore */ }
    });

    ws.on("close", () => {
      bucket.ready = false;
      if (bucket.pingTimer) { clearInterval(bucket.pingTimer); bucket.pingTimer = null; }
      console.log(`[PrivateMux] Bucket ${bucket.id} disconnected`);
      // Notify all users in this bucket
      for (const user of bucket.users.values()) {
        this.onDisconnect(user.userId, user.exchangeAccountId);
      }
      if (bucket.users.size > 0) {
        this.scheduleReconnectBucket(bucket);
      }
    });

    ws.on("error", (err) => {
      console.error(`[PrivateMux] Bucket ${bucket.id} WS error:`, err.message);
      try { ws.close(); } catch {}
    });
  }

  private reconnectBucket(bucket: WsBucket): void {
    this.closeBucket(bucket);
    // Small delay before reconnecting to avoid storm
    setTimeout(() => this.connectBucket(bucket), 500);
  }

  private closeBucket(bucket: WsBucket): void {
    if (bucket.pingTimer) { clearInterval(bucket.pingTimer); bucket.pingTimer = null; }
    if (bucket.reconnectTimer) { clearTimeout(bucket.reconnectTimer); bucket.reconnectTimer = null; }
    if (bucket.ws) {
      try { bucket.ws.removeAllListeners(); } catch {}
      try { if (bucket.ws.readyState !== WebSocket.CLOSED) bucket.ws.close(); } catch {}
      bucket.ws = null;
      bucket.ready = false;
    }
  }

  private scheduleReconnectBucket(bucket: WsBucket): void {
    if (bucket.reconnectTimer) return;
    bucket.reconnectTimer = setTimeout(() => {
      bucket.reconnectTimer = null;
      if (bucket.users.size > 0) {
        this.connectBucket(bucket);
      }
    }, RECONNECT_DELAY_MS);
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE — Batch Keepalive
  // ═══════════════════════════════════════════════════════════════

  private async batchKeepAlive(): Promise<void> {
    const allUsers = [...this.buckets.flatMap((b) => [...b.users.values()])];
    if (allUsers.length === 0) return;

    let success = 0;
    let fail = 0;

    for (let i = 0; i < allUsers.length; i += KEEPALIVE_BATCH_SIZE) {
      const batch = allUsers.slice(i, i + KEEPALIVE_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((user) =>
          fetch("https://fapi.binance.com/fapi/v1/listenKey", {
            method: "PUT",
            headers: { "X-MBX-APIKEY": user.apiKey },
          }),
        ),
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value.ok) success++;
        else fail++;
      }

      // Stagger between batches
      if (i + KEEPALIVE_BATCH_SIZE < allUsers.length) {
        await new Promise((r) => setTimeout(r, KEEPALIVE_STAGGER_MS));
      }
    }

    if (fail > 0) {
      console.warn(`[PrivateMux] Keepalive: ${success} ok, ${fail} failed (of ${allUsers.length})`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════

let instance: PrivateStreamMultiplexer | null = null;

export function getPrivateStreamMultiplexer(): PrivateStreamMultiplexer | null {
  return instance;
}

export function initPrivateStreamMultiplexer(
  onEvent: EventCallback,
  onDisconnect: (userId: string, exchangeAccountId: string) => void,
): PrivateStreamMultiplexer {
  if (!instance) {
    instance = new PrivateStreamMultiplexer(onEvent, onDisconnect);
  }
  return instance;
}
