/**
 * Scanner Process — runs SystemScanner + CoinUniverseEngine + TradeIdeaTracker
 * in a DEDICATED PM2 process, completely isolated from market data pipeline.
 *
 * Rule: Market data pipeline NEVER does CPU work.
 *       market-worker: receive → normalize → broadcast
 *       scanner-worker: RSI, ATR, S/R, coin scoring, trade idea generation
 *
 * The scanner makes HTTP requests to the market-worker for trade idea evaluation.
 * It does NOT need Binance WS — uses REST API for universe data.
 */

import { ensureDbConnection } from "./db/pool.ts";
import { ensureRedisConnection } from "./db/redis.ts";
import { TradeIdeaStore } from "./services/tradeIdeaStore.ts";
import { TradeIdeaTracker } from "./services/tradeIdeaTracker.ts";
import { SystemScannerService } from "./services/systemScannerService.ts";
import { CoinUniverseEngine } from "./services/coinUniverseEngine.ts";
import { exportYesterday } from "./services/coldStorage/parquetExporter.ts";

// ── Stub BinanceFuturesHub: scanner uses REST API for universe, not WS ──
// The SystemScannerService.ensureUniverse() tries REST first (Binance 24hr ticker),
// then falls back to WS hub. In the scanner process, WS hub returns empty → REST is used.
const stubBinanceFuturesHub = {
  getUniverseRows() {
    return []; // Force REST API fallback
  },
};

// ── Lightweight BinanceFuturesHub stub for CoinUniverseEngine ──
// CoinUniverseEngine needs getCandles() and subscribeSymbols() from the hub.
// In the scanner process, it will use REST API internally.
const stubBinanceFuturesHubForCoinEngine = {
  getUniverseRows() {
    return [];
  },
};

const serverPort = Number(process.env.MARKET_WORKER_PORT ?? process.env.PORT ?? 8090);

async function main() {
  console.log("[scanner-worker] Starting scanner process...");

  await ensureDbConnection();
  await ensureRedisConnection();

  const tradeIdeaStore = new TradeIdeaStore();
  const tradeIdeaTracker = new TradeIdeaTracker(tradeIdeaStore);

  const coinUniverseEngine = new CoinUniverseEngine({
    binanceFuturesHub: stubBinanceFuturesHubForCoinEngine as any,
  });

  const systemScanner = new SystemScannerService({
    binanceFuturesHub: stubBinanceFuturesHub as any,
    tradeIdeaStore,
    serverPort,
    coinUniverseEngine,
  });

  // Start services
  tradeIdeaTracker.start();
  systemScanner.start();

  // ── Nightly Parquet export scheduler ──
  // Runs at 00:30 UTC daily: exports previous day's 1m candles to MinIO as Parquet
  const scheduleNightlyExport = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(0, 30, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    const delayMs = next.getTime() - now.getTime();
    console.log(`[scanner-worker] Next Parquet export at ${next.toISOString()} (in ${Math.round(delayMs / 60_000)}m)`);
    setTimeout(async () => {
      try {
        console.log("[scanner-worker] Starting nightly Parquet export...");
        const result = await exportYesterday();
        console.log(`[scanner-worker] Parquet export done: ${result.exported} files, ${result.errors} errors`);
      } catch (err: any) {
        console.error("[scanner-worker] Parquet export failed:", err?.message ?? err);
      }
      // Schedule next run
      scheduleNightlyExport();
    }, delayMs);
  };
  scheduleNightlyExport();

  console.log(`[scanner-worker] Scanner process ready — targeting market worker at port ${serverPort}`);
  console.log("[scanner-worker] Services: SystemScanner, CoinUniverseEngine, TradeIdeaTracker, ParquetExporter");

  // Keep process alive
  process.on("SIGINT", () => {
    console.log("[scanner-worker] Shutting down...");
    systemScanner.stop();
    tradeIdeaTracker.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("[scanner-worker] Shutting down...");
    systemScanner.stop();
    tradeIdeaTracker.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[scanner-worker] [FATAL] Bootstrap failed:", err);
  process.exit(1);
});
