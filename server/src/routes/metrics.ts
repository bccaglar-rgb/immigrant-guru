/**
 * Prometheus Metrics Endpoint — /api/metrics
 *
 * Returns plain-text Prometheus format.
 * Grafana datasource: Prometheus → scrape /api/metrics every 15s.
 *
 * Metrics exposed:
 *   bitrium_bot_queue_*        — BullMQ queue depth
 *   bitrium_exchange_rl_*      — rate limiter usage per exchange
 *   bitrium_circuit_breaker_*  — circuit breaker state per exchange
 *   bitrium_bot_breaker_*      — bot breaker state (market/strategy/user)
 *   bitrium_batch_writer_*     — batch result writer queue depth
 *   bitrium_process_*          — Node.js memory + event loop lag
 *   bitrium_uptime_seconds     — process uptime
 */

import type { Express } from "express";
import { ExchangeRateLimiter } from "../services/exchangeCore/exchangeRateLimiter.ts";
import { getAllCircuitStatus } from "../services/exchangeCore/circuitBreaker.ts";
import { botBreaker } from "../services/traderHub/botBreaker.ts";
import { batchResultWriter } from "../services/traderHub/batchResultWriter.ts";

const rateLimiter = new ExchangeRateLimiter();

// Event loop lag measurement
let eventLoopLagMs = 0;
setInterval(() => {
  const start = Date.now();
  setImmediate(() => { eventLoopLagMs = Date.now() - start; });
}, 1000);

function gauge(name: string, value: number, labels: Record<string, string> = ""  as unknown as Record<string, string>, help?: string): string {
  const labelStr = typeof labels === "object" && Object.keys(labels).length > 0
    ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",")}}`
    : "";
  const helpLine = help ? `# HELP ${name} ${help}\n# TYPE ${name} gauge\n` : "";
  return `${helpLine}${name}${labelStr} ${value}\n`;
}

export function registerMetricsRoute(app: Express, deps: {
  botScheduler?: { getMetrics(): Promise<{ waiting: number; active: number; delayed: number; failed: number; priorityHigh: number; priorityNormal: number }> };
}): void {
  app.get("/api/metrics", async (_req, res) => {
    const lines: string[] = [];

    // ── Node.js process ──────────────────────────────────────
    const mem = process.memoryUsage();
    lines.push(gauge("bitrium_process_heap_used_bytes", mem.heapUsed, {}, "Heap memory used"));
    lines.push(gauge("bitrium_process_heap_total_bytes", mem.heapTotal));
    lines.push(gauge("bitrium_process_rss_bytes", mem.rss));
    lines.push(gauge("bitrium_process_external_bytes", mem.external));
    lines.push(gauge("bitrium_event_loop_lag_ms", eventLoopLagMs, {}, "Event loop lag in ms"));
    lines.push(gauge("bitrium_uptime_seconds", Math.floor(process.uptime()), {}, "Process uptime"));

    // ── BullMQ queue ─────────────────────────────────────────
    if (deps.botScheduler) {
      try {
        const q = await deps.botScheduler.getMetrics();
        lines.push(gauge("bitrium_bot_queue_waiting", q.waiting, {}, "Bot jobs waiting in queue"));
        lines.push(gauge("bitrium_bot_queue_active", q.active, {}, "Bot jobs currently processing"));
        lines.push(gauge("bitrium_bot_queue_delayed", q.delayed, {}, "Bot jobs scheduled for future"));
        lines.push(gauge("bitrium_bot_queue_failed", q.failed, {}, "Bot jobs failed"));
        lines.push(gauge("bitrium_bot_queue_priority_high", q.priorityHigh, {}, "High priority jobs waiting"));
        lines.push(gauge("bitrium_bot_queue_priority_normal", q.priorityNormal, {}, "Normal priority jobs waiting"));
      } catch { /* best-effort */ }
    }

    // ── Exchange rate limiter ─────────────────────────────────
    try {
      const usage = await rateLimiter.getAllUsage();
      for (const [venue, data] of Object.entries(usage)) {
        lines.push(gauge("bitrium_exchange_rl_usage", data.usage, { venue }, "Rate limiter usage per exchange"));
        lines.push(gauge("bitrium_exchange_rl_max", data.max, { venue }, "Rate limiter max per exchange"));
        lines.push(gauge("bitrium_exchange_rl_ratio", data.ratio, { venue }, "Rate limiter usage ratio 0-1"));
      }
    } catch { /* best-effort */ }

    // ── Circuit breakers ─────────────────────────────────────
    try {
      const circuits = await getAllCircuitStatus();
      for (const c of circuits) {
        const stateValue = c.state === "CLOSED" ? 0 : c.state === "HALF_OPEN" ? 1 : 2;
        lines.push(gauge("bitrium_circuit_breaker_state", stateValue, { venue: c.venue }, "Circuit breaker state: 0=CLOSED 1=HALF_OPEN 2=OPEN"));
        lines.push(gauge("bitrium_circuit_breaker_failures", c.failures, { venue: c.venue }, "Circuit breaker failure count"));
        if (c.openSinceMs !== null) {
          lines.push(gauge("bitrium_circuit_breaker_open_since_ms", c.openSinceMs, { venue: c.venue }));
        }
      }
    } catch { /* best-effort */ }

    // ── Bot Breakers ──────────────────────────────────────────
    try {
      const bb = await botBreaker.getStatus();
      let marketOpen = 0;
      for (const m of bb.marketBreakers) {
        if (m.open) marketOpen++;
        lines.push(gauge("bitrium_bot_breaker_market_trades", m.count, { symbol: m.symbol }, "Market breaker trade count"));
      }
      lines.push(gauge("bitrium_bot_breaker_market_open_total", marketOpen, {}, "Open market breakers"));

      let stratOpen = 0;
      for (const s of bb.strategyBreakers) {
        if (s.open) stratOpen++;
      }
      lines.push(gauge("bitrium_bot_breaker_strategy_open_total", stratOpen, {}, "Open strategy breakers"));

      let userOpen = 0;
      for (const u of bb.userBreakers) {
        if (u.open) userOpen++;
      }
      lines.push(gauge("bitrium_bot_breaker_user_open_total", userOpen, {}, "Open user breakers"));
    } catch { /* best-effort */ }

    // ── Batch result writer ───────────────────────────────────
    lines.push(gauge(
      "bitrium_batch_writer_pending",
      (batchResultWriter as unknown as { pending: Map<string, unknown> }).pending?.size ?? 0,
      {},
      "Bot results pending batch flush",
    ));

    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(lines.join(""));
  });

  // ── JSON Rate Limiter Dashboard ──
  // GET /api/metrics/rate-limiter — full JSON snapshot of REST weight usage
  app.get("/api/metrics/rate-limiter", async (_req, res) => {
    try {
      const { getFullMetrics, isInStartupDamper, getRateLimiterStatus } = await import("../services/binanceRateLimiter.ts");
      const full = getFullMetrics();
      const status = getRateLimiterStatus();
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        startupDamperActive: isInStartupDamper(),
        uptimeSeconds: Math.floor(process.uptime()),
        summary: {
          currentWeight: status.currentWeight,
          weightLimit: status.weightLimit,
          usagePct: Math.round((status.currentWeight / status.weightLimit) * 100),
          circuitState: status.circuitState,
          cooldownActive: status.cooldownActive,
          total429: status.total429s,
          total418: status.total418s,
          health: status.currentWeight < 400 ? "HEALTHY" : status.currentWeight < 700 ? "ELEVATED" : status.currentWeight < 1000 ? "WARNING" : "CRITICAL",
        },
        ...full,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? "metrics_failed" });
    }
  });
}
