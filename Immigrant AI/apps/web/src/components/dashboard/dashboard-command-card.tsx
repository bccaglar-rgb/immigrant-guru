import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardCommandCardProps = Readonly<{
  children: ReactNode;
  className?: string;
  eyebrow: string;
  title: string;
  value?: ReactNode;
}>;

export function DashboardCommandCard({
  children,
  className,
  eyebrow,
  title,
  value
}: DashboardCommandCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.88))] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
            {eyebrow}
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
            {title}
          </h3>
        </div>
        {value ? (
          <div className="shrink-0 text-right">
            {value}
          </div>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}
