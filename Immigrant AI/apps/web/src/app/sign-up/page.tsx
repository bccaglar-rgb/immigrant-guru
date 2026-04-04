import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Sign Up"
};

export default function SignUpPage() {
  return (
    <AuthShell
      description="Create an account to start building an immigration profile, evaluate pathways, and manage your cases."
      eyebrow="Get Started"
      title="Create your Immigrant Guru account"
    >
      <AuthForm mode="sign-up" />
    </AuthShell>
  );
}
