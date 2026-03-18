/**
 * PM2 Ecosystem Config — Bitrium Production
 *
 * Usage:
 *   pm2 start deploy/pm2.ecosystem.config.js
 *   pm2 start deploy/pm2.ecosystem.config.js --only api
 *   pm2 start deploy/pm2.ecosystem.config.js --only market-hub
 *
 * Architecture:
 *   api         → API Cluster (3 workers, IS_PRIMARY=Worker 0)
 *   market-hub  → External market data hub (HUB_EXTERNAL=true on API side)
 *   scanner     → System scanner (future: separate process)
 *
 * Faz 1: api + market-hub on same machine (single server)
 * Faz 2: market-hub on dedicated machine (set HUB_EXTERNAL=true on API)
 */

module.exports = {
  apps: [

    // ── API Cluster ──────────────────────────────────────────────
    {
      name: "api",
      script: "./server/src/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx/esm",
      instances: 3,
      exec_mode: "cluster",
      // Worker 0 = IS_PRIMARY (runs scheduler, hub, etc.)
      // Workers 1-2 = HTTP only

      env: {
        NODE_ENV: "production",
        PORT: 8090,
        HOST: "0.0.0.0",

        // ── Database ───────────────────────────────────────
        // Point to PgBouncer, NOT PostgreSQL directly
        DB_HOST: "127.0.0.1",
        DB_PORT: 6432,
        DB_NAME: "bitrium",
        // DB_USER, DB_PASSWORD set via environment or .env

        // ── Redis ──────────────────────────────────────────
        REDIS_HOST: "127.0.0.1",
        REDIS_PORT: 6379,
        // REDIS_PASSWORD set via environment

        // ── Market Hub mode ───────────────────────────────
        // Faz 1: HUB_EXTERNAL=false (local hub, same machine)
        // Faz 2: set to true when market-hub runs separately
        HUB_EXTERNAL: false,

        // ── Bot limits ────────────────────────────────────
        MAX_BOTS_PER_USER: 50,
      },

      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",

      max_memory_restart: "1500M",
      restart_delay: 5000,
      min_uptime: "10s",
      max_restarts: 10,

      // Graceful shutdown timeout (ms)
      kill_timeout: 10000,
    },

    // ── Market Hub (external mode) ───────────────────────────────
    // Faz 2: deploy this on a DEDICATED machine
    // Faz 1: can run on same machine for testing
    {
      name: "market-hub",
      script: "./server/market-hub/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx/esm",
      instances: 1,
      exec_mode: "fork",

      env: {
        NODE_ENV: "production",
        PORT: 8091,

        REDIS_HOST: "127.0.0.1",
        REDIS_PORT: 6379,

        // Exchange WS connections (market hub only)
        // BINANCE_API_KEY, BINANCE_API_SECRET set via environment
      },

      error_file: "./logs/market-hub-error.log",
      out_file: "./logs/market-hub-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",

      max_memory_restart: "800M",
      restart_delay: 3000,
      min_uptime: "10s",
      max_restarts: 20, // hub reconnects frequently — allow more restarts
    },

    // ── Worker Cluster (Faz 2) ───────────────────────────────────
    // Placeholder: separate bot decision + optimization workers
    // Faz 1: handled by api Worker 0
    // Faz 2: uncomment and deploy on worker machine
    // {
    //   name: "worker-decision",
    //   script: "./server/workers/decision.ts",
    //   instances: 4,
    //   exec_mode: "fork",
    //   env: { WORKER_TYPE: "decision", ... },
    // },
    // {
    //   name: "worker-optimizer",
    //   script: "./server/workers/optimizer.ts",
    //   instances: 2,
    //   exec_mode: "fork",
    //   env: { WORKER_TYPE: "optimizer", ... },
    // },

  ],
};
