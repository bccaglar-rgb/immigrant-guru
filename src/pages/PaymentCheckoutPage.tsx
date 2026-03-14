import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getInvoice } from "../services/paymentsApi";

const fmtTimer = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export default function PaymentCheckoutPage() {
  const { invoiceId = "" } = useParams();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoice, setInvoice] = useState<any>(null);

  const refresh = async () => {
    try {
      const res = await getInvoice(invoiceId);
      setInvoice(res.invoice);
      setError("");
    } catch (err: any) {
      setError(err?.message ?? "Invoice load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      void refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [invoiceId]);

  const expiresInMs = useMemo(() => {
    if (!invoice?.expiresAt) return 0;
    return Date.parse(invoice.expiresAt) - Date.now();
  }, [invoice?.expiresAt, invoice?.updatedAt]);

  const qrUrl = useMemo(() => {
    if (!invoice) return "";
    const payload = `tron:${invoice.depositAddress}?amount=${invoice.expectedAmountUsdt}&token=USDT`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payload)}`;
  }, [invoice]);

  return (
    <main className="min-h-screen bg-[var(--bg)] p-6 text-[var(--textMuted)]">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--borderSoft)] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--accent)]">Bitrium Payments</p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--text)]">TRON USDT (TRC20) Payment</h1>
        <p className="mt-1 text-xs">Invoice-based deposit. Final activation after confirmations.</p>
        <p className="mt-1 text-[11px] text-[var(--textMuted)]">powered by Bitrium Labs</p>

        {loading ? <p className="mt-4 text-sm">Loading...</p> : null}
        {error ? <p className="mt-4 text-sm text-[#d6b3af]">{error}</p> : null}

        {invoice ? (
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="space-y-3 rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-4">
              <p className="text-sm">Amount: <span className="font-semibold text-[var(--text)]">{invoice.expectedAmountUsdt} USDT</span></p>
              <p className="text-sm">Item: <span className="font-semibold text-[var(--text)]">{invoice.title ?? "Payment invoice"}</span></p>
              <p className="text-sm">Address: <span className="font-mono text-[var(--text)]">{invoice.depositAddress}</span></p>
              <p className="text-sm">Status: <span className="font-semibold text-[var(--accent)]">{invoice.status}</span></p>
              <p className="text-sm">Paid: <span className="font-semibold text-[var(--text)]">{invoice.paidAmountUsdt} USDT</span></p>
              <p className="text-sm">Expires in: <span className="font-semibold text-[var(--text)]">{fmtTimer(expiresInMs)}</span></p>
              <div className="rounded border border-[var(--borderSoft)] bg-[var(--panel)] p-2 text-xs">
                Chain: TRON · Token: USDT (TRC20)
              </div>
              {invoice.status === "paid" ? (
                <button type="button" onClick={() => nav("/settings")} className="rounded border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--accent)]">Go to app</button>
              ) : null}
            </div>
            <div className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-3">
              {qrUrl ? <img src={qrUrl} alt="TRON payment QR" className="mx-auto rounded bg-white p-2" /> : null}
              <p className="mt-2 text-center text-[11px]">Scan with TRON wallet</p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
