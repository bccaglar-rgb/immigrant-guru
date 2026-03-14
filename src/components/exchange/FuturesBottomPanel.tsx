import { useMemo, useState } from "react";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";

type TabKey = "positions" | "openOrders" | "orderHistory" | "tradeHistory" | "transactionHistory" | "positionHistory" | "bots" | "assets";

interface Props {
  className?: string;
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "positions", label: "Positions" },
  { key: "openOrders", label: "Open Orders" },
  { key: "orderHistory", label: "Order History" },
  { key: "tradeHistory", label: "Trade History" },
  { key: "transactionHistory", label: "Transaction History" },
  { key: "positionHistory", label: "Position History" },
  { key: "bots", label: "Bots" },
  { key: "assets", label: "Assets" },
];

export const FuturesBottomPanel = ({ className = "" }: Props) => {
  const {
    positions,
    openOrders,
    orderHistory,
    tradeHistory,
    transactionHistory,
    positionHistory,
    botsHistory,
    assetsHistory,
  } = useExchangeTerminalStore();
  const [active, setActive] = useState<TabKey>("positions");

  const counts = useMemo(
    () => ({
      positions: positions.length,
      openOrders: openOrders.length,
      orderHistory: orderHistory.length,
      tradeHistory: tradeHistory.length,
      transactionHistory: transactionHistory.length,
      positionHistory: positionHistory.length,
      bots: botsHistory.length,
      assets: assetsHistory.length,
    }),
    [assetsHistory.length, botsHistory.length, openOrders.length, orderHistory.length, positionHistory.length, positions.length, tradeHistory.length, transactionHistory.length],
  );

  const empty = <div className="flex h-full min-h-[160px] items-center justify-center text-sm text-[#6B6F76]">No data from exchange API.</div>;

  return (
    <section className={`${className} flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121316]`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-2 py-2 text-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={
              active === tab.key
                ? "border-b border-[#F5C542] pb-0.5 text-[#F5C542]"
                : "text-[#6B6F76]"
            }
          >
            {tab.label}({counts[tab.key]})
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {active === "positions" ? (
          positions.length ? (
            <table className="min-w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <tr>
                  {[
                    "Symbol",
                    "Side",
                    "Size",
                    "Entry",
                    "Mark",
                    "Pnl",
                    "Liq.Price",
                    "Leverage",
                  ].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className="border-t border-white/5 text-[#BFC2C7]">
                    <td className="px-2 py-1.5">{p.symbol}</td>
                    <td className={`px-2 py-1.5 ${p.side === "BUY" ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{p.side}</td>
                    <td className="px-2 py-1.5">{p.size}</td>
                    <td className="px-2 py-1.5">{p.entry.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{p.mark.toFixed(2)}</td>
                    <td className={`px-2 py-1.5 ${p.pnl >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{p.pnl.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{p.liquidation.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{p.leverage}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            empty
          )
        ) : null}

        {active === "openOrders" ? (
          openOrders.length ? (
            <table className="min-w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <tr>
                  {[
                    "Date",
                    "Pair",
                    "Type",
                    "Side",
                    "Price",
                    "Amount",
                    "Filled",
                    "Total",
                  ].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openOrders.map((o) => (
                  <tr key={o.id} className="border-t border-white/5 text-[#BFC2C7]">
                    <td className="px-2 py-1.5">{o.date}</td>
                    <td className="px-2 py-1.5">{o.pair}</td>
                    <td className="px-2 py-1.5">{o.type}</td>
                    <td className={`px-2 py-1.5 ${o.side === "BUY" ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{o.side}</td>
                    <td className="px-2 py-1.5">{o.price.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{o.amount.toFixed(3)}</td>
                    <td className="px-2 py-1.5">{o.filledPct.toFixed(1)}%</td>
                    <td className="px-2 py-1.5">{o.total.toFixed(2)} USDT</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            empty
          )
        ) : null}

        {active === "orderHistory" ? (
          orderHistory.length ? (
            <table className="min-w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <tr>
                  {["Date", "Pair", "Type", "Side", "Price", "Amount", "Filled", "Status"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderHistory.map((o) => (
                  <tr key={o.id} className="border-t border-white/5 text-[#BFC2C7]">
                    <td className="px-2 py-1.5">{o.date}</td>
                    <td className="px-2 py-1.5">{o.pair}</td>
                    <td className="px-2 py-1.5">{o.type}</td>
                    <td className="px-2 py-1.5">{o.side}</td>
                    <td className="px-2 py-1.5">{o.price.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{o.amount.toFixed(3)}</td>
                    <td className="px-2 py-1.5">{o.filled.toFixed(3)}</td>
                    <td className="px-2 py-1.5">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            empty
          )
        ) : null}

        {active === "tradeHistory" ? (
          tradeHistory.length ? (
            <table className="min-w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <tr>
                  {["Date", "Pair", "Side", "Price", "Amount", "Fee", "Realized Pnl"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tradeHistory.map((t) => (
                  <tr key={t.id} className="border-t border-white/5 text-[#BFC2C7]">
                    <td className="px-2 py-1.5">{t.date}</td>
                    <td className="px-2 py-1.5">{t.pair}</td>
                    <td className="px-2 py-1.5">{t.side}</td>
                    <td className="px-2 py-1.5">{t.price.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{t.amount.toFixed(3)}</td>
                    <td className="px-2 py-1.5">{t.fee.toFixed(4)} {t.feeAsset}</td>
                    <td className={`px-2 py-1.5 ${t.realizedPnl >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{t.realizedPnl.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            empty
          )
        ) : null}

        {active === "transactionHistory" ? (
          transactionHistory.length ? (
            <table className="min-w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <tr>
                  {["Date", "Type", "Amount", "Asset", "Symbol", "Info"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactionHistory.map((t) => (
                  <tr key={t.id} className="border-t border-white/5 text-[#BFC2C7]">
                    <td className="px-2 py-1.5">{t.date}</td>
                    <td className="px-2 py-1.5">{t.type}</td>
                    <td className="px-2 py-1.5">{t.amount.toFixed(4)}</td>
                    <td className="px-2 py-1.5">{t.asset}</td>
                    <td className="px-2 py-1.5">{t.symbol ?? "-"}</td>
                    <td className="px-2 py-1.5">{t.info ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            empty
          )
        ) : null}

        {active === "positionHistory" ? (positionHistory.length ? <pre className="p-2 text-[11px] text-[#BFC2C7]">{JSON.stringify(positionHistory, null, 2)}</pre> : empty) : null}
        {active === "bots" ? (botsHistory.length ? <pre className="p-2 text-[11px] text-[#BFC2C7]">{JSON.stringify(botsHistory, null, 2)}</pre> : empty) : null}
        {active === "assets" ? (
          assetsHistory.length ? (
            <table className="min-w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <tr>
                  {["Asset", "Available", "Total"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assetsHistory.map((a) => (
                  <tr key={a.asset} className="border-t border-white/5 text-[#BFC2C7]">
                    <td className="px-2 py-1.5">{a.asset}</td>
                    <td className="px-2 py-1.5">{a.available.toFixed(6)}</td>
                    <td className="px-2 py-1.5">{a.total.toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            empty
          )
        ) : null}
      </div>
    </section>
  );
};
