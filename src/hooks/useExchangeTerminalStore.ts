import { create } from "zustand";
import type {
  AccountMode,
  BalanceItem,
  ConnectionStatus,
  ExchangeConnectionInput,
  ExchangeName,
  OpenOrderItem,
  OrderHistoryItem,
  OrderbookLevel,
  PositionItem,
  TradeHistoryItem,
  TransactionHistoryItem,
  ExchangeTradeSignal,
  TickerItem,
  TradeTick,
} from "../types/exchange";

interface ExchangeTerminalState {
  selectedExchange: ExchangeName;
  selectedExchangeAccount: string | null;
  accountMode: AccountMode;
  connectionStatus: ConnectionStatus;
  connectionError?: string;
  selectedSymbol: string;
  tickers: TickerItem[];
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  trades: TradeTick[];
  balances: BalanceItem[];
  positions: PositionItem[];
  openOrders: OpenOrderItem[];
  orderHistory: OrderHistoryItem[];
  tradeHistory: TradeHistoryItem[];
  transactionHistory: TransactionHistoryItem[];
  positionHistory: Array<Record<string, unknown>>;
  assetsHistory: BalanceItem[];
  botsHistory: Array<Record<string, unknown>>;
  activeSignal: ExchangeTradeSignal | null;
  tradeIdeasClosed: boolean;
  tradeIdeasCloseReason?: string;
  orderbookStep: number;
  orderbookLimit: number;
  setSelectedExchange: (exchange: ExchangeName) => void;
  setSelectedExchangeAccount: (accountName: string | null) => void;
  setSelectedSymbol: (symbol: string) => void;
  setConnectionStatus: (status: ConnectionStatus, error?: string) => void;
  setAccountMode: (mode: AccountMode) => void;
  connectWithInput: (input: ExchangeConnectionInput) => void;
  disconnect: () => void;
  setMarketData: (payload: Partial<Pick<ExchangeTerminalState, "tickers" | "bids" | "asks" | "trades">>) => void;
  setAccountData: (payload: Partial<Pick<ExchangeTerminalState, "balances" | "positions" | "openOrders" | "orderHistory" | "tradeHistory" | "transactionHistory" | "positionHistory" | "assetsHistory" | "botsHistory">>) => void;
  setActiveSignal: (payload: ExchangeTradeSignal) => void;
  clearActiveSignal: () => void;
  setTradeIdeasClosed: (closed: boolean, reason?: string) => void;
  setOrderbookStep: (step: number) => void;
  setOrderbookLimit: (limit: number) => void;
  privateStreamStatus: "idle" | "subscribing" | "subscribed" | "error" | "disconnected";
  setPrivateStreamStatus: (status: ExchangeTerminalState["privateStreamStatus"]) => void;
  applyOrderUpdate: (event: Record<string, unknown>) => void;
  applyPositionUpdate: (event: Record<string, unknown>) => void;
  applyBalanceUpdate: (event: Record<string, unknown>) => void;
}

const seedTickers: TickerItem[] = [
  {
    symbol: "BTC/USDT",
    lastPrice: 63241.6,
    change24hPct: -3.7,
    volume24h: 245615426,
    quoteVolume24h: 15902756345.15,
    high24h: 66574.5,
    low24h: 62655,
    markPrice: 63221,
    indexPrice: 63242,
    fundingRate8h: -0.00034,
    fundingCountdownSec: 35 * 60 + 36,
    openInterestUsd: 5163731014.76,
  },
  { symbol: "ETH/USDT", lastPrice: 3314.2, change24hPct: -2.74, volume24h: 63210000, markPrice: 3312.8, indexPrice: 3313.5, fundingRate8h: -0.00024, openInterestUsd: 1234123456 },
  { symbol: "SOL/USDT", lastPrice: 141.22, change24hPct: -2.43, volume24h: 28130000, markPrice: 141.1, indexPrice: 141.3, fundingRate8h: -0.00011, openInterestUsd: 672123456 },
  { symbol: "XRP/USDT", lastPrice: 0.5331, change24hPct: -2.92, volume24h: 18780000, markPrice: 0.533, indexPrice: 0.5332, fundingRate8h: 0.00004, openInterestUsd: 411234567 },
  { symbol: "AAVE/USDT", lastPrice: 112.62, change24hPct: -1.5, volume24h: 14193027.47, markPrice: 112.58, indexPrice: 112.61, fundingRate8h: -0.00031, openInterestUsd: 183991245.2 },
];

const seedBids: OrderbookLevel[] = Array.from({ length: 20 }, (_, i) => ({
  price: Number((112.62 - i * 0.01).toFixed(2)),
  amount: Number((Math.random() * 50).toFixed(3)),
  total: Number((Math.random() * 9000).toFixed(2)),
}));

const seedAsks: OrderbookLevel[] = Array.from({ length: 20 }, (_, i) => ({
  price: Number((112.63 + i * 0.01).toFixed(2)),
  amount: Number((Math.random() * 50).toFixed(3)),
  total: Number((Math.random() * 9000).toFixed(2)),
}));

const seedTrades: TradeTick[] = Array.from({ length: 24 }, (_, i) => ({
  id: `t-${i}`,
  price: Number((112.55 + Math.random() * 0.2).toFixed(2)),
  amount: Number((Math.random() * 2).toFixed(3)),
  side: Math.random() > 0.5 ? "BUY" : "SELL",
  time: new Date(Date.now() - i * 1000).toLocaleTimeString(),
}));

const seedBalances: BalanceItem[] = [
  { asset: "USDT", available: 5924.11, total: 6100.22 },
  { asset: "AAVE", available: 0.0008, total: 0.052 },
];

const seedPositions: PositionItem[] = [
  {
    id: "p-1",
    symbol: "AAVE/USDT",
    side: "SELL",
    size: 12.5,
    entry: 114.22,
    mark: 112.62,
    pnl: 20,
    liquidation: 126.8,
    leverage: 5,
  },
];

const seedOrders: OpenOrderItem[] = [
  {
    id: "o-1",
    date: "2025-12-09 12:33:52",
    pair: "NEAR/USDT",
    type: "Limit",
    side: "SELL",
    price: 2,
    amount: 230.1,
    total: 460.2,
    filledPct: 0,
  },
];

// ── Symbol normalizer: venue-aware raw symbol → "BASE/QUOTE" ──
const QUOTE_SUFFIXES = ["USDT", "BUSD", "USDC", "USD_PERP", "USDM"] as const;
const normalizeSymbol = (raw: string): string => {
  if (!raw) return raw;
  if (raw.includes("/")) return raw;
  // Gate.io uses underscore: BTC_USDT
  if (raw.includes("_")) {
    const [base, quote] = raw.split("_");
    return `${base}/${quote}`;
  }
  // Binance etc: BTCUSDT, 1000PEPEUSDT, ETHUSDC
  for (const suffix of QUOTE_SUFFIXES) {
    if (raw.endsWith(suffix) && raw.length > suffix.length) {
      return `${raw.slice(0, -suffix.length)}/${suffix}`;
    }
  }
  return raw;
};

// ── Per-order event timestamp tracking (stale event protection) ──
const _orderEventTs = new Map<string, number>();
const _privateStreamDebug = { staleEventsDropped: 0, lastEventTs: 0, lastReconnectTs: 0 };
if (typeof window !== "undefined") (window as any).__privateStreamDebug = _privateStreamDebug;

export const useExchangeTerminalStore = create<ExchangeTerminalState>((set) => ({
  selectedExchange: "Binance",
  selectedExchangeAccount: null,
  accountMode: "Futures",
  connectionStatus: "DISCONNECTED",
  selectedSymbol: "AAVE/USDT",
  tickers: seedTickers,
  bids: seedBids,
  asks: seedAsks,
  trades: seedTrades,
  balances: seedBalances,
  positions: seedPositions,
  openOrders: seedOrders,
  orderHistory: [],
  tradeHistory: [],
  transactionHistory: [],
  positionHistory: [],
  assetsHistory: seedBalances,
  botsHistory: [],
  activeSignal: null,
  tradeIdeasClosed: false,
  orderbookStep: 0.1,
  orderbookLimit: 20,
  privateStreamStatus: "idle",
  setSelectedExchange: (exchange) => set({ selectedExchange: exchange }),
  setSelectedExchangeAccount: (accountName) => set({ selectedExchangeAccount: accountName }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
  setConnectionStatus: (status, error) => set({ connectionStatus: status, connectionError: error }),
  setAccountMode: (mode) =>
    set((state) => ({
      accountMode: mode,
      positions: mode === "Spot" ? [] : state.positions.length > 0 ? state.positions : seedPositions,
    })),
  connectWithInput: (input) =>
    set({
      selectedExchange: input.exchange,
      accountMode: input.accountMode,
      connectionStatus: "CONNECTED",
      connectionError: undefined,
    }),
  disconnect: () => set({ connectionStatus: "DISCONNECTED", connectionError: undefined }),
  setMarketData: (payload) =>
    set((state) => ({
      tickers: payload.tickers ?? state.tickers,
      bids: payload.bids ?? state.bids,
      asks: payload.asks ?? state.asks,
      trades: payload.trades ?? state.trades,
    })),
  setAccountData: (payload) =>
    set((state) => ({
      balances: payload.balances ?? state.balances,
      positions: payload.positions ?? state.positions,
      openOrders: payload.openOrders ?? state.openOrders,
      orderHistory: payload.orderHistory ?? state.orderHistory,
      tradeHistory: payload.tradeHistory ?? state.tradeHistory,
      transactionHistory: payload.transactionHistory ?? state.transactionHistory,
      positionHistory: payload.positionHistory ?? state.positionHistory,
      assetsHistory: payload.assetsHistory ?? state.assetsHistory,
      botsHistory: payload.botsHistory ?? state.botsHistory,
    })),
  setActiveSignal: (payload) => set({ activeSignal: payload, tradeIdeasClosed: false, tradeIdeasCloseReason: undefined }),
  clearActiveSignal: () => set({ activeSignal: null }),
  setTradeIdeasClosed: (closed, reason) => set({ tradeIdeasClosed: closed, tradeIdeasCloseReason: closed ? reason : undefined }),
  setOrderbookStep: (step) => set({ orderbookStep: Number.isFinite(step) && step > 0 ? step : 0.1 }),
  setOrderbookLimit: (limit) => set({ orderbookLimit: Math.max(10, Math.min(100, Math.round(limit))) }),
  setPrivateStreamStatus: (status) => set({ privateStreamStatus: status }),

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 8: Private stream granular updates
  //   Event ordering: per-order timestamp guard — stale events are dropped.
  //   Merge logic: existing order + event → final snapshot → route to
  //   openOrders or orderHistory based on terminal status.
  // ═══════════════════════════════════════════════════════════════════

  applyOrderUpdate: (event) =>
    set((state) => {
      const orderId = String(event.orderId ?? event.clientOrderId ?? "");
      if (!orderId) return state;

      // ── Stale event guard ──
      const eventTs = Number(event.timestamp ?? event.ts ?? Date.now());
      const prevTs = _orderEventTs.get(orderId) ?? 0;
      if (eventTs < prevTs) {
        _privateStreamDebug.staleEventsDropped++;
        return state;
      }
      _orderEventTs.set(orderId, eventTs);
      _privateStreamDebug.lastEventTs = eventTs;
      // Prevent unbounded growth — prune entries older than 10 minutes
      if (_orderEventTs.size > 500) {
        const cutoff = Date.now() - 10 * 60 * 1000;
        for (const [k, v] of _orderEventTs) {
          if (v < cutoff) _orderEventTs.delete(k);
        }
      }

      // ── Merge existing order with incoming event ──
      const existingOrder = state.openOrders.find((o) => o.id === orderId);
      const pair = normalizeSymbol(String(event.symbol ?? existingOrder?.pair ?? ""));
      const rawSide = String(event.side ?? existingOrder?.side ?? "BUY");
      const side = (rawSide === "BUY" || rawSide === "SELL" ? rawSide : "BUY") as "BUY" | "SELL";
      const rawType = String(event.orderType ?? existingOrder?.type ?? "Limit");
      const typeCap = (rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase()) as OpenOrderItem["type"];
      const price = Number(event.avgPrice ?? event.filledPrice ?? event.price ?? existingOrder?.price ?? 0);
      const origQty = Number(event.origQty ?? existingOrder?.amount ?? event.totalFilledQty ?? 0);
      const filledQty = Number(event.totalFilledQty ?? 0);
      const filledPct = origQty > 0 ? Math.round((filledQty / origQty) * 100) : 0;
      const dateStr = new Date(eventTs).toISOString().replace("T", " ").slice(0, 19);

      const finalOrder: OpenOrderItem = {
        id: orderId,
        date: existingOrder?.date ?? dateStr,
        pair,
        type: typeCap,
        side,
        price,
        amount: origQty,
        total: price * origQty,
        filledPct,
      };

      // ── Route based on final status ──
      const status = String(event.orderStatus ?? "");
      const terminalStatuses = ["FILLED", "CANCELED", "EXPIRED", "REJECTED"];

      if (terminalStatuses.includes(status)) {
        const historyEntry: OrderHistoryItem = {
          id: orderId,
          date: dateStr,
          pair: finalOrder.pair,
          type: finalOrder.type,
          side: finalOrder.side,
          price: finalOrder.price,
          amount: finalOrder.amount,
          filled: filledQty,
          status,
        };
        return {
          openOrders: state.openOrders.filter((o) => o.id !== orderId),
          orderHistory: [historyEntry, ...state.orderHistory.filter((h) => h.id !== orderId)].slice(0, 100),
        };
      }

      // NEW or PARTIALLY_FILLED → upsert into openOrders
      const idx = state.openOrders.findIndex((o) => o.id === orderId);
      if (idx >= 0) {
        const updated = [...state.openOrders];
        updated[idx] = finalOrder;
        return { openOrders: updated };
      }
      return { openOrders: [finalOrder, ...state.openOrders] };
    }),

  applyPositionUpdate: (event) =>
    set((state) => {
      const symbol = normalizeSymbol(String(event.symbol ?? ""));
      if (!symbol) return state;
      const rawSize = Number(event.size ?? event.positionAmt ?? 0);
      const size = Math.abs(rawSize);

      // Epsilon threshold — prevent ghost positions from floating point noise
      if (size < 1e-12) {
        return { positions: state.positions.filter((p) => p.symbol !== symbol) };
      }

      const rawSide = String(event.side ?? "BOTH");
      const side: "BUY" | "SELL" = rawSide === "SELL" || rawSide === "SHORT" || rawSize < 0 ? "SELL" : "BUY";
      const entryPrice = Number(event.entryPrice ?? 0);
      const existing = state.positions.findIndex((p) => p.symbol === symbol);
      const pos: PositionItem = {
        id: existing >= 0 ? state.positions[existing].id : `ws-${symbol}`,
        symbol,
        side,
        size,
        entry: entryPrice,
        mark: Number(event.markPrice ?? 0) || entryPrice,
        pnl: Number(event.unrealizedPnl ?? 0),
        liquidation: Number(event.liquidationPrice ?? 0),
        leverage: Number(event.leverage ?? state.positions[existing]?.leverage ?? 1),
      };
      if (existing >= 0) {
        const updated = [...state.positions];
        updated[existing] = pos;
        return { positions: updated };
      }
      return { positions: [pos, ...state.positions] };
    }),

  applyBalanceUpdate: (event) =>
    set((state) => {
      const asset = String(event.asset ?? "");
      if (!asset) return state;
      const walletBalance = Number(event.walletBalance ?? 0);
      // crossWalletBalance is "available for trading" in futures cross margin
      const crossWalletBalance = Number(event.crossWalletBalance ?? walletBalance);
      const existing = state.balances.findIndex((b) => b.asset === asset);
      const item: BalanceItem = { asset, available: crossWalletBalance, total: walletBalance };
      if (existing >= 0) {
        const updated = [...state.balances];
        updated[existing] = item;
        return { balances: updated };
      }
      return { balances: [...state.balances, item] };
    }),
}));
