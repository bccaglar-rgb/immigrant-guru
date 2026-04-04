import type { Metadata } from "next";

import { DashboardProfilePage } from "@/components/dashboard/dashboard-profile-page";

export const metadata: Metadata = {
  title: "Profile"
};

export default function ProfilePage() {
  return <DashboardProfilePage />;
}
