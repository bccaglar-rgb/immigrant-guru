"use client";

import { Animate } from "@/components/ui/animate";

const stats = [
  { value: "20+", label: "Countries" },
  { value: "50+", label: "Visa types" },
  { value: "100+", label: "Possible paths" },
];

export function GlobalCoverage() {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-content px-6 md:px-10">
        <Animate animation="fade-up" duration={700}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              There&apos;s always a way &mdash;<br />we help you find it.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              We analyze multiple countries, visa types, and pathways to match you
              with the best option based on your profile.
            </p>
          </div>
        </Animate>

        <Animate animation="fade-up" delay={200} duration={600}>
          <div className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-6 text-center">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-4xl font-semibold tracking-tight text-accent md:text-5xl">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm font-medium text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </Animate>

        <Animate animation="fade-up" delay={350} duration={600}>
          <div className="mx-auto mt-12 max-w-xl text-center">
            <p className="text-lg font-medium text-ink">
              No matter your background, we help you find a way forward.
            </p>
            <p className="mt-3 text-base text-muted italic">
              Even if you think you don&apos;t qualify &mdash; we&apos;ll show you what&apos;s possible.
            </p>
          </div>
        </Animate>
      </div>
    </section>
  );
}
