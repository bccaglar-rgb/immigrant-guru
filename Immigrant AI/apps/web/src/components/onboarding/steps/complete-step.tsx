"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Animate } from "@/components/ui/animate";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProfileFormValues } from "@/types/profile";

type CompleteStepProps = {
  formValues: ProfileFormValues;
};

const READINESS_FIELDS: (keyof ProfileFormValues)[] = [
  "nationality",
  "current_country",
  "target_country",
  "relocation_timeline",
  "profession",
  "years_of_experience",
  "education_level",
  "english_level",
  "available_capital"
];

function computeReadiness(values: ProfileFormValues): number {
  let filled = 0;
  for (const field of READINESS_FIELDS) {
    const val = values[field];
    if (val && val !== "" && val !== "unknown") filled++;
  }
  return Math.round((filled / READINESS_FIELDS.length) * 100);
}

export function CompleteStep({ formValues }: CompleteStepProps) {
  const readiness = computeReadiness(formValues);
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    if (displayCount < readiness) {
      const timer = setTimeout(() => {
        setDisplayCount((c) => Math.min(c + 2, readiness));
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [displayCount, readiness]);

  return (
    <div className="flex flex-col items-center justify-center text-center py-12 md:py-16">
      <Animate animation="scale-in" duration={800}>
        <div className="relative">
          <svg className="h-40 w-40" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="rgba(0,0,0,0.06)"
              strokeWidth="8"
            />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="url(#gradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(readiness / 100) * 327} 327`}
              strokeDashoffset="0"
              transform="rotate(-90 60 60)"
              className="transition-all duration-1000"
              style={{ transitionDelay: "500ms" }}
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0071e3" />
                <stop offset="50%" stopColor="#5e5ce6" />
                <stop offset="100%" stopColor="#bf5af2" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-semibold tracking-tight text-ink">{displayCount}%</span>
          </div>
        </div>
      </Animate>

      <Animate animation="fade-up" delay={400} duration={700}>
        <h2 className="mt-8 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          You&apos;re all set!
        </h2>
      </Animate>

      <Animate animation="fade-up" delay={550} duration={600}>
        <p className="mt-3 max-w-md text-lg leading-relaxed text-muted">
          {readiness >= 80
            ? "Amazing! Your profile is almost complete. We can build great strategies for you."
            : readiness >= 50
              ? "Great start! You can always complete more details from your profile page."
              : "No worries! You can fill in more details anytime from your dashboard."}
        </p>
      </Animate>

      <Animate animation="fade-up" delay={700} duration={600}>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            className={cn(buttonVariants({ size: "lg", variant: "primary" }), "px-8 shadow-glow")}
            href="/pricing?next=/analysis"
          >
            See your AI analysis
          </Link>
        </div>
      </Animate>
    </div>
  );
}
