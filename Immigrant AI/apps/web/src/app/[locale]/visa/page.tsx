import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCountry } from "@/data/countries";
import { VISAS } from "@/data/visa-catalog";

const SITE_URL = "https://immigrant.guru";

export const metadata: Metadata = {
  title: "All visas — cost, timeline & eligibility",
  description: "Every major immigration visa with cost, timeline, and eligibility at a glance.",
  alternates: { canonical: `${SITE_URL}/visa` }
};

export default async function Page() {
  const t = await getTranslations();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {t("visaIndex.pageTitle")}
        </h1>
        <p className="mt-4 text-lg text-white/70">
          {t("visaIndex.pageSubtitle")}
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {VISAS.map((v) => {
            const c = getCountry(v.destination);
            return (
              <Link
                key={v.slug}
                href={`/visa/${v.slug}`}
                className="rounded-xl border border-white/10 bg-white/5 p-5 hover:border-white/30"
              >
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <span>{c?.flag}</span>
                  <span>{c?.name}</span>
                </div>
                <div className="mt-1 text-base font-semibold text-white">
                  {v.code} — {v.name}
                </div>
                <div className="mt-1 text-xs text-white/60">
                  ${v.typicalCostUsd.min.toLocaleString()}–${v.typicalCostUsd.max.toLocaleString()} · {v.typicalTimelineMonths.min}–{v.typicalTimelineMonths.max} {t("visaIndex.months")}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
