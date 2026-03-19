/**
 * AdapterTestMatrix — Certification test suite for exchange adapters.
 *
 * Before a new adapter is considered production-ready, it must pass all test
 * scenarios in this matrix. Tests can be run against testnet or with dry-run mode.
 *
 * Categories:
 * 1. Order Lifecycle: market, limit, cancel, partial fill, reject
 * 2. Error Handling: insufficient balance, precision error, timeout, rate limit
 * 3. Connectivity: reconnect, stream desync, stale connection
 * 4. Symbol: normalization, metadata, unsupported symbol
 */
import type { CoreVenue } from "./types.ts";

export type TestCategory = "ORDER_LIFECYCLE" | "ERROR_HANDLING" | "CONNECTIVITY" | "SYMBOL";
export type TestStatus = "PASS" | "FAIL" | "SKIP" | "NOT_RUN";

export interface TestCase {
  id: string;
  category: TestCategory;
  name: string;
  description: string;
  venue: CoreVenue | "ALL";
  critical: boolean; // Must pass for adapter certification
}

export interface TestResult {
  testId: string;
  venue: CoreVenue;
  status: TestStatus;
  durationMs: number;
  message: string;
  timestamp: string;
}

// ── Test Case Definitions ────────────────────────────────────

export const TEST_MATRIX: TestCase[] = [
  // ── Order Lifecycle ──
  {
    id: "OL-001", category: "ORDER_LIFECYCLE", venue: "ALL", critical: true,
    name: "Market Order Buy",
    description: "Submit a market buy order, verify FILLED status and fill qty/price returned",
  },
  {
    id: "OL-002", category: "ORDER_LIFECYCLE", venue: "ALL", critical: true,
    name: "Market Order Sell",
    description: "Submit a market sell order, verify FILLED status",
  },
  {
    id: "OL-003", category: "ORDER_LIFECYCLE", venue: "ALL", critical: true,
    name: "Limit Order Place + Cancel",
    description: "Place a limit order far from market, verify NEW status, then cancel and verify CANCELED",
  },
  {
    id: "OL-004", category: "ORDER_LIFECYCLE", venue: "ALL", critical: false,
    name: "Partial Fill",
    description: "Place a large limit order at market edge, verify PARTIALLY_FILLED status handling",
  },
  {
    id: "OL-005", category: "ORDER_LIFECYCLE", venue: "ALL", critical: true,
    name: "Order Rejection (invalid params)",
    description: "Submit order with qty below minQty, verify exchange returns rejection",
  },
  {
    id: "OL-006", category: "ORDER_LIFECYCLE", venue: "ALL", critical: true,
    name: "Reduce-Only Order",
    description: "Open a position, then submit reduce-only close order, verify it reduces position",
  },
  {
    id: "OL-007", category: "ORDER_LIFECYCLE", venue: "ALL", critical: false,
    name: "Stop Order",
    description: "Place a stop-market order, verify it is accepted and in open orders list",
  },
  {
    id: "OL-008", category: "ORDER_LIFECYCLE", venue: "ALL", critical: false,
    name: "Take-Profit Order",
    description: "Place a take-profit order, verify acceptance",
  },

  // ── Error Handling ──
  {
    id: "EH-001", category: "ERROR_HANDLING", venue: "ALL", critical: true,
    name: "Insufficient Balance",
    description: "Submit order exceeding available balance, verify proper error code returned",
  },
  {
    id: "EH-002", category: "ERROR_HANDLING", venue: "ALL", critical: true,
    name: "Precision Error (qty)",
    description: "Submit order with too many decimal places, verify normalizer rounds correctly",
  },
  {
    id: "EH-003", category: "ERROR_HANDLING", venue: "ALL", critical: true,
    name: "Precision Error (price)",
    description: "Submit limit order with price not aligned to tickSize, verify normalizer rounds",
  },
  {
    id: "EH-004", category: "ERROR_HANDLING", venue: "ALL", critical: true,
    name: "Timeout Handling",
    description: "Simulate slow exchange response, verify intent goes to SENT and reconciler picks it up",
  },
  {
    id: "EH-005", category: "ERROR_HANDLING", venue: "ALL", critical: true,
    name: "Rate Limit Response",
    description: "Trigger exchange 429 response, verify circuit breaker increments and intent retries",
  },
  {
    id: "EH-006", category: "ERROR_HANDLING", venue: "ALL", critical: false,
    name: "Invalid API Key",
    description: "Use revoked API key, verify proper error code and no retry loop",
  },
  {
    id: "EH-007", category: "ERROR_HANDLING", venue: "ALL", critical: false,
    name: "IP Whitelist Rejection",
    description: "Verify proper error message when server IP is not whitelisted on exchange",
  },

  // ── Connectivity ──
  {
    id: "CN-001", category: "CONNECTIVITY", venue: "ALL", critical: true,
    name: "WebSocket Reconnect",
    description: "Disconnect private stream, verify auto-reconnect within 30s and subscription restore",
  },
  {
    id: "CN-002", category: "CONNECTIVITY", venue: "ALL", critical: true,
    name: "Stale Connection Detection",
    description: "Simulate no pong for 2 minutes, verify manager detects stale and reconnects",
  },
  {
    id: "CN-003", category: "CONNECTIVITY", venue: "BINANCE", critical: true,
    name: "Listen Key Renewal",
    description: "Verify Binance listen key is renewed before 60-min expiry",
  },
  {
    id: "CN-004", category: "CONNECTIVITY", venue: "ALL", critical: false,
    name: "Stream Desync Recovery",
    description: "After reconnect, verify position/balance state matches exchange REST query",
  },

  // ── Symbol ──
  {
    id: "SY-001", category: "SYMBOL", venue: "ALL", critical: true,
    name: "Symbol Normalization",
    description: "Verify internal BTCUSDT maps to correct exchange format (BTC_USDT for Gate, BTCUSDT for Binance)",
  },
  {
    id: "SY-002", category: "SYMBOL", venue: "ALL", critical: true,
    name: "Symbol Metadata Fetch",
    description: "Fetch exchangeInfo/contracts, verify stepSize/tickSize/minNotional populated",
  },
  {
    id: "SY-003", category: "SYMBOL", venue: "ALL", critical: false,
    name: "Unsupported Symbol",
    description: "Submit order for delisted/non-existent symbol, verify proper rejection",
  },
];

// ── Test Runner ──────────────────────────────────────────────

export class AdapterTestRunner {
  private results: TestResult[] = [];

  /** Get all test cases, optionally filtered by venue. */
  getTestCases(venue?: CoreVenue): TestCase[] {
    if (!venue) return TEST_MATRIX;
    return TEST_MATRIX.filter((t) => t.venue === "ALL" || t.venue === venue);
  }

  /** Record a test result. */
  recordResult(result: TestResult): void {
    this.results.push(result);
  }

  /** Get all results, optionally filtered. */
  getResults(venue?: CoreVenue): TestResult[] {
    if (!venue) return this.results;
    return this.results.filter((r) => r.venue === venue);
  }

  /** Get certification summary for a venue. */
  getCertificationStatus(venue: CoreVenue): {
    venue: CoreVenue;
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    notRun: number;
    criticalPassed: number;
    criticalTotal: number;
    certified: boolean;
  } {
    const tests = this.getTestCases(venue);
    const results = this.getResults(venue);
    const resultMap = new Map(results.map((r) => [r.testId, r]));

    let passed = 0, failed = 0, skipped = 0, notRun = 0;
    let criticalPassed = 0, criticalTotal = 0;

    for (const test of tests) {
      const result = resultMap.get(test.id);
      if (!result) { notRun++; continue; }
      if (result.status === "PASS") { passed++; if (test.critical) criticalPassed++; }
      else if (result.status === "FAIL") { failed++; }
      else if (result.status === "SKIP") { skipped++; }
      else { notRun++; }
      if (test.critical) criticalTotal++;
    }

    return {
      venue,
      totalTests: tests.length,
      passed, failed, skipped, notRun,
      criticalPassed, criticalTotal,
      certified: criticalPassed === criticalTotal && criticalTotal > 0,
    };
  }
}
