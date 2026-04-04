"use client";

import Link from "next/link";

import { useAuthSession } from "@/hooks/use-auth-session";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function getUserLabel(email: string): string {
  return email.split("@")[0] || "Account";
}

export function HeaderAuthActions() {
  const { clearSession, retrySession, status, user } = useAuthSession();

  if (status === "loading") {
    return <div className="h-9 w-32 animate-pulse rounded-full bg-ink/5" />;
  }

  if (status === "authenticated" && user) {
    return (
      <div className="flex items-center gap-3">
        <Link
          className="hidden text-sm font-medium text-muted transition-colors hover:text-ink md:inline-flex"
          href="/dashboard"
        >
          {getUserLabel(user.email)}
        </Link>
        <button
          className={cn(buttonVariants({ size: "md", variant: "secondary" }))}
          onClick={clearSession}
          type="button"
        >
          Log out
        </button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-3">
        <button
          className={cn(buttonVariants({ size: "md", variant: "secondary" }))}
          onClick={() => {
            void retrySession();
          }}
          type="button"
        >
          Retry session
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

  return (
    <div className="flex items-center gap-3">
      <Link
        className="hidden text-sm font-medium text-muted transition-colors hover:text-ink md:inline-flex"
        href="/sign-in"
      >
        Sign in
      </Link>
      <Link
        className={cn(buttonVariants({ size: "md", variant: "primary" }))}
        href="/sign-up"
      >
        Get started
      </Link>
    </div>
  );
}
