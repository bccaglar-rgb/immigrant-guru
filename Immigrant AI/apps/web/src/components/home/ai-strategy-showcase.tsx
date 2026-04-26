"use client";

import { useTranslations } from "next-intl";

import { Animate, Stagger } from "@/components/ui/animate";

export function AIStrategyShowcase() {
  const t = useTranslations();

  const plans = [
    {
      label: "PLAN A",
      title: "EB-2 NIW",
      subtitle: t("Primary pathway"),
      fit: "85%",
      complexity: t("Medium"),
      timeline: "12-18 months",
      reason: t(
        "Strong profile fit with Master's degree and 10+ years experience — no employer sponsor needed, self-petition"
      ),
      gradient: "from-accent to-[#5e5ce6]",
      barWidth: "85%"
    },
    {
      label: "PLAN B",
      title: "H-1B",
      subtitle: t("Fallback strategy"),
      fit: "62%",
      complexity: t("Medium"),
      timeline: "6-12 months",
      reason: t(
        "Requires employer sponsorship and annual lottery selection — strong backup if EB-2 timeline is too long"
      ),
      gradient: "from-[#5e5ce6] to-purple",
      barWidth: "62%"
    },
    {
      label: "PLAN C",
      title: "EB-1A",
      subtitle: t("Longer-horizon option"),
      fit: "41%",
      complexity: t("High"),
      timeline: "6-12 months",
      reason: t(
        "Requires extraordinary ability evidence — build publications and awards over time to strengthen eligibility"
      ),
      gradient: "from-purple to-[#e11d48]",
      barWidth: "41%"
    }
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-dark py-20 md:py-28">
      <div className="absolute inset-0 bg-gradient-mesh opacity-20 pointer-events-none" />

      <div className="relative mx-auto max-w-content px-6 md:px-10">
        <Animate animation="fade-up" duration={700}>
          <div className="mx-auto max-w-3xl text-center mb-14">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
              {t("AI Strategy Engine")}
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-5xl">
              {t("Three strategies, one clear direction")}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-white/50">
              {t(
                "Our AI analyzes your profile against 47 visa categories and generates personalized Plan A, B, and C with confidence scores and reasoning"
              )}
            </p>
          </div>
        </Animate>

        <Stagger
          className="grid gap-6 md:grid-cols-3"
          animation="fade-up"
          staggerDelay={150}
          duration={700}
        >
          {plans.map((plan) => (
            <div
              key={plan.label}
              className="group relative overflow-hidden rounded-2xl bg-[#1e293b] transition-all duration-300 hover:-translate-y-1 hover:shadow-glow"
            >
              <div className={`h-1.5 bg-gradient-to-r ${plan.gradient}`} />

              <div className="p-7">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex rounded-full bg-gradient-to-r ${plan.gradient} px-3 py-1 text-xs font-semibold text-white`}
                  >
                    {plan.label}
                  </span>
                  <span className="text-sm text-white/40">{plan.complexity}</span>
                </div>

                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white">
                  {plan.title}
                </h3>
                <p className="mt-1 text-sm text-white/40">{plan.subtitle}</p>

                <div className="mt-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">{t("Suitability")}</span>
                    <span className="font-semibold text-white">{plan.fit}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${plan.gradient}`}
                      style={{ width: plan.barWidth }}
                    />
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-white/40">{plan.reason}</p>

                <div className="mt-4 flex items-center gap-2 text-xs text-white/30">
                  <span>{plan.timeline}</span>
                </div>
              </div>
            </div>
          ))}
        </Stagger>

        <Animate animation="fade-up" delay={400} duration={600}>
          <p className="mt-10 text-center text-sm text-white/30">
            {t(
              "Powered by OpenAI gpt-4o-mini · Confidence scoring (0-100) · Knowledge-grounded responses · 47 visa categories"
            )}
          </p>
        </Animate>
      </div>
    </section>
  );
}
