"use client";

import { useTranslations } from "next-intl";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";
import { DashboardCommandCenter } from "@/components/dashboard/dashboard-command-center";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { MobileDashboardOverviewPage } from "@/components/mobile/mobile-dashboard-overview-page";
import { useDashboardResources } from "@/hooks/use-dashboard-resources";
import { useIsMobile } from "@/hooks/use-is-mobile";

function DesktopDashboardOverviewPage() {
  const { cases, commandCenter, error, refresh, status } = useDashboardResources();
  const t = useTranslations();

  return (
    <div className="space-y-6">
      {status === "loading" ? <DashboardLoadingState /> : null}
      {status === "error" ? (
        <DashboardErrorState
          message={error}
          onRetry={refresh}
          title={t("Could not load the command center")}
        />
      ) : null}

      {status === "ready" ? <DashboardCommandCenter cases={cases} data={commandCenter} /> : null}
    </div>
  );
}

export function DashboardOverviewPage() {
  const isMobile = useIsMobile();

  return isMobile ? <MobileDashboardOverviewPage /> : <DesktopDashboardOverviewPage />;
}
