"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Animate, Stagger } from "@/components/ui/animate";
import { AppShell } from "@/components/layout/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/use-auth-session";
import { checkout } from "@/lib/billing-client";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    price: 19,
    tagline: "For one clear path",
    features: ["Full plan for 1 country", "Best visa recommendation", "Step-by-step roadmap", "Cost estimate", "Timeline estimate", "Document checklist"],
    popular: false,
  },
  {
    key: "plus",
    name: "Plus",
    price: 29,
    tagline: "For comparing options",
    features: ["Everything in Starter", "3 country comparisons", "Multiple visa alternatives", "Deeper analysis", "Expanded document guidance", "Better case preparation"],
    popular: true,
  },
  {
    key: "premium",
    name: "Premium",
    price: 49,
    tagline: "Full strategic experience",
    features: ["Everything in Plus", "Full strategic recommendation", "Priority AI guidance", "Advanced action plan", "Full path comparison", "Premium dashboard"],
    popular: false,
  },
];

export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/analysis";
  const { session } = useAuthSession();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(planKey: string) {
    if (!session?.accessToken) {
      router.push(`/sign-up?next=${encodeURIComponent(`/pricing?next=${next}`)}`);
      return;
    }
    setError(null);
    setLoadingPlan(planKey);
    const res = await checkout(session.accessToken, planKey);
    setLoadingPlan(null);
    if (!res.ok) {
      setError(res.errorMessage ?? "Checkout failed");
      return;
    }
    if (res.data.checkout_url) {
      window.location.href = res.data.checkout_url;
      return;
    }
    // Demo mode — already upgraded
    router.push(next);
  }

  return (
    <AppShell>
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-content px-6 md:px-10">
          <Animate animation="fade-up" duration={700}>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-accent">Simple pricing</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
                Find the plan that fits your journey
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                One-time payment. Unlock your full personalized immigration plan.
              </p>
            </div>
          </Animate>

          {/* Paid plans */}
          <Stagger
            className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-3 items-stretch"
            childClassName="h-full"
            animation="fade-up"
            staggerDelay={100}
            duration={600}
          >
            {PLANS.map((plan) => (
              <div
                key={plan.key}
                className={cn(
                  "relative flex h-full flex-col rounded-2xl border p-6",
                  plan.popular
                    ? "border-accent bg-accent/[0.03] shadow-glow"
                    : "border-line bg-white/60"
                )}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">
                    Best value
                  </span>
                )}
                <p className="text-lg font-semibold text-ink">{plan.name}</p>
                <p className="mt-1 text-xs text-muted">{plan.tagline}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">${plan.price}</p>
                <p className="text-xs text-muted">one-time</p>

                <div className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-sm text-ink/70">
                      <span className="mt-0.5 text-green">&#10003;</span>
                      {f}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleSelect(plan.key)}
                  disabled={loadingPlan !== null}
                  className={cn(
                    buttonVariants({ size: "lg", variant: plan.popular ? "primary" : "secondary" }),
                    "mt-5 w-full disabled:opacity-60"
                  )}
                >
                  {loadingPlan === plan.key ? "Redirecting…" : `Get ${plan.name}`}
                </button>
              </div>
            ))}
          </Stagger>

          {error ? (
            <p className="mt-6 text-center text-sm text-red">{error}</p>
          ) : null}

          {/* Bottom note */}
          <Animate animation="fade-in" delay={400} duration={500}>
            <p className="mt-10 text-center text-sm text-muted">
              No subscriptions. Pay once, unlock your full plan. 30-day money-back guarantee.
            </p>
          </Animate>
        </div>
      </section>
    </AppShell>
  );
}
