/**
 * Egress Failover Types
 *
 * Shared type definitions for the egress failover subsystem.
 * This module provides CONNECTIVITY failover only — not rate-limit evasion.
 */

// ═══════════════════════════════════════════════════════════════════
// EGRESS PATH
// ═══════════════════════════════════════════════════════════════════

export type EgressPathRole = "PRIMARY" | "STANDBY" | "DR";

export type EgressPathState =
  | "ACTIVE"       // Healthy, in use or ready
  | "DEGRADED"     // Some issues, still usable but monitored closely
  | "DOWN"         // Unhealthy, not usable
  | "QUARANTINED"; // Banned or critically failed, do NOT use for extended period

export interface EgressPath {
  /** Unique path identifier */
  id: string;
  /** Role in the failover hierarchy */
  role: EgressPathRole;
  /** Current health state */
  state: EgressPathState;
  /** Human-readable label */
  label: string;

  /** How requests are routed through this path */
  mode: "DIRECT" | "PROXY";
  /**
   * For DIRECT: requests go out from this server's own IP.
   * For PROXY: requests are forwarded via proxyBaseUrl to another server.
   */
  proxyBaseUrl?: string;

  /** The server's outbound IP when using this path */
  egressIp: string;

  /** Health metrics */
  health: EgressHealthSnapshot;
}

export interface EgressHealthSnapshot {
  /** Consecutive successful probes */
  consecutiveSuccesses: number;
  /** Consecutive failed probes */
  consecutiveFailures: number;
  /** Average probe latency (ms), exponential moving average */
  avgLatencyMs: number;
  /** Last successful probe timestamp */
  lastSuccessAt: number;
  /** Last failure timestamp */
  lastFailureAt: number;
  /** Last failure reason */
  lastFailureReason: string | null;
  /** Total probes since startup */
  totalProbes: number;
  /** Total probe failures since startup */
  totalFailures: number;
  /** Probe success rate (0-1) over last N probes */
  successRate: number;
}

// ═══════════════════════════════════════════════════════════════════
// FAILOVER EVENTS
// ═══════════════════════════════════════════════════════════════════

export type FailoverTrigger =
  | "CONNECTIVITY_FAILURE"    // TCP/TLS/DNS failure
  | "TIMEOUT"                 // Probe timeout
  | "SERVER_ERROR"            // 5xx from exchange
  | "MANUAL"                  // Operator-initiated
  | "RECOVERY"                // Primary recovered, switching back
  | "STARTUP";                // Initial path selection

/** Explicitly NOT a failover trigger — these cause backoff, not switching */
export type NonFailoverCondition =
  | "RATE_LIMIT_429"          // Exchange rate limit — back off, don't switch
  | "IP_BAN_418"              // IP banned — quarantine current path, don't switch & continue
  | "FORBIDDEN_403";          // Forbidden — similar to ban

export interface FailoverEvent {
  timestamp: number;
  fromPath: string;
  toPath: string;
  trigger: FailoverTrigger;
  reason: string;
  exchange: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

export interface EgressConfig {
  /** Exchange this config applies to */
  exchange: string;

  /** Probe interval in ms (default: 30s) */
  probeIntervalMs: number;
  /** Probe timeout in ms (default: 5s) */
  probeTimeoutMs: number;
  /** Probe endpoint — lightweight, low-weight (e.g. /fapi/v1/ping) */
  probeEndpoints: string[];

  /** Number of consecutive failures before marking DOWN (default: 3) */
  failureThreshold: number;
  /** Number of consecutive successes before marking ACTIVE from DEGRADED (default: 5) */
  recoveryThreshold: number;

  /** Minimum time (ms) before switching back to primary after failover (default: 300s) */
  minStandbyDurationMs: number;
  /** Cooldown (ms) between failover events to prevent flapping (default: 120s) */
  failoverCooldownMs: number;

  /** Quarantine duration for banned paths (ms) (default: 600s = 10 min) */
  quarantineDurationMs: number;

  /** Latency threshold (ms) — above this, path is DEGRADED (default: 2000) */
  degradedLatencyMs: number;
}

export const DEFAULT_EGRESS_CONFIG: EgressConfig = {
  exchange: "binance",
  probeIntervalMs: 30_000,
  probeTimeoutMs: 5_000,
  probeEndpoints: [
    "https://fapi.binance.com/fapi/v1/ping",
    "https://fapi.binance.com/fapi/v1/time",
  ],
  failureThreshold: 3,
  recoveryThreshold: 5,
  minStandbyDurationMs: 300_000,
  failoverCooldownMs: 120_000,
  quarantineDurationMs: 600_000,
  degradedLatencyMs: 2_000,
};

// ═══════════════════════════════════════════════════════════════════
// EGRESS CONTROLLER INTERFACE
// ═══════════════════════════════════════════════════════════════════

export interface IEgressController {
  /** Get the currently active egress path for an exchange */
  getActivePath(exchange: string): EgressPath | null;

  /** Get all configured paths for an exchange */
  getAllPaths(exchange: string): EgressPath[];

  /** Transform a fetch request to use the active egress path */
  resolveUrl(exchange: string, originalUrl: string): {
    url: string;
    headers?: Record<string, string>;
    viaProxy: boolean;
    pathId: string;
  };

  /** Report a connectivity failure on a path */
  reportConnectivityFailure(exchange: string, pathId: string, reason: string): void;

  /** Report a successful request on a path */
  reportSuccess(exchange: string, pathId: string): void;

  /** Report rate limit (429/418) — does NOT trigger failover */
  reportRateLimit(exchange: string, pathId: string, status: 429 | 418 | 403): void;

  /** Force failover (manual operator action) */
  forceFailover(exchange: string, reason: string): FailoverEvent | null;

  /** Force return to primary */
  forceRecovery(exchange: string): FailoverEvent | null;

  /** Get recent failover events */
  getFailoverHistory(exchange: string): FailoverEvent[];

  /** Get full status for admin/observability */
  getStatus(): Record<string, {
    activePath: string;
    paths: EgressPath[];
    recentEvents: FailoverEvent[];
  }>;
}
