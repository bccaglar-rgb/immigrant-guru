import { useState } from "react";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";

export const OrdersTable = () => {
  const { openOrders } = useExchangeTerminalStore();
  const [tab, setTab] = useState<"open" | "history" | "trade">("open");

  return (
    <section className="rounded-xl border border-white/10 bg-[#121316]">
      <div className="flex items-center gap-4 border-b border-white/10 px-3 py-2 text-sm">
        <button type="button" onClick={() => setTab("open")} className={tab === "open" ? "border-b border-[#F5C542] pb-0.5 text-[#F5C542]" : "text-[#6B6F76]"}>Open Orders</button>
        <button type="button" onClick={() => setTab("history")} className={tab === "history" ? "border-b border-[#F5C542] pb-0.5 text-[#F5C542]" : "text-[#6B6F76]"}>Order History</button>
        <button type="button" onClick={() => setTab("trade")} className={tab === "trade" ? "border-b border-[#F5C542] pb-0.5 text-[#F5C542]" : "text-[#6B6F76]"}>Trade History</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
              {["Date", "Pair", "Type", "Side", "Price", "Amount", "Filled", "Total"].map((h) => (
                <th key={h} className="px-2 py-1 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {openOrders.map((o) => (
              <tr key={o.id} className="border-t border-white/5 text-xs text-[#BFC2C7]">
                <td className="px-2 py-1.5">{o.date}</td>
                <td className="px-2 py-1.5">{o.pair}</td>
                <td className="px-2 py-1.5">{o.type}</td>
                <td className={`px-2 py-1.5 ${o.side === "BUY" ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{o.side}</td>
                <td className="px-2 py-1.5">{o.price.toFixed(3)}</td>
                <td className="px-2 py-1.5">{o.amount.toFixed(1)}</td>
                <td className="px-2 py-1.5">{o.filledPct}%</td>
                <td className="px-2 py-1.5">{o.total.toFixed(2)} USDT</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

