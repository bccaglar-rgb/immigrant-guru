"use client";

import { Animate } from "@/components/ui/animate";

const pains = [
  "Confusing visa rules that change every year",
  "Expensive lawyers who charge $5,000+ for basic advice",
  "No clear direction — just endless Googling",
  "Months of waiting with no visibility"
];

export function PainSolution() {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-content px-6 md:px-10">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 items-center">
          {/* Pain */}
          <Animate animation="slide-left" duration={700}>
            <div className="rounded-2xl border border-red/10 bg-red/[0.03] p-8 md:p-10">
              <p className="text-sm font-medium text-red">The problem</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
                Immigration shouldn&apos;t feel this hard.
              </h3>
              <div className="mt-5 space-y-3">
                {pains.map((pain) => (
                  <div key={pain} className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red/10 text-xs text-red">
                      &#10005;
                    </span>
                    <p className="text-base text-ink/70">{pain}</p>
                  </div>
                ))}
              </div>
            </div>
          </Animate>

          {/* Solution */}
          <Animate animation="slide-right" delay={150} duration={700}>
            <div className="rounded-2xl border border-green/10 bg-green/[0.03] p-8 md:p-10">
              <p className="text-sm font-medium text-green">The solution</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
                We turn everything into one clear plan.
              </h3>
              <p className="mt-4 text-base leading-relaxed text-ink/70">
                Tell us about yourself. Our AI analyzes 47 visa categories, checks your readiness,
                and gives you a step-by-step plan with timeline, cost, and documents — in minutes.
              </p>
              <div className="mt-5 space-y-3">
                {["We show you what to do", "Your best path, ranked by fit", "No confusion, no jargon"].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green/10 text-xs text-green">
                      &#10003;
                    </span>
                    <p className="text-base text-ink/70">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </Animate>
        </div>
      </div>
    </section>
  );
}
