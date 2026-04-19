import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { COMPARISONS } from "@/data/seo-pairs";
import { getVisa } from "@/data/visa-catalog";

const SITE_URL = "https://immigrant.guru";

export const metadata: Metadata = {
  title: "Visa comparisons — Immigrant Guru",
  description: "Side-by-side comparisons of the top immigration pathways.",
  alternates: { canonical: `${SITE_URL}/compare` }
};

export default function Page() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Visa comparisons
        </h1>
        <p className="mt-4 text-lg text-white/70">
          Side-by-side comparisons of the most common pathway decisions.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {COMPARISONS.map((c) => {
            const a = getVisa(c.visaA);
            const b = getVisa(c.visaB);
            return (
              <Link
                key={c.slug}
                href={`/compare/${c.slug}`}
                className="rounded-xl border border-white/10 bg-white/5 p-4 hover:border-white/30"
              >
                <div className="text-base font-semibold text-white">
                  {a?.code} vs {b?.code}
                </div>
                <div className="mt-1 text-xs text-white/60">
                  {a?.name} vs {b?.name}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
