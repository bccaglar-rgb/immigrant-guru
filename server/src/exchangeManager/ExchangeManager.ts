import { decryptSecret, encryptSecret } from "../security/crypto.ts";
import { createHmac, createHash } from "node:crypto";
import type { ConnectionService } from "../services/connectionService.ts";
import { EXCHANGE_CAPABILITIES } from "./capabilities.ts";
import { issue } from "./errors.ts";
import { BinanceAdapter } from "./adapters/BinanceAdapter.ts";
import { BybitAdapter } from "./adapters/BybitAdapter.ts";
import { GateAdapter } from "./adapters/GateAdapter.ts";
import { MockAdapter } from "./adapters/MockAdapter.ts";
import { OkxAdapter } from "./adapters/OkxAdapter.ts";
import { buildTerminologyMap } from "./normalization/terminologyTranslator.ts";
import type {
  ConnectionStatusReport,
  ExchangeAdapterContext,
  ExchangeCredentials,
  NormalizedExchangeId,
  OnboardingOptions,
  StructuredIssue,
} from "./types.ts";
import type { ExchangeAdapter } from "./adapters/BaseAdapter.ts";

interface ConnectInput {
  exchangeId: string;
  credentials: ExchangeCredentials;
  options?: OnboardingOptions;
  accountName?: string;
}

const DISCOVERY_TTL_MS = 15 * 60 * 1000;

const normalizeExchangeId = (raw: string): NormalizedExchangeId | null => {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "binance") return "binance";
  if (v === "bybit") return "bybit";
  if (v === "okx") return "okx";
  if (v === "gate" || v === "gate.io" || v === "gateio") return "gate";
  if (v === "mock") return "mock";
  return null;
};

const statusFromIssues = (errors: StructuredIssue[], discoveryCount: number, validated: boolean): ConnectionStatusReport["overallStatus"] => {
  if (!validated) return "FAILED";
  if (!errors.length && discoveryCount > 0) return "READY";
  if (discoveryCount > 0) return "PARTIAL";
  // If credentials validated but discovery failed (e.g. testnet down), allow PARTIAL
  if (validated && errors.some((e) => e.code === "EXCHANGE_DOWN" && (e.retryable ?? false))) return "PARTIAL";
  return "FAILED";
};

export class ExchangeManager {
  private adapters: Record<NormalizedExchangeId, ExchangeAdapter>;
  private cache = new Map<string, { report: ConnectionStatusReport; expiresAt: number }>();
  private readonly connections: ConnectionService;
  private readonly encryptionKey: Buffer;

  constructor(connections: ConnectionService, encryptionKey: Buffer) {
    this.connections = connections;
    this.encryptionKey = encryptionKey;
    this.adapters = {
      binance: new BinanceAdapter(),
      bybit: new BybitAdapter(),
      okx: new OkxAdapter(),
      gate: new GateAdapter(),
      mock: new MockAdapter(),
    };
  }

  async connect(userId: string, input: ConnectInput): Promise<ConnectionStatusReport> {
    const exchangeId = normalizeExchangeId(input.exchangeId);
    if (!exchangeId) throw issue("INVALID_INPUT", `Unsupported exchangeId: ${input.exchangeId}`, false);
    const adapter = this.adapters[exchangeId];
    const options: OnboardingOptions = {
      marketType: input.options?.marketType ?? "both",
      environment: input.options?.environment ?? "mainnet",
      defaultLeverage: input.options?.defaultLeverage ?? 5,
      preferredMarginMode: input.options?.preferredMarginMode ?? "isolated",
      preferredPositionMode: input.options?.preferredPositionMode ?? "one-way",
    };
    const ctx: ExchangeAdapterContext = {
      credentials: input.credentials,
      options,
      userId,
    };

    const validation = await adapter.validateCredentials(input.credentials);
    const discovery = await adapter.discover(ctx);
    const autoSettings = await adapter.applyAutoSettings(ctx);

    const errors = [...validation.errors, ...discovery.errors, ...autoSettings.errors];
    const warnings = [...validation.warnings, ...discovery.warnings, ...autoSettings.warnings];
    const overallStatus = statusFromIssues(errors, discovery.marketsCount, validation.ok);

    const report: ConnectionStatusReport = {
      exchangeId,
      exchangeDisplayName: adapter.displayName,
      overallStatus,
      validated: validation.ok,
      discovery: {
        marketTypes: discovery.marketTypes,
        marketsCount: discovery.marketsCount,
        sampleSymbols: discovery.sampleSymbols,
        preferredSymbols: discovery.preferredSymbols,
        rateLimitNotes: discovery.rateLimitNotes,
      },
      normalization: {
        baseQuoteScheme: "BASE/QUOTE",
        terminology: buildTerminologyMap(exchangeId),
      },
      autoSettings: {
        applied: autoSettings.applied,
        notApplied: autoSettings.notApplied,
        manualInstructions: autoSettings.manualSteps,
      },
      warnings,
      errors,
      nextActions:
        overallStatus === "READY"
          ? ["Select this exchange in terminal source dropdown", "Start market data stream and verify latency"]
          : ["Review manual steps", "Check API permissions", "Re-test connection"],
      checkedAt: new Date().toISOString(),
    };

    await this.connections.upsertExchangeConnection({
      userId,
      exchangeId,
      exchangeDisplayName: adapter.displayName,
      accountName: input.accountName ?? input.credentials.subaccount ?? "Main",
      enabled: overallStatus !== "FAILED",
      environment: options.environment ?? "mainnet",
      credentialsEncrypted: {
        apiKey: encryptSecret(input.credentials.apiKey, this.encryptionKey),
        apiSecret: encryptSecret(input.credentials.apiSecret, this.encryptionKey),
        ...(input.credentials.passphrase
          ? { passphrase: encryptSecret(input.credentials.passphrase, this.encryptionKey) }
          : {}),
      },
      status: overallStatus,
      statusReport: report,
      discoveryCache: {
        marketTypes: discovery.marketTypes,
        symbolsIndex: discovery.symbolsIndex,
        sampleSymbols: discovery.sampleSymbols,
        preferredSymbols: discovery.preferredSymbols,
        checkedAt: report.checkedAt,
      },
    });

    this.cache.set(`${userId}:${exchangeId}`, { report, expiresAt: Date.now() + DISCOVERY_TTL_MS });
    return report;
  }

  async list(userId: string) {
    const rows = await this.connections.listExchangeConnections(userId);
    return rows.map((row) => ({
      id: row.id,
      exchangeId: row.exchangeId,
      exchangeDisplayName: row.exchangeDisplayName,
      status: row.status,
      enabled: row.enabled,
      marketTypes: row.discoveryCache.marketTypes,
      symbolsCount: Object.keys(row.discoveryCache.symbolsIndex).length,
      checkedAt: row.discoveryCache.checkedAt,
      environment: row.environment,
      accountName: row.accountName ?? "Main",
    }));
  }

  async getStatus(userId: string, exchangeIdRaw: string): Promise<ConnectionStatusReport | null> {
    const exchangeId = normalizeExchangeId(exchangeIdRaw);
    if (!exchangeId) return null;
    const cached = this.cache.get(`${userId}:${exchangeId}`);
    if (cached && cached.expiresAt > Date.now()) return cached.report;

    const row = await this.connections.getExchangeConnection(userId, exchangeId);
    if (!row) return null;

    const report = row.statusReport as ConnectionStatusReport;
    this.cache.set(`${userId}:${exchangeId}`, { report, expiresAt: Date.now() + DISCOVERY_TTL_MS });
    return report;
  }

  async getSymbols(userId: string, exchangeIdRaw: string, marketType: string | undefined) {
    const exchangeId = normalizeExchangeId(exchangeIdRaw);
    if (!exchangeId) throw issue("INVALID_INPUT", `Unsupported exchangeId: ${exchangeIdRaw}`, false);
    const row = await this.connections.getExchangeConnection(userId, exchangeId);
    if (!row) throw issue("INVALID_INPUT", "Exchange is not connected", false);

    const all = Object.values(row.discoveryCache.symbolsIndex) as Array<{ symbol: string; marketType: string }>;
    const type = marketType?.toLowerCase();
    const filtered = type ? all.filter((s) => s.marketType.toLowerCase() === type) : all;

    return {
      exchangeId,
      exchangeDisplayName: row.exchangeDisplayName,
      status: row.status,
      marketTypes: row.discoveryCache.marketTypes,
      symbols: filtered,
      symbolsCount: filtered.length,
      checkedAt: row.discoveryCache.checkedAt,
    };
  }

  async getCredentials(userId: string, exchangeIdRaw: string, accountName?: string): Promise<ExchangeCredentials | null> {
    const exchangeId = normalizeExchangeId(exchangeIdRaw);
    if (!exchangeId) return null;
    const row = await this.connections.getExchangeConnection(userId, exchangeId, accountName);
    if (!row) return null;
    return {
      apiKey: decryptSecret(row.credentialsEncrypted.apiKey, this.encryptionKey),
      apiSecret: decryptSecret(row.credentialsEncrypted.apiSecret, this.encryptionKey),
      passphrase: row.credentialsEncrypted.passphrase
        ? decryptSecret(row.credentialsEncrypted.passphrase, this.encryptionKey)
        : undefined,
    };
  }

  getCapabilities(exchangeIdRaw: string) {
    const exchangeId = normalizeExchangeId(exchangeIdRaw);
    if (!exchangeId) return null;
    return EXCHANGE_CAPABILITIES[exchangeId];
  }

  async getAccountSnapshot(userId: string, exchangeIdRaw: string, symbolRaw?: string, accountName?: string) {
    const exchangeId = normalizeExchangeId(exchangeIdRaw);
    if (!exchangeId) throw issue("INVALID_INPUT", `Unsupported exchangeId: ${exchangeIdRaw}`, false);
    const creds = await this.getCredentials(userId, exchangeId, accountName);
    if (!creds) {
      return this.emptyAccountSnapshot(exchangeId);
    }

    const symbol = String(symbolRaw ?? "").toUpperCase().replace("/", "");
    if (exchangeId === "binance") return this.fetchBinanceAccountSnapshot(creds, symbol || "BTCUSDT");
    if (exchangeId === "gate") return this.fetchGateAccountSnapshot(creds, symbol || "BTC_USDT");

    return this.emptyAccountSnapshot(exchangeId);
  }

  async removeConnection(userId: string, exchangeIdRaw: string, accountName?: string) {
    const exchangeId = normalizeExchangeId(exchangeIdRaw);
    if (!exchangeId) throw issue("INVALID_INPUT", `Unsupported exchangeId: ${exchangeIdRaw}`, false);
    await this.connections.deleteExchangeConnection(userId, exchangeId, accountName);
    this.cache.delete(`${userId}:${exchangeId}`);
  }

  private async fetchBinanceAccountSnapshot(creds: ExchangeCredentials, symbol: string) {
    const base = "https://fapi.binance.com";
    const makeSignedQuery = (params: Record<string, string | number | boolean>) => {
      const query = new URLSearchParams(
        Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
          acc[k] = String(v);
          return acc;
        }, {}),
      ).toString();
      const signature = createHmac("sha256", creds.apiSecret).update(query).digest("hex");
      return `${query}&signature=${signature}`;
    };
    const fetchSigned = async <T>(path: string, params: Record<string, string | number | boolean>) => {
      const qs = makeSignedQuery(params);
      const res = await fetch(`${base}${path}?${qs}`, {
        headers: { "X-MBX-APIKEY": creds.apiKey, accept: "application/json" },
      });
      if (!res.ok) throw issue("EXCHANGE_DOWN", `Binance account API HTTP ${res.status}`, true, { path, status: res.status });
      return (await res.json()) as T;
    };
    const ts = Date.now();
    const common = { timestamp: ts, recvWindow: 10000 };

    const [balancesRaw, positionsRaw, openOrdersRaw, orderHistoryRaw, tradeHistoryRaw, incomeRaw] =
      await Promise.all([
        fetchSigned<Array<{ asset: string; availableBalance: string; balance: string }>>("/fapi/v2/balance", common).catch(() => []),
        fetchSigned<
          Array<{
            symbol: string;
            positionAmt: string;
            entryPrice: string;
            markPrice: string;
            unRealizedProfit: string;
            liquidationPrice: string;
            leverage: string;
          }>
        >("/fapi/v2/positionRisk", common).catch(() => []),
        fetchSigned<
          Array<{
            orderId: number;
            symbol: string;
            side: "BUY" | "SELL";
            type: string;
            price: string;
            origQty: string;
            executedQty: string;
            time: number;
            status: string;
          }>
        >("/fapi/v1/openOrders", { ...common, symbol }).catch(() => []),
        fetchSigned<Array<Record<string, unknown>>>("/fapi/v1/allOrders", { ...common, symbol, limit: 50 }).catch(() => []),
        fetchSigned<Array<Record<string, unknown>>>("/fapi/v1/userTrades", { ...common, symbol, limit: 50 }).catch(() => []),
        fetchSigned<Array<Record<string, unknown>>>("/fapi/v1/income", { ...common, symbol, limit: 50 }).catch(() => []),
      ]);

    const balances = balancesRaw
      .map((b) => ({
        asset: b.asset,
        available: Number(b.availableBalance ?? 0),
        total: Number(b.balance ?? 0),
      }))
      .filter((b) => Number.isFinite(b.total) && b.total > 0);

    const positions = positionsRaw
      .map((p) => {
        const amt = Number(p.positionAmt ?? 0);
        if (!Number.isFinite(amt) || Math.abs(amt) <= 0) return null;
        return {
          id: `binance-pos-${p.symbol}`,
          symbol: String(p.symbol ?? ""),
          side: amt >= 0 ? "BUY" : "SELL",
          size: Math.abs(amt),
          entry: Number(p.entryPrice ?? 0),
          mark: Number(p.markPrice ?? 0),
          pnl: Number(p.unRealizedProfit ?? 0),
          liquidation: Number(p.liquidationPrice ?? 0),
          leverage: Number(p.leverage ?? 1),
        };
      })
      .filter(Boolean);

    const openOrders = openOrdersRaw.map((o) => {
      const price = Number(o.price ?? 0);
      const amount = Number(o.origQty ?? 0);
      const filled = Number(o.executedQty ?? 0);
      return {
        id: String(o.orderId),
        date: new Date(Number(o.time ?? Date.now())).toLocaleString(),
        pair: String(o.symbol ?? ""),
        type: (String(o.type ?? "LIMIT").toUpperCase().includes("MARKET") ? "Market" : "Limit") as "Limit" | "Market" | "Stop Limit",
        side: String(o.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
        price: Number.isFinite(price) ? price : 0,
        amount: Number.isFinite(amount) ? amount : 0,
        total: (Number.isFinite(price) ? price : 0) * (Number.isFinite(amount) ? amount : 0),
        filledPct: amount > 0 ? Math.min(100, Math.max(0, (filled / amount) * 100)) : 0,
      };
    });

    const orderHistory = orderHistoryRaw.map((row, idx) => ({
      id: `binance-oh-${idx}-${String(row.orderId ?? idx)}`,
      date: new Date(Number(row.time ?? Date.now())).toLocaleString(),
      pair: String(row.symbol ?? ""),
      type: String(row.type ?? "LIMIT"),
      side: String(row.side ?? "BUY"),
      price: Number(row.avgPrice ?? row.price ?? 0),
      amount: Number(row.origQty ?? 0),
      filled: Number(row.executedQty ?? 0),
      status: String(row.status ?? "UNKNOWN"),
    }));

    const tradeHistory = tradeHistoryRaw.map((row, idx) => ({
      id: `binance-th-${idx}-${String(row.id ?? idx)}`,
      date: new Date(Number(row.time ?? Date.now())).toLocaleString(),
      pair: String(row.symbol ?? ""),
      side: String(row.side ?? "BUY"),
      price: Number(row.price ?? 0),
      amount: Number(row.qty ?? 0),
      fee: Number(row.commission ?? 0),
      feeAsset: String(row.commissionAsset ?? ""),
      realizedPnl: Number(row.realizedPnl ?? 0),
    }));

    const transactionHistory = incomeRaw.map((row, idx) => ({
      id: `binance-inc-${idx}-${String(row.tranId ?? idx)}`,
      date: new Date(Number(row.time ?? Date.now())).toLocaleString(),
      type: String(row.incomeType ?? "INCOME"),
      amount: Number(row.income ?? 0),
      asset: String(row.asset ?? "USDT"),
      symbol: String(row.symbol ?? ""),
      info: String(row.info ?? ""),
    }));

    return {
      exchange: "Binance",
      source: "EXCHANGE",
      balances,
      positions,
      openOrders,
      orderHistory,
      tradeHistory,
      transactionHistory,
      positionHistory: [] as Array<Record<string, unknown>>,
      bots: [] as Array<Record<string, unknown>>,
      assets: balances,
      fetchedAt: new Date().toISOString(),
    };
  }

  private async fetchGateAccountSnapshot(creds: ExchangeCredentials, symbolInput: string) {
    const base = "https://api.gateio.ws";
    const apiPrefix = "/api/v4";
    const symbol = symbolInput.includes("_") ? symbolInput : symbolInput.replace("USDT", "_USDT");

    const signedFetch = async <T>(
      method: "GET" | "POST",
      path: string,
      query: Record<string, string | number> = {},
      body = "",
    ) => {
      const queryString = new URLSearchParams(
        Object.entries(query).reduce<Record<string, string>>((acc, [k, v]) => {
          acc[k] = String(v);
          return acc;
        }, {}),
      ).toString();
      const fullPath = `${apiPrefix}${path}${queryString ? `?${queryString}` : ""}`;
      const ts = `${Math.floor(Date.now() / 1000)}`;
      const bodyHash = createHash("sha512").update(body).digest("hex");
      const signPayload = `${method}\n${fullPath}\n${queryString}\n${bodyHash}\n${ts}`;
      const sign = createHmac("sha512", creds.apiSecret).update(signPayload).digest("hex");

      const res = await fetch(`${base}${fullPath}`, {
        method,
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          KEY: creds.apiKey,
          Timestamp: ts,
          SIGN: sign,
        },
        body: method === "POST" ? body : undefined,
      });
      if (!res.ok) throw issue("EXCHANGE_DOWN", `Gate.io account API HTTP ${res.status}`, true, { path, status: res.status });
      return (await res.json()) as T;
    };

    const [accountRaw, positionsRaw, openOrdersRaw, orderHistoryRaw, tradeHistoryRaw] = await Promise.all([
      signedFetch<Record<string, unknown>>("GET", "/futures/usdt/accounts").catch(() => ({})),
      signedFetch<Array<Record<string, unknown>>>("GET", "/futures/usdt/positions").catch(() => []),
      signedFetch<Array<Record<string, unknown>>>("GET", "/futures/usdt/orders", { contract: symbol, status: "open", limit: 50 }).catch(() => []),
      signedFetch<Array<Record<string, unknown>>>("GET", "/futures/usdt/orders", { contract: symbol, status: "finished", limit: 50 }).catch(() => []),
      signedFetch<Array<Record<string, unknown>>>("GET", "/futures/usdt/my_trades", { contract: symbol, limit: 50 }).catch(() => []),
    ]);

    const usdtBalance = Number(accountRaw.available ?? accountRaw.total ?? 0);
    const balances = Number.isFinite(usdtBalance)
      ? [{ asset: "USDT", available: usdtBalance, total: Number(accountRaw.total ?? usdtBalance) }]
      : [];

    const positions = positionsRaw
      .map((p, idx) => {
        const sizeRaw = Number(p.size ?? 0);
        if (!Number.isFinite(sizeRaw) || sizeRaw === 0) return null;
        const side = sizeRaw >= 0 ? "BUY" : "SELL";
        return {
          id: `gate-pos-${idx}-${String(p.contract ?? idx)}`,
          symbol: String(p.contract ?? "").replace("_", "/"),
          side,
          size: Math.abs(sizeRaw),
          entry: Number(p.entry_price ?? 0),
          mark: Number(p.mark_price ?? 0),
          pnl: Number(p.unrealised_pnl ?? p.pnl ?? 0),
          liquidation: Number(p.liq_price ?? 0),
          leverage: Number(p.leverage ?? 1),
        };
      })
      .filter(Boolean);

    const mapOrder = (row: Record<string, unknown>, idx: number) => {
      const price = Number(row.price ?? row.fill_price ?? 0);
      const amount = Math.abs(Number(row.size ?? 0));
      const left = Math.abs(Number(row.left ?? 0));
      const filled = Math.max(0, amount - left);
      return {
        id: `gate-order-${idx}-${String(row.id ?? idx)}`,
        date: new Date(Number(row.create_time_ms ?? row.create_time ?? Date.now()) * (String(row.create_time_ms ?? "").length > 10 ? 1 : 1000)).toLocaleString(),
        pair: String(row.contract ?? symbol).replace("_", "/"),
        type: (String(row.tif ?? "GTC").toUpperCase().includes("IOC") ? "Market" : "Limit") as "Limit" | "Market" | "Stop Limit",
        side: Number(row.size ?? 0) >= 0 ? "BUY" : "SELL",
        price: Number.isFinite(price) ? price : 0,
        amount: Number.isFinite(amount) ? amount : 0,
        total: (Number.isFinite(price) ? price : 0) * (Number.isFinite(amount) ? amount : 0),
        filledPct: amount > 0 ? (filled / amount) * 100 : 0,
      };
    };

    const openOrders = openOrdersRaw.map(mapOrder);
    const orderHistory = orderHistoryRaw.map((row, idx) => ({
      id: `gate-oh-${idx}-${String(row.id ?? idx)}`,
      date: new Date(Number(row.finish_time_ms ?? row.create_time ?? Date.now()) * (String(row.finish_time_ms ?? "").length > 10 ? 1 : 1000)).toLocaleString(),
      pair: String(row.contract ?? symbol).replace("_", "/"),
      type: String(row.tif ?? "GTC"),
      side: Number(row.size ?? 0) >= 0 ? "BUY" : "SELL",
      price: Number(row.price ?? row.fill_price ?? 0),
      amount: Math.abs(Number(row.size ?? 0)),
      filled: Math.abs(Number(row.size ?? 0)) - Math.abs(Number(row.left ?? 0)),
      status: String(row.status ?? "UNKNOWN"),
    }));
    const tradeHistory = tradeHistoryRaw.map((row, idx) => ({
      id: `gate-th-${idx}-${String(row.id ?? idx)}`,
      date: new Date(Number(row.create_time_ms ?? Date.now())).toLocaleString(),
      pair: String(row.contract ?? symbol).replace("_", "/"),
      side: String(row.side ?? (Number(row.size ?? 0) >= 0 ? "BUY" : "SELL")).toUpperCase(),
      price: Number(row.price ?? 0),
      amount: Math.abs(Number(row.size ?? row.amount ?? 0)),
      fee: Number(row.fee ?? 0),
      feeAsset: "USDT",
      realizedPnl: Number(row.pnl ?? 0),
    }));

    return {
      exchange: "Gate.io",
      source: "EXCHANGE",
      balances,
      positions,
      openOrders,
      orderHistory,
      tradeHistory,
      transactionHistory: [] as Array<Record<string, unknown>>,
      positionHistory: [] as Array<Record<string, unknown>>,
      bots: [] as Array<Record<string, unknown>>,
      assets: balances,
      fetchedAt: new Date().toISOString(),
    };
  }

  private emptyAccountSnapshot(exchangeId: string) {
    return {
      exchange: exchangeId,
      source: "EXCHANGE" as const,
      balances: [],
      positions: [],
      openOrders: [],
      orderHistory: [],
      tradeHistory: [],
      transactionHistory: [],
      positionHistory: [],
      bots: [],
      assets: [],
      fetchedAt: new Date().toISOString(),
    };
  }
}
