import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthToken } from "../services/authClient";
import { createInvoice, fetchPlans, type PlanDto } from "../services/paymentsApi";

const MEMBERSHIP_EXPIRES_KEY = "membership.expiresAt";

export default function PricingPage() {
  const nav = useNavigate();
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [err, setErr] = useState("");
  const [busyPlanId, setBusyPlanId] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchPlans();
        setPlans(res.plans.filter((p) => p.enabled));
        setErr("");
      } catch (error: any) {
        setErr(error?.message ?? "Failed to load plans");
      }
    };
    void load();
  }, []);

  const expiryRaw = typeof window !== "undefined" ? window.localStorage.getItem(MEMBERSHIP_EXPIRES_KEY) : null;
  const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
  const hasMembership = Boolean(expiryDate && !Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() > Date.now());
  const daysRemaining = hasMembership && expiryDate ? Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0;
  const expiryLabel = expiryDate ? expiryDate.toLocaleDateString("en-US") : "";

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-3 text-[#BFC2C7] md:p-4">
      <div className="mx-auto max-w-[1320px] space-y-4">
        <section className="rounded-xl border border-white/10 bg-[#121316] p-4 text-center md:p-5">
          <h1 className="text-2xl font-semibold text-white md:text-3xl">Upgrade Your Trading Experience</h1>
          <p className="mt-1.5 text-sm text-[#6B6F76]">Unlock premium features, unlimited AI trading bots, and priority support.</p>

          {hasMembership ? (
            <div className="mx-auto mt-4 max-w-xl rounded-lg border border-white/10 bg-[#0F1012] p-4">
              <p className="text-lg font-semibold text-[#F5C542]">You are a Premium Member</p>
              <p className="mt-1.5 text-sm text-[#9ba3b4]">Your subscription expires on: <span className="text-white">{expiryLabel}</span></p>
              <p className="mt-1 text-sm text-[#6B6F76]">({daysRemaining} days remaining)</p>
            </div>
          ) : null}
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <article key={plan.id} className="relative rounded-xl border border-white/10 bg-[#121316] p-4">
              {plan.durationDays === 180 || plan.durationDays >= 360 ? (
                <span className="premium-badge absolute right-2.5 top-0 -translate-y-1/2 rounded-md bg-[#F5C542] px-2 py-0.5 text-[10px] font-semibold uppercase text-black">
                  {plan.durationDays >= 360 ? "Best Value" : "Most Popular"}
                </span>
              ) : null}
              <h2 className="text-2xl font-semibold text-white">{plan.name}</h2>
              <p className="mt-1.5 text-4xl font-bold text-[#F5C542]">
                {plan.priceUsdt} USDT
                <span className="ml-1 text-lg font-normal text-[#6B6F76]">Toplam</span>
              </p>
              <p className="mt-1.5 text-base text-[#DDE1E8]">
                ({`Aylık: ${(plan.priceUsdt / Math.max(1, Math.round(plan.durationDays / 30))).toFixed(0)} USDT`})
              </p>

              <ul className="mt-4 space-y-1.5 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 text-[#F5C542]">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={async () => {
                  if (!getAuthToken()) {
                    nav("/login");
                    return;
                  }
                  try {
                    setBusyPlanId(plan.id);
                    const res = await createInvoice(plan.id);
                    nav(`/checkout/${res.invoice.id}`);
                  } catch (error: any) {
                    setErr(error?.message ?? "Invoice creation failed");
                  } finally {
                    setBusyPlanId("");
                  }
                }}
                className="mt-4 w-full rounded-lg border border-[#7a6840] bg-[#2b2417] px-3 py-2 text-sm font-semibold text-[#F5C542]"
              >
                {busyPlanId === plan.id ? "Creating invoice..." : hasMembership ? "Extend Subscription" : "Subscribe Now"}
              </button>
            </article>
          ))}
        </section>

        {err ? (
          <section className="mx-auto max-w-2xl rounded-xl border border-[#704844] bg-[#271a19] p-3 text-sm text-[#d6b3af]">
            {err}
          </section>
        ) : null}

        <section className="mx-auto max-w-2xl rounded-xl border border-white/10 bg-[#121316] p-3">
          <div className="grid gap-2.5 md:grid-cols-[1fr_180px]">
            <input
              type="text"
              placeholder="Enter referral code"
              className="rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6B6F76] focus:border-[#F5C542]/50"
            />
            <button type="button" className="rounded-lg bg-[#F5C542] px-3 py-2 text-sm font-semibold text-black">Redeem Code</button>
          </div>
        </section>
      </div>
    </main>
  );
}
