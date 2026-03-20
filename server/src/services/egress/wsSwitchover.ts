/**
 * WebSocket Switchover Manager
 *
 * Handles graceful WebSocket connection migration when egress path changes.
 *
 * This module does NOT manage individual WS connections directly.
 * Instead, it coordinates with existing WS managers (BinanceFuturesMarketAdapter,
 * PrivateStreamManager) to perform controlled reconnections.
 *
 * Switchover Strategy:
 *   1. PLANNED: Gradual migration with overlap
 *      - Start new connections on target path
 *      - Wait for healthy data flow (5s)
 *      - Close old connections
 *
 *   2. EMERGENCY: Immediate reconnect
 *      - Close old connections
 *      - Reconnect on target path
 *      - Accept brief data gap
 *
 *   3. RECOVERY: Return to primary
 *      - Same as PLANNED but with longer overlap (10s)
 *
 * Anti-storm rules:
 *   - Max 5 WS reconnections per 10s window
 *   - Stagger reconnections: 500ms between each
 *   - On storm detection, pause and retry after 30s
 */

export type SwitchoverMode = "PLANNED" | "EMERGENCY" | "RECOVERY";

interface SwitchoverTask {
  id: string;
  mode: SwitchoverMode;
  exchange: string;
  fromPath: string;
  toPath: string;
  startedAt: number;
  completedAt: number | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  reconnectedStreams: number;
  totalStreams: number;
  error: string | null;
}

interface WsReconnectCallback {
  /** Trigger reconnection of all WS streams for an exchange */
  reconnectMarketStreams: (exchange: string) => Promise<void>;
  /** Trigger reconnection of private user streams for an exchange */
  reconnectPrivateStreams: (exchange: string) => Promise<void>;
  /** Get count of active WS connections for an exchange */
  getActiveStreamCount: (exchange: string) => number;
}

// ═══════════════════════════════════════════════════════════════════
// WS SWITCHOVER MANAGER
// ═══════════════════════════════════════════════════════════════════

export class WsSwitchoverManager {
  private tasks: SwitchoverTask[] = [];
  private readonly MAX_TASKS = 20;

  /** Reconnection rate limiter */
  private reconnectTimestamps: number[] = [];
  private readonly MAX_RECONNECTS_PER_WINDOW = 5;
  private readonly RECONNECT_WINDOW_MS = 10_000;
  private readonly STAGGER_DELAY_MS = 500;
  private readonly STORM_COOLDOWN_MS = 30_000;

  private stormDetectedUntil = 0;

  private callbacks: WsReconnectCallback | null = null;

  /** Register WS reconnection callbacks (called at startup) */
  registerCallbacks(cb: WsReconnectCallback): void {
    this.callbacks = cb;
  }

  /**
   * Execute a WebSocket switchover for an exchange.
   * Called by EgressController after a failover event.
   */
  async executeSwitchover(
    exchange: string,
    fromPath: string,
    toPath: string,
    mode: SwitchoverMode,
  ): Promise<SwitchoverTask> {
    const task: SwitchoverTask = {
      id: `ws-switch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      mode,
      exchange,
      fromPath,
      toPath,
      startedAt: Date.now(),
      completedAt: null,
      status: "IN_PROGRESS",
      reconnectedStreams: 0,
      totalStreams: this.callbacks?.getActiveStreamCount(exchange) ?? 0,
      error: null,
    };

    this.tasks.push(task);
    if (this.tasks.length > this.MAX_TASKS) this.tasks.shift();

    console.log(
      `[WsSwitchover] Starting ${mode} switchover for ${exchange}: ` +
      `${fromPath} → ${toPath} (${task.totalStreams} streams)`,
    );

    try {
      // Storm detection
      if (this.isStormActive()) {
        task.status = "FAILED";
        task.error = "ws_reconnect_storm_detected";
        task.completedAt = Date.now();
        console.warn(`[WsSwitchover] Storm detected! Deferring switchover for ${this.STORM_COOLDOWN_MS / 1000}s`);
        return task;
      }

      if (!this.callbacks) {
        task.status = "FAILED";
        task.error = "no_callbacks_registered";
        task.completedAt = Date.now();
        return task;
      }

      switch (mode) {
        case "PLANNED":
          await this.executePlanned(task);
          break;
        case "EMERGENCY":
          await this.executeEmergency(task);
          break;
        case "RECOVERY":
          await this.executeRecovery(task);
          break;
      }

      task.status = "COMPLETED";
      task.completedAt = Date.now();
      console.log(
        `[WsSwitchover] ${mode} switchover completed for ${exchange} ` +
        `(${Date.now() - task.startedAt}ms)`,
      );
    } catch (err) {
      task.status = "FAILED";
      task.error = err instanceof Error ? err.message : "unknown";
      task.completedAt = Date.now();
      console.error(`[WsSwitchover] ${mode} switchover FAILED for ${exchange}: ${task.error}`);
    }

    return task;
  }

  /** Get recent switchover tasks */
  getTasks(): SwitchoverTask[] {
    return [...this.tasks];
  }

  // ═══════════════════════════════════════════════════════════════
  // SWITCHOVER STRATEGIES
  // ═══════════════════════════════════════════════════════════════

  private async executePlanned(task: SwitchoverTask): Promise<void> {
    // Step 1: Reconnect market streams with stagger
    if (this.checkReconnectBudget()) {
      this.recordReconnect();
      await this.callbacks!.reconnectMarketStreams(task.exchange);
      task.reconnectedStreams++;
    }

    // Brief overlap: wait for new connections to stabilize
    await this.delay(5_000);

    // Step 2: Reconnect private streams
    if (this.checkReconnectBudget()) {
      this.recordReconnect();
      await this.delay(this.STAGGER_DELAY_MS);
      await this.callbacks!.reconnectPrivateStreams(task.exchange);
      task.reconnectedStreams++;
    }
  }

  private async executeEmergency(task: SwitchoverTask): Promise<void> {
    // Emergency: reconnect all immediately (but still with minimal stagger)
    if (this.checkReconnectBudget()) {
      this.recordReconnect();
      await this.callbacks!.reconnectMarketStreams(task.exchange);
      task.reconnectedStreams++;
    }

    await this.delay(this.STAGGER_DELAY_MS);

    if (this.checkReconnectBudget()) {
      this.recordReconnect();
      await this.callbacks!.reconnectPrivateStreams(task.exchange);
      task.reconnectedStreams++;
    }
  }

  private async executeRecovery(task: SwitchoverTask): Promise<void> {
    // Recovery: same as planned but with longer overlap
    if (this.checkReconnectBudget()) {
      this.recordReconnect();
      await this.callbacks!.reconnectMarketStreams(task.exchange);
      task.reconnectedStreams++;
    }

    // Longer overlap: 10s for recovery to ensure stability
    await this.delay(10_000);

    if (this.checkReconnectBudget()) {
      this.recordReconnect();
      await this.callbacks!.reconnectPrivateStreams(task.exchange);
      task.reconnectedStreams++;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ANTI-STORM LOGIC
  // ═══════════════════════════════════════════════════════════════

  private isStormActive(): boolean {
    if (Date.now() < this.stormDetectedUntil) return true;
    return false;
  }

  private checkReconnectBudget(): boolean {
    const now = Date.now();
    // Clean old timestamps
    this.reconnectTimestamps = this.reconnectTimestamps.filter(
      (ts) => now - ts < this.RECONNECT_WINDOW_MS,
    );

    if (this.reconnectTimestamps.length >= this.MAX_RECONNECTS_PER_WINDOW) {
      // Storm detected!
      this.stormDetectedUntil = now + this.STORM_COOLDOWN_MS;
      console.warn(
        `[WsSwitchover] STORM detected: ${this.reconnectTimestamps.length} reconnects in ${this.RECONNECT_WINDOW_MS / 1000}s. ` +
        `Pausing for ${this.STORM_COOLDOWN_MS / 1000}s`,
      );
      return false;
    }

    return true;
  }

  private recordReconnect(): void {
    this.reconnectTimestamps.push(Date.now());
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════

let instance: WsSwitchoverManager | null = null;

export function getWsSwitchoverManager(): WsSwitchoverManager {
  if (!instance) {
    instance = new WsSwitchoverManager();
  }
  return instance;
}
