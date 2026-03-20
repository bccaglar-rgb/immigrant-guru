/**
 * Egress Controller — Central Egress Path Manager
 *
 * Coordinates health monitoring, failover policy, and request routing.
 * This is the ONLY entry point for egress management.
 *
 * Architecture placement:
 *   exchangeFetch() → [EgressController.resolveUrl()] → fetch()
 *
 * The controller wraps existing behavior:
 *   - Does NOT change rate limiting (Redis weight tracking stays global)
 *   - Does NOT change circuit breaker logic
 *   - Does NOT change priority/dedup systems
 *   - ONLY changes which network path (IP) the request goes through
 *
 * ENV configuration:
 *   EGRESS_STANDBY_HOST  — VPC IP of standby server (default: 10.110.0.8)
 *   EGRESS_STANDBY_PORT  — Port of standby proxy (default: 3000)
 *   EGRESS_PRIMARY_IP    — This server's outbound IP (for logging)
 *   EGRESS_ENABLED       — Set to "false" to disable egress failover
 */

import type {
  IEgressController,
  EgressPath,
  EgressConfig,
  EgressPathState,
  FailoverEvent,
  EgressHealthSnapshot,
} from "./types.ts";
import { DEFAULT_EGRESS_CONFIG } from "./types.ts";
import { EgressHealthMonitor } from "./healthMonitor.ts";
import { FailoverPolicy } from "./failoverPolicy.ts";

// ═══════════════════════════════════════════════════════════════════
// EGRESS CONTROLLER
// ═══════════════════════════════════════════════════════════════════

export class EgressController implements IEgressController {
  private pathsByExchange = new Map<string, EgressPath[]>();
  private monitors = new Map<string, EgressHealthMonitor>();
  private policies = new Map<string, FailoverPolicy>();
  private configs = new Map<string, EgressConfig>();
  private started = false;

  /**
   * Register an exchange with its egress paths.
   * Call this at startup before start().
   */
  registerExchange(exchange: string, paths: EgressPath[], config?: Partial<EgressConfig>): void {
    const cfg: EgressConfig = { ...DEFAULT_EGRESS_CONFIG, exchange, ...config };
    this.pathsByExchange.set(exchange, paths);
    this.configs.set(exchange, cfg);

    const policy = new FailoverPolicy(paths, cfg);
    this.policies.set(exchange, policy);

    const monitor = new EgressHealthMonitor(
      paths,
      cfg,
      (pathId, oldState, newState, reason) => {
        const event = policy.handleStateChange(pathId, oldState, newState, reason);
        if (event) {
          console.log(
            `[EgressCtrl:${exchange}] Auto-failover triggered: ${event.fromPath} → ${event.toPath}`,
          );
        }
      },
    );
    this.monitors.set(exchange, monitor);
  }

  /** Start health monitoring for all registered exchanges */
  start(): void {
    if (this.started) return;
    for (const [exchange, monitor] of this.monitors) {
      monitor.start();
      console.log(`[EgressCtrl] Started monitoring for ${exchange}`);
    }
    this.started = true;
  }

  /** Stop all monitoring */
  stop(): void {
    for (const monitor of this.monitors.values()) {
      monitor.stop();
    }
    for (const policy of this.policies.values()) {
      policy.destroy();
    }
    this.started = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // IEgressController IMPLEMENTATION
  // ═══════════════════════════════════════════════════════════════

  getActivePath(exchange: string): EgressPath | null {
    const policy = this.policies.get(exchange);
    return policy?.getActivePath() ?? null;
  }

  getAllPaths(exchange: string): EgressPath[] {
    return this.pathsByExchange.get(exchange) ?? [];
  }

  /**
   * Transform a request URL to route through the active egress path.
   *
   * If active path is DIRECT → returns original URL unchanged.
   * If active path is PROXY → returns internal proxy URL with original as payload.
   */
  resolveUrl(
    exchange: string,
    originalUrl: string,
  ): { url: string; headers?: Record<string, string>; viaProxy: boolean; pathId: string } {
    const policy = this.policies.get(exchange);
    if (!policy) {
      return { url: originalUrl, viaProxy: false, pathId: "none" };
    }

    const activePath = policy.getActivePath();
    if (!activePath || activePath.mode === "DIRECT") {
      return {
        url: originalUrl,
        viaProxy: false,
        pathId: activePath?.id ?? "none",
      };
    }

    // PROXY mode: route through standby server
    // The proxy endpoint will make the actual request with its own IP
    return {
      url: `${activePath.proxyBaseUrl}/internal/egress-proxy`,
      headers: {
        "X-Egress-Target-Url": originalUrl,
        "X-Egress-Source": activePath.id,
      },
      viaProxy: true,
      pathId: activePath.id,
    };
  }

  reportConnectivityFailure(exchange: string, pathId: string, reason: string): void {
    const paths = this.pathsByExchange.get(exchange);
    const path = paths?.find((p) => p.id === pathId);
    if (!path) return;

    // Update health directly (in addition to periodic probes)
    path.health.consecutiveFailures++;
    path.health.consecutiveSuccesses = 0;
    path.health.lastFailureAt = Date.now();
    path.health.lastFailureReason = reason;
    path.health.totalFailures++;

    // Check if threshold reached
    const config = this.configs.get(exchange) ?? DEFAULT_EGRESS_CONFIG;
    if (path.health.consecutiveFailures >= config.failureThreshold && path.state === "ACTIVE") {
      const oldState = path.state;
      path.state = "DOWN";
      console.log(`[EgressCtrl:${exchange}] Path "${pathId}" DOWN (inline): ${reason}`);

      const policy = this.policies.get(exchange);
      const event = policy?.handleStateChange(pathId, oldState, "DOWN", reason);
      if (event) {
        console.log(
          `[EgressCtrl:${exchange}] Inline failover: ${event.fromPath} → ${event.toPath}`,
        );
      }
    }
  }

  reportSuccess(exchange: string, pathId: string): void {
    const paths = this.pathsByExchange.get(exchange);
    const path = paths?.find((p) => p.id === pathId);
    if (!path) return;

    path.health.consecutiveSuccesses++;
    path.health.consecutiveFailures = 0;
    path.health.lastSuccessAt = Date.now();
  }

  reportRateLimit(exchange: string, pathId: string, status: 429 | 418 | 403): void {
    const policy = this.policies.get(exchange);
    policy?.handleRateLimit(pathId, status);
    // CRITICAL: No failover here. Rate limiter handles backoff.
  }

  forceFailover(exchange: string, reason: string): FailoverEvent | null {
    const policy = this.policies.get(exchange);
    return policy?.forceFailover(reason) ?? null;
  }

  forceRecovery(exchange: string): FailoverEvent | null {
    const policy = this.policies.get(exchange);
    return policy?.forceRecovery() ?? null;
  }

  getFailoverHistory(exchange: string): FailoverEvent[] {
    const policy = this.policies.get(exchange);
    return policy?.getEvents() ?? [];
  }

  getStatus(): Record<string, {
    activePath: string;
    paths: EgressPath[];
    recentEvents: FailoverEvent[];
  }> {
    const result: Record<string, { activePath: string; paths: EgressPath[]; recentEvents: FailoverEvent[] }> = {};

    for (const [exchange, paths] of this.pathsByExchange) {
      const policy = this.policies.get(exchange);
      result[exchange] = {
        activePath: policy?.getActivePathId() ?? "unknown",
        paths: paths.map((p) => ({
          ...p,
          health: { ...p.health },
        })),
        recentEvents: policy?.getEvents().slice(-10) ?? [],
      };
    }

    return result;
  }

  /** Release a quarantined path (admin action) */
  releaseQuarantine(exchange: string, pathId: string): void {
    const policy = this.policies.get(exchange);
    policy?.releaseQuarantine(pathId);
  }

  /** Force immediate probe on a specific path */
  async forceProbe(exchange: string, pathId: string): Promise<unknown> {
    const monitor = this.monitors.get(exchange);
    if (!monitor) return null;
    return monitor.forceProbe(pathId);
  }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLETON + FACTORY
// ═══════════════════════════════════════════════════════════════════

let instance: EgressController | null = null;

/**
 * Initialize the global egress controller.
 * Call once at startup.
 */
export function initEgressController(): EgressController {
  if (instance) return instance;

  const enabled = process.env.EGRESS_ENABLED !== "false";
  if (!enabled) {
    console.log("[EgressCtrl] Disabled via EGRESS_ENABLED=false");
    // Return a no-op controller
    instance = new EgressController();
    return instance;
  }

  instance = new EgressController();

  // ── Configure Binance egress paths ──
  const standbyHost = process.env.EGRESS_STANDBY_HOST ?? "10.110.0.8";
  const standbyPort = process.env.EGRESS_STANDBY_PORT ?? "3000";
  const primaryIp = process.env.EGRESS_PRIMARY_IP ?? "161.35.94.191";
  const standbyIp = process.env.EGRESS_STANDBY_IP ?? "178.62.198.35";

  const emptyHealth = (): EgressHealthSnapshot => ({
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    avgLatencyMs: 0,
    lastSuccessAt: 0,
    lastFailureAt: 0,
    lastFailureReason: null,
    totalProbes: 0,
    totalFailures: 0,
    successRate: 1,
  });

  const binancePaths: EgressPath[] = [
    {
      id: "binance-primary",
      role: "PRIMARY",
      state: "ACTIVE",
      label: `Direct (API-1 ${primaryIp})`,
      mode: "DIRECT",
      egressIp: primaryIp,
      health: emptyHealth(),
    },
    {
      id: "binance-standby",
      role: "STANDBY",
      state: "ACTIVE",
      label: `Proxy via API-2 (${standbyIp})`,
      mode: "PROXY",
      proxyBaseUrl: `http://${standbyHost}:${standbyPort}`,
      egressIp: standbyIp,
      health: emptyHealth(),
    },
  ];

  instance.registerExchange("binance", binancePaths, {
    probeEndpoints: [
      "https://fapi.binance.com/fapi/v1/ping",
      "https://fapi.binance.com/fapi/v1/time",
    ],
    probeIntervalMs: 30_000,
    probeTimeoutMs: 5_000,
    failureThreshold: 3,
    recoveryThreshold: 5,
    minStandbyDurationMs: 300_000,   // 5 min minimum on standby
    failoverCooldownMs: 120_000,     // 2 min between failovers
    quarantineDurationMs: 600_000,   // 10 min quarantine for bans
    degradedLatencyMs: 2_000,
  });

  instance.start();

  console.log(
    `[EgressCtrl] Initialized with ${binancePaths.length} Binance paths: ` +
    binancePaths.map((p) => `${p.id}(${p.mode})`).join(", "),
  );

  return instance;
}

/** Get the global egress controller instance */
export function getEgressController(): EgressController | null {
  return instance;
}
