"use client";

import type { ReactNode } from "react";

import { Animate } from "@/components/ui/animate";

type DashboardPageHeaderProps = Readonly<{
  actions?: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}>;

export function DashboardPageHeader({
  actions,
  description,
  eyebrow,
  title
}: DashboardPageHeaderProps) {
  return (
    <Animate animation="fade-up" duration={500}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {description}
          </p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </Animate>
  );
}
