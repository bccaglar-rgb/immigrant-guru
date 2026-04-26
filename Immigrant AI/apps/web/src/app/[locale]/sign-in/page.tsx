import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth/auth-shell";
import { EmailSignInForm } from "@/components/auth/email-sign-in-form";
import { buildAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to your Immigrant Guru account. Access your immigration dashboard, cases, readiness score, and AI strategy recommendations.",
  alternates: buildAlternates("/sign-in"),
  robots: {
    index: false,
    follow: true
  }
};

export default async function SignInPage() {
  const t = await getTranslations();
  return (
    <AuthShell
      description={t("Access your immigration dashboard, decision plans, and case workspace.")}
      eyebrow={t("Welcome back")}
      title={t("Sign in to continue your case strategy")}
    >
      <EmailSignInForm />
    </AuthShell>
  );
}
