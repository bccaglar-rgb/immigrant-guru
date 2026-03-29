/**
 * Egress Failover Policy — State Machine
 *
 * Decides WHEN failover is allowed, manages cooldowns, and prevents flapping.
 *
 * CRITICAL RULES:
 * 1. Failover ONLY on connectivity failure — NEVER on rate-limit (429/418)
 * 2. 429/418 → quarantine current path, back off, do NOT switch & continue
 * 3. Global rate budget is NEVER reset on path switch
 * 4. Minimum standby duration prevents premature return to primary
 * 5. Cooldown between failover events prevents flapping
 */

import type {
  EgressPath,
  EgressPathState,
  EgressConfig,
  FailoverEvent,
  FailoverTrigger,
} from "./types.ts";

// ═══════════════════════════════════════════════════════════════════
// FAILOVER POLICY
// ═══════════════════════════════════════════════════════════════════

export class FailoverPolicy {
  /** Timestamp of last failover event */
  private lastFailoverAt = 0;
  /** Timestamp when standby became active (for min standby duration) */
  private standbyActiveSince = 0;
  /** Which path is currently selected as active */
  private activePathId: string;
  /** Quarantine release timers */
  private quarantineTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Recent failover events (ring buffer) */
  private events: FailoverEvent[] = [];
  private readonly MAX_EVENTS = 50;

  private paths: EgressPath[];
  private config: EgressConfig;

  constructor(
    paths: EgressPath[],
    config: EgressConfig,
  ) {
    this.paths = paths;
    this.config = config;
    // Start with PRIMARY as active
    const primary = paths.find((p) => p.role === "PRIMARY");
    this.activePathId = primary?.id ?? paths[0]?.id ?? "unknown";
  }

  /** Get the currently active path ID */
  getActivePathId(): string {
    return this.activePathId;
  }

  /** Get the currently active path */
  getActivePath(): EgressPath | null {
    return this.paths.find((p) => p.id === this.activePathId) ?? null;
  }

  /** Get all failover events */
  getEvents(): FailoverEvent[] {
    return [...this.events];
  }

  // ═══════════════════════════════════════════════════════════════
  // STATE CHANGE HANDLER (called by HealthMonitor)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Handle a path state change. May trigger failover if the active path goes DOWN.
   */
  handleStateChange(
    pathId: string,
    _oldState: EgressPathState,
    newState: EgressPathState,
    reason: string,
  ): FailoverEvent | null {
    // If the active path went DOWN, attempt failover
    if (pathId === this.activePathId && newState === "DOWN") {
      return this.attemptFailover("CONNECTIVITY_FAILURE", reason);
    }

    // If primary recovered and we're on standby, consider returning
    if (pathId !== this.activePathId && newState === "ACTIVE") {
      const path = this.paths.find((p) => p.id === pathId);
      if (path?.role === "PRIMARY") {
        return this.attemptRecovery();
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  // FAILOVER LOGIC
  // ═══════════════════════════════════════════════════════════════

  /**
   * Attempt automatic failover to the next available path.
   * Returns the failover event if successful, null if blocked.
   */
  attemptFailover(trigger: FailoverTrigger, reason: string): FailoverEvent | null {
    const now = Date.now();

    // ── Cooldown check (prevent flapping) ──
    if (trigger !== "MANUAL" && now - this.lastFailoverAt < this.config.failoverCooldownMs) {
      const remaining = Math.ceil((this.config.failoverCooldownMs - (now - this.lastFailoverAt)) / 1000);
      console.warn(
        `[FailoverPolicy] Failover blocked: cooldown active (${remaining}s remaining)`,
      );
      return null;
    }

    // ── Find next available path ──
    const candidates = this.paths
      .filter((p) => p.id !== this.activePathId)
      .filter((p) => p.state === "ACTIVE" || p.state === "DEGRADED")
      .sort((a, b) => {
        // Prefer ACTIVE over DEGRADED
        if (a.state !== b.state) return a.state === "ACTIVE" ? -1 : 1;
        // Prefer STANDBY role over DR
        const roleOrder: Record<string, number> = { STANDBY: 0, DR: 1, PRIMARY: 2 };
        return (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
      });

    if (candidates.length === 0) {
      console.error(
        `[FailoverPolicy] Failover FAILED: no healthy candidate paths available!`,
      );
      return null;
    }

    const target = candidates[0];
    const event = this.executeFailover(this.activePathId, target.id, trigger, reason);
    return event;
  }

  /**
   * Attempt to return to primary path after failover.
   * Only allowed if primary is ACTIVE and min standby duration has passed.
   */
  attemptRecovery(): FailoverEvent | null {
    const now = Date.now();
    const primary = this.paths.find((p) => p.role === "PRIMARY");

    if (!primary || primary.id === this.activePathId) return null;
    if (primary.state !== "ACTIVE") return null;

    // ── Min standby duration check ──
    if (this.standbyActiveSince > 0
      && now - this.standbyActiveSince < this.config.minStandbyDurationMs) {
      const remaining = Math.ceil(
        (this.config.minStandbyDurationMs - (now - this.standbyActiveSince)) / 1000,
      );
      console.log(
        `[FailoverPolicy] Recovery delayed: min standby duration (${remaining}s remaining)`,
      );
      return null;
    }

    // ── Cooldown check ──
    if (now - this.lastFailoverAt < this.config.failoverCooldownMs) {
      return null;
    }

    return this.executeFailover(this.activePathId, primary.id, "RECOVERY", "primary_recovered");
  }

  // ═══════════════════════════════════════════════════════════════
  // RATE LIMIT HANDLING (does NOT trigger failover)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Handle rate-limit response from exchange.
   * This quarantines the path but does NOT switch to another path to continue.
   * The rate limiter's cooldown mechanism handles the backoff.
   */
  handleRateLimit(pathId: string, status: 429 | 418 | 403): void {
    const path = this.paths.find((p) => p.id === pathId);
    if (!path) return;

    if (status === 418 || status === 403) {
      // IP ban — quarantine this specific path
      this.quarantinePath(pathId, `exchange_${status}_ban`);
      console.error(
        `[FailoverPolicy] Path "${pathId}" QUARANTINED: ${status} ban ` +
        `(duration=${this.config.quarantineDurationMs / 1000}s)`,
      );

      // CRITICAL: We do NOT failover to continue traffic.
      // The rate limiter will enforce its own cooldown across ALL paths.
      // If the active path is quarantined, ALL traffic to this exchange stops
      // until cooldown expires. This is INTENTIONAL — prevents abuse.
      if (pathId === this.activePathId) {
        console.error(
          `[FailoverPolicy] ACTIVE path quarantined! ` +
          `Exchange traffic will be blocked by rate limiter cooldown. ` +
          `This is expected behavior — NOT switching to standby.`,
        );
      }
    }
    // 429 is handled entirely by the rate limiter — no action here
  }

  // ═══════════════════════════════════════════════════════════════
  // MANUAL CONTROLS
  // ═══════════════════════════════════════════════════════════════

  /** Force failover to standby (operator action) */
  forceFailover(reason: string): FailoverEvent | null {
    return this.attemptFailover("MANUAL", reason);
  }

  /** Force return to primary (operator action) */
  forceRecovery(): FailoverEvent | null {
    const primary = this.paths.find((p) => p.role === "PRIMARY");
    if (!primary || primary.id === this.activePathId) return null;

    // Manual recovery bypasses min standby duration
    return this.executeFailover(this.activePathId, primary.id, "MANUAL", "manual_recovery");
  }

  /** Release a path from quarantine early (operator action) */
  releaseQuarantine(pathId: string): void {
    const path = this.paths.find((p) => p.id === pathId);
    if (!path || path.state !== "QUARANTINED") return;

    const timer = this.quarantineTimers.get(pathId);
    if (timer) {
      clearTimeout(timer);
      this.quarantineTimers.delete(pathId);
    }

    path.state = "DEGRADED"; // Start in DEGRADED, let health monitor promote to ACTIVE
    console.log(`[FailoverPolicy] Path "${pathId}" released from quarantine (manual)`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════

  private executeFailover(
    fromId: string,
    toId: string,
    trigger: FailoverTrigger,
    reason: string,
  ): FailoverEvent {
    const now = Date.now();

    const event: FailoverEvent = {
      timestamp: now,
      fromPath: fromId,
      toPath: toId,
      trigger,
      reason,
      exchange: this.config.exchange,
    };

    this.activePathId = toId;
    this.lastFailoverAt = now;

    // Track standby activation time
    const toPath = this.paths.find((p) => p.id === toId);
    if (toPath && toPath.role !== "PRIMARY") {
      this.standbyActiveSince = now;
    } else {
      this.standbyActiveSince = 0;
    }

    // Record event
    this.events.push(event);
    if (this.events.length > this.MAX_EVENTS) this.events.shift();

    console.log(
      `[FailoverPolicy] *** FAILOVER *** ${fromId} → ${toId} ` +
      `(trigger=${trigger}, reason=${reason})`,
    );

    return event;
  }

  private quarantinePath(pathId: string, reason: string): void {
    const path = this.paths.find((p) => p.id === pathId);
    if (!path) return;

    path.state = "QUARANTINED";

    // Clear existing timer
    const existing = this.quarantineTimers.get(pathId);
    if (existing) clearTimeout(existing);

    // Auto-release after quarantine duration
    const timer = setTimeout(() => {
      if (path.state === "QUARANTINED") {
        path.state = "DEGRADED"; // Let health monitor re-evaluate
        console.log(
          `[FailoverPolicy] Path "${pathId}" auto-released from quarantine ` +
          `(was: ${reason}, after ${this.config.quarantineDurationMs / 1000}s)`,
        );
      }
      this.quarantineTimers.delete(pathId);
    }, this.config.quarantineDurationMs);

    this.quarantineTimers.set(pathId, timer);
  }

  /** Clean up timers */
  destroy(): void {
    for (const timer of this.quarantineTimers.values()) {
      clearTimeout(timer);
    }
    this.quarantineTimers.clear();
  }
}
