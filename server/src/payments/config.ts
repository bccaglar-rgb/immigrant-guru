export const PAYMENT_CONFIG = {
  chain: "TRON",
  token: "USDT_TRC20",
  // Mainnet TRON USDT contract (TRC20)
  usdtContractAddress: process.env.TRON_USDT_CONTRACT ?? "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj",
  confirmationsRequired: Number(process.env.TRON_CONFIRMATIONS_REQUIRED ?? 20),
  invoiceExpiryMinutes: Number(process.env.INVOICE_EXPIRY_MINUTES ?? 30),
  maxOverpayRatio: Number(process.env.MAX_OVERPAY_RATIO ?? 1.1),
  minPartialPaymentRatio: Number(process.env.MIN_PARTIAL_PAYMENT_RATIO ?? 0.1),
  tron: {
    mode: (process.env.TRON_MODE ?? "dev") as "dev" | "prod",
    eventApiUrl: process.env.TRON_EVENT_API_URL ?? "https://api.trongrid.io",
    fullNodeUrl: process.env.TRON_FULL_NODE_URL ?? "http://tron-fullnode:8090",
    solidityNodeUrl: process.env.TRON_SOLIDITY_NODE_URL ?? "http://tron-solidity-node:8091",
  },
  hd: {
    xpub: process.env.TRON_XPUB ?? "xpub-dev-placeholder",
    addressPrefix: "T",
  },
};

export const SYSTEM_ASSUMPTIONS = {
  addressStrategy: "per-invoice",
  finalityPolicy: `${PAYMENT_CONFIG.confirmationsRequired} confirmations`,
  strictTokenContractVerification: true,
};
