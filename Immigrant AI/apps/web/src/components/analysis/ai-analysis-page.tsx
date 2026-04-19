"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useState } from "react";

import { Animate, Stagger } from "@/components/ui/animate";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getProfileAnalysis } from "@/lib/analysis-client";
import { checkout, getBillingStatus } from "@/lib/billing-client";
import { cn } from "@/lib/utils";
import type { ProfileAnalysisResult } from "@/types/analysis";

type Status = "loading" | "ready" | "error";

const MATCH_COLORS = {
  high: { bg: "bg-green/10", text: "text-green", border: "border-green/20", label: "High match" },
  medium: { bg: "bg-amber/10", text: "text-amber", border: "border-amber/20", label: "Medium match" },
  low: { bg: "bg-red/10", text: "text-red", border: "border-red/20", label: "Low match" },
};

const SEVERITY_COLORS = {
  high: { bg: "bg-red/8", dot: "bg-red" },
  medium: { bg: "bg-amber/8", dot: "bg-amber" },
  low: { bg: "bg-ink/5", dot: "bg-muted" },
};

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    price: 19,
    tagline: "A clear starting point",
    description: "Best if you want one realistic path and a simple action plan.",
    features: ["Full plan for 1 country", "Best visa recommendation", "Step-by-step roadmap", "Cost estimate", "Timeline estimate", "Document checklist"],
    popular: false,
    cta: "See My Next Steps",
  },
  {
    key: "plus",
    name: "Plus",
    price: 29,
    tagline: "Compare smarter options",
    description: "Best if you want to evaluate alternatives before making a decision.",
    features: ["Everything in Starter", "3 country comparisons", "Multiple visa alternatives", "Deeper analysis", "Expanded document guidance", "Better case preparation"],
    popular: true,
    cta: "Unlock My Best Strategy",
  },
  {
    key: "premium",
    name: "Premium",
    price: 49,
    tagline: "Your full strategic roadmap",
    description: "Best if you want the deepest guidance and the most complete plan.",
    features: ["Everything in Plus", "Full strategic recommendation", "Priority AI guidance", "Advanced action plan", "Full path comparison", "Premium dashboard"],
    popular: false,
    cta: "Build My Immigration Plan",
  },
];

const ADVISOR_MESSAGE = "Your current profile has some limitations, but that does not mean your options are closed. The right strategy is rarely about forcing the wrong visa — it is about understanding what can be improved, what is realistic today, and which steps move you closer to a path that actually fits you.";

const TIER_ORDER = ["free", "starter", "plus", "premium"];

export function AIAnalysisPage() {
  const searchParams = useSearchParams();
  const canceled = searchParams.get("canceled") === "true";
  const { session } = useAuthSession();
  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<ProfileAnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>("free");

  const loadAnalysis = useCallback(async () => {
    if (!session) return;
    setStatus("loading");
    const res = await getProfileAnalysis(session.accessToken);
    if (!res.ok) { setError(res.errorMessage); setStatus("error"); return; }
    setResult(res.data);
    setStatus("ready");
  }, [session]);

  const handleLoadAnalysis = useEffectEvent(async () => {
    await loadAnalysis();
  });

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }
    void handleLoadAnalysis();
    void getBillingStatus(session.accessToken).then((res) => {
      if (res.ok) setCurrentPlan(res.data.plan);
    });
  }, [session?.accessToken]);

  const handleUpgrade = useCallback(async (plan: string) => {
    if (!session) return;
    setUpgrading(plan);
    const res = await checkout(session.accessToken, plan);
    setUpgrading(null);
    if (!res.ok) {
      setError(res.errorMessage);
      setStatus("error");
      return;
    }

    const data = res.data;
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
      return;
    }

    void loadAnalysis();
  }, [session, loadAnalysis]);

  // Not logged in — redirect to sign-up
  if (!session && status !== "loading") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Sign in to see your analysis</h2>
        <p className="mt-3 text-base text-muted">Create a free account to get your personalized immigration analysis.</p>
        <div className="mt-6 flex gap-3">
          <a href="/sign-up" className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-hover">Start your plan</a>
          <a href="/sign-in" className="inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold text-accent ring-1 ring-accent/30 hover:bg-accent/5">Log in</a>
        </div>
      </div>
    );
  }

  // Loading
  if (status === "loading") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
        <div className="h-12 w-12 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
        <Animate animation="fade-up" delay={300} duration={600}>
          <h2 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Analyzing your profile...</h2>
          <p className="mt-2 text-base text-muted">Checking 47 visa categories against your background.</p>
        </Animate>
      </div>
    );
  }

  // Error
  if (status === "error" || !result) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Analysis could not load</h2>
        <p className="mt-3 text-base text-muted">{error || "Something went wrong."}</p>
        <Button className="mt-6" onClick={() => void loadAnalysis()} size="lg">Retry</Button>
      </div>
    );
  }

  const isPremium = result.is_premium === true;
  const { profile_summary, visa_matches, recommendation, challenges } = result;
  const currentTierIdx = TIER_ORDER.indexOf(currentPlan);
  const upsellPlans = PLANS.filter((p) => TIER_ORDER.indexOf(p.key) > currentTierIdx);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:py-14">

      {/* HEADER */}
      <Animate animation="fade-up" duration={600}>
        <div className="text-center">
          <p className="text-sm font-medium text-accent">Your first immigration analysis</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            {isPremium ? "Your full immigration plan" : "Here's what we found for you."}
          </h1>
        </div>
      </Animate>

      {/* ABOUT YOU */}
      <Animate animation="fade-up" delay={100} duration={600}>
        <div className="mt-8 glass-card rounded-2xl p-6 md:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">About you</p>
          <p className="mt-3 text-lg leading-relaxed text-ink">{profile_summary.text}</p>
          {profile_summary.target_country && (
            <p className="mt-2 text-base text-muted">
              Target: <span className="font-medium text-ink">{profile_summary.target_country}</span>
            </p>
          )}
        </div>
      </Animate>

      {/* CANCELED CHECKOUT BANNER */}
      {!isPremium && canceled && (
        <Animate animation="fade-up" delay={150} duration={500}>
          <div className="mt-6 rounded-2xl border border-amber/20 bg-amber/5 p-5">
            <p className="text-sm font-semibold text-ink">No worries — you can continue whenever you&apos;re ready.</p>
            <p className="mt-1 text-sm text-muted">Your analysis is saved. Your plan is one click away when you want to unlock it.</p>
          </div>
        </Animate>
      )}

      {/* TOP MATCHES */}
      {visa_matches.length > 0 && (
        <>
          <Animate animation="fade-up" delay={300} duration={600}>
            <h2 className="mt-10 text-xl font-semibold tracking-tight text-ink">
              {isPremium ? "Your best immigration paths" : "Top matches"}
            </h2>
          </Animate>

          <Stagger className="mt-4 space-y-3" animation="fade-up" staggerDelay={100} duration={500}>
            {visa_matches.map((match) => {
              const colors = MATCH_COLORS[match.match_level];
              return (
                <div key={match.visa_type} className={cn("rounded-xl border p-5", colors.border, colors.bg)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-ink">{match.visa_type}</h3>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", colors.text, "bg-white/60")}>
                          {colors.label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted">{match.country}</p>
                      {isPremium && match.description && (
                        <p className="mt-2 text-sm leading-relaxed text-ink/60">{match.description}</p>
                      )}
                    </div>
                    <p className={cn("text-2xl font-semibold", colors.text)}>{match.match_score}%</p>
                  </div>
                </div>
              );
            })}
          </Stagger>
        </>
      )}

      {/* RECOMMENDATION */}
      {recommendation && (
        <Animate animation="fade-up" delay={450} duration={600}>
          <div className={cn("mt-8 rounded-2xl p-6", isPremium ? "border border-accent/15 bg-accent/5" : "bg-ink/[0.02] border border-line")}>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
              {isPremium ? "Our recommendation" : "Preview"}
            </p>
            <p className="mt-3 text-base leading-relaxed text-ink">{recommendation.reason}</p>
          </div>
        </Animate>
      )}

      {/* CHALLENGES */}
      {challenges.length > 0 && (
        <Animate animation="fade-up" delay={550} duration={600}>
          <div className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight text-ink">Things to watch</h2>
            <div className="mt-3 space-y-2">
              {challenges.map((ch) => {
                const c = SEVERITY_COLORS[ch.severity];
                return (
                  <div key={ch.title} className={cn("rounded-xl p-4", c.bg)}>
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", c.dot)} />
                      <p className="text-sm font-semibold text-ink">{ch.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-ink/55">{ch.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </Animate>
      )}

      {/* ============ PREMIUM CONTENT (only for paid users) ============ */}
      {isPremium && result.premium_roadmap && (
        <Animate animation="fade-up" delay={650} duration={700}>
          <div className="mt-10">
            <h2 className="text-xl font-semibold tracking-tight text-ink">Your step-by-step roadmap</h2>
            <div className="mt-4 space-y-3">
              {result.premium_roadmap.map((step) => (
                <div key={step.step} className="flex gap-4 rounded-xl border border-line bg-white/60 p-4">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white", step.status === "done" ? "bg-green" : "bg-accent")}>
                    {step.step}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">{step.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Animate>
      )}

      {isPremium && result.premium_costs && (
        <Animate animation="fade-up" delay={750} duration={600}>
          <div className="mt-8">
            <h2 className="text-xl font-semibold tracking-tight text-ink">Estimated costs</h2>
            <div className="mt-4 glass-card rounded-2xl p-6">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted">Filing fees</p><p className="mt-1 text-lg font-semibold text-ink">${result.premium_costs.filing}</p></div>
                <div><p className="text-xs text-muted">Legal fees</p><p className="mt-1 text-lg font-semibold text-ink">${result.premium_costs.legal}</p></div>
                <div><p className="text-xs text-muted">Medical</p><p className="mt-1 text-lg font-semibold text-ink">${result.premium_costs.medical}</p></div>
                <div><p className="text-xs text-muted">Other</p><p className="mt-1 text-lg font-semibold text-ink">${result.premium_costs.other}</p></div>
              </div>
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-sm text-muted">Total estimated range</p>
                <p className="mt-1 text-2xl font-semibold text-accent">
                  ${result.premium_costs.total_low?.toLocaleString()} — ${result.premium_costs.total_high?.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </Animate>
      )}

      {isPremium && result.premium_documents && (
        <Animate animation="fade-up" delay={850} duration={600}>
          <div className="mt-8">
            <h2 className="text-xl font-semibold tracking-tight text-ink">Document checklist</h2>
            <div className="mt-4 space-y-2">
              {result.premium_documents.map((doc) => (
                <div key={doc.document} className="flex items-start gap-3 rounded-xl border border-line bg-white/60 p-3.5">
                  <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs", doc.required ? "bg-accent/10 text-accent" : "bg-ink/5 text-muted")}>
                    {doc.required ? "!" : "?"}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">{doc.document} {doc.required && <span className="text-xs text-accent">(required)</span>}</p>
                    <p className="mt-0.5 text-xs text-muted">{doc.notes}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Animate>
      )}

      {/* ============ PAYWALL (only for non-premium / upsell-eligible users) ============ */}
      {!isPremium && upsellPlans.length > 0 && (
        <Animate animation="scale-in" delay={600} duration={800}>
          <div className="mt-12">
            {/* Advisor message */}
            <div className="rounded-2xl border border-accent/15 bg-accent/[0.04] p-6 md:p-7">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">Advisor note</p>
              <p className="mt-3 text-base leading-relaxed text-ink">{ADVISOR_MESSAGE}</p>
            </div>

            {/* Locked preview */}
            <div className="mt-6 rounded-2xl border border-line bg-white/40 p-6 text-center">
              <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
                {["Full roadmap", "Cost breakdown", "Document checklist", "Risk analysis"].map((item) => (
                  <div key={item} className="rounded-xl bg-ink/[0.03] px-4 py-3 text-sm text-muted">
                    {item} <span className="ml-1">🔒</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Upsell */}
            <div className="mt-8 text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">
                Unlock your personalized immigration roadmap
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-muted">
                Your next step is not guesswork — it is strategy. Choose the depth of guidance that fits you.
              </p>
            </div>

            {/* Pricing cards */}
            <div className={cn("mt-8 grid gap-4", upsellPlans.length === 1 ? "max-w-md mx-auto" : upsellPlans.length === 2 ? "md:grid-cols-2 max-w-2xl mx-auto" : "md:grid-cols-3")}>
              {upsellPlans.map((plan) => (
                <div
                  key={plan.key}
                  className={cn(
                    "relative flex flex-col rounded-2xl border p-6 transition-all",
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
                  <p className="text-sm font-semibold text-ink">{plan.name}</p>
                  <p className="mt-1 text-xs text-muted">{plan.tagline}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">
                    ${plan.price}
                  </p>
                  <p className="text-xs text-muted">one-time</p>
                  <p className="mt-3 text-sm leading-relaxed text-ink/70">{plan.description}</p>

                  <div className="mt-4 flex-1 space-y-2">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-start gap-2 text-sm text-ink/70">
                        <span className="mt-0.5 text-green">&#10003;</span>
                        {f}
                      </div>
                    ))}
                  </div>

                  <Button
                    className="mt-5 w-full"
                    variant={plan.popular ? "primary" : "secondary"}
                    onClick={() => void handleUpgrade(plan.key)}
                    disabled={upgrading !== null}
                  >
                    {upgrading === plan.key ? "Processing..." : plan.cta}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Animate>
      )}

      {/* BOTTOM CTA */}
      {isPremium && (
        <Animate animation="fade-up" delay={900} duration={700}>
          <div className="mt-12 rounded-3xl bg-gradient-dark p-8 text-center md:p-10">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Ready to start your case?</h2>
            <p className="mx-auto mt-3 max-w-md text-base text-white/50">
              Create your immigration case from your recommended path and start moving forward.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link className={cn(buttonVariants({ size: "lg", variant: "primary" }), "px-8 shadow-glow")} href="/dashboard/cases">
                Create your case
              </Link>
              <Link className="inline-flex h-12 items-center rounded-full px-6 text-base font-semibold text-white/70 ring-1 ring-inset ring-white/20 hover:bg-white/5 hover:text-white" href="/dashboard">
                Go to dashboard
              </Link>
            </div>
          </div>
        </Animate>
      )}
    </div>
  );
}
