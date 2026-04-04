import type { Metadata } from "next";

import { DashboardCaseDetailPage } from "@/components/dashboard/dashboard-case-detail-page";

export const metadata: Metadata = {
  title: "Case Detail"
};

type CaseDetailPageProps = Readonly<{
  params: {
    caseId: string;
  };
}>;

export default function CaseDetailPage({
  params
}: CaseDetailPageProps) {
  return <DashboardCaseDetailPage caseId={params.caseId} />;
}
