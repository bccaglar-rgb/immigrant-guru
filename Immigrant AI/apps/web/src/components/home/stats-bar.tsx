"use client";

import { Animate } from "@/components/ui/animate";

const stats = [
  { value: "47", label: "US visa categories", sublabel: "analyzed by AI" },
  { value: "352", label: "Knowledge chunks", sublabel: "curated data points" },
  { value: "4", label: "Score components", sublabel: "transparent scoring" },
  { value: "24/7", label: "AI availability", sublabel: "instant strategies" }
];

export function StatsBar() {
  return (
    <section className="relative overflow-hidden bg-gradient-dark py-16">
      <div className="absolute inset-0 bg-gradient-mesh opacity-10 pointer-events-none" />

      <div className="relative mx-auto max-w-content px-6 md:px-10">
        <Animate animation="fade-up" duration={700}>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm font-medium text-white/60">{stat.label}</p>
                <p className="mt-0.5 text-xs text-white/30">{stat.sublabel}</p>
              </div>
            ))}
          </div>
        </Animate>
      </div>
    </section>
  );
}
