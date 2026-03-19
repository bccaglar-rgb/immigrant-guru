import { useState } from "react";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";
import { authHeaders } from "../../services/exchangeApi";

const cancelOrder = async (intentId: string): Promise<{ ok: boolean; message?: string }> => {
  try {
    const res = await fetch("/api/trade/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ intentId }),
    });
    const body = await res.json() as { ok: boolean; message?: string };
    return body;
  } catch {
    return { ok: false, message: "Network error" };
  }
};

const cancelAll = async (): Promise<{ ok: boolean; canceled?: number }> => {
  try {
    const res = await fetch("/api/trade/cancel-all", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({}),
    });
    const body = await res.json() as { ok: boolean; canceled?: number };
    return body;
  } catch {
    return { ok: false };
  }
};

export const OrdersTable = () => {
  const { openOrders, privateStreamStatus, activityLog } = useExchangeTerminalStore();
  const [tab, setTab] = useState<"open" | "history" | "trade">("open");
  const [cancelingIds, setCancelingIds] = useState<Set<string>>(new Set());
  const [cancelAllLoading, setCancelAllLoading] = useState(false);

  const handleCancel = async (intentId: string) => {
    setCancelingIds((prev) => new Set(prev).add(intentId));
    await cancelOrder(intentId);
    setCancelingIds((prev) => {
      const next = new Set(prev);
      next.delete(intentId);
      return next;
    });
  };

  const handleCancelAll = async () => {
    if (!openOrders.length) return;
    setCancelAllLoading(true);
    await cancelAll();
    setCancelAllLoading(false);
  };

  return (
    <section className="rounded-xl border border-white/10 bg-[#121316]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-sm">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setTab("open")} className={tab === "open" ? "border-b border-[#F5C542] pb-0.5 text-[#F5C542]" : "text-[#6B6F76]"}>
            Open Orders{openOrders.length > 0 ? `(${openOrders.length})` : ""}
          </button>
          <button type="button" onClick={() => setTab("history")} className={tab === "history" ? "border-b border-[#F5C542] pb-0.5 text-[#F5C542]" : "text-[#6B6F76]"}>Order History</button>
          <button type="button" onClick={() => setTab("trade")} className={tab === "trade" ? "border-b border-[#F5C542] pb-0.5 text-[#F5C542]" : "text-[#6B6F76]"}>Trade History</button>
        </div>
        {tab === "open" && openOrders.length > 0 && (
          <button
            type="button"
            disabled={cancelAllLoading}
            onClick={() => void handleCancelAll()}
            className="rounded border border-[#704844] bg-[#271a19] px-2 py-0.5 text-[10px] text-[#d6b3af] hover:opacity-80 transition disabled:opacity-40"
          >
            {cancelAllLoading ? "Canceling..." : "Cancel All"}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
              {["Date", "Pair", "Type", "Side", "Price", "Amount", "Filled", "Total", ""].map((h) => (
                <th key={h || "action"} className="px-2 py-1 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {openOrders.length === 0 && tab === "open" ? (
              <tr className="border-t border-white/5 text-xs text-[#6B6F76]">
                <td className="px-2 py-6 text-center" colSpan={9}>
                  {privateStreamStatus === "subscribing" ? "Connecting to exchange stream..."
                    : privateStreamStatus === "error" ? "Stream error — using REST fallback"
                    : privateStreamStatus === "disconnected" ? "Stream disconnected — reconnecting..."
                    : "No open orders"}
                </td>
              </tr>
            ) : null}
            {openOrders.map((o) => {
              const isCanceling = cancelingIds.has(o.id);
              const isPending = o.id.startsWith("pending-");
              return (
                <tr key={o.id} className={`border-t border-white/5 text-xs ${isCanceling ? "text-[#6B6F76] opacity-50" : isPending ? "text-[#8A8F98] animate-pulse" : "text-[#BFC2C7]"}`}>
                  <td className="px-2 py-1.5">{isPending ? "..." : o.date}</td>
                  <td className="px-2 py-1.5">{o.pair}</td>
                  <td className="px-2 py-1.5">{o.type}</td>
                  <td className={`px-2 py-1.5 ${o.side === "BUY" ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{o.side}</td>
                  <td className="px-2 py-1.5">{o.price.toFixed(3)}</td>
                  <td className="px-2 py-1.5">{o.amount.toFixed(1)}</td>
                  <td className="px-2 py-1.5">{o.filledPct}%</td>
                  <td className="px-2 py-1.5">{o.total.toFixed(2)} USDT</td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      disabled={isCanceling}
                      onClick={() => void handleCancel(o.id)}
                      className="rounded border border-[#704844] bg-[#271a19] px-2 py-0.5 text-[10px] text-[#d6b3af] hover:opacity-80 transition disabled:opacity-40"
                    >
                      {isCanceling ? "..." : "Cancel"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Activity feed — last 3 events */}
      {activityLog.length > 0 && (
        <div className="border-t border-white/5 px-3 py-1.5">
          {activityLog.slice(0, 3).map((a, i) => (
            <div key={a.ts + i} className="flex items-center gap-2 text-[10px] text-[#6B6F76]">
              <span className={a.type === "order" ? "text-[#F5C542]" : a.type === "system" ? "text-blue-400" : "text-[#6B6F76]"}>
                {a.type === "order" ? "ORDER" : a.type === "position" ? "POS" : a.type === "balance" ? "BAL" : "SYS"}
              </span>
              <span>{a.message}</span>
              <span className="ml-auto">{new Date(a.ts).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
