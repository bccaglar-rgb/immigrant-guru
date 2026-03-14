import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";

interface Props {
  maxHeightClass?: string;
  visibleRows?: number;
}

export const TradesTape = ({ maxHeightClass = "max-h-[280px]", visibleRows = 5 }: Props) => {
  const { trades } = useExchangeTerminalStore();
  const hasTrades = trades.length > 0;
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
            {trades.map((trade) => (
              <div key={trade.id} className="grid grid-cols-3 py-0.5 text-xs">
                <span className={trade.side === "BUY" ? "text-[#8fc9ab]" : "text-[#d49f9a]"}>{trade.price.toFixed(2)}</span>
                <span className="text-right text-[#BFC2C7]">{trade.amount.toFixed(3)}</span>
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
