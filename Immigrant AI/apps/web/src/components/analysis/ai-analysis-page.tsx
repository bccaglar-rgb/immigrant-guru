"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { useTranslations } from "next-intl";

import { Animate, Stagger } from "@/components/ui/animate";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getProfileAnalysis } from "@/lib/analysis-client";
import { fireConversionEvent } from "@/lib/ads-conversion";
import { checkout, getBillingStatus, verifyUpgrade } from "@/lib/billing-client";
import { cn } from "@/lib/utils";
import type { ProfileAnalysisResult } from "@/types/analysis";

type Status = "loading" | "ready" | "error";

type MatchLevel = "high" | "medium" | "low";
type Severity = "high" | "medium" | "low";

const MATCH_STYLES: Record<MatchLevel, {
  score: string; badge: string; border: string; card: string; ring: string; bar: string;
}> = {
  high: { score: "text-green", badge: "bg-green/10 text-green", border: "border-green/25", card: "from-green/[0.06] to-transparent", ring: "bg-green/[0.08] ring-1 ring-green/20", bar: "bg-green" },
  medium: { score: "text-accent", badge: "bg-accent/10 text-accent", border: "border-accent/25", card: "from-accent/[0.05] to-transparent", ring: "bg-accent/[0.07] ring-1 ring-accent/20", bar: "bg-accent" },
  low: { score: "text-muted", badge: "bg-ink/5 text-muted", border: "border-line/70", card: "from-ink/[0.02] to-transparent", ring: "bg-ink/[0.04] ring-1 ring-line", bar: "bg-muted/40" },
};

const SEVERITY_STYLES: Record<Severity, { bg: string; dot: string; icon: string }> = {
  high: { bg: "bg-red/[0.07] border border-red/15", dot: "bg-red", icon: "⚠️" },
  medium: { bg: "bg-amber/[0.07] border border-amber/15", dot: "bg-amber", icon: "⚡" },
  low: { bg: "bg-ink/[0.04] border border-line/60", dot: "bg-muted", icon: "ℹ️" },
};

const TIER_ORDER = ["free", "starter", "plus", "premium"];

export function AIAnalysisPage({ compact = false }: { compact?: boolean }) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const upgraded = searchParams.get("upgraded") === "true";

  const matchLabels: Record<MatchLevel, string> = {
    high: t("Strong match"),
    medium: t("Possible match"),
    low: t("Needs work"),
  };

  const severityLabels: Record<Severity, string> = {
    high: t("High priority"),
    medium: t("Worth addressing"),
    low: t("Minor factor"),
  };

  // Brief descriptions of common visa types shown to all users
  const visaInfo: Record<string, string> = {
    "H-1B": t("Specialty occupation visa for skilled professionals sponsored by a US employer — requires at least a bachelor's degree in a relevant field"),
    "DV Lottery": t("Diversity Visa program — an annual lottery that awards 50,000 green cards to applicants from underrepresented countries"),
    "EB-1": t("Employment-based green card for individuals with extraordinary ability, outstanding professors, or multinational executives"),
    "EB-2 NIW": t("Green card for professionals with advanced degrees or exceptional ability who can prove their work benefits the United States"),
    "EB-3": t("Employment-based green card for skilled workers, professionals, and other workers with a permanent US job offer"),
    "O-1": t("Visa for individuals with extraordinary ability or achievement in their field — science, arts, education, business, or athletics"),
    "L-1": t("Intracompany transfer visa for managers, executives, or specialized employees moving to a US branch of their company"),
    "E-2": t("Treaty investor visa allowing nationals of treaty countries to invest in and manage a US business"),
    "F-1": t("Academic student visa for full-time study at a US university, college, or accredited academic institution"),
    "B-1/B-2": t("Temporary visitor visa for business meetings (B-1) or tourism and medical treatment (B-2)"),
    "TN Visa": t("NAFTA/USMCA professional visa for Canadian and Mexican citizens in specific professional categories"),
    "Express Entry": t("Canada's points-based immigration system for skilled workers — score is based on age, education, work experience, and language skills"),
    "Skilled Worker": t("Points-based visa for skilled professionals — eligibility assessed on qualifications, experience, and language ability"),
    "Global Talent": t("Fast-track visa for exceptional talent in tech, science, arts, and humanities sponsored by a recognized organization"),
    "Startup Visa": t("Visa for entrepreneurs launching innovative businesses with backing from accredited investors or business incubators"),
    "Student Visa": t("Visa for international students accepted to an accredited educational institution"),
    "Work Permit": t("Authorization to work legally in the destination country, typically tied to a job offer or specific occupation"),
  };

  const plans = [
    {
      key: "starter",
      name: t("Starter"),
      price: 19,
      tagline: t("A clear starting point"),
      description: t("Best if you want to understand your options before committing"),
      features: [t("Full plan for 1 country"), t("Best visa recommendation"), t("Detailed eligibility breakdown"), t("Top path explanation"), t("Basic next steps")],
      popular: false,
      cta: t("See My Best Path"),
    },
    {
      key: "plus",
      name: t("Plus"),
      price: 29,
      tagline: t("Your complete action plan"),
      description: t("Best if you want a full roadmap and everything you need to start moving"),
      features: [t("Everything in Starter"), t("Step-by-step roadmap"), t("Cost estimate"), t("Timeline estimate"), t("Document checklist"), t("3 country comparisons")],
      popular: true,
      cta: t("Unlock My Full Plan"),
    },
    {
      key: "premium",
      name: t("Premium"),
      price: 49,
      tagline: t("Your full strategic roadmap"),
      description: t("Best if you want the deepest guidance and the most complete plan"),
      features: [t("Everything in Plus"), t("Full strategic recommendation"), t("Priority AI guidance"), t("Advanced action plan"), t("Full path comparison"), t("Premium dashboard")],
      popular: false,
      cta: t("Build My Immigration Plan"),
    },
  ];

  const advisorSections = [
    {
      icon: "📍",
      title: t("Where you stand — and why that's okay"),
      body: t("Not every profile is ready on the first assessment — your score reflects today's snapshot, not your ceiling. Most applicants who start in the mid-range reach qualifying status within 6–12 months by fixing two or three targeted gaps"),
    },
    {
      icon: "🌍",
      title: t("Pathways still open to you"),
      body: t("Skilled worker routes like US EB-2 NIW, Canada Express Entry, and Germany's Skilled Immigration Act reward strong professional profiles. Startup visas in Portugal, Netherlands, and UAE are accessible without a perfect history. Digital nomad visas in Spain, Greece, and Costa Rica have low barriers for remote workers. Family and spousal routes remain among the fastest options in the US, UK, and Australia"),
    },
    {
      icon: "🔧",
      title: t("What you can fix right now"),
      body: t("Language scores, credential recognition, work experience gaps, and reference letters are all addressable — a targeted 3–6 month preparation period can move a borderline profile into a strong qualifying range for multiple pathways simultaneously"),
    },
    {
      icon: "🗺️",
      title: t("Your next step"),
      body: t("Unlock your full roadmap to see a prioritized action plan, your top visa matches with likelihood scores, real cost estimates, and the exact documents to prepare first — personalized to your profile"),
    },
  ];

  const canceled = searchParams.get("canceled") === "true";
  // Plan user had selected before canceling checkout (passed in cancel_url)
  const canceledPlan = searchParams.get("plan") ?? "";
  const { session, status: authStatus } = useAuthSession();
  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<ProfileAnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>("free");
  const [showAllVisas, setShowAllVisas] = useState(false);

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
        const upgradeRes = await verifyUpgrade(token);
        if (upgradeRes.ok && upgradeRes.data.upgraded) {
          fireConversionEvent(upgradeRes.data.plan);
        }
      }
      const [billingRes] = await Promise.all([
        getBillingStatus(token),
        handleLoadAnalysis(),
      ]);
      if (billingRes.ok) setCurrentPlan(billingRes.data.plan);
    };

    void init();
  }, [session?.accessToken, upgraded]);

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
        <h2 className="text-2xl font-semibold tracking-tight text-ink">{t("Sign in to see your analysis")}</h2>
        <p className="mt-3 text-base text-muted">{t("Create a free account to get your personalized immigration analysis")}</p>
        <div className="mt-6 flex gap-3">
          <Link href="/sign-up" className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-hover">{t("Start your plan")}</Link>
          <Link href="/sign-in" className="inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold text-accent ring-1 ring-accent/30 hover:bg-accent/5">{t("Log in")}</Link>
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
          <h2 className="mt-6 text-2xl font-semibold tracking-tight text-ink">{t("Analyzing your profile")}</h2>
          <p className="mt-2 text-base text-muted">{t("Checking 47 visa categories against your background")}</p>
        </Animate>
      </div>
    );
  }

  // Error
  if (status === "error" || !result) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">{t("Analysis could not load")}</h2>
        <p className="mt-3 text-base text-muted">{error || t("Something went wrong")}</p>
        <Button className="mt-6" onClick={() => void loadAnalysis()} size="lg">{t("Retry")}</Button>
      </div>
    );
  }

  const isPremium = result.is_premium === true;
  const { profile_summary, visa_matches, recommendation, challenges } = result;
  const allCountryVisas = result.all_country_visas ?? [];
  const currentTierIdx = TIER_ORDER.indexOf(currentPlan);
  // If user canceled a checkout, treat the canceled plan as the minimum already "seen"
  const canceledTierIdx = TIER_ORDER.indexOf(canceledPlan);
  const effectiveTierIdx = Math.max(currentTierIdx, canceledTierIdx);
  const upsellPlans = plans.filter((p) => TIER_ORDER.indexOf(p.key) > effectiveTierIdx);

  return (
    <div className={cn("mx-auto max-w-3xl", compact ? "px-0 py-0" : "px-6 py-10 md:py-14")}>

      {/* HEADER */}
      <Animate animation="fade-up" duration={600}>
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.07] px-3.5 py-1 text-xs font-semibold text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent anim-breathe" />
            {isPremium ? t("Full immigration plan ready") : t("Analysis complete")}
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink md:text-[2.6rem] md:leading-[1.15]">
            {isPremium ? t("Your full immigration plan") : t("Here's what we found for you")}
          </h1>
          {!isPremium && visa_matches.length > 0 && (
            <p className="mt-2 text-base text-muted">
              {t("We evaluated {count} visa paths against your profile", { count: visa_matches.length })}
            </p>
          )}
        </div>
      </Animate>

      {/* ABOUT YOU */}
      <Animate animation="fade-up" delay={100} duration={600}>
        <div className="mt-8 glass-card rounded-2xl p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">{t("Your profile")}</p>
              <p className="mt-2 text-lg leading-relaxed text-ink">{profile_summary.text}</p>
            </div>
            {profile_summary.target_country && (
              <div className="shrink-0 rounded-xl border border-accent/15 bg-accent/[0.06] px-3 py-2 text-right">
                <p className="text-[10px] font-medium uppercase tracking-wide text-accent/70">{t("Target")}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{profile_summary.target_country}</p>
              </div>
            )}
          </div>
        </div>
      </Animate>


      {/* MATCHES — split into primary (top 3) and alternatives (next 5) */}
      {(() => {
        const sorted = [...visa_matches].sort((a, b) => b.match_score - a.match_score);
        const primary = sorted.slice(0, 3);
        const alternatives = sorted.slice(3, 8);

        const renderCard = (match: typeof sorted[number]) => {
          const c = MATCH_STYLES[match.match_level];
          const info = match.description ?? visaInfo[match.visa_type];
          return (
            <div key={match.visa_type} className={cn(
              "group relative overflow-hidden rounded-2xl border-2 bg-gradient-to-br p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg",
              c.border, c.card
            )}>
              <div className="flex items-start gap-4">
                <div className={cn("flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl", c.ring)}>
                  <p className={cn("text-[1.6rem] font-black tabular-nums leading-none", c.score)}>{match.match_score}%</p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-muted/70">{t("match")}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-ink">{match.visa_type}</h3>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", c.badge)}>{matchLabels[match.match_level]}</span>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-muted">{match.country}</p>
                  {info && (
                    <p className="mt-2 text-sm leading-relaxed text-ink/65">{info}</p>
                  )}
                </div>
              </div>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className={cn("h-full rounded-full", c.bar)}
                  style={{ width: `${Math.max(match.match_score, 3)}%`, transition: "width 1.2s ease-out" }}
                />
              </div>
            </div>
          );
        };

        return (
          <>
            {primary.length > 0 && (
              <>
                <Animate animation="fade-up" delay={300} duration={600}>
                  <div className="mt-10 flex items-baseline justify-between gap-3">
                    <h2 className="text-xl font-semibold tracking-tight text-ink">
                      {isPremium ? t("Your best immigration paths") : t("Your strongest paths")}
                    </h2>
                    <span className="text-xs font-medium text-muted">{t("Top {primary} of {total}", { primary: primary.length, total: sorted.length })}</span>
                  </div>
                </Animate>
                <Stagger className="mt-4 space-y-3" animation="fade-up" staggerDelay={120} duration={500}>
                  {primary.map(renderCard)}
                </Stagger>
              </>
            )}

            {alternatives.length > 0 && (
              <>
                <Animate animation="fade-up" delay={400} duration={600}>
                  <div className="mt-10">
                    <h2 className="text-xl font-semibold tracking-tight text-ink">{t("Other paths worth considering")}</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                      {t("Lower match scores today, but still viable — often a small profile change (more experience, a job offer, a sponsor) can move you into a qualifying range")}
                    </p>
                  </div>
                </Animate>
                <Stagger className="mt-4 space-y-3" animation="fade-up" staggerDelay={100} duration={500}>
                  {alternatives.map(renderCard)}
                </Stagger>
              </>
            )}
          </>
        );
      })()}

      {/* ALL VISA OPTIONS FOR TARGET COUNTRY */}
      {allCountryVisas.length > 0 && profile_summary.target_country && (
        <Animate animation="fade-up" delay={420} duration={600}>
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setShowAllVisas((v) => !v)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-accent/15 bg-accent/[0.04] p-4 text-left transition-all hover:border-accent/30 hover:bg-accent/[0.07] md:p-5"
              aria-expanded={showAllVisas}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">{t("Explore every path")}</p>
                <p className="mt-1 text-sm font-semibold text-ink md:text-base">
                  {t("See all {count} visa options for {country}", { count: allCountryVisas.length, country: profile_summary.target_country })}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted">
                  {t("Including paths you don't qualify for yet — and what to fix")}
                </p>
              </div>
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform duration-300",
                  showAllVisas && "rotate-180",
                )}
                aria-hidden="true"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>

            {showAllVisas && (
              <div className="mt-3 space-y-2.5">
                {allCountryVisas.map((opt) => {
                  const levelClr = opt.eligible
                    ? (opt.match_level && MATCH_STYLES[opt.match_level]) || MATCH_STYLES.medium
                    : null;
                  return (
                    <div
                      key={opt.visa_type}
                      className={cn(
                        "rounded-xl border bg-white/70 p-4 transition-colors",
                        opt.eligible ? "border-accent/15" : "border-line/70 bg-ink/[0.02]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-ink">{opt.visa_type}</h4>
                            {opt.eligible && levelClr && opt.match_score !== null ? (
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", levelClr.badge)}>
                                {t("{score}% match", { score: opt.match_score })}
                              </span>
                            ) : (
                              <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-semibold text-muted">
                                {t("Not eligible yet")}
                              </span>
                            )}
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted/70">
                              {opt.category}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-ink/70">{opt.description}</p>
                          {opt.issues.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {opt.issues.map((issue) => (
                                <li key={issue} className="flex items-start gap-1.5 text-[11px] leading-snug text-muted">
                                  <span className="mt-0.5 text-amber">•</span>
                                  <span>{issue}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Animate>
      )}

      {/* RECOMMENDATION */}
      {recommendation && (
        <Animate animation="fade-up" delay={450} duration={600}>
          {isPremium ? (
            <div className="mt-8 rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.07] to-transparent p-6">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-accent">{t("Our recommendation")}</p>
              <p className="mt-3 text-base leading-relaxed text-ink">{recommendation.reason}</p>
            </div>
          ) : (
            <div className="relative mt-8 overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.04] to-transparent p-6">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-accent">{t("Best path preview")}</p>
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
              <p className="mt-3 text-xs text-muted/60 text-center">{t("Upgrade to see your personalized step-by-step plan")}</p>
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
                {isPremium ? t("Areas to be aware of") : t("What may need improvement")}
              </h2>
              <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-muted">
                {challenges.length === 1 ? t("{count} factor", { count: challenges.length }) : t("{count} factors", { count: challenges.length })}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {challenges.map((ch) => {
                const c = SEVERITY_STYLES[ch.severity];
                return (
                  <div key={ch.title} className={cn("rounded-xl p-4", c.bg)}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-base leading-none">{c.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-ink">{ch.title}</p>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted/60">{severityLabels[ch.severity]}</span>
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
          <div className="mt-8 rounded-2xl border border-accent/15 bg-accent/[0.04] p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">{t("Advisor note")}</p>
            <div className="mt-5 space-y-5">
              {advisorSections.map((s) => (
                <div key={s.title} className="flex gap-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-lg">{s.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{s.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Animate>
      )}

      {/* ============ PREMIUM CONTENT (only for paid users) ============ */}
      {isPremium && result.premium_roadmap && (
        <Animate animation="fade-up" delay={650} duration={700}>
          <div className="mt-10">
            <h2 className="text-xl font-semibold tracking-tight text-ink">{t("Your step-by-step roadmap")}</h2>
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
            <h2 className="text-xl font-semibold tracking-tight text-ink">{t("Estimated costs")}</h2>
            <div className="mt-4 glass-card rounded-2xl p-6">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted">{t("Filing fees")}</p><p className="mt-1 text-lg font-semibold text-ink">${result.premium_costs.filing}</p></div>
                <div><p className="text-xs text-muted">{t("Legal fees")}</p><p className="mt-1 text-lg font-semibold text-ink">${result.premium_costs.legal}</p></div>
                <div><p className="text-xs text-muted">{t("Medical")}</p><p className="mt-1 text-lg font-semibold text-ink">${result.premium_costs.medical}</p></div>
                <div><p className="text-xs text-muted">{t("Other")}</p><p className="mt-1 text-lg font-semibold text-ink">${result.premium_costs.other}</p></div>
              </div>
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-sm text-muted">{t("Total estimated range")}</p>
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
            <h2 className="text-xl font-semibold tracking-tight text-ink">{t("Document checklist")}</h2>
            <div className="mt-4 space-y-2">
              {result.premium_documents.map((doc) => (
                <div key={doc.document} className="flex items-start gap-3 rounded-xl border border-line bg-white/60 p-3.5">
                  <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", doc.required ? "bg-accent/10 text-accent" : "bg-ink/5 text-muted")}>
                    {doc.required ? "✓" : "–"}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {doc.document}
                      {doc.required && <span className="ml-2 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{t("Required")}</span>}
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
          <div className="mt-12">
            {/* Canceled-checkout acknowledgment */}
            {canceled && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber/25 bg-amber/[0.06] p-4 md:p-5">
                <span className="mt-0.5 text-lg leading-none">ℹ️</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">{t("No charge — your payment was canceled")}</p>
                  <p className="mt-1 text-sm text-muted">
                    {t("You can pick up where you left off whenever you are ready")}
                  </p>
                </div>
              </div>
            )}

            {/* Headline */}
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{t("What you unlock")}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                {t("Your full immigration plan — no matter your match score")}
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted">
                {t("Even when options look limited today, you get a concrete roadmap, real costs, realistic timelines, and the exact documents to prepare")}
              </p>
            </div>

            {/* Feature preview — real sample content so users see the actual value */}
            <div className="mt-8 grid gap-4">
              {/* Roadmap */}
              <div className="relative overflow-hidden rounded-2xl border border-accent/15 bg-white/70 p-5 md:flex md:gap-8">
                <div className="flex items-start gap-3 md:w-48 md:shrink-0 md:flex-col md:gap-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-xl">🗺️</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{t("Step-by-step roadmap")}</p>
                    <p className="mt-0.5 text-xs text-muted">{t("Every action in order, tailored to your profile")}</p>
                  </div>
                </div>
                <div className="mt-4 flex-1 space-y-2.5 md:mt-0">
                  {[
                    { n: 1, title: t("Collect evidence & references"), sub: t("Publications, awards, letters, salary records") },
                    { n: 2, title: t("Prepare petition package"), sub: t("Draft brief, exhibit index, supporting docs") },
                    { n: 3, title: t("File with USCIS & track"), sub: t("Premium processing available for faster decision") },
                  ].map((step) => (
                    <div key={step.n} className="flex items-start gap-2.5">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">{step.n}</div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-ink leading-tight">{step.title}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-muted">{step.sub}</p>
                      </div>
                    </div>
                  ))}
                  <p className="border-t border-line/60 pt-2.5 text-[10px] italic leading-snug text-muted/80">
                    {t("Sample — your actual roadmap is personalized to your visa and profile")}
                  </p>
                </div>
              </div>

              {/* Cost */}
              <div className="relative overflow-hidden rounded-2xl border border-accent/15 bg-white/70 p-5 md:flex md:gap-8">
                <div className="flex items-start gap-3 md:w-48 md:shrink-0 md:flex-col md:gap-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-xl">💵</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{t("Cost estimate")}</p>
                    <p className="mt-0.5 text-xs text-muted">{t("Filing, legal, medical, and other fees")}</p>
                  </div>
                </div>
                <div className="mt-4 flex-1 md:mt-0">
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: t("Filing"), val: "$715" },
                      { label: t("Legal"), val: "$4,500" },
                      { label: t("Medical"), val: "$350" },
                      { label: t("Other"), val: "$420" },
                    ].map(({ label, val }) => (
                      <div key={label} className="rounded-xl bg-ink/[0.03] p-3">
                        <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
                        <p className="mt-1 text-sm font-semibold text-ink">{val}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                    <p className="text-xs text-muted">{t("Total estimated range")}</p>
                    <p className="text-lg font-semibold text-accent">$5,900 – $8,200</p>
                  </div>
                  <p className="mt-1 text-[10px] italic leading-snug text-muted/80">
                    {t("Sample — your real estimate reflects your visa, attorney region, and dependents")}
                  </p>
                </div>
              </div>

              {/* Timeline */}
              <div className="relative overflow-hidden rounded-2xl border border-accent/15 bg-white/70 p-5 md:flex md:gap-8">
                <div className="flex items-start gap-3 md:w-48 md:shrink-0 md:flex-col md:gap-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-xl">⏱️</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{t("Timeline estimate")}</p>
                    <p className="mt-0.5 text-xs text-muted">{t("How long each stage takes, realistically")}</p>
                  </div>
                </div>
                <div className="mt-4 flex-1 space-y-3 md:mt-0">
                  {[
                    { stage: t("Preparation"), width: "30%", months: t("2–3 months") },
                    { stage: t("Filing"), width: "55%", months: t("4–6 months") },
                    { stage: t("Decision"), width: "85%", months: t("6–9 months") },
                  ].map(({ stage, width, months }) => (
                    <div key={stage}>
                      <div className="mb-1 flex justify-between">
                        <span className="text-xs font-medium text-ink">{stage}</span>
                        <span className="text-xs text-muted">{months}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-ink/5">
                        <div className="h-full rounded-full bg-accent/70" style={{ width }} />
                      </div>
                    </div>
                  ))}
                  <p className="border-t border-line/60 pt-2.5 text-[10px] italic leading-snug text-muted/80">
                    {t("Sample — actual timing depends on processing queues and your specific path")}
                  </p>
                </div>
              </div>

              {/* Documents */}
              <div className="relative overflow-hidden rounded-2xl border border-accent/15 bg-white/70 p-5 md:flex md:gap-8">
                <div className="flex items-start gap-3 md:w-48 md:shrink-0 md:flex-col md:gap-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-xl">📄</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{t("Document checklist")}</p>
                    <p className="mt-0.5 text-xs text-muted">{t("Exactly what to prepare — and what can wait")}</p>
                  </div>
                </div>
                <div className="mt-4 flex-1 md:mt-0">
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {[
                      { doc: t("Passport (6+ months validity)"), required: true },
                      { doc: t("Degree & transcripts (translated)"), required: true },
                      { doc: t("Employment letters & pay stubs"), required: true },
                      { doc: t("Reference letters (3–5)"), required: false },
                      { doc: t("Medical examination (I-693)"), required: true },
                      { doc: t("Financial statements"), required: false },
                    ].map(({ doc, required }) => (
                      <div key={doc} className="flex items-center gap-2.5 rounded-lg bg-ink/[0.02] px-3 py-2">
                        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", required ? "bg-accent/10 text-accent" : "bg-ink/5 text-muted")}>
                          {required ? "✓" : "–"}
                        </span>
                        <p className="text-xs leading-tight text-ink/80">{doc}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 border-t border-line/60 pt-2.5 text-[10px] italic leading-snug text-muted/80">
                    {t("Sample — full list is tailored to the visa you pursue")}
                  </p>
                </div>
              </div>
            </div>

            {/* Reassurance for low-match users */}
            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-green/20 bg-green/[0.04] p-5 md:p-6">
              <span className="mt-0.5 text-lg leading-none">💡</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">{t("A low match does not mean the door is closed")}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                  {t("Your full plan still shows the costs, timeline, and documents for the paths available to you — plus the specific weaknesses to fix first, so you can raise your match score and try again")}
                </p>
              </div>
            </div>

            {/* Pricing lead-in */}
            <div className="mt-10 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t("Pick your plan")}</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-ink">{t("One-time payment — lifetime access")}</p>
            </div>

            {/* Pricing cards */}
            <div className={cn("mt-5 grid gap-4", upsellPlans.length === 1 ? "max-w-md mx-auto" : upsellPlans.length === 2 ? "md:grid-cols-2 max-w-2xl mx-auto" : "md:grid-cols-3")}>
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
                      {t("Best value")}
                    </span>
                  )}
                  <p className="text-sm font-semibold text-ink">{plan.name}</p>
                  <p className="mt-1 text-xs text-muted">{plan.tagline}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">
                    ${plan.price}
                  </p>
                  <p className="text-xs text-muted">{t("one-time")}</p>
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
                    {upgrading === plan.key ? t("Processing") : plan.cta}
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
            <h2 className="text-2xl font-semibold tracking-tight text-white">{t("Ready to start your case?")}</h2>
            <p className="mx-auto mt-3 max-w-md text-base text-white/50">
              {t("Create your immigration case from your recommended path and start moving forward")}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link className={cn(buttonVariants({ size: "lg", variant: "primary" }), "px-8 shadow-glow")} href="/dashboard/cases">
                {t("Create your case")}
              </Link>
              <Link className="inline-flex h-12 items-center rounded-full px-6 text-base font-semibold text-white/70 ring-1 ring-inset ring-white/20 hover:bg-white/5 hover:text-white" href="/dashboard">
                {t("Go to dashboard")}
              </Link>
            </div>
          </div>
        </Animate>
      )}
    </div>
  );
}
