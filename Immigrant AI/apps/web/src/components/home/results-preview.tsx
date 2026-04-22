"use client";

import { useTranslations } from "next-intl";

import { Animate } from "@/components/ui/animate";

export function ResultsPreview() {
  const t = useTranslations();
  return (
    <section className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-content px-6 md:px-10">
        <Animate animation="fade-up" duration={700}>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-accent">{t("What you get")}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              {t("One clear plan. Everything you need.")}
            </h2>
          </div>
        </Animate>

        <Animate animation="scale-in" delay={200} duration={800}>
          <div className="mx-auto mt-12 max-w-3xl glass-card rounded-3xl p-8 shadow-soft md:p-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">{t("Your personalized result")}</p>
                <h3 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{t("Immigration Plan")}</h3>
              </div>
              <div className="rounded-full bg-green/10 px-3 py-1 text-xs font-semibold text-green">
                {t("Ready")}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-line bg-canvas/40 p-5">
                <p className="text-xs text-muted">{t("Best visa option")}</p>
                <p className="mt-1 text-lg font-semibold text-ink" translate="no">EB-2 NIW</p>
                <p className="mt-0.5 text-sm text-muted">{t("National Interest Waiver")}</p>
              </div>
              <div className="rounded-xl border border-line bg-canvas/40 p-5">
                <p className="text-xs text-muted">{t("Estimated cost")}</p>
                <p className="mt-1 text-lg font-semibold text-ink">$4,500</p>
                <p className="mt-0.5 text-sm text-muted">{t("Filing + legal fees")}</p>
              </div>
              <div className="rounded-xl border border-line bg-canvas/40 p-5">
                <p className="text-xs text-muted">{t("Timeline")}</p>
                <p className="mt-1 text-lg font-semibold text-ink">{t("12-18 months")}</p>
                <p className="mt-0.5 text-sm text-muted">{t("From filing to approval")}</p>
              </div>
              <div className="rounded-xl border border-line bg-canvas/40 p-5">
                <p className="text-xs text-muted">{t("Readiness score")}</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-lg font-semibold text-accent">76/100</p>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/8">
                    <div className="h-full w-3/4 rounded-full bg-accent" />
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-muted">{t("Profile, finance, case")}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-line bg-canvas/40 p-5">
                <p className="text-xs text-muted">{t("Suggested cities")}</p>
                <p className="mt-1 text-base font-medium text-ink" translate="no">New York, San Francisco, Austin</p>
              </div>
              <div className="rounded-xl border border-line bg-canvas/40 p-5">
                <p className="text-xs text-muted">{t("Job opportunities")}</p>
                <p className="mt-1 text-base font-medium text-ink">{t("Software Engineering, AI/ML, Product")}</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-accent/5 border border-accent/10 px-5 py-3">
              <p className="text-sm text-ink/70">
                <span className="font-semibold text-accent">{t("Next step:")}</span>{" "}
                {t("Upload your resume and education documents to increase your readiness score to 90+.")}
              </p>
            </div>
          </div>
        </Animate>
      </div>
    </section>
  );
}
