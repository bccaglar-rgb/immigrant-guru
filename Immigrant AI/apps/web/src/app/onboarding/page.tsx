import type { Metadata } from "next";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const metadata: Metadata = {
  title: "Welcome"
};

export default function OnboardingPage() {
  return <OnboardingWizard />;
}
