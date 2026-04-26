import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { buildAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Sign In with Password",
  description:
    "Sign in to your Immigrant Guru account with your email and password.",
  alternates: buildAlternates("/sign-in/password"),
  robots: {
    index: false,
    follow: true
  }
};

export default async function SignInWithPasswordPage() {
  const t = await getTranslations();
  return (
    <AuthShell
      description={t("Access your immigration dashboard, decision plans, and case workspace.")}
      eyebrow={t("Welcome back")}
      title={t("Sign in with your password")}
    >
      <AuthForm mode="sign-in" />
    </AuthShell>
  );
}
