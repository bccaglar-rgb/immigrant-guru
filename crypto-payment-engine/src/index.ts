/**
 * Crypto Payment Engine — Standalone TRON USDT payment service.
 * Runs as a separate service from the main Bitrium platform.
 */
try { process.loadEnvFile(); } catch { /* .env optional */ }

import express from "express";
import { ENGINE_CONFIG } from "./config.ts";
import { ensureConnection } from "./db/pool.ts";
import { WalletPoolService } from "./services/walletPoolService.ts";
import { InvoiceService } from "./services/invoiceService.ts";
import { WebhookService } from "./services/webhookService.ts";
import { TronClient } from "./services/tronClient.ts";
import { PaymentMatchingService } from "./services/paymentMatchingService.ts";
import { MonitorWorker } from "./workers/monitor.worker.ts";
import { SweepWorker } from "./workers/sweep.worker.ts";
import { TreasuryWorker } from "./workers/treasury.worker.ts";
import { ReconciliationWorker } from "./workers/reconciliation.worker.ts";
import { registerInvoiceRoutes } from "./api/invoicesController.ts";

const app = express();
app.use(express.json());

// Services
const walletPool = new WalletPoolService();
const invoiceService = new InvoiceService(walletPool);
const webhookService = new WebhookService();
const tronClient = new TronClient();
const paymentMatching = new PaymentMatchingService(invoiceService, walletPool, webhookService);
const monitorWorker = new MonitorWorker(tronClient, invoiceService, paymentMatching, walletPool);
const sweepWorker = new SweepWorker();
const treasuryWorker = new TreasuryWorker();
const reconciliationWorker = new ReconciliationWorker();

// Routes
registerInvoiceRoutes(app, invoiceService);

// Status endpoints
app.get("/internal/monitor/status", (_req, res) => {
  res.json({ ok: true, monitor: monitorWorker.getStatus() });
});
app.get("/internal/sweep/status", (_req, res) => {
  res.json({ ok: true, sweep: sweepWorker.getStatus() });
});
app.get("/internal/treasury/status", (_req, res) => {
  res.json({ ok: true, treasury: treasuryWorker.getStatus() });
});

// Boot
async function boot() {
  // Initialize encryption key
  const { createHash } = await import("node:crypto");
  const envKey = process.env.ENCRYPTION_KEY;
  ENGINE_CONFIG.encryptionKey = envKey
    ? Buffer.from(envKey, "hex")
    : createHash("sha256").update(process.env.ENGINE_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "dev-key").digest();

  await ensureConnection();

  const poolStatus = await walletPool.getPoolStatus();
  console.log("[PaymentEngine] Wallet pool:", poolStatus);

  // Start workers
  monitorWorker.start();
  sweepWorker.start();
  treasuryWorker.start();
  reconciliationWorker.start();

  app.listen(ENGINE_CONFIG.port, ENGINE_CONFIG.host, () => {
    console.log(`[PaymentEngine] Running on http://${ENGINE_CONFIG.host}:${ENGINE_CONFIG.port}`);
    console.log(`[PaymentEngine] TRON USDT contract: ${ENGINE_CONFIG.tron.usdtContract}`);
    console.log(`[PaymentEngine] Monitor interval: ${ENGINE_CONFIG.tron.monitorIntervalMs}ms`);
    console.log(`[PaymentEngine] Callback URL: ${ENGINE_CONFIG.mainPlatformCallbackUrl}`);
  });
}

boot().catch((err) => {
  console.error("[PaymentEngine] Boot failed:", err);
  process.exit(1);
});
