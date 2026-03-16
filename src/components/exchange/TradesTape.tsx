import { useMemo } from "react";
import { useTickStore, type Tick } from "../../hooks/useTickStore";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";

interface Props {
  maxHeightClass?: string;
  visibleRows?: number;
}

const formatPrice = (price: number): string => {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
};

const formatQty = (qty: number): string => {
  if (qty >= 100) return qty.toFixed(2);
  if (qty >= 1) return qty.toFixed(3);
  return qty.toFixed(4);
};

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

export const TradesTape = ({ maxHeightClass = "max-h-[280px]", visibleRows = 5 }: Props) => {
  const selectedSymbol = useExchangeTerminalStore((s) => s.selectedSymbol);
  // Derive raw symbol (e.g. "BTC/USDT" → "BTCUSDT")
  const symbol = useMemo(() => selectedSymbol.replace("/", "").toUpperCase(), [selectedSymbol]);

  // Primary: real-time ticks from WS tick_batch pipeline
  const ticks = useTickStore((s) => s.ticks[symbol] ?? []);

  // Fallback: REST-polled trades from useExchangeTerminalStore
  const fallbackTrades = useExchangeTerminalStore((s) => s.trades);

  // Display trades: prefer WS ticks, fallback to REST data
  const displayTrades = useMemo(() => {
    if (ticks.length > 0) {
      // Show most recent first (reversed)
      const reversed = [...ticks].reverse();
      return reversed.map((tick: Tick, idx: number) => ({
        id: tick.tradeId ?? `t-${tick.ts}-${idx}`,
        price: tick.price,
        amount: tick.qty,
        side: tick.side,
        time: formatTime(tick.ts),
      }));
    }
    // Fallback to REST data
    return fallbackTrades;
  }, [ticks, fallbackTrades]);

  const hasTrades = displayTrades.length > 0;
  const rowsHeightPx = Math.max(5, visibleRows) * 22;

  return (
    <section className="rounded-xl border border-white/10 bg-[#121316]">
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2 text-sm">
        <span className="border-b border-[#F5C542] pb-0.5 font-semibold text-white">Trades</span>
        <span className="text-[#6B6F76]">Top Movers</span>
      </div>
      {hasTrades ? (
        <>
          <div className="grid grid-cols-3 px-3 py-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">
            <span className="inline-flex items-baseline gap-1">
              <span>Price</span>
              <span className="text-[8px] tracking-normal text-[#7f8590]">USDT</span>
            </span>
            <span className="text-right inline-flex items-baseline justify-end gap-1">
              <span>Amount</span>
              <span className="text-[8px] tracking-normal text-[#7f8590]">USDT</span>
            </span>
            <span className="text-right">Time</span>
          </div>
          <div className={`${maxHeightClass} overflow-y-auto px-3 pb-2`} style={{ height: `${rowsHeightPx}px` }}>
            {displayTrades.map((trade) => (
              <div key={trade.id} className="grid grid-cols-3 py-0.5 text-xs">
                <span className={trade.side === "BUY" ? "text-[#8fc9ab]" : "text-[#d49f9a]"}>
                  {typeof trade.price === "number" ? formatPrice(trade.price) : trade.price}
                </span>
                <span className="text-right text-[#BFC2C7]">
                  {typeof trade.amount === "number" ? formatQty(trade.amount) : trade.amount}
                </span>
                <span className="text-right text-[10px] leading-4 text-[#6B6F76]">{trade.time}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className={`${maxHeightClass} flex items-center justify-center px-4 py-6 text-center`} style={{ height: `${rowsHeightPx}px` }}>
          <div>
            <p className="text-sm font-semibold text-white">No trades data</p>
            <p className="mt-1 text-xs text-[#6B6F76]">Selected exchange feed not available.</p>
          </div>
        </div>
      )}
    </section>
  );
};
