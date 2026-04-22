import type { ReactNode } from "react";

import { PaywallGuard } from "@/components/auth/paywall-guard";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

type DashboardLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <PaywallGuard>
      <DashboardShell>{children}</DashboardShell>
    </PaywallGuard>
  );
}
