import type { Metadata } from "next";

import { DashboardOverviewPage } from "@/components/dashboard/dashboard-overview-page";

export const metadata: Metadata = {
  title: "Dashboard"
};

export default function DashboardPage() {
  return <DashboardOverviewPage />;
}
