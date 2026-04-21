import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";

const SITE_URL = "https://immigrant.guru";

export const metadata: Metadata = {
  title: "Free immigration tools — Immigrant Guru",
  description: "Eligibility checker, cost estimator, and timeline calculator — all free.",
  alternates: { canonical: `${SITE_URL}/tools` }
};

const TOOLS = [
  {
    href: "/tools/eligibility-checker",
    title: "Eligibility checker",
    description: "Answer 6 questions, see the visas you likely qualify for."
  },
  {
    href: "/tools/cost-estimator",
    title: "Cost estimator",
    description: "Full cost of moving abroad — not just the visa fee."
  },
  {
    href: "/tools/timeline-calculator",
    title: "Timeline calculator",
    description: "Estimate when you'll arrive, stage by stage."
  }
];

export default function Page() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Free immigration tools
        </h1>
        <p className="mt-4 text-lg text-white/70">
          Quick answers — no sign-up required.
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
