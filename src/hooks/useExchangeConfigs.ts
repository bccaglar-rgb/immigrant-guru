import { useEffect, useMemo, useState } from "react";
import { getExchangeBranding } from "../data/branding";
import type { ExchangeConfig } from "../types";

const EXCHANGES_KEY = "admin-exchanges-v1";
const EXCHANGE_MANAGER_CONNECTIONS_KEY = "exchange-manager-connections-v1";
export const EXCHANGE_ACCOUNTS_KEY = "exchange-accounts-v1";
export const EXCHANGE_SELECTION_KEY = "exchangeTerminal.selectedExchangeId";
export const BITRIUM_LABS_EXCHANGE = "Bitrium Labs";

type ManagerStatus = "READY" | "PARTIAL" | "FAILED";
interface ManagerConnection {
  id?: string;
  exchangeId: string;
  exchangeDisplayName: string;
  accountName?: string;
  status: ManagerStatus;
  enabled: boolean;
  marketTypes?: string[];
  symbolsCount?: number;
  checkedAt?: string;
}

export interface ExchangeAccountOption {
  id: string;
  connectionId?: string;
  exchangeId: string;
  exchangeDisplayName: string;
  accountName: string;
  status: ManagerStatus;
  enabled: boolean;
  iconUrl: string;
  shortCode: string;
  label: string;
}

const readConfiguredExchanges = (): ExchangeConfig[] => {
  try {
    const raw = window.localStorage.getItem(EXCHANGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExchangeConfig[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.name === "string");
  } catch {
    return [];
  }
};

const parseManagerRows = (raw: string | null): ManagerConnection[] => {
  try {
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ManagerConnection[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.exchangeDisplayName === "string" &&
        typeof item.exchangeId === "string",
    );
  } catch {
    return [];
  }
};

const readManagerConnections = (): ManagerConnection[] =>
  parseManagerRows(window.localStorage.getItem(EXCHANGE_MANAGER_CONNECTIONS_KEY));

const readExchangeAccounts = (): ManagerConnection[] =>
  parseManagerRows(window.localStorage.getItem(EXCHANGE_ACCOUNTS_KEY));

const USER_ID = "demo-user";

export const writeExchangeAccounts = (rows: ManagerConnection[]) => {
  try {
    window.localStorage.setItem(EXCHANGE_ACCOUNTS_KEY, JSON.stringify(rows));
    window.dispatchEvent(new Event("exchange-manager-updated"));
  } catch {
    // noop
  }
};

export const useExchangeConfigs = () => {
  const [exchanges, setExchanges] = useState<ExchangeConfig[]>(() => readConfiguredExchanges());
  const [managerConnections, setManagerConnections] = useState<ManagerConnection[]>(() => readManagerConnections());
  const [accountRows, setAccountRows] = useState<ManagerConnection[]>(() => readExchangeAccounts());

  useEffect(() => {
    let mounted = true;
    const syncFromBackend = async () => {
      try {
        const res = await fetch("/api/exchanges", {
          headers: { "x-user-id": USER_ID },
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          exchanges?: Array<{
            exchangeId?: string;
            exchangeDisplayName?: string;
            accountName?: string;
            status?: ManagerStatus;
            enabled?: boolean;
            marketTypes?: string[];
            symbolsCount?: number;
            checkedAt?: string;
          }>;
        };
        const rows: ManagerConnection[] = (body.exchanges ?? [])
          .filter((row) => row && typeof row.exchangeId === "string" && typeof row.exchangeDisplayName === "string")
          .map((row) => ({
            id: typeof (row as { id?: unknown }).id === "string" ? String((row as { id?: string }).id) : undefined,
            exchangeId: String(row.exchangeId),
            exchangeDisplayName: String(row.exchangeDisplayName),
            accountName: String(row.accountName ?? "Main"),
            status: row.status === "READY" || row.status === "FAILED" ? row.status : "PARTIAL",
            enabled: Boolean(row.enabled),
            marketTypes: Array.isArray(row.marketTypes) ? row.marketTypes : [],
            symbolsCount: Number.isFinite(Number(row.symbolsCount)) ? Number(row.symbolsCount) : undefined,
            checkedAt: row.checkedAt,
          }));
        if (!mounted) return;
        setManagerConnections(rows);
        setAccountRows(rows);
        try {
          window.localStorage.setItem(EXCHANGE_MANAGER_CONNECTIONS_KEY, JSON.stringify(rows));
          window.localStorage.setItem(EXCHANGE_ACCOUNTS_KEY, JSON.stringify(rows));
        } catch {
          // noop
        }
      } catch {
        // keep local rows on temporary backend failures
      }
    };

    const sync = () => {
      setExchanges(readConfiguredExchanges());
      setManagerConnections(readManagerConnections());
      setAccountRows(readExchangeAccounts());
      void syncFromBackend();
    };
    void syncFromBackend();
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    window.addEventListener("admin-config-updated", sync);
    window.addEventListener("exchange-manager-updated", sync);
    return () => {
      mounted = false;
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("admin-config-updated", sync);
      window.removeEventListener("exchange-manager-updated", sync);
    };
  }, []);

  const registeredAccounts = useMemo<ExchangeAccountOption[]>(() => {
    const baseRows = accountRows.length ? accountRows : managerConnections;
    const mapped = baseRows
      .map((row) => {
        const branding = getExchangeBranding(row.exchangeId || row.exchangeDisplayName);
        const accountName = row.accountName?.trim() || "Main";
        return {
          id: `${row.exchangeId}::${accountName}`,
          connectionId: row.id,
          exchangeId: row.exchangeId,
          exchangeDisplayName: row.exchangeDisplayName,
          accountName,
          status: row.status,
          enabled: row.enabled,
          iconUrl: branding.iconUrl,
          shortCode: branding.shortCode,
          label: `${row.exchangeDisplayName} · ${accountName}`,
        };
      });

    const dedup = new Map<string, ExchangeAccountOption>();
    mapped.forEach((item) => {
      dedup.set(item.id, item);
    });

    return [...dedup.values()];
  }, [accountRows, managerConnections, exchanges]);

  const enabledAccounts = useMemo(
    () => registeredAccounts.filter((row) => row.enabled && (row.status === "READY" || row.status === "PARTIAL")),
    [registeredAccounts],
  );

  const enabledExchanges = useMemo(
    () =>
      [...new Set(enabledAccounts.map((item) => item.exchangeDisplayName))].filter(Boolean),
    [enabledAccounts],
  );

  return {
    enabledExchanges,
    enabledAccounts,
    registeredAccounts,
    hasConfigured: registeredAccounts.length > 0,
    hasEnabledAccounts: enabledAccounts.length > 0,
    managerConnections,
  };
};

export const readStoredTerminalExchange = () => {
  try {
    return window.localStorage.getItem(EXCHANGE_SELECTION_KEY);
  } catch {
    return null;
  }
};

export const persistTerminalExchange = (exchangeSelection: string) => {
  try {
    window.localStorage.setItem(EXCHANGE_SELECTION_KEY, exchangeSelection);
  } catch {
    // noop
  }
};
