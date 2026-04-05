"use client";

import Link from "next/link";

import { useAuthSession } from "@/hooks/use-auth-session";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeaderAuthActions() {
  const { clearSession, retrySession, status, user } = useAuthSession();

  if (status === "loading") {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-ink/5" />;
  }

  // Logged in
  if (status === "authenticated" && user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          className={cn(buttonVariants({ size: "md", variant: "primary" }))}
          href="/analysis"
        >
          My plan
        </Link>
        <Link
          className="hidden text-sm font-medium text-muted transition-colors hover:text-ink md:inline-flex"
          href="/dashboard"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  // Error
  if (status === "error") {
    return (
      <div className="flex items-center gap-3">
        <button
          className={cn(buttonVariants({ size: "md", variant: "secondary" }))}
          onClick={() => void retrySession()}
          type="button"
        >
          Retry
        </button>
        <button
          className="text-sm font-medium text-muted transition-colors hover:text-ink"
          onClick={clearSession}
          type="button"
        >
          Sign out
        </button>
      </div>
    );
  }

  // Not logged in
  return (
    <div className="flex items-center gap-3">
      <Link
        className="hidden text-sm font-medium text-muted transition-colors hover:text-ink md:inline-flex"
        href="/sign-in"
      >
        Log in
      </Link>
      <Link
        className={cn(buttonVariants({ size: "md", variant: "primary" }))}
        href="/sign-up"
      >
        Start your plan
      </Link>
    </div>
  );
}
