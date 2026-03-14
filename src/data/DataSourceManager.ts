import { create } from "zustand";
import type { ExchangeName } from "../types/exchange";

export type ExchangeSourceId = "BINANCE" | "BYBIT" | "OKX" | "GATEIO";
export type SourceId = ExchangeSourceId | "FALLBACK_API";
export type SelectedExchangeId = "AUTO" | ExchangeSourceId;
export type SelectedAccountType = "SPOT" | "FUTURES" | "BOTH";
export type SourceStatus = "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "ERROR";
export type SourcePolicy = "FORCE_SELECTED" | "AUTO_BEST";

export interface SourceHealth {
  sourceId: SourceId;
  status: SourceStatus;
  lastMessageAt: number;
  latencyMs: number;
  stale: boolean;
  reason?: string;
}

interface ConnectionSnapshot {
  exchange: ExchangeSourceId;
  status: SourceStatus;
}

interface DataSourceState {
  selectedExchangeId: SelectedExchangeId;
  selectedAccountType: SelectedAccountType;
  sourcePolicy: SourcePolicy;
  activeSource: SourceId;
  fallbackActive: boolean;
  bannerMessage: string | null;
  sourceChip: string;
  health: Record<SourceId, SourceHealth>;
  switchLog: Array<{ ts: number; from: SourceId; to: SourceId; reason: string }>;
  setSelectedExchangeId: (next: SelectedExchangeId) => void;
  setSelectedAccountType: (next: SelectedAccountType) => void;
  setHealth: (sourceId: SourceId, patch: Partial<SourceHealth>) => void;
  markPacket: (sourceId: SourceId, latencyMs: number) => void;
  markError: (sourceId: SourceId, reason: string) => void;
  evaluateActiveSource: (input: {
    connection: ConnectionSnapshot;
    now?: number;
    staleThresholdMs?: number;
  }) => SourceId;
}

const STORAGE_KEY = "market-data-selected-exchange-v1";
const ACCOUNT_STORAGE_KEY = "market-data-selected-account-v1";

const now = () => Date.now();

const emptyHealth = (sourceId: SourceId): SourceHealth => ({
  sourceId,
  status: "DISCONNECTED",
  lastMessageAt: 0,
  latencyMs: 0,
  stale: true,
});

const sourceFromExchange = (exchange: ExchangeName | ExchangeSourceId): ExchangeSourceId => {
  const raw = String(exchange ?? "").trim().toUpperCase();
  if (raw === "BYBIT") return "BYBIT";
  if (raw === "OKX") return "OKX";
  if (raw === "GATEIO" || raw === "GATE.IO" || raw === "GATE") return "GATEIO";
  return "BINANCE";
};

const readStoredExchange = (): SelectedExchangeId => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "AUTO" || raw === "BINANCE" || raw === "BYBIT" || raw === "OKX" || raw === "GATEIO") return raw;
  } catch {
    // noop
  }
  return "AUTO";
};

const readStoredAccountType = (): SelectedAccountType => {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (raw === "SPOT" || raw === "FUTURES" || raw === "BOTH") return raw;
  } catch {
    // noop
  }
  return "FUTURES";
};

const persistSelection = (selectedExchangeId: SelectedExchangeId) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, selectedExchangeId);
  } catch {
    // noop
  }
};

const persistAccountType = (selectedAccountType: SelectedAccountType) => {
  try {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, selectedAccountType);
  } catch {
    // noop
  }
};

const pickAutoBest = (health: Record<SourceId, SourceHealth>, connection: ConnectionSnapshot): SourceId => {
  const connectedExchange = sourceFromExchange(connection.exchange);
  const exchangeHealth = health[connectedExchange];
  if (connection.status === "CONNECTED" && !exchangeHealth.stale && exchangeHealth.status !== "ERROR") {
    return connectedExchange;
  }
  return "FALLBACK_API";
};

export const useDataSourceManager = create<DataSourceState>((set, get) => ({
  selectedExchangeId: readStoredExchange(),
  selectedAccountType: readStoredAccountType(),
  sourcePolicy: readStoredExchange() === "AUTO" ? "AUTO_BEST" : "FORCE_SELECTED",
  activeSource: "FALLBACK_API",
  fallbackActive: true,
  bannerMessage: "Selected exchange not connected or data stale. Using fallback API.",
  sourceChip: "Source: FALLBACK API",
  health: {
    BINANCE: emptyHealth("BINANCE"),
    BYBIT: emptyHealth("BYBIT"),
    OKX: emptyHealth("OKX"),
    GATEIO: emptyHealth("GATEIO"),
    FALLBACK_API: {
      ...emptyHealth("FALLBACK_API"),
      status: "CONNECTING",
      stale: false,
    },
  },
  switchLog: [],
  setSelectedExchangeId: (next) => {
    persistSelection(next);
    set((state) => ({
      selectedExchangeId: next,
      sourcePolicy: next === "AUTO" ? "AUTO_BEST" : "FORCE_SELECTED",
      bannerMessage:
        state.activeSource === "FALLBACK_API" && next !== "AUTO"
          ? "Selected exchange not connected or data stale. Using fallback API."
          : state.bannerMessage,
    }));
  },
  setSelectedAccountType: (next) => {
    persistAccountType(next);
    set({ selectedAccountType: next });
  },
  setHealth: (sourceId, patch) =>
    set((state) => ({
      health: {
        ...state.health,
        [sourceId]: {
          ...state.health[sourceId],
          ...patch,
        },
      },
    })),
  markPacket: (sourceId, latencyMs) =>
    set((state) => ({
      health: {
        ...state.health,
        [sourceId]: {
          ...state.health[sourceId],
          status: "CONNECTED",
          latencyMs,
          lastMessageAt: now(),
          stale: false,
          reason: undefined,
        },
      },
    })),
  markError: (sourceId, reason) =>
    set((state) => ({
      health: {
        ...state.health,
        [sourceId]: {
          ...state.health[sourceId],
          status: "ERROR",
          stale: true,
          reason,
        },
      },
    })),
  evaluateActiveSource: ({ connection, now: ts = now(), staleThresholdMs = 2000 }) => {
    const state = get();
    const health = { ...state.health };
    (Object.keys(health) as SourceId[]).forEach((sourceId) => {
      const last = health[sourceId].lastMessageAt;
      const stale = !last || ts - last > staleThresholdMs;
      if (stale !== health[sourceId].stale) {
        health[sourceId] = { ...health[sourceId], stale };
      }
    });

    const forced = state.selectedExchangeId !== "AUTO";
    const forcedExchange = forced ? state.selectedExchangeId : null;
    const nextActive: SourceId = forced
      ? (() => {
          const forcedHealth = health[forcedExchange as ExchangeSourceId];
          const connectedAndHealthy =
            connection.exchange === forcedExchange &&
            connection.status === "CONNECTED" &&
            forcedHealth.status !== "ERROR" &&
            !forcedHealth.stale;
          return connectedAndHealthy ? (forcedExchange as ExchangeSourceId) : "FALLBACK_API";
        })()
      : pickAutoBest(health, connection);

    const prev = state.activeSource;
    const switched = prev !== nextActive;
    const fallbackActive = nextActive === "FALLBACK_API";
    const bannerMessage = fallbackActive
      ? forced
        ? "Selected exchange not connected or data stale. Using fallback API."
        : "No healthy exchange stream. Using fallback API."
      : null;

    set((curr) => ({
      health,
      activeSource: nextActive,
      fallbackActive,
      bannerMessage,
      sourceChip: `Source: ${nextActive === "FALLBACK_API" ? "FALLBACK API" : nextActive}`,
      switchLog: switched
        ? [...curr.switchLog.slice(-49), { ts, from: prev, to: nextActive, reason: bannerMessage ?? "source switched" }]
        : curr.switchLog,
    }));
    return nextActive;
  },
}));

export const normalizeExchangeSource = sourceFromExchange;
