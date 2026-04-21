"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardTopbar } from "@/components/dashboard/dashboard-topbar";
import { MobileDashboardShell } from "@/components/mobile/mobile-dashboard-shell";
import { useIsMobile } from "@/hooks/use-is-mobile";

type DashboardShellProps = Readonly<{
  children: ReactNode;
}>;

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const redirectTo = `/sign-in?next=${encodeURIComponent(pathname || "/dashboard")}`;

  return (
    <ProtectedRoute redirectTo={redirectTo}>
      {({ clearSession, session, user }) => (
        isMobile ? (
          <MobileDashboardShell
            clearSession={clearSession}
            pathname={pathname}
            session={session}
            user={user}
          >
            {children}
          </MobileDashboardShell>
        ) : (
          <div className="min-h-screen bg-canvas">
            <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col lg:flex-row">
              <DashboardSidebar pathname={pathname} />
              <div className="min-w-0 flex-1 px-4 pb-8 pt-4 md:px-8 md:pb-10 md:pt-6">
                <DashboardTopbar
                  clearSession={clearSession}
                  pathname={pathname}
                  session={session}
                  user={user}
                />
                <div className="mt-6">{children}</div>
              </div>
            </div>
          </div>
        )
      )}
    </ProtectedRoute>
  );
}
