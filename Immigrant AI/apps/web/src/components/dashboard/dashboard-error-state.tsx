"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type DashboardErrorStateProps = Readonly<{
  eyebrow?: string;
  message: string;
  onRetry: () => void;
  title?: string;
}>;

export function DashboardErrorState({
  eyebrow,
  message,
  onRetry,
  title
}: DashboardErrorStateProps) {
  const t = useTranslations();
  return (
    <div className="glass-card rounded-2xl p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-red">
        {eyebrow ?? t("Data unavailable")}
      </p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
        {title ?? t("Workspace data could not be loaded.")}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">{message}</p>
      <Button className="mt-5" onClick={onRetry} type="button" variant="secondary">
        {t("Retry")}
      </Button>
    </div>
  );
}
