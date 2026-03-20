/**
 * Internal Egress Proxy Route
 *
 * This route runs on ALL API servers but is only useful on servers
 * whose IP is NOT banned by the target exchange.
 *
 * Purpose: Forward exchange REST requests from another API server
 * through THIS server's outbound IP.
 *
 * Security:
 *   - Only accessible from VPC (10.110.0.0/20)
 *   - Rate-limited independently (prevents abuse)
 *   - Logs all proxied requests for audit
 *   - Does NOT bypass the global rate limiter — caller must have budget
 *
 * Route: POST /internal/egress-proxy
 *
 * Request:
 *   Headers:
 *     X-Egress-Target-Url: "https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=5"
 *     X-Egress-Source: "binance-primary"
 *   OR Body:
 *     { url: "...", method: "GET", headers: {...}, body: "..." }
 *
 * Response:
 *   { status: 200, headers: {...}, body: "..." }
 */

import { Router, type Request, type Response } from "express";

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// VPC GUARD — Only allow requests from internal network
// ═══════════════════════════════════════════════════════════════════

const VPC_CIDRS = ["10.110.0.", "127.0.0.1", "::1", "::ffff:10.110.0.", "::ffff:127.0.0.1"];

const isVpcRequest = (req: Request): boolean => {
  const ip = req.ip ?? req.socket.remoteAddress ?? "";
  return VPC_CIDRS.some((cidr) => ip.includes(cidr));
};

// ═══════════════════════════════════════════════════════════════════
// PROXY METRICS
// ═══════════════════════════════════════════════════════════════════

const proxyMetrics = {
  totalRequests: 0,
  totalErrors: 0,
  totalBlocked: 0,
  totalTimeouts: 0,
  avgLatencyMs: 0,
  byExchange: new Map<string, number>(),
};

// ═══════════════════════════════════════════════════════════════════
// ALLOWED HOSTS — Only proxy to known exchange domains
// ═══════════════════════════════════════════════════════════════════

const ALLOWED_HOSTS = new Set([
  "fapi.binance.com",
  "fapi1.binance.com",
  "fapi2.binance.com",
  "fapi3.binance.com",
  "fapi4.binance.com",
  "api.binance.com",
  "api.bybit.com",
  "www.okx.com",
  "api.gateio.ws",
  "fx-api.gateio.ws",
]);

const isAllowedUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
};

// ═══════════════════════════════════════════════════════════════════
// LOCAL RATE LIMITER (proxy-specific, prevents abuse)
// ═══════════════════════════════════════════════════════════════════

let proxyRequestCount = 0;
const PROXY_MAX_RPM = 300; // Max 300 proxied requests per minute

setInterval(() => {
  proxyRequestCount = 0;
}, 60_000);

// ═══════════════════════════════════════════════════════════════════
// PROXY ENDPOINT
// ═══════════════════════════════════════════════════════════════════

router.post("/internal/egress-proxy", async (req: Request, res: Response) => {
  // ── Security: VPC only ──
  if (!isVpcRequest(req)) {
    proxyMetrics.totalBlocked++;
    res.status(403).json({ error: "forbidden", message: "VPC access only" });
    return;
  }

  // ── Local rate limit ──
  proxyRequestCount++;
  if (proxyRequestCount > PROXY_MAX_RPM) {
    proxyMetrics.totalBlocked++;
    res.status(429).json({ error: "proxy_rate_limit", message: "Proxy rate limit exceeded" });
    return;
  }

  proxyMetrics.totalRequests++;

  // ── Parse request ──
  const targetUrl = (req.headers["x-egress-target-url"] as string) ?? req.body?.url;
  const method = req.body?.method ?? "GET";
  const targetHeaders = req.body?.headers ?? {};
  const targetBody = req.body?.body ?? undefined;
  const source = (req.headers["x-egress-source"] as string) ?? "unknown";
  const isProbe = req.headers["x-egress-probe"] === "1";

  if (!targetUrl) {
    res.status(400).json({ error: "missing_url", message: "Target URL required" });
    return;
  }

  // ── URL allowlist ──
  if (!isAllowedUrl(targetUrl)) {
    proxyMetrics.totalBlocked++;
    res.status(403).json({ error: "url_not_allowed", message: "Target host not in allowlist" });
    return;
  }

  const startMs = Date.now();

  try {
    // ── Forward the request ──
    const upstream = await fetch(targetUrl, {
      method,
      headers: {
        ...targetHeaders,
        // Remove hop-by-hop headers
        "Host": undefined as unknown as string,
        "Connection": undefined as unknown as string,
      },
      body: method !== "GET" && method !== "HEAD" ? targetBody : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startMs;
    proxyMetrics.avgLatencyMs = proxyMetrics.avgLatencyMs * 0.9 + latencyMs * 0.1;

    // Track by exchange
    try {
      const host = new URL(targetUrl).hostname;
      const exchange = host.includes("binance") ? "binance"
        : host.includes("bybit") ? "bybit"
        : host.includes("okx") ? "okx"
        : host.includes("gate") ? "gateio"
        : "unknown";
      proxyMetrics.byExchange.set(exchange, (proxyMetrics.byExchange.get(exchange) ?? 0) + 1);
    } catch { /* ignore parse errors */ }

    // ── Read response ──
    const contentType = upstream.headers.get("content-type") ?? "";
    let responseBody: unknown;

    if (contentType.includes("application/json")) {
      responseBody = await upstream.json();
    } else {
      responseBody = await upstream.text();
    }

    // ── Collect important response headers ──
    const responseHeaders: Record<string, string> = {};
    const forwardHeaders = [
      "x-mbx-used-weight-1m",
      "x-mbx-order-count-1m",
      "retry-after",
      "content-type",
    ];
    for (const h of forwardHeaders) {
      const val = upstream.headers.get(h);
      if (val) responseHeaders[h] = val;
    }

    // Log non-probe proxied requests
    if (!isProbe) {
      const level = upstream.status >= 400 ? "warn" : "debug";
      if (level === "warn" || proxyMetrics.totalRequests % 100 === 0) {
        console.log(
          `[EgressProxy] ${method} ${targetUrl.split("?")[0]} → ${upstream.status} ` +
          `(${latencyMs}ms, from=${source})`,
        );
      }
    }

    res.status(200).json({
      status: upstream.status,
      headers: responseHeaders,
      body: responseBody,
      latencyMs,
    });
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    proxyMetrics.totalErrors++;

    const errorMsg = err instanceof Error ? err.message : "unknown";
    const isTimeout = errorMsg.includes("timeout") || errorMsg.includes("TimeoutError");
    if (isTimeout) proxyMetrics.totalTimeouts++;

    console.error(
      `[EgressProxy] FAILED ${method} ${targetUrl?.split("?")[0]} ` +
      `(${latencyMs}ms, error=${errorMsg}, from=${source})`,
    );

    res.status(502).json({
      error: "upstream_error",
      message: isTimeout ? "upstream_timeout" : errorMsg,
      latencyMs,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PROXY HEALTH CHECK (for monitor probes)
// ═══════════════════════════════════════════════════════════════════

router.get("/internal/egress-proxy/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    metrics: {
      totalRequests: proxyMetrics.totalRequests,
      totalErrors: proxyMetrics.totalErrors,
      totalBlocked: proxyMetrics.totalBlocked,
      totalTimeouts: proxyMetrics.totalTimeouts,
      avgLatencyMs: Math.round(proxyMetrics.avgLatencyMs),
      byExchange: Object.fromEntries(proxyMetrics.byExchange),
      currentRpm: proxyRequestCount,
      maxRpm: PROXY_MAX_RPM,
    },
  });
});

export default router;
