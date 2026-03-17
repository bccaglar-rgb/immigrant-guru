const { readFileSync } = require("fs");
const { resolve } = require("path");

// Load .env file if it exists
const envFromFile = {};
try {
  const envPath = resolve(__dirname, ".env");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    envFromFile[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
} catch {
  // No .env file — use defaults
}

module.exports = {
  apps: [
    // ═══════════════════════════════════════════════════════════════
    // Market Worker: Binance WS ingest → normalize → gateway broadcast
    // Rule: NO CPU-heavy work (no scanner, no coin analysis, no RSI/ATR)
    // ═══════════════════════════════════════════════════════════════
    {
      name: "market-worker",
      script: "server/src/index.ts",
      interpreter: "node",
      interpreter_args: "--experimental-strip-types",
      instances: 3,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 8090,
        ...envFromFile,
      },
      kill_timeout: 10000,
      max_memory_restart: "1500M",
      merge_logs: true,
      time: true,
    },
    // ═══════════════════════════════════════════════════════════════
    // Scanner Worker: SystemScanner + CoinUniverseEngine + TradeIdeaTracker
    // CPU-heavy analysis isolated from market data pipeline
    // Makes HTTP requests to market-worker for trade idea evaluation
    // ═══════════════════════════════════════════════════════════════
    {
      name: "scanner-worker",
      script: "server/src/scannerProcess.ts",
      interpreter: "node",
      interpreter_args: "--experimental-strip-types",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        MARKET_WORKER_PORT: 8090,
        ...envFromFile,
      },
      kill_timeout: 10000,
      max_memory_restart: "1000M",
      merge_logs: true,
      time: true,
    },
  ],
};
