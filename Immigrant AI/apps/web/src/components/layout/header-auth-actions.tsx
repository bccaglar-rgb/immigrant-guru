"use client";

import { useTranslations } from "next-intl";

import { useAuthSession } from "@/hooks/use-auth-session";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function HeaderAuthActions() {
  const t = useTranslations();
  const { clearSession, retrySession, status, user } = useAuthSession();

  if (status === "loading") {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-ink/5" />;
  }

  if (status === "authenticated" && user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          className={cn(buttonVariants({ size: "md", variant: "primary" }))}
          href="/analysis"
        >
          {t("My plan")}
        </Link>
        <Link
          className="hidden text-sm font-medium text-muted transition-colors hover:text-ink md:inline-flex"
          href="/dashboard"
        >
          {t("Dashboard")}
        </Link>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-3">
        <button
          className={cn(buttonVariants({ size: "md", variant: "secondary" }))}
          onClick={() => void retrySession()}
          type="button"
        >
          {t("Retry")}
        </button>
        <button
          className="text-sm font-medium text-muted transition-colors hover:text-ink"
          onClick={clearSession}
          type="button"
        >
          {t("Sign out")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        className="hidden text-sm font-medium text-muted transition-colors hover:text-ink md:inline-flex"
        href="/sign-in"
      >
        {t("Log in")}
      </Link>
      <Link
        className={cn(buttonVariants({ size: "md", variant: "primary" }))}
        href="/sign-up"
      >
        {t("Start your plan")}
      </Link>
    </div>
  );
}
