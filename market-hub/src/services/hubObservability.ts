/**
 * Hub Observability — Periodic metrics report for market-hub process.
 *
 * Produces a structured 60s report covering:
 *   - Weight budget usage
 *   - Request counts by endpoint
 *   - Request reasons
 *   - Symbol state distribution
 *   - WebSocket health
 *   - Recovery queue status
 *   - Direct fetch violation count
 */

import { getStatus as getBudgetStatus, type BudgetStatus } from "./budgetEngine.ts";

// ── Metric Collectors ──

// Request-by-reason tracker (reset each period)
const reasonCounts = new Map<string, number>();

// Symbol state distribution (updated externally)
let symbolStateCounts: Record<string, number> = {};

// WS health (updated externally)
let wsHealth = {
  connected: false,
  lastMessageAgeMs: 0,
  depthSymbols: 0,
};

// Recovery state (updated externally)
let recoveryState = {
  queueLength: 0,
  inflight: 0,
  blockedSymbols: [] as string[],
};

// Violation counter
let directFetchViolations = 0;

// Total request counter (reset each period)
let periodRequestCount = 0;

// ── Public: Feed data into the observer ──

export function recordReason(reason: string): void {
  reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  periodRequestCount++;
}

export function recordDirectFetchViolation(): void {
  directFetchViolations++;
}

export function updateSymbolStates(states: Record<string, number>): void {
  symbolStateCounts = { ...states };
}

export function updateWsHealth(health: {
  connected: boolean;
  lastMessageAgeMs: number;
  depthSymbols: number;
}): void {
  wsHealth = { ...health };
}

export function updateRecoveryState(state: {
  queueLength: number;
  inflight: number;
  blockedSymbols: string[];
}): void {
  recoveryState = { ...state };
}

// ── Report generation ──

function formatReport(budget: BudgetStatus): string {
  const lines: string[] = [];
  lines.push("[HubMetrics] 60s report");

  // Weight budget
  lines.push(`  weight: ${budget.globalWeight}/${budget.globalMaxWeight} budget (${budget.globalUsagePct}%)`);

  // Total requests
  lines.push(`  requests: ${periodRequestCount} total`);

  // By endpoint
  lines.push("  by_endpoint:");
  for (const [ep, status] of Object.entries(budget.endpoints)) {
    lines.push(`    ${ep}: req=${status.requestCount} w=${status.weightUsed}`);
  }

  // By reason
  if (reasonCounts.size > 0) {
    lines.push("  by_reason:");
    const sorted = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [reason, count] of sorted) {
      lines.push(`    ${reason}: ${count}`);
    }
  }

  // By state
  lines.push("  by_state:");
  const stateOrder = ["READY", "INIT", "SYNCING", "DESYNC_SUSPECTED", "RECOVERING", "COOLDOWN", "BLOCKED"];
  for (const state of stateOrder) {
    const count = symbolStateCounts[state] ?? 0;
    if (count > 0 || state === "READY" || state === "BLOCKED" || state === "COOLDOWN") {
      lines.push(`    ${state}: ${count} symbols`);
    }
  }

  // WS health
  lines.push("  ws_health:");
  lines.push(`    connected: ${wsHealth.connected}`);
  lines.push(`    lastMessage: ${wsHealth.lastMessageAgeMs}ms ago`);
  lines.push(`    depthSymbols: ${wsHealth.depthSymbols}`);

  // Recovery
  lines.push("  recovery:");
  lines.push(`    queue: ${recoveryState.queueLength}`);
  lines.push(`    inflight: ${recoveryState.inflight}`);
  if (recoveryState.blockedSymbols.length > 0) {
    lines.push(`    blocked_symbols: [${recoveryState.blockedSymbols.join(", ")}]`);
  }

  // Violations
  lines.push(`  violations: ${directFetchViolations} direct_fetch_attempts`);

  return lines.join("\n");
}

// ── Periodic reporter ──

let reportInterval: ReturnType<typeof setInterval> | null = null;

export function startObservability(intervalMs = 60_000): void {
  if (reportInterval) return; // already running

  reportInterval = setInterval(() => {
    const budget = getBudgetStatus();
    const report = formatReport(budget);
    console.log(report);

    // Reset per-period counters
    reasonCounts.clear();
    periodRequestCount = 0;
    directFetchViolations = 0;
  }, intervalMs);

  // Don't prevent process exit
  if (reportInterval.unref) reportInterval.unref();

  console.log(`[HubObservability] Started periodic reporting every ${intervalMs / 1000}s`);
}

export function stopObservability(): void {
  if (reportInterval) {
    clearInterval(reportInterval);
    reportInterval = null;
  }
}

/**
 * Get a one-shot report (for on-demand inspection).
 */
export function getReport(): string {
  const budget = getBudgetStatus();
  return formatReport(budget);
}
