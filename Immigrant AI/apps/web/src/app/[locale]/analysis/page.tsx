import type { Metadata } from "next";
import { AIAnalysisPage } from "@/components/analysis/ai-analysis-page";

export const metadata: Metadata = {
  title: "Your Immigration Analysis",
  description: "Personalized visa recommendations based on your profile. See your best paths, match scores, and next steps.",
  robots: { index: false, follow: false },
};

export default function AnalysisRoute() {
  return <AIAnalysisPage />;
}
