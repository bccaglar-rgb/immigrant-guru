"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/hooks/use-auth-session";

type PaywallGuardProps = Readonly<{
  children: React.ReactNode;
}>;

/**
 * Redirects unauthenticated users to sign-in and free-plan users to pricing.
 * Wrap any layout that requires an active paid subscription.
 */
export function PaywallGuard({ children }: PaywallGuardProps) {
  const { status, user } = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated" || status === "error") {
      router.replace("/sign-in?next=/dashboard");
      return;
    }

    if (status === "authenticated" && user?.plan === "free") {
      router.replace("/pricing?next=/dashboard");
    }
  }, [status, user, router]);

  // Show nothing while loading or redirecting
  if (status === "loading") return null;
  if (status === "unauthenticated" || status === "error") return null;
  if (status === "authenticated" && user?.plan === "free") return null;

  return <>{children}</>;
}
