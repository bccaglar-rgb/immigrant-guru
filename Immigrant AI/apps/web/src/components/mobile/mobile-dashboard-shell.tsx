"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { MobileBottomNav } from "@/components/mobile/mobile-bottom-nav";
import { MobileNavbar } from "@/components/mobile/mobile-navbar";
import type { AuthenticatedUser, AuthSession } from "@/types/auth";

type MobileDashboardShellProps = Readonly<{
  children: ReactNode;
  clearSession: () => void;
  pathname: string;
  session: AuthSession;
  user: AuthenticatedUser;
}>;

function getPageTitle(
  pathname: string,
  t: ReturnType<typeof useTranslations>
): string {
  if (pathname === "/dashboard") return t("Command Center");
  if (pathname === "/dashboard/profile") return t("Profile");
  if (pathname === "/dashboard/cases") return t("Cases");
  if (pathname === "/dashboard/admin") return t("Internal");
  if (pathname.startsWith("/dashboard/cases/")) return t("Case Workspace");
  return t("Dashboard");
}

export function MobileDashboardShell({
  children,
  clearSession,
  pathname,
  session,
  user
}: MobileDashboardShellProps) {
  const t = useTranslations();
  const minutesRemaining = Math.max(Math.floor(session.expiresIn / 60), 1);

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <MobileNavbar clearSession={clearSession} title={getPageTitle(pathname, t)} user={user} />
      <main
        className="mx-auto w-full max-w-md px-4 pb-28 pt-4"
        style={{ paddingBottom: `calc(5.75rem + env(safe-area-inset-bottom))` }}
      >
        {children}
        <p className="mt-6 px-1 text-xs uppercase tracking-[0.08em] text-muted">
          {t("Session active")} · {t("{minutes}m remaining", { minutes: minutesRemaining })}
        </p>
      </main>
      <MobileBottomNav pathname={pathname} />
    </div>
  );
}
