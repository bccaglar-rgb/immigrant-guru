/**
 * Egress Health Monitor
 *
 * Continuously probes each egress path to determine connectivity health.
 * Probes are lightweight (ping/time endpoints, ~1 weight each).
 *
 * CRITICAL: This monitor does NOT react to rate-limit responses (429/418).
 * Those are handled by the rate limiter. This only monitors network/connectivity.
 */

import type {
  EgressPath,
  EgressConfig,
  EgressHealthSnapshot,
  EgressPathState,
} from "./types.ts";

// ═══════════════════════════════════════════════════════════════════
// PROBE RESULT
// ═══════════════════════════════════════════════════════════════════

interface ProbeResult {
  success: boolean;
  latencyMs: number;
  statusCode: number | null;
  error: string | null;
  /** Was this a rate-limit response? If so, still counts as "reachable" */
  isRateLimit: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// HEALTH MONITOR
// ═══════════════════════════════════════════════════════════════════

export class EgressHealthMonitor {
  private intervals = new Map<string, ReturnType<typeof setInterval>>();
  private probeHistory = new Map<string, ProbeResult[]>();
  private readonly HISTORY_SIZE = 20;

  private paths: EgressPath[];
  private config: EgressConfig;
  private onStateChange: (pathId: string, oldState: EgressPathState, newState: EgressPathState, reason: string) => void;

  constructor(
    paths: EgressPath[],
    config: EgressConfig,
    onStateChange: (pathId: string, oldState: EgressPathState, newState: EgressPathState, reason: string) => void,
  ) {
    this.paths = paths;
    this.config = config;
    this.onStateChange = onStateChange;
  }

  /** Start probing all paths */
  start(): void {
    for (const path of this.paths) {
      this.probeHistory.set(path.id, []);
      // Immediate first probe
      void this.probePath(path);
      // Periodic probing
      const iv = setInterval(
        () => void this.probePath(path),
        this.config.probeIntervalMs,
      );
      this.intervals.set(path.id, iv);
    }
    console.log(
      `[EgressHealth] Started monitoring ${this.paths.length} paths ` +
      `(interval=${this.config.probeIntervalMs}ms, timeout=${this.config.probeTimeoutMs}ms)`,
    );
  }

  /** Stop all probing */
  stop(): void {
    for (const [id, iv] of this.intervals) {
      clearInterval(iv);
      this.intervals.delete(id);
    }
    console.log("[EgressHealth] Stopped monitoring");
  }

  /** Get health snapshot for a path */
  getHealth(pathId: string): EgressHealthSnapshot {
    const path = this.paths.find((p) => p.id === pathId);
    return path?.health ?? this.emptyHealth();
  }

  /** Force an immediate probe on a specific path */
  async forceProbe(pathId: string): Promise<ProbeResult> {
    const path = this.paths.find((p) => p.id === pathId);
    if (!path) return { success: false, latencyMs: 0, statusCode: null, error: "unknown_path", isRateLimit: false };
    return this.probePath(path);
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════

  private async probePath(path: EgressPath): Promise<ProbeResult> {
    const endpoint = this.config.probeEndpoints[
      Math.floor(Math.random() * this.config.probeEndpoints.length)
    ];
    const result = await this.executeProbe(path, endpoint);

    // Record in history
    const history = this.probeHistory.get(path.id)!;
    history.push(result);
    if (history.length > this.HISTORY_SIZE) history.shift();

    // Update health snapshot
    this.updateHealth(path, result, history);

    // Evaluate state transition
    this.evaluateState(path, history);

    return result;
  }

  private async executeProbe(path: EgressPath, endpoint: string): Promise<ProbeResult> {
    const startMs = Date.now();

    try {
      let url = endpoint;
      const headers: Record<string, string> = {};

      // If this path uses a proxy, route through it
      if (path.mode === "PROXY" && path.proxyBaseUrl) {
        url = `${path.proxyBaseUrl}/internal/egress-proxy`;
        headers["Content-Type"] = "application/json";
        headers["X-Egress-Probe"] = "1";

        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ url: endpoint, method: "GET" }),
          signal: AbortSignal.timeout(this.config.probeTimeoutMs),
        });

        const latencyMs = Date.now() - startMs;
        const statusCode = res.status;

        // Parse proxied response
        if (res.ok) {
          const body = await res.json() as { status: number };
          const upstreamStatus = body.status;
          const isRateLimit = upstreamStatus === 429 || upstreamStatus === 418;

          // Upstream 429/418 means connectivity is FINE — the exchange sees us
          // Upstream 5xx or connection failure through proxy = connectivity issue
          return {
            success: upstreamStatus < 500,
            latencyMs,
            statusCode: upstreamStatus,
            error: upstreamStatus >= 500 ? `upstream_${upstreamStatus}` : null,
            isRateLimit,
          };
        }

        // Proxy itself failed (proxy server down)
        return {
          success: false,
          latencyMs,
          statusCode,
          error: `proxy_error_${statusCode}`,
          isRateLimit: false,
        };
      }

      // DIRECT mode: fetch endpoint directly
      const res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(this.config.probeTimeoutMs),
      });

      const latencyMs = Date.now() - startMs;
      const statusCode = res.status;

      // 429/418 = exchange reached us, connectivity is fine
      const isRateLimit = statusCode === 429 || statusCode === 418;

      return {
        success: statusCode < 500 || isRateLimit,
        latencyMs,
        statusCode,
        error: statusCode >= 500 ? `http_${statusCode}` : null,
        isRateLimit,
      };
    } catch (err) {
      const latencyMs = Date.now() - startMs;
      const errorMsg = err instanceof Error ? err.message : "unknown_error";

      // Classify the error
      const isTimeout = errorMsg.includes("timeout") || errorMsg.includes("TimeoutError");
      const isDns = errorMsg.includes("ENOTFOUND") || errorMsg.includes("getaddrinfo");
      const isConnect = errorMsg.includes("ECONNREFUSED") || errorMsg.includes("ECONNRESET")
        || errorMsg.includes("EHOSTUNREACH") || errorMsg.includes("ENETUNREACH");
      const isTls = errorMsg.includes("CERT") || errorMsg.includes("SSL") || errorMsg.includes("TLS");

      let reason = "unknown";
      if (isTimeout) reason = "timeout";
      else if (isDns) reason = "dns_failure";
      else if (isConnect) reason = "connection_failure";
      else if (isTls) reason = "tls_failure";

      return {
        success: false,
        latencyMs,
        statusCode: null,
        error: reason,
        isRateLimit: false,
      };
    }
  }

  private updateHealth(path: EgressPath, result: ProbeResult, history: ProbeResult[]): void {
    const h = path.health;
    h.totalProbes++;

    if (result.success) {
      h.consecutiveSuccesses++;
      h.consecutiveFailures = 0;
      h.lastSuccessAt = Date.now();
      h.avgLatencyMs = h.avgLatencyMs * 0.8 + result.latencyMs * 0.2;
    } else {
      h.consecutiveFailures++;
      h.consecutiveSuccesses = 0;
      h.lastFailureAt = Date.now();
      h.lastFailureReason = result.error;
      h.totalFailures++;
    }

    // Calculate success rate over history
    const recentSuccesses = history.filter((r) => r.success).length;
    h.successRate = history.length > 0 ? recentSuccesses / history.length : 1;
  }

  private evaluateState(path: EgressPath, history: ProbeResult[]): void {
    const h = path.health;
    const oldState = path.state;
    let newState = oldState;
    let reason = "";

    switch (oldState) {
      case "ACTIVE":
        // ACTIVE → DEGRADED: high latency or intermittent failures
        if (h.avgLatencyMs > this.config.degradedLatencyMs && h.consecutiveFailures === 0) {
          newState = "DEGRADED";
          reason = `high_latency_${Math.round(h.avgLatencyMs)}ms`;
        }
        // ACTIVE → DOWN: consecutive failures exceed threshold
        if (h.consecutiveFailures >= this.config.failureThreshold) {
          newState = "DOWN";
          reason = `${h.consecutiveFailures}_consecutive_failures: ${h.lastFailureReason}`;
        }
        break;

      case "DEGRADED":
        // DEGRADED → ACTIVE: recovered
        if (h.consecutiveSuccesses >= this.config.recoveryThreshold
          && h.avgLatencyMs < this.config.degradedLatencyMs) {
          newState = "ACTIVE";
          reason = "recovered";
        }
        // DEGRADED → DOWN: failures
        if (h.consecutiveFailures >= this.config.failureThreshold) {
          newState = "DOWN";
          reason = `${h.consecutiveFailures}_consecutive_failures: ${h.lastFailureReason}`;
        }
        break;

      case "DOWN":
        // DOWN → DEGRADED: some successes returning
        if (h.consecutiveSuccesses >= 2) {
          newState = "DEGRADED";
          reason = "partial_recovery";
        }
        break;

      case "QUARANTINED":
        // QUARANTINED paths are managed by the controller (timer-based release)
        // Health monitor does not un-quarantine
        break;
    }

    if (newState !== oldState) {
      path.state = newState;
      console.log(
        `[EgressHealth] Path "${path.id}" state: ${oldState} → ${newState} (${reason})`,
      );
      this.onStateChange(path.id, oldState, newState, reason);
    }
  }

  private emptyHealth(): EgressHealthSnapshot {
    return {
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
      avgLatencyMs: 0,
      lastSuccessAt: 0,
      lastFailureAt: 0,
      lastFailureReason: null,
      totalProbes: 0,
      totalFailures: 0,
      successRate: 1,
    };
  }
}
