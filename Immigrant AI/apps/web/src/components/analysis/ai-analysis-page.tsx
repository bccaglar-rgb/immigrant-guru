"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Animate, Stagger } from "@/components/ui/animate";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getProfileAnalysis } from "@/lib/analysis-client";
import { cn } from "@/lib/utils";
import type { ProfileAnalysisResult } from "@/types/analysis";

type Status = "loading" | "ready" | "error";

const MATCH_COLORS = {
  high: { bg: "bg-green/10", text: "text-green", border: "border-green/20" },
  medium: { bg: "bg-amber/10", text: "text-amber", border: "border-amber/20" },
  low: { bg: "bg-red/10", text: "text-red", border: "border-red/20" },
};

const SEVERITY_COLORS = {
  high: { bg: "bg-red/8", text: "text-red", dot: "bg-red" },
  medium: { bg: "bg-amber/8", text: "text-amber", dot: "bg-amber" },
  low: { bg: "bg-ink/5", text: "text-muted", dot: "bg-muted" },
};

export function AIAnalysisPage() {
  const { session } = useAuthSession();
  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<ProfileAnalysisResult | null>(null);
  const [error, setError] = useState("");

  const loadAnalysis = useCallback(async () => {
    if (!session) return;
    setStatus("loading");
    setError("");

    const res = await getProfileAnalysis(session.accessToken);
    if (!res.ok) {
      setError(res.errorMessage);
      setStatus("error");
      return;
    }
    setResult(res.data);
    setStatus("ready");
  }, [session]);

  useEffect(() => {
    if (session?.accessToken) {
      void loadAnalysis();
    }
  }, [loadAnalysis, session?.accessToken]);

  // Loading state
  if (status === "loading") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
        <div className="h-12 w-12 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
        <Animate animation="fade-up" delay={300} duration={600}>
          <h2 className="mt-6 text-2xl font-semibold tracking-tight text-ink">
            Analyzing your profile...
          </h2>
          <p className="mt-2 text-base text-muted">
            Checking 47 visa categories against your background.
          </p>
        </Animate>
      </div>
    );
  }

  // Error state
  if (status === "error" || !result) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          Analysis could not load
        </h2>
        <p className="mt-3 text-base text-muted">{error || "Something went wrong."}</p>
        <Button className="mt-6" onClick={() => void loadAnalysis()} size="lg">
          Retry
        </Button>
      </div>
    );
  }

  const { profile_summary, visa_matches, recommendation, challenges, next_step } = result;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:py-16">
      {/* Section 1: About You */}
      <Animate animation="fade-up" duration={600}>
        <div className="text-center">
          <p className="text-sm font-medium text-accent">Your personalized analysis</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            We analyzed your profile.
          </h1>
        </div>
      </Animate>

      <Animate animation="fade-up" delay={150} duration={600}>
        <div className="mt-8 glass-card rounded-2xl p-6 md:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">About you</p>
          <p className="mt-3 text-lg leading-relaxed text-ink">
            {profile_summary.text}
          </p>
          {profile_summary.target_country && (
            <p className="mt-2 text-base text-muted">
              Target destination: <span className="font-medium text-ink">{profile_summary.target_country}</span>
            </p>
          )}
        </div>
      </Animate>

      {/* Section 2: Best Paths */}
      {visa_matches.length > 0 && (
        <>
          <Animate animation="fade-up" delay={300} duration={600}>
            <h2 className="mt-12 text-center text-2xl font-semibold tracking-tight text-ink">
              Best paths for you
            </h2>
          </Animate>

          <Stagger
            className="mt-6 grid gap-4"
            animation="fade-up"
            staggerDelay={120}
            duration={600}
          >
            {visa_matches.map((match) => {
              const colors = MATCH_COLORS[match.match_level];
              return (
                <div
                  key={match.visa_type}
                  className={cn("rounded-2xl border p-6 transition-all hover:shadow-soft", colors.border, colors.bg)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-semibold tracking-tight text-ink">{match.visa_type}</h3>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", colors.bg, colors.text)}>
                          {match.match_level}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {match.country} &middot; {match.category}
                        {match.requires_employer ? " &middot; Employer required" : " &middot; Self-petition"}
                      </p>
                      <p className="mt-3 text-base leading-relaxed text-ink/70">
                        {match.description}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("text-3xl font-semibold tracking-tight", colors.text)}>
                        {match.match_score}%
                      </p>
                      <p className="text-xs text-muted">match</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </Stagger>
        </>
      )}

      {/* Section 3: Recommendation */}
      {recommendation && (
        <Animate animation="fade-up" delay={500} duration={700}>
          <div className="mt-10 rounded-2xl border border-accent/15 bg-accent/5 p-6 md:p-8">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">Our recommendation</p>
            <p className="mt-3 text-lg leading-relaxed text-ink">
              {recommendation.reason}
            </p>
          </div>
        </Animate>
      )}

      {/* Section 4: Challenges */}
      {challenges.length > 0 && (
        <Animate animation="fade-up" delay={650} duration={600}>
          <div className="mt-10">
            <h2 className="text-xl font-semibold tracking-tight text-ink">Things to watch</h2>
            <div className="mt-4 space-y-3">
              {challenges.map((ch) => {
                const colors = SEVERITY_COLORS[ch.severity];
                return (
                  <div key={ch.title} className={cn("rounded-xl p-4", colors.bg)}>
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", colors.dot)} />
                      <p className={cn("text-sm font-semibold", colors.text)}>{ch.title}</p>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-ink/60">{ch.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </Animate>
      )}

      {/* Section 5: Next Step CTA */}
      <Animate animation="fade-up" delay={800} duration={700}>
        <div className="mt-12 rounded-3xl bg-gradient-dark p-8 text-center md:p-10">
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Ready to start your journey?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-white/50">
            {next_step}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              className={cn(buttonVariants({ size: "lg", variant: "primary" }), "px-8 shadow-glow")}
              href="/dashboard/cases"
            >
              Create your case
            </Link>
            <Link
              className="inline-flex h-12 items-center rounded-full px-6 text-base font-semibold text-white/70 ring-1 ring-inset ring-white/20 transition-all hover:bg-white/5 hover:text-white"
              href="/dashboard"
            >
              Go to dashboard
            </Link>
          </div>
        </div>
      </Animate>
    </div>
  );
}
