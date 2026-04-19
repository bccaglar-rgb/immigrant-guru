import type { Metadata } from "next";
import { Suspense } from "react";

import { AIAnalysisPage } from "@/components/analysis/ai-analysis-page";

export const metadata: Metadata = {
  title: "My Analysis | Immigrant Guru",
};

export default function DashboardAnalysisPage() {
  return (
    <Suspense>
      <AIAnalysisPage compact />
    </Suspense>
  );
}
