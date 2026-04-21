import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { DESTINATION_COUNTRIES } from "@/data/countries";
import { PROFILES } from "@/data/profiles";

const SITE_URL = "https://immigrant.guru";

export const metadata: Metadata = {
  title: "Find your best visa — Immigrant Guru",
  description:
    "Pick your target country and profile. We'll show you the best visas for your situation.",
  alternates: { canonical: `${SITE_URL}/visa-match` }
};

export default function Page() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Visa match</h1>
        <p className="mt-4 text-lg text-white/70">
          Pick your target country and profile to see your top 3 pathways.
        </p>

        <div className="mt-10 space-y-10">
          {DESTINATION_COUNTRIES.map((country) => (
            <section key={country.slug}>
              <h2 className="text-xl font-semibold text-white">
                {country.flag} {country.name}
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {PROFILES.map((profile) => (
                  <Link
                    key={profile.slug}
                    href={`/visa-match/${country.slug}/${profile.slug}`}
                    className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/30"
                  >
                    <div className="text-sm font-semibold text-white">{profile.title}</div>
                    <div className="mt-1 text-xs text-white/60">
                      Best visas for {profile.shortTitle.toLowerCase()}
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
