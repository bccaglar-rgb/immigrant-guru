"use client";

import { useTranslations } from "next-intl";

import { Animate } from "@/components/ui/animate";

export function PainSolution() {
  const t = useTranslations();
  const pains = [
    t("Confusing visa rules that change every year"),
    t("Expensive lawyers who charge $5,000+ for basic advice"),
    t("No clear direction — just endless Googling"),
    t("Months of waiting with no visibility")
  ];
  const solutions = [
    t("We show you what to do"),
    t("Your best path, ranked by fit"),
    t("No confusion, no jargon")
  ];
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-content px-6 md:px-10">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 items-center">
          <Animate animation="slide-left" duration={700}>
            <div className="rounded-2xl border border-red/10 bg-red/[0.03] p-8 md:p-10">
              <p className="text-sm font-medium text-red">{t("The problem")}</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
                {t("Immigration shouldn't feel this hard.")}
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

          <Animate animation="slide-right" delay={150} duration={700}>
            <div className="rounded-2xl border border-green/10 bg-green/[0.03] p-8 md:p-10">
              <p className="text-sm font-medium text-green">{t("The solution")}</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
                {t("We turn everything into one clear plan.")}
              </h3>
              <p className="mt-4 text-base leading-relaxed text-ink/70">
                {t("Tell us about yourself. Our AI analyzes 47 visa categories, checks your readiness, and gives you a step-by-step plan with timeline, cost, and documents — in minutes.")}
              </p>
              <div className="mt-5 space-y-3">
                {solutions.map((item) => (
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
