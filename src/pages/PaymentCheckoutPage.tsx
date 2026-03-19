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
      // Stop polling for terminal states
      if (invoice?.status === "paid" || invoice?.status === "expired" || invoice?.status === "failed") return;
      void refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [invoiceId, invoice?.status]);

  const expiresInMs = useMemo(() => {
    if (!invoice?.expiresAt) return 0;
    return Date.parse(invoice.expiresAt) - Date.now();
  }, [invoice?.expiresAt, invoice?.updatedAt]);

  const qrUrl = useMemo(() => {
    if (!invoice) return "";
    // Use deposit address + exact amount for QR. Wallets parse the address directly.
    const payload = invoice.depositAddress;
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
              <div className="flex items-center gap-2">
                <p className="text-sm">Amount: <span className="font-semibold text-[var(--text)]">{invoice.expectedAmountUsdt} USDT</span></p>
                <button type="button" onClick={() => navigator.clipboard.writeText(String(invoice.expectedAmountUsdt))} className="shrink-0 rounded border border-white/10 bg-[var(--panel)] px-2 py-0.5 text-[10px] text-[var(--textMuted)] hover:text-white" title="Copy amount">Copy</button>
              </div>
              <p className="text-sm">Item: <span className="font-semibold text-[var(--text)]">{invoice.title ?? "Payment invoice"}</span></p>
              <div className="flex items-center gap-2">
                <p className="text-sm">Address:</p>
                <span className="font-mono text-xs text-[var(--text)] break-all">{invoice.depositAddress}</span>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(invoice.depositAddress); }}
                  className="shrink-0 rounded border border-white/10 bg-[var(--panel)] px-2 py-1 text-[10px] text-[var(--textMuted)] hover:text-white"
                  title="Copy address"
                >
                  Copy
                </button>
              </div>
              <p className="text-sm">Status: <span className={`font-semibold ${
                invoice.status === "paid" ? "text-[#4caf50]" :
                invoice.status === "expired" || invoice.status === "failed" ? "text-[#d6b3af]" :
                invoice.status === "partially_paid" ? "text-[#f97316]" :
                invoice.status === "manual_review" ? "text-[#f97316]" :
                "text-[var(--accent)]"
              }`}>{
                invoice.status === "awaiting_payment" ? "Awaiting Payment" :
                invoice.status === "partially_paid" ? "Partial Payment Received" :
                invoice.status === "paid" ? "Payment Confirmed" :
                invoice.status === "expired" ? "Invoice Expired" :
                invoice.status === "failed" ? "Payment Failed" :
                invoice.status === "manual_review" ? "Under Review" :
                invoice.status
              }</span></p>
              <p className="text-sm">Paid: <span className="font-semibold text-[var(--text)]">{invoice.paidAmountUsdt} USDT</span></p>
              <p className="text-sm">Expires in: <span className="font-semibold text-[var(--text)]">{fmtTimer(expiresInMs)}</span></p>
              <div className="rounded border border-[var(--borderSoft)] bg-[var(--panel)] p-2 text-xs">
                <span className="font-semibold text-[var(--accent)]">Network: TRON (TRC20)</span> · Token: USDT
              </div>
              <div className="rounded border border-[#704844] bg-[#271a19] p-2 text-[10px] text-[#d6b3af]">
                Send exactly <strong>{invoice.expectedAmountUsdt} USDT</strong> on the <strong>TRON (TRC20)</strong> network only. Sending on the wrong network (ERC20, BEP20, etc.) will result in permanent loss of funds.
              </div>
              {invoice.status === "paid" ? (
                <div className="space-y-2">
                  <div className="rounded border border-[#4caf50]/30 bg-[#162016] p-2 text-xs text-[#4caf50]">
                    Payment confirmed! Your subscription is now active.
                  </div>
                  <button type="button" onClick={() => nav("/quant-engine")} className="w-full rounded border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-2.5 text-sm font-semibold text-[var(--accent)] transition hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]">
                    Go to Bitrium Quant Engine
                  </button>
                </div>
              ) : invoice.status === "expired" ? (
                <div className="rounded border border-[#704844] bg-[#271a19] p-2 text-xs text-[#d6b3af]">
                  This invoice has expired. Please go back to pricing and create a new one.
                </div>
              ) : invoice.status === "manual_review" ? (
                <div className="rounded border border-[#7a6840] bg-[#2b2417] p-2 text-xs text-[#F5C542]">
                  Your payment is under review. It will be processed shortly.
                </div>
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
