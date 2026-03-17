// Load .env from project root (Node 22+ native API)
try { process.loadEnvFile(); } catch { /* .env optional */ }

import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { ensureDbConnection } from "./db/pool.ts";
import { ensureRedisConnection } from "./db/redis.ts";
import { registerConnectionRoutes } from "./routes/connections.ts";
import { registerExchangeRoutes } from "./routes/exchanges.ts";
import { registerMarketRoutes } from "./routes/market.ts";
import { registerTradeRoutes } from "./routes/trade.ts";
import { registerAuthRoutes } from "./routes/auth.ts";
import { registerPaymentsRoutes } from "./routes/payments.ts";
import { registerTokenCreatorRoutes } from "./routes/tokenCreator.ts";
import { registerUserSettingsRoutes } from "./routes/userSettings.ts";
import { registerTradeIdeasRoutes } from "./routes/tradeIdeas.ts";
import { registerAdminProviderRoutes } from "./routes/adminProviders.ts";
import { registerAiTradeIdeasRoutes } from "./routes/aiTradeIdeas.ts";
import { registerTraderHubRoutes } from "./routes/traderHub.ts";
import { registerExchangeCoreRoutes } from "./routes/exchangeCore.ts";
import { ExchangeManager } from "./exchangeManager/index.ts";
import { AuditLogService } from "./services/auditLog.ts";
import { ConnectionService } from "./services/connectionService.ts";
import { TradeIdeaStore } from "./services/tradeIdeaStore.ts";
import { TradeIdeaTracker } from "./services/tradeIdeaTracker.ts";
import { AdminProviderStore } from "./services/adminProviderStore.ts";
import { AiProviderStore } from "./services/aiProviderStore.ts";
import { BinanceFuturesHub } from "./services/binanceFuturesHub.ts";
import { ExchangeCoreService } from "./services/exchangeCore/exchangeCoreService.ts";
import { ExchangeMarketHub } from "./services/marketHub/index.ts";
import { TraderHubStore } from "./services/traderHub/traderHubStore.ts";
import { TraderHubEngine } from "./services/traderHub/traderHubEngine.ts";
import { BotScheduler } from "./services/traderHub/botScheduler.ts";
import { writeFeatureCache } from "./services/traderHub/featureCache.ts";
import { markFeaturesRefreshed } from "./services/traderHub/featureFreshness.ts";
import { createGateway } from "./ws/gateway.ts";
import { HubEventBridge } from "./services/marketHub/HubEventBridge.ts";
import { PaymentStore } from "./payments/storage.ts";
import { AuthService } from "./payments/authService.ts";
import { PaymentService } from "./payments/paymentService.ts";
import { TronClient } from "./payments/tronClient.ts";
import { TronMonitorService } from "./payments/monitorService.ts";
import { TokenCreatorService } from "./payments/tokenCreatorService.ts";
import { SystemScannerService } from "./services/systemScannerService.ts";
import { CoinUniverseEngine } from "./services/coinUniverseEngine.ts";

// PM2 cluster mode: Worker 0 = primary (runs singleton services + HTTP)
// Worker 1, 2 = HTTP-only
const WORKER_ID = Number(process.env.NODE_APP_INSTANCE ?? "0");
const IS_PRIMARY = WORKER_ID === 0;

const app = express();
app.use(express.json());
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "exchange-backend", worker: WORKER_ID, primary: IS_PRIMARY });
});

const audit = new AuditLogService();
const connections = new ConnectionService();

// ── Persistent Encryption Key ──────────────────────────────────
// CRITICAL: Must survive restarts. Without a stable key, encrypted
// exchange credentials become unrecoverable after PM2 restart.
const encryptionKey = (() => {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    const buf = Buffer.from(envKey, "hex");
    if (buf.length !== 32) {
      throw new Error("ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
    }
    console.log(`[Worker ${WORKER_ID}] Using persistent ENCRYPTION_KEY from env`);
    return buf;
  }
  // Dev fallback: deterministic key from DB password so it survives restarts
  if (process.env.NODE_ENV !== "production") {
    const seed = process.env.DB_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "dev-key-not-for-prod";
    const buf = createHash("sha256").update(seed).digest();
    console.warn(`[Worker ${WORKER_ID}] WARNING: Using dev-fallback encryption key (set ENCRYPTION_KEY for production)`);
    return buf;
  }
  throw new Error("ENCRYPTION_KEY env var required in production");
})();
const exchangeManager = new ExchangeManager(connections, encryptionKey);
const paymentStore = new PaymentStore();
const authService = new AuthService(paymentStore, encryptionKey);
const paymentService = new PaymentService(paymentStore);
const tokenCreatorService = new TokenCreatorService(paymentStore, paymentService);
const tronClient = new TronClient();
const tronMonitor = new TronMonitorService(paymentStore, tronClient, paymentService);
const tradeIdeaStore = new TradeIdeaStore();
const tradeIdeaTracker = new TradeIdeaTracker(tradeIdeaStore);
const adminProviderStore = new AdminProviderStore();
const aiProviderStore = new AiProviderStore();
void aiProviderStore.ensureChatGptEnabled();
const binanceFuturesHub = new BinanceFuturesHub();
const exchangeMarketHub = new ExchangeMarketHub();
const hubEventBridge = new HubEventBridge();
const exchangeCore = new ExchangeCoreService(connections, encryptionKey);
const traderHubStore = new TraderHubStore();
const botScheduler = new BotScheduler(traderHubStore);
const traderHubEngine = new TraderHubEngine(traderHubStore, botScheduler, { exchangeCore });
const serverPort = Number(process.env.PORT ?? 8090);
const coinUniverseEngine = new CoinUniverseEngine({ binanceFuturesHub });
const systemScanner = new SystemScannerService({
  binanceFuturesHub,
  tradeIdeaStore,
  serverPort,
  coinUniverseEngine,
});

// bootstrap: DB connection + payment store + admin user
async function bootstrap() {
  await ensureDbConnection();
  await ensureRedisConnection();
  await paymentStore.bootstrap();
  if (!process.env.DISABLE_DEV_ADMIN) {
    try {
      await authService.signup(process.env.ADMIN_EMAIL ?? "admin@bitrium.local", process.env.ADMIN_PASSWORD ?? "Admin12345!", "ADMIN");
    } catch {
      // already exists
    }
  }
}

registerConnectionRoutes(app, connections, encryptionKey);
registerExchangeRoutes(app, exchangeManager);
registerTradeRoutes(app, audit, connections);
registerMarketRoutes(app, { providerStore: adminProviderStore, binanceFuturesHub, exchangeMarketHub, hubEventBridge, systemScanner, coinUniverseEngine });
registerAuthRoutes(app, authService);
registerUserSettingsRoutes(app);
registerTradeIdeasRoutes(app, tradeIdeaStore, systemScanner);
registerAdminProviderRoutes(app, adminProviderStore);
registerAiTradeIdeasRoutes(app, aiProviderStore, { binanceFuturesHub, coinUniverseEngine, serverPort, isPrimary: IS_PRIMARY });
registerExchangeCoreRoutes(app, exchangeCore);
registerTraderHubRoutes(app, traderHubEngine);
registerPaymentsRoutes(app, authService, paymentService);
registerTokenCreatorRoutes(app, authService, tokenCreatorService);

// In production, serve the Vite-built frontend
if (process.env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, "../../dist");
  app.use(express.static(distPath));
  // SPA fallback: any non-API route returns index.html
  app.get("*", (_req, res) => {
    if (!_req.path.startsWith("/api") && !_req.path.startsWith("/ws")) {
      res.sendFile(path.join(distPath, "index.html"));
    }
  });
}

const server = http.createServer(app);
createGateway(server, { exchangeMarketHub, hubEventBridge, binanceFuturesHub, isPrimary: IS_PRIMARY });

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8090);

bootstrap()
  .then(() => {
    server.listen(port, host, () => {
      // Redis bridge subscriber: ALL workers receive hub events via Redis pub/sub
      hubEventBridge.startSubscriber();

      if (IS_PRIMARY) {
        // Singleton services — only Worker 0 (1 Binance WS → Redis → N workers)
        binanceFuturesHub.start();
        exchangeMarketHub.start();
        hubEventBridge.startPublisher(exchangeMarketHub);
        exchangeCore.start();
        void traderHubEngine.start();
        tronMonitor.start();
        // ══════════════════════════════════════════════════════════════
        // Scanner + TradeIdeaTracker run in scanner-worker (scannerProcess.ts).
        // CoinUniverseEngine refresh runs HERE on Worker 0 because it needs
        // live WS hub data (scanner-worker has stub hub → empty).
        // ══════════════════════════════════════════════════════════════
        // tradeIdeaTracker.start();   // → scanner-worker
        // systemScanner.start();       // → scanner-worker

        // CoinUniverseEngine: refresh every 60s on Worker 0 (needs live WS hub data)
        // After refresh, store snapshot in Redis so Workers 1-2 can serve the endpoint too.
        const COIN_UNIVERSE_REFRESH_MS = 60_000;
        const COIN_UNIVERSE_INITIAL_DELAY_MS = 30_000; // wait for hub to accumulate data
        setTimeout(() => {
          const doRefresh = async () => {
            try {
              // ── BinanceFuturesHub universe → Redis (so Workers 1-2 and scanner-worker can read it) ──
              const hubRows = binanceFuturesHub.getUniverseRows();
              if (hubRows.length > 0) {
                hubEventBridge.storeFuturesUniverse(JSON.stringify({
                  ok: true, rows: hubRows, count: hubRows.length,
                }));
              }

              await coinUniverseEngine.refresh();
              const snapshot = coinUniverseEngine.getSnapshot();
              if (snapshot.activeCoins.length > 0) {
                hubEventBridge.storeUniverseSnapshot(JSON.stringify({
                  ok: true,
                  round: snapshot.round,
                  refreshedAt: snapshot.refreshedAt,
                  activeCoins: snapshot.activeCoins,
                  cooldownCoins: snapshot.cooldownCoins,
                }));

                // ── Shared Feature Engine: write per-symbol features to Redis ──
                // Bot decision workers read these via featureCache.readFeature()
                const allCoins = [...snapshot.activeCoins, ...snapshot.cooldownCoins];
                // Enrich with BinanceFuturesHub depth/imbalance data
                const enriched = allCoins.map((coin: Record<string, unknown>) => {
                  const hubRow = binanceFuturesHub.getLiveRow(String(coin.symbol ?? ""));
                  return {
                    ...coin,
                    depthUsd: hubRow?.depthUsd ?? null,
                    imbalance: hubRow?.imbalance ?? null,
                  };
                });
                await writeFeatureCache(enriched as any);
                await markFeaturesRefreshed();
              }
            } catch (err: any) {
              console.error("[CoinUniverseEngine] Refresh error:", err?.message ?? err);
            }
          };
          void doRefresh(); // first refresh
          setInterval(() => void doRefresh(), COIN_UNIVERSE_REFRESH_MS);
          console.log(`[Worker ${WORKER_ID}] CoinUniverseEngine refresh started (every ${COIN_UNIVERSE_REFRESH_MS / 1000}s)`);
        }, COIN_UNIVERSE_INITIAL_DELAY_MS);

        console.log(`[Worker ${WORKER_ID}] PRIMARY — market data + hub publisher (scanner in separate process)`);
      } else {
        console.log(`[Worker ${WORKER_ID}] HTTP worker (hub events via Redis bridge)`);
      }
      console.log(`[Worker ${WORKER_ID}] Exchange terminal backend on http://${host}:${port}`);
    });
  })
  .catch((err) => {
    console.error(`[Worker ${WORKER_ID}] [FATAL] Bootstrap failed:`, err);
    process.exit(1);
  });
