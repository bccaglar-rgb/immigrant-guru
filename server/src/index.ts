import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
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
import { createGateway } from "./ws/gateway.ts";
import { PaymentStore } from "./payments/storage.ts";
import { AuthService } from "./payments/authService.ts";
import { PaymentService } from "./payments/paymentService.ts";
import { TronClient } from "./payments/tronClient.ts";
import { TronMonitorService } from "./payments/monitorService.ts";
import { TokenCreatorService } from "./payments/tokenCreatorService.ts";

const app = express();
app.use(express.json());
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "exchange-backend" });
});

const audit = new AuditLogService();
const connections = new ConnectionService();
const encryptionKey = randomBytes(32);
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
const binanceFuturesHub = new BinanceFuturesHub();
const exchangeMarketHub = new ExchangeMarketHub();
const exchangeCore = new ExchangeCoreService(connections);
const traderHubStore = new TraderHubStore();
const traderHubEngine = new TraderHubEngine(traderHubStore, exchangeMarketHub, { exchangeCore });

// bootstrap admin user (dev)
if (!process.env.DISABLE_DEV_ADMIN) {
  try {
    authService.signup(process.env.ADMIN_EMAIL ?? "admin@bitrium.local", process.env.ADMIN_PASSWORD ?? "Admin12345!", "ADMIN");
  } catch {
    // already exists
  }
}

registerConnectionRoutes(app, connections, encryptionKey);
registerExchangeRoutes(app, exchangeManager);
registerTradeRoutes(app, audit, connections);
registerMarketRoutes(app, { providerStore: adminProviderStore, binanceFuturesHub, exchangeMarketHub });
registerAuthRoutes(app, authService);
registerUserSettingsRoutes(app);
registerTradeIdeasRoutes(app, tradeIdeaStore);
registerAdminProviderRoutes(app, adminProviderStore);
registerAiTradeIdeasRoutes(app, aiProviderStore, { binanceFuturesHub });
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
createGateway(server);

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8090);

server.listen(port, host, () => {
  binanceFuturesHub.start();
  exchangeMarketHub.start();
  exchangeCore.start();
  traderHubEngine.start();
  tronMonitor.start();
  tradeIdeaTracker.start();
  // eslint-disable-next-line no-console
  console.log(`Exchange terminal backend on http://${host}:${port}`);
});
