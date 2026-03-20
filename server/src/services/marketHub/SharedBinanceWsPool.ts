/**
 * Shared Binance WebSocket Pool
 *
 * Consolidates multiple Binance WS connections into a single connection.
 * Both the Gateway (depth20@500ms) and the Market Hub adapter (depth@500ms + klines)
 * register their subscriptions here instead of each opening their own WS.
 *
 * BEFORE: Gateway depthWs + Adapter depthWs = 2 WS connections to fstream.binance.com
 * AFTER:  SharedBinanceWsPool = 1 WS connection with all subscriptions merged
 *
 * Benefits:
 *   - Saves 1 WS connection to Binance (reduces connection count)
 *   - Single reconnect logic instead of two
 *   - Shared heartbeat/watchdog
 *   - No duplicate symbol subscriptions on the same stream type
 */

import WebSocket from "ws";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type MessageCallback = (stream: string, data: unknown) => void;

interface Consumer {
  id: string;
  /** Streams this consumer is subscribed to (e.g., "btcusdt@depth20@500ms") */
  streams: Set<string>;
  /** Callback for all messages matching this consumer's streams */
  onMessage: MessageCallback;
}

// ═══════════════════════════════════════════════════════════════════
// SHARED WS POOL
// ═══════════════════════════════════════════════════════════════════

export class SharedBinanceWsPool {
  private ws: WebSocket | null = null;
  private ready = false;
  private consumers = new Map<string, Consumer>();
  /** All unique streams currently subscribed on the WS */
  private activeStreams = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private subIdCounter = 1;

  private readonly WS_URL = "wss://fstream.binance.com/ws";
  private readonly RECONNECT_DELAY_MS = 2_000;
  private readonly HEARTBEAT_MS = 8_000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Register a consumer with its message callback.
   * Consumers can later subscribe/unsubscribe individual streams.
   */
  registerConsumer(id: string, onMessage: MessageCallback): void {
    if (this.consumers.has(id)) return;
    this.consumers.set(id, { id, streams: new Set(), onMessage });
  }

  /** Remove a consumer and unsubscribe its streams */
  removeConsumer(id: string): void {
    const consumer = this.consumers.get(id);
    if (!consumer) return;
    // Unsubscribe streams that no other consumer needs
    const toUnsub: string[] = [];
    for (const stream of consumer.streams) {
      let neededByOther = false;
      for (const [cid, c] of this.consumers) {
        if (cid !== id && c.streams.has(stream)) { neededByOther = true; break; }
      }
      if (!neededByOther) toUnsub.push(stream);
    }
    if (toUnsub.length > 0) this.wsSend("UNSUBSCRIBE", toUnsub);
    for (const s of toUnsub) this.activeStreams.delete(s);
    this.consumers.delete(id);

    // Close WS if no consumers left
    if (this.consumers.size === 0 && this.activeStreams.size === 0) {
      this.close();
    }
  }

  /**
   * Subscribe to streams for a specific consumer.
   * If the stream is already active (subscribed by another consumer), no duplicate WS message sent.
   */
  subscribe(consumerId: string, streams: string[]): void {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) return;

    const newStreams: string[] = [];
    for (const stream of streams) {
      consumer.streams.add(stream);
      if (!this.activeStreams.has(stream)) {
        this.activeStreams.add(stream);
        newStreams.push(stream);
      }
    }

    // Only send SUBSCRIBE for genuinely new streams
    if (newStreams.length > 0) {
      this.ensureConnected();
      this.wsSend("SUBSCRIBE", newStreams);
    }
  }

  /**
   * Unsubscribe streams for a specific consumer.
   * Only actually unsubscribes from WS if no other consumer needs the stream.
   */
  unsubscribe(consumerId: string, streams: string[]): void {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) return;

    const toUnsub: string[] = [];
    for (const stream of streams) {
      consumer.streams.delete(stream);
      // Check if any other consumer still needs this stream
      let neededByOther = false;
      for (const [cid, c] of this.consumers) {
        if (cid !== consumerId && c.streams.has(stream)) { neededByOther = true; break; }
      }
      if (!neededByOther) {
        this.activeStreams.delete(stream);
        toUnsub.push(stream);
      }
    }

    if (toUnsub.length > 0) {
      this.wsSend("UNSUBSCRIBE", toUnsub);
    }

    // Close WS if no active streams
    if (this.activeStreams.size === 0) {
      this.close();
    }
  }

  /** Get currently active stream count */
  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  /** Get consumer count */
  getConsumerCount(): number {
    return this.consumers.size;
  }

  /** Check if connected and ready */
  isReady(): boolean {
    return this.ready && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /** Get status for monitoring */
  getStatus() {
    return {
      connected: this.ready,
      consumers: this.consumers.size,
      activeStreams: this.activeStreams.size,
      streams: [...this.activeStreams],
    };
  }

  /** Close the connection */
  close(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      try { this.ws.removeAllListeners(); } catch {}
      try { if (this.ws.readyState !== WebSocket.CLOSED) this.ws.close(); } catch {}
      this.ws = null;
      this.ready = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════

  private ensureConnected(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return;
    this.connect();
  }

  private connect(): void {
    // Clean up old connection
    if (this.ws) {
      try { this.ws.removeAllListeners(); } catch {}
      try { if (this.ws.readyState !== WebSocket.CLOSED) this.ws.close(); } catch {}
    }
    this.ws = null;
    this.ready = false;

    console.log(`[SharedWsPool] Connecting to ${this.WS_URL}...`);
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.WS_URL);
    } catch (e) {
      console.error("[SharedWsPool] WS constructor failed:", e);
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;

    ws.on("open", () => {
      this.ready = true;
      console.log(`[SharedWsPool] Connected. Re-subscribing ${this.activeStreams.size} streams`);

      // Re-subscribe all active streams
      if (this.activeStreams.size > 0) {
        this.wsSend("SUBSCRIBE", [...this.activeStreams]);
      }

      // Start heartbeat
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try { this.ws.ping(); } catch {}
        }
      }, this.HEARTBEAT_MS);
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        // Skip subscription confirmations
        if (msg.result !== undefined || msg.id !== undefined) return;

        // Route message to consumers
        const stream = msg.stream ?? "";
        const data = msg.data ?? msg;

        for (const consumer of this.consumers.values()) {
          // Check if this consumer cares about this stream
          if (consumer.streams.has(stream)) {
            try { consumer.onMessage(stream, data); } catch {}
          } else if (!stream && data.e) {
            // Direct format messages (no stream wrapper) — check by event type + symbol
            // Consumers need to handle both wrapped and direct formats
            try { consumer.onMessage("", data); } catch {}
          }
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on("close", () => {
      this.ws = null;
      this.ready = false;
      console.log("[SharedWsPool] Connection closed");
      if (this.activeStreams.size > 0) {
        this.scheduleReconnect();
      }
    });

    ws.on("error", (err) => {
      console.error("[SharedWsPool] WS error:", err instanceof Error ? err.message : err);
      this.ready = false;
      try { ws.close(); } catch {}
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.activeStreams.size > 0) {
        this.connect();
      }
    }, this.RECONNECT_DELAY_MS);
  }

  private wsSend(method: "SUBSCRIBE" | "UNSUBSCRIBE", params: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || params.length === 0) return;

    // Binance has a limit of 200 streams per SUBSCRIBE message
    const chunkSize = 150;
    for (let i = 0; i < params.length; i += chunkSize) {
      const chunk = params.slice(i, i + chunkSize);
      try {
        this.ws.send(JSON.stringify({ method, params: chunk, id: this.subIdCounter++ }));
      } catch (e) {
        console.error(`[SharedWsPool] Send failed:`, e);
        this.ready = false;
        try { this.ws?.close(); } catch {}
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════

let pool: SharedBinanceWsPool | null = null;

/** Get or create the shared Binance WS pool */
export function getSharedBinanceWsPool(): SharedBinanceWsPool {
  if (!pool) {
    pool = new SharedBinanceWsPool();
  }
  return pool;
}
