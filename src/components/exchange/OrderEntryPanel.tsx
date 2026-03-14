import { useEffect, useMemo, useState } from "react";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";
import { BalancesSummary } from "./BalancesSummary";
import { placeExchangeOrder } from "../../services/exchangeApi";

interface Props {
  showBalances?: boolean;
  className?: string;
}

export const OrderEntryPanel = ({ showBalances = true, className = "" }: Props) => {
  const { selectedSymbol, selectedExchange, accountMode, tickers } = useExchangeTerminalStore();
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

  const ticker = useMemo(() => tickers.find((t) => t.symbol === selectedSymbol), [tickers, selectedSymbol]);
  const total = useMemo(() => (Number(price) || 0) * (Number(amount) || 0), [price, amount]);
  const base = selectedSymbol.split("/")[0];
  const leverageOptions = useMemo(() => [1, 2, 3, 5, 10, 20, 25, 50, 75, 100], []);

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

  const applySizePreset = (pct: number) => {
    const available = 403.67;
    const next = (available * (pct / 100)) / Math.max(Number(price) || 1, 1);
    setAmount(next.toFixed(4));
  };

  const place = async (side: "BUY" | "SELL") => {
    const qty = Number(amount);
    if (!qty || qty <= 0) {
      setSubmitInfo("Amount must be greater than 0");
      return;
    }
    if (orderType !== "Market") {
      const p = Number(price);
      if (!p || p <= 0) {
        setSubmitInfo("Price must be greater than 0");
        return;
      }
    }
    if (orderType === "Stop Limit") {
      const s = Number(stopPrice);
      if (!s || s <= 0) {
        setSubmitInfo("Stop price must be greater than 0");
        return;
      }
    }
    if (tpsl) {
      if ((tpPrice && Number(tpPrice) <= 0) || (slPrice && Number(slPrice) <= 0)) {
        setSubmitInfo("TP/SL values must be greater than 0");
        return;
      }
    }
    const payload = {
      exchange: selectedExchange,
      symbol: selectedSymbol.replace("/", ""),
      side,
      orderType,
      amount: qty,
      price: orderType === "Market" ? undefined : Number(price),
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
    setSubmitInfo("Sending order...");
    const res = await placeExchangeOrder(payload);
    setSubmitInfo(res.ok ? `Order sent (${side})` : `Order failed: ${res.error ?? "unknown"}`);
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
              <div className="absolute left-0 top-8 z-20 grid w-36 grid-cols-3 gap-1 rounded-md border border-white/10 bg-[#121316] p-1">
                {leverageOptions.map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => {
                      setLeverage(x);
                      setLeverageOpen(false);
                    }}
                    className={`rounded px-1 py-1 text-xs ${leverage === x ? "bg-[#2d3645] text-white" : "text-[#BFC2C7] hover:bg-[#1A1B1F]"}`}
                  >
                    {x}x
                  </button>
                ))}
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

        <div className="mb-2 flex items-center justify-between text-xs text-[#BFC2C7]">
          <span>Avbl 403.67 USDT</span>
          <span className="text-[#F5C542]">↪</span>
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
            disabled={isBitriumOnly}
            title={isBitriumOnly ? "Connect an exchange to trade. Using Bitrium Labs public data." : undefined}
            className="rounded-md bg-[#2bc48a] px-3 py-2 text-base font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open Long
          </button>
          <button
            type="button"
            onClick={() => void place("SELL")}
            disabled={isBitriumOnly}
            title={isBitriumOnly ? "Connect an exchange to trade. Using Bitrium Labs public data." : undefined}
            className="rounded-md bg-[#f6465d] px-3 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open Short
          </button>
        </div>
        {isBitriumOnly ? (
          <p className="mb-2 text-xs text-[#8A8F98]">Connect an exchange to trade. Using Bitrium Labs public data.</p>
        ) : null}

        <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-[#8A8F98]">
          <div>
            <div>Liq Price -- USDT</div>
            <div>Cost {(total / Math.max(leverage, 1)).toFixed(2)} USDT</div>
            <div>Max {(403.67 * Math.max(leverage, 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</div>
          </div>
          <div className="text-right">
            <div>Liq Price -- USDT</div>
            <div>Cost {(total / Math.max(leverage, 1)).toFixed(2)} USDT</div>
            <div>Max {(403.67 * Math.max(leverage, 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</div>
          </div>
        </div>

        <div className="mb-2 text-xs text-[#8A8F98]">% Fee level</div>

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
            disabled={isBitriumOnly}
            title={isBitriumOnly ? "Connect an exchange to trade. Using Bitrium Labs public data." : undefined}
            className="w-full rounded bg-[#2bc48a] px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {`Buy ${base}`}
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
            {`Sell ${base}`}
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
