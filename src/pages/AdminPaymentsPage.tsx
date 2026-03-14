import { useEffect, useState } from "react";
import { deleteAdminPlan, fetchAdminPlans, upsertAdminPlan, type PlanDto } from "../services/paymentsApi";
import { getTokenCreatorConfig, updateTokenCreatorConfig, type TokenCreatorFeeConfig } from "../services/tokenCreatorApi";

const parseFeatures = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);

export default function AdminPaymentsPage() {
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [error, setError] = useState("");
  const [feeConfig, setFeeConfig] = useState<TokenCreatorFeeConfig | null>(null);
  const [form, setForm] = useState({ id: "", name: "", priceUsdt: 0, durationDays: 30, featuresText: "Bitrium Quant Engine", enabled: true });

  const load = async () => {
    try {
      const res = await fetchAdminPlans();
      setPlans(res.plans);
      const cfg = await getTokenCreatorConfig();
      setFeeConfig(cfg.config);
      setError("");
    } catch (err: any) {
      setError(err?.message ?? "Load failed");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertAdminPlan({
        id: form.id || undefined,
        name: form.name,
        priceUsdt: Number(form.priceUsdt),
        durationDays: Number(form.durationDays),
        features: parseFeatures(form.featuresText),
        enabled: form.enabled,
      });
      setForm({ id: "", name: "", priceUsdt: 0, durationDays: 30, featuresText: "", enabled: true });
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Save failed");
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] p-6 text-[var(--textMuted)]">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panel)] p-4">
          <h1 className="text-xl font-semibold text-[var(--text)]">Admin · Plans</h1>
          <p className="text-xs">Edit subscription plans (USDT TRC20).</p>
        </section>

        <section className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panel)] p-4">
          <form onSubmit={submit} className="grid gap-2 md:grid-cols-2">
            <input placeholder="Plan name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)]" />
            <input type="number" step="0.01" placeholder="Price USDT" value={form.priceUsdt} onChange={(e) => setForm((p) => ({ ...p, priceUsdt: Number(e.target.value) }))} className="rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)]" />
            <input type="number" placeholder="Duration days" value={form.durationDays} onChange={(e) => setForm((p) => ({ ...p, durationDays: Number(e.target.value) }))} className="rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)]" />
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))} /> Enabled</label>
            <textarea placeholder="Features (one per line)" value={form.featuresText} onChange={(e) => setForm((p) => ({ ...p, featuresText: e.target.value }))} className="md:col-span-2 min-h-24 rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)]" />
            <button type="submit" className="md:col-span-2 rounded border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--accent)]">Save plan</button>
          </form>
          {error ? <p className="mt-2 text-xs text-[#d6b3af]">{error}</p> : null}
        </section>

        <section className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panel)] p-4">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--textMuted)]">
              <tr>
                <th>Name</th><th>Price</th><th>Days</th><th>Enabled</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-t border-[var(--borderSoft)]">
                  <td className="py-2">{p.name}</td>
                  <td>{p.priceUsdt} USDT</td>
                  <td>{p.durationDays}</td>
                  <td>{p.enabled ? "Yes" : "No"}</td>
                  <td>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setForm({ id: p.id, name: p.name, priceUsdt: p.priceUsdt, durationDays: p.durationDays, featuresText: p.features.join("\n"), enabled: p.enabled })} className="rounded border border-[var(--borderSoft)] px-2 py-1 text-xs">Edit</button>
                      <button type="button" onClick={async () => { await deleteAdminPlan(p.id); await load(); }} className="rounded border border-[#704844] bg-[#271a19] px-2 py-1 text-xs text-[#d6b3af]">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panel)] p-4 space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text)]">Token Creator Pricing (Bitrium Payments)</h2>
          {feeConfig ? (
            <>
              <div className="grid gap-2 md:grid-cols-3">
                <label className="text-xs">
                  Base fee
                  <input
                    type="number"
                    step="0.01"
                    value={feeConfig.baseFeeUsdt}
                    onChange={(e) => setFeeConfig((p) => (p ? { ...p, baseFeeUsdt: Number(e.target.value) } : p))}
                    className="mt-1 w-full rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-2 py-1.5 text-sm text-[var(--text)]"
                  />
                </label>
                <label className="text-xs">
                  Network reserve
                  <input
                    type="number"
                    step="0.01"
                    value={feeConfig.networkReserveUsdt}
                    onChange={(e) => setFeeConfig((p) => (p ? { ...p, networkReserveUsdt: Number(e.target.value) } : p))}
                    className="mt-1 w-full rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-2 py-1.5 text-sm text-[var(--text)]"
                  />
                </label>
                <label className="text-xs">
                  Custom decimals surcharge
                  <input
                    type="number"
                    step="0.01"
                    value={feeConfig.decimalsSurchargeUsdt}
                    onChange={(e) => setFeeConfig((p) => (p ? { ...p, decimalsSurchargeUsdt: Number(e.target.value) } : p))}
                    className="mt-1 w-full rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-2 py-1.5 text-sm text-[var(--text)]"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!feeConfig) return;
                  try {
                    const next = await updateTokenCreatorConfig(feeConfig);
                    setFeeConfig(next.config);
                    setError("");
                  } catch (err: any) {
                    setError(err?.message ?? "Token creator pricing save failed");
                  }
                }}
                className="rounded border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--accent)]"
              >
                Save token creator pricing
              </button>
            </>
          ) : (
            <p className="text-xs">Loading config...</p>
          )}
        </section>
      </div>
    </main>
  );
}
