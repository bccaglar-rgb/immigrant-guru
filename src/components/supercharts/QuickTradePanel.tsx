/**
 * QuickTradePanel — Binance-style compact order entry for SuperCharts.
 * Mirrors ExchangeTerminal's OrderEntryPanel but in a narrow sidebar form factor.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";
import { placeExchangeOrder } from "../../services/exchangeApi";
import type { TradePlan } from "../../types";

const roundToStep = (value: number, step: number): number => {
  if (step <= 0 || !Number.isFinite(step)) return value;
  return Math.floor(value / step) * step;
};
const roundToTick = (value: number, tick: number): number => {
  if (tick <= 0 || !Number.isFinite(tick)) return value;
  return Math.round(value / tick) * tick;
};

const DEFAULT_SYMBOL_INFO = {
  stepSize: 0.001, tickSize: 0.01, minQty: 0.001,
  minNotional: 5, pricePrecision: 2, qtyPrecision: 3,
};

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20, 25, 50, 75, 100, 125];
const SIZE_PRESETS = [0, 25, 50, 75, 100];

type OrderType = "Market" | "Limit" | "Stop" | "Take Profit";
type MarginMode = "Cross" | "Isolated";

interface Props {
  symbol: string;      // e.g. "BTC/USDT"
  price: number;       // Current mid price
  idea: TradePlan | null;
  onTradeComplete?: () => void;
}

export const QuickTradePanel = ({ symbol, price: livePrice, idea, onTradeComplete }: Props) => {
  const { selectedExchange, accountMode, balances, openOrders } =
    useExchangeTerminalStore();

  // ── State ──
  const [mode, setMode] = useState<"Open" | "Close">("Open");
  const [marginMode, setMarginMode] = useState<MarginMode>("Cross");
  const [leverage, setLeverage] = useState(5);
  const [leverageOpen, setLeverageOpen] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>("Market");
  const [orderTypeOpen, setOrderTypeOpen] = useState(false);
  const [entryPrice, setEntryPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [sliderPct, setSliderPct] = useState(0);
  const [tpslEnabled, setTpslEnabled] = useState(false);
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");
  const [symbolInfo, setSymbolInfo] = useState(DEFAULT_SYMBOL_INFO);

  const base = symbol.split("/")[0] || "BTC";
  const rawSymbol = symbol.replace("/", "");

  // ── Load symbol info from backend ──
  useEffect(() => {
    const venue = selectedExchange.toLowerCase().includes("gate") ? "GATEIO"
      : selectedExchange.toLowerCase().includes("bybit") ? "BYBIT"
      : selectedExchange.toLowerCase().includes("okx") ? "OKX"
      : "BINANCE";
    fetch(`/api/exchange-core/symbol-info?venue=${venue}&symbol=${rawSymbol}`)
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
      .catch(() => {});
  }, [rawSymbol, selectedExchange]);

  // ── Set price from live data ──
  useEffect(() => {
    if (livePrice > 0 && !entryPrice) {
      setEntryPrice(livePrice.toFixed(livePrice > 100 ? 2 : 5));
    }
  }, [livePrice, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Prefill from trade idea ──
  useEffect(() => {
    if (!idea) return;
    const mid = (idea.entry.low + idea.entry.high) / 2;
    setEntryPrice(mid.toFixed(mid > 100 ? 2 : 5));
    if (idea.targets[0]?.price) setTpPrice(String(idea.targets[0].price));
    if (idea.stops[0]?.price) setSlPrice(String(idea.stops[0].price));
    if (idea.targets[0] || idea.stops[0]) setTpslEnabled(true);
  }, [idea]);

  // ── Available balance ──
  const availableBalance = useMemo(() => {
    const usdt = balances.find((b) => b.asset === "USDT");
    const wallet = usdt?.available ?? usdt?.total ?? 0;
    const orderMargin = openOrders.reduce((s, o) => s + (o.total / Math.max(leverage, 1)), 0);
    const feeBuffer = Math.max(wallet * 0.001, 1);
    return Math.max(0, wallet - orderMargin - feeBuffer);
  }, [balances, openOrders, leverage]);

  // ── Max open qty ──
  const maxOpenQty = useMemo(() => {
    const notional = availableBalance * Math.max(leverage, 1);
    const p = orderType === "Market" ? livePrice : (Number(entryPrice) || livePrice);
    if (p <= 0) return 0;
    return roundToStep(notional / p, symbolInfo.stepSize);
  }, [availableBalance, leverage, livePrice, entryPrice, orderType, symbolInfo.stepSize]);

  // ── Slider → amount sync ──
  const handleSlider = (pct: number) => {
    setSliderPct(pct);
    const qty = roundToStep(maxOpenQty * (pct / 100), symbolInfo.stepSize);
    setAmount(qty > 0 ? qty.toFixed(symbolInfo.qtyPrecision) : "");
  };

  // ── BBO (best bid/offer) ──
  const applyBbo = () => {
    if (livePrice > 0) setEntryPrice(livePrice.toFixed(livePrice > 100 ? 2 : 5));
  };

  // ── Submit order ──
  const handleSubmit = useCallback(async (side: "BUY" | "SELL") => {
    setSubmitMsg("");
    const qty = Number(amount);
    if (!qty || qty <= 0) { setSubmitMsg("Enter amount"); return; }
    if (orderType !== "Market" && (!Number(entryPrice) || Number(entryPrice) <= 0)) {
      setSubmitMsg("Enter price"); return;
    }
    const roundedQty = roundToStep(qty, symbolInfo.stepSize);
    if (roundedQty < symbolInfo.minQty) { setSubmitMsg(`Min qty: ${symbolInfo.minQty}`); return; }

    if (orderType !== "Market") {
      const p = Number(entryPrice);
      const rounded = roundToTick(p, symbolInfo.tickSize);
      const notional = rounded * roundedQty;
      if (notional < symbolInfo.minNotional) { setSubmitMsg(`Min notional: ${symbolInfo.minNotional} USDT`); return; }
    }

    setSubmitting(true);
    try {
      const mappedType = orderType === "Stop" ? "Stop Limit"
        : orderType === "Take Profit" ? "Limit"
        : orderType;
      await placeExchangeOrder({
        exchange: selectedExchange,
        symbol,
        side,
        orderType: mappedType as "Limit" | "Market" | "Stop Limit",
        amount: roundedQty,
        price: orderType !== "Market" ? Number(entryPrice) : undefined,
        accountMode: accountMode || "Futures",
        leverage,
        marginMode: marginMode === "Isolated" ? "Isolated" : "Cross",
        positionAction: mode,
        tif: "GTC",
        reduceOnly: mode === "Close",
        tpSl: tpslEnabled ? {
          enabled: true,
          tpPrice: Number(tpPrice) || undefined,
          slPrice: Number(slPrice) || undefined,
        } : undefined,
      });
      setSubmitMsg(`${side} order sent`);
      setAmount("");
      setSliderPct(0);
      onTradeComplete?.();
      setTimeout(() => setSubmitMsg(""), 3000);
    } catch (err: any) {
      setSubmitMsg(err?.message ?? "Order failed");
    } finally {
      setSubmitting(false);
    }
  }, [amount, entryPrice, orderType, symbolInfo, selectedExchange, symbol, accountMode, leverage, marginMode, mode, tpslEnabled, tpPrice, slPrice, onTradeComplete]);


  return (
    <div className="flex flex-col gap-1.5 text-[11px]">
      {/* ── Open / Close Tabs ── */}
      <div className="flex rounded-md overflow-hidden border border-white/[0.06]">
        <button
          type="button"
          onClick={() => setMode("Open")}
          className={`flex-1 py-1 text-[10px] font-semibold transition ${
            mode === "Open"
              ? "bg-[#2cc497] text-white"
              : "bg-[#0F1012] text-[#6B6F76] hover:text-white"
          }`}
        >
          Open
        </button>
        <button
          type="button"
          onClick={() => setMode("Close")}
          className={`flex-1 py-1 text-[10px] font-semibold transition ${
            mode === "Close"
              ? "bg-[#f6465d] text-white"
              : "bg-[#0F1012] text-[#6B6F76] hover:text-white"
          }`}
        >
          Close
        </button>
      </div>

      {/* ── Margin Mode + Leverage Row ── */}
      <div className="flex gap-1">
        {/* Margin mode */}
        <button
          type="button"
          onClick={() => setMarginMode((m) => m === "Cross" ? "Isolated" : "Cross")}
          className="flex-1 rounded border border-white/[0.08] bg-[#0F1012] py-1 text-[10px] text-[#BFC2C7] hover:border-white/20 transition"
        >
          {marginMode}
        </button>
        {/* Leverage dropdown */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setLeverageOpen(!leverageOpen)}
            className="w-full rounded border border-white/[0.08] bg-[#0F1012] py-1 text-[10px] text-[#F5C542] font-semibold hover:border-[#F5C542]/30 transition"
          >
            {leverage}x
          </button>
          {leverageOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-0.5 rounded border border-white/10 bg-[#181a20] shadow-xl max-h-[160px] overflow-y-auto">
              {LEVERAGE_OPTIONS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => { setLeverage(l); setLeverageOpen(false); }}
                  className={`block w-full px-2 py-1 text-left text-[10px] hover:bg-[#252833] transition ${
                    l === leverage ? "text-[#F5C542] bg-[#1d1f2a]" : "text-[#BFC2C7]"
                  }`}
                >
                  {l}x
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Order Type Dropdown ── */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOrderTypeOpen(!orderTypeOpen)}
          className="w-full flex items-center justify-between rounded border border-white/[0.08] bg-[#0F1012] px-2 py-1.5 text-[10px] text-[#BFC2C7] hover:border-white/20 transition"
        >
          <span>{orderType}</span>
          <svg className="h-3 w-3 text-[#555]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {orderTypeOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-0.5 rounded border border-white/10 bg-[#181a20] shadow-xl">
            {(["Market", "Limit", "Stop", "Take Profit"] as OrderType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setOrderType(t); setOrderTypeOpen(false); }}
                className={`block w-full px-2 py-1.5 text-left text-[10px] hover:bg-[#252833] transition ${
                  t === orderType ? "text-[#F5C542] bg-[#1d1f2a]" : "text-[#BFC2C7]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Price Input (hidden for Market orders) ── */}
      {orderType !== "Market" && (
        <div className="relative">
          <label className="absolute left-2 top-0.5 text-[8px] text-[#555] uppercase tracking-wider">Price</label>
          <input
            type="text"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            className="w-full rounded border border-white/[0.08] bg-[#0F1012] pt-3 pb-1 px-2 text-[11px] text-white outline-none focus:border-[#F5C542]/40 transition pr-12"
          />
          <button
            type="button"
            onClick={applyBbo}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded bg-[#1d2130] px-1.5 py-0.5 text-[9px] font-semibold text-[#BFC2C7] hover:bg-[#252833] transition"
          >
            BBO
          </button>
        </div>
      )}

      {orderType === "Market" && (
        <div className="rounded border border-white/[0.04] bg-[#0F1012] px-2 py-1.5 text-[10px] text-[#555] text-center">
          Market Price
        </div>
      )}

      {/* ── Amount Input ── */}
      <div className="relative">
        <label className="absolute left-2 top-0.5 text-[8px] text-[#555] uppercase tracking-wider">Amount</label>
        <input
          type="text"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setSliderPct(0); }}
          placeholder="0.00"
          className="w-full rounded border border-white/[0.08] bg-[#0F1012] pt-3 pb-1 px-2 text-[11px] text-white outline-none focus:border-[#F5C542]/40 transition pr-14"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[#555] font-medium">
          {base}
        </span>
      </div>

      {/* ── Size Slider ── */}
      <div className="flex items-center gap-1 px-0.5">
        {SIZE_PRESETS.map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => handleSlider(pct)}
            className={`h-2 w-2 rounded-full border transition ${
              sliderPct >= pct
                ? "bg-[#F5C542] border-[#F5C542]"
                : "bg-[#0F1012] border-white/20 hover:border-white/40"
            }`}
            title={`${pct}%`}
          />
        ))}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={sliderPct}
          onChange={(e) => handleSlider(Number(e.target.value))}
          className="flex-1 h-1 accent-[#F5C542] cursor-pointer"
          style={{ accentColor: "#F5C542" }}
        />
      </div>

      {/* ── TP/SL Toggle ── */}
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={tpslEnabled}
          onChange={(e) => setTpslEnabled(e.target.checked)}
          className="h-3 w-3 rounded border-white/20 bg-[#0F1012] accent-[#F5C542]"
        />
        <span className="text-[10px] text-[#8A8F98]">TP/SL</span>
      </label>

      {tpslEnabled && (
        <div className="grid grid-cols-2 gap-1">
          <div className="relative">
            <label className="absolute left-1.5 top-0.5 text-[7px] text-[#2cc497] uppercase">TP</label>
            <input
              type="text"
              value={tpPrice}
              onChange={(e) => setTpPrice(e.target.value)}
              placeholder="-"
              className="w-full rounded border border-[#2cc497]/20 bg-[#0F1012] pt-2.5 pb-0.5 px-1.5 text-[10px] text-white outline-none focus:border-[#2cc497]/50"
            />
          </div>
          <div className="relative">
            <label className="absolute left-1.5 top-0.5 text-[7px] text-[#f6465d] uppercase">SL</label>
            <input
              type="text"
              value={slPrice}
              onChange={(e) => setSlPrice(e.target.value)}
              placeholder="-"
              className="w-full rounded border border-[#f6465d]/20 bg-[#0F1012] pt-2.5 pb-0.5 px-1.5 text-[10px] text-white outline-none focus:border-[#f6465d]/50"
            />
          </div>
        </div>
      )}

      {/* ── Available + Max Open ── */}
      <div className="space-y-0.5 text-[9px]">
        <div className="flex justify-between">
          <span className="text-[#555]">Available</span>
          <span className="text-[#BFC2C7] font-medium">{availableBalance.toFixed(2)} USDT</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#555]">Max Open</span>
          <span className="text-[#BFC2C7] font-medium">{maxOpenQty.toFixed(symbolInfo.qtyPrecision)} {base}</span>
        </div>
      </div>

      {/* ── Open Long / Open Short Buttons ── */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={submitting}
          onClick={() => handleSubmit("BUY")}
          className="w-full rounded-md bg-[#2cc497] py-2 text-[11px] font-bold text-white hover:bg-[#25a882] active:bg-[#1f9472] disabled:opacity-50 transition"
        >
          {submitting ? "..." : mode === "Close" ? "Close Short" : "Open Long"}
        </button>
        <div className="flex justify-between text-[8px] text-[#555] px-0.5">
          <span>Max Open</span>
          <span>{maxOpenQty.toFixed(symbolInfo.qtyPrecision)} {base}</span>
        </div>
        <button
          type="button"
          disabled={submitting}
          onClick={() => handleSubmit("SELL")}
          className="w-full rounded-md bg-[#f6465d] py-2 text-[11px] font-bold text-white hover:bg-[#d83c51] active:bg-[#c03446] disabled:opacity-50 transition"
        >
          {submitting ? "..." : mode === "Close" ? "Close Long" : "Open Short"}
        </button>
      </div>

      {/* ── Submit feedback ── */}
      {submitMsg && (
        <p className={`text-center text-[9px] font-medium ${
          submitMsg.includes("sent") ? "text-[#2cc497]" : "text-[#f6465d]"
        }`}>
          {submitMsg}
        </p>
      )}
    </div>
  );
};
