import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { DESTINATION_COUNTRIES, SOURCE_COUNTRIES } from "@/data/countries";

const SITE_URL = "https://immigrant.guru";

export const metadata: Metadata = {
  title: "Country relocation guides — Immigrant Guru",
  description: "Step-by-step relocation guides from source country to destination country.",
  alternates: { canonical: `${SITE_URL}/move-to` }
};

export default async function Page() {
  const t = await getTranslations();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {t("moveTo.pageTitle")}
        </h1>
        <p className="mt-4 text-lg text-white/70">
          {t("moveTo.pageSubtitle")}
        </p>

        <div className="mt-10 space-y-10">
          {SOURCE_COUNTRIES.map((from) => (
            <section key={from.slug}>
              <h2 className="text-xl font-semibold text-white">
                {t("moveTo.fromLabel", { flag: from.flag, name: from.name })}
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {DESTINATION_COUNTRIES.filter((d) => d.slug !== from.slug).map((to) => (
                  <Link
                    key={`${from.slug}-${to.slug}`}
                    href={`/move-to/${from.slug}/to/${to.slug}`}
                    className="rounded-xl border border-white/10 bg-white/5 p-4 hover:border-white/30"
                  >
                    <div className="text-sm font-semibold text-white">
                      {from.flag} → {to.flag} {to.name}
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      {t("moveTo.cardSubtitle", { demonym: from.demonym })}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
