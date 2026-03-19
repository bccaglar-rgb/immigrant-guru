import { useMemo } from "react";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";
import { useMarkPrice, useDisplayPrice } from "../../hooks/useLivePriceStore";

const PositionRow = ({ p }: { p: { id: string; symbol: string; side: "BUY" | "SELL"; size: number; entry: number; mark: number; pnl: number; liquidation: number; leverage: number } }) => {
  const routerSymbol = p.symbol.replace("/", "");
  const liveMarkPrice = useMarkPrice(routerSymbol);
  const livePrice = useDisplayPrice(routerSymbol);
  const markPrice = liveMarkPrice ?? p.mark ?? livePrice ?? p.entry;

  // Live PnL calculation
  const livePnl = useMemo(() => {
    if (!markPrice || !p.entry || p.size <= 0) return p.pnl;
    return p.side === "BUY"
      ? (markPrice - p.entry) * p.size
      : (p.entry - markPrice) * p.size;
  }, [markPrice, p.entry, p.size, p.side, p.pnl]);

  // ROE = unrealizedPnl / initialMargin * 100
  const initialMargin = p.entry * p.size / Math.max(p.leverage, 1);
  const roe = initialMargin > 0 ? (livePnl / initialMargin) * 100 : 0;

  // Liquidation distance
  const liqDistance = markPrice > 0 && p.liquidation > 0
    ? Math.abs(markPrice - p.liquidation) / markPrice * 100
    : 0;

  return (
    <tr className="border-t border-white/5 text-xs text-[#BFC2C7]">
      <td className="px-2 py-1.5">{p.symbol}</td>
      <td className={`px-2 py-1.5 ${p.side === "BUY" ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{p.side === "BUY" ? "LONG" : "SHORT"}</td>
      <td className="px-2 py-1.5">{p.size}</td>
      <td className="px-2 py-1.5">{p.entry.toFixed(2)}</td>
      <td className="px-2 py-1.5">{markPrice.toFixed(2)}</td>
      <td className={`px-2 py-1.5 ${livePnl >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>
        <div>{livePnl.toFixed(2)}</div>
        <div className="text-[10px]">{roe >= 0 ? "+" : ""}{roe.toFixed(1)}%</div>
      </td>
      <td className="px-2 py-1.5">
        <div>{p.liquidation > 0 ? p.liquidation.toFixed(2) : "—"}</div>
        {liqDistance > 0 && <div className={`text-[10px] ${liqDistance < 10 ? "text-[#f6465d]" : "text-[#6B6F76]"}`}>{liqDistance.toFixed(1)}%</div>}
      </td>
      <td className="px-2 py-1.5">{p.leverage}x</td>
    </tr>
  );
};

export const PositionsTable = () => {
  const { positions, accountMode, privateStreamStatus } = useExchangeTerminalStore();

  return (
    <section className="rounded-xl border border-white/10 bg-[#121316]">
      <div className="border-b border-white/10 px-3 py-2 text-sm font-semibold text-white">
        Open Positions{positions.length > 0 ? ` (${positions.length})` : ""}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
              {["Symbol", "Side", "Size", "Entry", "Mark", "PnL / ROE", "Liq / Dist", "Lev"].map((h) => (
                <th key={h} className="px-2 py-1 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr className="border-t border-white/5 text-xs text-[#6B6F76]">
                <td className="px-2 py-6 text-center" colSpan={8}>
                  {accountMode === "Spot" ? "Spot mode active — no futures positions."
                    : privateStreamStatus === "subscribing" ? "Connecting to exchange stream..."
                    : privateStreamStatus === "error" ? "Stream error — using REST fallback"
                    : privateStreamStatus === "disconnected" ? "Stream disconnected — reconnecting..."
                    : "No open positions"}
                </td>
              </tr>
            ) : null}
            {positions.map((p) => <PositionRow key={p.id} p={p} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
};
