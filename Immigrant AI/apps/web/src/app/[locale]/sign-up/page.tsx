import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Sign Up - Create Your Free Account",
  description:
    "Create your free Immigrant Guru account. Build your immigration profile, compare visa pathways, and get AI-powered strategy recommendations in minutes.",
  alternates: {
    canonical: "https://immigrant.guru/sign-up"
  },
  openGraph: {
    title: "Create Your Free Immigrant Guru Account",
    description:
      "Start building your immigration profile, evaluate pathways, and get personalized Plan A/B/C strategies.",
    url: "https://immigrant.guru/sign-up"
  },
  robots: {
    index: true,
    follow: true
  }
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
