import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Pricing — Immigrant Guru",
  description:
    "Simple one-time pricing for your full immigration strategy. Pay once, get your Plan A/B/C, readiness score, and case workspace. 30-day money-back guarantee.",
  alternates: buildAlternates("/pricing"),
  openGraph: {
    title: "Pricing — Immigrant Guru",
    description:
      "One-time payment. Full immigration strategy, readiness score, and AI-powered Plan A/B/C. 30-day money-back guarantee.",
    url: "https://immigrant.guru/pricing"
  }
};

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
