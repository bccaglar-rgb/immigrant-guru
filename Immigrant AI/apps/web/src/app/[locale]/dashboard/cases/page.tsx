import type { Metadata } from "next";

import { DashboardCasesPage } from "@/components/dashboard/dashboard-cases-page";

export const metadata: Metadata = {
  title: "Cases"
};

export default function CasesPage() {
  return <DashboardCasesPage />;
}
