import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDataSourceManager, type ExchangeSourceId } from "../../data/DataSourceManager";
import { useMarketDataStatus } from "../../hooks/useMarketData";
import { useAdminConfig } from "../../hooks/useAdminConfig";
import { useExchangeConfigs, persistTerminalExchange, readStoredTerminalExchange } from "../../hooks/useExchangeConfigs";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";
import { useTradeIdeasStream } from "../../hooks/useTradeIdeasStream";
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

const toUiSymbol = (raw: string) => {
  const upper = String(raw ?? "").toUpperCase().replace("-", "").replace("_", "");
  if (upper.endsWith("USDT")) return `${upper.slice(0, -4)}/USDT`;
  return upper;
};

export const ExchangeTopBar = () => {
  const {
    selectedExchange,
    selectedSymbol,
    tickers,
    accountMode,
    connectionStatus,
    activeSignal,
    selectedExchangeAccount,
    privateStreamStatus,
    setSelectedExchange,
    setSelectedExchangeAccount,
    setAccountMode,
    setConnectionStatus,
  } = useExchangeTerminalStore();
  const selectedExchangeId = useDataSourceManager((state) => state.selectedExchangeId);
  const setSelectedExchangeId = useDataSourceManager((state) => state.setSelectedExchangeId);
  const setSelectedAccountType = useDataSourceManager((state) => state.setSelectedAccountType);
  const sourceStatus = useMarketDataStatus();
  const { config } = useAdminConfig();
  const { messages } = useTradeIdeasStream(config.tradeIdeas.minConfidence, selectedExchange);
  const { registeredAccounts, enabledAccounts } = useExchangeConfigs();
  const navigate = useNavigate();
  const exchangeOptions = useMemo(
    () =>
      [...enabledAccounts].sort((a, b) => {
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
    [enabledAccounts],
  );
  const [exchangeMenuOpen, setExchangeMenuOpen] = useState(false);
  const exchangeMenuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!exchangeMenuRef.current) return;
      if (!exchangeMenuRef.current.contains(event.target as Node)) setExchangeMenuOpen(false);
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExchangeMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

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

  const selectedTicker = useMemo(
    () => tickers.find((ticker) => ticker.symbol === selectedSymbol),
    [tickers, selectedSymbol],
  );
  const latestIdeaForSymbol = useMemo(
    () => messages.find((item) => toUiSymbol(item.symbol) === selectedSymbol),
    [messages, selectedSymbol],
  );
  const fallbackConsensus = useMemo(() => {
    const chg = Math.abs(Number(selectedTicker?.change24hPct ?? 0));
    const volBoost = Number(selectedTicker?.volume24h ?? 0) > 0 ? 6 : 0;
    const raw = 52 + Math.min(30, chg * 2.6) + volBoost;
    return Math.max(35, Math.min(92, Math.round(raw)));
  }, [selectedTicker?.change24hPct, selectedTicker?.volume24h]);

  const consensusPct = Math.round(
    ((activeSignal?.confidence ?? latestIdeaForSymbol?.confidence ?? fallbackConsensus / 100) as number) * 100,
  );
  const topDirection = activeSignal?.direction ?? latestIdeaForSymbol?.direction ?? "WATCH";
  const topHorizon = activeSignal?.horizon ?? latestIdeaForSymbol?.horizon ?? "INTRADAY";
  const selectedTradeValidity = latestIdeaForSymbol?.tradeValidity ?? activeSignal?.tradeValidity ?? "NO-TRADE";
  const selectedEntryWindow = latestIdeaForSymbol?.entryWindow ?? activeSignal?.entryWindow ?? "CLOSED";
  const selectedMarketState = latestIdeaForSymbol?.marketState;
  const selectedFlowAnalysis = latestIdeaForSymbol?.flowAnalysis?.slice(0, 4) ?? [];

  const triggerTradeValidity = selectedTradeValidity === "VALID" ? "PASS" : "BLOCK";
  const triggerEntryWindow = selectedEntryWindow === "OPEN" ? "OPEN" : "CLOSED";
  const statusUi = useMemo(() => {
    if (!exchangeOptions.length || !selectedExchangeAccount) {
      return { label: "N/A", dot: "bg-[#8A8F98]", cls: "border-white/15 bg-[#15171b] text-[#BFC2C7]" };
    }
    if (connectionStatus === "CONNECTED") return { label: "GOOD", dot: "bg-[#2bc48a]", cls: "border-[#4f6f58] bg-[#1c2620] text-[#b8d8c4]" };
    if (connectionStatus === "CONNECTING") return { label: "CHECK", dot: "bg-[#F5C542]", cls: "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]" };
    if (connectionStatus === "ERROR") return { label: "ERROR", dot: "bg-[#f6465d]", cls: "border-[#704844] bg-[#271a19] text-[#d6b3af]" };
    return { label: "OFF", dot: "bg-[#8A8F98]", cls: "border-white/15 bg-[#15171b] text-[#BFC2C7]" };
  }, [connectionStatus, exchangeOptions.length, selectedExchangeAccount]);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#121316] p-3">
      <div className="flex flex-wrap items-start gap-3">
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

        <div ref={exchangeMenuRef} className="relative min-w-[280px] flex-1">
          <div className="flex items-center gap-2">
            {exchangeOptions.length ? (
              <button
                type="button"
                onClick={() => setExchangeMenuOpen((v) => !v)}
                className="inline-flex min-w-[220px] items-center justify-between rounded border border-white/15 bg-[#0F1012] px-3 py-1.5 text-base text-[#E7E9ED]"
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <img
                    src={getExchangeBranding(selectedExchange).iconUrl}
                    alt={selectedExchange}
                    className="h-5 w-5 rounded-full border border-white/15 bg-[#171a1f] object-cover"
                  />
                  <span className="max-w-[170px] truncate">
                    {selectedExchange}
                    {selectedExchangeAccount ? <span className="text-xs text-[#8A8F98]"> · {selectedExchangeAccount}</span> : null}
                  </span>
                </span>
                <span className="text-xs text-[#8A8F98]">▾</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/settings#exchange-panel")}
                className="inline-flex items-center gap-2 rounded border border-[#7a6840] bg-[#2a2418] px-3 py-1.5 text-sm font-semibold text-[#F5C542]"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#7a6840] bg-[#1f1a12] text-[12px]">
                  +
                </span>
                Add Exchange API
              </button>
            )}
            <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold ${statusUi.cls}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusUi.dot}`} />
              {statusUi.label}
            </span>
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
              privateStreamStatus === "subscribed" ? "border-[#4f6f58] bg-[#1c2620] text-[#b8d8c4]"
              : privateStreamStatus === "subscribing" ? "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]"
              : privateStreamStatus === "error" || privateStreamStatus === "disconnected" ? "border-[#704844] bg-[#271a19] text-[#d6b3af]"
              : "border-white/15 bg-[#15171b] text-[#6B6F76]"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                privateStreamStatus === "subscribed" ? "bg-[#2bc48a]"
                : privateStreamStatus === "subscribing" ? "bg-[#F5C542] animate-pulse"
                : privateStreamStatus === "error" || privateStreamStatus === "disconnected" ? "bg-[#f6465d]"
                : "bg-[#6B6F76]"
              }`} />
              {privateStreamStatus === "subscribed" ? "LIVE" : privateStreamStatus === "subscribing" ? "CONNECTING" : privateStreamStatus === "error" ? "ERROR" : privateStreamStatus === "disconnected" ? "OFFLINE" : "IDLE"}
            </span>
          </div>

          {exchangeMenuOpen && exchangeOptions.length ? (
            <div className="absolute left-0 z-30 mt-1 w-[260px] overflow-hidden rounded-lg border border-white/10 bg-[#111418] shadow-xl">
              <div className="max-h-[260px] overflow-y-auto p-1">
                {exchangeOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      handleExchangeChange(option.id);
                      setExchangeMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-[#E7E9ED] hover:bg-[#1a1f27]"
                  >
                    <img
                      src={option.iconUrl}
                      alt={option.exchangeDisplayName}
                      className="h-5 w-5 rounded-full border border-white/15 bg-[#171a1f] object-cover"
                    />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate">{option.exchangeDisplayName}</span>
                      <span className="truncate text-[11px] text-[#8A8F98]">
                        {option.exchangeId} · {option.accountName}
                      </span>
                    </span>
                  </button>
                ))}
                <div className="my-1 border-t border-white/10" />
                <button
                  type="button"
                  onClick={() => {
                    setExchangeMenuOpen(false);
                    navigate("/settings#exchange-panel");
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-[#F5C542] hover:bg-[#2b2417]"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#7a6840] bg-[#2a2418] text-[12px] font-semibold">
                    +
                  </span>
                  Add Exchange API
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#8A8F98]">
            {registeredAccounts.length ? (
              <>
                <span className="mr-1 text-[#9AA0AA]">Registered APIs:</span>
                {registeredAccounts.map((account) => (
                  <span
                    key={`${account.exchangeId}:${account.accountName}:${account.connectionId ?? "na"}`}
                    className={`rounded border px-2 py-0.5 ${
                      account.enabled
                        ? account.status === "READY"
                          ? "border-[#4f6f58] bg-[#1c2620] text-[#b8d8c4]"
                          : "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]"
                        : "border-[#704844] bg-[#271a19] text-[#d6b3af]"
                    }`}
                  >
                    {account.exchangeId.toUpperCase()} · {account.accountName}
                    {account.connectionId ? ` · ${account.connectionId.slice(0, 8)}` : ""}
                  </span>
                ))}
              </>
            ) : (
              <span>No exchange API registered. Use “Add Exchange API”.</span>
            )}
          </div>
        </div>

        <div className="ml-auto w-full rounded-xl border border-white/10 bg-[#0f1115] p-1.5 text-[11px] text-[#BFC2C7] xl:w-[410px] xl:min-w-[380px] xl:max-w-[420px]">
          <div className="flex items-start justify-between gap-2 rounded-lg border border-white/10 bg-[#10141b] p-1.5">
            <div className="min-w-0 flex-1">
              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)] gap-x-2">
                <div className="space-y-0.5 text-[10px] text-[#AFC6E4]">
                  {selectedFlowAnalysis.length ? (
                    selectedFlowAnalysis.slice(0, 2).map((line) => (
                      <p key={line} className="truncate" title={line}>
                        {line}
                      </p>
                    ))
                  ) : (
                    <>
                      <p className="truncate">• Structure N/A | Liquidity N/A | Positioning N/A | Execution N/A</p>
                      <p className="truncate">• Edge N/A | pWin N/A | avgWin N/A | cost N/A</p>
                    </>
                  )}
                </div>
                <div className="space-y-1 text-[10.5px]">
                  <p className="truncate">
                    <span className="text-[#8A8F98]">Trade validity:</span>{" "}
                    <span className={triggerTradeValidity === "PASS" ? "text-[#b8d8c4]" : "text-[#d6b3af]"}>{triggerTradeValidity}</span>
                    {"  "}
                    <span className="text-[#8A8F98]">Entry window:</span>{" "}
                    <span className={triggerEntryWindow === "OPEN" ? "text-[#b8d8c4]" : "text-[#d6b3af]"}>{triggerEntryWindow}</span>
                  </p>
                  <p className="truncate">
                    <span className="text-[#8A8F98]">Trend:</span> {selectedMarketState?.trend ?? "N/A"}
                    {"  "}
                    <span className="text-[#8A8F98]">HTF:</span> {selectedMarketState?.htfBias ?? "N/A"}
                    {"  "}
                    <span className="text-[#8A8F98]">Volatility:</span> {selectedMarketState?.volatility ?? "N/A"}
                    {"  "}
                    <span className="text-[#8A8F98]">Exec:</span>{" "}
                    {selectedMarketState?.execution?.replace("Liquidity ", "Liq ") ?? "N/A"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              {sourceStatus.stale ? (
                <span className="rounded-full border border-[#704844] bg-[#271a19] px-2 py-0.5 text-[10px] font-semibold text-[#d6b3af]">
                  STALE {sourceStatus.staleAgeSec}s
                </span>
              ) : null}
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                    topDirection === "LONG"
                      ? "border-[#4f6f58] bg-[#1c2620] text-[#b8d8c4]"
                      : topDirection === "SHORT"
                        ? "border-[#704844] bg-[#271a19] text-[#d6b3af]"
                        : "border-white/15 bg-[#15171b] text-[#BFC2C7]"
                  }`}
                >
                  {topDirection}
                </span>
                <span className="rounded border border-white/15 bg-[#15171b] px-1.5 py-0.5 text-[10px] text-[#BFC2C7]">
                  {topHorizon}
                </span>
                <span className="text-base font-bold text-[#F5C542]">{consensusPct}%</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
