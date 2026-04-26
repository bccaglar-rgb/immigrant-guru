"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Animate } from "@/components/ui/animate";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QuickActions() {
  const t = useTranslations();

  const actions = [
    {
      href: "/dashboard/profile",
      label: t("Review profile"),
      description: t("Check nationality, destination, language, and relocation inputs")
    },
    {
      href: "/dashboard/cases",
      label: t("Review cases"),
      description: t("Inspect active migration goals, pathway choices, and readiness blockers")
    },
    {
      href: "/dashboard",
      label: t("Refresh overview"),
      description: t("Return to the summary view after updating profile or case data")
    }
  ];

  return (
    <Animate animation="fade-up" delay={200} duration={700}>
      <div className="glass-card rounded-2xl p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
          {t("Quick Actions")}
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
          {t("Move forward")}
        </h3>
        <div className="mt-4 space-y-2.5">
          {actions.map((action) => (
            <div
              className="rounded-xl border border-line bg-canvas/50 px-4 py-3.5 transition-all duration-200 hover:bg-white hover:shadow-card hover:-translate-y-0.5"
              key={action.href}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{action.label}</p>
                  <p className="mt-0.5 text-xs text-muted">{action.description}</p>
                </div>
                <Link
                  className={cn(
                    buttonVariants({ size: "md", variant: "secondary" }),
                    "shrink-0 text-xs"
                  )}
                  href={action.href}
                >
                  {t("Open")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Animate>
  );
}
