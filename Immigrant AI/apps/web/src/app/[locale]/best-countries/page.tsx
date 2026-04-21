import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { PROFILES } from "@/data/profiles";

const SITE_URL = "https://immigrant.guru";

export const metadata: Metadata = {
  title: "Best countries to immigrate to by profession",
  description: "Ranked immigration destinations for software engineers, doctors, nurses, researchers and more.",
  alternates: { canonical: `${SITE_URL}/best-countries` }
};

export default function Page() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Best countries by profession
        </h1>
        <p className="mt-4 text-lg text-white/70">
          Pick your profession to see the ranked list of destinations.
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {PROFILES.map((p) => (
            <Link
              key={p.slug}
              href={`/best-countries/${p.slug}`}
              className="rounded-xl border border-white/10 bg-white/5 p-5 hover:border-white/30"
            >
              <div className="text-base font-semibold text-white">
                Best countries for {p.shortTitle.toLowerCase()}
              </div>
              <div className="mt-1 text-xs text-white/60">{p.description}</div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
