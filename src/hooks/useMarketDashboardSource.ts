import { create } from "zustand";

export type DashboardSourceMode = "BITRIUM_LABS" | "EXCHANGE";
export type DashboardSourceStatus = "GOOD" | "BAD" | "STALE" | "NO_CONNECTION";

interface DashboardSourceState {
  sourceMode: DashboardSourceMode;
  exchangeId?: string;
  warning?: string;
  status: DashboardSourceStatus;
  setSource: (mode: DashboardSourceMode, exchangeId?: string) => void;
  setWarning: (warning?: string) => void;
  setStatus: (status: DashboardSourceStatus) => void;
}

const STORAGE_KEY = "market_dashboard_source";
const USER_SELECTED_KEY = "market_dashboard_source_user_selected_v1";

const readInitial = (): { sourceMode: DashboardSourceMode; exchangeId?: string } => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sourceMode: "EXCHANGE", exchangeId: "BINANCE::PUBLIC" };
    if (raw === "BITRIUM_LABS") return { sourceMode: "EXCHANGE", exchangeId: "BINANCE::PUBLIC" };
    if (raw.startsWith("EXCHANGE:")) {
      const parsed = raw.slice("EXCHANGE:".length).toUpperCase();
      if (parsed.startsWith("BINANCE")) return { sourceMode: "EXCHANGE", exchangeId: "BINANCE::PUBLIC" };
      return { sourceMode: "EXCHANGE", exchangeId: "BINANCE::PUBLIC" };
    }
  } catch {
    // noop
  }
  return { sourceMode: "EXCHANGE", exchangeId: "BINANCE::PUBLIC" };
};

const persist = (mode: DashboardSourceMode, exchangeId?: string) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode === "BITRIUM_LABS" ? "BITRIUM_LABS" : `EXCHANGE:${exchangeId ?? ""}`);
    window.localStorage.setItem(USER_SELECTED_KEY, "1");
  } catch {
    // noop
  }
};

const init = readInitial();

export const useMarketDashboardSource = create<DashboardSourceState>((set) => ({
  sourceMode: init.sourceMode,
  exchangeId: init.exchangeId,
  warning: undefined,
  status: "NO_CONNECTION",
  setSource: (sourceMode, exchangeId) => {
    persist(sourceMode, exchangeId);
    set({
      sourceMode,
      exchangeId: sourceMode === "EXCHANGE" ? exchangeId : undefined,
      warning: undefined,
      status: "NO_CONNECTION",
    });
  },
  setWarning: (warning) => set({ warning }),
  setStatus: (status) => set({ status }),
}));
