import type { Metadata } from "next";

import { OnboardingGuard } from "@/components/onboarding/onboarding-guard";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const metadata: Metadata = {
  title: "Welcome - Build Your Profile",
  description:
    "Complete your immigration profile in under 2 minutes. Tell us about your background, goals, and qualifications to get personalized recommendations.",
  robots: {
    index: false,
    follow: false
  }
};

export default function OnboardingPage() {
  return (
    <OnboardingGuard>
      <OnboardingWizard />
    </OnboardingGuard>
  );
}
