import { useMemo, useState } from "react";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";
import { useDomBids, useDomAsks } from "../../hooks/useDomStore";
import { useLivePriceStore } from "../../hooks/useLivePriceStore";

interface Props {
  maxHeightClass?: string;
  fullHeight?: boolean;
}

export const OrderbookPanel = ({ maxHeightClass = "max-h-[690px]", fullHeight = false }: Props) => {
  const { orderbookStep, orderbookLimit, setOrderbookStep, selectedSymbol } = useExchangeTerminalStore();
  const [viewMode, setViewMode] = useState<"both" | "split" | "ladder">("both");

  // Derive raw symbol (e.g. "BTC/USDT" → "BTCUSDT")
  const symbol = useMemo(() => selectedSymbol.replace("/", "").toUpperCase(), [selectedSymbol]);

  // Primary: real-time DOM from WS dom_snapshot/dom_delta pipeline
  const domBids = useDomBids(symbol, orderbookLimit);
  const domAsks = useDomAsks(symbol, orderbookLimit);

  // Fallback: REST-polled orderbook from useExchangeTerminalStore
  const fallbackBids = useExchangeTerminalStore((s) => s.bids);
  const fallbackAsks = useExchangeTerminalStore((s) => s.asks);

  // Convert DOM levels to orderbook display format (with cumulative total)
  const bids = useMemo(() => {
    if (domBids.length > 0) {
      let cumTotal = 0;
      return domBids.map((level) => {
        const notional = level.price * level.qty;
        cumTotal += notional;
        return { price: level.price, amount: notional, total: cumTotal };
      });
    }
    return fallbackBids;
  }, [domBids, fallbackBids]);

  const asks = useMemo(() => {
    if (domAsks.length > 0) {
      let cumTotal = 0;
      return domAsks.map((level) => {
        const notional = level.price * level.qty;
        cumTotal += notional;
        return { price: level.price, amount: notional, total: cumTotal };
      });
    }
    return fallbackAsks;
  }, [domAsks, fallbackAsks]);

  // Use real last trade price from live price store (same as chart badge)
  const livePrice = useLivePriceStore((s) => s.bySymbol[symbol]);
  const hasData = bids.length > 0 || asks.length > 0;
  const asksDisplay = useMemo(() => [...asks].reverse(), [asks]);
  const topAskPrice = typeof asks[0]?.price === "number" ? asks[0].price.toFixed(2) : "-";
  // Show last trade price between ask/bid; fallback to top bid
  const lastTradeStr = livePrice?.price && livePrice.price > 0
    ? livePrice.price.toFixed(2)
    : (typeof bids[0]?.price === "number" ? bids[0].price.toFixed(2) : "-");
  const lastTradeIsUp = livePrice?.prevPrice != null && livePrice.prevPrice > 0
    ? livePrice.price >= livePrice.prevPrice : true;
  const fmtCompact = (value: number) => {
    if (!Number.isFinite(value)) return "-";
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
    return value.toFixed(2);
  };
  const askDepthMax = asksDisplay.length ? Math.max(...asksDisplay.map((a) => a.total || 0), 1) : 1;
  const bidDepthMax = bids.length ? Math.max(...bids.map((b) => b.total || 0), 1) : 1;

  return (
    <section className={`${fullHeight ? "h-full" : ""} rounded-xl border border-white/10 bg-[#121316]`}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-sm font-semibold text-white">Order Book</span>
        <span className="text-xs text-[#6B6F76]">•••</span>
      </div>
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5 text-[10px] text-[#6B6F76]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Orderbook view both"
            onClick={() => setViewMode("both")}
            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition ${viewMode === "both" ? "bg-[#1d222b]" : "hover:bg-[#171a1f]"}`}
          >
            <span className="h-2 w-1 rounded-[2px] bg-[#d49f9a]" />
            <span className="h-2 w-1 rounded-[2px] bg-[#8fc9ab]" />
          </button>
          <button
            type="button"
            aria-label="Orderbook split view"
            onClick={() => setViewMode("split")}
            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition ${viewMode === "split" ? "bg-[#1d222b]" : "opacity-80 hover:bg-[#171a1f]"}`}
          >
            <span className="h-2 w-1 rounded-[2px] bg-[#8fc9ab]" />
            <span className="h-2 w-1 rounded-[2px] bg-[#6B6F76]" />
          </button>
          <button
            type="button"
            aria-label="Orderbook ladder view"
            onClick={() => setViewMode("ladder")}
            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition ${viewMode === "ladder" ? "bg-[#1d222b]" : "opacity-80 hover:bg-[#171a1f]"}`}
          >
            <span className="h-2 w-1 rounded-[2px] bg-[#d49f9a]" />
            <span className="h-2 w-1 rounded-[2px] bg-[#6B6F76]" />
          </button>
        </div>
        <label className="inline-flex items-center gap-1">
          <select
            value={String(orderbookStep)}
            onChange={(e) => setOrderbookStep(Number(e.target.value))}
            className="rounded border border-white/10 bg-[#0F1012] px-1.5 py-0.5 text-[10px] text-[#BFC2C7] outline-none"
          >
            <option value="0.01">0.01</option>
            <option value="0.1">0.1</option>
            <option value="1">1</option>
          </select>
          <span className="text-[9px] text-[#6B6F76]">{orderbookLimit} lvls</span>
        </label>
      </div>
      {hasData ? (
        <>
          <div className="grid grid-cols-3 px-3 py-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">
            <span className="inline-flex items-baseline gap-1">
              <span>Price</span>
              <span className="text-[8px] tracking-normal text-[#7f8590]">USDT</span>
            </span>
            <span className="inline-flex items-baseline justify-end gap-1">
              <span>Size</span>
              <span className="text-[8px] tracking-normal text-[#7f8590]">USDT</span>
            </span>
            <span className="inline-flex items-baseline justify-end gap-1">
              <span>Sum</span>
              <span className="text-[8px] tracking-normal text-[#7f8590]">USDT</span>
            </span>
          </div>
          <div className={`${maxHeightClass} flex flex-col px-3 pb-2`}>
            {(viewMode === "both" || viewMode === "ladder") ? (
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#d6b3af]">Sell Orders</div>
            ) : null}
            {(viewMode === "both" || viewMode === "ladder") ? (
            <div className="h-[140px] overflow-auto">
              {asksDisplay.map((ask) => (
                <div
                  key={`a-${ask.price}`}
                  className="grid h-5 grid-cols-3 items-center py-0.5 text-xs"
                  style={{
                    background: `linear-gradient(90deg, rgba(246,70,93,0.16) ${Math.min(100, Math.max(6, (ask.total / askDepthMax) * 100))}%, transparent ${Math.min(100, Math.max(6, (ask.total / askDepthMax) * 100))}%)`,
                  }}
                >
                  <span className="text-[#d49f9a]">{ask.price.toFixed(2)}</span>
                  <span className="text-right text-[#BFC2C7]">{fmtCompact(ask.amount)}</span>
                  <span className="text-right text-[#6B6F76]">{fmtCompact(ask.total)}</span>
                </div>
              ))}
            </div>
            ) : null}
            <div className="my-1 shrink-0 rounded border border-white/10 bg-[#111418] px-2 py-0.5">
              <span className={`text-[23px] font-semibold leading-none ${lastTradeIsUp ? "text-[#2bc48a]" : "text-[#f6465d]"}`}>{lastTradeStr}</span>
              <span className={`ml-1 text-xs ${lastTradeIsUp ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{lastTradeIsUp ? "↑" : "↓"}</span>
              <span className="ml-1 text-xs text-[#6B6F76]">{topAskPrice}</span>
            </div>
            {(viewMode === "both" || viewMode === "split") ? (
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#d8decf]">Buy Orders</div>
            ) : null}
            {(viewMode === "both" || viewMode === "split") ? (
            <div className="h-[140px] overflow-auto">
              {bids.map((bid) => (
                <div
                  key={`b-${bid.price}`}
                  className="grid h-5 grid-cols-3 items-center py-0.5 text-xs"
                  style={{
                    background: `linear-gradient(90deg, rgba(43,196,138,0.16) ${Math.min(100, Math.max(6, (bid.total / bidDepthMax) * 100))}%, transparent ${Math.min(100, Math.max(6, (bid.total / bidDepthMax) * 100))}%)`,
                  }}
                >
                  <span className="text-[#8fc9ab]">{bid.price.toFixed(2)}</span>
                  <span className="text-right text-[#BFC2C7]">{fmtCompact(bid.amount)}</span>
                  <span className="text-right text-[#6B6F76]">{fmtCompact(bid.total)}</span>
                </div>
              ))}
            </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className={`${maxHeightClass} flex items-center justify-center px-4 py-6 text-center`}>
          <div>
            <p className="text-sm font-semibold text-white">No orderbook data</p>
            <p className="mt-1 text-xs text-[#6B6F76]">Selected exchange feed not available.</p>
          </div>
        </div>
      )}
    </section>
  );
};
