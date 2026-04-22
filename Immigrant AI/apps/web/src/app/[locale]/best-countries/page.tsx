import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PROFILES } from "@/data/profiles";

const SITE_URL = "https://immigrant.guru";

export const metadata: Metadata = {
  title: "Best countries to immigrate to by profession",
  description: "Ranked immigration destinations for software engineers, doctors, nurses, researchers and more.",
  alternates: { canonical: `${SITE_URL}/best-countries` }
};

export default async function Page() {
  const t = await getTranslations();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {t("bestCountries.pageTitle")}
        </h1>
        <p className="mt-4 text-lg text-white/70">
          {t("bestCountries.pageSubtitle")}
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {PROFILES.map((p) => (
            <Link
              key={p.slug}
              href={`/best-countries/${p.slug}`}
              className="rounded-xl border border-white/10 bg-white/5 p-5 hover:border-white/30"
            >
              <div className="text-base font-semibold text-white">
                {t("bestCountries.cardTitle", { profession: p.shortTitle.toLowerCase() })}
              </div>
              <div className="mt-1 text-xs text-white/60">{p.description}</div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
