import { useEffect, useMemo, useRef, useState } from "react";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { useLocation, useNavigate } from "react-router-dom";
import { ChartPanel } from "../components/exchange/ChartPanel";
import { ExchangeTopBar } from "../components/exchange/ExchangeTopBar";
import { FuturesAccountPanel } from "../components/exchange/FuturesAccountPanel";
import { FuturesBottomPanel } from "../components/exchange/FuturesBottomPanel";
import { FuturesTradeIdeasPanel } from "../components/exchange/FuturesTradeIdeasPanel";
import { MarketList } from "../components/exchange/MarketList";
import { OrderEntryPanel } from "../components/exchange/OrderEntryPanel";
import { OrderbookPanel } from "../components/exchange/OrderbookPanel";
import { OrdersTable } from "../components/exchange/OrdersTable";
import { PositionsTable } from "../components/exchange/PositionsTable";
import { TradesTape } from "../components/exchange/TradesTape";
import { useIndicatorsStore } from "../hooks/useIndicatorsStore";
import { useExchangeConfigs } from "../hooks/useExchangeConfigs";
import { useExchangeTerminalStore } from "../hooks/useExchangeTerminalStore";
import { FallbackApiAdapter, type FallbackLivePayload } from "../data/FallbackApiAdapter";
import { MarketDataRouter } from "../data/MarketDataRouter";
import { fetchExchangeAccountSnapshot } from "../services/exchangeApi";
import { parseTradePlan } from "../utils/parseTradePlan";
import type { ExchangeTradeSignal } from "../types/exchange";
import type { TradeTick } from "../types/exchange";
import type { TickerItem } from "../types/exchange";
import { useDataSourceManager } from "../data/DataSourceManager";
import { useDisplayPrice, useMarkPrice } from "../hooks/useLivePriceStore";

const normalizeCandlesForChart = (
  rows: Array<{ time: number; open: number; high: number; low: number; close: number }> | undefined,
): CandlestickData[] => {
  if (!Array.isArray(rows) || !rows.length) return [];
  const dedup = new Map<number, CandlestickData>();
  for (const row of rows) {
    const rawTime = Number(row?.time ?? 0);
    // Lightweight Charts expects UNIX seconds. Some exchanges return ms.
    const time = rawTime > 10_000_000_000 ? Math.floor(rawTime / 1000) : Math.floor(rawTime);
    const open = Number(row?.open ?? NaN);
    const high = Number(row?.high ?? NaN);
    const low = Number(row?.low ?? NaN);
    const close = Number(row?.close ?? NaN);
    if (!Number.isFinite(time) || time <= 0) continue;
    if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    dedup.set(time, {
      time: time as UTCTimestamp,
      open,
      high,
      low,
      close,
    });
  }
  return [...dedup.values()].sort((a, b) => Number(a.time) - Number(b.time));
};

export default function ExchangeTerminalPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [chartTimeframe, setChartTimeframe] = useState<"1m" | "15m" | "1H" | "4H" | "1D" | "1W">("15m");
  const indicators = useIndicatorsStore();
  const { enabledAccounts, hasEnabledAccounts } = useExchangeConfigs();
  const {
    selectedSymbol,
    selectedExchange,
    selectedExchangeAccount,
    accountMode,
    setAccountMode,
    setSelectedExchange,
    setMarketData,
    setAccountData,
    setSelectedSymbol,
    setSelectedExchangeAccount,
    setConnectionStatus,
    setActiveSignal,
    clearActiveSignal,
    activeSignal,
    orderbookStep,
    orderbookLimit,
  } = useExchangeTerminalStore();
  const selectedAccountType = useDataSourceManager((state) => state.selectedAccountType);
  const hasSelectedAccount = useMemo(
    () =>
      enabledAccounts.some(
        (row) =>
          row.exchangeDisplayName.toLowerCase() === selectedExchange.toLowerCase() &&
          row.accountName.toLowerCase() === String(selectedExchangeAccount ?? "").toLowerCase(),
      ),
    [enabledAccounts, selectedExchange, selectedExchangeAccount],
  );
  const exchangeBlocked = !hasEnabledAccounts || !hasSelectedAccount;
  const routerSymbol = useMemo(() => selectedSymbol.replace("/", ""), [selectedSymbol]);

  // ── Canonical prices — useLivePriceStore is the SINGLE SOURCE OF TRUTH ──
  // MarketDataRouter bootstraps from REST, WS streams update in real-time.
  // UI reads ONLY from these selector hooks, never from raw backend objects.
  const displayPrice = useDisplayPrice(routerSymbol);
  const liveMarkPrice = useMarkPrice(routerSymbol);

  const [chartBundle, setChartBundle] = useState<FallbackLivePayload | null>(null);
  const [strictBookBundle, setStrictBookBundle] = useState<FallbackLivePayload | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [sourceWarning, setSourceWarning] = useState<string | null>(null);
  const [noDataTimeout, setNoDataTimeout] = useState(false);
  const [activeFeedLabel, setActiveFeedLabel] = useState<string>("NONE");
  const exchangeHint = useMemo<"BINANCE" | "BYBIT" | "OKX" | "GATEIO">(() => {
    const raw = selectedExchange.toLowerCase();
    if (raw === "bybit") return "BYBIT";
    if (raw === "okx") return "OKX";
    if (raw === "gate.io" || raw === "gateio" || raw === "gate") return "GATEIO";
    return "BINANCE";
  }, [selectedExchange]);
  const tradingViewPrefix = useMemo(() => {
    const raw = selectedExchange.toLowerCase();
    if (raw.includes("bybit")) return "BYBIT";
    if (raw.includes("okx")) return "OKX";
    if (raw.includes("gate")) return "GATEIO";
    return "BINANCE";
  }, [selectedExchange]);
  const tradingViewSymbol = useMemo(
    () => `${tradingViewPrefix}:${selectedSymbol.replace("/", "")}`,
    [tradingViewPrefix, selectedSymbol],
  );
  const apiInterval = useMemo<"1m" | "15m" | "1h" | "4h" | "1d" | "1w">(() => {
    if (chartTimeframe === "1m") return "1m";
    if (chartTimeframe === "15m") return "15m";
    if (chartTimeframe === "1H") return "1h";
    if (chartTimeframe === "4H") return "4h";
    if (chartTimeframe === "1D") return "1d";
    return "1w";
  }, [chartTimeframe]);

  useEffect(() => {
    const nextMode = selectedAccountType === "SPOT" ? "Spot" : "Futures";
    if (accountMode !== nextMode) setAccountMode(nextMode);
  }, [accountMode, selectedAccountType, setAccountMode]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rawSymbol = String(params.get("symbol") ?? "").toUpperCase().replace(/[-_]/g, "").trim();
    const rawExchange = String(params.get("exchange") ?? "").toLowerCase();
    const rawAccount = String(params.get("account") ?? "").trim();

    if (rawSymbol) {
      const symbol = rawSymbol.endsWith("USDT") ? `${rawSymbol.slice(0, -4)}/USDT` : rawSymbol;
      setSelectedSymbol(symbol);
    }
    if (rawExchange) {
      if (rawExchange.includes("gate")) setSelectedExchange("Gate.io");
      else if (rawExchange.includes("binance")) setSelectedExchange("Binance");
      else if (rawExchange.includes("bybit")) setSelectedExchange("Bybit");
      else if (rawExchange.includes("okx")) setSelectedExchange("OKX");
    }
    if (rawAccount) setSelectedExchangeAccount(rawAccount);
  }, [location.search, setSelectedExchange, setSelectedExchangeAccount, setSelectedSymbol]);

  useEffect(() => {
    if (exchangeBlocked) return;
    let cancelled = false;
    let inFlight = false;
    const source = "exchange";
    const exchange = selectedExchange;

    const toUiSymbol = (raw: string) => {
      const upper = String(raw ?? "").toUpperCase().replace(/[-_]/g, "");
      if (upper.endsWith("USDT")) return `${upper.slice(0, -4)}/USDT`;
      return upper;
    };

    const run = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const [symbolsRes, tickersRes] = await Promise.all([
          fetch(`/api/market/symbols?exchange=${encodeURIComponent(exchange)}&source=${source}`, {
            headers: { accept: "application/json" },
          }),
          fetch(`/api/market/tickers?exchange=${encodeURIComponent(exchange)}&source=${source}`, {
            headers: { accept: "application/json" },
          }),
        ]);
        if (cancelled) return;
        const symbolsBody = (await symbolsRes.json()) as { ok?: boolean; symbols?: string[] };
        const tickersBody = (await tickersRes.json()) as {
          ok?: boolean;
          items?: Array<{ symbol: string; price: number; change24hPct: number }>;
        };
        const symbolList = Array.isArray(symbolsBody.symbols) ? symbolsBody.symbols : [];
        const tickers = Array.isArray(tickersBody.items) ? tickersBody.items : [];
        const tickerMap = new Map(tickers.map((t) => [toUiSymbol(`${t.symbol}USDT`), t]));

        const merged: TickerItem[] = symbolList.map((base) => {
          const symbol = `${String(base).toUpperCase()}/USDT`;
          const t = tickerMap.get(symbol);
          return {
            symbol,
            lastPrice: Number(t?.price ?? 0),
            change24hPct: Number(t?.change24hPct ?? 0),
            volume24h: 0,
          };
        });

        const state = useExchangeTerminalStore.getState();
        const current = state.tickers.find((t) => t.symbol === state.selectedSymbol);
        const nextTickers = merged.length ? merged : state.tickers;
        const hasCurrent = nextTickers.some((t) => t.symbol === state.selectedSymbol);
        state.setMarketData({
          tickers: !hasCurrent && current ? [current, ...nextTickers] : nextTickers,
          bids: state.bids,
          asks: state.asks,
          trades: state.trades,
        });
      } catch {
        // Keep previous list on transient errors.
      } finally {
        inFlight = false;
      }
    };

    void run();
    const timer = window.setInterval(() => void run(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [exchangeBlocked, selectedExchange]);
  useEffect(() => {
    if (exchangeBlocked) {
      setChartBundle(null);
      setStrictBookBundle(null);
      setLiveError(null);
      setSourceWarning(null);
      setNoDataTimeout(false);
      setConnectionStatus("DISCONNECTED");
      clearActiveSignal();
      const state = useExchangeTerminalStore.getState();
      setMarketData({ tickers: state.tickers, bids: [], asks: [], trades: [] });
      setAccountData({
        positions: [],
        openOrders: [],
        orderHistory: [],
        tradeHistory: [],
        transactionHistory: [],
        positionHistory: [],
        botsHistory: [],
      });
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const run = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      setConnectionStatus("CONNECTING");
      try {
        let live: FallbackLivePayload | null = null;
        try {
          const attempt = await FallbackApiAdapter.fetchLive({
            symbol: routerSymbol,
            interval: apiInterval,
            lookback: 360,
            exchangeHint,
            orderbookStep,
            orderbookLimit,
            sourceMode: "exchange_strict",
          });
          if ((attempt.ohlcv ?? []).length > 0) {
            live = attempt;
          }
        } catch {
          live = null;
        }

        if (cancelled) return;
        if (!live) {
          setLiveError(`No live candle data from ${selectedExchange} (${selectedExchangeAccount ?? "N/A"}).`);
          setSourceWarning(`Selected exchange ${selectedExchange} is unavailable. Returning N/A data (fallback disabled).`);
          setActiveFeedLabel(`N/A:${selectedExchange}`);
          setMarketData({ tickers: useExchangeTerminalStore.getState().tickers, bids: [], asks: [], trades: [] });
          setStrictBookBundle(null);
          setConnectionStatus("ERROR", "Selected exchange unavailable");
          return;
        }

        const strictHasBookLevels =
          (live?.orderbookLevels?.bids?.length ?? 0) > 0 &&
          (live?.orderbookLevels?.asks?.length ?? 0) > 0;

        setChartBundle(live);
        setStrictBookBundle(strictHasBookLevels ? live : null);
        setConnectionStatus(strictHasBookLevels ? "CONNECTED" : "ERROR", strictHasBookLevels ? undefined : "Selected exchange book/trades unavailable");
        setLiveError(null);
        setSourceWarning(
          strictHasBookLevels
            ? null
            : `Orderbook/Trades unavailable on ${selectedExchange}. Chart is shown, book/trades are N/A.`,
        );
        setActiveFeedLabel(strictHasBookLevels ? `PRIMARY:${selectedExchange}` : `PRIMARY:${selectedExchange} | BOOK:N/A`);
      } catch (err) {
        if (cancelled) return;
        setLiveError(err instanceof Error ? err.message : "Live fetch failed");
        setSourceWarning(`Selected exchange ${selectedExchange} unavailable. Fallback disabled.`);
        setActiveFeedLabel(`N/A:${selectedExchange}`);
        setConnectionStatus("ERROR", err instanceof Error ? err.message : "Live fetch failed");
      } finally {
        inFlight = false;
      }
    };

    void run();
    // REST poll slowed to 5s — real-time data now flows via WS pipelines:
    //   candles → WS candle_update, ticks → WS tick_batch, book → WS dom_snapshot/delta
    // REST only needed for: derivatives (funding, OI), ticker fallback, initial candle load.
    const timer = window.setInterval(() => {
      void run();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    apiInterval,
    clearActiveSignal,
    exchangeBlocked,
    exchangeHint,
    routerSymbol,
    selectedExchange,
    selectedSymbol,
    setAccountData,
    setSelectedSymbol,
    orderbookStep,
    orderbookLimit,
  ]);

  useEffect(() => {
    if (exchangeBlocked) {
      setNoDataTimeout(false);
      return;
    }
    if ((chartBundle?.ohlcv?.length ?? 0) > 0) {
      setNoDataTimeout(false);
      return;
    }
    const timer = window.setTimeout(() => setNoDataTimeout(true), 4000);
    return () => window.clearTimeout(timer);
  }, [exchangeBlocked, chartBundle?.ohlcv?.length, routerSymbol, selectedExchange]);

  useEffect(() => {
    if (exchangeBlocked) return;
    let cancelled = false;
    let inFlight = false;
    const exchangeId = selectedExchange.toLowerCase().includes("gate")
      ? "gate"
      : selectedExchange.toLowerCase().includes("binance")
        ? "binance"
        : selectedExchange.toLowerCase().includes("bybit")
          ? "bybit"
          : selectedExchange.toLowerCase().includes("okx")
            ? "okx"
            : "";
    if (!exchangeId) return;

    const run = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const snapshot = await fetchExchangeAccountSnapshot(exchangeId, routerSymbol, selectedExchangeAccount ?? undefined);
        if (cancelled || !snapshot.ok || !snapshot.data) return;
        setAccountData({
          balances: snapshot.data.balances ?? [],
          positions: snapshot.data.positions ?? [],
          openOrders: snapshot.data.openOrders ?? [],
          orderHistory: snapshot.data.orderHistory ?? [],
          tradeHistory: snapshot.data.tradeHistory ?? [],
          transactionHistory: snapshot.data.transactionHistory ?? [],
          positionHistory: snapshot.data.positionHistory ?? [],
          botsHistory: snapshot.data.bots ?? [],
          assetsHistory: snapshot.data.assets ?? snapshot.data.balances ?? [],
        });
      } catch {
        // Keep previous account snapshot on transient errors.
      } finally {
        inFlight = false;
      }
    };

    void run();
    const timer = window.setInterval(() => void run(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [exchangeBlocked, routerSymbol, selectedExchange, selectedExchangeAccount, setAccountData]);

  // Canonical candle update from Binance kline stream via WS — no price mixing
  const wsCandle = MarketDataRouter.useStore(
    (s) => s.candleUpdates[`${routerSymbol}:${apiInterval === "1w" ? "1d" : apiInterval}`],
  );

  // ── Stabilized candle base: only updates when bar structure changes ──
  // Prevents setData() from firing every REST poll cycle.
  // When only the forming candle's close changes, sig stays the same → no setData.
  // WS series.update() handles forming candle updates at kline rate (~250ms).
  const [stableCandles, setStableCandles] = useState<CandlestickData[]>([]);
  const [stableOhlcv, setStableOhlcv] = useState<Array<{ time: number; close: number; volume: number }>>([]);
  const candleSigRef = useRef("");

  useEffect(() => {
    const ohlcv = chartBundle?.ohlcv;
    const normalized = normalizeCandlesForChart(ohlcv);
    const len = normalized.length;
    // Signature: bar count + first/last timestamps — NOT close prices.
    // Close price changes on every REST poll for the forming candle, but we don't
    // want to trigger setData for that — WS series.update() handles it.
    const sig = len > 0
      ? `${len}:${normalized[0].time}:${normalized[len - 1].time}`
      : "";
    if (sig === candleSigRef.current) return;
    candleSigRef.current = sig;
    setStableCandles(normalized);
    if (ohlcv?.length) setStableOhlcv(ohlcv);
  }, [chartBundle?.ohlcv]);

  // Reset stable candle state when symbol/timeframe changes
  useEffect(() => {
    candleSigRef.current = "";
    setStableCandles([]);
    setStableOhlcv([]);
  }, [routerSymbol, apiInterval]);

  // ── EFFECT A: Lightweight price-only ticker + PnL update ──
  // Fires on every WS tick (displayPrice/liveMarkPrice change).
  // MUST be fast (<2ms): only patches ticker.lastPrice and position.pnl.
  // Does NOT recalculate bids/asks/trades (that's the heavy bundle effect).
  useEffect(() => {
    if (exchangeBlocked) return;
    const base = displayPrice ?? 0;
    if (base <= 0) return;
    const markPriceDisplay = liveMarkPrice ?? base;
    const state = useExchangeTerminalStore.getState();
    const { tickers, balances, positions, openOrders } = state;
    const sourceOhlcv = chartBundle?.ohlcv ?? [];
    const prev = sourceOhlcv.length > 24
      ? sourceOhlcv[sourceOhlcv.length - 25]?.close ?? base
      : sourceOhlcv[0]?.close ?? base;
    const change24hPct = prev > 0 ? ((base - prev) / prev) * 100 : 0;
    const nextTickers = tickers.map((t) =>
      t.symbol === selectedSymbol
        ? {
            ...t,
            lastPrice: base,
            change24hPct: Number(change24hPct.toFixed(2)),
            markPrice: markPriceDisplay > 0 ? markPriceDisplay : t.markPrice,
            indexPrice: markPriceDisplay > 0 ? markPriceDisplay : t.indexPrice,
          }
        : t,
    );
    const nextPositions = positions.map((p) => {
      const mark = markPriceDisplay > 0 ? markPriceDisplay : p.mark ?? p.entry;
      const pnl = Number(((p.side === "BUY" ? mark - p.entry : p.entry - mark) * p.size).toFixed(2));
      return { ...p, mark, pnl };
    });
    setMarketData({ tickers: nextTickers });
    setAccountData({ balances, positions: nextPositions, openOrders });
  }, [displayPrice, liveMarkPrice, selectedSymbol, exchangeBlocked, setMarketData, setAccountData, chartBundle]);

  // ── EFFECT B: Heavy bundle update (candle data, orderbook, trades, derivatives) ──
  // Fires only when REST chartBundle or strictBookBundle changes (~every 5s).
  // Does the heavy array mapping for bids/asks/trades that was previously in every tick.
  useEffect(() => {
    if (exchangeBlocked) return;
    const sourceOhlcv = chartBundle?.ohlcv ?? [];
    if (!sourceOhlcv.length) return;
    const state = useExchangeTerminalStore.getState();
    const { tickers } = state;
    const base = displayPrice ?? 0;
    const volume24h = sourceOhlcv.slice(-96).reduce((sum, row) => sum + (row.volume ?? 0), 0);
    // Update volume and derivatives in tickers (not price — that's in effect A)
    const nextTickers = tickers.map((t) =>
      t.symbol === selectedSymbol
        ? {
            ...t,
            volume24h: volume24h || t.volume24h,
            fundingRate8h: chartBundle?.derivatives?.fundingRate ?? t.fundingRate8h,
            openInterestUsd: chartBundle?.derivatives?.oiValue ?? t.openInterestUsd,
          }
        : t,
    );

    const strictAsks = strictBookBundle?.orderbookLevels?.asks ?? [];
    const strictBids = strictBookBundle?.orderbookLevels?.bids ?? [];
    const hasStrictBook = strictAsks.length > 0 && strictBids.length > 0;
    const nextAsks = hasStrictBook
      ? strictAsks.map((row) => ({
          price: Number(row.price.toFixed(2)),
          amount: Number(row.amount.toFixed(3)),
          total: Number(row.total.toFixed(2)),
        }))
      : [];
    const nextBids = hasStrictBook
      ? strictBids.map((row) => ({
          price: Number(row.price.toFixed(2)),
          amount: Number(row.amount.toFixed(3)),
          total: Number(row.total.toFixed(2)),
        }))
      : [];

    const recentTrades = strictBookBundle?.recentTrades ?? [];
    const nextTrades: TradeTick[] = hasStrictBook
      ? recentTrades.length > 0
        ? recentTrades.map((t, idx) => ({
            id: t.id || `rt-${idx}-${t.ts}`,
            price: Number(t.price.toFixed(2)),
            amount: Number(t.amount.toFixed(3)),
            side: t.side === "SELL" ? "SELL" : "BUY",
            time: new Date(t.ts).toLocaleTimeString(),
          }))
        : [
            {
              id: `mx-${Date.now()}`,
              price: Number(base.toFixed(2)),
              amount: Number((Math.max(0.001, strictBookBundle?.trades?.volumeBtc1m ?? 0.1) / 10).toFixed(3)),
              side: (strictBookBundle?.trades?.deltaBtc1m ?? 0) >= 0 ? "BUY" : "SELL",
              time: new Date().toLocaleTimeString(),
            },
          ]
      : [];

    setMarketData({ tickers: nextTickers, bids: nextBids, asks: nextAsks, trades: nextTrades });
  }, [
    chartBundle,
    strictBookBundle,
    selectedSymbol,
    setMarketData,
    exchangeBlocked,
    displayPrice,
  ]);

  useEffect(() => {
    if (exchangeBlocked) return;
    let cancelled = false;
    let inFlight = false;

    const toSignal = (plan: NonNullable<ReturnType<typeof parseTradePlan>>): ExchangeTradeSignal => ({
      direction: plan.direction,
      horizon: plan.horizon,
      confidence: plan.confidence,
      tradeValidity: plan.tradeValidity,
      entryWindow: plan.entryWindow,
      slippageRisk: plan.slippageRisk,
      timeframe: plan.timeframe,
      validBars: plan.validUntilBars,
      timestampUtc: plan.timestampUtc,
      validUntilUtc: plan.validUntilUtc,
      setup: plan.setup,
      entryLow: plan.entry.low,
      entryHigh: plan.entry.high,
      stops: [plan.stops[0]?.price ?? plan.entry.low, plan.stops[1]?.price ?? plan.stops[0]?.price ?? plan.entry.low],
      targets: [plan.targets[0]?.price ?? plan.entry.high, plan.targets[1]?.price ?? plan.targets[0]?.price ?? plan.entry.high],
    });

    const run = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const idea = await FallbackApiAdapter.fetchTradeIdea({
          symbol: routerSymbol,
          timeframe: apiInterval === "1w" ? "1d" : apiInterval,
          horizon: "INTRADAY",
          exchangeHint,
          sourceMode: "exchange",
          strict: true,
        });
        if (cancelled || !idea?.ok || !idea.text) return;
        const parsed = parseTradePlan(idea.text);
        if (!parsed) return;
        setActiveSignal(toSignal(parsed));
      } catch {
        // keep previous signal when no fresh idea is available
      } finally {
        inFlight = false;
      }
    };

    void run();
    const timer = window.setInterval(() => void run(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiInterval, exchangeBlocked, exchangeHint, routerSymbol, setActiveSignal]);

  return (
    <main className="h-screen overflow-hidden bg-[#0B0B0C] p-3 text-[#BFC2C7] md:p-4">
      <div className="mx-auto flex h-full max-w-[1850px] min-h-0 flex-col">
        <ExchangeTopBar />
        {sourceWarning || liveError || (!exchangeBlocked && !chartBundle && !noDataTimeout) || noDataTimeout ? (
          <div className="mt-2 rounded-lg border border-[#7a6840] bg-[#2a2418] px-3 py-2 text-xs text-[#e7d9b3]">
            {sourceWarning
              ?? liveError
              ?? (noDataTimeout
                ? `No live data for ${selectedExchange} / ${selectedSymbol}. Check exchange API permissions or symbol availability.`
                : `Connecting ${selectedExchange} live feed...`)}
          </div>
        ) : null}

        {accountMode === "Futures" ? (
          <section className="mt-2 flex min-h-0 flex-1 gap-2">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <section className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[minmax(0,1fr)_230px]">
                <div className="flex min-h-0 flex-col gap-2">
                  <div className="min-h-0 flex-1">
                    <ChartPanel
                      heightClass="h-full"
                      selectedTimeframe={chartTimeframe}
                      onTimeframeChange={setChartTimeframe}
                      liveCandles={stableCandles}
                      liveCandleUpdate={wsCandle}
                      liveOhlcv={stableOhlcv}
                      indicatorsState={indicators.state}
                      chartSourceLabel={activeFeedLabel}
                      activeSignal={activeSignal}
                      blockedMessage={
                        exchangeBlocked
                          ? "Add exchange"
                          : !stableCandles.length && (liveError || noDataTimeout)
                            ? "No live data"
                            : null
                      }
                      tradingViewSymbol={!exchangeBlocked && !stableCandles.length && (liveError || noDataTimeout) ? tradingViewSymbol : null}
                      onAddExchange={exchangeBlocked ? () => navigate("/settings#exchange-panel") : undefined}
                      indicatorsEnabledCount={indicators.enabledCount}
                      setMasterIndicators={indicators.setMaster}
                      setIndicatorGroup={indicators.setGroup}
                      setIndicatorEnabled={indicators.setIndicatorEnabled}
                      setIndicatorSetting={indicators.setIndicatorSetting}
                      resetIndicator={indicators.resetIndicator}
                    />
                  </div>
                </div>
                <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-0.5">
                  <OrderbookPanel maxHeightClass="max-h-[370px]" />
                  <TradesTape maxHeightClass="max-h-[230px]" />
                </div>
              </section>
              <section className="grid flex-none gap-2 xl:grid-cols-[minmax(0,1fr)_230px]">
                <FuturesBottomPanel className="h-[clamp(300px,32vh,420px)]" />
                <FuturesTradeIdeasPanel className="h-[clamp(300px,32vh,420px)]" />
              </section>
            </div>
            <aside className="flex w-[300px] min-h-0 flex-col gap-2">
              <div className="min-h-0 flex-1">
                <OrderEntryPanel showBalances={false} className="h-full" />
              </div>
              <FuturesAccountPanel className="mt-auto flex-none" />
            </aside>
          </section>
        ) : (
          <>
            <section className="mt-2 grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
              <div className="min-h-[920px]">
                <OrderbookPanel fullHeight />
              </div>

              <div className="space-y-3">
                <ChartPanel
                  selectedTimeframe={chartTimeframe}
                  onTimeframeChange={setChartTimeframe}
                  liveCandles={stableCandles}
                  liveCandleUpdate={wsCandle}
                  liveOhlcv={stableOhlcv}
                  indicatorsState={indicators.state}
                  chartSourceLabel={activeFeedLabel}
                  activeSignal={activeSignal}
                  blockedMessage={
                    exchangeBlocked
                      ? "Add exchange"
                      : !stableCandles.length && (liveError || noDataTimeout)
                        ? "No live data"
                      : null
                  }
                  tradingViewSymbol={!exchangeBlocked && !stableCandles.length && (liveError || noDataTimeout) ? tradingViewSymbol : null}
                  onAddExchange={exchangeBlocked ? () => navigate("/settings#exchange-panel") : undefined}
                  indicatorsEnabledCount={indicators.enabledCount}
                  setMasterIndicators={indicators.setMaster}
                  setIndicatorGroup={indicators.setGroup}
                  setIndicatorEnabled={indicators.setIndicatorEnabled}
                  setIndicatorSetting={indicators.setIndicatorSetting}
                  resetIndicator={indicators.resetIndicator}
                />
                <OrderEntryPanel />
              </div>

              <div className="space-y-3">
                <MarketList />
                <TradesTape />
              </div>
            </section>

            <section className="grid gap-3">
              <PositionsTable />
              <OrdersTable />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
