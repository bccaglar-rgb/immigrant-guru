"use client";

import { Stagger } from "@/components/ui/animate";
import { SectionContainer } from "@/components/ui/section-container";

const pathways = [
  {
    plan: "Plan A",
    title: "Primary pathway",
    description:
      "The strongest route based on profile fit, timing, and document readiness.",
    gradient: "from-accent to-[#5e5ce6]"
  },
  {
    plan: "Plan B",
    title: "Fallback strategy",
    description:
      "A viable alternative when timing, evidence quality, or eligibility confidence changes.",
    gradient: "from-[#5e5ce6] to-purple"
  },
  {
    plan: "Plan C",
    title: "Longer-horizon option",
    description:
      "A more strategic route for users building qualifications or capital over time.",
    gradient: "from-purple to-[#ff375f]"
  }
];

export function PathwayTeaser() {
  return (
    <SectionContainer
      className="scroll-mt-24 bg-white"
      description="Surface multiple strategic routes so you're never forced into a single recommendation without context."
      eyebrow="Plan A / B / C"
      title="Compare multiple visa strategies"
    >
      <Stagger
        className="grid gap-6 md:grid-cols-3"
        animation="scale-in"
        staggerDelay={150}
        duration={700}
      >
        {pathways.map((pathway) => (
          <div
            className="group relative overflow-hidden rounded-2xl border border-line bg-canvas/50 p-8 transition-all duration-300 hover:border-transparent hover:shadow-soft hover:-translate-y-1"
            key={pathway.plan}
            id={pathway.plan === "Plan A" ? "plans" : undefined}
          >
            <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <div className={`absolute inset-0 bg-gradient-to-br ${pathway.gradient} opacity-[0.04]`} />
            </div>
            <div className="relative">
              <span className={`inline-flex rounded-full bg-gradient-to-r ${pathway.gradient} px-3 py-1 text-xs font-semibold text-white transition-transform duration-300 group-hover:scale-105`}>
                {pathway.plan}
              </span>
              <h3 className="mt-4 text-xl font-semibold tracking-tight text-ink">
                {pathway.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {pathway.description}
              </p>
            </div>
          </div>
        ))}
      </Stagger>
    </SectionContainer>
  );
}
