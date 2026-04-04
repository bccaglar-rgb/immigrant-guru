import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to your Immigrant Guru account. Access your immigration dashboard, cases, readiness score, and AI strategy recommendations.",
  alternates: {
    canonical: "https://immigrant.guru/sign-in"
  },
  robots: {
    index: false,
    follow: true
  }
};

export default function SignInPage() {
  return (
    <AuthShell
      description="Access your immigration dashboard, decision plans, and case workspace."
      eyebrow="Welcome Back"
      title="Sign in to continue your case strategy"
    >
      <AuthForm mode="sign-in" />
    </AuthShell>
  );
}
