"use client";

import { Animate } from "@/components/ui/animate";

const stats = [
  { value: "47", label: "Visa categories analyzed" },
  { value: "50+", label: "Countries supported" },
  { value: "2 min", label: "Average time to first plan" }
];

const testimonials = [
  {
    quote: "I spent months Googling visa options. Immigrant Guru gave me a clear plan in 10 minutes. I wish I found this earlier.",
    name: "Aylin D.",
    role: "Software Engineer, Turkey to USA"
  },
  {
    quote: "The readiness score showed me exactly what I was missing. I uploaded 3 documents and my score jumped from 52 to 81.",
    name: "Raj P.",
    role: "Data Scientist, India to Canada"
  }
];

export function SocialProof() {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-content px-6 md:px-10">
        {/* Stats */}
        <Animate animation="fade-up" duration={700}>
          <div className="grid grid-cols-3 gap-6 text-center">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">{stat.value}</p>
                <p className="mt-1 text-sm text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </Animate>

        {/* Testimonials */}
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {testimonials.map((t, i) => (
            <Animate key={t.name} animation="fade-up" delay={i * 150} duration={700}>
              <div className="glass-card rounded-2xl p-7">
                <p className="text-base leading-relaxed text-ink/70">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-5">
                  <p className="text-sm font-semibold text-ink">{t.name}</p>
                  <p className="text-xs text-muted">{t.role}</p>
                </div>
              </div>
            </Animate>
          ))}
        </div>
      </div>
    </section>
  );
}
