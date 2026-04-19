"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useState } from "react";

import { Animate, Stagger } from "@/components/ui/animate";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getProfileAnalysis } from "@/lib/analysis-client";
import { checkout, getBillingStatus, verifyUpgrade } from "@/lib/billing-client";
import { cn } from "@/lib/utils";
import type { ProfileAnalysisResult } from "@/types/analysis";

type Status = "loading" | "ready" | "error";

const MATCH_COLORS = {
  high: { score: "text-green", badge: "bg-green/10 text-green", border: "border-green/25", card: "from-green/[0.06] to-transparent", ring: "bg-green/[0.08] ring-1 ring-green/20", bar: "bg-green", label: "Strong match" },
  medium: { score: "text-accent", badge: "bg-accent/10 text-accent", border: "border-accent/25", card: "from-accent/[0.05] to-transparent", ring: "bg-accent/[0.07] ring-1 ring-accent/20", bar: "bg-accent", label: "Possible match" },
  low: { score: "text-muted", badge: "bg-ink/5 text-muted", border: "border-line/70", card: "from-ink/[0.02] to-transparent", ring: "bg-ink/[0.04] ring-1 ring-line", bar: "bg-muted/40", label: "Needs work" },
};

const SEVERITY_COLORS = {
  high: { bg: "bg-red/[0.07] border border-red/15", dot: "bg-red", icon: "⚠️", label: "High priority" },
  medium: { bg: "bg-amber/[0.07] border border-amber/15", dot: "bg-amber", icon: "⚡", label: "Worth addressing" },
  low: { bg: "bg-ink/[0.04] border border-line/60", dot: "bg-muted", icon: "ℹ️", label: "Minor factor" },
};

// Brief descriptions of common visa types shown to all users
const VISA_INFO: Record<string, string> = {
  "H-1B": "Specialty occupation visa for skilled professionals sponsored by a US employer. Requires at least a bachelor's degree in a relevant field.",
  "DV Lottery": "Diversity Visa program — an annual lottery that awards 50,000 green cards to applicants from underrepresented countries.",
  "EB-1": "Employment-based green card for individuals with extraordinary ability, outstanding professors, or multinational executives.",
  "EB-2 NIW": "Green card for professionals with advanced degrees or exceptional ability who can prove their work benefits the United States.",
  "EB-3": "Employment-based green card for skilled workers, professionals, and other workers with a permanent US job offer.",
  "O-1": "Visa for individuals with extraordinary ability or achievement in their field — science, arts, education, business, or athletics.",
  "L-1": "Intracompany transfer visa for managers, executives, or specialized employees moving to a US branch of their company.",
  "E-2": "Treaty investor visa allowing nationals of treaty countries to invest in and manage a US business.",
  "F-1": "Academic student visa for full-time study at a US university, college, or accredited academic institution.",
  "B-1/B-2": "Temporary visitor visa for business meetings (B-1) or tourism and medical treatment (B-2).",
  "TN Visa": "NAFTA/USMCA professional visa for Canadian and Mexican citizens in specific professional categories.",
  "Express Entry": "Canada's points-based immigration system for skilled workers. Score is based on age, education, work experience, and language skills.",
  "Skilled Worker": "Points-based visa for skilled professionals. Eligibility assessed on qualifications, experience, and language ability.",
  "Global Talent": "Fast-track visa for exceptional talent in tech, science, arts, and humanities sponsored by a recognized organization.",
  "Startup Visa": "Visa for entrepreneurs launching innovative businesses with backing from accredited investors or business incubators.",
  "Student Visa": "Visa for international students accepted to an accredited educational institution.",
  "Work Permit": "Authorization to work legally in the destination country, typically tied to a job offer or specific occupation.",
};

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    price: 19,
    tagline: "A clear starting point",
    description: "Best if you want to understand your options before committing.",
    features: ["Full plan for 1 country", "Best visa recommendation", "Detailed eligibility breakdown", "Top path explanation", "Basic next steps"],
    popular: false,
    cta: "See My Best Path",
  },
  {
    key: "plus",
    name: "Plus",
    price: 29,
    tagline: "Your complete action plan",
    description: "Best if you want a full roadmap and everything you need to start moving.",
    features: ["Everything in Starter", "Step-by-step roadmap", "Cost estimate", "Timeline estimate", "Document checklist", "3 country comparisons"],
    popular: true,
    cta: "Unlock My Full Plan",
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

const ADVISOR_MESSAGE = "You may not be in your strongest position yet — and that is okay. Many immigration journeys begin with a profile that needs improvement in a few key areas. What matters most is knowing which options are still realistic, which weaknesses can be addressed, and what steps are worth taking next. Unlock your roadmap to see where to focus first.";

const LOCKED_ITEMS = [
  {
    title: "Your personalized roadmap",
    description: "A practical step-by-step path built around your specific profile",
  },
  {
    title: "Expected costs",
    description: "Understand filing, legal, and relocation costs before you commit",
  },
  {
    title: "Document checklist",
    description: "Know exactly what to prepare — and what can wait",
  },
  {
    title: "Risk review",
    description: "Spot weak points early and avoid wasting time on the wrong path",
  },
];

const TIER_ORDER = ["free", "starter", "plus", "premium"];

export function AIAnalysisPage() {
  const searchParams = useSearchParams();
  const upgraded = searchParams.get("upgraded") === "true";
  const canceled = searchParams.get("canceled") === "true";
  // Plan user had selected before canceling checkout (passed in cancel_url)
  const canceledPlan = searchParams.get("plan") ?? "";
  const { session, status: authStatus } = useAuthSession();
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
    if (!session?.accessToken) return;
    const token = session.accessToken;

    const init = async () => {
      // If Stripe redirected back after payment, verify the session and upgrade plan if paid
      if (upgraded) {
        await verifyUpgrade(token);
      }
      const [billingRes] = await Promise.all([
        getBillingStatus(token),
        handleLoadAnalysis(),
      ]);
      if (billingRes.ok) setCurrentPlan(billingRes.data.plan);
    };

    void init();
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
  if (!session && authStatus !== "loading") {
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

  // Loading (auth resolving or analysis fetching)
  if (authStatus === "loading" || status === "loading") {
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
  // If user canceled a checkout, treat the canceled plan as the minimum already "seen"
  const canceledTierIdx = TIER_ORDER.indexOf(canceledPlan);
  const effectiveTierIdx = Math.max(currentTierIdx, canceledTierIdx);
  const upsellPlans = PLANS.filter((p) => TIER_ORDER.indexOf(p.key) > effectiveTierIdx);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:py-14">

      {/* HEADER */}
      <Animate animation="fade-up" duration={600}>
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.07] px-3.5 py-1 text-xs font-semibold text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent anim-breathe" />
            {isPremium ? "Full immigration plan ready" : "Analysis complete"}
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink md:text-[2.6rem] md:leading-[1.15]">
            {isPremium ? "Your full immigration plan" : "Here\u2019s what we found for you."}
          </h1>
          {!isPremium && visa_matches.length > 0 && (
            <p className="mt-2 text-base text-muted">
              We evaluated {visa_matches.length} visa paths against your profile.
            </p>
          )}
        </div>
      </Animate>

      {/* ABOUT YOU */}
      <Animate animation="fade-up" delay={100} duration={600}>
        <div className="mt-8 glass-card rounded-2xl p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">Your profile</p>
              <p className="mt-2 text-lg leading-relaxed text-ink">{profile_summary.text}</p>
            </div>
            {profile_summary.target_country && (
              <div className="shrink-0 rounded-xl border border-accent/15 bg-accent/[0.06] px-3 py-2 text-right">
                <p className="text-[10px] font-medium uppercase tracking-wide text-accent/70">Target</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{profile_summary.target_country}</p>
              </div>
            )}
          </div>
        </div>
      </Animate>


      {/* TOP MATCHES */}
      {visa_matches.length > 0 && (
        <>
          <Animate animation="fade-up" delay={300} duration={600}>
            <h2 className="mt-10 text-xl font-semibold tracking-tight text-ink">
              {isPremium ? "Your best immigration paths" : "Top matches"}
            </h2>
          </Animate>

          <Stagger className="mt-4 space-y-3" animation="fade-up" staggerDelay={120} duration={500}>
            {visa_matches.map((match) => {
              const c = MATCH_COLORS[match.match_level];
              const info = match.description ?? VISA_INFO[match.visa_type];
              return (
                <div key={match.visa_type} className={cn(
                  "group relative overflow-hidden rounded-2xl border-2 bg-gradient-to-br p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg",
                  c.border, c.card
                )}>
                  <div className="flex items-start gap-4">
                    {/* Score badge */}
                    <div className={cn("flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl", c.ring)}>
                      <p className={cn("text-[1.6rem] font-black tabular-nums leading-none", c.score)}>{match.match_score}%</p>
                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-muted/70">match</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-ink">{match.visa_type}</h3>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", c.badge)}>{c.label}</span>
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-muted">{match.country}</p>
                      {info && (
                        <p className="mt-2 text-sm leading-relaxed text-ink/65">{info}</p>
                      )}
                    </div>
                  </div>
                  {/* Animated progress bar */}
                  <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                    <div
                      className={cn("h-full rounded-full", c.bar)}
                      style={{ width: `${Math.max(match.match_score, 3)}%`, transition: "width 1.2s ease-out" }}
                    />
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
          {isPremium ? (
            <div className="mt-8 rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.07] to-transparent p-6">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-accent">Our recommendation</p>
              <p className="mt-3 text-base leading-relaxed text-ink">{recommendation.reason}</p>
            </div>
          ) : (
            <div className="relative mt-8 overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.04] to-transparent p-6">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-accent">Best path preview</p>
              <p className="mt-3 text-base leading-relaxed text-ink">{recommendation.reason}</p>
              {/* Blurred teaser row */}
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-accent/10 bg-white/60 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">1</div>
                <div className="flex-1">
                  <div className="h-2.5 w-2/3 rounded-full bg-ink/10 blur-[3px]" />
                  <div className="mt-1.5 h-2 w-1/2 rounded-full bg-ink/7 blur-[3px]" />
                </div>
                <span className="text-muted/50">🔒</span>
              </div>
              <p className="mt-3 text-xs text-muted/60 text-center">Upgrade to see your personalized step-by-step plan</p>
            </div>
          )}
        </Animate>
      )}

      {/* CHALLENGES */}
      {challenges.length > 0 && (
        <Animate animation="fade-up" delay={550} duration={600}>
          <div className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-ink">
                {isPremium ? "Areas to be aware of" : "What may need improvement"}
              </h2>
              <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-muted">
                {challenges.length} factor{challenges.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {challenges.map((ch) => {
                const c = SEVERITY_COLORS[ch.severity];
                return (
                  <div key={ch.title} className={cn("rounded-xl p-4", c.bg)}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-base leading-none">{c.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-ink">{ch.title}</p>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted/60">{c.label}</span>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-ink/60">{ch.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Animate>
      )}

      {/* ADVISOR NOTE — shown after challenges for free users, before paywall */}
      {!isPremium && upsellPlans.length > 0 && (
        <Animate animation="fade-up" delay={650} duration={600}>
          <div className="mt-8 rounded-2xl border border-accent/15 bg-accent/[0.04] p-6 md:p-7">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">Advisor note</p>
            <p className="mt-3 text-base leading-relaxed text-ink">{ADVISOR_MESSAGE}</p>
          </div>
        </Animate>
      )}

      {/* ============ PREMIUM CONTENT (only for paid users) ============ */}
      {isPremium && result.premium_roadmap && (
        <Animate animation="fade-up" delay={650} duration={700}>
          <div className="mt-10">
            <h2 className="text-xl font-semibold tracking-tight text-ink">Your step-by-step roadmap</h2>
            <div className="mt-5">
              {result.premium_roadmap.map((step, idx) => (
                <div key={step.step} className="relative flex gap-4">
                  {/* Connector line */}
                  {idx < result.premium_roadmap!.length - 1 && (
                    <div className="absolute left-4 top-10 bottom-0 w-px bg-line" />
                  )}
                  <div className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm", step.status === "done" ? "bg-green" : "bg-accent")}>
                    {step.status === "done" ? "✓" : step.step}
                  </div>
                  <div className={cn("mb-4 flex-1 rounded-xl border p-4", step.status === "done" ? "border-green/20 bg-green/[0.04]" : "border-line bg-white/60")}>
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
                  <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", doc.required ? "bg-accent/10 text-accent" : "bg-ink/5 text-muted")}>
                    {doc.required ? "✓" : "–"}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {doc.document}
                      {doc.required && <span className="ml-2 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">Required</span>}
                    </p>
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
        <Animate animation="scale-in" delay={700} duration={800}>
          <div className="mt-10">
            {/* Locked benefit mini-cards */}
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
              Your preview shows the direction. Your full plan shows what to do next.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {LOCKED_ITEMS.map((item) => (
                <div key={item.title} className="flex items-start gap-3 rounded-xl border border-line bg-white/50 p-4">
                  <span className="mt-0.5 text-base leading-none">🔒</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Upsell bridge */}
            <div className="mt-10 text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">
                Turn this result into a real plan
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-muted">
                See the best path to focus on, the steps that matter most, and what to improve next.
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
