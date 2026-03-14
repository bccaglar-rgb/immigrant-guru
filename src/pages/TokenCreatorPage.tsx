import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthToken } from "../services/authClient";
import {
  createTokenCreatorOrder,
  getTokenCreatorConfig,
  getTokenCreatorQuote,
  listMyTokenCreatorOrders,
  type TokenCreatorOrderInput,
} from "../services/tokenCreatorApi";

const panel = "rounded-xl border border-[var(--borderSoft)] bg-[var(--panel)]";
const input = "w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/60";

export default function TokenCreatorPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);

  const [form, setForm] = useState<TokenCreatorOrderInput>({
    name: "",
    symbol: "",
    decimals: 18,
    initialSupply: 1000000,
    totalSupply: 1000000,
    supplyType: "fixed",
    accessType: "none",
    transferType: "unstoppable",
    burnable: false,
    mintable: false,
    verifiedSource: true,
    erc1363: false,
    recoverable: false,
  });

  const load = async () => {
    try {
      setLoading(true);
      const [cfg, q] = await Promise.all([
        getTokenCreatorConfig(),
        getTokenCreatorQuote(form),
      ]);
      setQuote({
        ...q.quote,
        updatedAt: cfg.config.updatedAt,
      });
      if (getAuthToken()) {
        const mine = await listMyTokenCreatorOrders();
        setOrders(mine.orders ?? []);
      } else {
        setOrders([]);
      }
      setError("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load token creator");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const q = await getTokenCreatorQuote(form);
        setQuote((prev: any) => ({ ...(prev ?? {}), ...q.quote }));
      } catch {
        // keep last quote
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [form]);

  const topMessage = useMemo(
    () =>
      quote
        ? `Total fee: ${quote.totalUsdt?.toFixed?.(2) ?? quote.totalUsdt} USDT · Payment network: TRON (USDT TRC20)`
        : "Live quote loading...",
    [quote],
  );

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--textMuted)] md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className={`${panel} p-5 text-center`}>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--accent)]">Bitrium Payments</p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--text)] md:text-4xl">Create Your Token</h1>
          <p className="mt-2 text-sm text-[var(--textMuted)]">Deploy-ready token configuration with secure TRON USDT billing.</p>
          <p className="mt-2 text-sm text-[var(--accent)]">{topMessage}</p>
          <p className="mt-1 text-[11px] text-[var(--textMuted)]">powered by Bitrium Labs</p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_1fr_0.85fr]">
          <article className={`${panel} p-4`}>
            <h2 className="text-lg font-semibold text-[var(--text)]">Token Details</h2>
            <div className="mt-3 space-y-3">
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--textMuted)]">Token Name</span>
                <input className={input} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="My Token" />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--textMuted)]">Token Symbol</span>
                <input className={input} value={form.symbol} onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value.toUpperCase() }))} placeholder="MTK" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-sm">
                  <span className="text-[var(--textMuted)]">Decimals</span>
                  <input type="number" className={input} value={form.decimals} onChange={(e) => setForm((p) => ({ ...p, decimals: Number(e.target.value) }))} />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-[var(--textMuted)]">Initial Supply</span>
                  <input type="number" className={input} value={form.initialSupply} onChange={(e) => setForm((p) => ({ ...p, initialSupply: Number(e.target.value) }))} />
                </label>
              </div>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--textMuted)]">Total Supply</span>
                <input type="number" className={input} value={form.totalSupply} onChange={(e) => setForm((p) => ({ ...p, totalSupply: Number(e.target.value) }))} />
              </label>
            </div>
          </article>

          <article className={`${panel} p-4`}>
            <h2 className="text-lg font-semibold text-[var(--text)]">Token Features</h2>
            <div className="mt-3 space-y-3">
              <label className="block space-y-1 text-sm">
                <span>Supply Type</span>
                <select className={input} value={form.supplyType} onChange={(e) => setForm((p) => ({ ...p, supplyType: e.target.value as TokenCreatorOrderInput["supplyType"] }))}>
                  <option value="fixed">Fixed</option>
                  <option value="capped">Capped</option>
                  <option value="unlimited">Unlimited</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span>Access Type</span>
                <select className={input} value={form.accessType} onChange={(e) => setForm((p) => ({ ...p, accessType: e.target.value as TokenCreatorOrderInput["accessType"] }))}>
                  <option value="none">None</option>
                  <option value="ownable">Ownable</option>
                  <option value="role_based">Role Based</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span>Transfer Type</span>
                <select className={input} value={form.transferType} onChange={(e) => setForm((p) => ({ ...p, transferType: e.target.value as TokenCreatorOrderInput["transferType"] }))}>
                  <option value="unstoppable">Unstoppable</option>
                  <option value="pausable">Pausable</option>
                </select>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["verifiedSource", "Verified source"],
                  ["burnable", "Burnable"],
                  ["mintable", "Mintable"],
                  ["erc1363", "ERC1363"],
                  ["recoverable", "Token recover"],
                ].map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-2 rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-2.5 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean((form as any)[key])}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.checked } as TokenCreatorOrderInput))}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </article>

          <article className={`${panel} p-4`}>
            <h2 className="text-lg font-semibold text-[var(--text)]">Transaction</h2>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm">
                <span>Subtotal</span>
                <span className="font-semibold text-[var(--text)]">{quote ? `${quote.subtotalUsdt.toFixed(2)} USDT` : "-"}</span>
              </div>
              <div className="flex items-center justify-between rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm">
                <span>Network reserve</span>
                <span className="font-semibold text-[var(--text)]">{quote ? `${quote.networkReserveUsdt.toFixed(2)} USDT` : "-"}</span>
              </div>
              <div className="flex items-center justify-between rounded border border-[var(--accent)]/40 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-2 text-sm">
                <span className="text-[var(--accent)]">Total fee</span>
                <span className="font-semibold text-[var(--accent)]">{quote ? `${quote.totalUsdt.toFixed(2)} USDT` : "-"}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                disabled={submitting || loading}
                onClick={async () => {
                  if (!getAuthToken()) {
                    nav("/login");
                    return;
                  }
                  try {
                    setSubmitting(true);
                    setError("");
                    const created = await createTokenCreatorOrder(form);
                    nav(`/checkout/${created.invoice.id}`);
                  } catch (e: any) {
                    setError(e?.message ?? "Order create failed");
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="w-full rounded-lg border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-60"
              >
                {submitting ? "Creating invoice..." : "Create & Pay (TRON USDT)"}
              </button>
              <button type="button" onClick={() => void load()} className="w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm">
                Refresh
              </button>
            </div>
          </article>
        </section>

        <section className={`${panel} p-4`}>
          <h2 className="text-lg font-semibold text-[var(--text)]">My Token Orders</h2>
          {loading ? <p className="mt-2 text-sm">Loading...</p> : null}
          {!loading && !orders.length ? <p className="mt-2 text-sm text-[var(--textMuted)]">No token orders yet.</p> : null}
          {!!orders.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-left text-xs text-[var(--textMuted)]">
                  <tr>
                    <th className="pb-2">Token</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Total</th>
                    <th className="pb-2">Invoice</th>
                    <th className="pb-2">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--borderSoft)]">
                      <td className="py-2 text-[var(--text)]">{row.token?.name} ({row.token?.symbol})</td>
                      <td className="py-2">{row.status}</td>
                      <td className="py-2">{row.pricing?.totalUsdt?.toFixed?.(2)} USDT</td>
                      <td className="py-2">
                        {row.invoiceId ? (
                          <button type="button" className="rounded border border-[var(--borderSoft)] px-2 py-1 text-xs" onClick={() => nav(`/checkout/${row.invoiceId}`)}>
                            Open invoice
                          </button>
                        ) : "-"}
                      </td>
                      <td className="py-2 text-xs">{new Date(row.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        {error ? (
          <section className="rounded-xl border border-[#704844] bg-[#271a19] p-3 text-sm text-[#d6b3af]">{error}</section>
        ) : null}
      </div>
    </main>
  );
}
