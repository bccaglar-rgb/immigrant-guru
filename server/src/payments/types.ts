export type Role = "USER" | "ADMIN";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  twoFactorEnabled: boolean;
  twoFactorSecretEnc?: { iv: string; tag: string; payload: string };
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface ReferralCodeRecord {
  id: string;
  code: string;
  assignedUserId?: string;
  assignedEmail?: string;
  createdByUserId: string;
  maxUses: number;
  usedCount: number;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanRecord {
  id: string;
  name: string;
  priceUsdt: number;
  durationDays: number;
  features: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type InvoiceStatus = "created" | "awaiting_payment" | "detected" | "confirming" | "partially_paid" | "paid" | "expired" | "failed" | "underpaid" | "overpaid" | "manual_review";

export interface InvoiceRecord {
  id: string;
  userId: string;
  planId?: string;
  invoiceType: "PLAN" | "TOKEN_CREATOR";
  title: string;
  externalRef?: string;
  expectedAmountUsdt: number;
  paidAmountUsdt: number;
  depositAddress: string;
  addressIndex: number;
  status: InvoiceStatus;
  chain: "TRON";
  token: "USDT_TRC20";
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  paymentTxHash?: string;
}

export interface TokenCreatorFeeConfig {
  baseFeeUsdt: number;
  networkReserveUsdt: number;
  decimalsSurchargeUsdt: number;
  supplyTierPrices: Record<"fixed" | "capped" | "unlimited", number>;
  accessTierPrices: Record<"none" | "ownable" | "role_based", number>;
  transferTypePrices: Record<"unstoppable" | "pausable", number>;
  featurePrices: {
    burnable: number;
    mintable: number;
    recoverable: number;
    verifiedSource: number;
    erc1363: number;
  };
  updatedAt: string;
}

export interface TokenCreatorOrderRecord {
  id: string;
  userId: string;
  status: "created" | "awaiting_payment" | "paid" | "deploy_queued" | "deployed" | "failed";
  token: {
    name: string;
    symbol: string;
    decimals: number;
    initialSupply: number;
    totalSupply: number;
  };
  settings: {
    supplyType: "fixed" | "capped" | "unlimited";
    accessType: "none" | "ownable" | "role_based";
    transferType: "unstoppable" | "pausable";
    burnable: boolean;
    mintable: boolean;
    verifiedSource: boolean;
    erc1363: boolean;
    recoverable: boolean;
  };
  pricing: {
    subtotalUsdt: number;
    networkReserveUsdt: number;
    totalUsdt: number;
    breakdown: Array<{ label: string; amountUsdt: number }>;
  };
  invoiceId?: string;
  paymentTxHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentEventRecord {
  id: string;
  invoiceId: string;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  amountUsdt: number;
  contractAddress: string;
  confirmations: number;
  blockNumber: number;
  success: boolean;
  processedAt: string;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  planId: string;
  startAt: string;
  endAt: string;
  status: "active" | "expired" | "cancelled";
  paymentTxHash: string;
  paidAmountUsdt: number;
  paidAt: string;
  planSnapshot: {
    name: string;
    priceUsdt: number;
    durationDays: number;
    features: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface TronTransferEvent {
  txHash: string;
  from: string;
  to: string;
  amount: number;
  contractAddress: string;
  blockNumber: number;
  confirmations: number;
  success: boolean;
  timestamp: number;
  logIndex?: number;
}

export interface ConnectionStatusReport {
  overallStatus: "READY" | "PARTIAL" | "FAILED";
  warnings: string[];
  errors: Array<{ code: string; message: string }>;
  nextActions: string[];
}
