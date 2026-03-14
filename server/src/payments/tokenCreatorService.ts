import { randomBytes } from "node:crypto";
import { PaymentStore } from "./storage.ts";
import { PaymentService } from "./paymentService.ts";
import type { TokenCreatorFeeConfig, TokenCreatorOrderRecord, UserRecord } from "./types.ts";

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;

export interface TokenCreatorDraftInput {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: number;
  totalSupply: number;
  supplyType: "fixed" | "capped" | "unlimited";
  accessType: "none" | "ownable" | "role_based";
  transferType: "unstoppable" | "pausable";
  burnable: boolean;
  mintable: boolean;
  verifiedSource: boolean;
  erc1363: boolean;
  recoverable: boolean;
}

export class TokenCreatorService {
  private readonly store: PaymentStore;
  private readonly payments: PaymentService;

  constructor(store: PaymentStore, payments: PaymentService) {
    this.store = store;
    this.payments = payments;
  }

  getFeeConfig(): TokenCreatorFeeConfig {
    return this.store.tokenCreatorFeeConfig;
  }

  updateFeeConfig(input: Partial<TokenCreatorFeeConfig>): TokenCreatorFeeConfig {
    const prev = this.store.tokenCreatorFeeConfig;
    const next: TokenCreatorFeeConfig = {
      ...prev,
      ...input,
      supplyTierPrices: { ...prev.supplyTierPrices, ...(input.supplyTierPrices ?? {}) },
      accessTierPrices: { ...prev.accessTierPrices, ...(input.accessTierPrices ?? {}) },
      transferTypePrices: { ...prev.transferTypePrices, ...(input.transferTypePrices ?? {}) },
      featurePrices: { ...prev.featurePrices, ...(input.featurePrices ?? {}) },
      updatedAt: nowIso(),
    };
    this.store.tokenCreatorFeeConfig = next;
    return next;
  }

  calculateQuote(input: TokenCreatorDraftInput) {
    const cfg = this.store.tokenCreatorFeeConfig;
    const breakdown: Array<{ label: string; amountUsdt: number }> = [];

    const push = (label: string, amountUsdt: number) => {
      if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) return;
      breakdown.push({ label, amountUsdt: Number(amountUsdt.toFixed(2)) });
    };

    push("Base deployment", cfg.baseFeeUsdt);
    push(`Supply type (${input.supplyType})`, cfg.supplyTierPrices[input.supplyType] ?? 0);
    push(`Access type (${input.accessType})`, cfg.accessTierPrices[input.accessType] ?? 0);
    push(`Transfer (${input.transferType})`, cfg.transferTypePrices[input.transferType] ?? 0);
    if (input.decimals !== 18) push("Custom decimals", cfg.decimalsSurchargeUsdt);
    if (input.burnable) push("Burnable", cfg.featurePrices.burnable);
    if (input.mintable) push("Mintable", cfg.featurePrices.mintable);
    if (input.verifiedSource) push("Verified source", cfg.featurePrices.verifiedSource);
    if (input.erc1363) push("ERC1363", cfg.featurePrices.erc1363);
    if (input.recoverable) push("Token recover", cfg.featurePrices.recoverable);

    const subtotalUsdt = Number(breakdown.reduce((sum, row) => sum + row.amountUsdt, 0).toFixed(2));
    const networkReserveUsdt = Number(cfg.networkReserveUsdt.toFixed(2));
    const totalUsdt = Number((subtotalUsdt + networkReserveUsdt).toFixed(2));

    return { subtotalUsdt, networkReserveUsdt, totalUsdt, breakdown };
  }

  createOrder(user: UserRecord, input: TokenCreatorDraftInput) {
    if (!input.name.trim()) throw new Error("token_name_required");
    if (!input.symbol.trim()) throw new Error("token_symbol_required");
    const quote = this.calculateQuote(input);
    const now = nowIso();
    const orderId = makeId("tko");

    const order: TokenCreatorOrderRecord = {
      id: orderId,
      userId: user.id,
      status: "created",
      token: {
        name: input.name.trim(),
        symbol: input.symbol.trim().toUpperCase(),
        decimals: Number(input.decimals),
        initialSupply: Number(input.initialSupply),
        totalSupply: Number(input.totalSupply),
      },
      settings: {
        supplyType: input.supplyType,
        accessType: input.accessType,
        transferType: input.transferType,
        burnable: input.burnable,
        mintable: input.mintable,
        verifiedSource: input.verifiedSource,
        erc1363: input.erc1363,
        recoverable: input.recoverable,
      },
      pricing: quote,
      createdAt: now,
      updatedAt: now,
    };

    this.store.tokenCreatorOrders.set(order.id, order);
    const invoice = this.payments.createTokenCreatorInvoice({
      user,
      orderId: order.id,
      amountUsdt: quote.totalUsdt,
      tokenSymbol: order.token.symbol,
    });

    order.invoiceId = invoice.id;
    order.status = "awaiting_payment";
    order.updatedAt = nowIso();
    this.store.tokenCreatorOrders.set(order.id, order);

    return { order, invoice, quote };
  }

  listOrders(userId?: string) {
    const rows = [...this.store.tokenCreatorOrders.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return userId ? rows.filter((o) => o.userId === userId) : rows;
  }
}

