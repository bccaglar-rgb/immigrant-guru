"use client";

import { Animate, Stagger } from "@/components/ui/animate";
import { SectionContainer } from "@/components/ui/section-container";

const benefits = [
  {
    icon: "01",
    title: "Case clarity before legal spend",
    description:
      "Organize your immigration direction before engaging external advisors or firms."
  },
  {
    icon: "02",
    title: "Structured profile intelligence",
    description:
      "Capture the core inputs that drive visa pathway comparisons and readiness scoring."
  },
  {
    icon: "03",
    title: "Action planning, not just information",
    description:
      "Translate eligibility signals into next steps, preparation priorities, and decision timelines."
  }
];

export function Benefits() {
  return (
    <SectionContainer
      className="scroll-mt-24 bg-white"
      description="Reduce ambiguity across the earliest and most operationally expensive phase of your immigration journey."
      eyebrow="Benefits"
      title="A focused workspace for immigration decisions"
    >
      <Stagger
        className="grid gap-6 md:grid-cols-3"
        animation="fade-up"
        staggerDelay={150}
        duration={700}
      >
        {benefits.map((benefit) => (
          <div
            className="group rounded-2xl border border-line bg-canvas/50 p-8 transition-all duration-300 hover:border-accent/15 hover:bg-white hover:shadow-soft hover:-translate-y-1"
            key={benefit.title}
            id={benefit.icon === "01" ? "benefits" : undefined}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-accent text-sm font-bold text-white transition-transform duration-300 group-hover:scale-110">
              {benefit.icon}
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-tight text-ink">
              {benefit.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {benefit.description}
            </p>
          </div>
        ))}
      </Stagger>
    </SectionContainer>
  );
}
