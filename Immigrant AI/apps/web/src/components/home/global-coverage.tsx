"use client";

import { useTranslations } from "next-intl";

import { Animate } from "@/components/ui/animate";

export function GlobalCoverage() {
  const t = useTranslations();
  const stats = [
    { value: "20+", label: t("Countries") },
    { value: "50+", label: t("Visa types") },
    { value: "100+", label: t("Possible paths") },
  ];
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-content px-6 md:px-10">
        <Animate animation="fade-up" duration={700}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              {t("There's always a way — we help you find it.")}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              {t("We analyze multiple countries, visa types, and pathways to match you with the best option based on your profile.")}
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
              {t("No matter your background, we help you find a way forward.")}
            </p>
            <p className="mt-3 text-base text-muted italic">
              {t("Even if you think you don't qualify — we'll show you what's possible.")}
            </p>
          </div>
        </Animate>
      </div>
    </section>
  );
}
