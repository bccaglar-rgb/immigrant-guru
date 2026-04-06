/**
 * Crypto Payment Engine — Configuration
 */
try { process.loadEnvFile(); } catch { /* .env optional */ }

export const ENGINE_CONFIG = {
  port: Number(process.env.ENGINE_PORT ?? 9100),
  host: process.env.ENGINE_HOST ?? "127.0.0.1",

  // Database (separate from main platform)
  db: {
    host: process.env.ENGINE_DB_HOST ?? process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.ENGINE_DB_PORT ?? process.env.DB_PORT ?? 5432),
    name: process.env.ENGINE_DB_NAME ?? "bitrium_payments",
    user: process.env.ENGINE_DB_USER ?? process.env.DB_USER ?? "bitrium",
    password: process.env.ENGINE_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
  },

  // TRON blockchain
  tron: {
    usdtContract: process.env.TRON_USDT_CONTRACT ?? "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj",
    eventApiUrl: process.env.TRON_EVENT_API_URL ?? "https://api.trongrid.io",
    confirmationsRequired: Number(process.env.TRON_CONFIRMATIONS_REQUIRED ?? 20),
    monitorIntervalMs: Number(process.env.MONITOR_INTERVAL_MS ?? 8000),
  },

  // Invoice
  invoiceExpiryMinutes: Number(process.env.INVOICE_EXPIRY_MINUTES ?? 30),
  maxOverpayRatio: Number(process.env.MAX_OVERPAY_RATIO ?? 1.1),
  amountTolerancePercent: Number(process.env.AMOUNT_TOLERANCE_PERCENT ?? 1),

  // Wallet
  masterHotWallet: process.env.MASTER_HOT_WALLET ?? "",
  coldWallet: process.env.COLD_WALLET ?? "",
  hotWalletThresholdUsdt: Number(process.env.HOT_WALLET_THRESHOLD_USDT ?? 9),

  // Security — HMAC shared secret for internal API auth
  internalApiSecret: process.env.INTERNAL_API_SECRET ?? "dev-internal-secret",

  // Main platform callback URL
  mainPlatformCallbackUrl: process.env.MAIN_PLATFORM_CALLBACK_URL ?? "http://127.0.0.1:8090/internal/payment-events",

  // Encryption key for wallet private keys (set at import time)
  encryptionKey: Buffer.alloc(0), // initialized in boot()
};
