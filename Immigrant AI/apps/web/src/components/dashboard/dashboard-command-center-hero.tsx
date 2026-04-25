"use client";

import { useTranslations } from "next-intl";

import { Animate } from "@/components/ui/animate";
import type { DashboardCommandCenterHero } from "@/types/dashboard";

import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";

type DashboardCommandCenterHeroProps = Readonly<{
  hero: DashboardCommandCenterHero;
}>;

export function DashboardCommandCenterHero({
  hero
}: DashboardCommandCenterHeroProps) {
  const t = useTranslations();

  return (
    <Animate animation="fade-up" duration={500}>
      <section className="relative overflow-hidden rounded-[36px] border border-white/80 bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.5),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-7 py-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] md:px-8 md:py-9">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.14),transparent_60%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.4fr_0.8fr] xl:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
              {hero.eyebrow}
            </p>
            <h1 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-ink md:text-3xl md:leading-[1.05]">
              {hero.title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
              {hero.description}
            </p>
          </div>

          <div className="rounded-[28px] border border-white/80 bg-white/80 p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
                {t("Current objective")}
              </p>
              <DashboardStatusPill label={hero.statusLabel} tone="accent" />
            </div>
            <p className="mt-3 text-xl font-semibold tracking-tight text-ink">
              {hero.primaryObjective}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                  {t("Active cases")}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
                  {hero.activeCaseCount}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                  {t("Last updated")}
                </p>
                <p className="mt-2 text-sm font-semibold text-ink">
                  {hero.updatedAtLabel}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Animate>
  );
}
