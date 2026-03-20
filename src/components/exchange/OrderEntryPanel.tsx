import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";
import { BalancesSummary } from "./BalancesSummary";
import { placeExchangeOrder } from "../../services/exchangeApi";

// ── Precision helpers — prevents exchange rejects before request leaves client ──
const roundToStep = (value: number, step: number): number => {
  if (step <= 0 || !Number.isFinite(step)) return value;
  return Math.floor(value / step) * step;
};
const roundToTick = (value: number, tick: number): number => {
  if (tick <= 0 || !Number.isFinite(tick)) return value;
  return Math.round(value / tick) * tick;
};
const countDecimals = (n: number): number => {
  if (Number.isInteger(n)) return 0;
  const s = String(n);
  return s.includes(".") ? s.split(".")[1].length : 0;
};

// Sensible defaults when symbol info is unavailable
const DEFAULT_SYMBOL_INFO = { stepSize: 0.001, tickSize: 0.01, minQty: 0.001, minNotional: 5, pricePrecision: 2, qtyPrecision: 3 };

interface Props {
  showBalances?: boolean;
  className?: string;
}

export const OrderEntryPanel = ({ showBalances = true, className = "" }: Props) => {
  const { selectedSymbol, selectedExchange, accountMode, tickers, positions } = useExchangeTerminalStore();
  const isBitriumOnly = selectedExchange === "Bitrium Labs";
  const [orderType, setOrderType] = useState<"Limit" | "Market" | "Stop Limit">("Limit");
  const [openCloseMode, setOpenCloseMode] = useState<"Open" | "Close">("Open");
  const [price, setPrice] = useState("0.00");
  const [stopPrice, setStopPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [postOnly, setPostOnly] = useState(false);
  const [tpsl, setTpsl] = useState(false);
  const [leverage, setLeverage] = useState(5);
  const [leverageOpen, setLeverageOpen] = useState(false);
  const [marginMode, setMarginMode] = useState<"Cross" | "Isolated">("Cross");
  const [marginModeOpen, setMarginModeOpen] = useState(false);
  const [positionMode, setPositionMode] = useState<"One-way" | "Hedge">("One-way");
  const [tif, setTif] = useState<"GTC" | "IOC" | "FOK">("GTC");
  const [tifOpen, setTifOpen] = useState(false);
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [submitInfo, setSubmitInfo] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const lastSubmitRef = useRef<string>("");

  // ── Symbol precision info (loaded from backend cache) ──
  const [symbolInfo, setSymbolInfo] = useState(DEFAULT_SYMBOL_INFO);
  useEffect(() => {
    const sym = selectedSymbol.replace("/", "");
    const venue = selectedExchange.toLowerCase().includes("gate") ? "GATEIO"
      : selectedExchange.toLowerCase().includes("bybit") ? "BYBIT"
      : selectedExchange.toLowerCase().includes("okx") ? "OKX"
      : "BINANCE";
    // Try to load symbol info from backend cache
    fetch(`/api/exchange-core/symbol-info?venue=${venue}&symbol=${sym}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.info) setSymbolInfo({
          stepSize: Number(data.info.stepSize) || DEFAULT_SYMBOL_INFO.stepSize,
          tickSize: Number(data.info.tickSize) || DEFAULT_SYMBOL_INFO.tickSize,
          minQty: Number(data.info.minQty) || DEFAULT_SYMBOL_INFO.minQty,
          minNotional: Number(data.info.minNotional) || DEFAULT_SYMBOL_INFO.minNotional,
          pricePrecision: Number(data.info.pricePrecision) ?? DEFAULT_SYMBOL_INFO.pricePrecision,
          qtyPrecision: Number(data.info.qtyPrecision) ?? DEFAULT_SYMBOL_INFO.qtyPrecision,
        });
      })
      .catch(() => { /* use defaults */ });
  }, [selectedSymbol, selectedExchange]);

  const ticker = useMemo(() => tickers.find((t) => t.symbol === selectedSymbol), [tickers, selectedSymbol]);
  const total = useMemo(() => (Number(price) || 0) * (Number(amount) || 0), [price, amount]);
  const base = selectedSymbol.split("/")[0];
  const leverageOptions = useMemo(() => [1, 2, 3, 5, 10, 20, 25, 50, 75, 100], []);
  const hasPosition = useMemo(() => positions.some((p) => p.symbol === selectedSymbol && p.size > 0), [positions, selectedSymbol]);

  useEffect(() => {
    const live = Number(ticker?.lastPrice ?? 0);
    if (live > 0) {
      setPrice(live.toFixed(2));
      setStopPrice((live * 0.998).toFixed(2));
    }
  }, [selectedSymbol, ticker?.lastPrice]);

  useEffect(() => {
    if (openCloseMode === "Close") setReduceOnly(true);
  }, [openCloseMode]);

  const applyBbo = () => {
    const live = Number(ticker?.lastPrice ?? 0);
    if (live > 0) setPrice(live.toFixed(2));
  };

  const { balances, openOrders, pushActivity } = useExchangeTerminalStore();

  // ── Tradable balance: wallet - openOrderMargin - positionMargin - feeBuffer ──
  const balanceMetrics = useMemo(() => {
    const usdt = balances.find((b) => b.asset === "USDT");
    const walletBalance = usdt?.total ?? 0;
    const crossWalletBalance = usdt?.available ?? walletBalance;

    // Open order margin = sum of (price * qty / leverage) for all open orders
    const openOrderMargin = openOrders.reduce((sum, o) => sum + (o.total / Math.max(leverage, 1)), 0);

    // Position margin from existing positions
    const positionMargin = positions
      .filter((p) => p.size > 0)
      .reduce((sum, p) => sum + (p.entry * p.size / Math.max(p.leverage, 1)), 0);

    // Unrealized PnL from positions
    const unrealizedPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

    // Fee buffer: 0.1% of wallet or min 1 USDT
    const feeBuffer = Math.max(walletBalance * 0.001, 1);

    const marginBalance = walletBalance + unrealizedPnl;
    // Prefer exchange crossWalletBalance if available, else compute
    const availableToTrade = accountMode === "Futures"
      ? Math.max(0, crossWalletBalance - openOrderMargin - feeBuffer)
      : Math.max(0, crossWalletBalance - feeBuffer);

    return { walletBalance, marginBalance, availableToTrade, feeBuffer };
  }, [balances, openOrders, positions, leverage, accountMode]);

  const { availableToTrade } = balanceMetrics;

  const applySizePreset = (pct: number) => {
    const maxNotional = availableToTrade * Math.max(leverage, 1);
    const next = (maxNotional * (pct / 100)) / Math.max(Number(price) || 1, 1);
    setAmount(next.toFixed(symbolInfo.qtyPrecision));
  };

  // ── Pre-validation: precision, min notional, reduce-only logic ──
  const validate = useCallback((side: "BUY" | "SELL"): string | null => {
    const rawQty = Number(amount);
    if (!rawQty || rawQty <= 0) return "Amount must be greater than 0";

    // Step size validation
    const roundedQty = roundToStep(rawQty, symbolInfo.stepSize);
    if (roundedQty < symbolInfo.minQty) return `Min qty: ${symbolInfo.minQty}`;

    if (orderType !== "Market") {
      const p = Number(price);
      if (!p || p <= 0) return "Price must be greater than 0";
      // Tick size validation
      const roundedPrice = roundToTick(p, symbolInfo.tickSize);
      if (Math.abs(roundedPrice - p) > 1e-12) return `Price must be a multiple of ${symbolInfo.tickSize}`;
      // Min notional check
      const notional = roundedPrice * roundedQty;
      if (notional < symbolInfo.minNotional) return `Min notional: ${symbolInfo.minNotional} USDT (current: ${notional.toFixed(2)})`;
      // Post-only + marketable price warning
      if (postOnly && ticker) {
        const lastPrice = ticker.lastPrice;
        if (side === "BUY" && roundedPrice >= lastPrice) return "Post-only: buy price must be below market";
        if (side === "SELL" && roundedPrice <= lastPrice) return "Post-only: sell price must be above market";
      }
    }

    if (orderType === "Stop Limit") {
      const s = Number(stopPrice);
      if (!s || s <= 0) return "Stop price must be greater than 0";
    }

    // Reduce-only requires open position
    if (reduceOnly && !hasPosition) return "Reduce-only: no open position for this symbol";

    // TP/SL validation
    if (tpsl) {
      const tp = Number(tpPrice);
      const sl = Number(slPrice);
      if (tpPrice && tp <= 0) return "Take profit must be greater than 0";
      if (slPrice && sl <= 0) return "Stop loss must be greater than 0";
      if (tp && sl) {
        if (side === "BUY" && tp <= sl) return "Long: TP must be above SL";
        if (side === "SELL" && sl <= tp) return "Short: SL must be above TP";
      }
    }

    return null;
  }, [amount, price, stopPrice, orderType, symbolInfo, postOnly, ticker, reduceOnly, hasPosition, tpsl, tpPrice, slPrice]);

  const place = async (side: "BUY" | "SELL") => {
    // Pre-validation
    const error = validate(side);
    if (error) { setSubmitInfo(error); return; }

    // Debounce: prevent double-submit
    if (submitting) return;
    const submitKey = `${side}:${selectedSymbol}:${amount}:${price}:${Date.now()}`;
    if (submitKey === lastSubmitRef.current) return;
    lastSubmitRef.current = submitKey;

    // Round qty and price to exchange precision
    const qty = roundToStep(Number(amount), symbolInfo.stepSize);
    const roundedPrice = orderType === "Market" ? undefined : roundToTick(Number(price), symbolInfo.tickSize);
    const qtyFactor = Math.pow(10, symbolInfo.qtyPrecision);
    const finalQty = Math.floor(qty * qtyFactor) / qtyFactor;

    const payload = {
      exchange: selectedExchange,
      symbol: selectedSymbol.replace("/", ""),
      side,
      orderType,
      amount: finalQty,
      price: roundedPrice,
      stopPrice: orderType === "Stop Limit" ? Number(stopPrice) : undefined,
      accountMode,
      leverage: accountMode === "Futures" ? leverage : undefined,
      marginMode: accountMode === "Futures" ? marginMode : undefined,
      positionAction: openCloseMode,
      tif,
      reduceOnly,
      postOnly,
      tpSl: {
        enabled: tpsl,
        tpPrice: tpPrice ? Number(tpPrice) : undefined,
        slPrice: slPrice ? Number(slPrice) : undefined,
      },
    } as const;

    setSubmitting(true);
    setSubmitInfo("Sending order...");

    // Optimistic: insert pending order into store immediately
    const pendingId = `pending-${Date.now()}`;
    const { applyOrderUpdate } = useExchangeTerminalStore.getState();
    applyOrderUpdate({
      orderId: pendingId,
      symbol: selectedSymbol.replace("/", ""),
      side,
      orderType: orderType.toUpperCase(),
      orderStatus: "PENDING_SUBMIT",
      origQty: finalQty,
      price: roundedPrice ?? 0,
      totalFilledQty: 0,
      timestamp: Date.now(),
    });
    pushActivity("order", `${selectedSymbol} ${side} submitting...`);

    try {
      const res = await placeExchangeOrder(payload);
      if (res.ok) {
        setSubmitInfo(`Order sent (${side})`);
        pushActivity("order", `${selectedSymbol} ${side} accepted`);
        // Remove pending placeholder — real order comes via WS
        const store = useExchangeTerminalStore.getState();
        store.setAccountData({ openOrders: store.openOrders.filter((o) => o.id !== pendingId) });
      } else {
        // Normalize error for user
        const errorMap: Record<string, string> = {
          INSUFFICIENT_BALANCE: "Yetersiz bakiye.",
          NORM_QTY_TOO_SMALL: "Emir boyutu minimum limitin altinda.",
          NORM_MIN_NOTIONAL: "Emir tutari minimum notional'in altinda.",
          RISK_REJECTED: "Risk kontrolu reddetti.",
          RATE_LIMITED: "Istek limiti asildi, biraz bekleyin.",
          CIRCUIT_OPEN: "Borsa baglantisi gecici olarak devre disi.",
          EXCHANGE_ERROR: "Borsa API hatasi.",
        };
        const code = String(res.error ?? "");
        const userMsg = errorMap[code] ?? res.error ?? "Emir gonderilemedi.";
        setSubmitInfo(userMsg);
        pushActivity("order", `${selectedSymbol} ${side} REJECTED: ${code}`);
        // Remove pending placeholder
        const store = useExchangeTerminalStore.getState();
        store.setAccountData({ openOrders: store.openOrders.filter((o) => o.id !== pendingId) });
      }
    } catch (err: any) {
      setSubmitInfo("Baglanti hatasi — emir dogrulanamadi.");
      pushActivity("order", `${selectedSymbol} ${side} NETWORK_ERROR`);
      const store = useExchangeTerminalStore.getState();
      store.setAccountData({ openOrders: store.openOrders.filter((o) => o.id !== pendingId) });
    } finally {
      setSubmitting(false);
    }
  };

  if (accountMode === "Futures") {
    return (
      <section className={`${className} rounded-xl border border-white/10 bg-[#121316] p-3`}>
        <div className="mb-2 flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setMarginModeOpen((v) => !v);
                setLeverageOpen(false);
                setTifOpen(false);
              }}
              className={`min-w-14 rounded-md px-2 py-1 text-xs ${marginMode === "Cross" ? "bg-[#2d3645] text-white" : "bg-[#1A1B1F] text-[#BFC2C7]"}`}
            >
              {marginMode}
            </button>
            {marginModeOpen ? (
              <div className="absolute left-0 top-8 z-20 w-28 rounded-md border border-white/10 bg-[#121316] p-1">
                {(["Cross", "Isolated"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMarginMode(m);
                      setMarginModeOpen(false);
                    }}
                    className={`block w-full rounded px-2 py-1 text-left text-xs ${marginMode === m ? "bg-[#2d3645] text-white" : "text-[#BFC2C7] hover:bg-[#1A1B1F]"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setLeverageOpen((v) => !v);
                setMarginModeOpen(false);
                setTifOpen(false);
              }}
              className="min-w-12 rounded-md bg-[#2d3645] px-2 py-1 text-xs text-white"
            >
              {leverage}x
            </button>
            {leverageOpen ? (
              <div className="absolute left-0 top-8 z-20 w-48 rounded-md border border-white/10 bg-[#121316] p-2">
                <input
                  type="range" min={1} max={100} value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="mb-2 h-1 w-full appearance-none rounded-full accent-[#F5C542]"
                  style={{ background: `linear-gradient(90deg, ${leverage <= 10 ? '#2bc48a' : leverage <= 25 ? '#F5C542' : '#f6465d'} ${leverage}%, #1A1B1F ${leverage}%)` }}
                />
                <div className="mb-1.5 flex items-center justify-between text-[10px]">
                  <span className={leverage <= 10 ? "text-[#2bc48a]" : leverage <= 25 ? "text-[#F5C542]" : "text-[#f6465d]"}>
                    {leverage}x {leverage <= 5 ? "Safe" : leverage <= 20 ? "Moderate" : leverage <= 50 ? "Risky" : "Dangerous"}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {[1, 3, 5, 10, 20, 25, 50, 75, 100].map((x) => (
                    <button key={x} type="button"
                      onClick={() => { setLeverage(x); setLeverageOpen(false); }}
                      className={`rounded px-1 py-0.5 text-[10px] ${leverage === x ? "bg-[#2d3645] text-white" : "text-[#6B6F76] hover:bg-[#1A1B1F]"}`}
                    >{x}x</button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setPositionMode((v) => (v === "One-way" ? "Hedge" : "One-way"))}
            className="min-w-10 rounded-md bg-[#1A1B1F] px-2 py-1 text-xs text-white"
            title="Position mode"
          >
            {positionMode === "One-way" ? "O" : "H"}
          </button>
          <button type="button" className="ml-auto rounded-md bg-[#1A1B1F] px-2 py-1 text-xs text-[#6B6F76]">
            •••
          </button>
        </div>

        <div className="mb-2 grid grid-cols-2 overflow-hidden rounded-md border border-white/15 text-sm">
          <button
            type="button"
            onClick={() => setOpenCloseMode("Open")}
            className={openCloseMode === "Open" ? "bg-[#5b6675] py-1 text-white" : "bg-transparent py-1 text-[#BFC2C7]"}
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => setOpenCloseMode("Close")}
            className={openCloseMode === "Close" ? "bg-[#5b6675] py-1 text-white" : "bg-transparent py-1 text-[#BFC2C7]"}
          >
            Close
          </button>
        </div>

        <div className="mb-2 flex items-center gap-3 text-sm">
          {(["Limit", "Market", "Stop Limit"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={orderType === t ? "border-b border-[#F5C542] pb-0.5 text-[#F5C542]" : "text-[#8A8F98]"}
            >
              {t}
            </button>
          ))}
          <span className="ml-auto text-xs text-[#6B6F76]">ⓘ</span>
        </div>

        <div className="mb-2 space-y-0.5 text-[11px]">
          <div className="flex justify-between text-[#6B6F76]">
            <span>Wallet</span>
            <span className="text-[#BFC2C7]">{balanceMetrics.walletBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</span>
          </div>
          {accountMode === "Futures" && (
            <div className="flex justify-between text-[#6B6F76]">
              <span>Margin</span>
              <span className="text-[#BFC2C7]">{balanceMetrics.marginBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</span>
            </div>
          )}
          <div className="flex justify-between text-[#F5C542]">
            <span>Available to Trade</span>
            <span>{availableToTrade.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</span>
          </div>
        </div>

        <div className="mb-2">
          <label className="mb-1 block text-xs text-[#8A8F98]">Price</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-white/15 bg-[#111418] px-2 py-2">
              <input
                disabled={orderType === "Market"}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-transparent text-lg text-white outline-none disabled:opacity-50"
              />
            </div>
            <button type="button" className="rounded-lg border border-white/15 bg-[#111418] px-3 py-2 text-sm text-white">
              USDT
            </button>
            <button type="button" onClick={applyBbo} className="rounded-lg border border-white/15 bg-[#111418] px-3 py-2 text-sm text-white">
              BBO
            </button>
          </div>
        </div>

        {orderType === "Stop Limit" ? (
          <div className="mb-2">
            <label className="mb-1 block text-xs text-[#8A8F98]">Stop Price</label>
            <div className="rounded-lg border border-white/15 bg-[#111418] px-2 py-2">
              <input
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                className="w-full bg-transparent text-sm text-white outline-none"
              />
            </div>
          </div>
        ) : null}

        <div className="mb-2">
          <label className="mb-1 block text-xs text-[#8A8F98]">Size</label>
          <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-[#111418] px-2 py-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none"
            />
            <span className="text-sm text-white">USDT ▾</span>
          </div>
        </div>
        <div className="mb-2 grid grid-cols-4 gap-1">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => applySizePreset(pct)}
              className="rounded border border-white/10 bg-[#111418] px-2 py-1 text-[11px] text-[#BFC2C7] hover:border-[#F5C542]/50"
            >
              {pct}%
            </button>
          ))}
        </div>

        <div className="mb-2 px-1">
          <div className="h-5 border-b border-white/15">
            <div className="relative top-[14px] flex justify-between text-[10px] text-[#6B6F76]">
              <span>◇</span>
              <span>◇</span>
              <span>◇</span>
              <span>◇</span>
              <span>◇</span>
            </div>
          </div>
        </div>

        <div className="mb-2 flex items-center gap-4 text-xs text-[#BFC2C7]">
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={tpsl} onChange={(e) => setTpsl(e.target.checked)} className="h-3.5 w-3.5 accent-[#F5C542]" />
            TP/SL
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} className="h-3.5 w-3.5 accent-[#F5C542]" />
            Reduce-only
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={postOnly} onChange={(e) => setPostOnly(e.target.checked)} className="h-3.5 w-3.5 accent-[#F5C542]" />
            Post-only
          </label>
        </div>

        {tpsl ? (
          <div className="mb-2 rounded-md border border-white/10 bg-[#101318] p-2">
            <p className="mb-2 text-[11px] font-semibold text-[#BFC2C7]">TP/SL Details</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-[#8A8F98]">Take Profit</label>
                <input
                  value={tpPrice}
                  onChange={(e) => setTpPrice(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1.5 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#8A8F98]">Stop Loss</label>
                <input
                  value={slPrice}
                  onChange={(e) => setSlPrice(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1.5 text-xs text-white outline-none"
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="relative mb-2 text-xs text-[#8A8F98]">
          <button
            type="button"
            onClick={() => {
              setTifOpen((v) => !v);
              setLeverageOpen(false);
              setMarginModeOpen(false);
            }}
            className="inline-flex items-center gap-1"
          >
            TIF <span className="text-[#BFC2C7]">{tif} ▾</span>
          </button>
          {tifOpen ? (
            <div className="absolute left-0 top-5 z-20 w-24 rounded-md border border-white/10 bg-[#121316] p-1">
              {(["GTC", "IOC", "FOK"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setTif(item);
                    setTifOpen(false);
                  }}
                  className={`block w-full rounded px-2 py-1 text-left text-xs ${tif === item ? "bg-[#2d3645] text-white" : "text-[#BFC2C7] hover:bg-[#1A1B1F]"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mb-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void place("BUY")}
            disabled={isBitriumOnly || submitting}
            title={isBitriumOnly ? "Connect an exchange to trade. Using Bitrium Labs public data." : undefined}
            className="rounded-md bg-[#2bc48a] px-3 py-2 text-base font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Open Long"}
          </button>
          <button
            type="button"
            onClick={() => void place("SELL")}
            disabled={isBitriumOnly || submitting}
            title={isBitriumOnly ? "Connect an exchange to trade. Using Bitrium Labs public data." : undefined}
            className="rounded-md bg-[#f6465d] px-3 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Open Short"}
          </button>
        </div>
        {isBitriumOnly ? (
          <p className="mb-2 text-xs text-[#8A8F98]">Connect an exchange to trade. Using Bitrium Labs public data.</p>
        ) : null}

        <div className="mb-2 rounded-lg border border-white/5 bg-[#0d0f12] p-2 text-[11px]">
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[#8A8F98]">
            <div>Init Margin <span className="text-white">{(total / Math.max(leverage, 1)).toFixed(2)} USDT</span></div>
            <div className="text-right">Cost <span className="text-white">{((total / Math.max(leverage, 1)) + total * 0.0004).toFixed(2)} USDT</span></div>
            <div>Est. Fee <span className="text-white">{(total * 0.0004).toFixed(2)} USDT</span> <span className="text-[#6B6F76]">(0.04%)</span></div>
            <div className="text-right">Max Qty <span className="text-white">{((availableToTrade * Math.max(leverage, 1)) / Math.max(Number(price) || 1, 1)).toFixed(symbolInfo.qtyPrecision)} {base}</span></div>
            <div>Liq. Price <span className={leverage > 10 ? "text-[#f6465d]" : "text-[#F5C542]"}>~{Number(price) > 0 ? (Number(price) * (1 - 1 / Math.max(leverage, 1) * 0.9)).toFixed(2) : "-"}</span></div>
            <div className="text-right">Max <span className="text-white">{(availableToTrade * Math.max(leverage, 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })} USDT</span></div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#2a3140] px-2 py-2 text-xs text-[#E7E9ED]">
          <span className="mr-1 text-[#F5C542]">✦</span>
          Trade Futures with USDT Flexible Assets
        </div>

        {submitInfo ? <p className="mt-2 text-xs text-[#BFC2C7]">{submitInfo}</p> : null}
      </section>
    );
  }

  return (
    <section className={`${className} rounded-xl border border-white/10 bg-[#121316] p-3`}>
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="border-b border-[#F5C542] pb-0.5 text-[#F5C542]">Spot</span>
        <span className="ml-auto text-[#6B6F76]">% Fee Level</span>
      </div>

      <div className="mb-2 flex items-center gap-2 text-xs">
        {(["Limit", "Market", "Stop Limit"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setOrderType(t)} className={orderType === t ? "rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-white" : "text-[#6B6F76]"}>
            {t}
          </button>
        ))}
        <label className="ml-auto text-[#6B6F76]">Leverage
          <input type="number" min={1} max={125} value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} className="ml-1 w-14 rounded border border-white/15 bg-[#0F1012] px-1 py-0.5 text-xs text-white" />
        </label>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <label className="block text-xs text-[#BFC2C7]">Price
            <input disabled={orderType === "Market"} value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 w-full rounded border border-white/15 bg-[#111418] px-2 py-1 text-sm text-white disabled:opacity-50" />
          </label>
          <label className="block text-xs text-[#BFC2C7]">Amount
            <input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded border border-white/15 bg-[#111418] px-2 py-1 text-sm text-white" />
          </label>
          <div className="text-xs text-[#6B6F76]">Total: {total.toFixed(2)} USDT</div>
          <div className="flex flex-wrap gap-2 text-xs text-[#BFC2C7]">
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={tpsl} onChange={(e) => setTpsl(e.target.checked)} className="h-3.5 w-3.5 accent-[#F5C542]" />TP/SL</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} className="h-3.5 w-3.5 accent-[#F5C542]" />Reduce-only</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={postOnly} onChange={(e) => setPostOnly(e.target.checked)} className="h-3.5 w-3.5 accent-[#F5C542]" />Post-only</label>
          </div>
          <button
            type="button"
            onClick={() => void place("BUY")}
            disabled={isBitriumOnly || submitting}
            title={isBitriumOnly ? "Connect an exchange to trade. Using Bitrium Labs public data." : undefined}
            className="w-full rounded bg-[#2bc48a] px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Sending..." : `Buy ${base}`}
          </button>
        </div>

        <div className="space-y-2 rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <label className="block text-xs text-[#BFC2C7]">Price
            <input disabled={orderType === "Market"} value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 w-full rounded border border-white/15 bg-[#111418] px-2 py-1 text-sm text-white disabled:opacity-50" />
          </label>
          <label className="block text-xs text-[#BFC2C7]">Amount
            <input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded border border-white/15 bg-[#111418] px-2 py-1 text-sm text-white" />
          </label>
          <div className="text-xs text-[#6B6F76]">Estimated fee: {(total * 0.0004).toFixed(4)} USDT</div>
          <div className="text-xs text-[#6B6F76]">Margin required: {(total / leverage).toFixed(2)} USDT</div>
          <button
            type="button"
            onClick={() => void place("SELL")}
            disabled={isBitriumOnly}
            title={isBitriumOnly ? "Connect an exchange to trade. Using Bitrium Labs public data." : undefined}
            className="w-full rounded bg-[#f6465d] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Sending..." : `Sell ${base}`}
          </button>
        </div>
      </div>
      {isBitriumOnly ? (
        <p className="mt-2 text-xs text-[#8A8F98]">Connect an exchange to trade. Using Bitrium Labs public data.</p>
      ) : null}
      {submitInfo ? <p className="mt-2 text-xs text-[#BFC2C7]">{submitInfo}</p> : null}

      {showBalances ? (
        <div className="mt-2">
          <BalancesSummary />
        </div>
      ) : null}
    </section>
  );
};
