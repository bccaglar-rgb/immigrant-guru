import { useEffect, useState } from "react";
import { getAuthToken } from "../services/authClient";

interface InvoiceDto {
  id: string;
  userId: string;
  planId: string;
  title: string;
  expectedAmountUsdt: number;
  paidAmountUsdt: number;
  depositAddress: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  paymentTxHash?: string;
}

const req = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "request_failed");
  return body as T;
};

const statusColor = (status: string) => {
  if (status === "paid") return "text-[#4caf50]";
  if (status === "awaiting_payment" || status === "created") return "text-[#F5C542]";
  if (status === "expired" || status === "failed") return "text-[#6B6F76]";
  if (status === "manual_review") return "text-[#f97316]";
  if (status === "partially_paid") return "text-[#f97316]";
  return "text-[#BFC2C7]";
};

export function PaymentReviewPanel() {
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [poolStatus, setPoolStatus] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [markingPaid, setMarkingPaid] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      const [invRes, poolRes] = await Promise.all([
        req<{ ok: true; invoices: InvoiceDto[] }>("/api/payments/invoices"),
        req<{ ok: true; pool: Record<string, number> }>("/api/payments/address-pool-status"),
      ]);
      setInvoices(invRes.invoices ?? []);
      setPoolStatus(poolRes.pool ?? {});
      setError("");
    } catch (err: any) {
      setError(err?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const handleManualPaid = async (invoiceId: string) => {
    const txHash = prompt("Enter TRON tx hash for manual confirmation:");
    if (!txHash?.trim()) return;
    setMarkingPaid(invoiceId);
    try {
      await req("/api/admin/payments/mark-paid", {
        method: "POST",
        body: JSON.stringify({ invoiceId, txHash: txHash.trim(), amountUsdt: 0, reason: "admin_manual" }),
      });
      await refresh();
    } catch (err: any) {
      alert(err?.message ?? "Mark paid failed");
    } finally {
      setMarkingPaid("");
    }
  };

  const pending = invoices.filter((i) => ["awaiting_payment", "created", "partially_paid"].includes(i.status));
  const review = invoices.filter((i) => i.status === "manual_review");
  const recent = invoices.filter((i) => ["paid", "expired", "failed"].includes(i.status)).slice(0, 20);

  return (
    <div className="space-y-4">
      {/* Address Pool Status */}
      <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
        <p className="mb-2 text-xs font-semibold text-white">Address Pool</p>
        <div className="flex gap-4 text-xs">
          {Object.entries(poolStatus).map(([status, count]) => (
            <span key={status}>
              <span className="text-[#6B6F76]">{status}:</span>{" "}
              <span className="font-semibold text-white">{count}</span>
            </span>
          ))}
        </div>
      </div>

      {loading && <p className="text-xs text-[#6B6F76]">Loading...</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Manual Review Required */}
      {review.length > 0 && (
        <div className="rounded-xl border border-[#f97316]/30 bg-[#1a1207] p-3">
          <p className="mb-2 text-xs font-semibold text-[#f97316]">Manual Review Required ({review.length})</p>
          <div className="space-y-2">
            {review.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0F1012] p-2 text-xs">
                <div>
                  <span className="font-mono text-[10px] text-[#6B6F76]">{inv.id.slice(0, 16)}</span>
                  <span className="ml-2 text-white">{inv.title}</span>
                  <span className="ml-2 text-[#F5C542]">{inv.expectedAmountUsdt} USDT</span>
                  <span className="ml-2 text-[#4caf50]">paid: {inv.paidAmountUsdt}</span>
                  {inv.paymentTxHash && <span className="ml-2 font-mono text-[10px] text-[#6B6F76]">tx: {inv.paymentTxHash.slice(0, 12)}...</span>}
                </div>
                <button
                  type="button"
                  disabled={markingPaid === inv.id}
                  onClick={() => handleManualPaid(inv.id)}
                  className="shrink-0 rounded bg-[#4caf50]/20 px-2 py-1 text-[10px] font-semibold text-[#4caf50] hover:bg-[#4caf50]/30 disabled:opacity-50"
                >
                  {markingPaid === inv.id ? "..." : "Confirm Paid"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Invoices */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
          <p className="mb-2 text-xs font-semibold text-white">Pending ({pending.length})</p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[#6B6F76]">
                <th className="pb-1 text-left font-medium">Invoice</th>
                <th className="pb-1 text-left font-medium">Plan</th>
                <th className="pb-1 text-right font-medium">Amount</th>
                <th className="pb-1 text-right font-medium">Paid</th>
                <th className="pb-1 text-center font-medium">Status</th>
                <th className="pb-1 text-right font-medium">Expires</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((inv) => (
                <tr key={inv.id} className="border-t border-white/5">
                  <td className="py-1 font-mono text-[10px]">{inv.id.slice(0, 12)}</td>
                  <td className="py-1">{inv.planId}</td>
                  <td className="py-1 text-right font-semibold">{inv.expectedAmountUsdt}</td>
                  <td className="py-1 text-right">{inv.paidAmountUsdt}</td>
                  <td className={`py-1 text-center font-semibold ${statusColor(inv.status)}`}>{inv.status}</td>
                  <td className="py-1 text-right text-[#6B6F76]">{new Date(inv.expiresAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Completed */}
      {recent.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
          <p className="mb-2 text-xs font-semibold text-white">Recent ({recent.length})</p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[#6B6F76]">
                <th className="pb-1 text-left font-medium">Invoice</th>
                <th className="pb-1 text-left font-medium">Plan</th>
                <th className="pb-1 text-right font-medium">Amount</th>
                <th className="pb-1 text-center font-medium">Status</th>
                <th className="pb-1 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((inv) => (
                <tr key={inv.id} className="border-t border-white/5">
                  <td className="py-1 font-mono text-[10px]">{inv.id.slice(0, 12)}</td>
                  <td className="py-1">{inv.planId ?? "-"}</td>
                  <td className="py-1 text-right font-semibold">{inv.paidAmountUsdt}/{inv.expectedAmountUsdt}</td>
                  <td className={`py-1 text-center font-semibold ${statusColor(inv.status)}`}>{inv.status}</td>
                  <td className="py-1 text-right text-[#6B6F76]">{new Date(inv.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" onClick={() => { setLoading(true); void refresh(); }} className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7] hover:text-white">
        Refresh
      </button>
    </div>
  );
}
