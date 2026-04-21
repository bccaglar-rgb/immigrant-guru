import type { Metadata } from "next";

import { DashboardAdminPage } from "@/components/dashboard/dashboard-admin-page";

export const metadata: Metadata = {
  title: "Admin"
};

export default function AdminPage() {
  return <DashboardAdminPage />;
}
