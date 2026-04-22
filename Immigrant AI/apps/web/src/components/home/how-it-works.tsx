"use client";

import { useTranslations } from "next-intl";

import { Animate, Stagger } from "@/components/ui/animate";

export function HowItWorks() {
  const t = useTranslations();
  const steps = [
    {
      num: "1",
      title: t("Tell us about you"),
      description: t("Your background, education, experience, and goals. Takes 2 minutes.")
    },
    {
      num: "2",
      title: t("We analyze your options"),
      description: t("AI checks 47 visa categories and finds your best match.")
    },
    {
      num: "3",
      title: t("Get your plan"),
      description: t("Visa, timeline, documents, cost — everything in one clear view.")
    }
  ];

  return (
    <section className="scroll-mt-24 py-16 md:py-24" id="how">
      <div className="mx-auto max-w-content px-6 md:px-10">
        <Animate animation="fade-up" duration={700}>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-accent">{t("How it works")}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              {t("Three steps. No confusion.")}
            </h2>
          </div>
        </Animate>

        <Stagger
          className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3"
          childClassName="h-full"
          animation="fade-up"
          staggerDelay={150}
          duration={600}
        >
          {steps.map((step) => (
            <div key={step.num} className="flex h-full flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-semibold text-white">
                {step.num}
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {step.description}
              </p>
            </div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
