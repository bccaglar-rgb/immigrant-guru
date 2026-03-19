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
import { registerPaymentWebhookRoutes } from "./routes/paymentWebhook.ts";
import { registerAdminLogsRoutes } from "./routes/adminLogs.ts";
import { registerBugReportRoutes } from "./routes/bugReports.ts";
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
import { registerMLRoutes } from "./routes/ml.ts";
import { registerMetricsRoute } from "./routes/metrics.ts";
import { createGateway, setWsAuthFunction } from "./ws/gateway.ts";
import { HubEventBridge } from "./services/marketHub/HubEventBridge.ts";
import { PaymentStore } from "./payments/storage.ts";
import { AuthService } from "./payments/authService.ts";
import { PaymentService } from "./payments/paymentService.ts";
import { TronClient } from "./payments/tronClient.ts";
import { TronMonitorService } from "./payments/monitorService.ts";
import { TokenCreatorService } from "./payments/tokenCreatorService.ts";
import { SystemScannerService } from "./services/systemScannerService.ts";
import { CoinUniverseEngine } from "./services/coinUniverseEngine.ts";
import { CoinUniverseEngineV2 } from "./services/coinUniverse/universeEngine.ts";
import { registerCoinUniverseRoutes } from "./routes/coinUniverse.ts";
import { adaptiveRR } from "./services/adaptiveRRService.ts";
import { optimizationScheduler } from "./services/optimizer/optimizationScheduler.ts";
import { tickOrchestrator } from "./services/tickOrchestrator.ts";
import { ModePerformanceTracker } from "./services/optimizer/modePerformanceTracker.ts";
import { TradeOutcomeAttributor } from "./services/optimizer/tradeOutcomeAttributor.ts";
import { DynamicSlTpOptimizer } from "./services/optimizer/dynamicSlTpOptimizer.ts";
import { RegimeParameterEngine } from "./services/optimizer/regimeParameterEngine.ts";
import { MetaLabelingFilter } from "./services/optimizer/metaLabelingFilter.ts";
import { ConfidenceCalibrator } from "./services/optimizer/confidenceCalibrator.ts";
import { SelfThrottleEngine } from "./services/optimizer/selfThrottleEngine.ts";
import { FeatureWeightTuner } from "./services/optimizer/featureWeightTuner.ts";
import { registerOptimizerStatsRoutes } from "./routes/optimizerStats.ts";
import { AITradeIdeaEngine } from "./engines/aiTradeIdeas/AITradeIdeaEngine.ts";
import { registerAiEngineV2Routes } from "./routes/aiEngineV2.ts";

// PM2 cluster mode: Worker 0 = primary (runs singleton services + HTTP)
// Worker 1, 2 = HTTP-only
const WORKER_ID = Number(process.env.NODE_APP_INSTANCE ?? "0");
const IS_PRIMARY = WORKER_ID === 0;

// HUB_EXTERNAL: When true, market data hub runs as a separate service (market-hub/).
// All workers read from Redis only — no local WS connections to exchanges.
// When false (default), Worker 0 runs the hub locally (backward compatible).
const HUB_EXTERNAL = process.env.HUB_EXTERNAL === "true";

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

// Wire WS auth: gateway validates tokens via authService
setWsAuthFunction(async (token) => {
  const ctx = await authService.getUserFromToken(token);
  if (!ctx) return null;
  return { userId: ctx.user.id, role: ctx.user.role };
});

// Address Pool for per-invoice TRON deposit addresses
import { AddressPoolService } from "./payments/addressPoolService.ts";
const addressPoolService = new AddressPoolService(encryptionKey);
if (typeof paymentService.setAddressPool === "function") {
  paymentService.setAddressPool(addressPoolService);
} else {
  console.warn("[index] paymentService.setAddressPool not available — skipping address pool setup");
}

const tokenCreatorService = new TokenCreatorService(paymentStore, paymentService);
const tronClient = new TronClient();
const tronMonitor = new TronMonitorService(paymentStore, tronClient, paymentService);
const tradeIdeaStore = new TradeIdeaStore();
const modePerformanceTracker = new ModePerformanceTracker();
const tradeOutcomeAttributor = new TradeOutcomeAttributor(modePerformanceTracker);
const dynamicSlTpOptimizer = new DynamicSlTpOptimizer();
const regimeParameterEngine = new RegimeParameterEngine();
const metaLabelingFilter = new MetaLabelingFilter(modePerformanceTracker, regimeParameterEngine);
const confidenceCalibrator = new ConfidenceCalibrator();
const selfThrottleEngine = new SelfThrottleEngine(modePerformanceTracker);
const featureWeightTuner = new FeatureWeightTuner();
const tradeIdeaTracker = new TradeIdeaTracker(tradeIdeaStore);
const adminProviderStore = new AdminProviderStore();
const aiProviderStore = new AiProviderStore();
void aiProviderStore.ensureChatGptEnabled();
const binanceFuturesHub = new BinanceFuturesHub();
const exchangeMarketHub = new ExchangeMarketHub();
const hubEventBridge = new HubEventBridge();
const exchangeCore = new ExchangeCoreService(connections, encryptionKey);

// ── Private Stream Manager (Faz 9) ──────────────────────────
import { PrivateStreamManager } from "./services/exchangeCore/privateStreamManager.ts";
import { ApiVault } from "./services/exchangeCore/apiVault.ts";
import { PositionTracker } from "./services/exchangeCore/positionTracker.ts";

const apiVault = new ApiVault(encryptionKey);
const positionTracker = new PositionTracker();
const privateStreamManager = new PrivateStreamManager(apiVault, {
  onEvent: (userId, exchangeAccountId, venue, events) => {
    for (const evt of events) {
      if (evt.type === "position_update") {
        const pos = evt as any;
        positionTracker.updatePosition({
          userId,
          exchangeAccountId,
          venue,
          symbol: pos.symbol,
          side: pos.side,
          size: pos.size,
          entryPrice: pos.entryPrice ?? pos.entry_price ?? 0,
          markPrice: null,
          unrealizedPnl: pos.unrealizedPnl ?? pos.unrealized_pnl ?? null,
          leverage: pos.leverage ?? null,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    }
  },
  onDisconnect: (userId, exchangeAccountId, venue) => {
    console.log(`[PrivateStream] Disconnected: ${venue} for user ${userId.slice(0, 8)}`);
  },
  onReconnect: (userId, exchangeAccountId, venue) => {
    console.log(`[PrivateStream] Reconnected: ${venue} for user ${userId.slice(0, 8)}`);
  },
});

const traderHubStore = new TraderHubStore();
const botScheduler = new BotScheduler(traderHubStore);
const traderHubEngine = new TraderHubEngine(traderHubStore, botScheduler, { exchangeCore });
const serverPort = Number(process.env.PORT ?? 8090);

// ── HUB_EXTERNAL mode: Redis-backed stub for BinanceFuturesHub ──
// When hub runs externally, CoinUniverseEngine reads universe from Redis instead of live WS.
let _cachedUniverseRows: Array<Record<string, unknown>> = [];
const redisBinanceHubStub = {
  getUniverseRows() { return _cachedUniverseRows as any; },
  getLiveRow(symbol: string) { return (_cachedUniverseRows as any[]).find((r: any) => r.symbol === symbol) ?? null; },
  getStatus() { return { connected: false, stale: true, note: "external-hub" }; },
  getTickers() { return []; },
  getSymbols() { return []; },
  onEvent() { return () => {}; },
  start() {},
  stop() {},
  subscribeSymbols() {},
  getPricePrecision() { return 2; },
  getQuantityPrecision() { return 3; },
};

const coinUniverseEngine = new CoinUniverseEngine({
  binanceFuturesHub: HUB_EXTERNAL ? redisBinanceHubStub as any : binanceFuturesHub,
});
const coinUniverseEngineV2 = new CoinUniverseEngineV2({
  binanceFuturesHub: HUB_EXTERNAL ? redisBinanceHubStub as any : binanceFuturesHub,
});
const systemScanner = new SystemScannerService({
  binanceFuturesHub: HUB_EXTERNAL ? redisBinanceHubStub as any : binanceFuturesHub,
  tradeIdeaStore,
  serverPort,
  coinUniverseEngine: coinUniverseEngineV2 as any,
});
const aiTradeIdeaEngine = new AITradeIdeaEngine({
  systemScanner, tradeIdeaStore, aiProviderStore,
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
registerExchangeRoutes(app, exchangeManager, authService);
registerTradeRoutes(app, audit, connections, exchangeCore, authService);
registerMarketRoutes(app, { providerStore: adminProviderStore, binanceFuturesHub, exchangeMarketHub, hubEventBridge, systemScanner, coinUniverseEngine });
registerAuthRoutes(app, authService);
registerUserSettingsRoutes(app);
registerTradeIdeasRoutes(app, tradeIdeaStore, systemScanner);
registerAdminProviderRoutes(app, adminProviderStore, authService);
registerAiTradeIdeasRoutes(app, aiProviderStore, { binanceFuturesHub, coinUniverseEngine: coinUniverseEngineV2 as any, serverPort, isPrimary: IS_PRIMARY, tradeIdeaStore });
registerExchangeCoreRoutes(app, exchangeCore, authService);
registerTraderHubRoutes(app, traderHubEngine);
registerCoinUniverseRoutes(app, coinUniverseEngineV2);
registerOptimizerStatsRoutes(app, modePerformanceTracker, tradeOutcomeAttributor, dynamicSlTpOptimizer, regimeParameterEngine, confidenceCalibrator, selfThrottleEngine, featureWeightTuner);
registerPaymentsRoutes(app, authService, paymentService, addressPoolService);
registerTokenCreatorRoutes(app, authService, tokenCreatorService);
registerPaymentWebhookRoutes(app);
registerAdminLogsRoutes(app, authService);
registerBugReportRoutes(app, authService);
registerMLRoutes(app);
registerMetricsRoute(app, {});
registerAiEngineV2Routes(app, aiTradeIdeaEngine);

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
const wss = createGateway(server, { exchangeMarketHub, hubEventBridge, binanceFuturesHub, isPrimary: IS_PRIMARY, hubExternal: HUB_EXTERNAL });

// Wire PrivateStreamManager events → gateway broadcast (Pipeline 8)
const origOnEvent = privateStreamManager["callbacks"].onEvent;
privateStreamManager["callbacks"].onEvent = (userId, exchangeAccountId, venue, events) => {
  origOnEvent(userId, exchangeAccountId, venue, events);
  for (const evt of events) {
    (wss as any).broadcastPrivateEvent?.(userId, exchangeAccountId, {
      type: evt.type,
      venue,
      ...evt,
      ts: Date.now(),
    });
  }
};

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8090);

bootstrap()
  .then(() => {
    server.listen(port, host, () => {
      // Redis bridge subscriber: ALL workers receive hub events via Redis pub/sub
      hubEventBridge.startSubscriber();

      if (IS_PRIMARY) {
        // ── Market Data Hub: local vs external ──
        if (!HUB_EXTERNAL) {
          // LOCAL MODE: Worker 0 runs WS hub (backward compatible)
          binanceFuturesHub.start();
          exchangeMarketHub.start();
          hubEventBridge.startPublisher(exchangeMarketHub);
          hubEventBridge.startBulkSnapshotFlush(() => binanceFuturesHub.getUniverseRows(), 10_000);
          console.log(`[Worker ${WORKER_ID}] LOCAL hub mode — running WS connections`);
        } else {
          // EXTERNAL MODE: Hub runs as separate service (market-hub/)
          // All data comes from Redis. Periodically refresh cached universe for CoinUniverseEngine.
          const refreshCachedUniverse = async () => {
            try {
              const json = await hubEventBridge.getFuturesUniverse();
              if (json) {
                const parsed = JSON.parse(json);
                _cachedUniverseRows = parsed.rows ?? [];
              }
            } catch { /* best-effort */ }
          };
          setTimeout(() => {
            void refreshCachedUniverse();
            setInterval(() => void refreshCachedUniverse(), 15_000);
          }, 5_000);
          console.log(`[Worker ${WORKER_ID}] EXTERNAL hub mode — reading from Redis`);
        }

        // Singleton services (run regardless of hub mode)
        exchangeCore.start();
        privateStreamManager.start();
        void traderHubEngine.start();
        // tronMonitor.start(); // Disabled — moved to crypto-payment-engine (10.110.0.9:9100)
        adaptiveRR.start();
        optimizationScheduler.start();
        tickOrchestrator.start();

        // TradeIdeaTracker: resolve active ideas → feed into Optimizer P2
        tradeIdeaTracker.onResolve = (idea: any) => {
          if (!idea || idea.status !== "RESOLVED") return;
          const win = idea.result === "SUCCESS";
          const entryMid = (Number(idea.entry_low ?? 0) + Number(idea.entry_high ?? 0)) / 2 || Number(idea.entry_low ?? 0);
          const sl = idea.sl_levels?.[0]?.price ?? idea.sl_levels?.[0] ?? 0;
          const tp1 = idea.tp_levels?.[0]?.price ?? idea.tp_levels?.[0] ?? 0;
          const tp2 = idea.tp_levels?.[1]?.price ?? idea.tp_levels?.[1] ?? null;
          const exitPrice = Number(idea.hit_level_price ?? entryMid);
          // Derive regime from market_state fields
          const rawTrend = String(idea.market_state?.trend ?? "").toUpperCase();
          const rawVol = String(idea.market_state?.volatility ?? "").toUpperCase();
          const regime = rawTrend.includes("TREND") || rawTrend.includes("BULL") || rawTrend.includes("BEAR") ? "TREND"
            : rawTrend.includes("RANGE") || rawTrend.includes("NEUTRAL") || rawTrend.includes("SIDEWAYS") ? "RANGE"
            : rawTrend.includes("BREAK") || rawVol === "HIGH" ? "BREAKOUT"
            : "RANGE"; // default to RANGE instead of UNKNOWN
          console.log(`[OptimizerP2] Attributing ${idea.symbol} ${idea.direction} result=${idea.result} mode=${idea.scoring_mode} regime=${regime}`);
          tradeOutcomeAttributor.attributeTrade({
            id: idea.id ?? `${idea.symbol}_${Date.now()}`,
            symbol: idea.symbol ?? "",
            direction: idea.direction ?? "LONG",
            scoringMode: idea.scoring_mode ?? "FLOW",
            finalScore: Number(idea.confidence_pct ?? 50),
            entry: entryMid,
            sl: Number(sl),
            tp1: Number(tp1),
            tp2: tp2 != null ? Number(tp2) : null,
            exitPrice,
            win,
            regime,
            createdAt: idea.created_at ?? new Date().toISOString(),
            resolvedAt: idea.resolved_at ?? new Date().toISOString(),
            highPrice: exitPrice * (win ? 1.01 : 1),
            lowPrice: exitPrice * (win ? 1 : 0.99),
          }).catch((err: any) => console.error("[OptimizerP2] Attribution error:", err?.message));
          regimeParameterEngine.recordRegimeOutcome({
            regime,
            conditions: `${idea.scoring_mode ?? "FLOW"}+${regime}`,
            outcomeR: win ? 1.5 : -1,
            win,
          }).catch(() => {});
        };
        tradeIdeaTracker.start();
        console.log(`[Worker ${WORKER_ID}] TradeIdeaTracker started + linked to Optimizer P2/P4`);

        // Optimizer Evolution: P1-P10
        void modePerformanceTracker.loadFromRedis();
        void dynamicSlTpOptimizer.loadFromRedis();
        void regimeParameterEngine.loadFromRedis();
        void confidenceCalibrator.loadFromRedis();
        void selfThrottleEngine.loadFromRedis();
        void featureWeightTuner.loadFromRedis();
        setInterval(() => void modePerformanceTracker.saveDailySnapshot(), 3600_000);
        setInterval(() => void dynamicSlTpOptimizer.optimize(), 1800_000);
        setInterval(() => void regimeParameterEngine.autoAdjust(), 1800_000);
        setInterval(() => void confidenceCalibrator.calibrate(), 3600_000);
        setInterval(() => { selfThrottleEngine.evaluate(); }, 300_000); // every 5min
        setInterval(() => void featureWeightTuner.tune(), 3600_000);
        console.log(`[Worker ${WORKER_ID}] Optimizer P1-P10 started (all 10 modules active)`);

        // SystemScanner: start after 45s delay to let CoinUniverseEngine warm up
        setTimeout(() => {
          systemScanner.start();
          console.log(`[Worker ${WORKER_ID}] SystemScanner started`);
        }, 45_000);

        // AITradeIdeaEngine V2: starts with its own internal 90s delay
        aiTradeIdeaEngine.start();
        console.log(`[Worker ${WORKER_ID}] AITradeIdeaEngine V2 initialized`);

        // CoinUniverseEngine: refresh every 60s on Worker 0
        // In HUB_EXTERNAL mode, reads universe from Redis cache (redisBinanceHubStub)
        // In LOCAL mode, reads from live WS hub (binanceFuturesHub)
        const COIN_UNIVERSE_REFRESH_MS = 60_000;
        const COIN_UNIVERSE_INITIAL_DELAY_MS = HUB_EXTERNAL ? 20_000 : 30_000;
        setTimeout(() => {
          const doRefresh = async () => {
            try {
              // LOCAL mode: push universe to Redis for Workers 1-2
              if (!HUB_EXTERNAL) {
                const hubRows = binanceFuturesHub.getUniverseRows();
                if (hubRows.length > 0) {
                  hubEventBridge.storeFuturesUniverse(JSON.stringify({
                    ok: true, rows: hubRows, count: hubRows.length,
                  }));
                }
              }

              await coinUniverseEngine.refresh();
              await coinUniverseEngineV2.refresh().catch((err: any) =>
                console.error("[CoinUniverseV2] Refresh error:", err?.message ?? err),
              );
              // Feed V2 regime to P4 RegimeParameterEngine
              const v2snap = coinUniverseEngineV2.getSnapshot();
              if (v2snap.health) regimeParameterEngine.setCurrentRegime(v2snap.health.mode === "full" ? (v2snap.activeCoins[0]?.regime ?? "UNKNOWN") : "UNKNOWN");
              const snapshot = coinUniverseEngine.getSnapshot();
              if (snapshot.activeCoins.length > 0) {
                hubEventBridge.storeUniverseSnapshot(JSON.stringify({
                  ok: true,
                  round: snapshot.round,
                  refreshedAt: snapshot.refreshedAt,
                  activeCoins: snapshot.activeCoins,
                  cooldownCoins: snapshot.cooldownCoins,
                }));

                const allCoins = [...snapshot.activeCoins, ...snapshot.cooldownCoins];
                // Enrich: LOCAL mode uses live hub, EXTERNAL mode uses cached universe
                const hubSource = HUB_EXTERNAL ? redisBinanceHubStub : binanceFuturesHub;
                const enriched = allCoins.map((coin: Record<string, unknown>) => {
                  const hubRow = hubSource.getLiveRow(String(coin.symbol ?? ""));
                  return {
                    ...coin,
                    depthUsd: (hubRow as any)?.depthUsd ?? null,
                    imbalance: (hubRow as any)?.imbalance ?? null,
                  };
                });
                await writeFeatureCache(enriched as any);
                await markFeaturesRefreshed();
              }
            } catch (err: any) {
              console.error("[CoinUniverseEngine] Refresh error:", err?.message ?? err);
            }
          };
          void doRefresh();
          setInterval(() => void doRefresh(), COIN_UNIVERSE_REFRESH_MS);
          console.log(`[Worker ${WORKER_ID}] CoinUniverseEngine refresh started (every ${COIN_UNIVERSE_REFRESH_MS / 1000}s)`);
        }, COIN_UNIVERSE_INITIAL_DELAY_MS);

        console.log(`[Worker ${WORKER_ID}] PRIMARY — ${HUB_EXTERNAL ? "external hub" : "local hub + publisher"} (scanner in separate process)`);
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
