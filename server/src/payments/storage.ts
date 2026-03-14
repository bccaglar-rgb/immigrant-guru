import type {
  InvoiceRecord,
  PaymentEventRecord,
  PlanRecord,
  ReferralCodeRecord,
  SessionRecord,
  SubscriptionRecord,
  TokenCreatorFeeConfig,
  TokenCreatorOrderRecord,
  UserRecord,
} from "./types.ts";

const nowIso = () => new Date().toISOString();

export class PaymentStore {
  users = new Map<string, UserRecord>();
  sessions = new Map<string, SessionRecord>();
  referralCodes = new Map<string, ReferralCodeRecord>();
  plans = new Map<string, PlanRecord>();
  invoices = new Map<string, InvoiceRecord>();
  paymentEvents = new Map<string, PaymentEventRecord>();
  subscriptions = new Map<string, SubscriptionRecord>();
  tokenCreatorOrders = new Map<string, TokenCreatorOrderRecord>();
  processedEventKeys = new Set<string>();
  addressCursor = 0;
  tokenCreatorFeeConfig: TokenCreatorFeeConfig;

  constructor() {
    const now = nowIso();
    const defaults: PlanRecord[] = [
      {
        id: "plan-1m",
        name: "1 Aylık",
        priceUsdt: 89,
        durationDays: 30,
        features: ["Bitrium Quant Engine", "Unlimited Trade Ideas", "Exchanges", "Super Charts"],
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "plan-3m",
        name: "3 Aylık",
        priceUsdt: 207,
        durationDays: 90,
        features: ["Bitrium Quant Engine", "Unlimited Trade Ideas", "Exchanges", "Super Charts"],
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "plan-6m",
        name: "6 Aylık",
        priceUsdt: 354,
        durationDays: 180,
        features: ["Bitrium Quant Engine", "Unlimited Trade Ideas", "Exchanges", "Super Charts"],
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "plan-12m",
        name: "Yıllık",
        priceUsdt: 588,
        durationDays: 365,
        features: ["Bitrium Quant Engine", "Unlimited Trade Ideas", "Exchanges", "Super Charts"],
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    defaults.forEach((p) => this.plans.set(p.id, p));

    this.tokenCreatorFeeConfig = {
      baseFeeUsdt: 49,
      networkReserveUsdt: 12,
      decimalsSurchargeUsdt: 6,
      supplyTierPrices: {
        fixed: 0,
        capped: 12,
        unlimited: 18,
      },
      accessTierPrices: {
        none: 0,
        ownable: 7,
        role_based: 14,
      },
      transferTypePrices: {
        unstoppable: 0,
        pausable: 9,
      },
      featurePrices: {
        burnable: 8,
        mintable: 10,
        recoverable: 7,
        verifiedSource: 6,
        erc1363: 11,
      },
      updatedAt: now,
    };
  }
}
