import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { buildAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Free immigration tools — Immigrant Guru",
  description: "Eligibility checker, cost estimator, and timeline calculator — all free.",
  alternates: buildAlternates("/tools")
};

export default async function Page() {
  const t = await getTranslations();

  const TOOLS = [
    {
      href: "/tools/eligibility-checker",
      title: t("tools.eligibilityChecker.title"),
      description: t("tools.eligibilityChecker.description")
    },
    {
      href: "/tools/cost-estimator",
      title: t("tools.costEstimator.title"),
      description: t("tools.costEstimator.description")
    },
    {
      href: "/tools/timeline-calculator",
      title: t("tools.timelineCalculator.title"),
      description: t("tools.timelineCalculator.description")
    }
  ];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {t("tools.pageTitle")}
        </h1>
        <p className="mt-4 text-lg text-white/70">
          {t("tools.pageSubtitle")}
        </p>
        <div className="mt-8 grid gap-4">
          {TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 hover:border-white/30"
            >
              <div className="text-lg font-semibold text-white">{tool.title}</div>
              <div className="mt-1 text-sm text-white/70">{tool.description}</div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
