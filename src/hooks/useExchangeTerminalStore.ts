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
}));
