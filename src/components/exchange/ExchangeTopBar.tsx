import { useEffect, useMemo } from "react";
import { useDataSourceManager, type ExchangeSourceId } from "../../data/DataSourceManager";
import { useExchangeConfigs, persistTerminalExchange, readStoredTerminalExchange } from "../../hooks/useExchangeConfigs";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";
import type { ExchangeName } from "../../types/exchange";
import { getExchangeBranding } from "../../data/branding";

const mapExchangeToSource = (exchange: string): ExchangeSourceId | null => {
  const lower = exchange.toLowerCase();
  if (lower === "binance") return "BINANCE";
  if (lower === "bybit") return "BYBIT";
  if (lower === "okx") return "OKX";
  if (lower === "gate.io" || lower === "gateio" || lower === "gate") return "GATEIO";
  return null;
};

type SettingValue = number | string | boolean | string[];

interface ExchangeTopBarProps {
  onAddExchange?: () => void;
  indicatorsState?: IndicatorsState;
  indicatorsEnabledCount?: number;
  setMasterIndicators?: (enabled: boolean) => void;
  setIndicatorGroup?: (group: IndicatorGroupKey, enabled: boolean) => void;
  setIndicatorEnabled?: (indicator: IndicatorKey, enabled: boolean) => void;
  setIndicatorSetting?: (indicator: IndicatorKey, key: string, value: SettingValue) => void;
  resetIndicator?: (indicator: IndicatorKey) => void;
}

export const ExchangeTopBar = ({
  onAddExchange,
}: ExchangeTopBarProps) => {
  const {
    selectedExchange,
    accountMode,
    selectedExchangeAccount,
    setSelectedExchange,
    setSelectedExchangeAccount,
    setAccountMode,
    setConnectionStatus,
  } = useExchangeTerminalStore();
  const selectedExchangeId = useDataSourceManager((state) => state.selectedExchangeId);
  const setSelectedExchangeId = useDataSourceManager((state) => state.setSelectedExchangeId);
  const setSelectedAccountType = useDataSourceManager((state) => state.setSelectedAccountType);
  const { registeredAccounts } = useExchangeConfigs();

  // Show ALL connected accounts in the header (including FAILED / disabled ones)
  // so users can see every exchange they added. The health badge already renders
  // the correct status (OFF / ERROR) for non-ready accounts.
  const exchangeOptions = useMemo(
    () =>
      [...registeredAccounts]
        .filter((row) => row.accountName !== "__test__")
        .sort((a, b) => {
          const aName = String(a.exchangeDisplayName ?? "").toLowerCase();
          const bName = String(b.exchangeDisplayName ?? "").toLowerCase();
          const score = (name: string) => {
            if (name.includes("binance")) return 0;
            if (name.includes("gate")) return 1;
            return 2;
          };
          const priDiff = score(aName) - score(bName);
          if (priDiff !== 0) return priDiff;
          return aName.localeCompare(bName);
        }),
    [registeredAccounts],
  );

  const activeId = useMemo(() => {
    if (!selectedExchangeAccount) return null;
    return exchangeOptions.find(
      (o) => o.exchangeDisplayName === selectedExchange && o.accountName === selectedExchangeAccount,
    )?.id ?? null;
  }, [exchangeOptions, selectedExchange, selectedExchangeAccount]);

  useEffect(() => {
    if (!exchangeOptions.length) {
      setSelectedExchangeAccount(null);
      setConnectionStatus("DISCONNECTED");
      return;
    }
    const stored = readStoredTerminalExchange();
    const nextSelection =
      stored && exchangeOptions.some((item) => item.id === stored)
        ? exchangeOptions.find((item) => item.id === stored) ?? exchangeOptions[0]
        : exchangeOptions[0];
    if (!nextSelection) return;
    if (selectedExchange !== nextSelection.exchangeDisplayName) {
      setSelectedExchange(nextSelection.exchangeDisplayName as ExchangeName);
    }
    if ((selectedExchangeAccount ?? null) !== nextSelection.accountName) {
      setSelectedExchangeAccount(nextSelection.accountName);
    }
    persistTerminalExchange(nextSelection.id);
    const mapped = mapExchangeToSource(nextSelection.exchangeDisplayName);
    const nextSource = mapped ?? "AUTO";
    if (selectedExchangeId !== nextSource) setSelectedExchangeId(nextSource);
  }, [
    exchangeOptions,
    selectedExchange,
    selectedExchangeAccount,
    selectedExchangeId,
    setConnectionStatus,
    setSelectedExchange,
    setSelectedExchangeAccount,
    setSelectedExchangeId,
  ]);

  const handleExchangeChange = (exchangeSelectionId: string) => {
    const selectedOption = exchangeOptions.find((item) => item.id === exchangeSelectionId);
    if (!selectedOption) return;
    setSelectedExchange(selectedOption.exchangeDisplayName as ExchangeName);
    setSelectedExchangeAccount(selectedOption.accountName);
    persistTerminalExchange(selectedOption.id);
    const mapped = mapExchangeToSource(selectedOption.exchangeDisplayName);
    setSelectedExchangeId(mapped ?? "AUTO");
    setConnectionStatus("CONNECTING");
  };

  const healthBadge = (status: string, enabled: boolean) => {
    if (!enabled) return { dot: "bg-[#f6465d]", label: "OFF", cls: "border-[#704844] bg-[#271a19] text-[#d6b3af]" };
    if (status === "READY") return { dot: "bg-[#2bc48a]", label: "OK", cls: "border-[#4f6f58] bg-[#1c2620] text-[#b8d8c4]" };
    if (status === "PARTIAL") return { dot: "bg-[#f6465d]", label: "DOWN", cls: "border-[#704844] bg-[#271a19] text-[#d6b3af]" };
    return { dot: "bg-[#f6465d]", label: "ERROR", cls: "border-[#704844] bg-[#271a19] text-[#d6b3af]" };
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-[#121316] p-3">
      <div className="flex flex-wrap items-start gap-3">
        {/* Spot / Futures toggle */}
        <div className="mr-1 inline-flex rounded border border-white/15 bg-[#0F1012] p-1 text-sm">
          {(["Spot", "Futures"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setAccountMode(mode);
                setSelectedAccountType(mode === "Spot" ? "SPOT" : "FUTURES");
              }}
              className={`rounded px-3.5 py-1.5 ${accountMode === mode ? "bg-[#2b2417] text-[#F5C542]" : "text-[#BFC2C7]"}`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* ── Connected API list (replaces dropdown) ── */}
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {exchangeOptions.map((option) => {
            const isActive = option.id === activeId;
            const branding = getExchangeBranding(option.exchangeId);
            const health = healthBadge(option.status, option.enabled);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleExchangeChange(option.id)}
                className={`group inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all ${
                  isActive
                    ? "border-[var(--accent)]/40 bg-[#1d1a12] text-white shadow-[0_0_8px_rgba(245,197,66,0.08)]"
                    : "border-white/10 bg-[#0F1012] text-[#BFC2C7] hover:border-white/20 hover:bg-[#15171c]"
                }`}
              >
                <img
                  src={branding.iconUrl}
                  alt={option.exchangeDisplayName}
                  className="h-5 w-5 rounded-full"
                  loading="lazy"
                />
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-xs font-medium">
                    {option.exchangeDisplayName}
                    <span className="ml-1 text-[#8A8F98]">· {option.accountName}</span>
                  </span>
                  <span className={`mt-0.5 inline-flex items-center gap-1 text-[9px] font-semibold ${health.cls} rounded border px-1 py-px`}>
                    <span className="text-[#6B6F76] font-normal">User API:</span>
                    <span className={`h-1 w-1 rounded-full ${health.dot}`} />
                    {health.label}
                  </span>
                </div>
              </button>
            );
          })}

          {/* Add Exchange button */}
          <button
            type="button"
            onClick={() => onAddExchange?.()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#7a6840] bg-[#1a1510] px-3 py-2 text-xs font-semibold text-[#F5C542] transition hover:border-[#F5C542]/60 hover:bg-[#2a2418]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Add Exchange
          </button>

        </div>

        {/* Indicators dropdown removed from exchange top bar */}
      </div>
    </section>
  );
};
