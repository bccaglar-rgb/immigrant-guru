import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth/auth-shell";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { buildAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Verify Sign In",
  description: "Enter the 6-digit code we sent to your email to sign in.",
  alternates: buildAlternates("/sign-in/code"),
  robots: {
    index: false,
    follow: true
  }
};

export default async function SignInCodePage() {
  const t = await getTranslations();
  return (
    <AuthShell
      description={t("We just sent you a 6-digit sign-in code.")}
      eyebrow={t("Almost there")}
      title={t("Check your email")}
    >
      <EmailCodeForm />
    </AuthShell>
  );
}
