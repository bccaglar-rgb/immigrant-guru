import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";

export const PositionsTable = () => {
  const { positions, accountMode } = useExchangeTerminalStore();

  return (
    <section className="rounded-xl border border-white/10 bg-[#121316]">
      <div className="border-b border-white/10 px-3 py-2 text-sm font-semibold text-white">Open Positions</div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
              {["Symbol", "Side", "Size", "Entry", "Mark", "PnL", "Liq", "Lev"].map((h) => (
                <th key={h} className="px-2 py-1 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr className="border-t border-white/5 text-xs text-[#6B6F76]">
                <td className="px-2 py-6 text-center" colSpan={8}>
                  {accountMode === "Spot" ? "Spot mode active: no futures positions." : "No open positions."}
                </td>
              </tr>
            ) : null}
            {positions.map((p) => (
              <tr key={p.id} className="border-t border-white/5 text-xs text-[#BFC2C7]">
                <td className="px-2 py-1.5">{p.symbol}</td>
                <td className={`px-2 py-1.5 ${p.side === "BUY" ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{p.side}</td>
                <td className="px-2 py-1.5">{p.size}</td>
                <td className="px-2 py-1.5">{p.entry}</td>
                <td className="px-2 py-1.5">{p.mark}</td>
                <td className={`px-2 py-1.5 ${p.pnl >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{p.pnl.toFixed(2)}</td>
                <td className="px-2 py-1.5">{p.liquidation}</td>
                <td className="px-2 py-1.5">{p.leverage}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
