"use client";

import { useTranslations } from "next-intl";

import { Stagger } from "@/components/ui/animate";
import { SectionContainer } from "@/components/ui/section-container";

export function Benefits() {
  const t = useTranslations();

  const benefits = [
    {
      icon: "01",
      title: t("Case clarity before legal spend"),
      description: t(
        "Organize your immigration direction before engaging external advisors or firms"
      )
    },
    {
      icon: "02",
      title: t("Structured profile intelligence"),
      description: t(
        "Capture the core inputs that drive visa pathway comparisons and readiness scoring"
      )
    },
    {
      icon: "03",
      title: t("Action planning, not just information"),
      description: t(
        "Translate eligibility signals into next steps, preparation priorities, and decision timelines"
      )
    }
  ];

  return (
    <SectionContainer
      className="scroll-mt-24 bg-white"
      description={t(
        "Reduce ambiguity across the earliest and most operationally expensive phase of your immigration journey"
      )}
      eyebrow={t("Benefits")}
      title={t("A focused workspace for immigration decisions")}
    >
      <Stagger
        className="grid grid-cols-1 gap-6 md:grid-cols-3 items-stretch"
        childClassName="h-full"
        animation="fade-up"
        staggerDelay={150}
        duration={700}
      >
        {benefits.map((benefit) => (
          <div
            className="group flex h-full flex-col rounded-2xl border border-line bg-canvas/50 p-10 transition-all duration-300 hover:border-accent/15 hover:bg-white hover:shadow-soft hover:-translate-y-1"
            key={benefit.title}
            id={benefit.icon === "01" ? "benefits" : undefined}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-accent text-base font-bold text-white transition-transform duration-300 group-hover:scale-110">
              {benefit.icon}
            </div>
            <h3 className="mt-6 min-h-[3.6rem] text-xl font-semibold tracking-tight text-ink">
              {benefit.title}
            </h3>
            <p className="mt-3 flex-1 text-base leading-relaxed text-ink/60">
              {benefit.description}
            </p>
          </div>
        ))}
      </Stagger>
    </SectionContainer>
  );
}
